// Client-side stand-in for B's mock mode, used only with ?mock=1.
// Cycles: T. rex skeleton, giraffe, error. Mirrors the shapes in contract v1.
// The server-side fixtures in /fixtures (owned by B) are the source of truth.

import type { DescribeRequest, DescribeSuccess } from "@/shared/contract";
import type { DescribeOutcome } from "./describeClient";

const TREX: DescribeSuccess = {
  subject: "Tyrannosaurus rex skeleton",
  confidence: "high",
  description:
    "This is a Tyrannosaurus rex skeleton, standing on two powerful back legs with its long tail held straight out behind it for balance. The skull is huge and deep, with a mouth full of curved, banana-sized teeth. Its arms are tiny, each ending in two small claws. The bones are dark brown and glossy, and it stands on a low platform in a large hall.",
  size_comparison: "It is about as long as a school bus and its hips are higher than a doorway.",
  fun_fact: "A T. rex could bite harder than any land animal alive today.",
  caveats: "",
};

const GIRAFFE: DescribeSuccess = {
  subject: "Giraffe",
  confidence: "medium",
  description:
    "This looks like a giraffe standing beside a tall tree, stretching its very long neck up to eat leaves. Its coat has large brown patches separated by thin cream lines, like a cracked dry riverbed. Two short, furry horns sit on top of its head.",
  size_comparison: "It is about as tall as a two-story house.",
  fun_fact: "A giraffe's tongue is dark purple and about as long as your forearm.",
  caveats: "I'm not certain, because it is partly hidden by branches.",
};

const MORE_TREX: DescribeSuccess = {
  ...TREX,
  description:
    "Looking closer: the skull alone is about as long as a bathtub. Large openings in the skull made it lighter. The ribs curve down like the frame of a boat, and the neck is short and thick, built to swing that heavy head. The back legs have three big forward toes, like a giant bird's foot.",
};

const ANSWER: DescribeSuccess = {
  ...TREX,
  description:
    "It's about 12 meters long, roughly the length of a school bus, and stands about 4 meters tall at the hips. When alive it weighed around 8 tonnes, as much as a large elephant and a half.",
};

let turn = 0;

export async function mockDescribe(req: DescribeRequest, signal: AbortSignal): Promise<DescribeOutcome> {
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 1200);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
  if (signal.aborted) return { ok: false, error: { code: "cancelled", message: "Cancelled." } };

  if (req.question) return { ok: true, data: ANSWER };
  if (req.mode === "detailed") return { ok: true, data: MORE_TREX };

  const pick = turn++ % 3;
  if (pick === 0) return { ok: true, data: TREX };
  if (pick === 1) return { ok: true, data: GIRAFFE };
  return {
    ok: false,
    error: { code: "unclear_image", message: "I couldn't see that clearly. Try again with more light." },
  };
}
