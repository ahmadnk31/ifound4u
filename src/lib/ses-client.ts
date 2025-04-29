"use server";

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import crypto from "crypto";
import { createClient } from "./server";

// Create SES client with better error handling for missing credentials
const ses = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

// Validate SES configuration
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.warn(
    "AWS SES credentials not configured properly. Email sending may fail."
  );
}

const SENDER_EMAIL = process.env.SES_SENDER_EMAIL || "noreply@ifound4u.com";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

// Interface for verification data
interface VerificationData {
  email: string;
  itemId: string;
  code: string;
  expires: number;
}

/**
 * Instead of using an in-memory Map, we'll store verification codes in a separate
 * database table. This function will create the table if it doesn't exist.
 */
async function ensureVerificationTable() {
  const supabase = await createClient();

  // Check if the verification_codes table exists
  const { error } = await supabase
    .from("verification_codes")
    .select("*")
    .limit(1)
    .catch(() => ({ error: { message: "Table does not exist" } }));

  if (error) {
    try {
      // Create the verification_codes table
      const { error } = await supabase.rpc("create_verification_table", {});

      if (error) {
        console.error("Could not create verification table:", error);
      }
    } catch (err) {
      console.error("Error creating verification table:", err);
    }
  }
}

export async function sendVerificationEmail(email: string, itemId: string) {
  try {
    const supabase = await createClient();

    // Generate a unique verification code
    const verificationCode = crypto.randomBytes(32).toString("hex");

    // Check if the item exists and belongs to the email
    const { data: contactInfo, error: contactError } = await supabase
      .from("contact_info")
      .select("*")
      .eq("item_id", itemId)
      .eq("email", email)
      .single();

    if (contactError || !contactInfo) {
      console.error("Contact info not found:", contactError);
      return {
        success: false,
        message: "Item not found or doesn't match email",
      };
    }

    // Store the code in the database with 24-hour expiration
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const { data, error } = await supabase
      .from("verification_codes")
      .insert([
        {
          code: verificationCode,
          email: email,
          item_id: itemId,
          expires_at: expiresAt.toISOString(),
        },
      ])
      .select()
      .catch((err) => {
        // If the table doesn't exist yet
        if (err.message && err.message.includes("does not exist")) {
          return { data: null, error: { message: "Table does not exist" } };
        }
        return { data: null, error: err };
      });

    // If the table doesn't exist, fall back to creating it
    if (error && error.message.includes("does not exist")) {
      await ensureVerificationTable();

      // Try inserting again after creating the table
      const { error: insertError } = await supabase
        .from("verification_codes")
        .insert([
          {
            code: verificationCode,
            email: email,
            item_id: itemId,
            expires_at: expiresAt.toISOString(),
          },
        ]);

      if (insertError) {
        console.error("Error storing verification code:", insertError);
        return { success: false, message: "Failed to store verification code" };
      }
    } else if (error) {
      console.error("Error storing verification code:", error);
      return { success: false, message: "Failed to store verification code" };
    }

    const verificationLink = `${BASE_URL}/verify?code=${verificationCode}`;

    // Test that email format is valid
    if (!email.includes("@") || !email.includes(".")) {
      return { success: false, message: "Invalid email format" };
    }

    const params = {
      Source: SENDER_EMAIL,
      Destination: {
        ToAddresses: [email],
      },
      Message: {
        Subject: {
          Data: "Verify Your Email for iFound4U",
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: `
              <h1>Email Verification</h1>
              <p>Thank you for submitting a lost or found item report with iFound4U.</p>
              <p>Please click the link below to verify your email address:</p>
              <p><a href="${verificationLink}">Verify Email Address</a></p>
              <p>This link will expire in 24 hours.</p>
              <p>If you did not make this request, please ignore this email.</p>
            `,
            Charset: "UTF-8",
          },
          Text: {
            Data: `
              Email Verification
              
              Thank you for submitting a lost or found item report with iFound4U.
              
              Please visit the following link to verify your email address:
              ${verificationLink}
              
              This link will expire in 24 hours.
              
              If you did not make this request, please ignore this email.
            `,
            Charset: "UTF-8",
          },
        },
      },
    };

    try {
      const command = new SendEmailCommand(params);
      await ses.send(command);
    } catch (sesError) {
      console.error("SES error sending email:", sesError);

      // Check for common SES errors
      if ((sesError as Error).message?.includes("not authorized")) {
        return {
          success: false,
          message: "AWS SES authorization error. Check SES configuration.",
        };
      }

      // Default error
      return { success: false, message: "Failed to send verification email" };
    }

    return { success: true, message: "Verification email sent" };
  } catch (error) {
    console.error("Error sending verification email:", error);
    return { success: false, message: "Failed to send verification email" };
  }
}

export async function verifyEmailCode(code: string) {
  try {
    const supabase = await createClient();

    // Get the verification code from the database
    const { data: verification, error: fetchError } = await supabase
      .from("verification_codes")
      .select("*")
      .eq("code", code)
      .single()
      .catch(() => ({
        data: null,
        error: { message: "Verification code not found" },
      }));

    if (fetchError || !verification) {
      return { success: false, message: "Invalid verification code" };
    }

    // Check if the code has expired
    const expiresAt = new Date(verification.expires_at);
    if (expiresAt < new Date()) {
      // Delete the expired code
      await supabase.from("verification_codes").delete().eq("code", code);

      return { success: false, message: "Verification code has expired" };
    }

    // Code is valid, update contact info email_verified status
    const { error: updateError } = await supabase
      .from("contact_info")
      .update({ email_verified: true })
      .eq("item_id", verification.item_id)
      .eq("email", verification.email);

    if (updateError) {
      console.error("Error updating email_verified status:", updateError);
      return { success: false, message: "Failed to verify email" };
    }

    // Delete the used verification code
    await supabase.from("verification_codes").delete().eq("code", code);

    return {
      success: true,
      message: "Email verified successfully",
      email: verification.email,
      itemId: verification.item_id,
    };
  } catch (error) {
    console.error("Error verifying email:", error);
    return { success: false, message: "Failed to verify email" };
  }
}
