import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a secure verification token for email verification
 * @param email The email address to verify
 * @param chatRoomId The chat room ID to access after verification
 * @returns An encrypted token containing the verification data
 */
export function generateVerificationToken(
  email: string,
  chatRoomId: string
): string {
  // Create a payload with user email, chat room ID, and expiration time (24 hours)
  const payload = {
    email,
    chatRoomId,
    expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
  };

  // Convert to base64
  const token = Buffer.from(JSON.stringify(payload)).toString("base64");
  return token;
}

/**
 * Verify a token and extract its data
 * @param token The verification token
 * @returns The decoded payload if valid, null if expired or invalid
 */
export function verifyToken(
  token: string
): { email: string; chatRoomId: string } | null {
  try {
    // Decode the token
    const payload = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));

    // Check if token is expired
    if (payload.expires < Date.now()) {
      return null;
    }

    return {
      email: payload.email,
      chatRoomId: payload.chatRoomId,
    };
  } catch (error) {
    return null;
  }
}
