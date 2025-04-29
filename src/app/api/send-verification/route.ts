import { NextRequest, NextResponse } from "next/server";
import { sendVerificationEmail } from "@/lib/ses-client";
import { createClient } from "@/lib/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, itemId } = body;

    if (!email || !itemId) {
      return NextResponse.json(
        { success: false, message: "Email and itemId are required" },
        { status: 400 }
      );
    }

    // Send verification email
    const result = await sendVerificationEmail(email, itemId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: "Verification email sent successfully" 
    });
  } catch (error) {
    console.error("Error sending verification email:", error);
    return NextResponse.json(
      { success: false, message: "Failed to send verification email" },
      { status: 500 }
    );
  }
}