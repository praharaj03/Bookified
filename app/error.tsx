"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="wrapper flex min-h-screen flex-col items-center justify-center gap-5 text-center">
    <h1 className="text-2xl font-serif font-bold">We could not load this page</h1>
    <p>Please check your connection and try again.</p>
    <button onClick={reset} className="underline">Try again</button>
    <Link href="/" className="underline">Back to library</Link>
  </main>;
}
