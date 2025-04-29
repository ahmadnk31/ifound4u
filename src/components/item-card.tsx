"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Calendar,
  Clock,
  Globe,
  MapPin,
  MessageCircle,
  User,
} from "lucide-react";
import Image from "next/image";
import { ClaimItemDialog } from "./claim-item-dialog";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/client";
import { toast } from "sonner";

// Define the item categories (same as in item-report-form.tsx)
export const itemCategories = [
  { value: "electronics", label: "Electronics" },
  { value: "jewelry", label: "Jewelry" },
  { value: "clothing", label: "Clothing" },
  { value: "accessories", label: "Accessories" },
  { value: "pets", label: "Pets" },
  { value: "documents", label: "Documents" },
  { value: "keys", label: "Keys" },
  { value: "bags", label: "Bags and Luggage" },
  { value: "toys", label: "Toys" },
  { value: "books", label: "Books" },
  { value: "money", label: "Money/Wallet" },
  { value: "other", label: "Other" },
];

// Get label for a category value
export const getCategoryLabel = (value: string) => {
  const category = itemCategories.find((c) => c.value === value);
  return category?.label || value;
};

export interface ItemType {
  id: string;
  type: "lost" | "found";
  category: string;
  title: string;
  description: string;
  date: string;
  location_address: string;
  location_latitude: number;
  location_longitude: number;
  location_place_id?: string | null;
  image_url?: string | null;
  user_id?: string | null;
  created_at: string;
  is_claimed: boolean;
  claim_status?: "pending" | "approved" | "rejected" | null;
  contact_info?: {
    name: string;
    email: string;
    phone?: string | null;
  };
}

interface ItemCardProps {
  item: ItemType;
  showContactInfo?: boolean;
  showClaimButton?: boolean;
  onClaimStatusChange?: () => void;
  isOwnItem?: boolean;
}

export function ItemCard({
  item,
  showContactInfo = false,
  showClaimButton = true,
  onClaimStatusChange,
  isOwnItem = false,
}: ItemCardProps) {
  const [showClaimDialog, setShowClaimDialog] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Format the date into a readable format
  const formattedDate = format(new Date(item.date), "PPP");
  // Get the category label
  const categoryLabel = getCategoryLabel(item.category);

  const handleChatRedirect = async (chatRoomId: string) => {
    // Redirect to the messages page with the chat room ID
    router.push(`/messages?room=${chatRoomId}`);
  };

  // Handle claim approval/rejection
  const updateClaimStatus = async (
    claimId: string,
    status: "approved" | "rejected"
  ) => {
    try {
      const { error } = await supabase
        .from("item_claims")
        .update({ status })
        .eq("id", claimId);

      if (error) throw error;

      // If approved, mark the item as claimed
      if (status === "approved") {
        await supabase
          .from("items")
          .update({ is_claimed: true })
          .eq("id", item.id);
      }

      toast.success(
        `Claim ${status === "approved" ? "approved" : "rejected"} successfully`
      );
      if (onClaimStatusChange) onClaimStatusChange();
    } catch (error) {
      console.error("Error updating claim status:", error);
      toast.error("Failed to update claim status");
    }
  };

  return (
    <>
      <Card className='overflow-hidden transition-all duration-200 hover:shadow-md border-border/40 hover:border-border'>
        <div className='relative'>
          {item.image_url ? (
            <div className='w-full h-56 relative'>
              <Image
                src={item.image_url}
                alt={item.title}
                fill
                sizes='(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'
                className='object-cover hover:scale-105 transition-transform duration-200'
              />
            </div>
          ) : (
            <div className='w-full h-56 bg-muted/50 flex items-center justify-center'>
              <p className='text-muted-foreground'>No image available</p>
            </div>
          )}
          <Badge
            variant={item.type === "lost" ? "destructive" : "success"}
            className='absolute top-4 right-4 shadow-sm'
          >
            {item.type === "lost" ? "Lost" : "Found"}
          </Badge>
          {item.is_claimed && (
            <Badge
              variant='secondary'
              className='absolute top-4 left-4 shadow-sm'
            >
              Claimed
            </Badge>
          )}
        </div>

        <CardHeader className='px-5 py-4'>
          <div className='flex justify-between items-start gap-2'>
            <div className='flex-1'>
              <CardTitle className='line-clamp-2 text-lg'>
                {item.title}
              </CardTitle>
              <CardDescription className='flex items-center gap-1 mt-1.5 text-xs'>
                <Calendar className='h-3 w-3' /> {formattedDate}
              </CardDescription>
            </div>
            <Badge variant='outline' className='whitespace-nowrap'>
              {categoryLabel}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className='px-5 pb-4'>
          <div className='space-y-4'>
            <p className='text-sm text-muted-foreground line-clamp-3'>
              {item.description}
            </p>

            <div className='text-sm flex items-start gap-2'>
              <MapPin className='h-4 w-4 shrink-0 mt-0.5 text-muted-foreground' />
              <span className='text-sm'>{item.location_address}</span>
            </div>

            {showContactInfo && item.contact_info && (
              <div className='border-t pt-3 mt-3 border-border/50'>
                <p className='text-sm font-medium mb-2'>Contact Information</p>
                <div className='space-y-2'>
                  <div className='text-xs flex items-center gap-2'>
                    <User className='h-3.5 w-3.5 text-muted-foreground' />
                    <span>{item.contact_info.name}</span>
                  </div>

                  <div className='text-xs flex items-center gap-2'>
                    <Globe className='h-3.5 w-3.5 text-muted-foreground' />
                    <span>{item.contact_info.email}</span>
                  </div>

                  {item.contact_info.phone && (
                    <div className='text-xs flex items-center gap-2'>
                      <Clock className='h-3.5 w-3.5 text-muted-foreground' />
                      <span>{item.contact_info.phone}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className='flex gap-2 justify-between px-5 py-4 bg-accent/10'>
          <div className='text-xs text-muted-foreground'>
            Posted {format(new Date(item.created_at), "PPP")}
          </div>

          <div className='flex gap-2'>
            {isOwnItem && (
              <Button
                variant='outline'
                size='sm'
                className='flex gap-2 items-center hover:bg-primary hover:text-primary-foreground'
                onClick={() => router.push(`/item/${item.id}/edit`)}
              >
                Edit
              </Button>
            )}

            {/* Debug information about why claim button might not show */}
            <div className='sr-only'>
              showClaimButton: {showClaimButton ? "true" : "false"}, is_claimed:{" "}
              {item.is_claimed ? "true" : "false"}, type: {item.type}
            </div>

            {/* Modified condition to show claim button on all items for now */}
            {showClaimButton && !item.is_claimed && (
              <Button
                variant='secondary'
                size='sm'
                className='flex gap-2 items-center shadow-sm hover:shadow'
                onClick={() => setShowClaimDialog(true)}
              >
                <MessageCircle className='h-4 w-4' />
                Claim Item
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>

      {showClaimDialog && (
        <ClaimItemDialog
          item={item}
          onClose={() => setShowClaimDialog(false)}
          onChatStarted={handleChatRedirect}
        />
      )}
    </>
  );
}
