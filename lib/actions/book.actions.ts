"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import type { CreateBook, IBook, TextSegment } from "@/types";
import { connectToDatabase } from "@/database/mongoose";
import Book from "@/database/models/book.model";
import BookSegment from "@/database/models/book-segment.model";
import { escapeRegex, generateSlug, serializeData } from "@/lib/utils";
import { getUserPlan } from "@/lib/subscription.server";
import { PLAN_LIMITS } from "@/lib/subscription-constants";
import { MAX_FILE_SIZE, voiceOptions } from "@/lib/constants";
import { findBookSegments } from "@/lib/book-search";
import VoiceSession from "@/database/models/voice-session.model";
import { del } from "@vercel/blob";

const blobURL = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname);
}, "Invalid book storage URL");

const bookSchema = z.object({
  title: z.string().trim().min(1).max(100),
  author: z.string().trim().min(1).max(100),
  persona: z.string().refine((value) => Object.hasOwn(voiceOptions, value)).optional(),
  fileURL: blobURL,
  fileBlobKey: z.string().min(1).max(1000),
  coverURL: blobURL.optional(),
  coverBlobKey: z.string().max(1000).optional(),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE),
});

const segmentSchema = z.array(z.object({
  text: z.string().trim().min(1).max(100000),
  segmentIndex: z.number().int().min(0),
  pageNumber: z.number().int().positive().optional(),
  wordCount: z.number().int().positive(),
})).min(1).max(50);

export async function getAllBooks(search?: string) {
  try {
    const { userId } = await auth();
    await connectToDatabase();
    const access = userId ? { $or: [{ clerkId: userId }, { isDemo: true }] } : { isDemo: true };
    const query: Record<string, unknown> = { $and: [access], totalSegments: { $gt: 0 } };
    if (search?.trim()) {
      const regex = new RegExp(escapeRegex(search.trim().slice(0, 100)), "i");
      (query.$and as Record<string, unknown>[]).push({ $or: [{ title: regex }, { author: regex }] });
    }
    const books = await Book.find(query).sort({ createdAt: -1 }).lean();
    return { success: true, data: serializeData(books) as IBook[] };
  } catch (error) {
    console.error("Error fetching library:", error);
    return { success: false, error: "Could not load your library. Please try again." };
  }
}

export async function checkBookExists(title: string) {
  try {
    const { userId } = await auth();
    if (!userId) return { exists: false, error: "Please sign in." };
    const validTitle = z.string().trim().min(1).max(100).parse(title);
    await connectToDatabase();
    const book = await Book.findOne({
      clerkId: userId,
      title: new RegExp(`^${escapeRegex(validTitle)}$`, "i"),
      totalSegments: { $gt: 0 },
    }).lean();
    return { exists: !!book, book: book ? serializeData(book) as IBook : undefined };
  } catch (error) {
    console.error("Error checking book:", error);
    return { exists: false, error: "Could not check your library. Please try again." };
  }
}

export async function createBook(data: CreateBook) {
  try {
    const { userId } = await auth();
    if (!userId || userId !== data.clerkId) return { success: false, error: "Unauthorized" };
    const values = bookSchema.parse(data);
    if (!values.fileBlobKey.startsWith(`books/${userId}/`) ||
        decodeURIComponent(new URL(values.fileURL).pathname.slice(1)) !== values.fileBlobKey ||
        (values.coverURL && (!values.coverBlobKey?.startsWith(`books/${userId}/`) || decodeURIComponent(new URL(values.coverURL).pathname.slice(1)) !== values.coverBlobKey))) {
      return { success: false, error: "The uploaded files do not belong to this account." };
    }
    await connectToDatabase();
    const titleQuery = { clerkId: userId, title: new RegExp(`^${escapeRegex(values.title)}$`, "i") };
    const existing = await Book.findOne({ ...titleQuery, totalSegments: { $gt: 0 } }).lean();
    if (existing) return { success: true, alreadyExists: true, data: serializeData(existing) as IBook };

    const plan = await getUserPlan();
    const count = await Book.countDocuments({ clerkId: userId, totalSegments: { $gt: 0 } });
    if (count >= PLAN_LIMITS[plan].maxBooks) {
      return { success: false, error: `Your ${plan} plan allows ${PLAN_LIMITS[plan].maxBooks} book(s). Upgrade to upload more.`, isBillingError: true };
    }

    // A failed extraction can be retried without leaving an unusable book in the library.
    const pending = await Book.findOne({ ...titleQuery, totalSegments: 0 });
    if (pending) {
      await BookSegment.deleteMany({ bookId: pending._id, clerkId: userId });
      Object.assign(pending, values);
      await pending.save();
      return { success: true, data: serializeData(pending) as IBook };
    }
    const slug = `${generateSlug(values.title) || "book"}-${randomUUID()}`;
    const book = await Book.create({ ...values, clerkId: userId, slug, totalSegments: 0 });
    return { success: true, data: serializeData(book) as IBook };
  } catch (error) {
    console.error("Error creating book:", error);
    return { success: false, error: error instanceof z.ZodError ? "Invalid book details. Check your files and try again." : "Could not save the book. Please try again." };
  }
}

export async function getBookBySlug(slug: string) {
  try {
    const { userId } = await auth();
    await connectToDatabase();
    const access = userId ? { $or: [{ clerkId: userId }, { isDemo: true }] } : { isDemo: true };
    const book = await Book.findOne({ slug, ...access, totalSegments: { $gt: 0 } }).lean();
    if (!book) return { success: false, error: "Book not found" };
    return { success: true, data: serializeData(book) as IBook };
  } catch (error) {
    console.error("Error fetching book:", error);
    return { success: false, error: "Could not load the book. Please try again." };
  }
}

