package i18n

// The probe: what it found on the machine, and what should be done about it.
var probeCatalog = map[string]Message{
	"probe.label.unknown": {
		FR: "inconnue",
		EN: "unknown",
	},
	"probe.bare": {
		FR: "Machine nue : %s %s %s, %d Mo de mémoire, %s Go libres.",
		EN: "A bare machine: %s %s %s, %d MB of memory, %s GB free.",
	},
	"probe.os.unsupported": {
		FR: "Distribution non prise en charge : %s. Pupitre demande Ubuntu 22.04 ou 24.04.",
		EN: "Unsupported distribution: %s. Pupitre asks for Ubuntu 22.04 or 24.04.",
	},
	"probe.os.unsupported.fix": {
		FR: "Réinstallez le serveur depuis une image Ubuntu 24.04 LTS, puis relancez l'inspection.",
		EN: "Reinstall the server from an Ubuntu 24.04 LTS image, then run the inspection again.",
	},
	"probe.arch.unsupported": {
		FR: "Architecture non prise en charge : %s. Pupitre ne fournit que des binaires amd64 et arm64.",
		EN: "Unsupported architecture: %s. Pupitre ships amd64 and arm64 binaries only.",
	},
	"probe.arch.unsupported.fix": {
		FR: "Choisissez un serveur amd64 (x86_64) ou arm64 (aarch64).",
		EN: "Pick an amd64 (x86_64) or arm64 (aarch64) server.",
	},
	"probe.ram.low": {
		FR: "Mémoire insuffisante : %d Mo. Pupitre demande %d Mo au minimum.",
		EN: "Not enough memory: %d MB. Pupitre asks for %d MB at least.",
	},
	"probe.ram.low.fix": {
		FR: "Passez le serveur à une offre d'au moins 4 Go de mémoire.",
		EN: "Move the server to a plan with at least 4 GB of memory.",
	},
	"probe.sudo.missing": {
		FR: "sudo sans mot de passe indisponible pour l'utilisateur courant.",
		EN: "Passwordless sudo is not available for the current user.",
	},
	"probe.sudo.missing.fix": {
		FR: "Connectez-vous en root, ou donnez NOPASSWD à ce compte dans /etc/sudoers.d/.",
		EN: "Sign in as root, or give this account NOPASSWD in /etc/sudoers.d/.",
	},
	"probe.managed.upToDate": {
		FR: "Pupitre est déjà installé : agent %s, à jour.",
		EN: "Pupitre is already installed: agent %s, up to date.",
	},
	"probe.managed.behind": {
		FR: "Pupitre est déjà installé : agent %s, la version courante est %s.",
		EN: "Pupitre is already installed: agent %s, the current version is %s.",
	},
	"probe.managed.behind.fix": {
		FR: "Mettez l'agent à jour depuis l'app avant d'installer des services.",
		EN: "Update the agent from the app before installing any service.",
	},
	"probe.docker.present": {
		FR: "Docker est installé : ses conteneurs, ses réseaux et ses règles de pare-feu resteraient en place.",
		EN: "Docker is installed: its containers, its networks and its firewall rules would stay in place.",
	},
	"probe.docker.present.fix": {
		FR: "Retirez Docker pour une machine dédiée, ou installez quand même : Pupitre n'y touchera pas.",
		EN: "Remove Docker for a dedicated machine, or install anyway: Pupitre will not touch it.",
	},
	"probe.panel.present": {
		FR: "Panneau d'hébergement détecté : %s. Il se dispute nginx, les utilisateurs et le pare-feu avec Pupitre.",
		EN: "A hosting panel was found: %s. It fights Pupitre over nginx, the users and the firewall.",
	},
	"probe.panel.present.fix": {
		FR: "Choisissez un serveur sans panneau d'hébergement.",
		EN: "Pick a server without a hosting panel.",
	},
	"probe.port.taken": {
		FR: "Le port %d est déjà écouté.",
		EN: "Port %d is already listened on.",
	},
	"probe.port.taken.by": {
		FR: "Le port %d est déjà écouté par %s.",
		EN: "Port %d is already listened on by %s.",
	},
	"probe.ports.web.fix": {
		FR: "Libérez les ports 80 et 443, ou installez quand même : l'exposition par tunnel ne les utilise pas.",
		EN: "Free ports 80 and 443, or install anyway: tunnel exposure does not use them.",
	},
	"probe.users.present": {
		FR: "Des comptes non système existent déjà : %s.",
		EN: "Non-system accounts already exist: %s.",
	},
	"probe.users.present.fix": {
		FR: "Vérifiez que ces comptes cohabitent avec l'utilisateur dev créé par Pupitre.",
		EN: "Check that these accounts live alongside the dev user Pupitre creates.",
	},
}
