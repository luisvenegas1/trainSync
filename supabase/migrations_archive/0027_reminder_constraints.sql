-- ═══════════════════════════════════════════════════════════════
--  0027 — Defensa en profundidad para recordatorios (hallazgo M-3 de la
--  auditoría de seguridad). Aditiva e idempotente. NO destructiva.
--  Refuerza en la base lo que la capa de datos ya clampa (0–30 días).
--  NO agrega CHECK sobre el plan de suscripción a propósito: la org demo usa
--  plan 'demo', así que un CHECK in ('base','pro','premium') rompería datos existentes.
--  NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reminders_days_before_range') then
    alter table public.organization_settings
      add constraint reminders_days_before_range
      check (reminders_days_before between 0 and 30);
  end if;
end $$;
