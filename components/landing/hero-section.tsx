"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileLock2 } from "lucide-react";

export function HeroSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [audioOn, setAudioOn] = useState(false);

  const [playbackFailed, setPlaybackFailed] = useState(false);

  const play = useCallback(async (withAudio: boolean) => {
    const video = videoRef.current;
    if (!video) return;
    if (video.error) video.load();
    video.muted = !withAudio;
    try {
      await video.play();
      setAudioOn(withAudio);
      setPlaybackFailed(false);
    } catch {
      video.muted = true;
      setAudioOn(false);
      setPlaybackFailed(true);
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    void video.play().catch(() => setPlaybackFailed(true));
  }, []);

  return (
    <section className="relative h-svh w-full overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/video/echoleaks-hero-poster.jpg"
        onError={() => setPlaybackFailed(true)}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      >
        <source src="/video/echoleaks-hero.webm" type="video/webm" />
        <source
          src="/video/EchoLeaks-Hero-Section-Video.mp4"
          type="video/mp4"
        />
      </video>

      <button
        type="button"
        onClick={() => void play(!audioOn)}
        className="absolute bottom-16 left-5 z-20 rounded-full border-2 border-black bg-primary px-4 py-2 text-sm font-semibold shadow-md"
      >
        {playbackFailed ? "Retry video" : audioOn ? "Mute video" : "Play with sound"}
      </button>
      {playbackFailed && (
        <p role="status" className="absolute bottom-28 left-5 z-20 rounded-xl border-2 border-black bg-background p-3 text-sm">
          Video playback is unavailable. Try again or reload the page.
        </p>
      )}

      <h1 className="hero-animate hero-animate-1 text-hollow pointer-events-none absolute top-[4.5rem] left-1/2 z-10 -translate-x-1/2 font-head text-[clamp(3rem,10vw,6rem)] leading-none tracking-[-0.04em] sm:top-20">
        EchoLeaks
      </h1>

      <div className="pointer-events-none absolute right-0 bottom-6 z-10 p-5 sm:bottom-8 sm:p-7 md:bottom-10 md:p-9">
        <div className="pointer-events-auto flex w-[min(calc(100vw-2.5rem),20rem)] flex-col gap-2 text-left sm:w-[22rem]">
          <div className="space-y-1.5">
            <p className="hero-animate hero-animate-2 text-sm leading-snug font-semibold tracking-tight text-black">
              Share confidential files. Know when they leak.
            </p>

            <p className="hero-animate hero-animate-3 text-xs leading-relaxed text-black/70">
              Protect sensitive documents with invisible leak attribution and
              trace leaked content back to its source.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="hero-animate hero-animate-4 -mt-0 inline-flex w-full min-h-[3.25rem] items-center justify-center gap-3 rounded-full border-2 border-black bg-primary px-6 py-3.5 text-sm font-medium text-black shadow-md transition-all duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-lg active:translate-x-0.5 active:translate-y-0.5 active:shadow-none sm:-mt-1"
          >
            <FileLock2 className="size-5 shrink-0 stroke-[2.5]" aria-hidden />
            Protect a File
          </Link>
        </div>
      </div>

      <p className="hero-animate hero-animate-5 pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-xs tracking-[0.18em] text-black/45 uppercase">
        Every copy leaves an echo.
      </p>
    </section>
  );
}
