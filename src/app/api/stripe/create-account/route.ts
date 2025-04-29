import { createClient } from "@/lib/server";
import { createConnectAccount, generateAccountLink } from "@/lib/stripe";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // Get current user from session
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if the user already has a Stripe account
    const { data: existingAccount } = await supabase
      .from("user_payment_accounts")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .single();

    let stripeAccountId: string;

    if (existingAccount?.stripe_account_id) {
      // User already has a Stripe account, use it
      stripeAccountId = existingAccount.stripe_account_id;
    } else {
      // Get user's email and display name for Stripe
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", user.id)
        .single();

      const email = profile?.email || user.email || "";

      // Create a new Stripe Connect account
      const account = await createConnectAccount(user.id, email);
      stripeAccountId = account.id;

      // Store the account ID in the database - using correct column names
      const { error: insertError } = await supabase
        .from("user_payment_accounts")
        .insert({
          user_id: user.id,
          stripe_account_id: stripeAccountId,
          account_enabled: false,
          is_onboarded: false, // Using is_onboarded instead of onboarding_complete
        });

      if (insertError) {
        console.error("Error storing Stripe account:", insertError);
        return NextResponse.json(
          { error: "Failed to store account information" },
          { status: 500 }
        );
      }
    }

    // Generate an account link for onboarding
    const origin = request.headers.get("origin") || "http://localhost:3000";
    const accountLink = await generateAccountLink(
      stripeAccountId,
      `${origin}/settings/payments?refresh=true`, // Refresh URL if user abandons onboarding
      `${origin}/settings/payments?success=true` // Return URL after completing onboarding
    );

    return NextResponse.json({
      accountId: stripeAccountId,
      accountLinkUrl: accountLink.url,
    });
  } catch (error: any) {
    console.error("Error creating Stripe account:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create Stripe account" },
      { status: 500 }
    );
  }
}
