# 0015 — `dev` passe par un mot de passe pour sudo, sauf pour `pupitred`

Date : 2026-09-24 · Statut : acceptée

Le compte `dev` ne tient plus `NOPASSWD:ALL`. Deux règles le remplacent :

- **Sans mot de passe, seulement deux lignes exactes de `pupitred`,** par son chemin absolu et root-owned : `pupitred serve` et `pupitred binary install`, sans joker. `pupitred serve` y est une session limitée, qui refuse ce qui configure la machine, révèle un secret ou change la confiance ; l'app ouvre `pupitred serve --privileged` avec le mot de passe pour ces gestes-là. Poser un binaire d'agent passe par `pupitred`, qui vérifie la signature Ed25519 avant d'installer, et non plus par un `sh -c` en sudo.
- **Tout le reste demande le mot de passe de `dev`.**

Le mot de passe :

- **Il est tiré par l'app, sur l'ordinateur du client.** Seule son empreinte `crypt` part vers le serveur (`chpasswd -e`) ; la plateforme ne voit ni l'un ni l'autre.
- **Il est gardé au trousseau de l'ordinateur.** L'app l'affiche et le copie depuis la fiche du serveur.
- **Il est posé par la sécurisation** pour un serveur neuf. Un serveur existant se le voit proposer par l'app, car une migration de l'agent ne peut pas inventer un mot de passe que le client ne connaîtrait pas. Tant qu'il ne l'a pas accepté, ce serveur garde l'ancienne règle et l'app le signale.

Conséquence : `pupitred` agit en root sur des chemins que `dev` contrôle, et il ne suit plus un lien de `dev`. C'est désormais la frontière :

- écritures sous `/home/dev` par les primitives `os.Root` ;
- `O_NOFOLLOW` ;
- lecture des gabarits d'environnement dans la racine du projet.

Pourquoi : les agents IA, les scripts `postinstall` et tout ce qui tourne en `dev` travaillent sans surveillance. Avec `NOPASSWD:ALL`, chacun d'eux était root : il lisait le jeton du serveur et les clés du seau, et pouvait casser la machine. Désormais, devenir root demande le client. Le client, lui, garde sudo pour son usage : un mot de passe à coller, comme sur n'importe quel serveur bien tenu.

Écarté :
- **Garder `NOPASSWD:ALL` et le documenter** : le risque touche précisément l'usage que Pupitre vend, des agents IA autonomes sur le serveur.
- **Retirer sudo à `dev`** : le client doit pouvoir administrer sa machine.
- **Une liste blanche de commandes sans mot de passe (`apt`, `systemctl`)** : chacune ouvre root par ses options.
