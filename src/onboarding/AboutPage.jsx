import { TrainerIllustration } from "./TrainerIllustration";
import { PLAN_LABELS } from "../plans/entitlements";

// Acerca de TrainSync — presenta el PRODUCTO (TrainSync by Tito Apps), no un tenant.
export function AboutPage() {
  const cards = [
    { icon: "👥", t: "Clientes organizados", d: "Toda la info de cada cliente en un solo lugar: datos, plan, contacto y notas. Se acabó el WhatsApp y el Excel disperso." },
    { icon: "📋", t: "Rutinas profesionales", d: "Armá rutinas con ejercicios, series, reps, peso, descansos e instrucciones. Asignalas a uno o varios clientes en segundos." },
    { icon: "🏋️", t: "Biblioteca de ejercicios", d: "Tu catálogo de ejercicios con video. Reutilizalos en cualquier rutina y mantené todo consistente." },
    { icon: "📊", t: "Progreso y mediciones", d: "Registrá mediciones (peso, grasa, masa muscular y más) y mirá la evolución de cada cliente en gráficas claras." },
    { icon: "🔔", t: "Recordatorios de pago", d: "Automatizá los avisos de vencimiento por email para que nadie se olvide de pagar la mensualidad." },
    { icon: "🎨", t: "Tu marca", d: "Tu logo, tus colores y tu nombre. Tus clientes ven tu marca, no la nuestra." },
    { icon: "🏅", t: "Retos y medallas", d: "Motivá a tus clientes: medallas automáticas según su meta semanal, retos entre ellos y una animación al ganar. Vos ves los logros de cada uno." },
  ];
  return (
    <div>
      <div className="ph"><div><div className="pt">Acerca de TrainSync</div><div className="ps">by Tito Apps</div></div></div>

      <div className="card" style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <TrainerIllustration size={200} />
        <div style={{ flex: "1 1 320px", minWidth: 260 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#0B1F4B", marginBottom: 6 }}>Entrená con propósito, gestioná con datos.</div>
          <p style={{ fontSize: 14, lineHeight: 1.65, color: "#334155" }}>
            <strong>TrainSync</strong> es la plataforma para entrenadores personales que quieren profesionalizar su negocio:
            administrá a tus clientes, creá y asigná rutinas, seguí el progreso con mediciones y métricas, y automatizá
            los recordatorios de pago. Todo en un solo lugar, con tu propia marca.
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "#64748B", marginTop: 8 }}>
            Pensada para el entrenador que hoy pierde tiempo armando rutinas a mano, no sabe cómo llevar el seguimiento
            y tiene la información repartida entre WhatsApp, notas y hojas de cálculo.
          </p>
        </div>
      </div>

      <div className="stats" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12, marginBottom: 14 }}>
        {cards.map((c) => (
          <div key={c.t} className="card">
            <div style={{ fontSize: 26, marginBottom: 6 }}>{c.icon}</div>
            <div style={{ fontWeight: 800, color: "#0B1F4B", marginBottom: 4 }}>{c.t}</div>
            <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.55 }}>{c.d}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ fontWeight: 800, color: "#0B1F4B", marginBottom: 8 }}>Planes</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          {[
            { p: "base", d: "Clientes, rutinas, ejercicios y asignación. Lo esencial para arrancar." },
            { p: "pro", d: "Todo Base + mediciones, historial y gráficas de progreso." },
            { p: "premium", d: "Todo Pro + recordatorios automáticos de pago por email, retos y medallas, y automatizaciones." },
          ].map((x) => (
            <div key={x.p} style={{ border: "1px solid #DDE4F0", borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 900, color: "#1A5DC8", marginBottom: 4 }}>{PLAN_LABELS[x.p]}</div>
              <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5 }}>{x.d}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 12, textAlign: "center" }}>
          TrainSync · by Tito Apps
        </div>
      </div>
    </div>
  );
}
