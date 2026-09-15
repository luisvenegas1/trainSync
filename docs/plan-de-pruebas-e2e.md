# Plan de pruebas E2E — TrainSync

Mapa completo de casos de prueba automatizados (Cypress) contra el entorno local
(Vite + Supabase en Docker + datos de `seed.sql`). Estado: ✅ hecho · 🟡 en progreso · ⬜ pendiente.

Los flujos marcados **(edge)** dependen de edge functions (invitaciones, reset de
contraseña, crear org): en local necesitan las functions corriendo con sus secrets
(`supabase functions serve` + `supabase/functions/.env`). Se prueban en su propia tanda.

---

## Tanda 1 — Login y acceso · `01-login.cy.js` ✅
- TC-01 Superadmin entra a /platform
- TC-02 Credenciales incorrectas → error
- TC-03 Coach entra a su tenant
- TC-04 Cliente entra a su tenant (no ve nav de coach)

## Tanda 2 — Transferencia de cliente · `02-transfer-client.cy.js` ✅
- TC-05 Superadmin mueve cliente Premium → Base (con modal)
- TC-06 El cliente movido aparece en la org destino

## Tanda 3 — Historial solo-lectura · `03-history-readonly.cy.js` ✅
- TC-07 Cliente Base con historial → mediciones solo-lectura
- TC-08 Cliente Premium con historial → mediciones normales
- TC-09 Cliente Base sin historial → sin pestaña Mediciones

## Tanda 4 — Aislamiento entre tenants · `04-isolation.cy.js` ✅
- TC-10 Coach solo ve clientes de su org
- TC-11 Cliente no obtiene acceso a otro tenant

## Tanda 5 — Gestión de clientes (coach) · `05-clients.cy.js` ✅
- TC-12 Crear cliente (aparece en la lista)
- TC-14 Eliminar cliente (con modal de confirmación)
- TC-15 Buscar cliente por nombre
- TC-13 Editar datos de un cliente → `20-client-edit.cy.js` ✅

## Tanda 6 — Ejercicios (coach) · `06-exercises.cy.js` ✅
- TC-16 Crear ejercicio
- TC-17 Editar ejercicio
- TC-18 Eliminar ejercicio

## Tanda 7 — Rutinas · `07-routines.cy.js` ✅
- TC-20 El coach ve la rutina de su org (sembrada)
- TC-21 El coach abre el editor de rutina nueva
- TC-22 El cliente ve su rutina asignada
- TC-63 Crear + asignar una rutina con el editor completo → `25-routine-editor.cy.js` ✅

## Tanda 8 — Entrenamiento y peso (cliente) · `08-workout.cy.js` ✅
- TC-24 Iniciar entrenamiento (cronómetro)
- TC-25 Finalizar → se guarda en el historial
- TC-27 Precarga del último peso al iniciar → `21-weight.cy.js` ✅
- TC-28 Progreso de peso en el perfil → `21-weight.cy.js` ✅

## Tanda 9 — Retos y medallas · `09-challenges.cy.js` ✅
- TC-29 Coach guarda la config de medallas
- TC-30 Coach crea un reto (competencia)
- TC-31 Coach ve "Logros de tus clientes"
- TC-32 Cliente ve su sección de medallas
- TC-34 Celebración animada al cruzar el umbral → `22-medal-celebration.cy.js` ✅

## Tanda 10 — Funciones por plan · `10-features.cy.js` ✅
- TC-35 Coach Premium ve nav Retos
- TC-36 Coach Base NO ve nav Retos
- TC-37 Coach Pro NO ve nav Retos
- (Overrides por org desde plataforma → pendiente)

## Tanda 11 — Recordatorios de pago (config) · `11-reminders.cy.js` ✅
- TC-39 Coach Premium ve la config de recordatorios
- TC-40 Coach Base ve el upsell (gating)

## Tanda 12 — Plataforma / orgs **(edge)** · `12-platform-orgs.cy.js` ✅
- TC-41 Crear org nueva → aparece + invita al owner (correo en Mailpit)
- (TC-44 suspender/reactivar, TC-45 cambiar plan → pendientes)

## Tanda 13 — Invitaciones **(edge)** · `13-invitations.cy.js` ✅
- TC-48 Crear cliente → le llega el correo de invitación (Mailpit)
- (TC-46 agregar admin, TC-47 reset de contraseña → pendientes)

> **(edge):** requieren `supabase start` con las functions sirviéndose. Gracias al
> fallback SUPABASE_* en las functions, corren en local sin configurar secrets.

## Tanda 14 — Recuperar contraseña **(edge/Mailpit)** · `14-password-recovery.cy.js` ✅
- TC-49 "Olvidé mi contraseña" → llega el correo de recuperación
- TC-50 Flujo completo: abrir el link del correo → fijar nueva contraseña
- (Regresión del bug de recuperación que vimos con Johel)

