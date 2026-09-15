// TC-39..40 — Recordatorios de pago: config visible solo en Premium; gating en planes menores.
describe("Recordatorios de pago (config)", () => {
  it("TC-39 Coach PREMIUM ve la configuración de recordatorios", () => {
    cy.login("coach1-fit-studio@test.local", "password123", "/fit-studio");
    cy.get('[data-cy="nav-reminders"]', { timeout: 15000 }).click();
    cy.contains("Activar recordatorios automáticos por email").should("be.visible");
  });

  it("TC-40 Coach BASE ve el upsell (función del plan Premium)", () => {
    cy.login("coach1-gimnasio-base@test.local", "password123", "/gimnasio-base");
    cy.get('[data-cy="nav-reminders"]', { timeout: 15000 }).click();
    cy.contains("Función del plan Premium").should("be.visible");
    cy.contains("Activar recordatorios automáticos por email").should("not.exist");
  });
});
