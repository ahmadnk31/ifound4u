"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/client";
import { ItemsList } from "@/components/items-list";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function MyItemsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "lost" | "found">("all");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setIsLoading(true);
        const { data } = await supabase.auth.getUser();

        if (!data.user) {
          toast.error("Please sign in to view your items");
          router.push("/auth/login?callbackUrl=/items/my-items");
          return;
        }

        setUserId(data.user.id);
      } catch (error) {
        console.error("Error checking authentication:", error);
        toast.error("Something went wrong. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [supabase.auth, router]);

  if (isLoading) {
    return (
      <div className='container py-8 flex flex-col items-center justify-center min-h-[50vh]'>
        <Loader2 className='h-8 w-8 animate-spin text-primary mb-4' />
        <p className='text-muted-foreground'>Loading your items...</p>
      </div>
    );
  }

  if (!userId) {
    return null; // The redirection will happen in the useEffect
  }

  return (
    <div className='container py-8 max-w-7xl'>
      <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8'>
        <div>
          <h1 className='text-3xl font-bold'>My Items</h1>
          <p className='text-muted-foreground mt-1'>
            Manage your lost and found item reports
          </p>
        </div>

        <Button asChild>
          <Link href='/report'>
            <Plus className='mr-2 h-4 w-4' />
            Report New Item
          </Link>
        </Button>
      </div>

      <Tabs
        defaultValue={activeTab}
        onValueChange={(v) => setActiveTab(v as "all" | "lost" | "found")}
        className='mb-6'
      >
        <TabsList>
          <TabsTrigger value='all'>All Items</TabsTrigger>
          <TabsTrigger value='lost'>Lost Items</TabsTrigger>
          <TabsTrigger value='found'>Found Items</TabsTrigger>
        </TabsList>

        <TabsContent value='all'>
          <ItemsList
            initialType='all'
            userId={userId}
            showFilters={false}
            showPagination={true}
          />
        </TabsContent>
        <TabsContent value='lost'>
          <ItemsList
            initialType='lost'
            userId={userId}
            showFilters={false}
            showPagination={true}
          />
        </TabsContent>
        <TabsContent value='found'>
          <ItemsList
            initialType='found'
            userId={userId}
            showFilters={false}
            showPagination={true}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
