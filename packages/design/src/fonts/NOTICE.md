# Polices embarquées

`--font-display` désigne Bricolage Grotesque et les titres la demandent ;
`--font-data` désigne JetBrains Mono pour toute donnée. Les fichiers sont
committés et servis depuis les ressources de l'app et depuis le site : rien
n'est chargé depuis Internet, l'app rend la même chose hors ligne et le site ne
contacte aucun tiers pour ses polices.

| Fichier | Famille | Graisse | Sous-ensemble | Source | Licence | Récupéré le |
| --- | --- | --- | --- | --- | --- | --- |
| `bricolage-grotesque-700-latin.woff2` | Bricolage Grotesque | 700 | latin | https://fonts.gstatic.com/s/bricolagegrotesque/v9 (instance statique servie par Google Fonts) | SIL OFL 1.1 | 2026-09-04 |
| `jetbrains-mono-latin.woff2` | JetBrains Mono | 100 à 800 (variable) | latin | https://fonts.gstatic.com/s/jetbrainsmono/v24 (fichier variable servi par Google Fonts) | SIL OFL 1.1 | 2026-09-24 |

Le projet amont de Bricolage Grotesque est
[ateliertriay/bricolage](https://github.com/ateliertriay/bricolage), de Mathieu
Triay ; sa licence est dans [`OFL.txt`](./OFL.txt), copiée depuis ce dépôt.
Celui de JetBrains Mono est
[JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono) ; sa
licence est dans [`OFL-JetBrainsMono.txt`](./OFL-JetBrainsMono.txt), copiée
depuis ce dépôt.

## Ce que la licence permet

La SIL Open Font License 1.1 autorise l'usage, l'étude, la modification et la
redistribution d'une fonte, y compris **embarquée dans un produit commercial et
fermé** : elle ne contamine pas le logiciel qui l'accompagne. Trois conditions
nous concernent.

- Une fonte n'est jamais vendue seule ; elle est distribuée avec l'app et servie
  avec le site.
- Chaque fichier est accompagné de sa notice de copyright et du texte de sa
  licence, ci-contre, et le paquet de l'app les embarque.
- Aucun **Reserved Font Name** n'est déclaré dans les notices de copyright
  amont, donc les sous-ensembles latins gardent le nom de leur famille sans le
  renommer.

## Les graisses embarquées

Seul le 700 de Bricolage Grotesque est embarqué, parce que seul le 700 est
utilisé : `--font-display-weight` vaut 700. Une graisse de plus se justifie le
jour où un écran en demande une.

JetBrains Mono est un seul fichier variable, qui couvre le 400 du texte et le
500 des libellés sans un second téléchargement.

Les sous-ensembles latins couvrent le français, accents et ligature `œ`
compris ; l'`unicode-range` de `fonts.css` est celui de ces sous-ensembles, de
sorte qu'un caractère hors couverture retombe proprement sur la police système
plutôt que de faire dessiner un glyphe absent.

`font-display: block` garde le texte invisible le temps, court, de lire un
fichier local ou préchargé, plutôt que d'afficher une police de secours puis de
la remplacer et de faire bouger la page.

## La copie TrueType du générateur

`scripts/fonts/bricolage-grotesque-700.ttf` est la même graisse, au format
TrueType, lue uniquement par `scripts/generate-brand.ts` : le générateur
vectorise « Pupitre » pour les lockups du kit de marque, et l'outil qui fait ce
travail ne sait pas lire un woff2. Ce fichier n'est jamais servi ni embarqué
dans un binaire ; il ne quitte pas le temps de génération. Même source, même
licence, même date que la première ligne du tableau.
