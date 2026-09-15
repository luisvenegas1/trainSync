// Decide, de forma PURA (sin red), si a un cliente se le debe BLOQUEAR la vista de
// rutina/entrenamiento por tener la mensualidad vencida.
//
// Reglas (todas deben cumplirse para bloquear):
//   1. La organización activó el bloqueo (blockEnabled).
//   2. El cliente NO está eximido (billingExempt=false).
//   3. Tiene un plan con fecha de vencimiento (endDate) y NO está pausado.
//   4. Ya pasó la fecha de vencimiento + los días de gracia configurados.
//
// El bloqueo es opt-in por organización y afecta SOLO la rutina: el perfil, el
// historial y las mediciones del cliente siguen accesibles.

// Normaliza los días de gracia a un entero 0..365.
export function normalizeGraceDays(v) {
  const n = Math.round(Number(v) || 0);
  return Math.max(0, Math.min(365, n));
}

// Fecha límite (inclusive) hasta la cual el cliente conserva acceso: fin del día de
// vencimiento + los días de gracia. Devuelve un Date, o null si no aplica.
export function accessDeadline(endDate, graceDays = 0) {
  if (!endDate) return null;
  const end = new Date(endDate + "T23:59:59");
  if (isNaN(end)) return null;
  const d = new Date(end);
  d.setDate(d.getDate() + normalizeGraceDays(graceDays));
  return d;
}

export function routineBlocked({ plan, orgConfig, billingExempt = false, now = new Date() } = {}) {
  const cfg = orgConfig || {};
  if (!cfg.blockEnabled) return false;   // el coach no activó el bloqueo
  if (billingExempt) return false;       // el coach eximió a este cliente
  if (!plan || plan.paused) return false; // sin plan o plan pausado → no se bloquea
  const deadline = accessDeadline(plan.endDate, cfg.graceDays);
  if (!deadline) return false;           // sin fecha de vencimiento → no se bloquea
  return now.getTime() > deadline.getTime();
}

// Cuántos días de gracia le quedan (negativo = ya bloqueado, null = no aplica).
// Útil para avisos "te vence en X días" del lado del coach o del cliente.
export function graceDaysLeft({ plan, orgConfig, now = new Date() } = {}) {
  const cfg = orgConfig || {};
  if (!plan || plan.paused || !plan.endDate) return null;
  const deadline = accessDeadline(plan.endDate, cfg.graceDays);
  if (!deadline) return null;
  return Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
