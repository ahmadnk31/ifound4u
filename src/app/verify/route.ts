"use server";

import { NextRequest, NextResponse } from "next/server";
import { verifyEmailCode } from "@/lib/ses-client";
import { createClient } from "@/lib/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      new URL(
        "/error?message=Invalid or missing verification code",
        request.url
      )
    );
  }

  try {
    const result = await verifyEmailCode(code);

    if (!result.success) {
      return NextResponse.redirect(
        new URL(
          `/error?message=${encodeURIComponent(result.message)}`,
          request.url
        )
      );
    }

    // The verifyEmailCode function now handles updating the contact_info table
    // so we don't need to manually update it here anymore

    // Redirect to success page with a message
    return NextResponse.redirect(new URL("/verify/success", request.url));
  } catch (error) {
    console.error("Error during email verification:", error);
    return NextResponse.redirect(
      new URL(
        "/error?message=Verification failed. Please try again.",
        request.url
      )
    );
  }
}
