// TC-47 — El owner restablece la contraseña de un co-entrenador (admin) desde AdminsPage.
// (edge: usa manage-trainer con la fallback SUPABASE_* en local.)
describe("Reset de contraseña de admin", () => {
  it("TC-47 El owner fija una nueva contraseña para un co-entrenador", () => {
    cy.login("coach1-gimnasio-pro@test.local", "password123", "/gimnasio-pro"); // owner
    cy.get('[data-cy="nav-admins"]', { timeout: 15000 }).click();
    cy.contains("tr", "Coach 2 Gimnasio Pro", { timeout: 15000 }).within(() => {
      cy.get('button[title="Editar"]').click();
    });
    cy.contains("Editar administrador").should("be.visible");
    cy.get('input[autocomplete="new-password"]').type("nuevaClave123");
    cy.contains("button", "Guardar").click();
    cy.contains("Administrador actualizado", { timeout: 20000 }).should("be.visible");
  });
});
