import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), model: vi.fn() }));
vi.mock("ai", () => ({ generateText: mocks.generate }));
vi.mock("@ai-sdk/google", () => ({ createGoogle: () => mocks.model }));
import { generateBookAnswer, summarizeBook } from "@/lib/gemini";

describe("Gemini book answers and complete summaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "test-key");
    mocks.generate.mockResolvedValue({ text: "A supported summary.", finishReason: "stop" });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("includes the end of a book rather than silently summarizing only its opening", async () => {
    const passages = [{ content: "Opening ideas", segmentIndex: 0, pageNumber: 1 }, { content: "The final conclusion", segmentIndex: 99, pageNumber: 200 }];
    expect(await summarizeBook("My Book", passages, new AbortController().signal)).toBe("A supported summary.");
    const prompt = mocks.generate.mock.calls[0][0].prompt;
    expect(prompt).toContain("Opening ideas");
    expect(prompt).toContain("The final conclusion");
    expect(prompt).toContain("page 200");
  });

  it("summarizes every section of a long book before generating the final summary", async () => {
    const passages = Array.from({ length: 3 }, (_, index) => ({ content: `SECTION_${index} ` + "a".repeat(500000), segmentIndex: index }));
    await summarizeBook("Long Book", passages, new AbortController().signal);
    const prompts = mocks.generate.mock.calls.map((call) => call[0].prompt as string);
    for (let index = 0; index < 3; index++) expect(prompts.some((prompt) => prompt.includes(`SECTION_${index}`))).toBe(true);
    expect(prompts).toHaveLength(4);
    expect(prompts.at(-1)).toContain("whole-book summary");
  });

  it("does not cache or present a response cut off by the provider token limit", async () => {
    mocks.generate.mockResolvedValue({ text: "This response was cut off", finishReason: "length" });
    await expect(generateBookAnswer("Question", new AbortController().signal)).rejects.toThrow("INCOMPLETE_AI_RESPONSE");
  });

  it("does not call an external provider without configuration", async () => {
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    await expect(generateBookAnswer("Question", new AbortController().signal)).rejects.toThrow("GEMINI_NOT_CONFIGURED");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
