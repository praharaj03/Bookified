import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

interface VoiceAccess {
  bookId: string;
  clerkId: string;
  sessionId: string;
  expires: number;
}

function signature(payload: string) {
  const secret = process.env.VAPI_WEBHOOK_SECRET || process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("Voice authentication is not configured.");
  return createHmac("sha256", secret).update(`bookified-voice:${payload}`).digest("base64url");
}

export function createVoiceToken(access: VoiceAccess) {
  const payload = Buffer.from(JSON.stringify(access)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyVoiceToken(token: string): VoiceAccess | null {
  try {
    if (!token || token.length > 2048) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payload, supplied] = parts;
    const expected = Buffer.from(signature(payload));
    const actual = Buffer.from(supplied);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const access = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as VoiceAccess;
    if (typeof access.expires !== "number" || access.expires <= Date.now() ||
        typeof access.bookId !== "string" || !/^[a-f\d]{24}$/i.test(access.bookId) ||
        typeof access.sessionId !== "string" || !/^[a-f\d]{24}$/i.test(access.sessionId) ||
        typeof access.clerkId !== "string" || !access.clerkId) return null;
    return access;
  } catch {
    return null;
  }
}
