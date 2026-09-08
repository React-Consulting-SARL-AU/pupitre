# Modules, configuration et onboarding — ce qui reste

Le chantier décrit ici est **livré**, sauf ce que cette page garde. Le détail de ce qui a été fait vit dans l'historique git et dans les contrats ; ce fichier ne porte que les décisions à valider et les suites possibles, et disparaît le jour où elles sont tranchées.

## Ce qui a changé

- **Une connexion est un compte, un module est une unité installée.** Un manifeste qui exige un compte le déclare (`connection`), et l'écran de configuration le demande au-dessus de ses propres questions. Le jeton Cloudflare est vérifié à la seconde où on le donne ; l'app lit le compte qu'il ouvre et les zones qu'il porte, et personne ne recopie d'identifiant.
- **Le tunnel appartient au serveur.** L'app le crée une fois et n'en garde rien : `module.config` le lui rend. Un poste réinstallé, ou un serveur confié à un collègue, le retrouve avec le seul jeton du compte. Le domaine est un champ ordinaire, par serveur.
- **Les contraintes vivent dans le manifeste**, appliquées par le même code des deux côtés et vérifiées contre un jeu de cas commun. Une valeur hors contrainte est refusée, jamais remplacée en silence par le défaut. `install` valide tout avant sa première étape ; `install.check` ajoute ce que seule la machine sait.
- **L'écran de configuration se lit de haut en bas** : un index à gauche, l'erreur sous le champ qui la porte, l'action en bas. Le nom de la machine est retourné là où une machine se nomme.
- **L'onboarding est une machine** ; les écrans dessinent. Une étape ne se rejoint que par une réponse qui la justifie, le retour suit le chemin parcouru, et la coque reste pendant que le corps change.
- **Chaque geste répond où il a été fait**, et l'accessibilité est une exigence du contrat de design, vérifiée par une passe axe dans les scénarios.
- **La plateforme est prévenue tout de suite** après une installation et un durcissement ; un enrôlement se reprend au lieu de se rejouer ; un canal perdu et un droit d'usage non confirmé se lisent dans un bandeau au lieu d'arrêter l'étape.

## À valider

1. **GitHub, 1Password, Neon** restent des secrets par serveur. Les basculer en connexions de compte, comme Cloudflare, retirerait une friction — un jeton GitHub est le même sur toutes les machines — sans rien changer à la sûreté. À décider avant d'écrire la deuxième connexion.
2. **`exposure.ssh` est un module qui n'installe rien.** Il existe pour tenir le créneau d'exclusivité et écrire un marqueur. Maintenant que le marqueur est la seule source et que le préréglage demande laquelle des trois prendre, il pourrait devenir l'état « aucune exposition » plutôt qu'un module. Ça touche le catalogue, le préréglage et le protocole.
3. **La palette a bougé.** `ink-3` et `ink-4` étaient sous le plancher de contraste, en clair comme en sombre : les valeurs sont remontées dans [DESIGN.md](../product/DESIGN.md) et dans les tokens. C'est un changement visible, à regarder sur les deux thèmes avant de le garder.
4. **`Manifest.provides` n'est lu par personne**, ni dans l'agent ni dans l'app. Il ne coûte rien et documente une intention ; à supprimer ou à faire servir.
5. **`PresetSchema.modules` est une liste fermée** alors qu'un manifeste porte un identifiant ouvert : un module ajouté à l'agent ne peut entrer dans un préréglage sans une version de `packages/shared`.
6. **`module_params` de `GET /api/v1/agent/state`** vaut `{}` en dur et n'est lu par personne. Le canal qu'il devait porter n'existe plus : un champ géré vient d'une connexion de l'app. À supprimer côté plateforme.

## Suites

- Les scénarios de bout en bout couvrent l'onboarding et la configuration. Les autres écrans n'ont pas encore leur passe axe : elle s'ajoute écran par écran, avec le scénario qui le couvre.
- La reprise d'un canal coupé est visible et l'installation la survit. Le scénario qui la joue de bout en bout — couper le canal pendant une installation, la voir reprendre — reste à écrire contre le harnais.
