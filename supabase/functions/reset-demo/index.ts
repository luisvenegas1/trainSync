// ═══════════════════════════════════════════════════════════════
//  Edge Function: reset-demo
//  Resetea Tito Trainer Demo a datos ficticios. Protegida:
//   - requiere JWT del caller,
//   - el caller debe ser OWNER de la org,
//   - la org debe tener tenant_type='demo' (rechaza producción),
//   - llama a la función guardada reset_demo_data() (doble verificación en la BD).
//  El re-seed se hace re-corriendo seeds/tito_trainer_demo.sql (idempotente).
//  Desplegar es un paso manual (requiere tu Supabase). No se ejecuta solo.
// ═══════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return json({ error: "missing_token" }, 401);

    const { organization_id } = await req.json();
    if (!organization_id) return json({ error: "missing_org" }, 400);

    // Cliente con el JWT del caller: la función reset_demo_data valida owner + demo.
    const caller = createClient(PROJECT_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Verificación explícita adicional (defensa en profundidad).
    const { data: org } = await caller
      .from("organizations")
      .select("id, slug, tenant_type")
      .eq("id", organization_id)
      .maybeSingle();
    if (!org) return json({ error: "org_not_found" }, 404);
    if (org.tenant_type !== "demo") return json({ error: "refused_not_demo", tenant_type: org.tenant_type }, 403);

    const { error } = await caller.rpc("reset_demo_data", { p_org: organization_id });
    if (error) return json({ error: "reset_failed", detail: error.message }, 400);

    return json({ ok: true, message: "Datos demo borrados. Re-corré seeds/tito_trainer_demo.sql para repoblar." });
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
