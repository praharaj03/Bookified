"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function BookAssistant({ bookId, initialSummary }: { bookId: string; initialSummary?: string }) {
  const [summary, setSummary] = useState(initialSummary || "");
  const [answer, setAnswer] = useState("");
  const [question, setQuestion] = useState("");
  const [answeredQuestion, setAnsweredQuestion] = useState("");
  const [loading, setLoading] = useState<"summary" | "question" | null>(null);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const ask = async (action: "summary" | "question") => {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(action);
    setError("");
    try {
      const response = await fetch(`/api/books/${bookId}/ai`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(action === "question" ? { question } : {}) }), signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || typeof result.text !== "string") throw new Error(result.error || "Could not generate a response.");
      if (action === "summary") setSummary(result.text);
      else { setAnswer(result.text); setAnsweredQuestion(question); setQuestion(""); }
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not generate a response.");
    } finally {
      if (!controller.signal.aborted) setLoading(null);
      controllerRef.current = null;
    }
  };

  return <section className="rounded-2xl border border-[#212a3b]/10 bg-white p-6 space-y-5" aria-label="AI book assistant">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-serif text-xl font-bold"><Sparkles className="size-5" /> Understand your book</h2>
      <Button onClick={() => void ask("summary")} disabled={!!loading || !!summary}>{loading === "summary" ? "Summarizing your book…" : summary ? "Summary ready" : "Generate summary"}</Button>
    </div>
    {summary && <div className="whitespace-pre-wrap leading-7" aria-label="Book summary">{summary}</div>}
    <form className="flex gap-3" onSubmit={(event) => { event.preventDefault(); if (question.trim()) void ask("question"); }}>
      <Input aria-label="Ask the AI about this book" placeholder="Ask a question about this book…" value={question} maxLength={1000} disabled={!!loading} onChange={(event) => setQuestion(event.target.value)} />
      <Button type="submit" disabled={!!loading || !question.trim()} aria-label="Ask question"><Send className="size-4" /></Button>
    </form>
    {loading === "question" && <p role="status">Finding passages and preparing your answer…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {answer && <div className="space-y-3" aria-live="polite"><p className="font-semibold">{answeredQuestion}</p><p className="whitespace-pre-wrap leading-7">{answer}</p></div>}
  </section>;
}
