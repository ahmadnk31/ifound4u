"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/client";
import { ItemEditForm } from "@/components/item-edit-form";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function EditItemPage({ params }: { params: { id: string } }) {
  const [isLoading, setIsLoading] = useState(true);
  const [item, setItem] = useState<any>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const fetchItemAndCheckAuth = async () => {
      try {
        setIsLoading(true);
        const {id}=await params
        const itemId = id

        // Check if user is logged in
        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userData?.user) {
          toast.error("Please sign in to edit items");
          router.push(
            "/auth/login?callbackUrl=" +
              encodeURIComponent(`/item/${itemId}/edit`)
          );
          return;
        }

        // Fetch the item with contact information in a single query
        const { data: itemData, error: itemError } = await supabase
          .from("items")
          .select(
            `
            *,
            contact_info (*)
          `
          )
          .eq("id", itemId)
          .single();
          console.log("Item Data:", itemData);
          setItem(itemData);
        if (itemError || !itemData) {
          console.error("Error fetching item:", itemError);
          toast.error("Item not found or could not be loaded");
          router.push("/items");
          return;
        }
        
        // Check if user has permission to edit this item
        const isOwner = itemData.user_id === userData.user.id;

        if (!isOwner) {
          toast.error("You don't have permission to edit this item");
          router.push("/items");
          return;
        }

        // Ensure contact_info is available
        if (!itemData.contact_info) {
          const { data: contactData, error: contactError } = await supabase
            .from("contact_info")
            .select("*")
            .eq("item_id", itemId)
            .single();

          if (!contactError && contactData) {
            itemData.contact_info = contactData;
          } else {
            console.error("Error fetching contact info:", contactError);
          }
        }

        
        setIsAuthorized(true);
      } catch (error) {
        console.error("Error fetching item:", error);
        toast.error("Error loading item data");
        router.push("/items");
      } finally {
        setIsLoading(false);
      }
    };

    fetchItemAndCheckAuth();
  }, [params.id, router, supabase]);

  if (isLoading) {
    return (
      <div className='container py-8 flex flex-col items-center justify-center min-h-[50vh]'>
        <Loader2 className='h-8 w-8 animate-spin text-primary mb-4' />
        <p className='text-muted-foreground'>Loading item details...</p>
      </div>
    );
  }

  if (!isAuthorized || !item) {
    return (
      <div className='container py-8 flex flex-col items-center justify-center min-h-[50vh]'>
        <p className='text-lg font-medium mb-4'>
          You don&apos;t have permission to edit this item
        </p>
        <Button onClick={() => router.push("/items")}>Back to Items</Button>
      </div>
    );
  }

  return (
    <div className='container max-w-3xl py-8'>
      <div className='space-y-4'>
        <div className='flex items-center gap-2'>
          <Button variant='ghost' onClick={() => router.back()}>
            Back
          </Button>
          <h1 className='text-3xl font-bold'>Edit Item</h1>
        </div>
        <p className='text-muted-foreground'>
          Update the details of your {item.type === "lost" ? "lost" : "found"}{" "}
          item.
        </p>
      </div>

      <div className='mt-8'>
        <ItemEditForm item={item} />
      </div>
    </div>
  );
}
