// TC-57..60 — Bloqueo de la rutina por mensualidad vencida (opt-in por org).
// Escenario sembrado (seed.sql): gimnasio-base tiene el bloqueo ACTIVO (0 días de
// gracia). cliente5 está vencido y tiene rutina asignada (debe ocultársele).
describe("Bloqueo por mensualidad vencida", () => {
  const BASE = "/gimnasio-base";
  const EXPIRED = "cliente5-gimnasio-base@test.local";
  const ACTIVE = "cliente2-gimnasio-base@test.local";
  const COACH = "coach1-gimnasio-base@test.local"; // owner, plan BASE

  it("TC-57 Cliente vencido NO ve su rutina (pantalla de bloqueo)", () => {
    cy.login(EXPIRED, "password123", BASE);
    cy.get('[data-cy="nav-my-routine"]', { timeout: 15000 }).click();
    cy.get('[data-cy="routine-blocked"]', { timeout: 15000 }).should("be.visible");
    cy.contains("mensualidad está vencida").should("be.visible");
    cy.contains("Rutina Base").should("not.exist"); // la rutina sembrada queda oculta
  });

  it("TC-58 Cliente vigente de la misma org NO queda bloqueado", () => {
    cy.login(ACTIVE, "password123", BASE);
    cy.get('[data-cy="nav-my-routine"]', { timeout: 15000 }).click();
    cy.get('[data-cy="routine-blocked"]').should("not.exist");
  });

  it("TC-59 Coach de plan BASE ve la config de bloqueo (fuera del gating Premium)", () => {
    cy.login(COACH, "password123", BASE);
    cy.get('[data-cy="nav-reminders"]', { timeout: 15000 }).click();
    cy.get('[data-cy="block-enabled"]', { timeout: 15000 }).should("exist");
    cy.get('[data-cy="block-grace"]').clear().type("2");
    cy.get('[data-cy="block-save"]').click();
    cy.contains("Configuración guardada", { timeout: 15000 }).should("be.visible");
  });

  // TC-60 se divide en dos: Cypress limpia la sesión entre tests, así que el segundo
  // login (como cliente) parte de una pantalla de login limpia. La exención persiste
  // en la BD entre ambos tests.
  it("TC-60a El coach exime del bloqueo al cliente vencido", () => {
    cy.login(COACH, "password123", BASE);
    cy.get('[data-cy="nav-clients"]', { timeout: 15000 }).click();
    cy.contains("tr", "Cliente 5 Gimnasio Base").click();
    cy.contains(".tab", "Plan").click();
    cy.get('[data-cy="client-exempt"]', { timeout: 15000 }).check();
    cy.contains("eximido del bloqueo", { timeout: 15000 }).should("be.visible");
  });

  it("TC-60b El cliente vencido pero eximido vuelve a ver su rutina", () => {
    cy.login(EXPIRED, "password123", BASE);
    cy.get('[data-cy="nav-my-routine"]', { timeout: 15000 }).click();
    cy.get('[data-cy="routine-blocked"]').should("not.exist");
    cy.contains("Rutina Base", { timeout: 15000 }).should("be.visible");
  });
});
