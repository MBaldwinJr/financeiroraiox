import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

interface RateLimitOptions {
  readonly route: string;
  readonly capacity: number;
  readonly refillPerSec: number;
  readonly cost?: number;
  readonly identifier?: string;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly key: string;
}

function resolveCallerId(): string {
  try {
    const explicit = getRequestHeader("x-forwarded-for") ?? getRequestHeader("cf-connecting-ip");
    if (explicit) return explicit.split(",")[0]!.trim();
    const ip = getRequestIP({ xForwardedFor: true });
    if (ip) return ip;
  } catch {
    /* outside request context */
  }
  return "unknown";
}

export async function enforceRateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const id = opts.identifier ?? resolveCallerId();
  const key = `${opts.route}:${id}`;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("consume_rate_limit", {
    _key: key,
    _capacity: opts.capacity,
    _refill_per_sec: opts.refillPerSec,
    _cost: opts.cost ?? 1,
  });
  if (error) {
    console.error("[rate-limit] rpc failed", { key, error: error.message });
    // Fail-open to preserve availability; log for monitoring.
    return { allowed: true, key };
  }
  return { allowed: data === true, key };
}

export function rateLimitedResponse(retryAfterSec = 30): Response {
  return new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSec),
    },
  });
}
