# Bookified

Upload a PDF, generate a written Gemini summary, ask book questions, read its extracted text, listen to natural ElevenLabs narration, and discuss the book with an AI voice companion. Voice answers appear in a live transcript. Library editing lets you delete a book, its extracted text, session records, and uploaded files.

## Public demo library

Visitors can read two complete classics without signing in: [Alice's Adventures in Wonderland](https://www.gutenberg.org/ebooks/11) and [The Adventures of Sherlock Holmes](https://www.gutenberg.org/ebooks/1661). Their complete PDFs include original cover designs, source credits, and Gutenberg license text. Unmodified source text files are kept under `public/demo/`. Texts were retrieved from the GITenberg mirror when Gutenberg's main download server returned 503.

Run `npm run demo:seed` after setting up MongoDB to import or update only these demo records and assets. Personal uploads are preserved. Demo summaries are prepared text, so viewing them makes no AI request. Visitors can ask five Gemini questions per hour; the limit is shared for anonymous visitors on local/non-Vercel hosts and uses the platform's forwarding address on Vercel. Signed-in users have their own demo allowance. Browser speech works without signing in; live voice and natural narration require sign-in. Demo books cannot be deleted through library editing.

## Run locally

Use Node.js 22 or newer.

```powershell
npm install
Copy-Item .env.example .env.local
# Fill in .env.local with your service credentials.
npm run dev
```

Open http://localhost:3000. Existing `.env.local` files should be kept; only copy the example for a new installation.

Required services:

- **Clerk:** publishable and secret keys from the same application. Sign-in and sign-up routes are included. Enable Clerk Billing and create `standard` and `pro` plans if you want paid tiers; otherwise accounts use the free limits.
- **MongoDB:** a reachable connection URI. Text indexes are created by Mongoose; keyword search also works when an existing database has no text index.
- Run `npm run db:prepare` to create any missing `books`, `booksegments`, and `voicesessions` collections in the `bookified` database. Existing records are preserved.
- **Vercel Blob:** a read/write token for a **public** store. PDFs upload directly from the browser, so large files do not pass through a server function. Files use random suffixes and account-specific paths. Library records and extracted text are scoped to the signed-in owner; stored PDFs and covers remain accessible to anyone with their Blob URLs.
- **Gemini:** set `GOOGLE_GEMINI_API_KEY`. The default text model is `gemini-3.8-flash`; `GEMINI_MODEL` can select another available model. Written summaries include all extracted passages, using section summaries for long books, and are cached on the book. Book questions retrieve relevant passages and cite available page numbers. Text over six million characters must be explored using specific questions.
- **ElevenLabs:** set `ELEVENLABS_API_KEY` with text-to-speech permission. Natural read-aloud generates audio only when requested and provides a standard audio player for the current passage. The default model is `eleven_v4`; `ELEVENLABS_TTS_MODEL` can override it. Available premade choices are George, Daniel, and Sarah; retired/unknown choices on older uploads fall back to George. Browser read-aloud remains available without provider credits.
- **Vapi:** a public web API key and assistant ID from the same Vapi organization. The app supplies the book-search tool, reading prompt, OpenAI `gpt-4.1-mini` model, ElevenLabs voice, and per-call duration limit. Ensure the account has credits and access to the model and voice provider. Set the server-only `VAPI_PRIVATE_API_KEY` and run `npm run vapi:setup` to create or reuse Bookified's assistant and select a matching public key. No calls are started by this setup command.

## Voice development

Vapi's servers must reach the book-search endpoint. Set `NEXT_PUBLIC_BASE_URL` to your app's public **HTTPS** address, or an HTTPS development tunnel forwarding to port 3000. Restart the app after changing any `NEXT_PUBLIC_*` variable. A localhost URL cannot receive Vapi webhooks. Protected previews must allow the webhook request through their deployment protection.

On Windows, `npm run voice:tunnel` downloads Cloudflare's official tunnel client if needed and starts a temporary HTTPS tunnel to a small local proxy. Only `/api/vapi/search-book` is forwarded; other routes return 404. The helper updates `NEXT_PUBLIC_BASE_URL` in place. Keep the helper running and refresh the app after its development environment reloads. The URL is temporary and changes when the helper restarts; production should use a stable deployed URL.

The app attaches a short-lived token to the search tool automatically. Tokens only permit searches of the current book during its active voice session. You do not need to manually configure a `searchBook` tool in the Vapi dashboard. `VAPI_WEBHOOK_SECRET` optionally supplies a separate signing key; otherwise the Clerk secret is used.

Allow microphone access in your browser. Voice conversations and voice summaries use Vapi session allowance. Voice summaries use representative excerpts and disclose that limitation; written Gemini summaries process all extracted sections. Natural narration uses ElevenLabs credits. Browser read-aloud uses browser speech synthesis and does not use provider credits or Vapi session allowance.

For ElevenLabs onboarding, run `npx -y @elevenlabs/cli@latest onboard init` and follow its prompts. The SDK reads its key on the server; it is never sent to the browser. A voice-list request needs `voices_read` permission, separate from text-to-speech permission.

## Supported books

- Text-based PDFs up to 50 MB.
- Optional JPEG, PNG, or WebP cover up to 10 MB; otherwise the first page becomes the cover.
- Image-only scans require OCR before upload. Empty, invalid, and password-protected files show a parsing error.
- The reader shows one passage at a time with page numbers, Previous/Next controls, and read-aloud pause/resume/stop. Older uploads retain the page information and passage boundaries saved at their original upload.
- Failed uploads remain pending rather than appearing as readable books. Re-uploading the same title retries the pending book; completed duplicate titles open the existing book in your own library.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

The PDF worker is copied from the installed `pdfjs-dist` package during install and before development/build. No Google Fonts request is required to build the application. Run the type check after a build has completed, rather than concurrently with a build that regenerates `.next/types`.
