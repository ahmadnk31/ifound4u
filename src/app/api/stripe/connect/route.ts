import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/server";
import { createConnectAccount, generateAccountLink } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  try {
    // Initialize Supabase client
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    if (!userEmail) {
      return NextResponse.json(
        { error: "User email not found" },
        { status: 400 }
      );
    }

    // Check if user already has a Stripe account
    const { data: existingAccount } = await supabase
      .from("stripe_accounts")
      .select("account_id, onboarded")
      .eq("user_id", userId)
      .single();

    if (existingAccount) {
      // If account exists but not onboarded, generate a new onboarding link
      if (!existingAccount.onboarded) {
        const origin = request.headers.get("origin") || "http://localhost:3000";
        const accountLink = await generateAccountLink(
          existingAccount.account_id,
          `${origin}/settings/profile`, // Refresh URL
          `${origin}/settings/profile?setup=complete` // Return URL
        );

        return NextResponse.json({ accountLink: accountLink.url });
      }

      // If account exists and is onboarded, return success
      return NextResponse.json({
        success: true,
        message: "Stripe account already connected",
        accountId: existingAccount.account_id,
      });
    }

    // Create a new Stripe Connect account
    const account = await createConnectAccount(userId, userEmail);

    // Save the account ID to the database
    await supabase.from("stripe_accounts").insert({
      user_id: userId,
      account_id: account.id,
      onboarded: false,
      email: userEmail,
    });

    // Generate an account link for onboarding
    const origin = request.headers.get("origin") || "http://localhost:3000";
    const accountLink = await generateAccountLink(
      account.id,
      `${origin}/settings/profile`, // Refresh URL
      `${origin}/settings/profile?setup=complete` // Return URL
    );

    return NextResponse.json({ accountLink: accountLink.url });
  } catch (error) {
    console.error("Error creating Connect account:", error);
    return NextResponse.json(
      { error: "Failed to create Connect account" },
      { status: 500 }
    );
  }
}
