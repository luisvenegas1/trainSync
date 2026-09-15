// TC-TRANSFER — el superadmin mueve un cliente de un tenant a otro (con su historial).
// OJO: este test MUTA datos. Corré `supabase db reset` antes de la suite.
describe("Transferir cliente entre tenants", () => {
  it("TC-05 El superadmin mueve a 'Cliente 1 Gimnasio Premium' → Gimnasio Base", () => {
    cy.login("super@test.local", "password123", "/platform");

    // Ir a Organizaciones → abrir Gimnasio Premium
    cy.contains("Organizaciones", { timeout: 15000 }).click();
    cy.contains("tr", "Gimnasio Premium").within(() => cy.contains("Ver").click());

    // Pestaña Clientes del detalle de la org
    cy.contains("button", "Clientes").click();

    // En la fila del cliente: elegir destino y pulsar Mover
    cy.contains('[data-cy="client-row"]', "Cliente 1 Gimnasio Premium").within(() => {
      cy.get("select").select("Gimnasio Base");
      cy.contains("button", "Mover").click();
    });

    // Modal de confirmación de la app (no el nativo del navegador)
    cy.contains("¿Mover a").should("be.visible");
    cy.contains("button", "Sí, mover").click();

    // Éxito + el cliente desaparece de la lista de Premium
    cy.contains("movido a Gimnasio Base", { timeout: 15000 }).should("be.visible");
    cy.contains('[data-cy="client-row"]', "Cliente 1 Gimnasio Premium").should("not.exist");
  });

  it("TC-06 El cliente movido aparece ahora en Gimnasio Base", () => {
    cy.login("super@test.local", "password123", "/platform");
    cy.contains("Organizaciones", { timeout: 15000 }).click();
    cy.contains("tr", "Gimnasio Base").within(() => cy.contains("Ver").click());
    cy.contains("button", "Clientes").click();
    cy.contains('[data-cy="client-row"]', "Cliente 1 Gimnasio Premium").should("be.visible");
  });
});