export async function saveBookSegments(bookId: string, clerkId: string, segments: TextSegment[]) {
  try {
    const { userId } = await auth();
    if (!userId || userId !== clerkId || !mongoose.isObjectIdOrHexString(bookId)) return { success: false, error: "Unauthorized" };
    const values = segmentSchema.parse(segments);
    await connectToDatabase();
    const book = await Book.exists({ _id: bookId, clerkId: userId, totalSegments: 0 });
    if (!book) return { success: false, error: "Pending book not found." };
    await BookSegment.bulkWrite(values.map(({ text, segmentIndex, pageNumber, wordCount }) => ({
      updateOne: {
        filter: { bookId, segmentIndex, clerkId: userId },
        update: { $set: { content: text, pageNumber, wordCount } },
        upsert: true,
      },
    })));
    return { success: true };
  } catch (error) {
    console.error("Error saving book text:", error);
    return { success: false, error: "Could not save book text. Please retry the upload." };
  }
}

export async function finishBookUpload(bookId: string, expectedSegments: number) {
  try {
    const { userId } = await auth();
    if (!userId || !mongoose.isObjectIdOrHexString(bookId)) return { success: false, error: "Unauthorized" };
    z.number().int().positive().max(100000).parse(expectedSegments);
    await connectToDatabase();
    const book = await Book.findOne({ _id: bookId, clerkId: userId, totalSegments: 0 });
    if (!book) return { success: false, error: "Pending book not found." };
    const count = await BookSegment.countDocuments({ bookId, clerkId: userId, segmentIndex: { $gte: 0, $lt: expectedSegments } });
    if (count !== expectedSegments) return { success: false, error: "Book text is incomplete. Please retry the upload." };
    const plan = await getUserPlan();
    const bookCount = await Book.countDocuments({ clerkId: userId, totalSegments: { $gt: 0 } });
    if (bookCount >= PLAN_LIMITS[plan].maxBooks) return { success: false, error: "Book limit reached. Please upgrade your plan.", isBillingError: true };
    book.totalSegments = expectedSegments;
    await book.save();
    revalidatePath("/");
    revalidatePath(`/books/${book.slug}`);
    return { success: true };
  } catch (error) {
    console.error("Error completing upload:", error);
    return { success: false, error: "Could not finish the upload. Please try again." };
  }
}

export async function searchBookSegments(bookId: string, query: string, limit = 5) {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized", data: [] };
  return findBookSegments(bookId, userId, query, limit);
}

export async function getBookText(bookId: string, segmentIndex = 0) {
  try {
    const { userId } = await auth();
    if (!mongoose.isObjectIdOrHexString(bookId)) return { success: false, error: "Book not found" };
    z.number().int().nonnegative().parse(segmentIndex);
    await connectToDatabase();
    const access = userId ? { $or: [{ clerkId: userId }, { isDemo: true }] } : { isDemo: true };
    const book = await Book.findOne({ _id: bookId, ...access, totalSegments: { $gt: 0 } }).lean();
    if (!book) return { success: false, error: "Book not found" };
    const segment = await BookSegment.findOne({ bookId, clerkId: book.clerkId, segmentIndex }).lean();
    if (!segment) return { success: false, error: "Passage not found" };
    return { success: true, text: segment.content as string, pageNumber: segment.pageNumber as number | undefined, totalSegments: book.totalSegments as number };
  } catch (error) {
    console.error("Error reading book:", error);
    return { success: false, error: "Could not load this passage. Please try again." };
  }
}

export async function deleteBook(bookId: string) {
  const { userId } = await auth();
  if (!userId || !mongoose.isObjectIdOrHexString(bookId)) return { success: false, error: "Unauthorized" };
  let deleted: IBook | null = null;
  try {
    await connectToDatabase();
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const book = await Book.findOneAndDelete({ _id: bookId, clerkId: userId, isDemo: { $ne: true } }, { session }).lean();
        if (!book) throw new Error("BOOK_NOT_FOUND");
        deleted = book as IBook;
        await BookSegment.deleteMany({ bookId, clerkId: userId }, { session });
        await VoiceSession.deleteMany({ bookId, clerkId: userId }, { session });
      });
    } finally { await session.endSession(); }
  } catch (error) {
    console.error("Book deletion failed:", error instanceof Error ? error.name : "UnknownError");
    return { success: false, error: error instanceof Error && error.message === "BOOK_NOT_FOUND" ? "Book not found." : "Could not delete the book. Please try again." };
  }

  // Only delete blobs recorded on the owned book, and preserve files referenced by another book.
  let storageWarning = false;
  const book = deleted as IBook | null;
  if (book) {
    const urls = [...new Set([book.fileURL, book.coverURL].filter(Boolean))];
    for (const url of urls) {
      try {
        if (!blobURL.safeParse(url).success) continue;
        const referenced = await Book.exists({ $or: [{ fileURL: url }, { coverURL: url }] });
        if (!referenced) await del(url);
      } catch { storageWarning = true; }
    }
  }
  revalidatePath("/");
  if (book) revalidatePath(`/books/${book.slug}`);
  return { success: true, warning: storageWarning ? "Book deleted. Some uploaded files could not be removed from storage." : undefined };
}
