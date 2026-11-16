import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/database/mongoose";
import Book from "@/database/models/book.model";
import BookSegment from "@/database/models/book-segment.model";
import { findBookSegments, type SearchSegment } from "@/lib/book-search";
import { formatPassages, generateBookAnswer, summarizeBook, GEMINI_MODEL } from "@/lib/gemini";
import { consumeDemoQuestion } from "@/lib/demo-usage";

export const maxDuration = 300;
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("summary") }),
  z.object({ action: z.literal("question"), question: z.string().trim().min(1).max(1000) }),
]);

export async function POST(request: Request, context: { params: Promise<{ bookId: string }> }) {
  const { userId } = await auth();
  const { bookId } = await context.params;
  if (!mongoose.isObjectIdOrHexString(bookId)) return NextResponse.json({ error: "Book not found." }, { status: 404 });
  let input;
  try { input = inputSchema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Invalid summary or question request." }, { status: 400 }); }

  try {
    await connectToDatabase();
    const access = userId ? { $or: [{ clerkId: userId }, { isDemo: true }] } : { isDemo: true };
    const book = await Book.findOne({ _id: bookId, ...access, totalSegments: { $gt: 0 } }).lean();
    if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });
    if (input.action === "summary" && book.summary) return NextResponse.json({ text: book.summary });
    if (book.isDemo && input.action === "summary") return NextResponse.json({ error: "The demo summary is being prepared. Please try again later." }, { status: 503 });
    if (book.isDemo && !await consumeDemoQuestion(request, userId)) return NextResponse.json({ error: "You've reached the demo limit of 5 questions per hour. You can keep reading, or sign in and upload your own book." }, { status: 429 });
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(240000)]);
    if (input.action === "summary") {
      const segments = await BookSegment.find({ bookId, clerkId: userId }).select("content segmentIndex pageNumber -_id").sort({ segmentIndex: 1 }).lean() as SearchSegment[];
      if (!segments.length) return NextResponse.json({ error: "No extracted text was found. Please re-upload this book." }, { status: 422 });
      const text = await summarizeBook(book.title as string, segments, signal);
      // The ownership filter also handles deletion while generation was in progress.
      const saved = await Book.updateOne({ _id: bookId, clerkId: userId }, { $set: { summary: text, summaryModel: GEMINI_MODEL } });
      if (!saved.matchedCount) return NextResponse.json({ error: "This book was deleted." }, { status: 404 });
      return NextResponse.json({ text });
    }
    const result = await findBookSegments(bookId, book.clerkId as string, input.question, 6);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 503 });
    if (!result.data.length) return NextResponse.json({ text: "I could not find relevant passages in the uploaded book. Try a more specific name, topic, or phrase." });
    const text = await generateBookAnswer(`Answer this question about ${JSON.stringify(book.title)} using only the retrieved passages. Mention source pages where available. If they do not support an answer, say so.\n\n<question>${input.question}</question>\n\n<passages>\n${formatPassages(result.data)}\n</passages>`, signal);
    return NextResponse.json({ text });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const statusCode = error && typeof error === "object" && "statusCode" in error ? error.statusCode : undefined;
    console.error("Book AI request failed:", error instanceof Error ? error.name : "UnknownError", typeof statusCode === "number" ? statusCode : "");
    const message = code === "GEMINI_NOT_CONFIGURED" ? "Gemini is not configured. Add its API key and restart the app."
      : code === "BOOK_TOO_LONG" ? "This book is too large for a full summary. Ask questions about specific topics instead."
      : statusCode === 429 ? "Gemini's usage limit was reached. Check its quota or try again later."
      : statusCode === 401 || statusCode === 403 ? "Gemini could not authorize this request. Check the configured API key."
      : "Could not generate a response. Please try again.";
    return NextResponse.json({ error: message }, { status: statusCode === 429 ? 429 : 503 });
  }
}
