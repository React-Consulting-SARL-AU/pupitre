export interface PageTitle {
  title: string
  parents: string[]
}

const TITLES: Record<string, PageTitle> = {
  "/dashboard": { title: "Tableau de bord", parents: [] },
  "/dashboard/servers": { title: "Serveurs", parents: ["Tableau de bord"] },
  "/dashboard/servers/$id": {
    title: "Serveur",
    parents: ["Tableau de bord", "Serveurs"],
  },
  "/dashboard/devices": { title: "Appareils", parents: ["Tableau de bord"] },
  "/dashboard/billing": { title: "Facturation", parents: ["Tableau de bord"] },
  "/dashboard/settings": { title: "Préférences", parents: ["Tableau de bord"] },
  "/download": { title: "Télécharger l'app", parents: [] },
  "/auth/sign-in": { title: "Connexion", parents: [] },
  "/auth/device": { title: "Confirmer un appareil", parents: [] },
  "/auth/invitation/$id": { title: "Invitation", parents: [] },
}

export function pageTitle(routeId: string): PageTitle {
  return TITLES[routeId] ?? { title: "Pupitre", parents: [] }
}

export function documentTitle(routeId: string): string {
  return `${pageTitle(routeId).title} · Pupitre`
}
