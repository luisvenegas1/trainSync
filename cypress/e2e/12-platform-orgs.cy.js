// TC-41..42 — Plataforma: crear una organización nueva e invitar a su owner.
// (edge) Necesita las edge functions locales sirviéndose (supabase start) + Mailpit.
describe("Plataforma — crear organización", () => {
  it("TC-41 Crear una org nueva → aparece + invita al owner (correo en Mailpit)", () => {
    cy.clearMailpit();
    cy.login("super@test.local", "password123", "/platform");
    cy.contains("Organizaciones", { timeout: 15000 }).click();
    cy.contains("button", "Nueva").click();

    cy.get('[data-cy="org-name"]').type("Gimnasio E2E");
    cy.get('[data-cy="org-slug"]').clear().type("gimnasio-e2e");
    cy.get('[data-cy="org-owner-name"]').type("Owner E2E");
    cy.get('[data-cy="org-owner-email"]').type("owner-e2e@test.local");
    cy.get('[data-cy="org-create"]').click();

    // La org aparece en el listado
    cy.contains("Gimnasio E2E", { timeout: 20000 }).should("be.visible");
    // El owner recibió su correo de invitación
    cy.mailpitWaitFor("owner-e2e@test.local");
  });
});
