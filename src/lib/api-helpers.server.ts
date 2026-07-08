import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/config";

// Server-only helper for API routes. Verifies the request's bearer token,
// returns the authenticated user id, and enforces that any client-supplied
// user_id matches. Never trusts a client-supplied id alone.
export async function requireUser(
  request: Request,
  claimedUserId?: string,
): Promise<{ userId: string; token: string } | Response> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    return jsonError(401, "Not signed in");
  }
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    return jsonError(401, "Session expired");
  }
  if (claimedUserId && claimedUserId !== data.user.id) {
    return jsonError(403, "Access denied");
  }
  return { userId: data.user.id, token };
}

export function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function n8nConfig(): { base: string; secret: string } | Response {
  const base = process.env.N8N_WEBHOOK_BASE;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!base || !secret) {
    return jsonError(500, "Service is temporarily unavailable");
  }
  return { base, secret };
}

export async function proxyToN8n(path: string, body: unknown): Promise<Response> {
  const cfg = n8nConfig();
  if (cfg instanceof Response) return cfg;
  try {
    const upstream = await fetch(`${cfg.base}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Webhook-Secret": cfg.secret,
      },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    // Pass through the upstream JSON to the client; on non-JSON, wrap.
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { success: false, error: "Upstream service returned an unexpected response" };
    }
    return new Response(JSON.stringify(payload), {
      status: upstream.ok ? 200 : upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("n8n proxy failed", err);
    return jsonError(502, "Couldn't reach the processing service");
  }
}
