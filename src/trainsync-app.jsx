import { useState, useEffect, useCallback } from "react";
import {
  getUsers, upsertUser, deleteUser,
  getExercises, upsertExercise, deleteExercise,
  getRoutines, upsertRoutine, deleteRoutine, setRoutineAssignments,
  getMeasurements, upsertMeasurement, deleteMeasurement,
  getPayments, upsertPayment, deletePayment,
  getWorkoutSessions, upsertWorkoutSession, deleteWorkoutSession,
  getCatalogs, setCatalogCategory,
} from "./db";
import { CatalogContext, buildCatalogValue } from "./trainsync.catalogs";
import { STYLES } from "./trainsync.styles";
import { LoginPage, Sidebar, AppFooter } from "./trainsync.ui";
import {
  AdminsPage, ClientsPage, Dashboard, ExercisesPage,
  MyProfilePage, MyRoutinePage, RoutinesPage,
} from "./trainsync.features";
import { useTenant } from "./tenant/tenantContext";
import { useSupabaseAuth } from "./auth/useSupabaseAuth";
import { AuthLoading, SupabaseLogin, AuthErrorScreen, DemoBanner, SuspendedScreen, BillingScreen, SetNewPasswordScreen } from "./auth/AuthScreens";
import { sb } from "./supabase";
import { PermissionsContext } from "./auth/PermissionsContext";
import { effectiveFeatures } from "./plans/entitlements";
import { AboutPage } from "./onboarding/AboutPage";
import { GuidePage } from "./onboarding/GuidePage";
import { RemindersPage } from "./reminders/RemindersPage";
import { OnboardingTour } from "./onboarding/OnboardingTour";
import { DemoTopBar } from "./demo/DemoTopBar";
import { ChallengesPage } from "./gamification/GamificationUI";

// Modo de autenticación. Por defecto LEGACY: la app se comporta EXACTAMENTE como
// hoy. VITE_AUTH_MODE=supabase activa el login por Supabase Auth (no se elimina el
// legacy: es un flag).
const AUTH_MODE =
  String(import.meta.env.VITE_AUTH_MODE || "legacy").toLowerCase() === "supabase"
    ? "supabase"
    : "legacy";

// ── Pantallas base ──────────────────────────────────────────────
function LoadingScreen() {
  return (<><style>{STYLES}</style><div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16, background: "#F4F6FB" }}><div style={{ width: 48, height: 48, border: "4px solid #DDE4F0", borderTop: "4px solid #1A5DC8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 14, color: "#6B7A99" }}>Cargando...</div><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div></>);
}
function DbErrorScreen({ msg }) {
  return (<><style>{STYLES}</style><div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 12, background: "#F4F6FB", padding: 24, textAlign: "center" }}><div style={{ fontSize: 32 }}>⚠️</div><div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 16, color: "#E53935", fontWeight: 700 }}>{msg}</div><button className="btn btn-p" onClick={() => window.location.reload()}>Reintentar</button></div></>);
}

