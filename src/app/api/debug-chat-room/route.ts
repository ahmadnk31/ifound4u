import { createClient } from "@/lib/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const roomId = url.searchParams.get("room");

    if (!roomId) {
      return NextResponse.json(
        { error: "Missing room ID parameter" },
        { status: 400 }
      );
    }

    const decodedRoomId = decodeURIComponent(roomId);

    const supabase = await createClient();

    // 1. Check if the chat room exists
    console.log(`Checking if chat room exists: ${decodedRoomId}`);
    const { data: chatRoom, error: chatRoomError } = await supabase
      .from("item_claims")
      .select("id, chat_room_id, item_id, user_id, status")
      .eq("chat_room_id", decodedRoomId)
      .single();

    if (chatRoomError) {
      console.error("Error finding chat room:", chatRoomError);

      // If the room wasn't found, try listing all rooms for diagnostic purposes
      const { data: allRooms } = await supabase
        .from("item_claims")
        .select("chat_room_id")
        .limit(10);

      return NextResponse.json({
        exists: false,
        error: chatRoomError.message,
        message: "Chat room not found in database",
        roomIdSearched: decodedRoomId,
        sampleRooms: allRooms?.map((r) => r.chat_room_id) || [],
      });
    }

    // 2. Get current authenticated user (if any)
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;

    // 3. Check if this user can access this chat room
    let hasPermission = false;
    let reason = "Unknown user";

    if (userId) {
      // Check if user is the claimer
      if (chatRoom.user_id === userId) {
        hasPermission = true;
        reason = "User is claimer";
      } else {
        // Check if user is the item owner
        const { data: item } = await supabase
          .from("items")
          .select("user_id")
          .eq("id", chatRoom.item_id)
          .single();

        if (item && item.user_id === userId) {
          hasPermission = true;
          reason = "User is item owner";
        } else {
          reason = "User is neither claimer nor item owner";
        }
      }
    }

    return NextResponse.json({
      exists: true,
      chatRoomId: chatRoom.chat_room_id,
      itemId: chatRoom.item_id,
      claimerId: chatRoom.user_id,
      status: chatRoom.status,
      currentUserId: userId || "Not authenticated",
      hasPermission,
      reason,
      message: hasPermission
        ? "You have access to this chat room"
        : "You don't have permission to access this chat room",
    });
  } catch (error: any) {
    console.error("Error in debug chat room endpoint:", error);
    return NextResponse.json(
      { error: "Server error", details: error.message },
      { status: 500 }
    );
  }
}
