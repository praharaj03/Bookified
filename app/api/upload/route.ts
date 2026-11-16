import { NextResponse } from "next/server";
import { handleUpload, HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@clerk/nextjs/server";
import { MAX_FILE_SIZE } from "@/lib/constants";
import { getUserPlan } from "@/lib/subscription.server";
import { PLAN_LIMITS } from "@/lib/subscription-constants";
import { connectToDatabase } from "@/database/mongoose";
import Book from "@/database/models/book.model";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      token: process.env.BLOB_READ_WRITE_TOKEN,
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const { userId } = await auth();

        if (!userId) {
          throw new Error("Unauthorized: User not authenticated");
        }
        if (!pathname.startsWith(`books/${userId}/`) || pathname.includes("..")) throw new Error("Invalid upload path");
        await connectToDatabase();
        const plan = await getUserPlan();
        const count = await Book.countDocuments({ clerkId: userId, totalSegments: { $gt: 0 } });
        if (count >= PLAN_LIMITS[plan].maxBooks) throw new Error("Book limit reached. Please upgrade your plan.");

        return {
          allowedContentTypes: [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/webp",
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_FILE_SIZE,
          tokenPayload: JSON.stringify({ userId }),
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "An unknown error occurred";
    const status = message.includes("Unauthorized") ? 401 : 500;
    console.error("Upload error", e);
    const clientMessage = status === 401 ? "Unauthorized" : "Upload failed";
    return NextResponse.json({ error: clientMessage }, { status });
  }
}
