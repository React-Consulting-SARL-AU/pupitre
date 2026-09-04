# Police d'affichage

`--font-display` désigne Bricolage Grotesque et les titres la demandent. Le
fichier est committé et servi depuis les ressources de l'app : rien n'est
chargé depuis Internet, l'app rend la même chose hors ligne.

| Fichier | Famille | Graisse | Sous-ensemble | Source | Licence | Récupéré le |
| --- | --- | --- | --- | --- | --- | --- |
| `bricolage-grotesque-700-latin.woff2` | Bricolage Grotesque | 700 | latin | https://fonts.gstatic.com/s/bricolagegrotesque/v9 (instance statique servie par Google Fonts) | SIL OFL 1.1 | 2026-09-04 |

Le projet amont est [ateliertriay/bricolage](https://github.com/ateliertriay/bricolage),
de Mathieu Triay. Le texte de la licence est dans [`OFL.txt`](./OFL.txt), copié
depuis ce dépôt.

## Ce que la licence permet

La SIL Open Font License 1.1 autorise l'usage, l'étude, la modification et la
redistribution de la fonte, y compris **embarquée dans un produit commercial et
fermé** : elle ne contamine pas le logiciel qui l'accompagne. Trois conditions
nous concernent.

- La fonte n'est jamais vendue seule ; elle est distribuée avec l'app.
- Le fichier est accompagné de sa notice de copyright et du texte de la
  licence, tous deux ci-contre, et le paquet de l'app les embarque.
- Aucun **Reserved Font Name** n'est déclaré dans la notice de copyright amont,
  donc le sous-ensemble latin garde le nom de la famille sans le renommer.

## La graisse embarquée

Seul le 700 est embarqué, parce que seul le 700 est utilisé : `--font-display-weight`
vaut 700 et les deux titres de l'app (`page-header`, `project-header`) le
demandent. Une graisse de plus se justifie le jour où un écran en demande une.

Le sous-ensemble latin couvre le français de l'interface, accents et ligature
`œ` compris ; l'`unicode-range` de `fonts.css` est celui de ce sous-ensemble, de
sorte qu'un caractère hors couverture retombe proprement sur la police système
plutôt que de faire dessiner un glyphe absent.
