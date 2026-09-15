// TC-24..25 — Entrenamiento (cliente): iniciar y finalizar un entreno.
// Usa cliente1-fit-studio, que tiene la rutina "Rutina de Fuerza" asignada.
describe("Entrenamiento (cliente)", () => {
  beforeEach(() => {
    cy.login("cliente1-fit-studio@test.local", "password123", "/fit-studio");
    cy.contains("Rutina de Fuerza", { timeout: 15000 }).should("be.visible");
  });

  it("TC-24 Iniciar un entrenamiento activa el cronómetro", () => {
    cy.contains("button", "Iniciar").click();
    cy.contains("Entrenando").should("be.visible");        // barra pegajosa
    cy.contains("button", "Finalizar").should("be.visible");
  });

  it("TC-25 Finalizar un entrenamiento lo guarda en el historial", () => {
    cy.contains("button", "Iniciar").click();
    cy.contains("button", "Finalizar").click();
    cy.contains("Finalizar entrenamiento").should("be.visible"); // modal
    cy.contains("button", "Guardar entrenamiento").click();
    cy.contains("Entrenamiento guardado", { timeout: 15000 }).should("be.visible");
  });
});
