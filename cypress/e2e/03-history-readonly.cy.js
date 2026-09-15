// TC-READONLY — el historial se muestra solo-lectura si el plan no incluye la función,
// pero funciona normal cuando el plan sí la incluye. (No depende del test de transferencia.)
describe("Historial de mediciones según el plan", () => {
  it("TC-07 Cliente en plan BASE con historial ve sus mediciones con aviso de solo-lectura", () => {
    cy.login("cliente1-gimnasio-base@test.local", "password123", "/gimnasio-base");
    cy.contains("Perfil", { timeout: 15000 }).click();
    cy.contains("Mediciones").click();
    cy.contains("Historial de tu plan anterior").should("be.visible");
  });

  it("TC-08 Cliente en plan PREMIUM con historial ve mediciones normal (sin aviso)", () => {
    // fit-studio es premium y su cliente1 NO se transfiere en la suite.
    cy.login("cliente1-fit-studio@test.local", "password123", "/fit-studio");
    cy.contains("Perfil", { timeout: 15000 }).click();
    cy.contains("Mediciones").click();
    cy.contains("Historial de tu plan anterior").should("not.exist");
  });

  it("TC-09 Cliente en BASE SIN historial no ve la pestaña de Mediciones", () => {
    cy.login("cliente2-gimnasio-base@test.local", "password123", "/gimnasio-base");
    cy.contains("Perfil", { timeout: 15000 }).click();
    cy.contains("Mediciones").should("not.exist");
  });
});
