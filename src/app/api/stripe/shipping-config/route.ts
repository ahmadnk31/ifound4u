import { createClient } from "@/lib/server";
import { NextRequest, NextResponse } from "next/server";

// GET: Fetch shipping configuration
export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const url = new URL(request.url);
    const claimId = url.searchParams.get("claimId");
    const itemId = url.searchParams.get("itemId");
    const userId = url.searchParams.get("userId");
    
    if (!claimId && !itemId && !userId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get current user for authorization
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Build the query based on provided parameters
    let query = supabase.from("shipping_configs").select("*");
    
    if (claimId) {
      // First check if the claim exists and user has permission
      const { data: claimData, error: claimError } = await supabase
        .from("item_claims")
        .select("id, user_id, chat_room_id, claimer_email, items:items(user_id, title)")
        .eq("id", claimId)
        .single();

      if (claimError) {
        return NextResponse.json({ error: "Claim not found" }, { status: 404 });
      }
      
      // Check if user is either the item owner or the claimer
      const isItemOwner = claimData.items?.user_id === user.id;
      const isClaimer = 
        claimData.user_id === user.id || 
        user.email?.toLowerCase() === claimData.claimer_email?.toLowerCase();

      if (!isItemOwner && !isClaimer) {
        return NextResponse.json(
          { error: "You don't have permission to access this configuration" },
          { status: 403 }
        );
      }

      // Try to get claim-specific config first
      query = query.eq("claim_id", claimId);
    } else if (itemId) {
      // First check if the item exists and user has permission
      const { data: itemData, error: itemError } = await supabase
        .from("items")
        .select("id, user_id, title")
        .eq("id", itemId)
        .single();

      if (itemError) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      // Check if user is the item owner or has a claim on this item
      const isItemOwner = itemData.user_id === user.id;
      let hasClaim = false;

      if (!isItemOwner) {
        const { data: claims } = await supabase
          .from("item_claims")
          .select("id")
          .eq("item_id", itemId)
          .or(`user_id.eq.${user.id},claimer_email.eq.${user.email}`)
          .limit(1);

        hasClaim = !!claims && claims.length > 0;
      }

      if (!isItemOwner && !hasClaim) {
        return NextResponse.json(
          { error: "You don't have permission to access this configuration" },
          { status: 403 }
        );
      }

      query = query.eq("item_id", itemId);
    } else if (userId) {
      // For security, only allow requesting your own config or if you have a claim with this user
      if (userId !== user.id) {
        // Check if the user has a claim with the requested user
        const { data: userItems } = await supabase
          .from("items")
          .select("id")
          .eq("user_id", userId);

        if (!userItems || userItems.length === 0) {
          return NextResponse.json(
            { error: "You don't have permission to access this configuration" },
            { status: 403 }
          );
        }

        const itemIds = userItems.map(item => item.id);

        // Check if the user has a claim on any of these items
        const { data: claims } = await supabase
          .from("item_claims")
          .select("id")
          .in("item_id", itemIds)
          .or(`user_id.eq.${user.id},claimer_email.eq.${user.email}`)
          .limit(1);

        if (!claims || claims.length === 0) {
          return NextResponse.json(
            { error: "You don't have permission to access this configuration" },
            { status: 403 }
          );
        }
      }

      query = query.eq("user_id", userId).is("claim_id", null).is("item_id", null);
    }

    // Execute the query to get the shipping configuration
    const { data: config, error } = await query.maybeSingle();

    if (error) {
      console.error("Error fetching shipping configuration:", error);
      return NextResponse.json(
        { error: "Failed to fetch shipping configuration" },
        { status: 500 }
      );
    }

    // If no specific config, try to get the user's default config
    if (!config && (claimId || itemId)) {
      // Figure out the user ID of the finder/owner
      let finderId: string | null = null;

      if (claimId) {
        // Get the item owner ID from the claim
        const { data: claim } = await supabase
          .from("item_claims")
          .select("items:items(user_id)")
          .eq("id", claimId)
          .single();

        finderId = claim?.items?.user_id || null;
      } else if (itemId) {
        // Get the item owner ID directly
        const { data: item } = await supabase
          .from("items")
          .select("user_id")
          .eq("id", itemId)
          .single();

        finderId = item?.user_id || null;
      }

      if (finderId) {
        // Try to get the user's default shipping config
        const { data: defaultConfig, error: defaultError } = await supabase
          .from("shipping_configs")
          .select("*")
          .eq("user_id", finderId)
          .is("claim_id", null)
          .is("item_id", null)
          .maybeSingle();

        if (defaultError) {
          console.error("Error fetching default shipping configuration:", defaultError);
        }

        if (defaultConfig) {
          return NextResponse.json({
            ...defaultConfig,
            isDefaultConfig: true
          });
        }
      }
    }

    // If no config found, return a default configuration
    if (!config) {
      return NextResponse.json({
        default_shipping_fee: 500, // $5.00
        allow_claimer_custom: true,
        min_shipping_fee: 300, // $3.00
        max_shipping_fee: 2000, // $20.00
        allow_tipping: true,
        shipping_notes: "",
        isSystemDefault: true
      });
    }

    return NextResponse.json(config);
  } catch (error: any) {
    console.error("Error in shipping config endpoint:", error);
    return NextResponse.json(
      { error: "Server error", message: error.message },
      { status: 500 }
    );
  }
}

