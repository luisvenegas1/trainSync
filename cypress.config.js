import { defineConfig } from "cypress";

// E2E contra el entorno LOCAL (Vite dev server + Supabase local en Docker).
// Requisitos antes de correr: `supabase db reset` (datos frescos) + `npm run dev`.
export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:5173",
    specPattern: "cypress/e2e/**/*.cy.js",
    supportFile: "cypress/support/e2e.js",
    video: false,
    defaultCommandTimeout: 12000,
    viewportWidth: 1280,
    viewportHeight: 800,
  },
});
