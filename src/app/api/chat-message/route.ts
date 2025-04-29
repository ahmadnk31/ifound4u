import { createClient } from "@/lib/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, chat_room_id, sender_name, sender_email, message, sender_id } =
      body;

    // Input validation
    if (!id || !chat_room_id || !sender_name || !message) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create server-side Supabase client with admin privileges
    const supabase = await createClient();

    // First check if the chat room exists
    const { data: chatRoomData, error: chatRoomError } = await supabase
      .from("item_claims")
      .select("id")
      .eq("chat_room_id", chat_room_id)
      .single();

    if (chatRoomError || !chatRoomData) {
      console.error("Chat room not found:", chatRoomError);
      return NextResponse.json(
        { error: "Chat room not found" },
        { status: 404 }
      );
    }

    // Insert message using admin privileges to bypass RLS
    const { data: messageData, error: messageError } = await supabase
      .from("chat_messages")
      .insert({
        id,
        chat_room_id,
        sender_id,
        sender_name,
        sender_email,
        message,
        is_read: false,
        created_at: new Date().toISOString(),
      })
      .select();

    if (messageError) {
      console.error("Error saving message:", messageError);
      return NextResponse.json(
        { error: "Failed to save message", message: messageError.message },
        { status: 500 }
      );
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: messageData[0],
    });
  } catch (error: any) {
    console.error("Error handling chat message:", error);
    return NextResponse.json(
      { error: "Failed to process message", message: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get chat_room_id from query parameters
    const url = new URL(request.url);
    const chatRoomId = url.searchParams.get("room");

    if (!chatRoomId) {
      return NextResponse.json(
        { error: "Missing chat room ID" },
        { status: 400 }
      );
    }

    // Create server-side Supabase client with admin privileges
    const supabase = await createClient();

    // Get current user context
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the chat room details to determine user's role (item owner or claimer)
    const { data: chatRoom } = await supabase
      .from("item_claims")
      .select(
        `
        id,
        user_id,
        claimer_email,
        item_id,
        items:items (user_id)
      `
      )
      .eq("chat_room_id", chatRoomId)
      .single();

    if (!chatRoom) {
      return NextResponse.json(
        { error: "Chat room not found" },
        { status: 404 }
      );
    }

    // Determine if current user is item owner or claimer
    const isItemOwner = chatRoom.items?.user_id === user.id;
    const isClaimer =
      chatRoom.user_id === user.id ||
      (chatRoom.claimer_email &&
        chatRoom.claimer_email.toLowerCase() === user.email.toLowerCase());

    if (!isItemOwner && !isClaimer) {
      return NextResponse.json(
        { error: "You don't have permission to view these messages" },
        { status: 403 }
      );
    }

    console.log("User role in chat:", {
      isItemOwner,
      isClaimer,
      userId: user.id,
    });

    // Get messages
    const { data: messages, error: messagesError } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("chat_room_id", chatRoomId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return NextResponse.json(
        { error: "Failed to fetch messages", message: messagesError.message },
        { status: 500 }
      );
    }

    // Mark messages from other participants as read if they're already displayed
    const messagesToMarkAsRead =
      messages?.filter((msg) => !msg.is_read && msg.sender_id !== user.id) ||
      [];

    if (messagesToMarkAsRead.length > 0) {
      // Update messages in the database as read
      await supabase
        .from("chat_messages")
        .update({ is_read: true })
        .in(
          "id",
          messagesToMarkAsRead.map((msg) => msg.id)
        );

      console.log(`Marked ${messagesToMarkAsRead.length} messages as read`);
    }

    // Return messages with read status
    return NextResponse.json({
      success: true,
      messages: messages || [],
      userContext: {
        isItemOwner,
        isClaimer,
        userId: user.id,
      },
    });
  } catch (error: any) {
    console.error("Error fetching chat messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages", message: error.message },
      { status: 500 }
    );
  }
}