// ── Hook de datos compartido (misma capa para legacy y supabase) ──
function useAppData() {
  const [exercises, setExercisesState] = useState([]);
  const [users, setUsersState] = useState([]);
  const [routines, setRoutinesState] = useState([]);
  const [measurements, setMeasurementsState] = useState([]);
  const [payments, setPaymentsState] = useState([]);
  const [workoutSessions, setWorkoutSessionsState] = useState([]);
  const [catalogOverrides, setCatalogOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);

  // Carga inicial. Bajo RLS (modo supabase) cada consulta devuelve SOLO lo que el
  // usuario puede ver (su organización, o solo lo suyo si es cliente): no descarga
  // datos de otras organizaciones. En legacy (RLS off) devuelve todo como hoy.
  const load = useCallback(async () => {
    try {
      const [u, ex, rt, ms, pm] = await Promise.all([getUsers(), getExercises(), getRoutines(), getMeasurements(), getPayments()]);
      if (u.length > 0) setUsersState(u);
      if (ex.length > 0) setExercisesState(ex);
      setRoutinesState(rt);
      setMeasurementsState(ms);
      setPaymentsState(pm);
      try { const ws = await getWorkoutSessions(); setWorkoutSessionsState(ws); }
      catch (e) { console.warn("Entrenamientos no disponibles (¿falta correr supabase-entrenamientos.sql?):", e); }
      try { const cats = await getCatalogs(); setCatalogOverrides(cats); }
      catch (e) { console.warn("Catálogos no disponibles (¿falta correr supabase-catalogos.sql?):", e); }
    } catch (e) {
      console.error("Error cargando datos:", e);
      setDbError("No se pudo conectar a la base de datos. Revisá tu conexión.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function setUsers(newUsers) {
    const prev = users; setUsersState(newUsers);
    const deleted = prev.filter((p) => !newUsers.find((n) => n.id === p.id));
    const changed = newUsers.filter((n) => { const old = prev.find((p) => p.id === n.id); return !old || JSON.stringify(old) !== JSON.stringify(n); });
    try { await Promise.all([...changed.map((u) => upsertUser(u)), ...deleted.map((u) => deleteUser(u.id))]); }
    catch (e) { setUsersState(prev); console.error("Error guardando usuario:", e); throw e; }
  }
  async function setExercises(newExercises) {
    const prev = exercises; setExercisesState(newExercises);
    const deleted = prev.filter((p) => !newExercises.find((n) => n.id === p.id));
    const changed = newExercises.filter((n) => { const old = prev.find((p) => p.id === n.id); return !old || JSON.stringify(old) !== JSON.stringify(n); });
    try { await Promise.all([...changed.map((ex) => upsertExercise(ex)), ...deleted.map((ex) => deleteExercise(ex.id))]); }
    catch (e) { setExercisesState(prev); console.error("Error guardando ejercicio:", e); throw e; }
  }
  async function setRoutines(newRoutines) {
    const prev = routines; setRoutinesState(newRoutines);
    const deleted = prev.filter((p) => !newRoutines.find((n) => n.id === p.id));
    const changed = newRoutines.filter((n) => { const old = prev.find((p) => p.id === n.id); return !old || JSON.stringify(old) !== JSON.stringify(n); });
    try { await Promise.all([...changed.map((rt) => upsertRoutine(rt)), ...deleted.map((rt) => deleteRoutine(rt.id))]); }
    catch (e) { setRoutinesState(prev); console.error("Error guardando rutina:", e); throw e; }
  }
  async function setMeasurements(newMs) {
    const prev = measurements; setMeasurementsState(newMs);
    const deleted = prev.filter((p) => !newMs.find((n) => n.id === p.id));
    const changed = newMs.filter((n) => { const old = prev.find((p) => p.id === n.id); return !old || JSON.stringify(old) !== JSON.stringify(n); });
    try { await Promise.all([...changed.map((m) => upsertMeasurement(m)), ...deleted.map((m) => deleteMeasurement(m.id))]); }
    catch (e) { setMeasurementsState(prev); console.error("Error guardando medición:", e); throw e; }
  }
  async function setPayments(newPs) {
    const prev = payments; setPaymentsState(newPs);
    const deleted = prev.filter((p) => !newPs.find((n) => n.id === p.id));
    const changed = newPs.filter((n) => { const old = prev.find((p) => p.id === n.id); return !old || JSON.stringify(old) !== JSON.stringify(n); });
    try { await Promise.all([...changed.map((p) => upsertPayment(p)), ...deleted.map((p) => deletePayment(p.id))]); }
    catch (e) { setPaymentsState(prev); console.error("Error guardando pago:", e); throw e; }
  }
  async function setWorkoutSessions(newWs) {
    const prev = workoutSessions; setWorkoutSessionsState(newWs);
    const deleted = prev.filter((p) => !newWs.find((n) => n.id === p.id));
    const changed = newWs.filter((n) => { const old = prev.find((p) => p.id === n.id); return !old || JSON.stringify(old) !== JSON.stringify(n); });
    try { await Promise.all([...changed.map((s) => upsertWorkoutSession(s)), ...deleted.map((s) => deleteWorkoutSession(s.id))]); }
    catch (e) { setWorkoutSessionsState(prev); console.error("Error guardando entrenamiento:", e); throw e; }
  }
  async function saveCategory(dbCat, labels) {
    setCatalogOverrides((prev) => ({ ...prev, [dbCat]: labels }));
    try { await setCatalogCategory(dbCat, labels); }
    catch (e) { console.error("Error guardando catálogo:", e); throw e; }
  }
  const catalogValue = buildCatalogValue(catalogOverrides, saveCategory);

  // Asigna una rutina a un conjunto de usuarios (persiste + refleja en estado).
  async function saveRoutineAssignments(routineId, userIds) {
    const prev = routines;
    setRoutinesState((rs) => rs.map((r) => (r.id === routineId ? { ...r, assignedUserIds: userIds } : r)));
    try { await setRoutineAssignments(routineId, userIds); }
    catch (e) { setRoutinesState(prev); console.error("Error guardando asignaciones:", e); throw e; }
  }

  return {
    exercises, users, routines, measurements, payments, workoutSessions,
    loading, dbError, load, catalogValue,
    setUsers, setExercises, setRoutines, setMeasurements, setPayments, setWorkoutSessions,
    saveRoutineAssignments,
  };
}

// ── Shell autenticado (idéntico para ambos modos) ───────────────
function MainApp({ currentUser, capabilityRole = "owner", onLogout, data, isSuperadmin = false, plan = "premium", demoControls = null }) {
  const [page, setPage] = useState(currentUser.role === "trainer" ? "dashboard" : "my-routine");
  const isT = currentUser.role === "trainer";
  const liveUser = isT ? currentUser : (data.users.find((u) => u.id === currentUser.id) || currentUser);
  const readOnly = capabilityRole === "demo_viewer";
  // Features efectivas = plan + overrides por organización (tenant de prueba, etc.)
  const tenant = useTenant();
  const features = effectiveFeatures(plan, tenant?.featureOverrides);

  let content;
  if (page === "about") content = <AboutPage />;
  else if (page === "guide") content = <GuidePage isTrainer={isT} plan={plan} />;
  else if (isT) {
    if (page === "dashboard") content = <Dashboard users={data.users} routines={data.routines} />;
    else if (page === "clients") content = <ClientsPage users={data.users} setUsers={data.setUsers} routines={data.routines} measurements={data.measurements} setMeasurements={data.setMeasurements} payments={data.payments} setPayments={data.setPayments} workoutSessions={data.workoutSessions} setWorkoutSessions={data.setWorkoutSessions} exercises={data.exercises} selectedClientId={null} />;
    else if (page === "routines") content = <RoutinesPage routines={data.routines} setRoutines={data.setRoutines} users={data.users} setUsers={data.setUsers} exercises={data.exercises} saveRoutineAssignments={data.saveRoutineAssignments} />;
    else if (page === "exercises") content = <ExercisesPage exercises={data.exercises} setExercises={data.setExercises} />;
    else if (page === "reminders") content = <RemindersPage />;
    else if (page === "challenges") content = <ChallengesPage />;
    else if (page === "admins") content = <AdminsPage />;
  } else {
    if (page === "my-routine") content = <MyRoutinePage user={liveUser} routines={data.routines} exercises={data.exercises} workoutSessions={data.workoutSessions} setWorkoutSessions={data.setWorkoutSessions} />;
    else if (page === "my-profile") content = <MyProfilePage user={liveUser} setUsers={data.setUsers} users={data.users} measurements={data.measurements} workoutSessions={data.workoutSessions} setWorkoutSessions={data.setWorkoutSessions} exercises={data.exercises} />;
  }

  return (
    <CatalogContext.Provider value={data.catalogValue}>
      <PermissionsContext.Provider value={{ role: capabilityRole, readOnly, plan, features }}>
        <style>{STYLES}</style>
        <div className="app">
          <Sidebar user={liveUser} page={page} setPage={setPage} onLogout={onLogout} isSuperadmin={isSuperadmin} features={features} />
          <main className="main">
            {readOnly && (demoControls ? <DemoTopBar {...demoControls} currentUser={currentUser} /> : <DemoBanner />)}
            {isT && !readOnly && <OnboardingTour onGo={setPage} clientsCount={data.users.filter((u) => u.role !== "trainer").length} routinesCount={data.routines.length} />}
            {content}
            <AppFooter />
          </main>
        </div>
      </PermissionsContext.Provider>
    </CatalogContext.Provider>
  );
}

// ── Raíz LEGACY (comportamiento actual, sin cambios funcionales) ──
function LegacyApp() {
  const data = useAppData();
  const { load, users } = data;
  const [currentUser, setCurrentUser] = useState(() => {
    try { const s = localStorage.getItem("jh_session"); return s ? JSON.parse(s) : null; } catch { return null; }
  });

  useEffect(() => { load(); }, [load]);

  // Refrescar la sesión del cliente con datos actualizados de Supabase.
  useEffect(() => {
    if (currentUser && currentUser.role !== "trainer" && users.length > 0) {
      const fresh = users.find((u) => u.id === currentUser.id);
      if (fresh) localStorage.setItem("jh_session", JSON.stringify(fresh));
    }
  }, [currentUser, users]);

  function login(u) { localStorage.setItem("jh_session", JSON.stringify(u)); setCurrentUser(u); }
  function logout() { localStorage.removeItem("jh_session"); setCurrentUser(null); }

  if (data.loading) return <LoadingScreen />;
  if (data.dbError) return <DbErrorScreen msg={data.dbError} />;
  if (!currentUser) return (<><style>{STYLES}</style><LoginPage onLogin={login} users={users} /></>);
  return <MainApp currentUser={currentUser} onLogout={logout} data={data} />;
}

// ── Raíz DEMO (tenant demo, SIN login) ──────────────────────────
// Entra directo en modo solo lectura y permite alternar Coach ↔ Cliente.
// La lectura anónima de datos la habilita la migración 0028 (solo la org demo).
function DemoApp() {
  const data = useAppData();
  const { load } = data;
  const [viewClientId, setViewClientId] = useState(null); // null = vista Coach

  useEffect(() => { load(); }, [load]);

  if (data.loading) return <LoadingScreen />;
  if (data.dbError) return <DbErrorScreen msg={data.dbError} />;

  const clients = data.users.filter((u) => u.role !== "trainer");
  const coachUser = { id: "demo-coach", role: "trainer", name: "Coach (demo)" };
  const clientUser = viewClientId ? (clients.find((c) => c.id === viewClientId) || clients[0]) : null;
  const currentUser = clientUser || coachUser;

  // key: al alternar Coach/Cliente (o entre clientes) se remonta MainApp para que
  // la página inicial sea la correcta de ese perfil. El estado del switch vive acá.
  return (
    <MainApp
      key={viewClientId || "coach"}
      currentUser={currentUser}
      capabilityRole="demo_viewer"
      plan="premium"
      data={data}
      onLogout={() => { try { window.location.reload(); } catch { /* ignore */ } }}
      demoControls={{ viewClientId, setViewClientId, clients }}
    />
  );
}

// ── Raíz SUPABASE (login real por Auth; el legacy sigue disponible) ──
function SupabaseApp() {
  const tenant = useTenant();
  const auth = useSupabaseAuth(tenant);
  const data = useAppData();
  const { load } = data;
  const ready = auth.status === "ready";

  // Fijar contraseña: al volver del enlace del correo (invitación de un entrenador
  // nuevo, o recuperación de contraseña), forzamos poner la clave antes de entrar.
  // El tipo se captura en index.html (window.__authFlow) por si el evento no llega.
  const [recovery, setRecovery] = useState(() => {
    const t = typeof window !== "undefined" ? window.__authFlow : null;
    return t === "recovery" || t === "invite";
  });
  useEffect(() => {
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  // Tenant demo SIN sesión → app de demostración pública (sin login, solo lectura).
  const isDemoTenant = tenant?.org?.tenant_type === "demo" || tenant?.slug === "titotrainer";

  if (recovery) return (<><style>{STYLES}</style><SetNewPasswordScreen onDone={() => { try { window.__authFlow = null; } catch { /* ignore */ } setRecovery(false); }} /></>);
  if (auth.status === "loading") return <AuthLoading />;
  if (isDemoTenant && auth.status === "anonymous") return <DemoApp />;
  if (auth.status === "anonymous") return (<><style>{STYLES}</style><SupabaseLogin onSubmit={auth.signIn} formError={auth.formError} /></>);
  if (!ready) return (<><style>{STYLES}</style><AuthErrorScreen kind={auth.status} slug={tenant?.slug} onLogout={auth.signOut} /></>);
  // Suscripción de la org: si está bloqueada, no se carga NINGÚN dato operativo
  // (RLS también lo bloquea). Owner ve facturación; el resto, pantalla de suspensión.
  if (auth.orgAccess === "suspended") return (<><style>{STYLES}</style><SuspendedScreen onLogout={auth.signOut} /></>);
  if (auth.orgAccess === "billing") return (<><style>{STYLES}</style><BillingScreen subscription={auth.subscription} onLogout={auth.signOut} /></>);
  if (data.loading) return <LoadingScreen />;
  if (data.dbError) return <DbErrorScreen msg={data.dbError} />;
  return <MainApp currentUser={auth.appUser} capabilityRole={auth.capabilityRole} onLogout={auth.signOut} data={data} isSuperadmin={auth.isSuperadmin} plan={auth.subscription?.plan || "base"} />;
}

export default function App() {
  return AUTH_MODE === "supabase" ? <SupabaseApp /> : <LegacyApp />;
}
