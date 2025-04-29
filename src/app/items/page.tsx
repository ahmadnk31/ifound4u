"use client";

import { useState, useEffect } from "react";

import { ItemsList } from "@/components/items-list";
import { createClient } from "@/lib/client";

export default function ItemsPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const supabase = createClient();

  // Get the current user ID to determine which items can be edited
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setCurrentUserId(data.user.id);
      }
    };

    getCurrentUser();
  }, [supabase]);

  return (
    <div className='container py-8 max-w-7xl'>
      <div className='space-y-2 mb-8'>
        <h1 className='text-3xl font-bold'>Browse Items</h1>
        <p className='text-muted-foreground'>
          Browse through all lost and found items. Use the filters to narrow
          down your search.
        </p>
      </div>

      {/* Display the items list with the current user ID */}
      <ItemsList
        showFilters={true}
        showPagination={true}
        userId={currentUserId} // This is only needed for showing the Edit button
        showAllItems={true} // Add explicit flag to ensure we show all items
      />
    </div>
  );
}
