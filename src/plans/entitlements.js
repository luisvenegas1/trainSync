// ═══════════════════════════════════════════════════════════════
//  Entitlements por plan (PURO). Define qué FEATURES tiene cada plan.
//  Modelo: PLAN → FEATURES → ORGANIZATION.
//  La UI usa esto para mostrar/gatear, pero la seguridad REAL de las features
//  sensibles (p.ej. envío de recordatorios) la impone también el backend/RLS.
//
//  Agregar una feature nueva es solo añadir la clave acá; no rehace la app.
// ═══════════════════════════════════════════════════════════════
export const PLANS = ["base", "pro", "premium"];

export const PLAN_LABELS = { base: "Base", pro: "Pro", premium: "Premium" };

// Feature flags por plan. Premium ⊇ Pro ⊇ Base.
export const PLAN_FEATURES = {
  base: {
    workouts: true,          // clientes, rutinas, ejercicios, asignación
    measurements: false,     // registro de mediciones
    analytics: false,        // gráficas/estadísticas de progreso
    payment_reminders: false,// recordatorios automáticos por email
    custom_branding: true,   // logo/colores por org
    challenges: false,       // gamificación: retos y medallas
    // futuras: advanced_reports, client_notifications, automations, ...
  },
  pro: {
    workouts: true,
    measurements: true,
    analytics: true,
    payment_reminders: false,
    custom_branding: true,
    challenges: false,
  },
  premium: {
    workouts: true,
    measurements: true,
    analytics: true,
    payment_reminders: true,
    custom_branding: true,
    challenges: false,
  },
};

// Features que se pueden activar/desactivar por organización desde el Panel de
// Plataforma (overrides). Solo las que tiene sentido togglear por tenant.
export const FEATURE_CATALOG = [
  { key: "measurements", label: "Mediciones", desc: "Registro de mediciones corporales del cliente." },
  { key: "analytics", label: "Analítica / Historial", desc: "Gráficas y seguimiento de progreso." },
  { key: "payment_reminders", label: "Recordatorios de pago", desc: "Correos automáticos antes del vencimiento (requiere config del entrenador)." },
  { key: "challenges", label: "Retos y medallas (beta)", desc: "Gamificación: medallas y retos entre clientes. En pruebas: apagado para todos salvo que lo actives (‘Activada’) en un tenant." },
];

// Normaliza un plan desconocido a 'base'.
export function normalizePlan(plan) {
  const p = String(plan || "").toLowerCase();
  return PLANS.includes(p) ? p : "base";
}

// Objeto de features del plan (siempre devuelve algo válido).
export function planFeatures(plan) {
  return PLAN_FEATURES[normalizePlan(plan)] || PLAN_FEATURES.base;
}

// Módulos EN PRUEBAS (beta): están apagados para TODOS por defecto (incluso Premium)
// y NO se pueden activar por plan — solo con un override explícito "Activada" por
// organización. Así un módulo nuevo nunca aparece por error mientras se prueba; el
// superadmin lo enciende a mano en el tenant que quiera. Cuando esté 100%, se saca
// de acá y se mete al plan que corresponda.
export const BETA_FEATURES = new Set(["challenges"]);

// Features EFECTIVAS = features del plan + overrides POR ORGANIZACIÓN.
// Los overrides (organization_settings.feature_overrides, jsonb) permiten activar
// (o desactivar) una feature para un tenant específico sin cambiar su plan.
// Solo se aplican valores booleanos; cualquier otra cosa se ignora (seguro).
export function effectiveFeatures(plan, overrides) {
  const base = { ...planFeatures(plan) };
  const ov = overrides && typeof overrides === "object" ? overrides : {};
  for (const [key, val] of Object.entries(ov)) {
    if (typeof val === "boolean") base[key] = val;
  }
  // Módulos beta: off salvo override explícito === true (nunca por plan).
  for (const key of BETA_FEATURES) {
    if (ov[key] !== true) base[key] = false;
  }
  return base;
}

// ¿El plan incluye esta feature?
export function hasFeature(plan, feature) {
  return !!planFeatures(plan)[feature];
}

// Plan mínimo requerido para una feature (para mensajes de upsell).
export function minPlanFor(feature) {
  for (const p of PLANS) {
    if (PLAN_FEATURES[p][feature]) return p;
  }
  return null;
}

// Texto corto de upsell para una feature bloqueada.
export function upsellFor(feature) {
  const min = minPlanFor(feature);
  const label = min ? PLAN_LABELS[min] : "un plan superior";
  const msgs = {
    measurements: `Las mediciones son parte del plan ${label}.`,
    analytics: `Las gráficas de progreso son parte del plan ${label}.`,
    payment_reminders: `Los recordatorios automáticos de pago son parte del plan ${label}.`,
  };
  return msgs[feature] || `Esta función requiere el plan ${label}.`;
}
