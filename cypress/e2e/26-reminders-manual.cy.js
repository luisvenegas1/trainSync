// TC-64..67 — Recordatorio manual + historial + aviso de SaaS.
// Nota: el envío real de estos correos usa Resend (no Mailpit), así que estos TCs
// verifican el CABLEADO y el gating de la UI, no la entrega del correo (eso se
// valida manualmente / en prod, igual que el cron de recordatorios).
describe("Recordatorios manuales y aviso de SaaS", () => {
  it("TC-64 Coach Premium ve el botón de recordatorio y abre la confirmación", () => {
    cy.login("coach1-gimnasio-premium@test.local", "password123", "/gimnasio-premium");
    cy.get('[data-cy="nav-clients"]', { timeout: 15000 }).click();
    cy.contains("tr", "Cliente 2 Gimnasio Premium").click(); // Cliente 1 lo transfiere la tanda 02
    cy.contains(".tab", "Pagos").click();
    cy.get('[data-cy="send-reminder"]', { timeout: 15000 }).click();
    cy.contains("¿Enviar un recordatorio", { timeout: 15000 }).should("be.visible");
    cy.get('[data-cy="send-reminder-confirm"]').should("be.visible");
  });

  it("TC-65 Coach Base NO ve el botón de recordatorio (gating Premium)", () => {
    cy.login("coach1-gimnasio-base@test.local", "password123", "/gimnasio-base");
    cy.get('[data-cy="nav-clients"]', { timeout: 15000 }).click();
    cy.contains("tr", "Cliente 1 Gimnasio Base").click();
    cy.contains(".tab", "Pagos").click();
    cy.get('[data-cy="send-reminder"]').should("not.exist");
  });

  it("TC-66 Coach Premium ve el historial de recordatorios", () => {
    cy.login("coach1-gimnasio-premium@test.local", "password123", "/gimnasio-premium");
    cy.get('[data-cy="nav-reminders"]', { timeout: 15000 }).click();
    cy.get('[data-cy="reminder-history"]', { timeout: 15000 }).should("be.visible");
  });

  it("TC-67 El superadmin ve el aviso de pago del SaaS en el detalle de la org", () => {
    cy.login("super@test.local", "password123", "/platform");
    cy.contains("Organizaciones", { timeout: 15000 }).click();
    cy.contains("tr", "Gimnasio Premium").within(() => cy.contains("Ver").click());
    cy.contains("button", "Suscripción").click();
    cy.get('[data-cy="saas-note"]', { timeout: 15000 }).should("be.visible");
    cy.get('[data-cy="saas-send"]').should("be.visible");
  });
});
