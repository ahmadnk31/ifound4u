import { createClient } from "@/lib/server";
import { generateVerificationToken } from "@/lib/utils";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { NextRequest, NextResponse } from "next/server";

const sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      itemId,
      itemTitle,
      claimerName,
      claimerEmail,
      claimDescription,
      chatRoomId,
    } = body;

    // Input validation
    if (!itemId || !claimerName || !claimerEmail || !chatRoomId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create server-side Supabase client
    const supabase = await createClient();

    // First check if the item exists
    const { data: itemData, error: itemError } = await supabase
      .from("items")
      .select("id, title, user_id")
      .eq("id", itemId)
      .single();

    if (itemError || !itemData) {
      console.error("Error retrieving item:", itemError);
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Try to get contact info from contact_info table
    const { data: contactInfoData } = await supabase
      .from("contact_info")
      .select("*")
      .eq("item_id", itemId);

    let ownerEmail = "";
    let ownerName = "Item Owner";

    // If contact info exists, use it
    if (contactInfoData && contactInfoData.length > 0) {
      ownerEmail = contactInfoData[0].email;
      ownerName = contactInfoData[0].name;
    }
    // Otherwise, try to get info from auth.users if user_id exists
    else if (itemData.user_id) {
      const { data: userData } = await supabase.auth.admin.getUserById(
        itemData.user_id
      );

      if (userData && userData.user) {
        ownerEmail = userData.user.email || "";
        ownerName = userData.user.user_metadata?.full_name || "Item Owner";
      }
    }

    // If we still don't have an email, we can't send a notification
    if (!ownerEmail) {
      console.error("No contact email found for item owner");
      return NextResponse.json(
        { error: "No contact email found for item owner" },
        { status: 404 }
      );
    }

    // Generate a verification token for the email link
    const verificationToken = generateVerificationToken(ownerEmail, chatRoomId);

    // Generate verification URL with token
    const verifyUrl = new URL("/verify-claim", request.nextUrl.origin);
    verifyUrl.searchParams.set("token", verificationToken);

    // Send email to the item owner
    const sourceEmail = process.env.SES_SENDER_EMAIL || "no-reply@ifound4u.com";

    const emailParams = {
      Source: sourceEmail,
      Destination: {
        ToAddresses: [ownerEmail],
      },
      Message: {
        Subject: {
          Data: `Someone has claimed your item: "${itemTitle}"`,
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: `
              <h2>Someone has claimed your item</h2>
              <p>Hello ${ownerName},</p>
              <p><strong>${claimerName}</strong> has claimed the item you reported:</p>
              <p><strong>Item:</strong> ${itemTitle}</p>
              <p><strong>Their message:</strong> "${claimDescription}"</p>
              <p><strong>Their email:</strong> ${claimerEmail}</p>
              <p>You can chat with this person to verify their claim by clicking the button below:</p>
              <p><a href="${verifyUrl.toString()}" style="display: inline-block; background-color: #4F46E5; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px;">Respond to Claim</a></p>
              <p>If you believe this is not the rightful owner, you can reject their claim in the messages section.</p>
              <p>Thank you for using IFound4U!</p>
            `,
            Charset: "UTF-8",
          },
          Text: {
            Data: `
              Someone has claimed your item
              
              Hello ${ownerName},
              
              ${claimerName} has claimed the item you reported:
              
              Item: ${itemTitle}
              Their message: "${claimDescription}"
              Their email: ${claimerEmail}
              
              You can chat with this person to verify their claim by visiting:
              ${verifyUrl.toString()}
              
              Thank you for using IFound4U!
            `,
            Charset: "UTF-8",
          },
        },
      },
    };

    // Send email using SES
    const command = new SendEmailCommand(emailParams);
    await sesClient.send(command);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error sending claim notification:", error);
    return NextResponse.json(
      { error: "Failed to send notification", details: String(error) },
      { status: 500 }
    );
  }
}
