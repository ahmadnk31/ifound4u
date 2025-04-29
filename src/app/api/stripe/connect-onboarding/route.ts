import { createClient } from "@/lib/server";
import { stripe, createConnectAccount } from "@/lib/stripe";
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

    // Get the account ID from the request body
    const body = await request.json();
    const { accountId, returnUrl, createIfNotExists = true } = body;

    let stripeAccountId = accountId;

    if (!stripeAccountId) {
      // Try to get the account ID from the database if not provided
      const { data: accountData } = await supabase
        .from("user_payment_accounts")
        .select("stripe_account_id")
        .eq("user_id", user.id)
        .single();

      if (accountData?.stripe_account_id) {
        stripeAccountId = accountData.stripe_account_id;
      } else if (createIfNotExists) {
        // Create a new Stripe account if requested and none exists
        // Get user email for Stripe
        const { data: profile } = await supabase
          .auth.getUser()
          

        const email = profile?.user?.email || user.email || "";

        // Create a new Stripe Connect account
        try {
          const account = await createConnectAccount(user.id, email);
          stripeAccountId = account.id;

          // Save the new account ID in the database with correct column names
          await supabase.from("user_payment_accounts").insert({
            user_id: user.id,
            stripe_account_id: stripeAccountId,
            account_enabled: false,
            is_onboarded: false, // Using is_onboarded instead of onboarding_complete
          });

          console.log(
            `Created new Stripe account ${stripeAccountId} for user ${user.id}`
          );
        } catch (err) {
          console.error("Error creating Stripe account:", err);
          return NextResponse.json(
            { error: "Failed to create new Stripe account" },
            { status: 500 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "No Connect account found" },
          { status: 404 }
        );
      }
    }

    // Generate the return URL with proper base URL
    const baseUrl =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3000";
    const defaultReturnUrl = `${baseUrl}/settings/payments`;
    const finalReturnUrl = returnUrl || defaultReturnUrl;

    // Create an account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: finalReturnUrl,
      return_url: finalReturnUrl,
      type: "account_onboarding",
    });

    return NextResponse.json({
      success: true,
      url: accountLink.url,
    });
  } catch (error: any) {
    console.error("Error creating onboarding link:", error);
    return NextResponse.json(
      { error: "Failed to create onboarding link", message: error.message },
      { status: 500 }
    );
  }
}
