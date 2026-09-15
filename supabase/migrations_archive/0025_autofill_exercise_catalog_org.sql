-- ═══════════════════════════════════════════════════════════════
--  0025 — Autofill de organización (y visibility) para exercises y catalogs.
--  Robustece el alta de EJERCICIOS y CATÁLOGOS por el entrenador bajo RLS:
--  aunque el frontend no envíe organization_id, el trigger lo completa desde la
--  membresía del entrenador ANTES del WITH CHECK de RLS.
--  Solo actúa para usuarios autenticados (auth.uid() no nulo); las inserciones
--  con service_role (biblioteca global, seeds, copias) NO se tocan.
--  Aditiva e idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

-- Ejercicios: org desde la membresía del entrenador + visibility='organization'
-- (los ejercicios que crea un entrenador son privados de su organización).
create or replace function public.fn_autofill_exercise()
returns trigger language plpgsql security definer set search_path = public as $$
declare porg uuid;
begin
  if auth.uid() is null then
    return NEW; -- service_role: biblioteca global / seeds / copias, no tocar
  end if;
  if NEW.organization_id is null then
    select m.organization_id into porg from public.organization_members m
    where m.user_id = auth.uid() and m.role in ('owner','trainer')
    order by m.created_at limit 1;
    NEW.organization_id := porg;
  end if;
  if NEW.visibility is null then
    NEW.visibility := 'organization';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_autofill_exercise on public.exercises;
create trigger trg_autofill_exercise before insert on public.exercises
  for each row execute function public.fn_autofill_exercise();

-- Catálogos (Equipo, Superficie, Grupos musculares, Tipos/Modalidades de plan):
-- org desde la membresía del entrenador.
create or replace function public.fn_autofill_catalog_org()
returns trigger language plpgsql security definer set search_path = public as $$
declare porg uuid;
begin
  if auth.uid() is null then
    return NEW;
  end if;
  if NEW.organization_id is null then
    select m.organization_id into porg from public.organization_members m
    where m.user_id = auth.uid() and m.role in ('owner','trainer')
    order by m.created_at limit 1;
    NEW.organization_id := porg;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_autofill_catalog_org on public.catalogs;
create trigger trg_autofill_catalog_org before insert on public.catalogs
  for each row execute function public.fn_autofill_catalog_org();
