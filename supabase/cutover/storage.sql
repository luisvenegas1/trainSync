-- ═══════════════════════════════════════════════════════════════
--  CUTOVER — Storage: buckets + policies. OPERACIÓN MANUAL (no es migración).
--  Requiere que 0007_rls_helpers ya esté aplicado (usa is_org_member/can_write_org).
--  Convención de ruta:  <organization_id>/<client_id | 'org'>/<archivo>
--  Aditiva e idempotente. NO ejecutar en prod sin autorización.
--
--  Buckets:
--    org-logos       público  (el branding se ve ANTES del login)
--    trainer-photos  público  (foto del entrenador en la landing/branding)
--    avatars         privado  (fotos de perfil de clientes)
-- ═══════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public) values
  ('org-logos','org-logos', true),
  ('trainer-photos','trainer-photos', true),
  ('avatars','avatars', false)
on conflict (id) do nothing;

-- Helper local: primer segmento de la ruta como uuid de organización.
-- (se usa inline; no crea función nueva)

-- ── org-logos (branding): lectura pública, escritura solo owner de la org ──
drop policy if exists logos_read on storage.objects;
create policy logos_read on storage.objects for select
  using (bucket_id = 'org-logos');
drop policy if exists logos_write on storage.objects;
create policy logos_write on storage.objects for all to authenticated
  using (bucket_id = 'org-logos'
         and (public.is_superadmin()
              or public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner'])))
  with check (bucket_id = 'org-logos'
         and (public.is_superadmin()
              or public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner'])));

-- ── trainer-photos: lectura pública, escritura owner/trainer de la org ──
drop policy if exists trainerphotos_read on storage.objects;
create policy trainerphotos_read on storage.objects for select
  using (bucket_id = 'trainer-photos');
drop policy if exists trainerphotos_write on storage.objects;
create policy trainerphotos_write on storage.objects for all to authenticated
  using (bucket_id = 'trainer-photos'
         and (public.is_superadmin()
              or public.can_write_org(((storage.foldername(name))[1])::uuid)))
  with check (bucket_id = 'trainer-photos'
         and (public.is_superadmin()
              or public.can_write_org(((storage.foldername(name))[1])::uuid)));

-- ── avatars (privado): miembros de la org o el propio cliente ──
--    Ruta: <org_id>/<client_id>/<archivo>
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (
    public.is_org_member(((storage.foldername(name))[1])::uuid)
    or (storage.foldername(name))[2] = public.current_client_id()
  ));
drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (
    public.can_write_org(((storage.foldername(name))[1])::uuid)
    or (storage.foldername(name))[2] = public.current_client_id()
  ))
  with check (bucket_id = 'avatars' and (
    public.can_write_org(((storage.foldername(name))[1])::uuid)
    or (storage.foldername(name))[2] = public.current_client_id()
  ));

-- NOTA: storage.objects ya tiene RLS activo por defecto en Supabase; estas
-- policies definen el acceso. Los buckets públicos permiten lectura por URL.
