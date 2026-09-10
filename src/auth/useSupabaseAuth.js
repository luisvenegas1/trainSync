import { useState, useEffect, useCallback } from "react";
import { sb } from "../supabase";
import {
  getSession,
  onAuthChange,
  signIn as doSignIn,
  signOut as doSignOut,
  loadMemberships,
  loadClientProfile,
  loadSubscription,
  loadIsSuperadmin,
} from "./authClient";
import { resolveAccess } from "./resolveAccess";
import { orgAccessFor } from "../subscription/subscription";

// Orquesta Supabase Auth para el modo VITE_AUTH_MODE=supabase.
//  - restaura la sesión oficial (getSession)
//  - escucha onAuthStateChange
//  - carga membresías + perfil de cliente (bajo RLS: solo lo propio)
//  - resuelve el acceso contra el tenant (hostname/slug) → owner/trainer/cliente/demo_viewer
//  - NO descarga hashes ni todos los usuarios antes del login
export function useSupabaseAuth(tenant) {
  const [state, setState] = useState({ status: "loading" });
  const [formError, setFormError] = useState(null);
  const tenantOrg = tenant?.org || null;

  const resolve = useCallback(
    async (session) => {
      if (!session) {
        setState({ status: "anonymous" });
        return;
      }
      try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
          setState({ status: "invalid_session" });
          return;
        }
        const [memberships, client, isSuperadmin] = await Promise.all([
          loadMemberships(),
          loadClientProfile(),
          loadIsSuperadmin(),
        ]);
        const profileName = user.user_metadata?.full_name || user.email || "";
        const res = resolveAccess({
          memberships,
          client,
          tenantOrg,
          authUid: user.id,
          profileName,
          isSuperadmin, // superadmin puede entrar a cualquier tenant
        });
        if (res.status !== "ready") {
          setState({ status: res.status, appUser: null, capabilityRole: null });
          return;
        }
        // Acceso concedido: ahora evaluar la SUSCRIPCIÓN de la org.
        const subscription = await loadSubscription(tenantOrg.id);
        const orgAccess = orgAccessFor({ role: res.role, subscription, isSuperadmin });
        setState({
          status: "ready",
          appUser: res.appUser,
          capabilityRole: res.role,
          orgAccess, // ok | billing | suspended
          subscription,
          isSuperadmin,
        });
      } catch (e) {
        console.error("auth resolve:", e);
        setState({ status: "invalid_session" });
      }
    },
    [tenantOrg]
  );

  useEffect(() => {
    let alive = true;
    let unsub = null;
    (async () => {
      const session = await getSession();
      if (!alive) return;
      await resolve(session);
      unsub = onAuthChange((s) => {
        if (alive) resolve(s);
      });
    })();
    return () => {
      alive = false;
      if (unsub) unsub();
    };
  }, [resolve]);

  const signIn = useCallback(async (email, password) => {
    setFormError(null);
    try {
      await doSignIn(email, password); // onAuthStateChange dispara resolve()
    } catch {
      setFormError("Correo o contraseña incorrectos.");
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await doSignOut();
    } catch (e) {
      console.error("signOut:", e);
    }
    setState({ status: "anonymous" });
  }, []);

  return { ...state, formError, signIn, signOut };
}
