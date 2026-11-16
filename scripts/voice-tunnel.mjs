import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const port = Number(process.env.VOICE_PROXY_PORT || 8788);
const appPort = Number(process.env.PORT || 3000);
const binary = new URL(process.platform === "win32" ? "../.tmp/cloudflared.exe" : "../.tmp/cloudflared", import.meta.url);
if (process.platform !== "win32") throw new Error("This helper currently supports Windows. Run cloudflared manually on other platforms.");
await mkdir(new URL("../.tmp/", import.meta.url), { recursive: true });
try { await access(binary); }
catch {
  console.log("Downloading cloudflared from Cloudflare's official GitHub release…");
  const response = await fetch("https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe");
  if (!response.ok) throw new Error(`Cloudflare download failed (${response.status}).`);
  await writeFile(binary, new Uint8Array(await response.arrayBuffer()));
}

// Only expose the authenticated voice-search webhook, not the rest of the local app.
const proxy = createServer(async (request, response) => {
  if (request.url?.split("?")[0] !== "/api/vapi/search-book" || !["GET", "POST"].includes(request.method || "")) {
    response.writeHead(404); response.end("Not found"); return;
  }
  try {
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
      length += chunk.length;
      if (length > 2_000_000) { response.writeHead(413); response.end("Request too large"); return; }
      chunks.push(chunk);
    }
    const upstream = await fetch(`http://127.0.0.1:${appPort}/api/vapi/search-book`, {
      method: request.method,
      headers: { "Content-Type": "application/json", ...(request.headers.authorization ? { Authorization: request.headers.authorization } : {}) },
      ...(request.method === "POST" ? { body: Buffer.concat(chunks) } : {}),
      signal: AbortSignal.timeout(30000),
    });
    response.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store" });
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch { response.writeHead(502); response.end("Local Bookified server is unavailable."); }
});
await new Promise((resolve, reject) => { proxy.once("error", reject); proxy.listen(port, "127.0.0.1", resolve); });
const child = spawn(fileURLToPath(binary), ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate", "--protocol", "http2"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let configuredURL = "";
let pending = "";
async function configureURL(url) {
  const envPath = new URL("../.env.local", import.meta.url);
  let env = await readFile(envPath, "utf8");
  const pattern = /^NEXT_PUBLIC_BASE_URL=.*$/m;
  env = pattern.test(env) ? env.replace(pattern, () => `NEXT_PUBLIC_BASE_URL=${url}`) : `${env}\nNEXT_PUBLIC_BASE_URL=${url}\n`;
  await writeFile(envPath, env, "utf8");
  console.log(`Voice callback ready: ${url}/api/vapi/search-book`);
  console.log("Updated .env.local. Refresh Bookified after the dev server reloads its environment.");
  console.log("Keep this process running for local voice search. Press Ctrl+C to stop it.");
}
function onOutput(data) {
  pending += data.toString();
  const match = pending.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && !configuredURL) { configuredURL = match[0]; void configureURL(configuredURL).catch((error) => console.error(error.message)); }
  if (/ERR/.test(data.toString())) console.error(data.toString().trim());
  if (pending.length > 10000) pending = pending.slice(-5000);
}
child.stdout.on("data", onOutput);
child.stderr.on("data", onOutput);
child.on("error", (error) => { console.error(error.message); proxy.close(); process.exitCode = 1; });
child.on("exit", (code) => { proxy.close(); if (code) console.error(`Voice tunnel stopped (${code}).`); });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { child.kill(); proxy.close(); });