## Tanda 15 — Mediciones y pagos (coach) · `15-measurements-payments.cy.js` ✅
- TC-51 Coach registra una medición
- TC-52 El cliente ve la medición
- TC-53 Coach registra un pago

## Tanda 16 — Administradores **(edge/Mailpit)** · `16-admins.cy.js` ✅
- TC-46 Owner invita a un admin → correo en Mailpit + aparece
- TC-47 Owner restablece la contraseña de un co-entrenador → `24-admin-reset.cy.js` ✅

## Tanda 17 — Plataforma: admin de orgs · `17-platform-admin.cy.js` ✅
- TC-44 Suspender y reactivar una org
- TC-45 Cambiar el plan de una org
- TC-61/62 Overrides de funciones por org (activar + efecto en el coach) → `23-platform-overrides.cy.js` ✅

## Tanda 18 — Validaciones / casos negativos · `18-negatives.cy.js` ✅
- TC-54 Cliente con correo duplicado → error
- TC-55 Cliente con correo inválido → error
- TC-56 Contraseña muy corta en el reset → error

## Tanda 19 — Bloqueo por mensualidad vencida · `19-payment-block.cy.js` ✅
- TC-57 Cliente vencido NO ve su rutina (pantalla de bloqueo)
- TC-58 Cliente vigente de la misma org no queda bloqueado
- TC-59 Coach de plan BASE ve la config de bloqueo (disponible en todos los planes)
- TC-60a El coach exime del bloqueo al cliente vencido
- TC-60b El cliente eximido vuelve a ver su rutina (login limpio en test aparte)

> Escenario sembrado: `gimnasio-base` tiene `payment_block_enabled=true` (0 días de
> gracia); `cliente5` está vencido con rutina asignada. El bloqueo oculta SOLO la
> rutina/entrenamiento (perfil, historial y mediciones siguen visibles).

## Pendientes finos (cerrados) — tandas 20-25
- `20-client-edit.cy.js` — TC-13 editar datos de cliente ✅
- `21-weight.cy.js` — TC-27 precarga de último peso · TC-28 progreso de peso ✅
- `22-medal-celebration.cy.js` — TC-34 celebración al cruzar el umbral ✅
- `23-platform-overrides.cy.js` — TC-61 activar override de Retos · TC-62 efecto en el coach ✅
- `24-admin-reset.cy.js` — TC-47 reset de contraseña de admin (edge) ✅
- `25-routine-editor.cy.js` — TC-63 crear + asignar rutina con el editor ✅
- `26-reminders-manual.cy.js` — TC-64 botón de recordatorio (Premium) · TC-65 gating (Base no lo ve) · TC-66 historial · TC-67 aviso de SaaS en plataforma ✅
- `27-session-recovery.cy.js` — TC-68 token inválido en storage → refresco lleva al login, no a "Sesión inválida" ✅
- `28-onboarding.cy.js` — TC-69 el tour se queda visible aunque se complete un paso · TC-70 la Guía marca en verde lo cumplido ✅
- `29-config-persistence.cy.js` — TC-71 medallas · TC-72 recordatorios · TC-73 bloqueo: guardar → navegar → volver → el valor persiste sin recargar ✅
- `30-validations.cy.js` — TC-74 admin correo inválido · TC-75 reto sin nombre · TC-76 contraseñas no coinciden · TC-77 org owner email inválido ✅ (complementa la tanda 18)

> Patrón anti-regresión: toda config que se guarda debe releer su estado real al
> montar (no del `tenant` cargado al login). El RLS `org_settings_write` permite
> escribir a staff (owner + trainer).

> **Recordatorios por correo (manual + cron + aviso de SaaS):** el envío real usa
> **Resend**, no Mailpit, así que los TCs verifican cableado y gating de la UI, no la
> entrega del correo (eso se valida manual / en prod). El reenvío manual y el aviso
> de SaaS se registran en `payment_reminder_logs` (tipo `manual`) y
> `saas_payment_notices` respectivamente.

> Semillas nuevas: `client_fit_studio_2` con rutina de 1 día/semana sin entrenos esta
> semana (para TC-34). Se le agregó `data-cy` al editor de rutinas (`rt-title`,
> `rt-days`, `rt-save`), a los overrides de plataforma (`feat-*`, `feat-save`) y a la
> celebración de medalla (`medal-celebration`).

---

## Convenciones
- IDs `TC-XX` en cada `it(...)`.
- Datos de `seed.sql` (determinísticos). Contraseña `password123`.
- Correr `supabase db reset` antes de la suite (los tests mutan datos).
- Selectores: `data-cy` donde el texto es ambiguo; si no, texto en español + tipo de input.
