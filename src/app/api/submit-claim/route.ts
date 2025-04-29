import { createClient } from "@/lib/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      item_id,
      claimer_name,
      claimer_email,
      claimer_phone,
      claim_description,
      user_id,
      chat_room_id,
    } = body;

    // Input validation
    if (
      !item_id ||
      !claimer_name ||
      !claimer_email ||
      !chat_room_id ||
      !claim_description
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create server-side Supabase client with admin privileges
    const supabase = await createClient();

    // Insert claim record with admin privileges (bypasses RLS)
    const { data: claimData, error: claimError } = await supabase
      .from("item_claims")
      .insert({
        item_id,
        claimer_name,
        claimer_email,
        claimer_phone: claimer_phone || null,
        claim_description,
        user_id: user_id || null,
        chat_room_id,
        status: "pending",
      })
      .select();

    if (claimError) {
      console.error("Error creating claim:", claimError);
      return NextResponse.json(
        { error: "Failed to create claim", message: claimError.message },
        { status: 500 }
      );
    }

    // Return success response with created claim
    return NextResponse.json({
      success: true,
      claim: claimData[0],
    });
  } catch (error: any) {
    console.error("Error submitting claim:", error);
    return NextResponse.json(
      { error: "Failed to submit claim", message: error.message },
      { status: 500 }
    );
  }
}
