import type { DescribeSuccess } from "@/shared/contract";

/** What produced a result: a first look, "tell me more", or an answer to a question. */
export type ResultKind = "describe" | "more" | "answer";

/**
 * The text read aloud for a result. Contract rule: when confidence is not
 * "high", the caveat is spoken first.
 */
export function spokenText(r: DescribeSuccess, kind: ResultKind): string {
  const parts: string[] = [];
  if (r.confidence !== "high") parts.push(r.caveats.trim() || "I'm not certain about this one.");
  parts.push(r.description.trim());
  if (kind === "describe") {
    if (r.size_comparison.trim()) parts.push(r.size_comparison.trim());
    if (r.fun_fact.trim()) parts.push(`Fun fact: ${r.fun_fact.trim()}`);
  }
  return parts.filter(Boolean).map(endSentence).join(" ");
}

function endSentence(s: string): string {
  return /[.!?]["”’)]?$/.test(s) ? s : `${s}.`;
}
