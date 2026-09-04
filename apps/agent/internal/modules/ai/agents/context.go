package agents

import "strings"

const machineHeader = `# Contexte machine — serveur de développement distant

- Cette machine est un serveur Linux, pas un poste de travail. Ni Xcode, ni simulateur iOS,
  ni construction d'application de bureau ici.
- Les projets vivent dans ` + ProjectsDir + `. Shell : zsh.
- Avant d'écrire une commande, lis les scripts du package.json.
- Pilote les serveurs avec ` + "`dev`" + ` (dev up / down / logs / status), jamais avec un
  ` + "`bun run dev`" + ` lancé à la main : cela double les processus et bloque les ports.
- Les secrets viennent du gestionnaire de secrets de la machine, jamais d'un fichier commité.

## Les skills

Ils vivent dans ` + SkillsDir + `, et couvrent ce qui revient sans cesse :

- ` + "`server-dev`" + ` — enregistrer, démarrer, diagnostiquer un projet avec ` + "`dev`" + `.
- ` + "`capture`" + ` — montrer une image : ` + "`shot`" + ` écrit une URL publique, et la réponse se
  termine par cette URL, jamais par un chemin local que personne ne peut ouvrir d'ici.
  Les captures sont rangées dans ` + GalleryDir + `.
- ` + "`ship`" + `, ` + "`branch`" + `, ` + "`pr`" + ` — commiter, pousser, ouvrir une pull request, dans la
  convention du dépôt.
`

func machineContext() []byte {
	preferences, err := content.ReadFile("content/preferences.md")
	if err != nil {
		return []byte(machineHeader)
	}

	return []byte(machineHeader + "\n" + strings.TrimRight(string(preferences), "\n") + "\n")
}
