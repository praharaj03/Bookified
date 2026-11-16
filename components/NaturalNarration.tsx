"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NaturalNarration({ bookId, segmentIndex, disabled, onStart }: { bookId: string; segmentIndex: number; disabled: boolean; onStart: () => void }) {
  const [audioURL, setAudioURL] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const urlRef = useRef("");
  const playerRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const player = playerRef;
    return () => {
      controllerRef.current?.abort();
      player.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const generate = async () => {
    if (controllerRef.current || disabled) return;
    onStart();
    setError("");
    setLoading(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const response = await fetch(`/api/books/${bookId}/narration`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ segmentIndex }), signal: controller.signal });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Natural narration is unavailable.");
      }
      const audio = await response.blob();
      if (controller.signal.aborted) return;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(audio);
      setAudioURL(urlRef.current);
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load narration.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      controllerRef.current = null;
    }
  };

  return <div className="space-y-3">
    <Button variant="outline" onClick={() => void generate()} disabled={disabled || loading || !!audioURL}><Volume2 className="size-4" />{loading ? "Preparing natural narration…" : audioURL ? "Narration ready" : "Natural read-aloud"}</Button>
    {audioURL && <audio ref={playerRef} src={audioURL} controls preload="metadata" className="w-full" aria-label="Natural narration of the current passage" onPlay={onStart} onError={() => setError("Audio could not be played. Try browser read-aloud.")} />}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
