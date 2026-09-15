// TC-61/62 — Overrides de funciones por organización desde la plataforma.
// Power House es plan PRO (sin Retos). El superadmin activa el override de "Retos"
// y luego el coach de esa org ve el nav de Retos.
describe("Plataforma — overrides de funciones por org", () => {
  it("TC-61 Superadmin activa el override de Retos para una org PRO", () => {
    cy.login("super@test.local", "password123", "/platform");
    cy.contains("Organizaciones", { timeout: 15000 }).click();
    cy.contains("tr", "Power House").within(() => cy.contains("Ver").click());
    cy.contains("button", "Funciones").click();
    cy.get('[data-cy="feat-challenges"]', { timeout: 15000 }).select("on");
    cy.get('[data-cy="feat-save"]').click();
    cy.contains("Funciones actualizadas", { timeout: 15000 }).should("be.visible");
  });

  it("TC-62 El coach de esa org ahora ve el nav de Retos", () => {
    cy.login("coach1-power-house@test.local", "password123", "/power-house");
    cy.get('[data-cy="nav-challenges"]', { timeout: 15000 }).should("exist");
  });
});
