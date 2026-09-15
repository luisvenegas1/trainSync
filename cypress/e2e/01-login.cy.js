// TC-LOGIN — cada rol entra a lo suyo; credenciales malas dan error.
describe("Login por rol", () => {
  it("TC-01 Superadmin entra al Panel de Plataforma", () => {
    cy.login("super@test.local", "password123", "/platform");
    cy.contains("Organizaciones", { timeout: 15000 }).should("be.visible");
  });

  it("TC-02 Credenciales incorrectas muestran error (sin entrar)", () => {
    cy.login("super@test.local", "claveMala", "/platform");
    cy.contains("Correo o contraseña incorrectos").should("be.visible");
    cy.contains("Organizaciones").should("not.exist");
  });

  it("TC-03 Un COACH entra a su tenant y ve la navegación de entrenador", () => {
    cy.login("coach1-gimnasio-premium@test.local", "password123", "/gimnasio-premium");
    cy.contains("Clientes", { timeout: 15000 }).should("be.visible"); // nav de coach
  });

  it("TC-04 Un CLIENTE entra a su tenant y ve su perfil (no la nav de coach)", () => {
    cy.login("cliente2-gimnasio-premium@test.local", "password123", "/gimnasio-premium");
    cy.contains("Perfil", { timeout: 15000 }).should("be.visible");
    cy.contains("Clientes").should("not.exist"); // el cliente NO ve la nav de coach
  });
});
