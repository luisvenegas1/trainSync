# Configurar Resend como SMTP de Supabase Auth

Supabase Auth envía los correos (restablecer contraseña, invitaciones, etc.). Por
defecto usa su propio SMTP con **límites bajos** y remitente genérico. Conectando
**Resend** como SMTP personalizado, los correos salen desde tu dominio
(`tito-apps.com`) y con las plantillas lindas de `docs/email-templates/`.

Tu DNS ya tiene los registros de Resend (`resend._domainkey`, SPF con `amazonses`,
DMARC, y `send.tito-apps.com`), así que el dominio ya está casi listo.

## Paso 1 — Resend
1. Entrá a **resend.com** → **Domains**. Confirmá que `tito-apps.com` figure como
   **Verified** (si no, seguí las instrucciones de DKIM/SPF que ya tenés en Cloudflare).
2. **API Keys** → **Create API Key** (permiso "Sending access"). Copiá la clave
   (`re_...`). No la commitees.

## Paso 2 — Supabase (SMTP personalizado)
En Supabase → **Project Settings → Authentication → SMTP Settings** (o
**Authentication → Emails → SMTP**), activá **Enable Custom SMTP** y poné:

- **Host:** `smtp.resend.com`
- **Port:** `465` (SSL) — o `587` si preferís STARTTLS
- **Username:** `resend`
- **Password:** tu API key de Resend (`re_...`)
- **Sender email:** `no-reply@tito-apps.com` (debe ser un dominio verificado en Resend)
- **Sender name:** `Tito Apps`

Guardá. Mandate un correo de prueba (el botón "Send test email" si aparece, o
disparando un "¿olvidaste tu contraseña?" en la app).

## Paso 3 — Plantillas
Supabase → **Authentication → Email Templates**. Para cada uno, pegá el HTML:

| Template en Supabase | Archivo |
|----------------------|---------|
| Reset Password       | `docs/email-templates/reset-password.html` |
| Invite user          | `docs/email-templates/invite.html` |
| Confirm signup       | `docs/email-templates/confirm-signup.html` |
| Magic Link           | `docs/email-templates/magic-link.html` |

**Subjects (cambialos en el campo "Subject" de cada template — vienen en inglés por
defecto):**

| Template | Subject |
|----------|---------|
| Invite user | Te damos la bienvenida a tu plataforma |
| Reset Password | Restablecé tu contraseña |
| Confirm signup | Confirmá tu cuenta |
| Magic Link | Tu enlace de acceso |
| Change Email Address | Confirmá tu nuevo correo |

**Remitente (Sender):** en SMTP Settings, poné **Sender name** = `Tito Apps` y
**Sender email** = `no-reply@tito-apps.com`. Si no, el correo llega con el nombre
viejo del remitente (no tiene que ver con el branding de la app).

## Paso 4 — Redirect URLs  ⚠️ IMPORTANTE (multi-tenant)
Supabase → **Authentication → URL Configuration → Redirect URLs**.

Las invitaciones (cliente, trainer, reset) mandan al usuario al SUBDOMINIO de su
tenant (`slug.tito-apps.com`). Supabase SOLO respeta ese `redirectTo` si está en esta
lista; si no, lo **descarta y usa el "Site URL"** por defecto — y el usuario cae en la
org equivocada ("Organización incorrecta"). Por eso, en vez de listar cada tenant a
mano (y que cada tenant nuevo se rompa), usá un **wildcard**:

- `https://*.tito-apps.com/**`
- `https://*.tito-apps.com`
- `http://localhost:5173/**` (desarrollo)

Con el wildcard, cualquier tenant (joheltraining, titotrainer, tito-pruebas, y los que
vengan) redirige a SU propio subdominio sin tocar nada más.

**Site URL:** dejalo en algo neutral como `https://trainingapp.tito-apps.com` (no un
tenant puntual), para que cualquier fallback no aterrice en la org de un cliente real.

## Paso 5 — (opcional) Límites
Con SMTP propio podés subir los límites de envío en **Authentication → Rate Limits**
(el SMTP integrado de Supabase es muy limitado para producción).

## Nota multi-tenant
Estos correos de Supabase Auth son **globales del proyecto** (mismo diseño para
todos los tenants), por eso el branding es "Tito Apps". Para correos con el logo de
cada entrenador, hay que enviarlos con una Edge Function usando la API de Resend
directamente (queda como mejora futura).
