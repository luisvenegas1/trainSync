// TC-44..45 — Plataforma: suspender/reactivar una org y cambiar su plan.
describe("Plataforma — administración de orgs", () => {
  function openOrg(name) {
    cy.login("super@test.local", "password123", "/platform");
    cy.contains("Organizaciones", { timeout: 15000 }).click();
    cy.contains("tr", name).within(() => cy.contains("Ver").click());
  }

  it("TC-44 Suspender y reactivar una organización", () => {
    openOrg("Gimnasio Base");
    cy.contains("button", "Suscripción").click();
    cy.contains("button", "Suspender").click();       // confirm() nativo → Cypress lo acepta
    cy.contains("Suspendida", { timeout: 15000 }).should("be.visible");
    // El panel recarga los datos y OrgDetail vuelve a la pestaña Info → reabrir Suscripción.
    cy.contains("button", "Suscripción").click();
    cy.contains("button", "Reactivar", { timeout: 15000 }).click();
    cy.contains("Reactivada", { timeout: 15000 }).should("be.visible");
  });

  it("TC-45 Cambiar el plan de una organización", () => {
    openOrg("Power House");
    cy.contains("button", "Suscripción").click();
    cy.get('[data-cy="sub-plan"]').select("premium");
    cy.get('[data-cy="sub-save"]').click();
    cy.contains("Suscripción actualizada", { timeout: 15000 }).should("be.visible");
  });
});
