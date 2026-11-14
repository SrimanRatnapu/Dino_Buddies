"use client";

export const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.8;

/** Why the camera can't be used, as a speakable sentence. */
export class CameraError extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}

/** Time for auto-exposure and focus to settle after the camera starts. */
const WARMUP_MS = 600;
const START_TIMEOUT_MS = 5000;

function reasonFor(err: unknown): string {
  const name = (err as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera permission was turned off.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found.";
  if (name === "NotReadableError") return "Another app is using the camera.";
  return "The camera couldn't start.";
}

/** Throws a CameraError right away if this browser can't use the camera at all. */
export function cameraSupportError(): CameraError | null {
  if (typeof navigator === "undefined") return null;
  if (typeof navigator.mediaDevices?.getUserMedia === "function") return null;
  return new CameraError(
    window.isSecureContext ? "This browser can't use the camera." : "The camera needs a secure https connection.",
  );
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

/**
 * Turns the camera on and shows the live view in `video`. Resolves once frames
 * are arriving, with a function that turns the camera off again, or null if
 * aborted (the camera is already off then). Throws CameraError on failure.
 */
export async function openCamera(video: HTMLVideoElement, signal?: AbortSignal): Promise<(() => void) | null> {
  const unsupported = cameraSupportError();
  if (unsupported) throw unsupported;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (err) {
    throw new CameraError(reasonFor(err));
  }
  const stop = () => {
    stream.getTracks().forEach((t) => t.stop());
    if (video.srcObject === stream) video.srcObject = null;
  };

  try {
    if (signal?.aborted) {
      stop();
      return null;
    }
    video.srcObject = stream;
    await video.play().catch(() => {});
    const started = Date.now();
    while (!video.videoWidth && Date.now() - started < START_TIMEOUT_MS && !signal?.aborted) await wait(50, signal);
    if (signal?.aborted) {
      stop();
      return null;
    }
    if (!video.videoWidth) throw new CameraError("The camera didn't send a picture.");
    return stop;
  } catch (err) {
    stop();
    throw err;
  }
}

/**
 * Turns the camera on, lets exposure settle, takes one frame, and turns the
 * camera off again. The camera is never left running. Returns base64 JPEG
 * (no data: prefix), or null if aborted. Throws CameraError on failure.
 */
export async function captureOnce(video: HTMLVideoElement, signal?: AbortSignal): Promise<string | null> {
  const stop = await openCamera(video, signal);
  if (!stop) return null;
  try {
    await wait(WARMUP_MS, signal);
    if (signal?.aborted) return null;
    const frame = captureFrame(video);
    if (!frame) throw new CameraError("The camera didn't send a picture.");
    return frame;
  } finally {
    stop();
  }
}

export { wait as sleep };

function toJpegBase64(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxEdge = MAX_EDGE,
  quality = JPEG_QUALITY,
): string {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const g = canvas.getContext("2d");
  if (!g) throw new Error("no canvas");
  g.drawImage(source, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", quality);
  return url.slice(url.indexOf(",") + 1);
}

/** Current video frame as base64 JPEG (no data: prefix), or null if not ready. */
export function captureFrame(
  video: HTMLVideoElement | null,
  maxEdge = MAX_EDGE,
  quality = JPEG_QUALITY,
): string | null {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  return toJpegBase64(video, video.videoWidth, video.videoHeight, maxEdge, quality);
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
