import { createClient } from "@/lib/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // Create server-side Supabase client with admin privileges
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // First get all the chat rooms the user is involved with (either as claimer or item owner)
    const { data: userItems } = await supabase
      .from("items")
      .select("id")
      .eq("user_id", user.id);

    const itemIds = userItems?.map((item) => item.id) || [];

    // Get all chat rooms where user is involved
    const { data: chatRooms } = await supabase
      .from("item_claims")
      .select(
        `
        id, 
        chat_room_id, 
        user_id, 
        item_id,
        claimer_email
      `
      )
      .or(
        `user_id.eq.${user.id}${
          itemIds.length > 0 ? `,item_id.in.(${itemIds.join(",")})` : ""
        }`
      );

    if (!chatRooms || chatRooms.length === 0) {
      return NextResponse.json({ unreadCounts: {}, totalUnread: 0 });
    }

    // Identify chat rooms where user is involved either as claimer or item owner
    const chatRoomIds = chatRooms.map((room) => room.chat_room_id);

    // Check if user is claimer by email as well (for cases where user is not logged in when claiming)
    const claimerByEmailRooms = await supabase
      .from("item_claims")
      .select("chat_room_id")
      .eq("claimer_email", user.email);

    if (claimerByEmailRooms.data && claimerByEmailRooms.data.length > 0) {
      claimerByEmailRooms.data.forEach((room) => {
        if (!chatRoomIds.includes(room.chat_room_id)) {
          chatRoomIds.push(room.chat_room_id);
        }
      });
    }

    // Get unread message counts for each chat room
    const unreadCounts: Record<string, number> = {};
    let totalUnread = 0;

    // For each chat room, count messages that are not read and not sent by the current user
    for (const roomId of chatRoomIds) {
      const { count, error } = await supabase
        .from("chat_messages")
        .select("*", { count: "exact", head: true })
        .eq("chat_room_id", roomId)
        .eq("is_read", false)
        .neq("sender_id", user.id);

      if (!error && count !== null) {
        unreadCounts[roomId] = count;
        totalUnread += count;
      }
    }

    return NextResponse.json({
      unreadCounts,
      totalUnread,
    });
  } catch (error: any) {
    console.error("Error fetching unread counts:", error);
    return NextResponse.json(
      { error: "Failed to fetch unread counts", details: error.message },
      { status: 500 }
    );
  }
}
