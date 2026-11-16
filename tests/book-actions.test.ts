import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), connect: vi.fn(), plan: vi.fn(), revalidate: vi.fn(),
  books: { find: vi.fn(), findOne: vi.fn(), exists: vi.fn(), create: vi.fn(), countDocuments: vi.fn(), findOneAndDelete: vi.fn() },
  segments: { bulkWrite: vi.fn(), countDocuments: vi.fn(), deleteMany: vi.fn(), findOne: vi.fn() },
  sessions: { deleteMany: vi.fn() }, deleteBlob: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/database/mongoose", () => ({ connectToDatabase: mocks.connect }));
vi.mock("@/database/models/book.model", () => ({ default: mocks.books }));
vi.mock("@/database/models/book-segment.model", () => ({ default: mocks.segments }));
vi.mock("@/lib/subscription.server", () => ({ getUserPlan: mocks.plan }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/database/models/voice-session.model", () => ({ default: mocks.sessions }));
vi.mock("@vercel/blob", () => ({ del: mocks.deleteBlob }));

import { getAllBooks, checkBookExists, createBook, saveBookSegments, finishBookUpload, getBookText, deleteBook } from "@/lib/actions/book.actions";
import mongoose from "mongoose";

const bookId = "507f1f77bcf86cd799439011";
const segment = { text: "A passage from this book.", segmentIndex: 0, pageNumber: 1, wordCount: 5 };

describe("book ownership and upload completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user_owner" });
    mocks.plan.mockResolvedValue("free");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("only returns public demo books to signed-out visitors", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    mocks.books.find.mockReturnValue({ sort: () => ({ lean: async () => [] }) });
    expect(await getAllBooks()).toEqual({ success: true, data: [] });
    expect(mocks.books.find.mock.calls[0][0].$and).toEqual([{ isDemo: true }]);
  });

  it("keeps search results inside the owner's completed library", async () => {
    mocks.books.find.mockReturnValue({ sort: () => ({ lean: async () => [] }) });
    await getAllBooks("[a+b]");
    const filter = mocks.books.find.mock.calls[0][0];
    expect(filter.$and[0]).toEqual({ $or: [{ clerkId: "user_owner" }, { isDemo: true }] });
    expect(filter.totalSegments).toEqual({ $gt: 0 });
    expect(filter.$and[1].$or[0].title.test("[a+b]")).toBe(true);
    expect(filter.$and[1].$or[0].title.test("ab")).toBe(false);
  });

  it("does not mistake another account's same-title book for a duplicate", async () => {
    mocks.books.findOne.mockReturnValue({ lean: async () => null });
    expect((await checkBookExists("My Book")).exists).toBe(false);
    expect(mocks.books.findOne.mock.calls[0][0].clerkId).toBe("user_owner");
  });

  it("rejects an upload with a forged account ID before saving anything", async () => {
    expect((await createBook({ clerkId: "user_victim" } as Parameters<typeof createBook>[0])).success).toBe(false);
    expect(mocks.books.create).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("rejects segment writes for another account", async () => {
    expect((await saveBookSegments(bookId, "user_victim", [segment])).success).toBe(false);
    expect(mocks.segments.bulkWrite).not.toHaveBeenCalled();
  });

  it("prevents overwriting text in an already completed book", async () => {
    mocks.books.exists.mockResolvedValue(null);
    expect((await saveBookSegments(bookId, "user_owner", [segment])).success).toBe(false);
    expect(mocks.segments.bulkWrite).not.toHaveBeenCalled();
  });

  it("keeps an incomplete book pending when a text batch is missing", async () => {
    const save = vi.fn();
    mocks.books.findOne.mockResolvedValue({ _id: bookId, totalSegments: 0, save });
    mocks.segments.countDocuments.mockResolvedValue(1);
    expect((await finishBookUpload(bookId, 2)).success).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("publishes a complete upload and refreshes the library", async () => {
    const pending = { _id: bookId, slug: "my-book", totalSegments: 0, save: vi.fn() };
    mocks.books.findOne.mockResolvedValue(pending);
    mocks.segments.countDocuments.mockResolvedValue(2);
    mocks.books.countDocuments.mockResolvedValue(0);
    expect((await finishBookUpload(bookId, 2)).success).toBe(true);
    expect(pending.totalSegments).toBe(2);
    expect(pending.save).toHaveBeenCalledOnce();
    expect(mocks.revalidate).toHaveBeenCalledWith("/");
  });

  it("does not read passages from a book outside the signed-in library", async () => {
    mocks.books.findOne.mockReturnValue({ lean: async () => null });
    expect((await getBookText(bookId)).success).toBe(false);
    expect(mocks.segments.findOne).not.toHaveBeenCalled();
  });

  it("does not let a signed-out visitor delete a book or its files", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await deleteBook(bookId)).success).toBe(false);
    expect(mocks.books.findOneAndDelete).not.toHaveBeenCalled();
    expect(mocks.deleteBlob).not.toHaveBeenCalled();
  });

  it("keeps deletion scoped to the owner and removes related text and voice sessions", async () => {
    const session = { withTransaction: async (operation: () => Promise<void>) => operation(), endSession: vi.fn() };
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session as unknown as Awaited<ReturnType<typeof mongoose.startSession>>);
    const fileURL = "https://store.public.blob.vercel-storage.com/book.pdf";
    mocks.books.findOneAndDelete.mockReturnValue({ lean: async () => ({ _id: bookId, slug: "my-book", fileURL }) });
    mocks.books.exists.mockResolvedValue(null);
    expect((await deleteBook(bookId)).success).toBe(true);
    expect(mocks.books.findOneAndDelete).toHaveBeenCalledWith({ _id: bookId, clerkId: "user_owner", isDemo: { $ne: true } }, { session });
    expect(mocks.segments.deleteMany).toHaveBeenCalledWith({ bookId, clerkId: "user_owner" }, { session });
    expect(mocks.sessions.deleteMany).toHaveBeenCalledWith({ bookId, clerkId: "user_owner" }, { session });
    expect(mocks.deleteBlob).toHaveBeenCalledWith(fileURL);
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it("does not remove storage files still referenced by another book", async () => {
    const session = { withTransaction: async (operation: () => Promise<void>) => operation(), endSession: vi.fn() };
    vi.spyOn(mongoose, "startSession").mockResolvedValue(session as unknown as Awaited<ReturnType<typeof mongoose.startSession>>);
    mocks.books.findOneAndDelete.mockReturnValue({ lean: async () => ({ _id: bookId, slug: "my-book", fileURL: "https://store.public.blob.vercel-storage.com/shared.pdf" }) });
    mocks.books.exists.mockResolvedValue({ _id: "another-book" });
    expect((await deleteBook(bookId)).success).toBe(true);
    expect(mocks.deleteBlob).not.toHaveBeenCalled();
  });
});
