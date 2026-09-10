import { useState } from "react";
import { useLS } from "../trainsync.utils";
import { PLAN_LABELS, PLAN_FEATURES, normalizePlan } from "../plans/entitlements";

const FEATURE_LABELS = {
  workouts: "Clientes, rutinas y ejercicios",
  measurements: "Mediciones",
  analytics: "Gráficas de progreso",
  payment_reminders: "Recordatorios de pago automáticos",
  custom_branding: "Marca propia (logo/colores)",
  challenges: "Retos y medallas",
};

const TRAINER_STEPS = [
  { t: "1. Agregar un cliente", d: "En Clientes → “+ Nuevo”. Completá nombre y correo. Al crear, el cliente recibe un email para crear su propia contraseña. Ya no se usan contraseñas temporales." },
  { t: "2. Editar un cliente", d: "Entrá a un cliente y usá “Editar” para actualizar datos, plan y estado. Desde ahí también podés generar/reenviar su acceso." },
  { t: "3. Crear una rutina", d: "En Rutinas → “Nueva rutina”. Agregá días, grupos y ejercicios con series, reps, peso, descanso e instrucciones." },
  { t: "4. Agregar ejercicios", d: "En Ejercicios → “+ Nuevo”. Cargá nombre, grupo muscular, equipo y el video de YouTube. Quedan en tu biblioteca para reutilizarlos." },
  { t: "5. Asignar una rutina", d: "Desde la rutina, asignala a uno o varios clientes. Cada cliente ve su rutina activa al entrar." },
  { t: "6. Revisar el progreso", d: "Entrá a un cliente → Historial/Progreso para ver la evolución de sus mediciones en gráficas. (Plan Pro o superior)." },
  { t: "7. Registrar mediciones", d: "En el cliente → Mediciones, registrá peso, grasa, masa muscular y más. Se guardan con fecha para armar el historial. (Plan Pro o superior)." },
  { t: "8. Configurar recordatorios", d: "En Ajustes de recordatorios elegí cuántos días antes del vencimiento avisar por email. (Plan Premium)." },
  { t: "9. Retos y medallas", d: "En Retos activás las medallas automáticas: cada cliente gana bronce/plata/oro según el % de su meta semanal (los días/semana de su rutina) que cumple. Podés crear retos entre clientes y ver los logros de cada uno. Tus clientes ven sus medallas, trofeos y progreso en su perfil, con una animación al ganar. (Plan Premium)." },
  { t: "10. La mensualidad", d: "Cada cliente tiene un plan con fecha de vencimiento. Los recordatorios te ayudan a que nadie se olvide de pagar." },
  { t: "11. Qué incluye cada plan", d: "Base: gestión y rutinas. Pro: + mediciones y progreso. Premium: + recordatorios automáticos y retos y medallas. Ver el detalle abajo." },
];

const CLIENT_STEPS = [
  { t: "1. Tu rutina", d: "En Rutina ves tu plan del día. Tocá “Iniciar” el día que entrenás para registrarlo." },
  { t: "2. Tu progreso", d: "En Perfil → Historial y Mediciones ves cómo vas avanzando." },
  { t: "3. Tus medallas", d: "Si tu entrenador las activó, en Perfil → Medallas ves la medalla de la semana según tu meta, tus trofeos, retos ganados y tu progreso de peso. Al completar tu meta, ¡te aparece una animación!" },
  { t: "4. Tus datos", d: "En Perfil podés editar tus datos y cambiar tu contraseña." },
];

export function GuidePage({ isTrainer = true, plan = "premium" }) {
  const [, setTourDismissed] = useLS("ts_tour_dismissed", false);
  const [, setTourForced] = useLS("ts_tour_forced", false);
  const [open, setOpen] = useState(null);
  // Reabrir el tour de forma explícita: se muestra aunque el onboarding esté completo.
  function reopenTour() { setTourDismissed(false); setTourForced(true); }
  const steps = isTrainer ? TRAINER_STEPS : CLIENT_STEPS;
  const p = normalizePlan(plan);

  return (
    <div>
      <div className="ph"><div><div className="pt">Guía {isTrainer ? "para el Trainer" : "rápida"}</div><div className="ps">Todo lo que podés hacer en TrainSync</div></div>
        {isTrainer && <button className="btn btn-p" onClick={reopenTour}>▶ Reabrir tour</button>}
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 14 }}>
        {steps.map((s, i) => (
          <div key={s.t} style={{ borderTop: i ? "1px solid #EEF1F7" : "none" }}>
            <button type="button" onClick={() => setOpen(open === i ? null : i)}
              style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 800, color: "#0B1F4B", fontSize: 14 }}>{s.t}</span>
              <span style={{ color: "#94A3B8" }}>{open === i ? "−" : "+"}</span>
            </button>
            {open === i && <div style={{ padding: "0 16px 14px", fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{s.d}</div>}
          </div>
        ))}
      </div>

      {isTrainer && (
        <div className="card">
          <div style={{ fontWeight: 800, color: "#0B1F4B", marginBottom: 10 }}>Qué incluye cada plan</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#64748B" }}>
                  <th style={{ padding: "6px 8px" }}>Función</th>
                  {["base", "pro", "premium"].map((pl) => (
                    <th key={pl} style={{ padding: "6px 8px", textAlign: "center", color: pl === p ? "#1A5DC8" : "#64748B" }}>{PLAN_LABELS[pl]}{pl === p ? " ✓" : ""}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(FEATURE_LABELS).map((feat) => (
                  <tr key={feat} style={{ borderTop: "1px solid #EEF1F7" }}>
                    <td style={{ padding: "8px", color: "#334155" }}>{FEATURE_LABELS[feat]}</td>
                    {["base", "pro", "premium"].map((pl) => (
                      <td key={pl} style={{ padding: "8px", textAlign: "center" }}>{PLAN_FEATURES[pl][feat] ? "✅" : "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 10 }}>Tu plan actual: <strong>{PLAN_LABELS[p]}</strong>. Para cambiarlo, contactá a Tito Apps.</div>
        </div>
      )}
    </div>
  );
}
