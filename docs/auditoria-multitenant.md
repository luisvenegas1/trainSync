# Auditoría multi-tenant — TrainSync

_Fecha: 2026-09-11 · Versión app: 1.8.3_

Revisión completa de cómo se separan los tenants: resolución de tenant, login/acceso,
aislamiento real (RLS), edge functions, god-mode del superadmin, e invitaciones/recuperación.
El foco es **privacidad y aislamiento**: que un tenant nunca vea ni toque datos de otro.

---

## Resumen ejecutivo

La arquitectura está **bien diseñada y con defensa en profundidad**. Para los usuarios
normales (owners, trainers y clientes) el aislamiento es **sólido**: lo impone la base de
datos con RLS en todas las tablas, no el navegador.

Los problemas que vivimos hoy **no fueron fugas de usuarios normales**. Fueron dos clases
de cosa, ambas ya arregladas:

1. **Interacciones del superadmin (god-mode)** — el bug de `invite-trainer` que agregaba al
   admin en la org equivocada. Causa raíz: resolvía la org "por el caller" en vez de por el
   tenant que se administra. Ya usa org explícita.
2. **Configuración de correos/redirects** — el reset perdía el tenant en la URL y el hash.
   Ya conserva ambos.

Quedan **recomendaciones** (abajo, priorizadas) y **verificaciones que conviene correr en
producción** — sobre todo confirmar que RLS está activo en TODAS las tablas.

---

## 1. Resolución de tenant (`src/tenant/resolveTenant.js`)

Cómo la app decide a qué organización pertenece una URL:

- **Prioridad al subdominio:** `slug.tito-apps.com` → ese slug. El subdominio con typo
  `joeltraining` mapea a `joheltraining` (alias de compatibilidad).
- **Apex / `trainingapp` / localhost / `*.vercel.app`:** se resuelve por el primer segmento
  de la ruta (`/joheltraining`, `/tito-pruebas`).
- **Host desconocido o dominio no registrado:** devuelve `null` → "Organización no
  encontrada". **Nunca** cae a Johel por defecto.

**Veredicto:** correcto y seguro. Regla clave respetada: jamás asumir un tenant.

**Deuda técnica menor:** el alias `joeltraining → joheltraining` es un parche por el slug
viejo con typo. No es una fuga, pero conviene, a futuro, dejar el slug canónico limpio y
retirar el alias.

---

## 2. Login y acceso (`src/auth/resolveAccess.js`)

Decide, de forma pura, qué acceso tiene un usuario autenticado al tenant solicitado. Compara
por **ID de organización** (no por slug), que es lo correcto:

- **Staff (owner/trainer/demo_viewer)** con membresía en ESE tenant → acceso con su rol.
- **Cliente** cuya fila apunta a ESE tenant → acceso como cliente.
- **Superadmin** sin membresía → god-mode como owner (soporte).
- **Autenticado pero de otra org** → `wrong_org` ("Organización incorrecta"). Nunca ve datos
  del tenant.

**Veredicto:** correcto. El caso "Organización incorrecta" de Johel fue por datos (su cuenta
real no era miembro de joheltraining), no por un fallo de esta lógica.

---

## 3. Aislamiento real — RLS (la capa que importa)

Toda la seguridad de verdad vive en la base con Row Level Security. Revisado en
`0007` (helpers), `0008` (policies), `0018`, `0022`, `0026`, `0033`, `0037`, `0038`.

**Patrón consistente en TODAS las tablas de tenant** (users, exercises, routines y su cadena,
measurements, payments, workout_sessions/logs, catalogs, challenges, routine_assignments,
organization_settings, organization_subscriptions):

- **Lectura:** `is_org_member(organization_id)` (staff del tenant) **o** que la fila sea del
  propio cliente (`current_client_id()` / `client_owns_*`).
- **Escritura:** `can_write_org(organization_id)` (solo owner/trainer; demo_viewer no).

Detalles bien resueltos:

- Helpers `SECURITY DEFINER` con `search_path` fijo → evitan recursión de policies e inyección.
- Ejercicios: se ven los `global` + los de la propia org; solo se escriben los privados de la org.
- Lectura anónima de la **demo** (`0028`) acotada **solo** a la org `titotrainer` (tenant_type
  = 'demo'). No toca ningún tenant real.
- Leaderboard del cliente (`0038`): función que devuelve solo nombre+conteo, acotada a la org
  del reto y solo si es visible a clientes. No abre la tabla de sesiones.

