"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/client";
import { RealtimeChat } from "@/components/realtime-chat";
import { Button } from "@/components/ui/button";
import { ItemCard } from "@/components/item-card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";
import { useUnreadMessages } from "@/hooks/use-unread-messages";

// Define interface for chat room data
interface ChatRoom {
  id: string;
  chatRoomId: string;
  itemId: string;
  claimerName: string;
  claimerEmail: string;
  item: {
    id: string;
    title: string;
    type: "lost" | "found";
    category: string;
    description: string;
    date: string;
    location_address: string;
    location_latitude: number;
    location_longitude: number;
    image_url: string | null;
    created_at: string;
    is_claimed: boolean;
  };
  status: "pending" | "accepted" | "rejected";
  created_at: string;
}

export default function MessagesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [username, setUsername] = useState<string>("");
  const [activeChats, setActiveChats] = useState<ChatRoom[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatRoom | null>(null);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [actionType, setActionType] = useState<"accepted" | "rejected">(
    "accepted"
  );
  const [isOwner, setIsOwner] = useState<{ [key: string]: boolean }>({});
  const { unreadCounts, refreshCounts } = useUnreadMessages();

  const router = useRouter();
  const searchParams = useSearchParams();
  const roomParam = searchParams.get("room");
  const supabase = createClient();

  // Add a mounted state check to avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch user data and active chat rooms
  useEffect(() => {
    if (!isMounted) return; // Skip fetching if component is not mounted yet

    const fetchUserAndChats = async () => {
      setIsLoading(true);
      try {
        // Debug the room parameter and decode it properly
        const originalRoomParam = roomParam;
        // Decode the URL parameter to handle special characters
        const decodedRoomParam = roomParam
          ? decodeURIComponent(roomParam)
          : null;

        console.log("Room parameter (original):", originalRoomParam);
        console.log("Room parameter (decoded):", decodedRoomParam);

        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          // Redirect to login if not authenticated
          toast.error("Please sign in to access messages");
          router.push("/auth/login?callbackUrl=/messages");
          return;
        }

        // Set username from user email or metadata
        setUsername(user.user_metadata?.displayName || user.email || "User");
        console.log("Current user:", user.email);

        // Get chat rooms the user is involved with
        const { data: ownerItems, error: ownerError } = await supabase
          .from("items")
          .select("id")
          .eq("user_id", user.id);

        if (ownerError) throw ownerError;

        console.log("User's owned items:", ownerItems?.length || 0);
        console.log("User's email:", user.email);

        // If roomParam exists, try to find that specific chat room with both encoded and decoded versions
        if (decodedRoomParam) {
          console.log(
            "Searching for chat room with decoded ID:",
            decodedRoomParam
          );

          // Try different variations of the room ID (original, decoded, etc.)
          const possibleRoomIds = [
            originalRoomParam,
            decodedRoomParam,
            // Add more variations if needed
          ].filter(Boolean); // Remove any null/undefined values

          console.log("Trying these room ID variations:", possibleRoomIds);

          // First try to get the chat room directly by its ID
          const { data: specificChat, error: specificChatError } =
            await supabase
              .from("item_claims")
              .select(
                `
              id,
              chat_room_id,
              item_id,
              claimer_name,
              claimer_email,
              status,
              created_at,
              user_id,
              item:items (
                id,
                title,
                type,
                category,
                description,
                date,
                location_address,
                location_latitude,
                location_longitude,
                image_url,
                created_at,
                is_claimed,
                user_id
              )
            `
              )
              .eq("chat_room_id", decodedRoomParam)
              .single();

          // Log the result of the specific chat query
          console.log(
            "Specific chat query result:",
            specificChat ? "Found" : "Not found"
          );

          if (specificChatError) {
            console.error("Error fetching specific chat:", specificChatError);
          } else if (specificChat) {
            console.log("Chat room details:", {
              id: specificChat.id,
              chat_room_id: specificChat.chat_room_id,
              item_id: specificChat.item_id,
              user_id: specificChat.user_id,
              claimer_email: specificChat.claimer_email,
            });

            // Check if user has permission to view this chat - they either own the item, are the claimer by ID,
            // or their email matches the claimer_email
            const isItemOwner =
              specificChat.item && specificChat.item.user_id === user.id;

            const isClaimerById = specificChat.user_id === user.id;

            const isClaimerByEmail =
              specificChat.claimer_email.toLowerCase() ===
              user.email.toLowerCase();

            const isValidChat =
              isItemOwner || isClaimerById || isClaimerByEmail;

            console.log("Permission check:", {
              isItemOwner,
              isClaimerById,
              isClaimerByEmail,
              isValidChat,
            });

            if (isValidChat) {
              const formattedChat = {
                id: specificChat.id,
                chatRoomId: specificChat.chat_room_id,
                itemId: specificChat.item_id,
                claimerName: specificChat.claimer_name,
                claimerEmail: specificChat.claimer_email,
                status: specificChat.status,
                created_at: specificChat.created_at,
                item: specificChat.item,
              };

              setActiveChats([formattedChat]);
              setSelectedChat(formattedChat);
              setIsLoading(false);
              return;
            } else {
              console.log("User doesn't have permission to view this chat");
              toast.error("You don't have permission to view this chat");
            }
          }
        }

        // Build a query to get all chats where user is either:
        // 1. The item owner
        // 2. The claimer by user_id
        // 3. The claimer by email
        console.log("Fetching all chats for user");

        // Get all chat rooms where the user might be involved
        const { data: allClaims, error: allClaimsError } = await supabase
          .from("item_claims")
          .select(
            `
            id,
            chat_room_id,
            item_id,
            claimer_name,
            claimer_email,
            status,
            created_at,
            user_id,
            item:items (
              id,
              title,
              type,
              category,
              description,
              date,
              location_address,
              location_latitude,
              location_longitude,
              image_url,
              created_at,
              is_claimed,
              user_id
            )
          `
          )
          .order("created_at", { ascending: false });

        if (allClaimsError) {
          console.error("Error fetching claims:", allClaimsError);
          throw allClaimsError;
        }

        // Filter client-side to include all claims where:
        // - User is the item owner
        // - User is the claimer (by user_id)
        // - User's email matches claimer_email
        const relevantClaims = allClaims?.filter((claim) => {
          const isItemOwner = claim.item && claim.item.user_id === user.id;
          const isClaimerById = claim.user_id === user.id;
          const isClaimerByEmail =
            claim.claimer_email.toLowerCase() === user.email.toLowerCase();

          return isItemOwner || isClaimerById || isClaimerByEmail;
        });

        console.log(
          `Found ${relevantClaims?.length || 0} relevant claims for user`
        );

        // Map the data to our ChatRoom interface
        const formattedChats: ChatRoom[] = relevantClaims
          ? relevantClaims.map((chat: any) => ({
              id: chat.id,
              chatRoomId: chat.chat_room_id,
              itemId: chat.item_id,
              claimerName: chat.claimer_name,
              claimerEmail: chat.claimer_email,
              status: chat.status,
              created_at: chat.created_at,
              item: chat.item,
            }))
          : [];

        setActiveChats(formattedChats);

        // If a room ID was specified in the URL, select that chat
        if (roomParam && formattedChats.length > 0) {
          const matchingChat = formattedChats.find((chat) => {
            return (
              chat.chatRoomId === decodedRoomParam ||
              chat.chatRoomId === originalRoomParam
            );
          });

          if (matchingChat) {
            setSelectedChat(matchingChat);
          } else {
            // Chat room from URL not found or user doesn't have access
            toast.error(
              "Chat room not found or you don't have permission to access it"
            );

            // Show the first available chat instead
            setSelectedChat(formattedChats[0]);
          }
        } else if (formattedChats.length > 0) {
          // Otherwise select the most recent chat
          setSelectedChat(formattedChats[0]);
        }
      } catch (error) {
        console.error("Error fetching user data and chats:", error);
        toast.error("Failed to load messages");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserAndChats();
  }, [supabase, router, roomParam, isMounted]);

  // Handle approval/rejection of a claim
  const handleClaimAction = async () => {
    if (!selectedChat) return;

    try {
      // Update the claim status in the database
      const { error } = await supabase
        .from("item_claims")
        .update({ status: actionType })
        .eq("id", selectedChat.id);

      if (error) throw error;

      // If accepted, also mark the item as claimed
      if (actionType === "accepted") {
        await supabase
          .from("items")
          .update({ is_claimed: true })
          .eq("id", selectedChat.itemId);
      }

      // Update the local state
      setActiveChats((prev) =>
        prev.map((chat) =>
          chat.id === selectedChat.id ? { ...chat, status: actionType } : chat
        )
      );

      setSelectedChat((prev) =>
        prev ? { ...prev, status: actionType } : null
      );

      toast.success(
        `Claim ${
          actionType === "accepted" ? "approved" : "rejected"
        } successfully`
      );
    } catch (error) {
      console.error(`Error ${actionType}ing claim:`, error);
      toast.error(`Failed to ${actionType} claim`);
    } finally {
      setShowActionDialog(false);
    }
  };

  // Start approval process
  const startApproveAction = () => {
    setActionType("accepted");
    setShowActionDialog(true);
  };

  // Start rejection process
  const startRejectAction = () => {
    setActionType("rejected");
    setShowActionDialog(true);
  };

  // Check if user is the item owner
  const isItemOwner = async (chat: ChatRoom) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      // Get the item to check ownership
      const { data: item } = await supabase
        .from("items")
        .select("user_id")
        .eq("id", chat.itemId)
        .single();

      return item?.user_id === user.id;
    } catch (error) {
      console.error("Error checking item ownership:", error);
      return false;
    }
  };

  // Function to determine if the action buttons should be shown
  const shouldShowActionButtons = (chat: ChatRoom) => {
    // If we've already checked ownership for this chat, use that result
    if (isOwner[chat.id] !== undefined) {
      return (
        isOwner[chat.id] && chat.status === "pending" && !chat.item.is_claimed
      );
    }

    // Otherwise, check ownership and store the result
    isItemOwner(chat).then((result) => {
      setIsOwner((prev) => ({ ...prev, [chat.id]: result }));
    });

    // Show loading state until ownership is determined
    return false;
  };

  // If still loading, show a loading state
  if (isLoading) {
    return (
      <div className='flex justify-center items-center min-h-[60vh]'>
        <div className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary'></div>
      </div>
    );
  }

  return (
    <div className='container max-w-7xl mx-auto py-8'>
      <h1 className='text-3xl font-bold mb-8'>Messages</h1>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
        {/* Left sidebar - chat list */}
        <div className='col-span-1'>
          <Card>
            <CardHeader>
              <CardTitle>Your Conversations</CardTitle>
              <CardDescription>
                Chat with people about lost and found items
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeChats.length === 0 ? (
                <div className='text-center py-8 text-muted-foreground'>
                  No active conversations yet
                </div>
              ) : (
                <Tabs defaultValue='all' className='w-full'>
                  <TabsList className='grid w-full grid-cols-3'>
                    <TabsTrigger value='all'>All</TabsTrigger>
                    <TabsTrigger value='pending'>Pending</TabsTrigger>
                    <TabsTrigger value='resolved'>Resolved</TabsTrigger>
                  </TabsList>

                  <TabsContent value='all' className='mt-4 space-y-2'>
                    {activeChats.map((chat) => (
                      <div
                        key={chat.id}
                        className={`p-3 rounded-lg cursor-pointer flex justify-between items-center transition-colors ${
                          selectedChat?.id === chat.id
                            ? "bg-accent"
                            : "hover:bg-muted"
                        }`}
                        onClick={() => setSelectedChat(chat)}
                      >
                        <div>
                          <div className='font-medium line-clamp-1'>
                            {chat.item.title}
                          </div>
                          <div className='text-sm text-muted-foreground flex items-center gap-1'>
                            <MessageSquare className='h-3 w-3' />{" "}
                            {chat.claimerName}
                          </div>
                        </div>
                        <div className='flex items-center gap-2'>
                          {unreadCounts[chat.chatRoomId] > 0 && (
                            <Badge variant='default'>
                              {unreadCounts[chat.chatRoomId]} unread
                            </Badge>
                          )}
                          <Badge
                            variant={
                              chat.status === "pending"
                                ? "outline"
                                : chat.status === "accepted"
                                ? "success"
                                : "destructive"
                            }
                          >
                            {chat.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value='pending' className='mt-4 space-y-2'>
                    {activeChats
                      .filter((chat) => chat.status === "pending")
                      .map((chat) => (
                        <div
                          key={chat.id}
                          className={`p-3 rounded-lg cursor-pointer flex justify-between items-center transition-colors ${
                            selectedChat?.id === chat.id
                              ? "bg-accent"
                              : "hover:bg-muted"
                          }`}
                          onClick={() => setSelectedChat(chat)}
                        >
                          <div>
                            <div className='font-medium line-clamp-1'>
                              {chat.item.title}
                            </div>
                            <div className='text-sm text-muted-foreground flex items-center gap-1'>
                              <MessageSquare className='h-3 w-3' />{" "}
                              {chat.claimerName}
                            </div>
                          </div>
                          <div className='flex items-center gap-2'>
                            {unreadCounts[chat.chatRoomId] > 0 && (
                              <Badge variant='default'>
                                {unreadCounts[chat.chatRoomId]} unread
                              </Badge>
                            )}
                            <Badge variant='outline'>pending</Badge>
                          </div>
                        </div>
                      ))}
                  </TabsContent>

                  <TabsContent value='resolved' className='mt-4 space-y-2'>
                    {activeChats
                      .filter((chat) => chat.status !== "pending")
                      .map((chat) => (
                        <div
                          key={chat.id}
                          className={`p-3 rounded-lg cursor-pointer flex justify-between items-center transition-colors ${
                            selectedChat?.id === chat.id
                              ? "bg-accent"
                              : "hover:bg-muted"
                          }`}
                          onClick={() => setSelectedChat(chat)}
                        >
                          <div>
                            <div className='font-medium line-clamp-1'>
                              {chat.item.title}
                            </div>
                            <div className='text-sm text-muted-foreground flex items-center gap-1'>
                              <MessageSquare className='h-3 w-3' />{" "}
                              {chat.claimerName}
                            </div>
                          </div>
                          <div className='flex items-center gap-2'>
                            {unreadCounts[chat.chatRoomId] > 0 && (
                              <Badge variant='default'>
                                {unreadCounts[chat.chatRoomId]} unread
                              </Badge>
                            )}
                            <Badge
                              variant={
                                chat.status === "accepted"
                                  ? "success"
                                  : "destructive"
                              }
                            >
                              {chat.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right area - selected conversation */}
        <div className='col-span-1 md:col-span-2'>
          {selectedChat ? (
            <div className='h-full flex flex-col'>
              {/* Item details and action buttons */}
              <div className='mb-4'>
                <div className='flex flex-col md:flex-row gap-6'>
                  <div className='md:w-1/3'>
                    <ItemCard
                      item={{
                        ...selectedChat.item,
                        claim_status: selectedChat.status,
                      }}
                      showClaimButton={false}
                    />
                  </div>

                  <div className='md:w-2/3 space-y-4'>
                    <Card>
                      <CardHeader>
                        <CardTitle>Claim Details</CardTitle>
                      </CardHeader>
                      <CardContent className='space-y-2'>
                        <div>
                          <span className='font-semibold'>Claimer Name:</span>{" "}
                          {selectedChat.claimerName}
                        </div>
                        <div>
                          <span className='font-semibold'>Email:</span>{" "}
                          {selectedChat.claimerEmail}
                        </div>
                        <div>
                          <span className='font-semibold'>Status:</span>{" "}
                          <Badge
                            variant={
                              selectedChat.status === "pending"
                                ? "outline"
                                : selectedChat.status === "accepted"
                                ? "success"
                                : "destructive"
                            }
                          >
                            {selectedChat.status}
                          </Badge>
                        </div>
                      </CardContent>

                      {shouldShowActionButtons(selectedChat) && (
                        <CardFooter className='flex justify-end gap-2'>
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={startRejectAction}
                          >
                            <X className='h-4 w-4 mr-1' />
                            Reject Claim
                          </Button>
                          <Button
                            variant='default'
                            size='sm'
                            onClick={startApproveAction}
                          >
                            <Check className='h-4 w-4 mr-1' />
                            Approve Claim
                          </Button>
                        </CardFooter>
                      )}
                    </Card>

                    {/* Status indicator based on the claim status */}
                    {selectedChat.status === "accepted" && (
                      <div className='p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md'>
                        <p className='text-sm text-green-700 dark:text-green-400'>
                          This claim has been approved. You can continue the
                          conversation to arrange the return of the item.
                        </p>
                      </div>
                    )}

                    {selectedChat.status === "rejected" && (
                      <div className='p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md'>
                        <p className='text-sm text-red-700 dark:text-red-400'>
                          This claim has been rejected. The conversation is
                          still available for reference.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <Separator className='my-4' />

              {/* Chat interface */}
              <div className='flex-grow'>
                <Card className='h-[500px]'>
                  <CardHeader>
                    <CardTitle>Chat</CardTitle>
                    <CardDescription>
                      {(() => {
                        // Check if current user is the item owner
                        const isCurrentUserItemOwner = isOwner[selectedChat.id];

                        // Use claimer name for item owners, otherwise use "Item Owner"
                        const chatPartnerName = isCurrentUserItemOwner
                          ? selectedChat.claimerName || "Claimer"
                          : "Item Owner";

                        return `Chat about ${selectedChat.item.title} with ${chatPartnerName}`;
                      })()}
                    </CardDescription>
                  </CardHeader>
                  <div className='h-[400px]'>
                    <RealtimeChat
                      roomName={selectedChat.chatRoomId}
                      username={username}
                    />
                  </div>
                </Card>
              </div>
            </div>
          ) : (
            <div className='h-full flex items-center justify-center'>
              <div className='text-center'>
                <h3 className='text-lg font-medium'>
                  No conversation selected
                </h3>
                <p className='text-muted-foreground mt-1'>
                  Select a conversation from the sidebar or start a new one
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Approval/Rejection confirmation dialog */}
      <AlertDialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === "accepted"
                ? "Approve this claim"
                : "Reject this claim"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === "accepted"
                ? "This will mark the item as claimed and notify the claimer that their claim has been approved. Are you sure this is the rightful owner?"
                : "This will reject the claim and notify the claimer. You can still chat with them if needed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClaimAction}>
              {actionType === "accepted" ? "Yes, Approve" : "Yes, Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
