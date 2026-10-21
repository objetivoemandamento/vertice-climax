import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();

function hex(bytes: Uint8Array) {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}
function equalConstantTime(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
async function sha256(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4_500_000) return json({ error: "payload_too_large" }, 413);

  let parsed: unknown;
  try { parsed = await request.json(); }
  catch { return json({ error: "invalid_json" }, 400); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "invalid_payload" }, 400);
  const body = parsed as Record<string, unknown>;
  const secret = typeof body.secret === "string" ? body.secret : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (secret.length < 24 || !action) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_not_configured" }, 500);

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: config, error: configError } = await db
    .from("vertice_climax_config").select("secret_hash").eq("id", 1).maybeSingle();
  if (configError || !config?.secret_hash) return json({ error: "configuration_unavailable" }, 503);
  if (!equalConstantTime(await sha256(secret), String(config.secret_hash))) return json({ error: "unauthorized" }, 401);

  if (action === "get_state") {
    const { data, error } = await db.from("vertice_climax_state").select("state").eq("id", 1).maybeSingle();
    if (error) return json({ error: "state_read_failed" }, 500);
    return json(data?.state ?? {});
  }
  if (action === "put_state") {
    const state = body.state;
    if (!state || typeof state !== "object" || Array.isArray(state) || JSON.stringify(state).length > 3_500_000) {
      return json({ error: "invalid_state" }, 400);
    }
    const { error } = await db.from("vertice_climax_state").upsert(
      { id: 1, state, updated_at: new Date().toISOString() }, { onConflict: "id" }
    );
    if (error) return json({ error: "state_write_failed" }, 500);
    return json({ ok: true });
  }
  if (action === "get_whatsapp_auth") {
    const { data, error } = await db.from("vertice_climax_whatsapp_auth")
      .select("encrypted_payload").eq("id", 1).maybeSingle();
    if (error) return json({ error: "auth_read_failed" }, 500);
    return json(data?.encrypted_payload ?? null);
  }
  if (action === "put_whatsapp_auth") {
    const payload = typeof body.payload === "string" ? body.payload : "";
    if (!payload || payload.length > 4_000_000) return json({ error: "invalid_auth_payload" }, 400);
    const { error } = await db.from("vertice_climax_whatsapp_auth").upsert(
      { id: 1, encrypted_payload: payload, updated_at: new Date().toISOString() }, { onConflict: "id" }
    );
    if (error) return json({ error: "auth_write_failed" }, 500);
    return json({ ok: true });
  }
  return json({ error: "unknown_action" }, 400);
});
