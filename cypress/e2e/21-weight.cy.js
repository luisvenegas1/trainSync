// TC-27/28 — Peso: precarga del último peso usado al iniciar, y progreso de peso.
// cliente1-fit-studio tiene 6 entrenos sembrados con Press subiendo 100→115 lbs.
describe("Peso del cliente", () => {
  it("TC-27 Al iniciar un entreno se precarga el último peso usado", () => {
    cy.login("cliente1-fit-studio@test.local", "password123", "/fit-studio");
    cy.contains("Rutina de Fuerza", { timeout: 15000 }).should("be.visible");
    cy.contains("button", "Iniciar").click();
    cy.contains("Entrenando").should("be.visible");
    // El día viene colapsado: hay que expandirlo para ver los ejercicios/pesos.
    cy.get(".day-h").first().click();
    // El input de "Peso de hoy" del Press debe traer el último usado (115).
    cy.contains(".ex-row", "Press de banca").find('input[type="number"]').should("have.value", "115");
  });

  it("TC-28 El perfil muestra el progreso de peso (subió en ejercicios)", () => {
    cy.login("cliente1-fit-studio@test.local", "password123", "/fit-studio");
    cy.get('[data-cy="nav-my-profile"]', { timeout: 15000 }).click();
    cy.contains(".tab", "Medallas").click();
    cy.contains("Subiste el peso en", { timeout: 15000 }).should("be.visible");
  });
});
