// TC-29..32 — Retos y medallas. fit-studio (premium) tiene gamificación activa en el seed.
describe("Retos y medallas", () => {
  it("TC-29 El coach guarda la config de medallas", () => {
    cy.login("coach1-fit-studio@test.local", "password123", "/fit-studio");
    cy.get('[data-cy="nav-challenges"]', { timeout: 15000 }).click();
    cy.contains("button", "Guardar medallas").click();
    cy.contains("Configuración guardada", { timeout: 15000 }).should("be.visible");
  });

  it("TC-30 El coach crea un reto (competencia)", () => {
    cy.login("coach1-fit-studio@test.local", "password123", "/fit-studio");
    cy.get('[data-cy="nav-challenges"]', { timeout: 15000 }).click();
    cy.contains("button", "+ Nuevo reto").click();
    cy.get('input[placeholder="Ej: Reto de septiembre"]').type("Reto E2E");
    cy.contains("button", "Crear reto").click();
    cy.contains("Reto creado", { timeout: 15000 }).should("be.visible");
    cy.contains("Reto E2E").should("be.visible");
  });

  it("TC-31 El coach ve el panel de logros de sus clientes", () => {
    cy.login("coach1-fit-studio@test.local", "password123", "/fit-studio");
    cy.get('[data-cy="nav-challenges"]', { timeout: 15000 }).click();
    cy.contains("Logros de tus clientes").should("be.visible");
    cy.contains("Cliente 1 Fit Studio").should("be.visible");
  });

  it("TC-32 El cliente ve su sección de medallas", () => {
    cy.login("cliente1-fit-studio@test.local", "password123", "/fit-studio");
    cy.get('[data-cy="nav-my-profile"]', { timeout: 15000 }).click();
    cy.contains("Medallas").click(); // pestaña 🏅
    cy.contains("Récord personal", { timeout: 15000 }).should("be.visible");
  });
});
