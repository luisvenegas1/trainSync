# Tests E2E con Cypress (contra el entorno LOCAL)

Los tests funcionales corren contra tu **entorno local** (Vite + Supabase en Docker),
usando los datos sembrados por `supabase/seed.sql`. Nunca tocan producción.

## Requisitos (una vez)

```bash
npm install            # instala Cypress (descarga el binario, tarda la primera vez)
```

## Cómo correrlos

Los tests **mutan datos** (la transferencia mueve un cliente), así que siempre partí de
datos frescos:

```bash
# 1) Docker Desktop abierto
# 2) Datos frescos + servicios locales
supabase db reset
supabase start        # si no está corriendo ya

# 3) La app apuntando al local (usa .env.local)
npm run dev

# 4) En OTRA terminal, corré los tests:
npm run e2e            # headless (en consola)
# o, para verlos en el navegador y depurar:
npm run cypress:open
```

## Qué cubren

| ID | Caso |
|----|------|
| TC-01..04 | Login por rol (superadmin, coach, cliente) + credenciales incorrectas |
| TC-05 | El superadmin transfiere un cliente de un tenant a otro (modal de la app) |
| TC-06 | El cliente transferido aparece en la org destino |
| TC-07 | Cliente en plan Base con historial → mediciones en **solo-lectura** |
| TC-08 | Cliente en plan Premium con historial → mediciones normales (sin aviso) |
| TC-09 | Cliente en Base **sin** historial → no ve la pestaña Mediciones |
| TC-10 | Aislamiento: un coach solo ve los clientes de SU organización |
| TC-11 | Un cliente no puede entrar a un tenant que no es el suyo |

## Notas

- Todas las cuentas de prueba usan la contraseña `password123` (ver
  `docs/credenciales-local.csv`).
- Si un selector falla (la UI cambió textos/estructura), se ajusta en
  `cypress/e2e/*.cy.js` o en `cypress/support/commands.js`.
- Estos tests son de desarrollo local; no forman parte del build de producción.
