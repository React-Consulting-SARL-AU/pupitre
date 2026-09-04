/// <reference types="vite/client" />
import type { PupitreApi } from "../../preload";

declare global {
  interface Window {
    pupitre: PupitreApi;
  }
}
