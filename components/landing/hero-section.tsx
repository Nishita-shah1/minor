"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { FileLock2 } from "lucide-react";
import { InstallPrompt } from "@/components/pwa/install-prompt";

export function HeroSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [audioOn, setAudioOn] = useState(false);

  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [installVisible, setInstallVisible] = useState(false);

  const play = useCallback(async (withAudio: boolean) => {
    const video = videoRef.current;
    if (!video) return;
    if (withAudio) {
      video.currentTime = 0;
      setPreviewVersion((version) => version + 1);
    }
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
    // The silent animated preview is the default on all devices.
    // Start native video only after an explicit request for sound.
  }, []);

  return (
    <section className="relative isolate h-svh w-full overflow-hidden">
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="auto"
        poster="/video/echoleaks-hero-poster.jpg"
        onError={() => setPlaybackFailed(true)}
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-0 h-full w-full"
      >
        <source src="/video/echoleaks-hero.webm" type="video/webm" />
        <source
          src="/video/EchoLeaks-Hero-Section-Video.mp4"
          type="video/mp4"
        />
      </video>

      <Image key={previewVersion} src="/video/echoleaks-hero-preview.webp" alt="Animated EchoLeaks introduction" fill unoptimized priority className="pointer-events-none object-cover dark:brightness-[0.45] transition-[filter] duration-300 motion-reduce:transition-none" />
      <InstallPrompt onVisibilityChange={setInstallVisible} />
      <button
        type="button"
        onClick={() => void play(!audioOn)}
        className="absolute left-5 top-36 z-20 rounded-full border-2 border-black bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-md sm:top-auto sm:bottom-16"
      >
        {playbackFailed ? "Retry video" : audioOn ? "Mute video" : "Play with sound"}
      </button>
      {playbackFailed && (
        <p role="status" className="absolute left-5 top-48 z-20 rounded-xl border-2 border-black bg-background p-3 text-sm sm:top-auto sm:bottom-40">
          Video playback is unavailable. Try again or reload the page.
        </p>
      )}

      <h1 className="hero-animate hero-animate-1 text-hollow pointer-events-none absolute top-[4.5rem] left-1/2 z-10 -translate-x-1/2 font-head text-[clamp(3rem,10vw,6rem)] leading-none tracking-[-0.04em] sm:top-20">
        EchoLeaks
      </h1>

      <div className={`pointer-events-none absolute right-0 z-10 p-5 sm:bottom-8 sm:p-7 md:bottom-10 md:p-9 ${installVisible ? "bottom-[12rem]" : "bottom-6"}`}>
        <div className="pointer-events-auto flex w-[min(calc(100vw-2.5rem),20rem)] flex-col gap-2 rounded-2xl border-2 border-black bg-background p-4 text-left shadow-md sm:w-[22rem]">
          <div className="space-y-1.5">
            <p className="hero-animate hero-animate-2 text-sm leading-snug font-semibold tracking-tight text-foreground">
              Share confidential files. Know when they leak.
            </p>

            <p className="hero-animate hero-animate-3 text-xs leading-relaxed text-muted-foreground">
              Protect sensitive documents with invisible leak attribution and
              trace leaked content back to its source.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="hero-animate hero-animate-4 -mt-0 inline-flex w-full min-h-[3.25rem] items-center justify-center gap-3 rounded-full border-2 border-black bg-primary text-primary-foreground px-6 py-3.5 text-sm font-medium  shadow-md transition-all duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-lg active:translate-x-0.5 active:translate-y-0.5 active:shadow-none sm:-mt-1"
          >
            <FileLock2 className="size-5 shrink-0 stroke-[2.5]" aria-hidden />
            Protect a File
          </Link>
        </div>
      </div>

      <p className="hero-animate hero-animate-5 pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-xs tracking-[0.18em] text-foreground/60 uppercase">
        Every copy leaves an echo.
      </p>
    </section>
  );
}
