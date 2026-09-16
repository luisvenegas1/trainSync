# Deploy a producción — TrainSync (v1.10.x)

Runbook del **primer deploy desde el entorno dev (Docker + Supabase local)** y de los
incrementales siguientes. Prod = proyecto Supabase de `trainingapp.tito-apps.com`.

> **Regla de oro:** correr SIEMPRE la suite Cypress completa en local (con
> `supabase db reset`) antes de cualquier push a prod. Orden de deploy: **BD →
> Edge Functions → Frontend** (el frontend de último, así el backend ya lo soporta).

---

## Contexto importante: migraciones

En el pasaje a Docker/dev se reorganizaron las migraciones:
- Las viejas numeradas (`0001`–`0038`) se archivaron en `supabase/migrations_archive/`.
- Se generó un **baseline** `20260911211621_remote_schema.sql` = *dump del schema real de prod*.

⚠️ **El baseline NO se corre en prod** (recrea todo, incluye `DROP EXTENSION pg_net`).
Prod ya tiene ese schema. Solo se aplican a prod las migraciones **posteriores** al baseline.

Migraciones posteriores al baseline (las "nuevas"):
- `20260911213000_transfer_client_rpc.sql` — RPC transferir cliente entre tenants
- `20260912100000_payment_block.sql` — bloqueo por vencimiento + `billing_exempt`
- `20260914100000_manual_reminders.sql` — reenvío manual + tabla `saas_payment_notices`
- `20260914140000_settings_write_staff.sql` — RLS: staff (owner+trainer) escribe settings

Todas son **idempotentes/aditivas** (`if not exists` / `create or replace` / `drop policy if exists`).

---

## v1.10.0 — primer deploy (YA HECHO)

1. **BD:** correr en el SQL Editor de prod, en orden, las 4 migraciones nuevas de arriba. ✅
2. **Edge Functions:**
   ```bash
   supabase functions deploy send-reminder --no-verify-jwt        # nueva
   supabase functions deploy manage-trainer --no-verify-jwt       # + fallback env
   supabase functions deploy admin-users --no-verify-jwt
   supabase functions deploy delete-client --no-verify-jwt
   supabase functions deploy reset-client-password --no-verify-jwt
   supabase functions deploy reset-demo --no-verify-jwt
   supabase functions deploy send-payment-reminders --no-verify-jwt
   supabase functions deploy invite-client --no-verify-jwt
   supabase functions deploy invite-trainer --no-verify-jwt
   supabase functions deploy platform-admin --no-verify-jwt
   ```
3. **Frontend:** `git commit` + `git push` (Vercel builds). ✅

---

## Alinear el historial de migraciones (one-time, para que `supabase db push` vuelva a funcionar)

El historial remoto todavía tiene las migraciones viejas `0001`–`0038`. Para alinearlo
con los archivos locales (baseline + nuevas). **Correr una sola vez, con el proyecto linkeado a prod.**

```bash
# 1) Ver el estado actual (remoto vs local) y ADAPTAR los pasos siguientes a lo que muestre.
supabase migration list

# 2) Marcar como REVERTIDAS las viejas (ya no existen como archivos; solo viven en el historial remoto).
supabase migration repair --status reverted \
  0001 0002 0004 0005 0006 0007 0008 0013 0014 0015 0016 0017 0018 0019 0020 \
  0021 0022 0023 0024 0025 0026 0027 0028 0029 0030 0031 0032 0033 0034 0035 0036 0037 0038

# 3) Marcar como APLICADAS el baseline + las nuevas (ya están todas en prod).
supabase migration repair --status applied \
  20260911211621 20260911213000 20260912100000 20260914100000 20260914140000

# 4) Confirmar que quedó todo alineado (no debería quedar nada pendiente).
supabase migration list
```

Tras esto, `supabase db push` debería ser un no-op. **No borra datos**: `migration repair`
solo toca la tabla de historial (`supabase_migrations.schema_migrations`), no el schema.

---

## v1.10.1 — deploy incremental (reenvío de recordatorio + fix de alineación)

Cambios: botón "↻ Reenviar" en el historial de recordatorios (límite 30 días) y
alineación del checkbox "Eximir del bloqueo". **Solo frontend.**

- **BD:** ninguna migración nueva.
- **Edge Functions:** ninguna nueva ni cambiada (el reenvío usa `send-reminder`, ya en prod).
- **Frontend:**
  ```bash
  git add -A
  git commit -m "feat: reenviar recordatorio desde el historial (≤30 días) + fix alineación exención (v1.10.1)"
  git push
  ```

---

## v1.10.3 — gracia de suscripción en días

Cambio: la gracia de la suscripción (plataforma) pasa de fecha absoluta a **días
después del vencimiento**; se recalcula sola al registrar un pago y nunca queda antes
del vencimiento.

- **BD:** correr en el SQL Editor de prod:
  `supabase/migrations/20260915100000_subscription_grace_days.sql` (agrega `grace_days`).
- **Edge Functions:** `supabase functions deploy platform-admin --no-verify-jwt`
- **Frontend:** `git add -A && git commit -m "feat: gracia de suscripción en días (recalcula al pagar) (v1.10.3)" && git push`

> Migración history: como ya está alineado, también podés hacer `supabase db push`
> (aplicaría solo la nueva). O correrla a mano en el SQL Editor (es `add column if not exists`).

---

## Smoke test post-deploy (en prod)

Logueado como un coach Premium real:
- Recordatorios: se ven las 2 columnas + historial; el botón "Reenviar" aparece en los envíos ≤30 días.
- Activar medallas → Guardar → navegar y volver → sigue activo.
- Ficha de cliente → pestaña Plan → checkbox "Eximir del bloqueo" alineado.
- Plataforma → org → Suscripción → "Aviso de pago del SaaS" presente.

---

## Secretos en prod (referencia)

Ya configurados a nivel proyecto (no hace falta recrearlos): `RESEND_API_KEY`,
`REMINDER_FROM`, `CRON_SECRET`, y las `PROJECT_URL/SERVICE_ROLE_KEY/ANON_KEY` (con
fallback a las `SUPABASE_*` que inyecta la plataforma).
