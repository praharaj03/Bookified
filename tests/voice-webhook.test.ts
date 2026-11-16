import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ search: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/book-search", () => ({ findBookSegments: mocks.search }));
vi.mock("@/database/mongoose", () => ({ connectToDatabase: async () => {} }));
vi.mock("@/database/models/voice-session.model", () => ({ default: { exists: mocks.session } }));
import { POST } from "@/app/api/vapi/search-book/route";
import { createVoiceToken } from "@/lib/voice-token";

const access = { bookId: "507f1f77bcf86cd799439011", clerkId: "user_owner", sessionId: "507f1f77bcf86cd799439012", expires: Date.now() + 60000 };
function request(args: unknown = { query: "habits" }, token = createVoiceToken(access)) {
  return new Request("https://bookified.test/api/vapi/search-book", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: { toolCallList: [{ id: "call_1", function: { name: "searchBook", arguments: args } }] } }),
  });
}

describe("voice search webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLERK_SECRET_KEY", "test-signing-key");
    vi.stubEnv("VAPI_WEBHOOK_SECRET", "");
    mocks.session.mockResolvedValue({ _id: access.sessionId });
    mocks.search.mockResolvedValue({ success: true, data: [{ content: "Build small habits.", segmentIndex: 2, pageNumber: 4 }] });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects an unsigned request before searching", async () => {
    expect((await POST(request({}, ""))).status).toBe(401);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("revokes search access when a session has ended", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it.each([{ query: "habits" }, JSON.stringify({ query: "habits" })])("supports structured and JSON-string arguments", async (args) => {
    const response = await POST(request(args));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results[0]).toEqual({ toolCallId: "call_1", result: "[Passage 3, page 4]\nBuild small habits." });
    expect(mocks.search).toHaveBeenCalledWith(access.bookId, access.clerkId, "habits", 5);
  });

  it("does not allow the assistant to switch to a different book", async () => {
    const response = await POST(request({ query: "secrets", bookId: "507f1f77bcf86cd799439099" }));
    expect((await response.json()).results[0].result).toContain("current book");
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only questions instead of returning arbitrary passages", async () => {
    const response = await POST(request({ query: "   " }));
    expect((await response.json()).results[0].result).toContain("search query");
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("labels summary excerpts so the assistant does not claim to have read the whole book", async () => {
    const response = await POST(request({ query: "__overview__" }));
    expect((await response.json()).results[0].result).toContain("not the full text");
  });

  it("reports unavailable searches without inventing book content", async () => {
    mocks.search.mockResolvedValue({ success: false, error: "Search unavailable", data: [] });
    const response = await POST(request());
    expect((await response.json()).results[0].result).toBe("Search unavailable");
  });
});
