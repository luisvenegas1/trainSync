-- ═══════════════════════════════════════════════════════════════
--  Permitir que el STAFF (owner + trainer) configure organization_settings.
--  Antes solo el owner podía escribir → un co-entrenador (trainer) que activaba
--  medallas/recordatorios/bloqueo veía "guardado" pero el upsert no persistía
--  (RLS lo dejaba en no-op silencioso). Ahora owner y trainer pueden; el superadmin
--  ya estaba cubierto por has_org_role. La lectura no cambia.
--  Aditiva/idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists org_settings_write on public.organization_settings;
create policy org_settings_write on public.organization_settings
  to authenticated
  using (public.has_org_role(organization_id, array['owner','trainer']))
  with check (public.has_org_role(organization_id, array['owner','trainer']));
