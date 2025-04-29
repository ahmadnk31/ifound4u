import { createClient } from "@/lib/server";
import { calculatePlatformFee, stripe } from "@/lib/stripe";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { claimId, shippingFee, tipAmount = 0, shippingAddress } = body;

    if (!claimId || !shippingFee || !shippingAddress) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get current user (payer) from session
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the claim information to determine recipient
    const { data: claim } = await supabase
      .from("item_claims")
      .select(
        `
        id,
        item_id,
        claimer_name,
        claimer_email,
        status,
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

    // Check if the current user is authorized to make this payment
    // (the claimer should be the one paying)
    const isUserClaimer =
      user.email.toLowerCase() === claim.claimer_email.toLowerCase();
    if (!isUserClaimer) {
      return NextResponse.json(
        { error: "Only the claimer can pay for shipping" },
        { status: 403 }
      );
    }

    // Check if the claim is accepted (only accepted claims can be paid for)
    if (claim.status !== "accepted") {
      return NextResponse.json(
        { error: "Payment can only be made for accepted claims" },
        { status: 400 }
      );
    }

    // Get the item owner information (recipient)
    const itemOwnerId = claim.items.user_id;
    const { data: itemOwner } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", itemOwnerId)
      .single();

    // Get recipient's Stripe Connect account
    const { data: recipientAccount } = await supabase
      .from("user_payment_accounts")
      .select("stripe_account_id, account_enabled")
      .eq("user_id", itemOwnerId)
      .single();

    if (
      !recipientAccount?.stripe_account_id ||
      !recipientAccount.account_enabled
    ) {
      return NextResponse.json(
        {
          error:
            "The item owner doesn't have a properly set up payment account",
        },
        { status: 400 }
      );
    }

    // Calculate the amounts
    const totalAmount = shippingFee + tipAmount;
    const platformFee = calculatePlatformFee(totalAmount);
    const applicationFee = platformFee; // Platform takes 10% as application fee
    const transferAmount = totalAmount - applicationFee;

    // Create a payment intent
    // This uses Stripe Connect's direct charges with destination charges
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: "usd",
      // Using automatic payment methods instead of specific payment_method_types
      description: `Payment for claim: ${claim.items.title}`,
      metadata: {
        claimId: claim.id,
        itemId: claim.item_id,
        shippingFee: shippingFee.toString(),
        tipAmount: tipAmount.toString(),
        platformFee: platformFee.toString(),
      },
      application_fee_amount: applicationFee, // Platform fee
      transfer_data: {
        destination: recipientAccount.stripe_account_id,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Store the payment details in the database
    const { data: paymentRecord, error: paymentError } = await supabase
      .from("payments")
      .insert({
        claim_id: claim.id,
        payer_id: user.id,
        recipient_id: itemOwnerId,
        amount: totalAmount,
        shipping_fee: shippingFee,
        tip_amount: tipAmount,
        platform_fee: platformFee,
        status: "pending",
        stripe_payment_intent_id: paymentIntent.id,
        shipping_address: shippingAddress,
      })
      .select()
      .single();

    if (paymentError) {
      console.error("Error creating payment record:", paymentError);
      // Try to cancel the payment intent if database insertion failed
      await stripe.paymentIntents.cancel(paymentIntent.id);
      return NextResponse.json(
        { error: "Failed to create payment record" },
        { status: 500 }
      );
    }

    // Also create shipping details record
    const { error: shippingError } = await supabase
      .from("shipping_details")
      .insert({
        payment_id: paymentRecord.id,
        address_line1: shippingAddress.line1,
        address_line2: shippingAddress.line2 || "",
        city: shippingAddress.city,
        state: shippingAddress.state,
        postal_code: shippingAddress.postalCode,
        country: shippingAddress.country || "US",
        status: "pending",
      });

    if (shippingError) {
      console.error("Error creating shipping record:", shippingError);
    }

    // Return the client secret to complete payment on the frontend
    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      paymentId: paymentRecord.id,
    });
  } catch (error: any) {
    console.error("Error creating payment:", error);
    return NextResponse.json(
      { error: "Failed to create payment", message: error.message },
      { status: 500 }
    );
  }
}
