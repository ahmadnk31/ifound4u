import { createClient } from "@/lib/server";
import { stripe } from "@/lib/stripe";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("force") === "true";

    // Get current user from session
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's Stripe Connect account ID
    const { data: accountData } = await supabase
      .from("user_payment_accounts")
      .select("stripe_account_id, account_enabled, is_onboarded")
      .eq("user_id", user.id)
      .single();

    if (!accountData?.stripe_account_id) {
      return NextResponse.json({
        hasAccount: false,
        accountEnabled: false,
        message: "No Stripe account found",
      });
    }

    try {
      // Fetch latest account status from Stripe
      const stripeAccount = await stripe.accounts.retrieve(
        accountData.stripe_account_id
      );

      // Check if the account is fully onboarded
      const isFullyOnboarded =
        stripeAccount.charges_enabled &&
        stripeAccount.details_submitted &&
        stripeAccount.payouts_enabled;

      console.log(`Account ${accountData.stripe_account_id} status check:`, {
        charges_enabled: stripeAccount.charges_enabled,
        details_submitted: stripeAccount.details_submitted,
        payouts_enabled: stripeAccount.payouts_enabled,
        requirements: stripeAccount.requirements,
      });

      // Update account status in our database if needed
      if (
        (isFullyOnboarded &&
          (!accountData.account_enabled || !accountData.is_onboarded)) ||
        (forceRefresh && isFullyOnboarded)
      ) {
        await supabase
          .from("user_payment_accounts")
          .update({
            account_enabled: true,
            is_onboarded: true,
            onboarding_complete_date: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_account_id", accountData.stripe_account_id);

        console.log(
          `Updated account status for ${accountData.stripe_account_id} to fully onboarded`
        );

        // If account was just enabled, return updated status
        return NextResponse.json({
          hasAccount: true,
          accountEnabled: true,
          message: "Account is now active",
          updated: true,
        });
      }

      return NextResponse.json({
        hasAccount: true,
        accountEnabled: isFullyOnboarded || accountData.account_enabled,
        message: isFullyOnboarded
          ? "Account is active"
          : "Account setup is incomplete",
        requirements: stripeAccount.requirements?.currently_due || [],
      });
    } catch (error) {
      console.error("Error retrieving Stripe account:", error);

      // Fall back to database status if Stripe API fails
      return NextResponse.json({
        hasAccount: true,
        accountEnabled: accountData.account_enabled,
        message: "Using cached account status (Stripe API error)",
        error: "Failed to retrieve latest account status from Stripe",
      });
    }
  } catch (error: any) {
    console.error("Error checking Stripe account status:", error);
    return NextResponse.json(
      { error: "Failed to check account status", message: error.message },
      { status: 500 }
    );
  }
}
