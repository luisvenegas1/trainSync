// TC-49..50 — Recuperar contraseña (edge/Mailpit). Regresión del bug que vimos con Johel.
describe("Recuperar contraseña", () => {
  it("TC-49 'Olvidé mi contraseña' → llega el correo de recuperación", () => {
    cy.clearMailpit();
    cy.visit("/gimnasio-pro");
    cy.contains("¿Olvidaste tu contraseña?", { timeout: 15000 }).click();
    cy.get('input[type="email"]').type("cliente5-gimnasio-pro@test.local");
    cy.contains("button", "Enviar enlace").click();
    cy.mailpitWaitFor("cliente5-gimnasio-pro@test.local");
  });

  it("TC-50 Flujo completo: abrir el link del correo → fijar nueva contraseña", () => {
    // cliente1: cliente4 lo elimina la tanda 05, y a cliente2/3/5 se les inicia sesión
    // con la contraseña por defecto en otras tandas. cliente1 no se loguea en ningún
    // test, así que cambiarle la contraseña acá no rompe nada más.
    const EMAIL = "cliente1-gimnasio-pro@test.local";
    cy.clearMailpit();
    cy.visit("/gimnasio-pro");
    cy.contains("¿Olvidaste tu contraseña?", { timeout: 15000 }).click();
    cy.get('input[type="email"]').type(EMAIL);
    cy.contains("button", "Enviar enlace").click();

    cy.mailpitLinkFor(EMAIL).then((link) => {
      cy.visit(link); // supabase verifica y redirige a la app en modo recuperación
      cy.contains("Nueva contraseña", { timeout: 20000 }).should("be.visible");
      cy.get('input[autocomplete="new-password"]').eq(0).type("nuevaClave123");
      cy.get('input[autocomplete="new-password"]').eq(1).type("nuevaClave123");
      cy.contains("button", "Guardar contraseña").click();
      cy.contains("Tu contraseña quedó actualizada", { timeout: 15000 }).should("be.visible");
    });
  });
});
