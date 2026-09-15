// TC-68 — Regresión: una sesión guardada inválida (token viejo/expirado, o Supabase
// reiniciado) NO debe dejar al usuario atrapado en la pantalla "Sesión inválida" al
// refrescar; debe limpiarse sola y mandar al login.
describe("Recuperación de sesión inválida", () => {
  it("TC-68 Token inválido en storage → refresco lleva al login, no a pantalla muerta", () => {
    cy.login("coach1-gimnasio-premium@test.local", "password123", "/gimnasio-premium");
    cy.contains("Inicio", { timeout: 15000 }).should("be.visible");

    // Simular sesión EXPIRADA con refresh inválido (token viejo, o Supabase reiniciado):
    // getSession detecta el vencimiento, intenta refrescar, falla y limpia la sesión.
    cy.window().then((win) => {
      Object.keys(win.localStorage).forEach((k) => {
        if (k.includes("auth-token")) {
          try {
            const v = JSON.parse(win.localStorage.getItem(k));
            v.expires_at = 1; // muy en el pasado → vencida
            v.expires_in = 0;
            v.refresh_token = "invalid-refresh-token";
            win.localStorage.setItem(k, JSON.stringify(v));
          } catch { /* si no parsea, lo dejamos */ }
        }
      });
    });

    cy.reload();
    // No debe quedar atrapado en la pantalla muerta…
    cy.contains("Sesión inválida").should("not.exist");
    // …y debe poder volver a iniciar sesión.
    cy.contains("button", "Ingresar", { timeout: 20000 }).should("be.visible");
  });
});
