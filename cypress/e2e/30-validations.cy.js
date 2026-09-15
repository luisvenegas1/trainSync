// TC-74..77 — Mensajes de validación en la UI (además de los de la tanda 18).
describe("Mensajes de validación (UI)", () => {
  it("TC-74 Invitar admin con correo inválido muestra error", () => {
    cy.login("coach1-gimnasio-pro@test.local", "password123", "/gimnasio-pro"); // owner
    cy.get('[data-cy="nav-admins"]', { timeout: 15000 }).click();
    cy.contains("button", "+ Nuevo admin").click();
    cy.contains("Invitar administrador").should("be.visible");
    cy.get('input[placeholder="Ej: Ana Pérez"]').type("Admin Malo");
    cy.get('input[placeholder="ana@correo.com"]').type("esto-no-es-correo");
    cy.contains("button", "Enviar invitación").click();
    cy.contains("Correo inválido").should("be.visible");
  });

  it("TC-75 Crear un reto sin nombre muestra error", () => {
    cy.login("coach1-gimnasio-premium@test.local", "password123", "/gimnasio-premium");
    cy.get('[data-cy="nav-challenges"]', { timeout: 15000 }).click();
    cy.contains("button", "+ Nuevo reto").click();
    cy.contains("button", "Crear reto").click(); // sin título
    cy.contains("Poné un nombre al reto").should("be.visible");
  });

  it("TC-76 Cambiar contraseña con confirmación distinta muestra error", () => {
    // Cliente 2 (a Cliente 1 lo transfiere la tanda 02 fuera de Premium).
    cy.login("cliente2-gimnasio-premium@test.local", "password123", "/gimnasio-premium");
    cy.get('[data-cy="nav-my-profile"]', { timeout: 15000 }).click();
    cy.contains("button", "Editar").click();
    cy.contains("Editar mis datos").should("be.visible");
    cy.contains("button", "Cambiar contraseña").click();
    cy.get('input[autocomplete="new-password"]').eq(0).type("abcdef");
    cy.get('input[autocomplete="new-password"]').eq(1).type("zzzzzz");
    cy.contains("button", "Guardar contraseña").click();
    cy.contains("no coinciden").should("be.visible");
  });

  it("TC-77 Crear organización con correo de owner inválido muestra error", () => {
    cy.login("super@test.local", "password123", "/platform");
    cy.contains("Organizaciones", { timeout: 15000 }).click();
    cy.contains("button", "Nueva").click();
    cy.get('[data-cy="org-name"]', { timeout: 15000 }).type("Validacion Test");
    cy.get('[data-cy="org-owner-name"]').type("Owner Test");
    cy.get('[data-cy="org-owner-email"]').type("correo-malo");
    cy.get('[data-cy="org-create"]').click();
    cy.contains("correo del owner no es válido").should("be.visible");
  });
});
