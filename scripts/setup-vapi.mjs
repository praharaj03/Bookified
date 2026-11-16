import nextEnv from "@next/env";
import { readFile, writeFile } from "node:fs/promises";

nextEnv.loadEnvConfig(process.cwd());
const key = process.env.VAPI_PRIVATE_API_KEY;
if (!key) throw new Error("Set VAPI_PRIVATE_API_KEY in .env.local first.");

async function api(path, body) {
  const response = await fetch(`https://api.vapi.ai${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Vapi request failed with status ${response.status}`);
  return response.json();
}

try {
  const assistants = await api("/assistant");
  let assistant = assistants.find((item) => item.name === "Bookified Reading Companion");
  if (!assistant) {
    assistant = await api("/assistant", {
      name: "Bookified Reading Companion",
      model: { provider: "openai", model: "gpt-4.1-mini", messages: [{ role: "system", content: "You are Bookified's reading companion. The app supplies the current book context and search tool at call start. Answer using retrieved book passages and acknowledge missing information." }] },
      voice: { provider: "vapi", voiceId: "Elliot" },
      firstMessage: "Welcome to Bookified. What would you like to explore in your book?",
    });
    console.log("Created Bookified Reading Companion in the supplied Vapi account.");
  } else console.log("Using the existing Bookified Reading Companion.");

  const tokens = await api("/token");
  let publicToken = tokens.find((token) => token.tag === "public" && token.value === process.env.NEXT_PUBLIC_VAPI_API_KEY && token.restrictions?.enabled !== false && (!token.restrictions?.allowedAssistantIds?.length || token.restrictions.allowedAssistantIds.includes(assistant.id)));
  publicToken ??= tokens.find((token) => token.tag === "public" && token.value && token.restrictions?.enabled !== false && !token.restrictions?.allowedAssistantIds?.length);
  if (!publicToken) publicToken = await api("/token", { tag: "public", name: "Bookified Web", restrictions: { allowedAssistantIds: [assistant.id] } });
  if (!publicToken.value) throw new Error("Vapi did not return a public token value.");

  let text = await readFile(".env.local", "utf8");
  for (const [name, value] of Object.entries({ NEXT_PUBLIC_ASSISTANT_ID: assistant.id, NEXT_PUBLIC_VAPI_API_KEY: publicToken.value })) {
    const pattern = new RegExp(`^${name}=.*$`, "m");
    text = pattern.test(text) ? text.replace(pattern, () => `${name}=${value}`) : `${text}\n${name}=${value}\n`;
  }
  await writeFile(".env.local", text, "utf8");
  console.log("Updated the local public key and assistant ID. No calls were started.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Vapi setup failed.");
  process.exitCode = 1;
}
