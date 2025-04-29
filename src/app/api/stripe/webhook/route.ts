import { createClient } from "@/lib/server";
import { stripe } from "@/lib/stripe";
import { NextRequest, NextResponse } from "next/server";
import { Stripe } from "stripe";

// This is your Stripe webhook secret for testing your endpoint locally.
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const sig = request.headers.get("stripe-signature") as string;
  let event: Stripe.Event;

  try {
    if (!endpointSecret) {
      throw new Error("Stripe webhook secret is not set");
    }

    // Verify webhook signature
    event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    console.log(`Processing webhook event: ${event.type}`);
    
    // Handle specific webhook events
    switch (event.type) {
      // Handle account updates
      case "account.updated": {
        const account = event.data.object as Stripe.Account;

        // Check if the account is fully onboarded
        if (
          account.charges_enabled &&
          account.details_submitted &&
          account.payouts_enabled
        ) {
          // Update user's payment account status using correct column names
          const { error } = await supabase
            .from("user_payment_accounts")
            .update({
              account_enabled: true,
              is_onboarded: true,
              onboarding_complete_date: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_account_id", account.id);

          if (error) {
            console.error(`Error updating account status: ${error.message}`);
          } else {
            console.log(`Account ${account.id} is fully onboarded.`);
          }
        }
        break;
      }

      // Handle payment intent succeeded
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        
        console.log(`Payment succeeded with metadata:`, paymentIntent.metadata);
        
        // Check for claimId in metadata (case insensitive check)
        const claimId = paymentIntent.metadata.claimId || 
                        paymentIntent.metadata.claimid || 
                        paymentIntent.metadata.CLAIMID;
                        
        // Update payment status in our database
        if (claimId) {
          const { error: paymentError } = await supabase
            .from("payments")
            .update({
              status: "succeeded",
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_payment_intent_id", paymentIntent.id);

          if (paymentError) {
            console.error(`Error updating payment status: ${paymentError.message}`);
          }

          // Update claim status to "paid"
          const { error: claimError } = await supabase
            .from("item_claims")
            .update({
              status: "paid",
              updated_at: new Date().toISOString(),
            })
            .eq("id", claimId);

          if (claimError) {
            console.error(`Error updating claim status: ${claimError.message}`);
          } else {
            console.log(`Payment for claim ${claimId} succeeded.`);
          }
        } else {
          console.error("Payment succeeded but no claimId found in metadata:", paymentIntent.metadata);
        }
        break;
      }

      // Handle payment intent failed
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        
        // Check for claimId in metadata (case insensitive check)
        const claimId = paymentIntent.metadata.claimId || 
                        paymentIntent.metadata.claimid || 
                        paymentIntent.metadata.CLAIMID;

        // Update payment status in our database
        if (claimId) {
          const { error } = await supabase
            .from("payments")
            .update({
              status: "failed",
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_payment_intent_id", paymentIntent.id);

          if (error) {
            console.error(`Error updating failed payment status: ${error.message}`);
          } else {
            console.log(`Payment for claim ${claimId} failed.`);
          }
        } else {
          console.error("Payment failed but no claimId found in metadata:", paymentIntent.metadata);
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { error: "Failed to process webhook", details: error.message },
      { status: 500 }
    );
  }
}
