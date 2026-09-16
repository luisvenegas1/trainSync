// TC-78..81 — Dietas (PDF, función Premium): el coach activa el acceso, sube el PDF
// (queda en el historial), el cliente lo ve; y al deshabilitar el acceso, el cliente
// deja de ver la sección (el historial se conserva). Se usa gimnasio-premium (Premium).
describe("Dietas (PDF)", () => {
  const COACH = "coach1-gimnasio-premium@test.local";
  const CLIENT = "cliente2-gimnasio-premium@test.local";
  const BASE = "/gimnasio-premium";

  function openDiet() {
    cy.login(COACH, "password123", BASE);
    cy.get('[data-cy="nav-clients"]', { timeout: 15000 }).click();
    cy.contains("tr", "Cliente 2 Gimnasio Premium").click();
    cy.contains(".tab", "Dieta").click();
  }

  it("TC-78 El coach activa el acceso, sube un PDF y aparece en el historial", () => {
    openDiet();
    cy.get('[data-cy="diet-access"]', { timeout: 15000 }).check(); // el acceso viene apagado por defecto
    cy.get('[data-cy="diet-title"]', { timeout: 15000 }).clear().type("Dieta Fase 2");
    cy.get('[data-cy="diet-upload"] input[type="file"]').selectFile("cypress/fixtures/dieta.pdf", { force: true });
    cy.contains("Dieta agregada", { timeout: 20000 }).should("be.visible");
    cy.get('[data-cy="diet-row"]', { timeout: 15000 }).first().within(() => {
      cy.contains("Dieta Fase 2").should("be.visible");
      cy.contains("Visible").should("be.visible");
      cy.get('[data-cy="diet-view"]').should("be.visible");
    });
  });

  it("TC-79 El cliente ve su dieta habilitada", () => {
    cy.login(CLIENT, "password123", BASE);
    cy.get('[data-cy="nav-my-diet"]', { timeout: 15000 }).click();
    cy.contains("Ver / Descargar PDF", { timeout: 15000 }).should("be.visible");
  });

  it("TC-80 El coach deshabilita el acceso a dietas del cliente", () => {
    openDiet();
    cy.get('[data-cy="diet-access"]', { timeout: 15000 }).uncheck();
    cy.contains("Dieta deshabilitada", { timeout: 15000 }).should("be.visible");
  });

  it("TC-81 El cliente ya NO ve la sección Dieta (historial conservado)", () => {
    cy.login(CLIENT, "password123", BASE);
    cy.get('[data-cy="nav-my-routine"]', { timeout: 15000 }).should("be.visible");
    cy.get('[data-cy="nav-my-diet"]').should("not.exist");
  });
});
