import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { connectToDatabase } from "@/database/mongoose";
import Book from "@/database/models/book.model";
import BookSegment from "@/database/models/book-segment.model";
import { getVoice } from "@/lib/utils";

export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { bookId } = await context.params;
  if (!mongoose.isObjectIdOrHexString(bookId)) return NextResponse.json({ error: "Book not found." }, { status: 404 });
  let segmentIndex;
  try { segmentIndex = z.object({ segmentIndex: z.number().int().nonnegative() }).parse(await request.json()).segmentIndex; }
  catch { return NextResponse.json({ error: "Invalid passage." }, { status: 400 }); }
  if (!process.env.ELEVENLABS_API_KEY) return NextResponse.json({ error: "Natural narration is not configured. You can use browser read-aloud instead." }, { status: 503 });
  try {
    await connectToDatabase();
    const book = await Book.findOne({ _id: bookId, $or: [{ clerkId: userId }, { isDemo: true }], totalSegments: { $gt: 0 } }).lean();
    if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });
    const segment = await BookSegment.findOne({ bookId, clerkId: book.clerkId, segmentIndex }).lean();
    if (!segment?.content) return NextResponse.json({ error: "Passage not found." }, { status: 404 });
    if (segment.content.length > 10000) return NextResponse.json({ error: "This passage is too long for natural narration. Use browser read-aloud instead." }, { status: 422 });
    const client = new ElevenLabsClient();
    const audio = await client.textToSpeech.convert(getVoice(book.persona as string | undefined).id, {
      text: segment.content as string,
      modelId: process.env.ELEVENLABS_TTS_MODEL || "eleven_v4",
      voiceSettings: { stability: 0.7, similarityBoost: 0.5 },
    }, { abortSignal: request.signal });
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error && typeof error === "object" && "statusCode" in error ? error.statusCode : undefined;
    console.error("Natural narration failed:", error instanceof Error ? error.name : "UnknownError", typeof status === "number" ? status : "");
    const message = status === 401 ? "ElevenLabs rejected the configured API key. Update it, or use browser read-aloud."
      : status === 402 ? "This voice requires an eligible ElevenLabs plan. Try another voice or use browser read-aloud."
      : status === 429 ? "ElevenLabs' usage limit was reached. Try later or use browser read-aloud."
      : "Natural narration is unavailable. Try again or use browser read-aloud.";
    return NextResponse.json({ error: message }, { status: status === 429 ? 429 : 503 });
  }
}
