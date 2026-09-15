// TC-16..18 — Ejercicios (coach): crear, editar, eliminar.
// Los tests corren en orden y comparten estado de BD: TC-16 crea "Ejercicio E2E",
// TC-17 lo edita, TC-18 lo elimina.
describe("Ejercicios (coach)", () => {
  const COACH = "coach1-gimnasio-pro@test.local";

  function openExercises() {
    cy.login(COACH, "password123", "/gimnasio-pro");
    cy.get('[data-cy="nav-exercises"]', { timeout: 15000 }).click();
  }

  it("TC-16 Crear un ejercicio → aparece en la lista", () => {
    openExercises();
    cy.contains("button", "+ Agregar").click();
    cy.contains("Nuevo ejercicio").should("be.visible");
    cy.wait(600); // catálogos async
    cy.get('input[placeholder="Nombre del ejercicio"]').click().type("Ejercicio E2E");
    cy.contains("button", "Crear").click();
    cy.contains("Ejercicio creado", { timeout: 15000 }).should("be.visible");
    cy.contains("Ejercicio E2E").should("be.visible");
  });

  it("TC-17 Editar un ejercicio → se actualiza", () => {
    openExercises();
    cy.get('input[placeholder="🔍 Buscar..."]').type("Ejercicio E2E");
    cy.contains("tr", "Ejercicio E2E").find(".ibtn").first().click(); // ✏️ editar
    cy.contains("Editar ejercicio").should("be.visible");
    cy.wait(400);
    cy.get('input[placeholder="Nombre del ejercicio"]').click().clear().type("Ejercicio E2E Editado");
    cy.contains("button", "Guardar").click();
    cy.contains("Ejercicio actualizado", { timeout: 15000 }).should("be.visible");
    cy.contains("Ejercicio E2E Editado").should("be.visible");
  });

  it("TC-18 Eliminar un ejercicio", () => {
    openExercises();
    cy.get('input[placeholder="🔍 Buscar..."]').type("Ejercicio E2E");
    cy.contains("tr", "Ejercicio E2E Editado").find(".ibtn.d").click(); // 🗑 (confirm nativo lo acepta Cypress)
    cy.contains("Ejercicio eliminado", { timeout: 15000 }).should("be.visible");
  });
});
