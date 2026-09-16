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

  it("TC-45b Fijar días de gracia de la suscripción", () => {
    openOrg("Gimnasio Pro");
    cy.contains("button", "Suscripción").click();
    cy.get('[data-cy="sub-grace-days"]', { timeout: 15000 }).clear().type("3");
    cy.get('[data-cy="sub-save"]').click();
    cy.contains("Suscripción actualizada", { timeout: 15000 }).should("be.visible");
  });

  it("TC-45c Activar el recordatorio automático del pago del SaaS", () => {
    openOrg("Gimnasio Pro");
    cy.contains("button", "Suscripción").click();
    cy.get('[data-cy="saas-auto-enabled"]', { timeout: 15000 }).check();
    cy.get('[data-cy="saas-auto-days"]').clear().type("5");
    cy.get('[data-cy="sub-save"]').click();
    cy.contains("Suscripción actualizada", { timeout: 15000 }).should("be.visible");
  });
});
