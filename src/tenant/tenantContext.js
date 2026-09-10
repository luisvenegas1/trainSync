import { createContext, useContext } from "react";
import { JOHEL_BRANDING } from "../branding/branding";

// Contexto de tenant. Por defecto: modo legacy (un solo tenant = Johel).
export const TenantContext = createContext({
  mode: "legacy",
  slug: "joheltraining",
  org: null,
  branding: JOHEL_BRANDING,
  featureOverrides: {},
  gamification: {},
});

export function useTenant() {
  return useContext(TenantContext);
}
