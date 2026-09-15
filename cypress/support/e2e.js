import "./commands";

// Ignora SOLO el ruido de extensiones del navegador (error genérico "reading 'document'"
// que inyectan en la página). Cualquier OTRO error de la app SÍ falla el test, para no
// tapar bugs reales.
Cypress.on("uncaught:exception", (err) => {
  if (err?.message && err.message.includes("reading 'document'")) return false;
  return true;
});
