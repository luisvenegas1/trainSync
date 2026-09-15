// TC-ISOLATION — aislamiento entre tenants: un coach solo ve los clientes de SU org.
describe("Aislamiento entre tenants", () => {
  it("TC-10 Un coach ve a sus clientes y NO a los de otras organizaciones", () => {
    // Se usa gimnasio-pro (no lo toca el test de transferencia).
    cy.login("coach1-gimnasio-pro@test.local", "password123", "/gimnasio-pro");
    // El dashboard del coach lista sus clientes habilitados.
    cy.contains("Cliente 1 Gimnasio Pro", { timeout: 15000 }).should("be.visible");
    // No debe ver clientes de otros tenants.
    cy.contains("Cliente 1 Fit Studio").should("not.exist");
    cy.contains("Cliente 1 Gimnasio Premium").should("not.exist");
    cy.contains("Cliente 1 Power House").should("not.exist");
  });

  it("TC-11 Un cliente autenticado no obtiene acceso a un tenant que no es el suyo", () => {
    // Cliente de Gimnasio Pro intenta abrir Gimnasio Base.
    cy.login("cliente3-gimnasio-pro@test.local", "password123", "/gimnasio-pro");
    cy.contains("Perfil", { timeout: 15000 }).should("be.visible");
    cy.visit("/gimnasio-base");
    // Aislamiento: la app bloquea el acceso al tenant ajeno con "Organización
    // incorrecta" y nunca muestra datos de Gimnasio Base.
    cy.contains("Organización incorrecta", { timeout: 15000 }).should("be.visible");
    cy.contains("Cliente 1 Gimnasio Base").should("not.exist");
  });
});
