import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/server";
import { createPaymentIntent, formatAmountForStripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    const { claimId, amount, tipAmount = 0, description } = body;

    if (!claimId || !amount) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Initialize Supabase client
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the claim details
    const { data: claim } = await supabase
      .from("item_claims")
      .select(
        `
        id, 
        user_id, 
        items:items (
          id,
          title,
          user_id
        )
      `
      )
      .eq("id", claimId)
      .single();

    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    // Verify that the user is the claimer
    if (claim.user_id !== session.user.id) {
      return NextResponse.json(
        { error: "You can only pay for your own claims" },
        { status: 403 }
      );
    }

    // Get the Stripe account of the item owner
    const { data: stripeAccount } = await supabase
      .from("stripe_accounts")
      .select("account_id, onboarded")
      .eq("user_id", claim.items.user_id)
      .single();

    if (!stripeAccount || !stripeAccount.onboarded) {
      return NextResponse.json(
        { error: "Item owner has not set up their payment account yet" },
        { status: 400 }
      );
    }

    // Convert amount from dollars to cents for Stripe
    const totalAmount = formatAmountForStripe(amount + tipAmount);

    // Create metadata for the payment
    const metadata = {
      itemId: claim.items.id,
      itemTitle: claim.items.title,
      claimerUserId: session.user.id,
      itemOwnerUserId: claim.items.user_id,
      tipAmount: tipAmount.toString(),
      description: description || "Shipping payment",
    };

    // Create a payment intent
    const paymentIntent = await createPaymentIntent(
      totalAmount,
      claimId,
      stripeAccount.account_id,
      metadata
    );

    // Store the payment intent in the database
    await supabase.from("payments").insert({
      claim_id: claimId,
      item_id: claim.items.id,
      payment_intent_id: paymentIntent.id,
      amount: totalAmount,
      tip_amount: formatAmountForStripe(tipAmount),
      status: paymentIntent.status,
      description: description || "Shipping payment",
      payer_user_id: session.user.id,
      recipient_user_id: claim.items.user_id,
      recipient_stripe_account_id: stripeAccount.account_id,
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    return NextResponse.json(
      { error: "Failed to create payment intent" },
      { status: 500 }
    );
  }
}
