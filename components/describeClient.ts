// Client for POST /api/describe (contract v1). Always resolves; failures come
// back as speakable messages so the UI can read them aloud.

import type { ApiError, DescribeRequest, DescribeSuccess } from "@/shared/contract";
import { mockDescribe } from "./mockDescribe";

const TIMEOUT_MS = 25000;

export type DescribeOutcome =
  | { ok: true; data: DescribeSuccess }
  | { ok: false; error: ApiError["error"] };

function fail(code: string, message: string): DescribeOutcome {
  return { ok: false, error: { code, message } };
}

/** Client-side mock, enabled with ?mock=1 in the URL (for UI work before /api/describe exists). */
export function clientMockEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("mock") === "1";
}

function isSuccess(x: unknown): x is DescribeSuccess {
  const o = x as Record<string, unknown>;
  return (
    !!o &&
    typeof o.subject === "string" &&
    typeof o.description === "string" &&
    (o.confidence === "high" || o.confidence === "medium" || o.confidence === "low")
  );
}

function normalize(d: DescribeSuccess): DescribeSuccess {
  return {
    subject: d.subject,
    confidence: d.confidence,
    description: d.description,
    size_comparison: d.size_comparison ?? "",
    fun_fact: d.fun_fact ?? "",
    caveats: d.caveats ?? "",
  };
}

export async function describeImage(req: DescribeRequest, signal: AbortSignal): Promise<DescribeOutcome> {
  if (clientMockEnabled()) return mockDescribe(req, signal);

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal.addEventListener("abort", onAbort);

  try {
    const res = await fetch("/api/describe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: timeout.signal,
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok && isSuccess(body)) return { ok: true, data: normalize(body) };
    const err = (body as ApiError | null)?.error;
    if (err?.message) return { ok: false, error: err };
    if (res.status === 404) return fail("service_missing", "The describe service isn't running yet.");
    return fail("bad_response", "Something went wrong on my side. Please try again.");
  } catch {
    if (signal.aborted) return fail("cancelled", "Cancelled.");
    if (timeout.signal.aborted) return fail("timeout", "That took too long. Please try again.");
    return fail("network", "I couldn't reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}
