import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), book: vi.fn(), search: vi.fn(), generate: vi.fn(), limit: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/database/mongoose", () => ({ connectToDatabase: async () => {} }));
vi.mock("@/database/models/book.model", () => ({ default: { findOne: mocks.book } }));
vi.mock("@/database/models/book-segment.model", () => ({ default: {} }));
vi.mock("@/lib/book-search", () => ({ findBookSegments: mocks.search }));
vi.mock("@/lib/gemini", () => ({ formatPassages: () => "A book passage", generateBookAnswer: mocks.generate, summarizeBook: vi.fn(), GEMINI_MODEL: "test-model" }));
vi.mock("@/lib/demo-usage", () => ({ consumeDemoQuestion: mocks.limit }));
import { POST } from "@/app/api/books/[bookId]/ai/route";

const bookId = "507f1f77bcf86cd799439011";
const context = { params: Promise.resolve({ bookId }) };
const request = (body: object) => new Request(`https://bookified.test/api/books/${bookId}/ai`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("public demo access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: null });
    mocks.book.mockReturnValue({ lean: async () => ({ isDemo: true, title: "Alice", clerkId: "bookified_public_demo", summary: "A prepared summary." }) });
    mocks.search.mockResolvedValue({ success: true, data: [{ content: "Alice meets a rabbit.", segmentIndex: 0 }] });
    mocks.generate.mockResolvedValue("She follows the White Rabbit.");
    mocks.limit.mockResolvedValue(true);
  });

  it("shows prepared demo summaries without sign-in or a paid AI request", async () => {
    const response = await POST(request({ action: "summary" }), context);
    expect(response.status).toBe(200);
    expect((await response.json()).text).toBe("A prepared summary.");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.book.mock.calls[0][0].isDemo).toBe(true);
  });

  it("lets visitors ask a grounded question about a demo", async () => {
    const response = await POST(request({ action: "question", question: "Who does Alice follow?" }), context);
    expect(response.status).toBe(200);
    expect((await response.json()).text).toContain("White Rabbit");
    expect(mocks.search).toHaveBeenCalledWith(bookId, "bookified_public_demo", "Who does Alice follow?", 6);
    expect(mocks.limit).toHaveBeenCalledOnce();
  });

  it("prevents unlimited anonymous AI requests", async () => {
    mocks.limit.mockResolvedValue(false);
    expect((await POST(request({ action: "question", question: "Another question?" }), context)).status).toBe(429);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("does not expose a private book to a visitor", async () => {
    mocks.book.mockReturnValue({ lean: async () => null });
    expect((await POST(request({ action: "summary" }), context)).status).toBe(404);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
