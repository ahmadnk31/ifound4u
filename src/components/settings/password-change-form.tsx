"use client";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// Common weak passwords list (simplified - in production you'd use a more comprehensive list)
const COMMON_PASSWORDS = [
  "password",
  "123456",
  "qwerty",
  "admin",
  "welcome",
  "abc123",
  "letmein",
  "monkey",
  "1234567",
  "12345678",
];

// Password validation schema with enhanced security
const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(6, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(100, "Password must be less than 100 characters")
      .refine(
        (password) => /[A-Z]/.test(password),
        "Password must contain at least one uppercase letter"
      )
      .refine(
        (password) => /[a-z]/.test(password),
        "Password must contain at least one lowercase letter"
      )
      .refine(
        (password) => /[0-9]/.test(password),
        "Password must contain at least one number"
      )
      .refine(
        (password) => /[^A-Za-z0-9]/.test(password),
        "Password must contain at least one special character"
      )
      .refine(
        (password) => !COMMON_PASSWORDS.includes(password.toLowerCase()),
        "This password is too common and easily guessed"
      ),
    confirmPassword: z.string().min(8, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

type PasswordChangeFormValues = z.infer<typeof passwordChangeSchema>;

export function PasswordChangeForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lastAttemptTime, setLastAttemptTime] = useState(0);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockTimeRemaining, setBlockTimeRemaining] = useState(0);
  const supabase = createClient();
  const router = useRouter();

  // Function to calculate password strength
  const calculatePasswordStrength = (password: string): number => {
    if (!password) return 0;

    let score = 0;

    // Length check
    if (password.length >= 8) score += 20;
    if (password.length >= 10) score += 10;

    // Complexity checks
    if (/[A-Z]/.test(password)) score += 20; // Uppercase
    if (/[a-z]/.test(password)) score += 15; // Lowercase
    if (/[0-9]/.test(password)) score += 15; // Numbers
    if (/[^A-Za-z0-9]/.test(password)) score += 20; // Special chars

    // Variety checks
    const hasLetterNumberSpecial =
      /[A-Za-z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[^A-Za-z0-9]/.test(password);

    if (hasLetterNumberSpecial) score += 10;

    // Common password check
    if (COMMON_PASSWORDS.includes(password.toLowerCase())) score = 10;

    // Ensure score doesn't exceed 100
    return Math.min(score, 100);
  };

  const form = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Watch the password field to calculate strength in real-time
  const watchedPassword = form.watch("newPassword");

  useEffect(() => {
    setPasswordStrength(calculatePasswordStrength(watchedPassword));
  }, [watchedPassword]);

  // Timer for the block period
  useEffect(() => {
    const interval = setInterval(() => {
      if (isBlocked) {
        const timeLeft =
          120 - Math.floor((Date.now() - lastAttemptTime) / 1000);

        if (timeLeft <= 0) {
          setIsBlocked(false);
          setBlockTimeRemaining(0);
          clearInterval(interval);
        } else {
          setBlockTimeRemaining(timeLeft);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isBlocked, lastAttemptTime]);

  const handleRateLimiting = () => {
    // Track attempt
    const now = Date.now();
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    setLastAttemptTime(now);

    // Block if too many attempts
    if (newAttempts >= 5) {
      // 5 attempts maximum
      setIsBlocked(true);
      setBlockTimeRemaining(120); // 2 minutes block

      // Reset attempts after block period
      setTimeout(() => {
        setAttempts(0);
      }, 120000);

      return true; // blocked
    }

    return false; // not blocked
  };

  const onSubmit = async (values: PasswordChangeFormValues) => {
    // Check rate limiting first
    if (isBlocked) {
      toast.error(
        `Too many attempts. Please try again in ${blockTimeRemaining} seconds.`
      );
      return;
    }

    // Implement rate limiting
    if (handleRateLimiting()) {
      toast.error(
        `Too many password change attempts. Please try again in 2 minutes.`
      );
      return;
    }

    // Password strength check
    if (passwordStrength < 60) {
      toast.error("Please choose a stronger password for better security.");
      return;
    }

    setIsLoading(true);

    try {
      // First verify the current password
      const {
        data: { user },
        error: signInError,
      } = await supabase.auth.getUser();

      if (!user || signInError) {
        toast.error(
          "Unable to verify your account. Please try logging in again."
        );
        setIsLoading(false);
        return;
      }

      // Update password through Supabase Auth
      const { error } = await supabase.auth.updateUser({
        password: values.newPassword,
      });

      if (error) {
        toast.error("Failed to update password: " + error.message);
      } else {
        toast.success("Password updated successfully");

        // Log the user out for security
        await supabase.auth.signOut();
        toast.info(
          "For security, you've been logged out. Please sign in with your new password."
        );

        // Redirect to login after a short delay
        setTimeout(() => {
          router.push("/auth/login");
        }, 2500);

        form.reset();
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get the UI color for the strength indicator
  const getPasswordStrengthColor = () => {
    if (passwordStrength < 30) return "bg-red-500";
    if (passwordStrength < 60) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
        {isBlocked && (
          <div className='p-3 bg-red-100 border border-red-300 rounded text-red-700 mb-4'>
            <p className='font-semibold'>Account protection activated</p>
            <p className='text-sm'>
              Too many password change attempts. Please try again in{" "}
              {blockTimeRemaining} seconds.
            </p>
          </div>
        )}

        <FormField
          control={form.control}
          name='currentPassword'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current Password</FormLabel>
              <FormControl>
                <Input
                  type='password'
                  placeholder='Enter your current password'
                  {...field}
                  autoComplete='current-password'
                />
              </FormControl>
              <FormDescription>
                Enter your current password for verification
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='newPassword'
          render={({ field }) => (
            <FormItem>
              <FormLabel>New Password</FormLabel>
              <FormControl>
                <Input
                  type='password'
                  placeholder='Enter your new password'
                  {...field}
                  autoComplete='new-password'
                />
              </FormControl>

              {/* Password strength meter */}
              <div className='space-y-2'>
                <div className='flex justify-between text-xs'>
                  <span>Password strength:</span>
                  <span
                    className={
                      passwordStrength < 30
                        ? "text-red-500"
                        : passwordStrength < 60
                        ? "text-yellow-500"
                        : "text-green-500"
                    }
                  >
                    {passwordStrength < 30
                      ? "Weak"
                      : passwordStrength < 60
                      ? "Medium"
                      : "Strong"}
                  </span>
                </div>
                <Progress
                  value={passwordStrength}
                  className={`h-2 ${
                    watchedPassword ? getPasswordStrengthColor() : ""
                  }`}
                />
              </div>

              <FormDescription>
                Password must include at least 8 characters with uppercase,
                lowercase, number and special character.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='confirmPassword'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm New Password</FormLabel>
              <FormControl>
                <Input
                  type='password'
                  placeholder='Confirm your new password'
                  {...field}
                  autoComplete='new-password'
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type='submit'
          className='w-full'
          disabled={isLoading || isBlocked}
        >
          {isLoading ? "Updating..." : "Update Password"}
        </Button>
      </form>
    </Form>
  );
}
