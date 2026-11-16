import "server-only";
import { createHmac } from "node:crypto";
import DemoUsage from "@/database/models/demo-usage.model";

export async function consumeDemoQuestion(request: Request, userId: string | null) {
  const windowMs = 60 * 60 * 1000;
  const window = Math.floor(Date.now() / windowMs);
  // Vercel sets the forwarding header. Other hosts share an anonymous allowance unless signed in.
  const ip = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "anonymous" : "local-demo";
  const identity = userId ? `user:${userId}` : `visitor:${ip.split(",")[0].trim()}`;
  const key = createHmac("sha256", process.env.CLERK_SECRET_KEY || "bookified-local-demo").update(`${identity}:${window}`).digest("hex");
  const usage = await DemoUsage.findOneAndUpdate({ key }, {
    $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 2) * windowMs) },
  }, { upsert: true, returnDocument: "after" });
  return usage.count <= 5;
}
