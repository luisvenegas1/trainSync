// TC-48 — Invitación de cliente: el coach da de alta un cliente y le llega el correo.
// (edge) Necesita las edge functions locales + Mailpit.
describe("Invitaciones por correo", () => {
  it("TC-48 Al crear un cliente, le llega el correo de invitación (Mailpit)", () => {
    cy.clearMailpit();
    cy.login("coach1-gimnasio-pro@test.local", "password123", "/gimnasio-pro");
    cy.get('[data-cy="nav-clients"]', { timeout: 15000 }).click();
    cy.contains("button", "+ Nuevo").click();
    cy.contains("Nuevo cliente").should("be.visible");
    cy.wait(600);
    cy.get('input[placeholder="María García"]').click().type("Cliente Correo E2E");
    cy.get('input[placeholder="maria@correo.com"]').click().type("cliente-correo-e2e@test.local");
    cy.contains("button", "Crear cliente").click();
    cy.contains("Cliente creado", { timeout: 15000 }).should("be.visible");
    // El cliente recibió su correo para crear la contraseña
    cy.mailpitWaitFor("cliente-correo-e2e@test.local");
  });
});