// POST: Create or update shipping configuration
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { claimId, itemId, shippingConfig } = data;

    if (!shippingConfig) {
      return NextResponse.json(
        { error: "Missing shipping configuration" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // If this is for a claim, verify the user is the item owner
    if (claimId) {
      const { data: claim, error: claimError } = await supabase
        .from("item_claims")
        .select("id, items:items(user_id)")
        .eq("id", claimId)
        .single();

      if (claimError) {
        return NextResponse.json({ error: "Claim not found" }, { status: 404 });
      }

      const isItemOwner = claim.items?.user_id === user.id;

      if (!isItemOwner) {
        return NextResponse.json(
          { error: "Only the item owner can set shipping configuration" },
          { status: 403 }
        );
      }
    }

    // If this is for an item, verify the user is the owner
    if (itemId) {
      const { data: item, error: itemError } = await supabase
        .from("items")
        .select("id, user_id")
        .eq("id", itemId)
        .single();

      if (itemError) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      if (item.user_id !== user.id) {
        return NextResponse.json(
          { error: "Only the item owner can set shipping configuration" },
          { status: 403 }
        );
      }
    }

    // Format the data for storage
    const configData = {
      user_id: user.id,
      claim_id: claimId || null,
      item_id: itemId || null,
      default_shipping_fee: shippingConfig.default_shipping_fee || 500, // Default to $5.00
      allow_claimer_custom: shippingConfig.allow_claimer_custom !== false,
      min_shipping_fee: shippingConfig.min_shipping_fee || 300, // Default to $3.00
      max_shipping_fee: shippingConfig.max_shipping_fee || 2000, // Default to $20.00
      allow_tipping: shippingConfig.allow_tipping !== false,
      shipping_notes: shippingConfig.shipping_notes || "",
      updated_at: new Date().toISOString(),
    };

    // Check for existing config
    let query = supabase.from("shipping_configs");

    if (claimId) {
      const { data: existingConfig } = await query
        .select("id")
        .eq("claim_id", claimId)
        .maybeSingle();

      if (existingConfig) {
        // Update existing config
        const { error } = await query
          .update(configData)
          .eq("id", existingConfig.id);

        if (error) {
          throw new Error(error.message);
        }
      } else {
        // Create new config
        const { error } = await query.insert({
          ...configData,
          created_at: new Date().toISOString(),
        });

        if (error) {
          throw new Error(error.message);
        }
      }
    } else if (itemId) {
      const { data: existingConfig } = await query
        .select("id")
        .eq("item_id", itemId)
        .maybeSingle();

      if (existingConfig) {
        // Update existing config
        const { error } = await query
          .update(configData)
          .eq("id", existingConfig.id);

        if (error) {
          throw new Error(error.message);
        }
      } else {
        // Create new config
        const { error } = await query.insert({
          ...configData,
          created_at: new Date().toISOString(),
        });

        if (error) {
          throw new Error(error.message);
        }
      }
    } else {
      // This is a user's default config
      const { data: existingConfig } = await query
        .select("id")
        .eq("user_id", user.id)
        .is("claim_id", null)
        .is("item_id", null)
        .maybeSingle();

      if (existingConfig) {
        // Update existing config
        const { error } = await query
          .update(configData)
          .eq("id", existingConfig.id);

        if (error) {
          throw new Error(error.message);
        }
      } else {
        // Create new config
        const { error } = await query.insert({
          ...configData,
          created_at: new Date().toISOString(),
        });

        if (error) {
          throw new Error(error.message);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Shipping configuration saved successfully",
    });
  } catch (error: any) {
    console.error("Error saving shipping configuration:", error);
    return NextResponse.json(
      { error: "Failed to save shipping configuration", message: error.message },
      { status: 500 }
    );
  }
}