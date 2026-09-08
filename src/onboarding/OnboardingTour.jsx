import { useLS } from "../trainsync.utils";

// Tour de bienvenida para el entrenador: checklist de primeros pasos, no invasivo,
// se puede cerrar y reabrir desde la Guía. Marca pasos hechos según datos reales.
export function OnboardingTour({ onGo, clientsCount = 0, routinesCount = 0 }) {
  const [dismissed, setDismissed] = useLS("ts_tour_dismissed", false);
  const [forced, setForced] = useLS("ts_tour_forced", false);
  // El onboarding se considera completo cuando el entrenador ya tiene al menos un
  // cliente y una rutina. En ese caso NO se muestra solo (un trainer ya establecido,
  // como Johel, no lo ve). Solo aparece la primera vez (sin datos) o si se reabre
  // explícitamente desde la Guía (forced).
  const onboardingComplete = clientsCount > 0 && routinesCount > 0;
  const show = forced || (!dismissed && !onboardingComplete);
  if (!show) return null;

  function close() { setDismissed(true); setForced(false); }

  const steps = [
    { n: 1, label: "Agregá tu primer cliente", done: clientsCount > 0, go: "clients" },
    { n: 2, label: "Creá una rutina", done: routinesCount > 0, go: "routines" },
    { n: 3, label: "Asigná la rutina a un cliente", done: false, go: "routines" },
    { n: 4, label: "Registrá mediciones", done: false, go: "clients" },
    { n: 5, label: "Revisá el progreso", done: false, go: "clients" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div style={{ background: "#fff", border: "1px solid #DDE4F0", borderRadius: 14, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 900, color: "#0B1F4B", fontSize: 16 }}>👋 Bienvenido a TrainSync</div>
          <div style={{ fontSize: 12, color: "#64748B" }}>Primeros pasos ({doneCount}/{steps.length})</div>
        </div>
        <button className="btn btn-g btn-sm" onClick={close}>Cerrar</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {steps.map((s) => (
          <button key={s.n} type="button" onClick={() => onGo(s.go)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid #E3E6EA", borderRadius: 10, background: s.done ? "#F0FBF3" : "#F8FAFC", cursor: "pointer", textAlign: "left" }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", background: s.done ? "#2E7D32" : "#1A5DC8", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{s.done ? "✓" : s.n}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0B1F4B", flex: 1 }}>{s.label}</span>
            <span style={{ color: "#94A3B8", fontSize: 12 }}>→</span>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 10 }}>Podés reabrir esta guía desde el menú <strong>Guía</strong>.</div>
    </div>
  );
}
