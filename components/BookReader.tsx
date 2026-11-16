"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { BookOpen, Volume2, Pause, Play, Square, ChevronLeft, ChevronRight } from "lucide-react";
import { getBookText } from "@/lib/actions/book.actions";
import { Button } from "@/components/ui/button";
import NaturalNarration from "@/components/NaturalNarration";

export interface BookReaderHandle { stop: () => void }

export default function BookReader({ bookId, disabled, ref }: { bookId: string; disabled: boolean; ref?: Ref<BookReaderHandle> }) {
  const [index, setIndex] = useState(0);
  const [passage, setPassage] = useState<{ text: string; pageNumber?: number; totalSegments: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [retry, setRetry] = useState(0);
  const [audioReset, setAudioReset] = useState(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const generationRef = useRef(0);

  const stopReading = () => {
    generationRef.current++;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setReading(false);
    setPaused(false);
  };
  useImperativeHandle(ref, () => ({ stop: () => { stopReading(); setAudioReset((value) => value + 1); } }));

  useEffect(() => {
    let cancelled = false;
    getBookText(bookId, index).then((result) => {
      if (cancelled) return;
      if (result.success && result.text) {
        setPassage({ text: result.text, pageNumber: result.pageNumber, totalSegments: result.totalSegments ?? 1 });
        setError("");
      } else {
        setPassage(null);
        setError(result.error || "Could not load this passage.");
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) { setError("Could not load this passage. Please try again."); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [bookId, index, retry]);

  useEffect(() => () => {
    generationRef.current++;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const readAloud = () => {
    if (!passage || disabled) return;
    if (!("speechSynthesis" in window)) { setError("Read aloud is not supported in this browser. You can still read the text below."); return; }
    stopReading();
    setAudioReset((value) => value + 1);
    const generation = generationRef.current;
    const words = passage.text.split(/\s+/);
    let offset = 0;
    setReading(true);
    const speakNext = () => {
      if (generation !== generationRef.current) return;
      if (offset >= words.length) { setReading(false); utteranceRef.current = null; return; }
      // Short utterances avoid browser limits on long speech synthesis requests.
      const utterance = new SpeechSynthesisUtterance(words.slice(offset, offset + 35).join(" "));
      offset += 35;
      utteranceRef.current = utterance;
      utterance.onend = speakNext;
      utterance.onerror = (event) => {
        if (generation !== generationRef.current) return;
        setReading(false);
        setPaused(false);
        if (event.error !== "canceled" && event.error !== "interrupted") setError("Read aloud stopped. Please try again.");
      };
      window.speechSynthesis.speak(utterance);
    };
    speakNext();
  };

  const changePassage = (nextIndex: number) => {
    stopReading();
    setLoading(true);
    setError("");
    setIndex(nextIndex);
  };

  return (
    <section className="rounded-2xl border border-[#212a3b]/10 bg-white p-6 space-y-5" aria-label="Book reader">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-serif text-xl font-bold"><BookOpen className="size-5" /> Read your book</h2>
        <div className="flex flex-wrap gap-2">
          {!reading ? <Button variant="outline" onClick={readAloud} disabled={disabled || loading || !passage}><Volume2 className="size-4" /> Browser read-aloud</Button> : <>
            <Button variant="outline" onClick={() => {
              if (paused) window.speechSynthesis.resume(); else window.speechSynthesis.pause();
              setPaused(!paused);
            }}>{paused ? <Play className="size-4" /> : <Pause className="size-4" />}{paused ? "Resume" : "Pause"}</Button>
            <Button variant="outline" onClick={stopReading}><Square className="size-4" /> Stop reading</Button>
          </>}
        </div>
      </div>
      {disabled && <p className="text-sm text-muted-foreground">End the voice conversation to use read aloud.</p>}
      <NaturalNarration key={`${index}-${audioReset}`} bookId={bookId} segmentIndex={index} disabled={disabled || loading || !passage} onStart={stopReading} />
      {error && <div role="alert" className="space-y-2 text-sm text-red-700"><p>{error}</p><Button variant="outline" onClick={() => { setLoading(true); setError(""); setRetry((value) => value + 1); }}>Retry</Button></div>}
      <div aria-busy={loading} className="max-h-96 overflow-y-auto whitespace-pre-wrap text-base leading-8">
        {loading ? "Loading passage…" : passage?.text}
      </div>
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={() => changePassage(index - 1)} disabled={loading || index === 0}><ChevronLeft className="size-4" /> Previous</Button>
        <span className="text-sm text-muted-foreground" aria-live="polite">Passage {index + 1}{passage ? ` of ${passage.totalSegments}` : ""}{passage?.pageNumber ? ` · Page ${passage.pageNumber}` : ""}</span>
        <Button variant="outline" onClick={() => changePassage(index + 1)} disabled={loading || !passage || index >= passage.totalSegments - 1}>Next <ChevronRight className="size-4" /></Button>
      </div>
    </section>
  );
}
