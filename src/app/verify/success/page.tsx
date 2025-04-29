"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function VerificationSuccessPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const email = searchParams.get("email");
  const itemId = searchParams.get("itemId");
  const [isSuccess, setIsSuccess] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (error) {
      setIsSuccess(false);

      // Format error message
      if (error === "missing_code") {
        setErrorMessage("Verification code is missing");
      } else if (error === "Invalid verification code") {
        setErrorMessage(
          "The verification code is invalid or has been used already"
        );
      } else if (error === "Verification code has expired") {
        setErrorMessage("The verification code has expired");
      } else {
        setErrorMessage(error);
      }
    } else {
      setIsSuccess(true);
    }
  }, [error]);

  return (
    <div className='container flex items-center justify-center min-h-[calc(100vh-200px)] py-10 px-4'>
      <Card className='w-full max-w-md'>
        <CardHeader className='pb-3'>
          <div className='flex justify-center mb-4'>
            {isSuccess ? (
              <CheckCircle className='h-16 w-16 text-green-500' />
            ) : (
              <AlertCircle className='h-16 w-16 text-red-500' />
            )}
          </div>
          <CardTitle className='text-2xl text-center'>
            {isSuccess ? "Email Verified!" : "Verification Failed"}
          </CardTitle>
          <CardDescription className='text-center'>
            {isSuccess
              ? `Thank you for verifying your email address (${
                  email || ""
                }). Your item report has been confirmed.`
              : "We encountered an issue while verifying your email address."}
          </CardDescription>
        </CardHeader>
        <CardContent className='text-center text-muted-foreground'>
          {isSuccess ? (
            <p>
              Your contact information has been verified, which will make it
              easier for people to connect with you about your lost or found
              item.
            </p>
          ) : (
            <p>
              Error: {errorMessage}
              <br />
              If you continue to have problems, please contact our support team.
            </p>
          )}
        </CardContent>
        <CardFooter className='flex justify-center space-x-4'>
          {isSuccess && (
            <Button asChild>
              <Link href='/'>View My Reports</Link>
            </Button>
          )}
          <Button variant={isSuccess ? "outline" : "default"} asChild>
            <Link href='/'>Back to Home</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
