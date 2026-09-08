// Módulo de autenticación (Supabase Auth). Se conecta a la app en modo
// VITE_AUTH_MODE=supabase (el legacy sigue disponible). Nunca descarga hashes ni
// todos los usuarios antes del login.
import { sb } from "../supabase";
import { dbToUser } from "../db";

export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data?.session || null;
}

export function onAuthChange(cb) {
  const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data?.subscription?.unsubscribe();
}

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

// Carga membresías (org + rol) del usuario autenticado. Con RLS activo, solo
// devuelve las del propio usuario. La membresía se valida en la BASE, no en el
// navegador.
//
// IMPORTANTE: filtra por el UUID del usuario Auth actual (`.eq("user_id", ...)`).
// Con RLS APAGADO, sin este filtro se traerían las membresías de TODOS los usuarios
// y `resolveAccess` podría darle a cualquiera un rol de owner/trainer del tenant.
// La identidad se toma de la sesión (sb.auth.getUser), nunca de localStorage.
export async function loadMemberships() {
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return [];
  const { data, error } = await sb
    .from("organization_members")
    .select("organization_id, role, organizations(slug, name, status, tenant_type)")
    .eq("user_id", u.user.id);
  if (error) throw error;
  return (data || []).map((m) => ({
    organizationId: m.organization_id,
    role: m.role,
    slug: m.organizations?.slug,
    name: m.organizations?.name,
    status: m.organizations?.status,
    tenantType: m.organizations?.tenant_type,
  }));
}

// Suscripción de una organización (o null si no hay fila). Bajo RLS, los miembros
// pueden leer la de su org aunque esté suspendida (pantalla de cuenta/facturación).
export async function loadSubscription(orgId) {
  if (!orgId) return null;
  const { data, error } = await sb
    .from("organization_subscriptions")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// ¿El usuario Auth actual es superadmin de la plataforma (soporte)?
export async function loadIsSuperadmin() {
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return false;
  const { data } = await sb
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", u.user.id)
    .maybeSingle();
  return !!data;
}

// Cambia la contraseña del USUARIO ACTUAL (su propia sesión) vía Supabase Auth.
// Devuelve { ok } o { ok:false, error } o { ok:false, legacy:true } si no hay
// sesión Auth (modo legacy: el llamador debe usar el flujo viejo).
export async function updateOwnPassword(newPassword) {
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return { ok: false, legacy: true };
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Envía el correo de "restablecer contraseña" de Supabase. redirectTo debe estar
// en la lista de Redirect URLs permitidas del proyecto (Auth → URL Configuration).
export async function sendPasswordReset(email, redirectTo) {
  const { error } = await sb.auth.resetPasswordForEmail(
    String(email || "").trim(),
    redirectTo ? { redirectTo } : undefined,
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// El ENTRENADOR resetea la contraseña de un cliente. Pasa por la Edge Function
// segura (service_role): verifica que el llamador sea owner/trainer de la org del
// cliente. El frontend NUNCA usa service_role.
export async function resetClientPassword(clientId, newPassword) {
  try {
    const { data, error } = await sb.functions.invoke("reset-client-password", {
      body: { client_id: clientId, new_password: newPassword },
    });
    if (error) {
      let detail = error.message;
      try { const b = await error.context?.json?.(); if (b?.error) detail = b.detail ? `${b.error}: ${b.detail}` : b.error; } catch { /* ignore */ }
      return { ok: false, error: detail };
    }
    if (data?.error) return { ok: false, error: data.detail ? `${data.error}: ${data.detail}` : data.error };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// El ENTRENADOR invita a un CLIENTE por correo. Pasa por la Edge Function segura:
// crea/enlaza la cuenta Auth del cliente y le manda un correo para que cree su
// contraseña. Devuelve { ok } o { ok:false, error }.
export async function inviteClient(clientId, email) {
  try {
    const { data, error } = await sb.functions.invoke("invite-client", {
      body: { client_id: clientId, email },
    });
    if (error) {
      let detail = error.message;
      try { const b = await error.context?.json?.(); if (b?.error) detail = b.detail ? `${b.error}: ${b.detail}` : b.error; } catch { /* ignore */ }
      return { ok: false, error: detail };
    }
    if (data?.error) return { ok: false, error: data.detail ? `${data.error}: ${data.detail}` : data.error };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// El OWNER invita a un ADMIN/co-entrenador por correo. Pasa por la Edge Function
// segura: crea/enlaza su cuenta Auth, lo agrega como miembro (role='trainer') y le
// manda un correo para crear su contraseña. Devuelve { ok } o { ok:false, error }.
export async function inviteTrainer(email, name) {
  try {
    const { data, error } = await sb.functions.invoke("invite-trainer", {
      body: { email, name },
    });
    if (error) {
      let detail = error.message;
      try { const b = await error.context?.json?.(); if (b?.error) detail = b.detail ? `${b.error}: ${b.detail}` : b.error; } catch { /* ignore */ }
      return { ok: false, error: detail };
    }
    if (data?.error) return { ok: false, error: data.detail ? `${data.error}: ${data.detail}` : data.error };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// Cliente (users) vinculado al usuario Auth actual (o null), en formato app.
// Bajo RLS, esta consulta devuelve SOLO la fila propia del cliente.
export async function loadClientProfile() {
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return null;
  const { data, error } = await sb
    .from("users")
    .select("*")
    .eq("auth_user_id", u.user.id)
    .maybeSingle();
  if (error) throw error;
  return data ? dbToUser(data) : null;
}
