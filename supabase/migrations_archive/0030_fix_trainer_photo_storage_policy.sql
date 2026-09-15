-- ═══════════════════════════════════════════════════════════════
--  0030 — Fix: subir FOTO DEL ENTRENADOR desde el Panel de Plataforma.
--  La política de escritura de 'trainer-photos' solo permitía a miembros de la org
--  (can_write_org), pero el superadmin que edita branding desde /platform NO es
--  miembro de la org → RLS rechazaba ("new row violates row-level security policy").
--  La de 'org-logos' sí incluía is_superadmin(), por eso el logo sí subía.
--  Este fix alinea trainer-photos con logos: superadmin O staff de la org.
--  Aditiva e idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists trainerphotos_write on storage.objects;
create policy trainerphotos_write on storage.objects for all to authenticated
  using (bucket_id = 'trainer-photos'
         and (public.is_superadmin()
              or public.can_write_org(((storage.foldername(name))[1])::uuid)))
  with check (bucket_id = 'trainer-photos'
         and (public.is_superadmin()
              or public.can_write_org(((storage.foldername(name))[1])::uuid)));
