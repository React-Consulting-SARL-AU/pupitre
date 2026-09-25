import type { DownloadContent } from "./download"

export const downloadFr: DownloadContent = {
  meta: {
    title: "Télécharger Pupitre",
    description:
      "L’app Pupitre pour macOS, Windows et Linux, avec la configuration requise et ce qu’attend le serveur.",
  },
  hero: {
    label: "Télécharger",
    headline: "L’app pour votre machine.",
    lead: "Une app desktop, trois systèmes. Elle parle à votre serveur en SSH avec une clé qu’elle génère sur cet appareil ; rien d’autre n’est installé sur votre laptop.",
    detecting: "Votre système",
    unknown: "Choisissez votre système",
  },
  account: {
    title: "L’app a besoin d’un compte Pupitre",
    body: "Pupitre se connecte à un compte Pupitre. Créez-le d’abord : une adresse mail suffit, et aucune carte bancaire n’est demandée.",
    cta: "Créer un compte",
  },
  os: {
    macos: {
      name: "macOS",
      note: "macOS 13 Ventura ou plus récent, Apple silicon et Intel. Signée et notarisée.",
    },
    windows: {
      name: "Windows",
      note: "Windows 11, x64. L’installateur n’est pas encore signé : SmartScreen peut demander une confirmation au premier lancement.",
    },
    linux: {
      name: "Linux",
      note: "Ubuntu 22.04 ou plus récent en desktop, x64. AppImage ou .deb.",
    },
  },
  arch: {
    arm64: "Apple silicon / arm64",
    x64: "Intel / x64",
    universal: "Universelle",
  },
  assets: {
    label: "Tous les fichiers",
    title: "Les trois systèmes",
    lead: "Chaque fichier ci-dessous est la même version. L’app vérifie ses propres mises à jour contre la signature.",
    verify: "Chaque build est publié avec sa taille et son SHA-256.",
    download: "Télécharger",
    size: "Taille",
    digest: "SHA-256",
    format: "Format",
    empty: "Aucun build publié pour ce système.",
  },
  release: {
    label: "Version",
    title: "Ce qui est publié",
    version: "Version",
    published: "Publiée",
    channel: "Canal",
    channels: { stable: "Stable", beta: "Bêta" },
  },
  requirements: {
    label: "Configuration requise",
    title: "Ce qu’il faut de chaque côté",
    lead: "L’app tourne sur votre laptop. Le travail se passe sur un serveur que vous louez, et que Pupitre n’installe jamais lui-même.",
    app: {
      title: "Votre laptop",
      lines: [
        "macOS 13 Ventura ou plus récent, Apple silicon ou Intel.",
        "Windows 11 en x64.",
        "Ubuntu 22.04 ou plus récent en desktop, x64.",
        "Le client OpenSSH du système, que l’app pilote avec sa propre configuration et sa propre clé : intégré à macOS et à Windows 11, le paquet openssh-client sur Ubuntu.",
      ],
    },
    server: {
      title: "Votre serveur",
      lines: [
        "Ubuntu 22.04 ou 24.04, amd64 ou arm64.",
        "4 Go de RAM au minimum ; davantage pour un IDE JetBrains distant ou plusieurs bases.",
        "20 Go de disque libre, et un compte root ou sudo pour la première connexion.",
        "Le port 22 joignable. Ni la plateforme ni le support ne s’y connectent jamais ; le pare-feu laisse ensuite entrer SSH, et 80 et 443 seulement une fois Caddy installé.",
      ],
    },
  },
  install: {
    label: "Après le téléchargement",
    title: "Du téléchargement à la première connexion",
    lead: "Rien à configurer avant de commencer. L’app demande le serveur, puis explique chaque étape qu’elle franchit.",
    steps: [
      "Ouvrez l’app et connectez-vous avec votre compte Pupitre. Elle affiche un code, vous le confirmez dans la console, et les deux sont liés.",
      "Elle génère une clé ed25519 pour cet appareil et garde la moitié privée sur votre disque.",
      "Ajoutez votre serveur : son adresse, et un compte root ou sudo pour la première connexion seulement.",
      "Laissez-la inspecter. Elle lit la distribution, la RAM, le disque et ce qui est déjà installé, et dit ce qu’elle ne gérera pas.",
      "Choisissez vos services et laissez-la installer. À partir de là, l’app est la fenêtre sur cette machine.",
    ],
  },
}
