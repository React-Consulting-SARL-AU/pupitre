package probe

import (
	"fmt"
	"strings"
)

const (
	LevelReady   = "ready"
	LevelWarning = "warning"
	LevelBlocked = "blocked"
)

const (
	KindBare         = "bare"
	KindManaged      = "managed"
	KindOccupied     = "occupied"
	KindIncompatible = "incompatible"
)

const MinRAMMB = 4096

var (
	SupportedOS       = "ubuntu"
	SupportedVersions = []string{"22.04", "24.04"}
	SupportedArch     = []string{"amd64", "arm64"}
)

type Verdict struct {
	Level    string   `json:"level"`
	Kind     string   `json:"kind"`
	UpToDate *bool    `json:"up_to_date,omitempty"`
	Reasons  []string `json:"reasons"`
	Fixes    []string `json:"fixes"`
}

// What the two probes read; probe.sh computes the same verdict from the same facts.
type Machine struct {
	OS           string
	Version      string
	Arch         string
	RAMMB        int
	DiskFreeGB   Decimal
	Sudo         bool
	Ports        []Port
	Docker       bool
	Panel        string
	AgentVersion string
	Users        []string
	Current      string
}

func Decide(machine Machine) Verdict {
	if reasons, fixes := blockers(machine); len(reasons) > 0 {
		return Verdict{Level: LevelBlocked, Kind: KindIncompatible, Reasons: reasons, Fixes: fixes}
	}

	if machine.AgentVersion != "" {
		return managed(machine)
	}

	if reasons, fixes := occupants(machine); len(reasons) > 0 {
		return Verdict{Level: LevelWarning, Kind: KindOccupied, Reasons: reasons, Fixes: fixes}
	}

	bare := fmt.Sprintf("Machine nue : %s %s %s, %d Mo de mémoire, %s Go libres.",
		machine.OS, machine.Version, machine.Arch, machine.RAMMB, machine.DiskFreeGB)

	return Verdict{Level: LevelReady, Kind: KindBare, Reasons: []string{bare}, Fixes: []string{}}
}

func blockers(machine Machine) (reasons, fixes []string) {
	reasons, fixes = []string{}, []string{}

	if machine.OS != SupportedOS || !contains(SupportedVersions, machine.Version) {
		reasons = append(reasons, "Distribution non prise en charge : "+label(machine.OS+" "+machine.Version)+". Pupitre demande Ubuntu 22.04 ou 24.04.")
		fixes = append(fixes, "Réinstalle le serveur depuis une image Ubuntu 24.04 LTS, puis relance l'inspection.")
	}

	if !contains(SupportedArch, machine.Arch) {
		reasons = append(reasons, "Architecture non prise en charge : "+label(machine.Arch)+". Pupitre ne fournit que des binaires amd64 et arm64.")
		fixes = append(fixes, "Choisis un serveur amd64 (x86_64) ou arm64 (aarch64).")
	}

	if machine.RAMMB < MinRAMMB {
		reasons = append(reasons, fmt.Sprintf("Mémoire insuffisante : %d Mo. Pupitre demande %d Mo au minimum.", machine.RAMMB, MinRAMMB))
		fixes = append(fixes, "Passe le serveur à une offre d'au moins 4 Go de mémoire.")
	}

	if !machine.Sudo {
		reasons = append(reasons, "sudo sans mot de passe indisponible pour l'utilisateur courant.")
		fixes = append(fixes, "Connecte-toi en root, ou donne NOPASSWD à ce compte dans /etc/sudoers.d/.")
	}

	return reasons, fixes
}

func managed(machine Machine) Verdict {
	upToDate := machine.Current == "" || machine.AgentVersion == machine.Current
	verdict := Verdict{Level: LevelReady, Kind: KindManaged, UpToDate: &upToDate, Fixes: []string{}}

	if upToDate {
		verdict.Reasons = []string{"Pupitre est déjà installé : agent " + machine.AgentVersion + ", à jour."}

		return verdict
	}

	verdict.Level = LevelWarning
	verdict.Reasons = []string{"Pupitre est déjà installé : agent " + machine.AgentVersion + ", la version courante est " + machine.Current + "."}
	verdict.Fixes = []string{"Mets l'agent à jour depuis l'app avant d'installer des services."}

	return verdict
}

func occupants(machine Machine) (reasons, fixes []string) {
	reasons, fixes = []string{}, []string{}

	if machine.Docker {
		reasons = append(reasons, "Docker est installé : ses conteneurs, ses réseaux et ses règles de pare-feu resteraient en place.")
		fixes = append(fixes, "Retire Docker pour une machine dédiée, ou installe quand même : Pupitre n'y touchera pas.")
	}

	if machine.Panel != "" {
		reasons = append(reasons, "Panneau d'hébergement détecté : "+machine.Panel+". Il se dispute nginx, les utilisateurs et le pare-feu avec Pupitre.")
		fixes = append(fixes, "Choisis un serveur sans panneau d'hébergement.")
	}

	web := false
	for _, port := range machine.Ports {
		if port.Port != 80 && port.Port != 443 {
			continue
		}

		web = true
		if port.Process == "" {
			reasons = append(reasons, fmt.Sprintf("Le port %d est déjà écouté.", port.Port))
			continue
		}

		reasons = append(reasons, fmt.Sprintf("Le port %d est déjà écouté par %s.", port.Port, port.Process))
	}

	if web {
		fixes = append(fixes, "Libère les ports 80 et 443, ou installe quand même : l'exposition par tunnel ne les utilise pas.")
	}

	if len(machine.Users) > 0 {
		reasons = append(reasons, "Des comptes non système existent déjà : "+strings.Join(machine.Users, ", ")+".")
		fixes = append(fixes, "Vérifie que ces comptes cohabitent avec l'utilisateur dev créé par Pupitre.")
	}

	return reasons, fixes
}

func label(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "inconnue"
	}

	return trimmed
}

func contains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}

	return false
}
