/**
 * Small in-memory rate limiter, per client IP and per route. It keeps a
 * public demo URL from being used as a free Gemini or Cloud TTS proxy. Each
 * server instance has its own counts, so pair it with Cloud Run
 * --max-instances to cap total spend (see DEPLOY.md).
 *
 * Limits are per minute and configurable, because a whole venue can share one
 * Wi-Fi IP. Set the variable to 0 to turn a limit off.
 */

const WINDOW_MS = 60_000;
const MAX_TRACKED = 5_000;

const LIMITS = {
  describe: Number(process.env.RATE_LIMIT_DESCRIBE_PER_MIN ?? 30),
  speak: Number(process.env.RATE_LIMIT_SPEAK_PER_MIN ?? 60),
  // Guidance sends about one frame a second while aiming.
  aim: Number(process.env.RATE_LIMIT_AIM_PER_MIN ?? 120),
} as const;

export type LimitedRoute = keyof typeof LIMITS;

const hits = new Map<string, number[]>();

/** Client IP as seen behind Cloud Run / proxies (first X-Forwarded-For entry). */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Returns seconds to wait if over the limit, or 0 if the request may go ahead. */
export function rateLimit(route: LimitedRoute, request: Request): number {
  const limit = LIMITS[route];
  if (!(limit > 0)) return 0;

  const now = Date.now();
  const key = `${route}:${clientIp(request)}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= limit) {
    hits.set(key, recent);
    return Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000));
  }

  recent.push(now);
  hits.set(key, recent);

  // Keep memory bounded: drop the oldest keys when too many IPs are tracked.
  if (hits.size > MAX_TRACKED) {
    for (const k of hits.keys()) {
      hits.delete(k);
      if (hits.size <= MAX_TRACKED / 2) break;
    }
  }
  return 0;
}
