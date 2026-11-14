"use client";

import { useEffect, useState, type RefObject } from "react";

export const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.8;

export type CameraState =
  | { status: "starting" }
  | { status: "ready" }
  | { status: "unavailable"; reason: string };

/** Starts the rear camera into `videoRef`, and restarts it if the track ends. */
export function useCamera(videoRef: RefObject<HTMLVideoElement | null>): CameraState {
  const [state, setState] = useState<CameraState>({ status: "starting" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState({
          status: "unavailable",
          reason: window.isSecureContext
            ? "This browser can't use the camera."
            : "The camera needs a secure https connection.",
        });
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => {});
        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          if (!cancelled) setAttempt((n) => n + 1);
        });
        setState({ status: "ready" });
      } catch (err) {
        const name = (err as DOMException)?.name;
        setState({
          status: "unavailable",
          reason:
            name === "NotAllowedError"
              ? "Camera permission was turned off."
              : name === "NotFoundError" || name === "OverconstrainedError"
                ? "No camera was found."
                : "The camera couldn't start.",
        });
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [videoRef, attempt]);

  // Mobile browsers may kill the camera in the background; restart on return.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const s = videoRef.current?.srcObject as MediaStream | null;
      const live = s?.getVideoTracks().some((t) => t.readyState === "live");
      if (!live) setAttempt((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [videoRef]);

  return state;
}

function toJpegBase64(source: CanvasImageSource, width: number, height: number): string {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const g = canvas.getContext("2d");
  if (!g) throw new Error("no canvas");
  g.drawImage(source, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return url.slice(url.indexOf(",") + 1);
}

/** Current video frame as base64 JPEG (no data: prefix), or null if not ready. */
export function captureFrame(video: HTMLVideoElement | null): string | null {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  return toJpegBase64(video, video.videoWidth, video.videoHeight);
}

/** A picked or captured photo file as base64 JPEG, resized to MAX_EDGE. */
export async function fileToBase64(file: File): Promise<string> {
  if ("createImageBitmap" in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const out = toJpegBase64(bmp, bmp.width, bmp.height);
      bmp.close();
      return out;
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return toJpegBase64(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}
