"use client";

import { Mic, MicOff, Sparkles, Send, ExternalLink } from "lucide-react";
import useVapi from "@/hooks/useVapi";
import { IBook } from "@/types";
import Image from "next/image";
import Transcript from "@/components/Transcript";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BookReader, { type BookReaderHandle } from "@/components/BookReader";
import BookAssistant from "@/components/BookAssistant";
import { getVoice } from "@/lib/utils";

const VapiControls = ({ book }: { book: IBook }) => {
  const {
    status,
    isActive,
    messages,
    currentMessage,
    currentUserMessage,
    duration,
    start,
    stop,
    clearError,
    limitError,
    isBillingError,
    maxDurationSeconds,
    sendQuestion,
  } = useVapi(book);
  const [question, setQuestion] = useState("");
  const readerRef = useRef<BookReaderHandle>(null);
  const busy = isActive || status === "connecting";
  const startVoice = (mode: "chat" | "summary" = "chat") => {
    readerRef.current?.stop();
    void start(mode);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusDisplay = () => {
    switch (status) {
      case "connecting":
        return { label: "Connecting...", color: "vapi-status-dot-connecting" };
      case "starting":
        return { label: "Starting...", color: "vapi-status-dot-starting" };
      case "listening":
        return { label: "Listening", color: "vapi-status-dot-listening" };
      case "thinking":
        return { label: "Thinking...", color: "vapi-status-dot-thinking" };
      case "speaking":
        return { label: "Speaking", color: "vapi-status-dot-speaking" };
      default:
        return { label: "Ready", color: "vapi-status-dot-ready" };
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <>
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        {book.isDemo && <div className="rounded-xl border border-[#212a3b]/10 bg-white p-4 text-sm leading-6">
          <p><strong>Try Bookified with a complete classic.</strong> Read, listen in your browser, view the summary, and ask a few AI questions without signing in. Sign in for live voice conversations and natural narration.</p>
          {book.sourceURL && <a href={book.sourceURL} target="_blank" rel="noopener noreferrer" className="underline">Original public-domain text and source credits</a>}
        </div>}
        {/* Header Card */}
        <div className="vapi-header-card">
          <div className="vapi-cover-wrapper">
            <Image
              src={book.coverURL || "/assets/book-cover.svg"}
              alt={book.title}
              width={120}
              height={180}
              className="vapi-cover-image !w-[120px] !h-auto"
              priority
            />
            <div className="vapi-mic-wrapper relative">
              {isActive && (status === "speaking" || status === "thinking") && (
                <div className="absolute inset-0 rounded-full bg-white animate-ping opacity-75" />
              )}
              <button
                onClick={() => { if (busy) void stop(); else startVoice(); }}
                aria-label={busy ? "End voice conversation" : "Start voice conversation"}
                className={`vapi-mic-btn shadow-md !w-[60px] !h-[60px] z-10 ${isActive ? "vapi-mic-btn-active" : "vapi-mic-btn-inactive"}`}
              >
                {isActive ? (
                  <Mic className="size-7 text-white" />
                ) : (
                  <MicOff className="size-7 text-[#212a3b]" />
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 flex-1">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold font-serif text-[#212a3b] mb-1">
                {book.title}
              </h1>
              <p className="text-[#3d485e] font-medium">by {book.author}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="vapi-status-indicator">
                <span className={`vapi-status-dot ${statusDisplay.color}`} />
                <span className="vapi-status-text">{statusDisplay.label}</span>
              </div>

              <div className="vapi-status-indicator">
                <span className="vapi-status-text">
                  Voice: {getVoice(book.persona).name}
                </span>
              </div>

              <div className="vapi-status-indicator">
                <span className="vapi-status-text">
                  {formatDuration(duration)}/
                  {formatDuration(maxDurationSeconds)}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => { if (busy) void stop(); else startVoice(); }}><Mic className="size-4" />{busy ? "End conversation" : "Ask by voice"}</Button>
              <Button variant="outline" disabled={busy} onClick={() => startVoice("summary")}><Sparkles className="size-4" />Summarize by voice</Button>
              <a href={book.fileURL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm underline"><ExternalLink className="size-4" />Open PDF</a>
            </div>
            <p className="text-sm text-muted-foreground">Ask questions aloud, request an AI overview, or read the original text below. Voice responses appear in the transcript.</p>
          </div>
        </div>

        {limitError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3 text-sm text-red-800">
          <p>{limitError}</p>
          <div className="flex gap-4">{isBillingError && <Link href="/subscriptions" className="underline">View plans</Link>}<button type="button" onClick={clearError} className="underline">Dismiss</button></div>
        </div>}

        <BookReader ref={readerRef} key={book._id} bookId={book._id} disabled={busy} />
        <BookAssistant bookId={book._id} initialSummary={book.summary} />

        <div className="vapi-transcript-wrapper">
          <div className="transcript-container min-h-[400px]">
            <Transcript
              messages={messages}
              currentMessage={currentMessage}
              currentUserMessage={currentUserMessage}
            />
          </div>
          <form className="flex gap-3 border-t border-[#212a3b]/10 p-4" onSubmit={(event) => {
            event.preventDefault();
            if (sendQuestion(question)) setQuestion("");
          }}>
            <Input aria-label="Question about your book" placeholder={isActive ? "Or type a question about this book…" : "Start a voice conversation to ask a question"} value={question} maxLength={1000} disabled={!isActive} onChange={(event) => setQuestion(event.target.value)} />
            <Button type="submit" aria-label="Send question" disabled={!isActive || !question.trim()}><Send className="size-4" /></Button>
          </form>
        </div>
      </div>
    </>
  );
};
export default VapiControls;
