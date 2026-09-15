// TC-35..37 — Funciones por plan: "Retos" es exclusivo de Premium.
describe("Funciones por plan (gating)", () => {
  it("TC-35 Coach PREMIUM ve la navegación de Retos", () => {
    cy.login("coach1-fit-studio@test.local", "password123", "/fit-studio");
    cy.get('[data-cy="nav-challenges"]', { timeout: 15000 }).should("exist");
  });

  it("TC-36 Coach BASE NO ve la navegación de Retos", () => {
    cy.login("coach1-gimnasio-base@test.local", "password123", "/gimnasio-base");
    cy.get('[data-cy="nav-clients"]', { timeout: 15000 }).should("exist"); // ya cargó la app
    cy.get('[data-cy="nav-challenges"]').should("not.exist");
  });

  it("TC-37 Coach PRO NO ve la navegación de Retos", () => {
    cy.login("coach1-gimnasio-pro@test.local", "password123", "/gimnasio-pro");
    cy.get('[data-cy="nav-clients"]', { timeout: 15000 }).should("exist");
    cy.get('[data-cy="nav-challenges"]').should("not.exist");
  });
});
