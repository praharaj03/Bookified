import { NextResponse } from "next/server";
import { findBookSegments } from "@/lib/book-search";
import { verifyVoiceToken } from "@/lib/voice-token";
import { connectToDatabase } from "@/database/mongoose";
import VoiceSession from "@/database/models/voice-session.model";

function parseArgs(args: unknown): Record<string, unknown> {
  if (typeof args === "string") {
    try { return parseArgs(JSON.parse(args)); } catch { return {}; }
  }
  return args && typeof args === "object" && !Array.isArray(args) ? args as Record<string, unknown> : {};
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const access = verifyVoiceToken(token);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try {
    await connectToDatabase();
    const session = await VoiceSession.exists({ _id: access.sessionId, bookId: access.bookId, clerkId: access.clerkId, endedAt: { $exists: false } });
    if (!session) return NextResponse.json({ error: "Voice session has ended" }, { status: 401 });

    const search = async (name: unknown, rawArgs: unknown) => {
      if (name !== "searchBook") return "Unknown function";
      const args = parseArgs(rawArgs);
      if (args.bookId && args.bookId !== access.bookId) return "This session can only search the current book.";
      if (typeof args.query !== "string" || !args.query.trim() || args.query.length > 1000) return "Please provide a search query of at most 1000 characters.";
      const result = await findBookSegments(access.bookId, access.clerkId, args.query, 5);
      if (!result.success) return result.error || "Book search is unavailable. Please try again.";
      if (!result.data.length) return "No matching information was found in the uploaded book. Do not invent an answer.";
      const passages = result.data.map((segment) => `[Passage ${segment.segmentIndex + 1}${segment.pageNumber ? `, page ${segment.pageNumber}` : ""}]\n${segment.content}`).join("\n\n");
      return args.query === "__overview__" ? `These are representative excerpts across the book, not the full text. Clearly state that your overview is based on these excerpts.\n\n${passages}` : passages;
    };

    const legacyCall = body?.message?.functionCall;
    if (legacyCall) return NextResponse.json({ result: await search(legacyCall.name, legacyCall.parameters) });

    const calls = body?.message?.toolCallList ?? body?.message?.toolCalls;
    if (!Array.isArray(calls) || !calls.length || calls.length > 10 || calls.some((call) => !call || typeof call.id !== "string")) {
      return NextResponse.json({ error: "Expected between 1 and 10 tool calls with IDs" }, { status: 400 });
    }
    const results = [];
    for (const call of calls) results.push({ toolCallId: call.id, result: await search(call.function?.name, call.function?.arguments ?? call.function?.parameters) });
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Voice book search failed:", error);
    return NextResponse.json({ error: "Book search is temporarily unavailable" }, { status: 503 });
  }
}
