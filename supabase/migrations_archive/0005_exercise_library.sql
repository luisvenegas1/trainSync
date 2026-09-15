-- ═══════════════════════════════════════════════════════════════
--  0005 — Biblioteca de ejercicios: global vs privada
--  Aditiva e idempotente. NO ejecutar en prod sin autorización.
--
--  Modelo (columnas creadas en 0002):
--    visibility='global'       + organization_id NULL  -> compartido, no editable por trainers
--    visibility='organization' + organization_id=<org> -> privado de esa organización
--
--  Esta migración es SOLO aditiva: crea el índice de apoyo. La CONSISTENCIA de
--  visibilidad (organization/global) depende del backfill de organization_id y por
--  eso se ejecuta en el bootstrap manual (supabase/cutover/bootstrap_johel_apply.sql),
--  no aquí (si corriera aquí, antes del backfill marcaría todo como 'global').
-- ═══════════════════════════════════════════════════════════════

-- 1) Consistencia de visibilidad: se corre en el BOOTSTRAP (tras el backfill).
--    Ver supabase/cutover/bootstrap_johel_apply.sql.

-- 2) Promoción a GLOBAL (OPT-IN, reversible).  ⚠️ Decisión de negocio.
--    Por defecto NO promovemos nada: Johel conserva sus ejercicios como PRIVADOS.
--    Para compartir ejercicios base con futuros entrenadores, descomentá y
--    ajustá UNO de los bloques siguientes. Conserva los IDs (no duplica).
--
--    a) Promover ejercicios específicos por id:
--    update public.exercises
--      set organization_id = null, visibility = 'global'
--      where id in ('EX_ID_1','EX_ID_2');
--
--    b) Promover TODOS los ejercicios "normales" de Johel a globales
--       (los estiramientos quedan privados). Revisar antes de correr.
--    update public.exercises
--      set organization_id = null, visibility = 'global'
--      where organization_id = (select id from public.organizations where slug='joheltraining')
--        and type = 'normal';
--
--    Reversa de una promoción (volver a privado de Johel):
--    update public.exercises
--      set organization_id = (select id from public.organizations where slug='joheltraining'),
--          visibility = 'organization'
--      where visibility = 'global' and id in ('EX_ID_1','EX_ID_2');

-- 3) Índice de apoyo para el selector (global + privados de una org).
create index if not exists exercises_lib_idx on public.exercises(visibility, organization_id);

-- Verificación:
-- select visibility, (organization_id is null) as sin_org, count(*)
--   from public.exercises group by 1,2 order by 1,2;
