import Stripe from "stripe";
import { loadStripe } from "@stripe/stripe-js";

// Check if we're on the client or server side
const isClient = typeof window !== "undefined";
const isDevelopment = process.env.NODE_ENV === "development";

// Client-side Stripe instance for frontend use
let stripePromise: ReturnType<typeof loadStripe> | null = null;
export const getStripe = () => {
  if (!stripePromise) {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY;

    // Make sure we have a publishable key before initializing Stripe
    if (!publishableKey) {
      console.error(
        "Stripe publishable key is missing. Please check your environment variables."
      );
      return null;
    }

    // Create Stripe instance with development mode flag if in development
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
};

// Server-side Stripe instance with the secret key (only used in server code)
export const stripe =
  !isClient && process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2024-04-10", // Updated to a current API version
        typescript: true, // Enable TypeScript support
      })
    : ({} as Stripe); // Return an empty object when on client-side to prevent errors

/**
 * Format amount for display
 * @param amount - Amount in cents
 * @returns Formatted amount string
 */
export const formatAmountForDisplay = (
  amount: number,
  currency: string = "EUR"
): string => {
  const numberFormat = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
  });
  return numberFormat.format(amount / 100);
};

/**
 * Format amount for Stripe
 * @param amount - Amount in dollars
 * @returns Amount in cents
 */
export const formatAmountForStripe = (
  amount: number,
  currency: string = "USD"
): number => {
  const zerosToAdd = 2;
  return Math.round(amount * Math.pow(10, zerosToAdd));
};

/**
 * Calculate platform fee (10% of total amount)
 * @param amount - Total amount in cents
 * @returns Platform fee in cents
 */
export const calculatePlatformFee = (amount: number): number => {
  return Math.round(amount * 0.1); // 10% platform fee
};

/**
 * Create a Connect account for a user
 * @param userId - User ID
 * @param email - User email
 * @returns Stripe Connect account
 */
export const createConnectAccount = async (userId: string, email: string) => {
  return await stripe.accounts.create({
    type: "express",
    email,
    metadata: {
      userId,
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });
};

/**
 * Generate an account onboarding link for a connected account
 * @param accountId - Stripe account ID
 * @param refreshUrl - URL to redirect to if the onboarding is abandoned
 * @param returnUrl - URL to redirect to after the onboarding is complete
 * @returns Account link
 */
export const generateAccountLink = async (
  accountId: string,
  refreshUrl: string,
  returnUrl: string
) => {
  return await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
};

/**
 * Create a payment intent for a claim
 * @param amount - Amount in cents
 * @param claimId - Claim ID
 * @param connectedAccountId - Stripe connected account ID
 * @returns Payment intent
 */
export const createPaymentIntent = async (
  amount: number,
  claimId: string,
  connectedAccountId: string,
  metadata: Record<string, string> = {}
) => {
  // Calculate platform fee (10%)
  const fee = calculatePlatformFee(amount);

  // Create payment intent with application fee
  return await stripe.paymentIntents.create({
    amount,
    currency: "eur",
    application_fee_amount: fee,
    transfer_data: {
      destination: connectedAccountId,
    },
    metadata: {
      claimId,
      ...metadata,
    },
  });
};
