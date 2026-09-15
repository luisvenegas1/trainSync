// TC-69..70 — Guía inicial (onboarding tour) y checklist de la Guía.
// gimnasio-pro arranca con clientes pero SIN rutinas → el tour se muestra.
describe("Guía inicial del entrenador", () => {
  const COACH = "coach1-gimnasio-pro@test.local";

  it("TC-69 El tour se queda visible aunque se complete un paso (crear rutina)", () => {
    // power-house: tiene clientes pero NINGÚN test le crea rutinas → onboarding
    // incompleto al iniciar → el tour se muestra. (gimnasio-pro ya tiene rutinas por
    // tandas previas en la corrida completa, por eso no sirve acá.)
    cy.login("coach1-power-house@test.local", "password123", "/power-house");
    cy.get('[data-cy="onboarding-tour"]', { timeout: 15000 }).should("be.visible");

    // Crear una rutina (completa el paso "Creá una rutina").
    cy.get('[data-cy="nav-routines"]').click();
    cy.contains("button", "+ Nueva").click();
    cy.get('[data-cy="rt-title"]', { timeout: 15000 }).clear().type("Rutina Onboarding");
    cy.get('[data-cy="rt-days"]').select("1");
    cy.contains("button", "+ Grupo").click();
    cy.contains("button", "+ Agregar ejercicio").click();
    cy.get(".mo", { timeout: 15000 }).within(() => {
      cy.get('input[placeholder="Buscar..."]').type("Press de banca");
      cy.contains("button", "+ Agregar").click();
    });
    cy.get('[data-cy="rt-save"]').click();
    cy.contains("Rutina creada", { timeout: 15000 }).should("be.visible");

    // El tour NO debe desaparecer por haber completado un paso en la misma sesión.
    cy.get('[data-cy="onboarding-tour"]').should("be.visible");
  });

  it("TC-70 La Guía marca en verde los pasos ya cumplidos", () => {
    cy.login(COACH, "password123", "/gimnasio-pro");
    cy.get('[data-cy="nav-guide"]', { timeout: 15000 }).click();
    cy.contains("1. Agregar un cliente").should("be.visible");
    // Ya tiene clientes (y mediciones) → al menos un paso aparece marcado como Hecho.
    cy.contains(".badge", "Hecho").should("exist");
  });
});
