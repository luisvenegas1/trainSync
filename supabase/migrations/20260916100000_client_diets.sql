-- ═══════════════════════════════════════════════════════════════
--  Dietas por cliente (Fase 1): el entrenador sube PDFs de dieta y quedan como
--  HISTORIAL por cliente. Cada una se puede habilitar/ocultar. El cliente ve la más
--  reciente habilitada y puede ver/descargar cualquiera que esté habilitada.
--  Bucket 'diets' PRIVADO: escritura del staff de la org; lectura del staff o del
--  PROPIO cliente (por URL firmada). Aislamiento por carpeta <org_id>/<client_id>.
--  Aditiva/idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

-- Acceso a la función de dieta por cliente (el coach lo activa/desactiva; ej. es un
-- servicio aparte que se paga). Default FALSE: el cliente NO ve la pestaña Dieta hasta
-- que el coach se lo activa. Al desactivar, el historial se conserva.
alter table public.users add column if not exists diet_access boolean not null default false;

create table if not exists public.diets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id       text not null,
  title           text,
  file_path       text not null,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now()
);
alter table public.diets enable row level security;
grant all on public.diets to anon, authenticated, service_role;
create index if not exists diets_client_idx on public.diets (client_id);

-- Lectura: staff de la org, o el PROPIO cliente, o superadmin.
drop policy if exists diets_select on public.diets;
create policy diets_select on public.diets for select to authenticated
  using (public.is_superadmin()
         or public.is_org_member(organization_id)
         or public.current_client_id() = client_id);

-- Escritura: solo staff (owner/trainer) de la org, o superadmin.
drop policy if exists diets_write on public.diets;
create policy diets_write on public.diets for all to authenticated
  using (public.is_superadmin() or public.can_write_org(organization_id))
  with check (public.is_superadmin() or public.can_write_org(organization_id));

-- Bucket privado para los PDFs de dieta.
insert into storage.buckets (id, name, public) values ('diets', 'diets', false)
on conflict (id) do nothing;

drop policy if exists diets_obj_write on storage.objects;
create policy diets_obj_write on storage.objects for all to authenticated
  using (bucket_id = 'diets'
         and (public.is_superadmin()
              or public.can_write_org(((storage.foldername(name))[1])::uuid)))
  with check (bucket_id = 'diets'
         and (public.is_superadmin()
              or public.can_write_org(((storage.foldername(name))[1])::uuid)));

drop policy if exists diets_obj_read on storage.objects;
create policy diets_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'diets'
         and (public.is_superadmin()
              or public.is_org_member(((storage.foldername(name))[1])::uuid)
              or public.current_client_id() = (storage.foldername(name))[2]));
