import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/server";

export async function GET(request: NextRequest) {
  // Get the claim ID from the query parameters
  const claimId = request.nextUrl.searchParams.get("claimId");

  if (!claimId) {
    return NextResponse.json({ error: "Missing claim ID" }, { status: 400 });
  }

  try {
    const supabase = await createClient();

    // Get the current user session
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // First check the claim status (which is updated by webhooks)
    const { data: claim, error: claimError } = await supabase
      .from("item_claims")
      .select("status")
      .eq("id", claimId)
      .single();

    if (claimError) {
      console.error("Error fetching claim:", claimError);
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    // If claim is already marked as paid, return success
    if (claim.status === "paid") {
      return NextResponse.json({ status: "paid" });
    }

    // If claim is not paid, check the payment records
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("status, stripe_payment_intent_id")
      .eq("claim_id", claimId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (paymentError) {
      console.error("Error fetching payment:", paymentError);
      return NextResponse.json({ status: "pending" });
    }

    return NextResponse.json({
      status: payment.status,
      paymentId: payment.stripe_payment_intent_id,
    });
  } catch (error: any) {
    console.error("Error checking payment status:", error);
    return NextResponse.json(
      { error: "Failed to check payment status" },
      { status: 500 }
    );
  }
}
