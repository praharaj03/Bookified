"use server";

import { EndSessionResult, StartSessionResult } from "@/types";
import { connectToDatabase } from "@/database/mongoose";
import VoiceSession from "@/database/models/voice-session.model";
import { getCurrentBillingPeriodStart } from "@/lib/subscription-constants";
import { auth } from "@clerk/nextjs/server";
import mongoose from "mongoose";
import Book from "@/database/models/book.model";
import { createVoiceToken } from "@/lib/voice-token";

export const startVoiceSession = async (
  clerkId: string,
  bookId: string,
): Promise<StartSessionResult> => {
  try {
    const { userId } = await auth();
    if (!userId || userId !== clerkId || !mongoose.isObjectIdOrHexString(bookId)) return { success: false, error: "Unauthorized" };
    await connectToDatabase();
    if (!await Book.exists({ _id: bookId, $or: [{ clerkId: userId }, { isDemo: true }], totalSegments: { $gt: 0 } })) return { success: false, error: "Book not found." };

    // Limits/Plan to see whether a session is allowed.
    const { getUserPlan } = await import("@/lib/subscription.server");
    const { PLAN_LIMITS } =
      await import("@/lib/subscription-constants");

    const plan = await getUserPlan();
    const limits = PLAN_LIMITS[plan];
    const billingPeriodStart = getCurrentBillingPeriodStart();

    const sessionCount = await VoiceSession.countDocuments({
      clerkId,
      billingPeriodStart,
    });

    if (sessionCount >= limits.maxSessionsPerMonth) {
      const { revalidatePath } = await import("next/cache");
      revalidatePath("/");

      return {
        success: false,
        error: `You have reached the monthly session limit for your ${plan} plan (${limits.maxSessionsPerMonth}). Please upgrade for more sessions.`,
        isBillingError: true,
      };
    }

    const session = await VoiceSession.create({
      clerkId,
      bookId,
      startedAt: new Date(),
      billingPeriodStart,
      durationSeconds: 0,
    });

    return {
      success: true,
      sessionId: session._id.toString(),
      maxDurationMinutes: limits.maxDurationPerSession,
      searchToken: createVoiceToken({
        bookId, clerkId: userId, sessionId: session._id.toString(),
        expires: Date.now() + (limits.maxDurationPerSession + 2) * 60000,
      }),
    };
  } catch (e) {
    console.error("Error starting voice session", e);
    return {
      success: false,
      error: "Failed to start voice session. Please try again later.",
    };
  }
};

export const endVoiceSession = async (
  sessionId: string,
  durationSeconds: number,
): Promise<EndSessionResult> => {
  try {
    const { userId } = await auth();
    if (!userId || !mongoose.isObjectIdOrHexString(sessionId)) return { success: false, error: "Unauthorized" };
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) return { success: false, error: "Invalid session duration." };
    await connectToDatabase();
    const session = await VoiceSession.findOne({ _id: sessionId, clerkId: userId });
    if (!session) return { success: false, error: "Voice session not found." };
    if (session.endedAt) return { success: true };
    const elapsed = Math.max(0, Math.ceil((Date.now() - new Date(session.startedAt).getTime()) / 1000));
    const result = await VoiceSession.findOneAndUpdate({ _id: sessionId, clerkId: userId, endedAt: { $exists: false } }, {
      endedAt: new Date(),
      durationSeconds: Math.min(Math.floor(durationSeconds), elapsed),
    });

    if (!result) return { success: false, error: "Voice session not found." };

    return { success: true };
  } catch (e) {
    console.error("Error ending voice session", e);
    return {
      success: false,
      error: "Failed to end voice session. Please try again later.",
    };
  }
};
