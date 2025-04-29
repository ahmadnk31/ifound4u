import { createClient } from "@/lib/server";
import { stripe } from "@/lib/stripe";
import { NextRequest, NextResponse } from "next/server";

// POST: Create a new Stripe Connect account for a user
export async function POST(request: NextRequest) {
  try {
    // Get current user from session
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if user already has a Connect account
    const { data: existingAccount } = await supabase
      .from('user_payment_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (existingAccount?.stripe_account_id && existingAccount?.is_onboarded) {
      return NextResponse.json(
        { message: "Connect account already exists", accountId: existingAccount.stripe_account_id },
        { status: 200 }
      );
    }

    // Get user details for the Connect account
    const { data: userData } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single();

    const userEmail = userData?.email || user.email;
    const userName = userData?.full_name || user.user_metadata?.full_name || 'User';

    // Create a new Express account
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US', // Default to US
      email: userEmail,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'individual',
      business_profile: {
        product_description: 'Lost and found item returns',
      },
    });

    // Store the account ID in our database
    const { error: dbError } = await supabase
      .from('user_payment_accounts')
      .upsert({
        user_id: user.id,
        stripe_account_id: account.id,
        is_onboarded: false,
        account_enabled: false,
      });

    if (dbError) {
      console.error("Error saving account to database:", dbError);
      return NextResponse.json(
        { error: "Failed to save account information" },
        { status: 500 }
      );
    }

    // Return the account ID
    return NextResponse.json({
      success: true,
      accountId: account.id,
    });
  } catch (error: any) {
    console.error("Error creating Connect account:", error);
    return NextResponse.json(
      { error: "Failed to create Connect account", message: error.message },
      { status: 500 }
    );
  }
}

// GET: Get the user's Connect account status
export async function GET(request: NextRequest) {
  try {
    // Get current user from session
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get the user's Connect account information
    const { data: accountData } = await supabase
      .from('user_payment_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!accountData) {
      return NextResponse.json({
        hasAccount: false,
      });
    }

    if (!accountData.stripe_account_id) {
      return NextResponse.json({
        hasAccount: false,
      });
    }

    // Get the account details from Stripe
    const account = await stripe.accounts.retrieve(accountData.stripe_account_id);
    
    // Update our database with the latest account status
    await supabase
      .from('user_payment_accounts')
      .update({
        is_onboarded: account.details_submitted,
        account_enabled: account.charges_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    return NextResponse.json({
      hasAccount: true,
      accountId: accountData.stripe_account_id,
      isOnboarded: account.details_submitted,
      accountEnabled: account.charges_enabled,
    });
  } catch (error: any) {
    console.error("Error fetching Connect account:", error);
    return NextResponse.json(
      { error: "Failed to retrieve Connect account", message: error.message },
      { status: 500 }
    );
  }
}