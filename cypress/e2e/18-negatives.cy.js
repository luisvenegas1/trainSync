// TC-54..56 — Casos negativos: validaciones al crear cliente y al fijar contraseña.
describe("Validaciones y casos negativos", () => {
  const COACH = "coach1-gimnasio-pro@test.local";

  function openNewClient() {
    cy.login(COACH, "password123", "/gimnasio-pro");
    cy.get('[data-cy="nav-clients"]', { timeout: 15000 }).click();
    cy.contains("button", "+ Nuevo").click();
    cy.contains("Nuevo cliente").should("be.visible");
    cy.wait(600);
  }

  it("TC-54 Crear cliente con correo DUPLICADO muestra error", () => {
    openNewClient();
    cy.get('input[placeholder="María García"]').click().type("Duplicado");
    cy.get('input[placeholder="maria@correo.com"]').click().type("cliente1-gimnasio-pro@test.local");
    cy.contains("button", "Crear cliente").click();
    cy.contains("Ya existe un cliente").should("be.visible");
  });

  it("TC-55 Crear cliente con correo INVÁLIDO muestra error", () => {
    openNewClient();
    cy.get('input[placeholder="María García"]').click().type("Correo Malo");
    cy.get('input[placeholder="maria@correo.com"]').click().type("esto-no-es-correo");
    cy.contains("button", "Crear cliente").click();
    cy.contains("correo no es válido").should("be.visible");
  });

  it("TC-56 Fijar contraseña muy corta muestra error", () => {
    // Reutiliza el flujo de recuperación: la pantalla de nueva contraseña valida el largo.
    const EMAIL = "cliente3-gimnasio-pro@test.local";
    cy.clearMailpit();
    cy.visit("/gimnasio-pro");
    cy.contains("¿Olvidaste tu contraseña?", { timeout: 15000 }).click();
    cy.get('input[type="email"]').type(EMAIL);
    cy.contains("button", "Enviar enlace").click();
    cy.mailpitLinkFor(EMAIL).then((link) => {
      cy.visit(link);
      cy.contains("Nueva contraseña", { timeout: 20000 }).should("be.visible");
      cy.get('input[autocomplete="new-password"]').eq(0).type("123");
      cy.get('input[autocomplete="new-password"]').eq(1).type("123");
      cy.contains("button", "Guardar contraseña").click();
      cy.contains("al menos 6").should("be.visible");
    });
  });
});
