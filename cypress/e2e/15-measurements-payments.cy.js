// TC-51..53 — Mediciones y pagos (coach). gimnasio-pro es plan Pro → incluye mediciones.
describe("Mediciones y pagos (coach)", () => {
  const COACH = "coach1-gimnasio-pro@test.local";

  function openClient(name) {
    cy.login(COACH, "password123", "/gimnasio-pro");
    cy.get('[data-cy="nav-clients"]', { timeout: 15000 }).click();
    cy.contains("tr", name).click();
  }

  it("TC-51 El coach registra una medición para un cliente", () => {
    openClient("Cliente 2 Gimnasio Pro");
    cy.contains(".tab", "Medición").click();
    cy.contains("button", "Registrar").click();
    cy.contains("Registrar medición").should("be.visible");
    cy.wait(400);
    cy.contains(".fg", "Peso").find("input").click().type("77.7");
    cy.contains("button", "Guardar").click();
    cy.contains("77.7", { timeout: 15000 }).should("be.visible");
  });

  it("TC-52 El cliente ve la medición registrada", () => {
    cy.login("cliente2-gimnasio-pro@test.local", "password123", "/gimnasio-pro");
    cy.get('[data-cy="nav-my-profile"]', { timeout: 15000 }).click();
    cy.contains("Mediciones").click();
    cy.contains("77.7").should("be.visible");
  });

  it("TC-53 El coach registra un pago", () => {
    openClient("Cliente 2 Gimnasio Pro");
    cy.contains(".tab", "Pagos").click();
    cy.contains("button", "Registrar pago").click();
    cy.contains("Registrar pago").should("be.visible");
    cy.get('input[placeholder="0"]').first().click().type("25000");
    cy.contains("button", "Confirmar pago").click();
    cy.contains("25000", { timeout: 15000 }).should("be.visible");
  });
});
