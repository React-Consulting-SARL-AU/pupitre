# Modules, configuration et onboarding — ce qui reste

Le chantier décrit ici est **livré**, sauf ce que cette page garde. Le détail de ce qui a été fait vit dans l'historique git et dans les contrats ; ce fichier ne porte que les décisions à valider et les suites possibles, et disparaît le jour où elles sont tranchées.

## Ce qui a changé

- **Une connexion est un compte, un module est une unité installée.** Un manifeste qui exige un compte le déclare (`connection`), et l'écran de configuration le demande au-dessus de ses propres questions. Le jeton Cloudflare est vérifié à la seconde où on le donne ; l'app lit le compte qu'il ouvre et les zones qu'il porte, et personne ne recopie d'identifiant.
- **Le tunnel appartient au serveur.** L'app le crée une fois et n'en garde rien : `module.config` le lui rend. Un poste réinstallé, ou un serveur confié à un collègue, le retrouve avec le seul jeton du compte. Le domaine est un champ ordinaire, par serveur.
- **Les contraintes vivent dans le manifeste**, appliquées par le même code des deux côtés et vérifiées contre un jeu de cas commun. Une valeur hors contrainte est refusée, jamais remplacée en silence par le défaut. `install` valide tout avant sa première étape ; `install.check` ajoute ce que seule la machine sait.
- **L'écran de configuration se lit un service à la fois** : l'index à gauche dit lequel est ouvert et lesquels attendent encore, le panneau ne pose que les questions de ce service et range derrière un pli fermé ce que le manifeste a déjà réglé, l'erreur se lit sous le champ qui la porte, l'action en bas. Le nom de la machine est retourné là où une machine se nomme.
- **L'onboarding est une machine** ; les écrans dessinent. Une étape ne se rejoint que par une réponse qui la justifie, le retour suit le chemin parcouru, et la coque reste pendant que le corps change.
- **Chaque geste répond où il a été fait**, et l'accessibilité est une exigence du contrat de design, vérifiée par une passe axe dans les scénarios.
- **La plateforme est prévenue tout de suite** après une installation et un durcissement ; un enrôlement se reprend au lieu de se rejouer ; un canal perdu et un droit d'usage non confirmé se lisent dans un bandeau au lieu d'arrêter l'étape.

## À valider

1. **GitHub, 1Password, Neon** restent des secrets par serveur. Les basculer en connexions de compte, comme Cloudflare, retirerait une friction — un jeton GitHub est le même sur toutes les machines — sans rien changer à la sûreté. À décider avant d'écrire la deuxième connexion.
2. **`exposure.ssh` est un module qui n'installe rien.** Il existe pour tenir le créneau d'exclusivité et écrire un marqueur. Maintenant que le marqueur est la seule source et que le préréglage demande laquelle des trois prendre, il pourrait devenir l'état « aucune exposition » plutôt qu'un module. Ça touche le catalogue, le préréglage et le protocole.
3. **La palette a bougé.** `ink-3` et `ink-4` étaient sous le plancher de contraste, en clair comme en sombre : les valeurs sont remontées dans [DESIGN.md](../product/DESIGN.md) et dans les tokens. Dans la foulée, dix-neuf textes qui portaient seuls une information — un rôle, une date de validité, une empreinte, l'adresse de la console, les paragraphes d'explication — sont passés de `ink-4` à `ink-3`, que le contrat réserve aux libellés et aux métadonnées ; `ink-4` ne garde que les placeholders, le désactivé, les glyphes et l'étape qu'on n'a pas atteinte. La passe axe mesure maintenant le tableau de bord dans les deux thèmes. C'est un changement visible, à regarder avant de le garder.

## Suites

- `tool.neon` pose le CLI et garde la clé en `0600 root` ; `neonctl` n'a pas de connexion par jeton, donc un shell de `dev` n'est pas authentifié tant que personne ne lui passe `NEON_API_KEY`. Le résumé du module et la page du site le disent maintenant ; reste à décider si l'app doit offrir le geste.
- Le texte d'usage de `shot` et de `dev` est en français, quelle que soit la langue de la session : la décision est notée dans `internal/i18n/french_test.go` et attend d'être tranchée. Le message d'erreur de `shots.Take` la suit sans y être déclaré.