**Veredicto:** para usuarios normales, **el aislamiento es sólido**. Un tenant no puede leer
ni escribir datos de otro.

> ⚠️ **Dependencia crítica:** las policies solo protegen si **RLS está ACTIVADO** en cada
> tabla. La activación se hace a mano (`supabase/cutover/enable_rls.sql`), no en una
> migración. Tablas nuevas creadas después del corte deben activar su propio RLS (challenges
> y payment_reminder_logs lo hacen en su migración). **Hay que verificar en prod que ninguna
> tabla quedó sin RLS** (ver §7, query 1). Una tabla de tenant con RLS apagado = fuga total.

---

## 4. Superadmin / god-mode — el punto más delicado

`0036` hace que `is_org_member()` y `has_org_role()` devuelvan `true` para cualquiera en
`platform_admins`. Como todas las policies se apoyan en esos helpers, el superadmin obtiene
**lectura Y escritura en CUALQUIER organización** a nivel de base.

Esto es intencional (soporte), pero implica:

- Para el superadmin, **la base está abierta**. Lo único que evita ver datos de otro tenant
  en pantalla es el filtro del **frontend**: `setDataOrgScope(orgId)` + `scopeOrg()` en
  `src/db.js`, que se llama antes de cada carga.
- **Riesgo de lectura:** si algún camino de carga olvidara llamar `setDataOrgScope`, el
  superadmin podría ver datos de otro tenant. Hoy todas las lecturas de datos pasan por
  `scopeOrg` (verificado) y los `load()` fijan el scope. Está bien, pero es un guard de
  frontend protegiendo un backend abierto.
- **Riesgo de escritura:** `scopeOrg` filtra **lecturas**, no escrituras. Una escritura del
  superadmin usa el `organization_id` que traiga el dato en pantalla. Mientras la UI esté
  acotada a un tenant, escribe en el correcto — pero no hay un guard de servidor que impida
  escribir en la org equivocada si un bug mandara otro `organization_id`. **Esta es
  exactamente la clase de bug de hoy** (`invite-trainer` resolviendo la org por el caller).

**Recomendaciones (§7):** mantener la disciplina de scope, y para acciones sensibles del
superadmin (crear/editar miembros, resetear claves) **pasar siempre la org explícita** y
validarla en el backend — que es justo lo que ya aplicamos hoy a invite/manage-trainer.

---

## 5. Edge functions (revisión de las 9)

| Función | Cómo decide la org | Autorización | Estado |
|---|---|---|---|
| `invite-client` | de la fila del **cliente** (target) | owner/trainer de esa org | ✅ correcto |
| `reset-client-password` | de la fila del **cliente** | owner/trainer de esa org | ✅ correcto |
| `delete-client` | de la fila del **cliente** | owner/trainer **o** superadmin | ✅ correcto |
| `invite-trainer` | **org explícita** (body) | owner de esa org **o** superadmin | ✅ arreglado hoy |
| `manage-trainer` | **org explícita** (body) | owner de esa org **o** superadmin | ✅ arreglado hoy |
| `admin-users` | **org explícita** (body) | owner de esa org | ✅ correcto |
| `platform-admin` | explícita / operación de plataforma | `platform_admins` | ✅ correcto |
| `reset-demo` | explícita | RPC valida owner + tenant demo | ✅ correcto |
| `send-payment-reminders` | recorre orgs premium con recordatorios | `x-cron-secret` | ✅ correcto |

Notas:

- El `service_role` (que salta RLS) vive **solo** en las edge functions, nunca en el
  frontend. Correcto.
- `reset-client-password` y `admin-users` **no** dan paso al superadmin (exigen membresía).
  No es una fuga — es una restricción: el superadmin no podría resetear la clave de un cliente
  de un tenant donde no es miembro. Si querés que soporte lo haga, se agrega la rama
  superadmin como en delete-client. Decisión de UX, no de seguridad.

---

## 6. Invitaciones y recuperación de contraseña (los correos)

- Los links de invitación (cliente/trainer) usan el **subdominio del tenant**
  (`slug.tito-apps.com`) para que la PWA abra el tenant correcto (robusto en iOS).
- El reset de contraseña ahora conserva el **tenant en la URL** (ruta o subdominio) y el
  **hash** con el token durante el redirect del apex (arreglado hoy, v1.8.2).
- **Supabase → Redirect URLs:** wildcard `https://*.tito-apps.com/**` (cubre todos los
  tenants presentes y futuros). **Site URL** debe ser neutral (`trainingapp.tito-apps.com`),
  no un tenant, para que ningún fallback caiga en la org de un cliente real.
