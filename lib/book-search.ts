import "server-only";

import mongoose from "mongoose";
import Book from "@/database/models/book.model";
import BookSegment from "@/database/models/book-segment.model";
import { connectToDatabase } from "@/database/mongoose";
import { escapeRegex, serializeData } from "@/lib/utils";

export interface SearchSegment {
  content: string;
  segmentIndex: number;
  pageNumber?: number;
}

export async function findBookSegments(bookId: string, clerkId: string, query: string, limit = 5) {
  if (!mongoose.isObjectIdOrHexString(bookId) || typeof query !== "string" || !query.trim() || query.length > 1000) {
    return { success: false, error: "Invalid search request", data: [] as SearchSegment[] };
  }
  try {
    await connectToDatabase();
    const book = await Book.findOne({ _id: bookId, $or: [{ clerkId }, { isDemo: true }], totalSegments: { $gt: 0 } }).lean();
    if (!book) return { success: false, error: "Book not found", data: [] as SearchSegment[] };
    const maxResults = Math.max(1, Math.min(10, Math.floor(limit) || 5));
    const filter = { bookId: new mongoose.Types.ObjectId(bookId), clerkId: book.clerkId };
    const selection = "content segmentIndex pageNumber -_id";
    let segments: SearchSegment[] = [];

    // Overview questions use representative passages across the book.
    if (query === "__overview__") {
      const count = Math.min(10, book.totalSegments as number);
      const indices = Array.from({ length: count }, (_, i) => count === 1 ? 0 : Math.round(i * ((book.totalSegments as number) - 1) / (count - 1)));
      segments = await BookSegment.find({ ...filter, segmentIndex: { $in: indices } }).select(selection).sort({ segmentIndex: 1 }).lean() as SearchSegment[];
    } else {
      try {
        segments = await BookSegment.find({ ...filter, $text: { $search: query } }).select(selection).sort({ score: { $meta: "textScore" } }).limit(maxResults).lean() as SearchSegment[];
      } catch {
        // Existing databases may not yet have a text index.
      }
      if (!segments.length) {
        const keywords = query.match(/[\p{L}\p{N}]{3,}/gu)?.slice(0, 20) ?? [];
        if (keywords.length) segments = await BookSegment.find({ ...filter, content: { $regex: keywords.map(escapeRegex).join("|"), $options: "i" } }).select(selection).sort({ segmentIndex: 1 }).limit(maxResults).lean() as SearchSegment[];
      }
    }
    return { success: true, data: serializeData(segments) };
  } catch (error) {
    console.error("Book search failed:", error);
    return { success: false, error: "Book search is temporarily unavailable.", data: [] as SearchSegment[] };
  }
}
