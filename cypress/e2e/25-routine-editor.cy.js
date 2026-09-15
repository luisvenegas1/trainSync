// TC-63 — Crear una rutina completa con el editor: título, días, grupo, ejercicio,
// asignación a un cliente, y guardar.
describe("Editor de rutina completo (coach)", () => {
  it("TC-63 Crear + asignar una rutina nueva", () => {
    cy.login("coach1-gimnasio-pro@test.local", "password123", "/gimnasio-pro");
    cy.get('[data-cy="nav-routines"]', { timeout: 15000 }).click();
    cy.contains("button", "+ Nueva").click();

    cy.get('[data-cy="rt-title"]', { timeout: 15000 }).clear().type("Rutina E2E");
    cy.get('[data-cy="rt-days"]').select("1"); // 1 día → crea el "Día 1"

    // Asignar al Cliente 1 de la org.
    cy.contains("label", "Cliente 1 Gimnasio Pro").find('input[type="checkbox"]').check();

    // Agregar un grupo y un ejercicio global (Press de banca).
    cy.contains("button", "+ Grupo").click();
    cy.contains("button", "+ Agregar ejercicio").click();
    cy.get(".mo", { timeout: 15000 }).within(() => {
      cy.get('input[placeholder="Buscar..."]').type("Press de banca");
      cy.contains("button", "+ Agregar").click();
    });

    cy.get('[data-cy="rt-save"]').click();
    cy.contains("Rutina creada", { timeout: 15000 }).should("be.visible");
    cy.contains("Rutina E2E").should("be.visible");
  });
});
