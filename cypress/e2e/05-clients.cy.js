// TC-12..15 — Gestión de clientes por el coach (alta, borrado, búsqueda).
// Nota: crear/borrar clientes intenta usar edge functions (invitar/borrar Auth), pero
// la FILA del cliente se crea/borra igual aunque la function falle en local, así que
// las aserciones se basan en la lista, no en el correo.
describe("Gestión de clientes (coach)", () => {
  const COACH = "coach1-gimnasio-pro@test.local";

  it("TC-12 Crear un cliente nuevo → aparece en la lista", () => {
    cy.login(COACH, "password123", "/gimnasio-pro");
    cy.get('[data-cy="nav-clients"]', { timeout: 15000 }).click();
    cy.contains("button", "+ Nuevo").click();
    cy.contains("Nuevo cliente").should("be.visible");
    cy.wait(600); // deja que carguen los catálogos y el modal deje de re-renderizarse
    cy.get('input[placeholder="María García"]').click().type("Cliente E2E");
    cy.get('input[placeholder="maria@correo.com"]').click().type("cliente-e2e@test.local");
    cy.contains("button", "Crear cliente").click();
    cy.contains("Cliente creado", { timeout: 15000 }).should("be.visible");
    cy.contains("Cliente E2E").should("be.visible");
  });

  it("TC-14 Eliminar un cliente (con modal de confirmación)", () => {
    cy.login(COACH, "password123", "/gimnasio-pro");
    cy.get('[data-cy="nav-clients"]', { timeout: 15000 }).click();
    cy.contains("tr", "Cliente 4 Gimnasio Pro").click(); // abre el detalle
    cy.contains("button", "Eliminar").click();           // 🗑 Eliminar
    cy.contains("¿Eliminar a").should("be.visible");      // modal de la app
    cy.contains("button", "Sí, eliminar").click();
    cy.contains("Cliente eliminado", { timeout: 15000 }).should("be.visible");
    cy.contains("Cliente 4 Gimnasio Pro").should("not.exist");
  });

  it("TC-15 Buscar un cliente por nombre filtra la lista", () => {
    cy.login(COACH, "password123", "/gimnasio-pro");
    cy.get('[data-cy="nav-clients"]', { timeout: 15000 }).click();
    cy.get('input[placeholder*="Buscar"]').type("Cliente 2");
    cy.contains("Cliente 2 Gimnasio Pro").should("be.visible");
    cy.contains("Cliente 3 Gimnasio Pro").should("not.exist");
  });
});
