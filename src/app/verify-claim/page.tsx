"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function VerifyClaimPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [verificationState, setVerificationState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const supabase = createClient();

  useEffect(() => {
    // If no token provided, show error
    if (!token) {
      setVerificationState("error");
      setErrorMessage(
        "Invalid verification link. Please check your email for the correct link."
      );
      return;
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !token) {
      toast.error("Please enter your email address");
      return;
    }

    setIsLoading(true);
    setVerificationState("loading");

    try {
      // Call the verification API endpoint
      const response = await fetch("/api/verify-claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          email,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to verify email");
      }

      // Verification successful
      setVerificationState("success");

      // Redirect to the chat room after a short delay
      setTimeout(() => {
        router.push(`/messages?room=${data.chatRoomId}`);
      }, 2000);
    } catch (error: any) {
      console.error("Verification failed:", error);
      setVerificationState("error");
      setErrorMessage(
        error.message || "Failed to verify your email. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='container max-w-md py-12'>
      <Card>
        <CardHeader>
          <CardTitle>Verify Your Email</CardTitle>
          <CardDescription>
            To access the claim response chat, please verify your email address.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {verificationState === "error" ? (
            <Alert variant='destructive' className='mb-4'>
              <XCircle className='h-4 w-4' />
              <AlertTitle>Verification Failed</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : verificationState === "success" ? (
            <Alert className='mb-4 bg-green-50 text-green-800 border-green-200'>
              <CheckCircle2 className='h-4 w-4 text-green-600' />
              <AlertTitle>Email Verified</AlertTitle>
              <AlertDescription>
                Your email has been verified successfully. Redirecting you to
                the chat...
              </AlertDescription>
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit} className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='email'>Your Email Address</Label>
              <Input
                id='email'
                type='email'
                placeholder='Enter your email address'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading || verificationState === "success"}
              />
            </div>
          </form>
        </CardContent>

        <CardFooter>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !email || verificationState === "success"}
            className='w-full'
          >
            {isLoading ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                Verifying...
              </>
            ) : (
              "Verify & Continue"
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
