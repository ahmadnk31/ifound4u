import { verifyToken } from "@/lib/utils";
import { createClient } from "@/lib/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { token, email } = await request.json();

    // Input validation
    if (!token || !email) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify the token
    const decodedToken = verifyToken(token);

    if (!decodedToken) {
      return NextResponse.json(
        { error: "Invalid or expired verification token" },
        { status: 400 }
      );
    }

    // Check if the provided email matches the email in the token
    if (decodedToken.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json(
        { error: "Email address doesn't match the verification token" },
        { status: 400 }
      );
    }

    // Token verified and email matches, now check if the chat room exists
    const supabase = await createClient();
    const { data: claim, error: claimError } = await supabase
      .from("item_claims")
      .select("*")
      .eq("chat_room_id", decodedToken.chatRoomId)
      .single();

    if (claimError || !claim) {
      return NextResponse.json(
        { error: "Chat room not found" },
        { status: 404 }
      );
    }

    // If everything is valid, return success with the chat room ID
    return NextResponse.json({
      success: true,
      message: "Email verified successfully",
      chatRoomId: decodedToken.chatRoomId,
    });
  } catch (error: any) {
    console.error("Error verifying claim token:", error);
    return NextResponse.json(
      { error: "Failed to verify email" },
      { status: 500 }
    );
  }
}
