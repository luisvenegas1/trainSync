// TC-46 — Admins/invitaciones (edge/Mailpit): el owner invita a un co-entrenador.
describe("Administradores", () => {
  it("TC-46 El owner invita a un admin → correo en Mailpit + aparece en la lista", () => {
    cy.clearMailpit();
    cy.login("coach1-gimnasio-pro@test.local", "password123", "/gimnasio-pro"); // owner
    cy.get('[data-cy="nav-admins"]', { timeout: 15000 }).click();
    cy.contains("button", "+ Nuevo admin").click();
    cy.contains("Invitar administrador").should("be.visible");
    cy.get('input[placeholder="Ej: Ana Pérez"]').type("Admin E2E");
    cy.get('input[placeholder="ana@correo.com"]').type("admin-e2e@test.local");
    cy.contains("button", "Enviar invitación").click();
    cy.contains("Admin E2E", { timeout: 15000 }).should("be.visible");
    cy.mailpitWaitFor("admin-e2e@test.local");
  });
});
