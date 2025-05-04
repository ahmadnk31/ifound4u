import { createClient } from "@/lib/server";
import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { imageUrl } = await request.json();

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Image URL is required" },
        { status: 400 }
      );
    }

    // Analyze the image with OpenAI's Vision API
    const analysisResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Create a detailed description of this lost item that someone might be searching for. Focus on identifying the object, its distinctive features, colors, and any brand names or identifiable text visible in the image. Keep the description factual and under 200 words.",
            },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      max_tokens: 300,
    });

    const description = analysisResponse.choices[0]?.message?.content || "";

    // Run content moderation
    const moderationResponse = await openai.moderations.create({
      input: description,
    });

    const moderation = moderationResponse.results[0];
    const hasFlaggedCategories = Object.values(moderation.categories).some(
      (value) => value === true
    );

    return NextResponse.json({
      description,
      moderation: {
        approved: !hasFlaggedCategories,
        categories: moderation.categories,
      },
    });
  } catch (error) {
    console.error("Error analyzing image:", error);
    return NextResponse.json(
      { error: "Failed to analyze image" },
      { status: 500 }
    );
  }
}
