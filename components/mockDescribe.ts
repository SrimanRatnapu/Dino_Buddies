// In-browser stand-in for /api/describe, used only with ?mock=1. It needs no
// server, so it doubles as the offline backup on stage. It reads the same
// fixtures as the server's MOCK=1 mode (/fixtures/describe.json, owned by B),
// so there is one copy of the demo data. For testing the real route and its
// validation, run the server with `npm run dev:mock` instead.

import type { ApiError, DescribeRequest, DescribeSuccess } from "@/shared/contract";
import fixtures from "@/fixtures/describe.json";
import type { DescribeOutcome } from "./describeClient";

type Fixture = { status: number; body: DescribeSuccess | ApiError };
const FX = fixtures as unknown as Record<"trex" | "giraffe" | "lowconf" | "error" | "followup", Fixture>;

/** First looks cycle through these: high confidence, a caveat, another animal, an error. */
const CYCLE = [FX.trex, FX.lowconf, FX.giraffe, FX.error];

let turn = 0;

function toOutcome(fx: Fixture): DescribeOutcome {
  return fx.status === 200
    ? { ok: true, data: fx.body as DescribeSuccess }
    : { ok: false, error: (fx.body as ApiError).error };
}

export async function mockDescribe(req: DescribeRequest, signal: AbortSignal): Promise<DescribeOutcome> {
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 1200);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
  if (signal.aborted) return { ok: false, error: { code: "cancelled", message: "Cancelled." } };

  if (req.question) return toOutcome(FX.followup);
  // The server mock has no "tell me more" fixture either; it repeats the T. rex.
  if (req.mode === "detailed") return toOutcome(FX.trex);
  return toOutcome(CYCLE[turn++ % CYCLE.length]);
}
