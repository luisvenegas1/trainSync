// Barra superior de la app de demostración (solo tenant demo, sin login).
// Avisa que es una demo (funciones de escritura desactivadas) y permite cambiar
// entre la vista de Coach y la de Cliente, con selector de cuál cliente ver.
export function DemoTopBar({ viewClientId, setViewClientId, clients = [], currentUser }) {
  const isCoach = !viewClientId;
  const seg = (active) => ({
    border: "none", cursor: "pointer", fontFamily: "'Barlow',sans-serif",
    fontWeight: 800, fontSize: 12, padding: "6px 14px", borderRadius: 8,
    background: active ? "#7B1FA2" : "transparent",
    color: active ? "#fff" : "#7B1FA2",
  });
  return (
    <div style={{ background: "#F3E5F5", border: "1px solid #E1BEE7", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontFamily: "'Barlow',sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 16 }}>👀</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#7B1FA2" }}>
          Modo demostración — Estás explorando TrainSync con datos de ejemplo. Guardar y modificar datos está desactivado por seguridad.
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#8E24AA", textTransform: "uppercase", letterSpacing: 1 }}>Ver como:</span>
        <div style={{ display: "inline-flex", background: "#fff", border: "1px solid #E1BEE7", borderRadius: 10, padding: 3, gap: 2 }}>
          <button style={seg(isCoach)} onClick={() => setViewClientId(null)}>🧑‍🏫 Coach</button>
          <button style={seg(!isCoach)} onClick={() => setViewClientId(clients[0]?.id || null)}>🏃 Cliente</button>
        </div>
        {!isCoach && clients.length > 0 && (
          <select
            value={viewClientId || ""}
            onChange={(e) => setViewClientId(e.target.value)}
            style={{ fontFamily: "'Barlow',sans-serif", fontSize: 12, fontWeight: 700, color: "#4A148C", background: "#fff", border: "1px solid #E1BEE7", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}
          >
            {clients.map((c) => (<option key={c.id} value={c.id}>{c.name || "Cliente"}</option>))}
          </select>
        )}
        {!isCoach && currentUser?.name && (
          <span style={{ fontSize: 11, color: "#8E24AA" }}>Mostrando el perfil de <strong>{currentUser.name}</strong></span>
        )}
      </div>
    </div>
  );
}
