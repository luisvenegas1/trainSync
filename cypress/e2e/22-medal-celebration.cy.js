// TC-34 — Celebración animada de medalla al cruzar el umbral al finalizar un entreno.
// client_fit_studio_2 tiene una rutina de 1 día/semana y NO entrenó esta semana:
// al terminar UN entreno llega al 100% de su meta → medalla (celebración).
describe("Celebración de medalla", () => {
  it("TC-34 Finalizar un entreno que cruza la meta muestra la animación", () => {
    cy.login("cliente2-fit-studio@test.local", "password123", "/fit-studio");
    cy.contains("Rutina Express", { timeout: 15000 }).should("be.visible");
    cy.contains("button", "Iniciar").click();
    cy.contains("button", "Finalizar").click();
    cy.contains("Finalizar entrenamiento").should("be.visible"); // modal
    cy.contains("button", "Guardar entrenamiento").click();
    cy.get('[data-cy="medal-celebration"]', { timeout: 15000 }).should("be.visible");
    cy.contains("¡Lo lograste!").should("be.visible");
  });
});
