// Comando de login por UI. `path` = tenant por ruta (/gimnasio-premium) o /platform.
Cypress.Commands.add("login", (email, password, path = "/") => {
  cy.visit(path);
  // Esperar a que el formulario de login esté montado y estable (la app hace un
  // chequeo de sesión asíncrono que re-renderiza una vez al entrar).
  cy.contains("button", "Ingresar", { timeout: 15000 }).should("be.visible");
  cy.wait(400);
  // En una visita fresca los campos están vacíos → no hace falta clear().
  cy.get('input[type="email"]').type(email);
  cy.get('input[autocomplete="current-password"]').type(password, { log: false });
  cy.contains("button", "Ingresar").click();
});

// ── Mailpit (buzón local de correos) ─────────────────────────────
const MAILPIT = "http://127.0.0.1:54324/api/v1";

// Vacía el buzón (para que las aserciones de correo partan limpias).
Cypress.Commands.add("clearMailpit", () => {
  cy.request({ method: "DELETE", url: `${MAILPIT}/messages`, failOnStatusCode: false });
});

// Espera hasta que llegue un correo dirigido a `email` (reintenta unos segundos).
Cypress.Commands.add("mailpitWaitFor", (email, tries = 20) => {
  function check(n) {
    return cy.request(`${MAILPIT}/messages`).then((res) => {
      const msgs = res.body.messages || [];
      const found = msgs.find((m) => (m.To || []).some((t) => (t.Address || "").toLowerCase() === email.toLowerCase()));
      if (found) return found;
      if (n <= 0) throw new Error(`No llegó ningún correo a ${email} en Mailpit`);
      cy.wait(500);
      return check(n - 1);
    });
  }
  return check(tries);
});

// Devuelve el link de recuperación/invitación (URL /auth/v1/verify) del correo a `email`.
Cypress.Commands.add("mailpitLinkFor", (email) => {
  return cy.mailpitWaitFor(email).then((msg) => {
    return cy.request(`${MAILPIT}/message/${msg.ID}`).then((res) => {
      const body = `${res.body.HTML || ""} ${res.body.Text || ""}`;
      const m = body.match(/https?:\/\/[^\s"'<>]*\/auth\/v1\/verify[^\s"'<>]*/);
      expect(m, "el correo trae un link de verificación").to.not.be.null;
      return m[0].replace(/&amp;/g, "&");
    });
  });
});
