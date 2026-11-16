import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), book: vi.fn(), segment: vi.fn(), convert: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/database/mongoose", () => ({ connectToDatabase: async () => {} }));
vi.mock("@/database/models/book.model", () => ({ default: { findOne: mocks.book } }));
vi.mock("@/database/models/book-segment.model", () => ({ default: { findOne: mocks.segment } }));
vi.mock("@elevenlabs/elevenlabs-js", () => ({ ElevenLabsClient: class { textToSpeech = { convert: mocks.convert }; } }));
import { POST } from "@/app/api/books/[bookId]/narration/route";
const bookId = "507f1f77bcf86cd799439011";
const context = { params: Promise.resolve({ bookId }) };
const request = () => new Request(`https://bookified.test/api/books/${bookId}/narration`, { method: "POST", body: JSON.stringify({ segmentIndex: 0 }), headers: { "Content-Type": "application/json" } });

describe("natural narration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    mocks.auth.mockResolvedValue({ userId: "user_owner" });
    mocks.book.mockReturnValue({ lean: async () => ({ persona: "george", clerkId: "user_owner" }) });
    mocks.segment.mockReturnValue({ lean: async () => ({ content: "This is the actual stored passage." }) });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllEnvs());

  it("does not generate billable speech for signed-out visitors", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await POST(request(), context)).status).toBe(401);
    expect(mocks.convert).not.toHaveBeenCalled();
  });

  it("does not narrate a book owned by another account", async () => {
    mocks.book.mockReturnValue({ lean: async () => null });
    expect((await POST(request(), context)).status).toBe(404);
    expect(mocks.convert).not.toHaveBeenCalled();
  });

  it("narrates the stored passage rather than arbitrary client text", async () => {
    mocks.convert.mockResolvedValue(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([73, 68, 51])); controller.close(); } }));
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(mocks.convert.mock.calls[0][1].text).toBe("This is the actual stored passage.");
    expect(mocks.book.mock.calls[0][0].$or).toEqual([{ clerkId: "user_owner" }, { isDemo: true }]);
  });

  it("provides an actionable fallback when the voice provider rejects a key", async () => {
    mocks.convert.mockRejectedValue({ statusCode: 401 });
    const response = await POST(request(), context);
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("browser read-aloud");
  });
});
