"use client";

import { ProfileCard } from "@/components/settings/profile-card";
import { PasswordChangeForm } from "@/components/settings/password-change-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/client";
import Link from "next/link";
import { CreditCard } from "lucide-react";

export default function ProfilePage() {
  const [profileData, setProfileData] = useState({
    id: "",
    email: "",
    displayName: "",
    profilePicture: "",
    bio: "",
    phoneNumber: "",
  });
  console.log("Profile Data:", profileData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserProfile = async () => {
      const supabase = createClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        console.error("Error fetching user:", error);
        setLoading(false);
        return;
      }

      // Get user metadata for profile info
      setProfileData({
        id: user.id,
        email: user.email || "",
        displayName: user.user_metadata?.displayName || "",
        profilePicture: user.user_metadata?.profilePicture || "",
        bio: user.user_metadata?.bio || "",
        phoneNumber: user.user_metadata?.phoneNumber || "",
      });

      setLoading(false);
    };

    fetchUserProfile();
  }, []);

  return (
    <div className='container max-w-3xl py-10'>
      <Card>
        <CardHeader>
          <CardTitle>Account Settings</CardTitle>
          <CardDescription>
            Manage your account information, profile, and security settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue='profile' className='w-full'>
            <TabsList className='grid w-full grid-cols-3 mb-8'>
              <TabsTrigger value='profile'>Profile Information</TabsTrigger>
              <TabsTrigger value='password'>Password</TabsTrigger>
              <TabsTrigger value='payments' asChild>
                <Link href='/settings/payments'>Payment Settings</Link>
              </TabsTrigger>
            </TabsList>

            <TabsContent value='profile'>
              {loading ? (
                <div className='flex items-center justify-center p-8'>
                  <div className='h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent'></div>
                </div>
              ) : (
                <ProfileCard profile={profileData} />
              )}
            </TabsContent>

            <TabsContent value='password'>
              <div className='space-y-6'>
                <div>
                  <h3 className='text-lg font-medium'>Change Password</h3>
                  <p className='text-sm text-muted-foreground'>
                    Update your password to keep your account secure
                  </p>
                </div>
                <PasswordChangeForm />
              </div>
            </TabsContent>

            <TabsContent value='payments'>
              <div className='flex flex-col items-center justify-center p-8 space-y-4'>
                <CreditCard className='h-12 w-12 text-muted-foreground' />
                <div className='text-center'>
                  <h3 className='text-lg font-medium'>Payment Settings</h3>
                  <p className='text-sm text-muted-foreground'>
                    Set up your Stripe account to receive payments when users
                    claim your found items
                  </p>
                </div>
                <Link
                  href='/settings/payments'
                  className='inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
                >
                  Manage Payment Settings
                </Link>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
