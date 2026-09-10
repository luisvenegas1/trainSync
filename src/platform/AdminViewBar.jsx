// Barra para el SUPERADMIN cuando entra a un tenant (god-mode). Permite alternar
// entre la vista de Coach y la de un Cliente específico, para revisar ambas
// experiencias con la misma cuenta (soporte / debugging). No es solo lectura.
export function AdminViewBar({ viewClientId, setViewClientId, clients = [], tenantName, currentUser }) {
  const isCoach = !viewClientId;
  const seg = (active) => ({
    border: "none", cursor: "pointer", fontFamily: "'Barlow',sans-serif",
    fontWeight: 800, fontSize: 12, padding: "6px 14px", borderRadius: 8,
    background: active ? "#F5A623" : "transparent",
    color: active ? "#0B1F4B" : "#fff",
  });
  return (
    <div style={{ background: "#0B1F4B", color: "#fff", border: "1px solid #1A2A54", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontFamily: "'Barlow',sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15 }}>🛡️</span>
        <span style={{ fontSize: 12, fontWeight: 800 }}>
          Modo superadmin{tenantName ? ` — ${tenantName}` : ""}. Tenés acceso total a este tenant (soporte).
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 1 }}>Ver como:</span>
        <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.08)", border: "1px solid #1A2A54", borderRadius: 10, padding: 3, gap: 2 }}>
          <button style={seg(isCoach)} onClick={() => setViewClientId(null)}>🧑‍🏫 Coach</button>
          <button style={seg(!isCoach)} onClick={() => setViewClientId(clients[0]?.id || null)} disabled={clients.length === 0}>🏃 Cliente</button>
        </div>
        {!isCoach && clients.length > 0 && (
          <select
            value={viewClientId || ""}
            onChange={(e) => setViewClientId(e.target.value)}
            style={{ fontFamily: "'Barlow',sans-serif", fontSize: 12, fontWeight: 700, color: "#0B1F4B", background: "#fff", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}
          >
            {clients.map((c) => (<option key={c.id} value={c.id}>{c.name || "Cliente"}</option>))}
          </select>
        )}
        {!isCoach && currentUser?.name && (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>Perfil de <strong>{currentUser.name}</strong></span>
        )}
      </div>
    </div>
  );
}
