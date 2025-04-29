import { createClient } from "@/lib/server";
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

    // Get the finder ID from the request body
    const body = await request.json();
    const { finderId } = body;

    if (!finderId) {
      return NextResponse.json(
        { error: "Finder ID is required" },
        { status: 400 }
      );
    }

    console.log("Checking finder status for finderId:", finderId);
    console.log("Current user:", user.id, user.email);

    // First try looking up claims through item lookup
    const { data: relatedItems } = await supabase
      .from("items")
      .select("id")
      .eq("user_id", finderId);

    if (!relatedItems || relatedItems.length === 0) {
      return NextResponse.json(
        { error: "No items found for this finder" },
        { status: 404 }
      );
    }

    const itemIds = relatedItems.map((item) => item.id);
    console.log("Found items:", itemIds);

    // Check if user is a claimer for any of these items (either by user ID or email)
    const { data: claims } = await supabase
      .from("item_claims")
      .select("id, item_id, chat_room_id, claimer_email")
      .in("item_id", itemIds)
      .or(`user_id.eq.${user.id},claimer_email.eq.${user.email}`);

    console.log("Claims data:", claims);

    if (!claims || claims.length === 0) {
      return NextResponse.json(
        { error: "Not authorized to check this finder's status" },
        { status: 403 }
      );
    }
    console.log("FinderId", finderId, "is a claimer for these items:", claims);
    // Get user's Stripe Connect account status
    const { data: accountData } = await supabase
      .from("user_payment_accounts")
     .select("stripe_account_id, account_enabled, is_onboarded")
      .eq("user_id", finderId)
      .maybeSingle();

    console.log("Account data:", accountData);

    return NextResponse.json({
      hasAccount: !!accountData?.stripe_account_id,
      accountEnabled: !!accountData?.account_enabled,
      isOnboarded: !!accountData?.is_onboarded,
      message: accountData?.account_enabled
        ? "Finder has a fully set up Stripe account"
        : "Finder needs to complete their Stripe account setup",
    });
  } catch (error: any) {
    console.error("Error checking finder account status:", error);
    return NextResponse.json(
      { error: "Failed to check finder status", message: error.message },
      { status: 500 }
    );
  }
}
