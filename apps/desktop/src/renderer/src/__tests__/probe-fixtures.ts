import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";

/**
 * Four machines, as `probe.sh` describes them.
 *
 * The wording is the probe's own: these fixtures are copied from what the script
 * prints, so a test that reads them reads the server's words and not ours.
 */

const UBUNTU = {
  os: "ubuntu",
  version: "24.04",
  arch: "amd64",
  sudo: true,
  installed_modules: [] as string[],
};

export const BARE: ProbeResult = {
  ...UBUNTU,
  ram_mb: 8192,
  disk_free_gb: 38.4,
  ports: [{ port: 22, process: "sshd" }],
  docker: false,
  panel: null,
  agent_version: null,
  verdict: {
    level: "ready",
    kind: "bare",
    reasons: [
      "Machine nue : ubuntu 24.04 amd64, 8192 Mo de mémoire, 38.4 Go libres.",
    ],
    fixes: [],
  },
};

export const MANAGED: ProbeResult = {
  ...UBUNTU,
  ram_mb: 8192,
  disk_free_gb: 21.7,
  ports: [{ port: 443, process: "caddy" }],
  docker: false,
  panel: null,
  agent_version: "0.3.1",
  installed_modules: ["core.system", "db.postgres"],
  verdict: {
    level: "warning",
    kind: "managed",
    up_to_date: false,
    reasons: [
      "Pupitre est déjà installé : agent 0.3.1, la version courante est 0.4.0.",
    ],
    fixes: ["Mets l'agent à jour depuis l'app avant d'installer des services."],
  },
};

export const MANAGED_UP_TO_DATE: ProbeResult = {
  ...MANAGED,
  agent_version: "0.4.0",
  verdict: {
    level: "ready",
    kind: "managed",
    up_to_date: true,
    reasons: ["Pupitre est déjà installé : agent 0.4.0, à jour."],
    fixes: [],
  },
};

export const OCCUPIED: ProbeResult = {
  ...UBUNTU,
  ram_mb: 16_384,
  disk_free_gb: 112,
  ports: [
    { port: 80, process: "nginx" },
    { port: 443, process: "nginx" },
  ],
  docker: true,
  panel: "Plesk",
  agent_version: null,
  verdict: {
    level: "warning",
    kind: "occupied",
    reasons: [
      "Docker est installé : ses conteneurs, ses réseaux et ses règles de pare-feu resteraient en place.",
      "Panneau d'hébergement détecté : Plesk. Il se dispute nginx, les utilisateurs et le pare-feu avec Pupitre.",
      "Le port 80 est déjà écouté par nginx.",
      "Le port 443 est déjà écouté par nginx.",
    ],
    fixes: [
      "Retire Docker pour une machine dédiée, ou installe quand même : Pupitre n'y touchera pas.",
      "Choisis un serveur sans panneau d'hébergement.",
      "Libère les ports 80 et 443, ou installe quand même : l'exposition par tunnel ne les utilise pas.",
    ],
  },
};

export const INCOMPATIBLE: ProbeResult = {
  os: "debian",
  version: "12",
  arch: "amd64",
  ram_mb: 2048,
  disk_free_gb: 9.2,
  sudo: false,
  ports: [],
  docker: false,
  panel: null,
  agent_version: null,
  installed_modules: [],
  verdict: {
    level: "blocked",
    kind: "incompatible",
    reasons: [
      "Distribution non prise en charge : debian 12. Pupitre demande Ubuntu 22.04 ou 24.04.",
      "Mémoire insuffisante : 2048 Mo. Pupitre demande 4096 Mo au minimum.",
      "sudo sans mot de passe indisponible pour l'utilisateur courant.",
    ],
    fixes: [
      "Réinstalle le serveur depuis une image Ubuntu 24.04 LTS, puis relance l'inspection.",
      "Passe le serveur à une offre d'au moins 4 Go de mémoire.",
      "Connecte-toi en root, ou donne NOPASSWD à ce compte dans /etc/sudoers.d/.",
    ],
  },
};
