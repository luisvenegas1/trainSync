// TC-71..73 — Persistencia de la configuración al NAVEGAR (sin recargar la página).
// Regresión del bug: guardabas medallas, ibas a otra página y al volver salían
// desactivadas (la página leía el valor viejo del login, no el de la BD). Cada config
// debe releer su estado real al montar.
describe("Persistencia de config al navegar", () => {
  const COACH = "coach1-gimnasio-premium@test.local"; // owner, plan Premium

  it("TC-71 Medallas: activar + guardar → navegar → volver → sigue activado", () => {
    cy.login(COACH, "password123", "/gimnasio-premium");
    cy.get('[data-cy="nav-challenges"]', { timeout: 15000 }).click();
    cy.wait(700); // dejar que el fetch de la config cargue antes de tocar el toggle
    cy.get('[data-cy="medals-enabled"]', { timeout: 15000 }).check();
    cy.get('[data-cy="medals-save"]').click();
    cy.contains("Configuración guardada", { timeout: 15000 }).should("be.visible");
    // Navegar a otra página y volver (NO recargar).
    cy.get('[data-cy="nav-reminders"]').click();
    cy.get('[data-cy="nav-challenges"]').click();
    cy.get('[data-cy="medals-enabled"]', { timeout: 15000 }).should("be.checked");
  });

  it("TC-72 Recordatorios: activar + días → guardar → navegar → volver → persiste", () => {
    cy.login(COACH, "password123", "/gimnasio-premium");
    cy.get('[data-cy="nav-reminders"]', { timeout: 15000 }).click();
    cy.wait(700); // dejar que getOrgReminderConfig cargue (si no, sobreescribe lo tipeado)
    cy.get('[data-cy="rem-enabled"]', { timeout: 15000 }).check();
    // {selectall} es más confiable que clear() en inputs number controlados.
    cy.get('[data-cy="rem-days"]').type("{selectall}5").should("have.value", "5");
    cy.get('[data-cy="rem-save"]').click();
    cy.contains("Configuración guardada", { timeout: 15000 }).should("be.visible");
    cy.get('[data-cy="nav-clients"]').click();
    cy.get('[data-cy="nav-reminders"]').click();
    cy.get('[data-cy="rem-enabled"]', { timeout: 15000 }).should("be.checked");
    cy.get('[data-cy="rem-days"]').should("have.value", "5");
  });

  it("TC-73 Bloqueo por vencimiento: activar + gracia → guardar → navegar → volver → persiste", () => {
    cy.login(COACH, "password123", "/gimnasio-premium");
    cy.get('[data-cy="nav-reminders"]', { timeout: 15000 }).click();
    cy.wait(700); // dejar que getOrgPaymentConfig cargue (si no, sobreescribe lo tipeado)
    cy.get('[data-cy="block-enabled"]', { timeout: 15000 }).check();
    cy.get('[data-cy="block-grace"]').type("{selectall}7").should("have.value", "7");
    cy.get('[data-cy="block-save"]').click();
    cy.contains("Configuración guardada", { timeout: 15000 }).should("be.visible");
    cy.get('[data-cy="nav-challenges"]').click();
    cy.get('[data-cy="nav-reminders"]').click();
    cy.get('[data-cy="block-enabled"]', { timeout: 15000 }).should("be.checked");
    cy.get('[data-cy="block-grace"]').should("have.value", "7");
  });
});
