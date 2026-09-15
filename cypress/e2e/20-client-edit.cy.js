// TC-13 — El coach edita los datos de un cliente y se guardan.
describe("Editar datos de cliente (coach)", () => {
  it("TC-13 Editar el teléfono de un cliente lo guarda", () => {
    cy.login("coach1-gimnasio-pro@test.local", "password123", "/gimnasio-pro");
    cy.get('[data-cy="nav-clients"]', { timeout: 15000 }).click();
    cy.contains("tr", "Cliente 2 Gimnasio Pro").click();
    cy.contains("button", "Editar").click();           // ✏️ Editar (datos personales)
    cy.contains("Editar datos").should("be.visible");   // modal
    cy.wait(400);
    cy.contains(".fg", "Teléfono").find("input").clear().type("88889999");
    cy.contains("button", "Guardar").click();
    cy.contains("Datos actualizados", { timeout: 15000 }).should("be.visible");
    cy.contains("88889999").should("be.visible");        // se refleja en la ficha
  });
});
