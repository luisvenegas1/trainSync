// TC-20..22 — Rutinas: el coach ve/edita sus rutinas y el cliente ve la asignada.
// Se apoya en la rutina sembrada "Rutina de Fuerza" (fit-studio, asignada a cliente1).
describe("Rutinas", () => {
  it("TC-20 El coach ve la rutina de su organización", () => {
    cy.login("coach1-fit-studio@test.local", "password123", "/fit-studio");
    cy.get('[data-cy="nav-routines"]', { timeout: 15000 }).click();
    cy.contains("Rutina de Fuerza").should("be.visible");
  });

  it("TC-21 El coach abre el editor de una rutina nueva", () => {
    cy.login("coach1-fit-studio@test.local", "password123", "/fit-studio");
    cy.get('[data-cy="nav-routines"]', { timeout: 15000 }).click();
    cy.contains("button", "+ Nueva").click();
    cy.contains("Guardar rutina", { timeout: 15000 }).should("be.visible"); // editor abierto
  });

  it("TC-22 El cliente ve la rutina que le asignaron", () => {
    cy.login("cliente1-fit-studio@test.local", "password123", "/fit-studio");
    // La página inicial del cliente es Mi Rutina.
    cy.contains("Rutina de Fuerza", { timeout: 15000 }).should("be.visible");
    cy.contains("Día A - Tren superior").should("be.visible");
  });
});
