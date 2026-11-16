import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVoiceToken, verifyVoiceToken } from "@/lib/voice-token";

const access = { bookId: "507f1f77bcf86cd799439011", clerkId: "user_owner", sessionId: "507f1f77bcf86cd799439012", expires: Date.now() + 60000 };

describe("voice search authorization", () => {
  beforeEach(() => { vi.stubEnv("CLERK_SECRET_KEY", "test-secret-only"); vi.stubEnv("VAPI_WEBHOOK_SECRET", ""); });
  afterEach(() => vi.unstubAllEnvs());

  it("preserves the owner, book, and session in a signed token", () => {
    expect(verifyVoiceToken(createVoiceToken(access))).toEqual(access);
  });

  it("rejects a token whose book was changed", () => {
    const token = createVoiceToken(access);
    const tampered = Buffer.from(JSON.stringify({ ...access, bookId: "507f1f77bcf86cd799439099" })).toString("base64url");
    expect(verifyVoiceToken(`${tampered}.${token.split(".")[1]}`)).toBeNull();
  });

  it("rejects expired tokens", () => {
    expect(verifyVoiceToken(createVoiceToken({ ...access, expires: Date.now() - 1 }))).toBeNull();
  });

  it.each(["", "invalid", "payload.signature.extra", "e30=.short"]) ("rejects malformed token %j", (token) => {
    expect(verifyVoiceToken(token)).toBeNull();
  });

  it("invalidates old tokens when the signing key rotates", () => {
    const token = createVoiceToken(access);
    vi.stubEnv("VAPI_WEBHOOK_SECRET", "a-new-test-secret");
    expect(verifyVoiceToken(token)).toBeNull();
  });
});