- **DNS:** cada subdominio de tenant debe existir (CNAME a Vercel). Hoy se agregan uno por uno;
  el wildcard requiere delegar el DNS a Vercel (pendiente, con cuidado por el correo).

**Veredicto:** el flujo quedó correcto tras los fixes de hoy. Recordar: al crear un tenant
nuevo, dar de alta su subdominio en Vercel/DNS.

---

## 7. Hallazgos y recomendaciones (priorizados)

**P0 — Verificar YA en producción**

1. **Confirmar que RLS está activo en todas las tablas de tenant** (query 1 abajo). Es la
   única cosa que, si falla, sería una fuga real y silenciosa.

**P1 — Recomendado**

2. **Disciplina de god-mode:** que toda acción sensible del superadmin pase la org explícita
   y la valide en backend (ya hecho en invite/manage-trainer; aplicar el mismo criterio a
   cualquier función nueva). Nunca resolver la org "por el caller".
3. **Limpiar la cuenta de prueba** `johel@tito-apps.com` (ya sin membresía). Verificar que no
   tenga datos creados asociados antes de borrarla (query 3).
4. **Chequeo de membresías cruzadas** (query 2): nadie (salvo superadmin) debería ser miembro
   de más de una org. Hoy limpiamos a Johel; conviene confirmar que no quede otro caso.

**P2 — Deuda técnica / mejora**

5. Retirar a futuro el alias de slug `joeltraining` cuando ya nadie use ese subdominio viejo.
6. Evaluar si los **clientes** necesitan leer `catalogs` (hoy `catalogs_select` pide
   `is_org_member`, y los clientes no son miembros). Si la vista de rutina del cliente muestra
   etiquetas de catálogo, podría faltarles; es funcionalidad, no aislamiento.
7. Cuando haya entorno local (Docker), probar migraciones y edge functions **antes** de
   desplegar a prod — baja el versionamiento y el riesgo.

---

## 8. Queries de verificación para correr en prod (SQL Editor)

**Query 1 — ¿RLS activo en todas las tablas?** (lo más importante)

```sql
select c.relname as tabla, c.relrowsecurity as rls_activo
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;
```
➡️ Toda tabla de datos de tenant debe tener `rls_activo = true`. Si alguna tabla con
`organization_id` sale en `false`, activá su RLS de inmediato.

**Query 1b — Tablas con RLS activo pero SIN ninguna policy** (quedarían bloqueadas o
inconsistentes):

```sql
select c.relname as tabla
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relrowsecurity
  and not exists (
    select 1 from pg_policies p where p.schemaname='public' and p.tablename = c.relname
  )
order by tabla;
```

**Query 2 — Membresías cruzadas** (nadie normal debería estar en >1 org):

```sql
select au.email, count(*) as orgs
from organization_members m
join auth.users au on au.id = m.user_id
group by au.email
having count(*) > 1
order by orgs desc;
```
➡️ Si aparece alguien que NO sea una de tus cuentas de superadmin, revisá esa cuenta.

**Query 3 — Cuentas de Auth sin membresía ni cliente** (huérfanas / de prueba):

```sql
select au.email, au.created_at
from auth.users au
where not exists (select 1 from organization_members m where m.user_id = au.id)
  and not exists (select 1 from public.users u where u.auth_user_id = au.id)
  and not exists (select 1 from platform_admins pa where pa.user_id = au.id)
order by au.created_at;
```
➡️ Candidatas a limpieza (p.ej. `johel@tito-apps.com`). Verificá antes que no tengan datos
creados (`created_by`) si vas a borrarlas.

**Query 4 — Filas sin organización** (no debería haber ninguna):

```sql
select 'users' t, count(*) from users where organization_id is null
union all select 'routines', count(*) from routines where organization_id is null
union all select 'workout_sessions', count(*) from workout_sessions where organization_id is null
union all select 'measurements', count(*) from measurements where organization_id is null
union all select 'payments', count(*) from payments where organization_id is null;
```

---

## Conclusión

El modelo multi-tenant es correcto y el aislamiento para usuarios normales es fuerte (RLS en
toda la base). Los incidentes de hoy fueron del **superadmin/god-mode** y de **configuración
de correos**, no fugas de clientes — y ya están corregidos. La acción más importante que
queda es **verificar en prod que RLS está activo en todas las tablas** (query 1); con eso,
el riesgo de fuga entre tenants es muy bajo.
