package agents

import "strings"

const machineHeader = `# Contexte machine — serveur de développement distant

- Cette machine est un serveur Linux, pas un poste de travail. Ni Xcode, ni simulateur iOS,
  ni construction d'application de bureau ici.
- Les projets vivent dans ` + ProjectsDir + `. Shell : zsh.
- Avant d'écrire une commande, lis les scripts du package.json.
- Pilote les projets avec les outils du serveur MCP ` + "`" + MCPName + "`" + ` (` + "`status`" + `, ` + "`project_start`" + `,
  ` + "`project_logs`" + `, ` + "`project_restart`" + `…), ou à défaut avec ` + "`dev`" + ` (` + "`dev status`" + `, ` + "`dev up <projet>`" + `,
  ` + "`dev logs <projet>`" + `), jamais avec un ` + "`bun run dev`" + ` lancé à la main : cela double les
  processus et bloque les ports.
- Pour voir une page, pilote le navigateur du serveur MCP ` + "`" + PlaywrightName + "`" + ` quand le service
  Navigateur headless est installé : ouvre l'adresse locale du projet (` + "`PUPITRE_LOCAL_URL`" + `), jamais
  son adresse publique, que protège une clé ; connecte-toi avec un compte de test du projet, clique,
  remplis, lis la console, capture.
- Ports, hôtes, adresses et domaine d'un projet sont dans son environnement, en ` + "`PUPITRE_*`" + ` :
  lis-les, ne les écris jamais en dur (skill ` + "`project-env`" + `).
- Les secrets d'un projet sont dans son ` + "`.env.local`" + `, écrit par l'agent : jamais dans un
  fichier commité, jamais sur une ligne de commande.
- Root appartient au propriétaire. Pas de sudo, même quand il ne demande pas de mot de passe ;
  ne touche ni ` + "`~/.ssh/authorized_keys`" + ` ni ` + "`/etc/pupitre`" + `. Ce qui demande root se demande
  au propriétaire, qui le fait depuis l'app Pupitre.

## Les skills

Ils vivent dans ` + SkillsDir + `, et couvrent ce qui revient sans cesse :

- ` + "`server-dev`" + ` — démarrer, diagnostiquer, synchroniser un projet avec le serveur MCP
  ` + "`" + MCPName + "`" + ` ou ` + "`dev`" + ` ; ce qui demande root.
- ` + "`project-env`" + ` — les variables ` + "`PUPITRE_*`" + ` que reçoit chaque projet : port, adresses
  locale et publique, routes, voisins, domaine.
- ` + "`ship`" + `, ` + "`branch`" + `, ` + "`pr`" + ` — commiter, pusher, ouvrir une pull request, dans la
  convention du dépôt.
`

func machineContext() []byte {
	preferences, err := content.ReadFile("content/preferences.md")
	if err != nil {
		return []byte(machineHeader)
	}

	return []byte(machineHeader + "\n" + strings.TrimRight(string(preferences), "\n") + "\n")
}
