# Un faux VPS dans Docker

Une machine Ubuntu 24.04 sous systemd, jointe en SSH sur le port 2222, qui tient lieu de VPS de test.

**Elle tourne sur le Mac.** C'est la boucle courte : le conteneur est sur la même machine que l'app,
joint par `127.0.0.1`, sans réseau local, sans pare-feu à ouvrir et sans adresse qui change de café en
café. Le PC Windows garde une raison d'exister — il est `amd64`, le Mac est `arm64` — mais c'est un
contrôle avant une release, pas le geste de tous les jours.

**Root ouvre avec un mot de passe**, comme une machine qu'on vient de louer : l'app le demande une fois,
pose sa propre clé sur cette session, et tout ce qui suit se joue comme sur un vrai VPS. `core.hardening`
est ce qui referme la porte, et c'est justement l'étape que ce banc sert à éprouver.

L'image sait aussi n'exiger **rien du tout** — `ROOT_PASSWORD` vide, `PermitEmptyPasswords yes` —, ce qui
est pratique pour un `ssh` à la main. Ce n'est pas le bon réglage pour l'onboarding : l'app constate que
la machine s'ouvre déjà et n'installe donc pas sa clé, si bien que le durcissement refuse de fermer root,
faute de clé qui ouvre `dev`. Le mot de passe est le réglage par défaut pour cette raison.

**L'identité de la machine survit à une reconstruction.** Les clés d'hôte vivent sur un volume, pas dans
l'image : `docker compose up --build` rend à l'app le même serveur, pas un inconnu. Seul `down -v` fait
une machine neuve — et l'app demandera alors de confirmer la réinstallation, ce qui est le bon geste.

## Sur le MacBook

Il faut un runtime de conteneurs. **OrbStack** est le plus léger sur un Mac Apple silicon et fournit
`docker` et `docker compose` :

```bash
brew install --cask orbstack
```

Docker Desktop fait la même chose, en plus lourd. Puis, depuis le dépôt :

```bash
cd apps/agent/test/vps
docker compose up -d --build
```

C'est tout : le port `2222` répond sur `127.0.0.1`, il n'y a ni règle de pare-feu à poser ni adresse à
relever.

## Depuis l'app desktop

Ajoute le serveur avec l'hôte `127.0.0.1`, le port `2222` et le compte `root`. L'app demande le mot de
passe — `pupitre` — une seule fois, pose sa clé, et enchaîne.

## Sur le PC Windows, pour l'amd64

Docker Desktop installé, backend WSL2.

1. Copie ce dossier sur le PC.
2. Dans le dossier, en PowerShell :

   ```powershell
   docker compose up -d --build
   ```

3. Ouvre le port sur le réseau local, en PowerShell administrateur, une fois pour toutes :

   ```powershell
   New-NetFirewallRule -DisplayName "Pupitre VPS de test" -Direction Inbound -Protocol TCP -LocalPort 2222 -Action Allow -Profile Private
   ```

   Le profil du réseau Wi-Fi doit être `Private` : `Get-NetConnectionProfile`.

4. Relève l'adresse locale du PC : `ipconfig` → « Adresse IPv4 » de la carte utilisée, et donne-la à
   l'app à la place de `127.0.0.1`.

## Si l'app dit « répond, mais ce n'est pas un accès SSH »

Le port accepte la connexion et la coupe aussitôt : c'est le proxy de Docker qui répond, sans rien
derrière lui. `sshd` ne tourne donc pas dans le conteneur. Ce que ça dit :

```bash
docker compose exec vps systemctl status ssh.service --no-pager
ssh -p 2222 root@127.0.0.1 true          # « Connection reset » quand rien n'écoute
```

L'image fait tourner `sshd` de plein droit plutôt que par activation de socket, précisément pour cette
raison : `ssh.socket` ne montait pas dans ce conteneur, et rien ne le disait. Un `ssh.service` inactif
après un `up` est le signe qu'il faut reconstruire — `docker compose up -d --build`.

## Depuis le terminal

Pour pousser un binaire de développement ou jouer les tests d'intégration, une clé évite de retaper le
mot de passe à chaque commande. Déclare la tienne au build :

```bash
export PUPITRE_VPS_KEY="$(cat ~/.ssh/id_ed25519.pub)"
docker compose up -d --build
```

Puis, sur le Mac :

```bash
export VPS=root@127.0.0.1
ssh -p 2222 $VPS true                 # répond sans rien demander

bun --cwd=apps/agent run build:dev:linux-arm64
ssh -p 2222 $VPS 'install -m 755 /dev/stdin /usr/local/bin/pupitred' < apps/agent/dist/dev/pupitred-linux-arm64
ssh -p 2222 $VPS pupitred install --only=runtime.node,ai.claude
```

Le build `dev` embarque un droit d'usage : ni jeton ni plateforme. Sur le PC, `build:dev` et
`pupitred-linux-amd64`, avec l'adresse relevée à la place de `127.0.0.1`.

Tests d'intégration :

```bash
PUPITRE_STAGING_HOST="root@127.0.0.1" go test -tags staging ./test/staging/...
```

Le harnais appelle `ssh` sans `-p` : déclare le port dans `~/.ssh/config`.

```sshconfig
Host 127.0.0.1
  Port 2222
  User root
```

## Une machine qui n'exige rien

Pour un `ssh` à la main, l'image sait ouvrir sans clé ni mot de passe :

```bash
docker compose build --build-arg ROOT_PASSWORD=
docker compose up -d
```

`sshd` remet alors le mot de passe vide à PAM, qui ne l'accepte que si `pam_unix` porte `nullok` —
l'image l'y met, et deux commandes le disent :

```bash
docker compose exec vps sshd -T | grep -i permitemptypasswords   # doit dire yes
docker compose exec vps grep nullok /etc/pam.d/common-auth       # doit répondre
```

À ne pas utiliser pour l'onboarding : l'app voit une machine qui s'ouvre déjà, n'installe donc pas sa
clé, et le durcissement refuse ensuite de fermer root faute de clé qui ouvre `dev`.

## L'architecture

Un Mac teste `arm64`, jamais `amd64`. Un module qui télécharge un binaire par architecture — mise,
Claude Code, les éditeurs — n'est donc éprouvé que pour l'une des deux dans la boucle courte. Le PC
Windows tranche l'autre, et le VPS de staging, `amd64`, tranche avant une release.

## La sonde doit voir une machine vierge

Deux détails la feraient conclure « serveur déjà utilisé », et aucun ne dit quoi que ce soit du vrai serveur :

- `/var/lib/docker` la convainc que Docker est là. D'où l'absence de volume nommé sur ce chemin.
- L'image `ubuntu:24.04` livre un compte `ubuntu` en UID 1000, qu'elle compte comme compte non système. D'où le `userdel`.

Si le verdict reste `in_use`, `pupitred probe` sur la machine dit ce qu'elle a vu.

## Remise à zéro

Deux gestes, et ils ne disent pas la même chose à l'app.

```bash
docker compose down            # la machine repart à zéro, avec la même identité
docker compose up -d --build
```

```bash
docker compose down -v         # une autre machine : nouvelles clés d'hôte
docker compose up -d --build
```

Après le second, l'app refuse la connexion — elle avait épinglé l'empreinte de la précédente, et ne
sait pas distinguer une réinstallation de quelqu'un qui répondrait à sa place. Réglages › Serveurs,
avec ce serveur actif : le bandeau compare les deux empreintes, et **« J'ai réinstallé ce serveur »**
réépingle la nouvelle. C'est le comportement voulu ; le premier geste évite d'y passer à chaque fois.

## Ce que cette machine ne reproduit pas

- `create-swap` échoue — pas de swap dans un conteneur. L'étape se contente d'un avertissement.
- `ufw` et `fail2ban` s'installent, mais filtrent le réseau du conteneur, pas celui d'un vrai VPS.
- Le noyau est celui de la machine virtuelle qui porte Docker — WSL2 sur le PC, la VM d'OrbStack ou de Docker Desktop sur le Mac — et il est partagé : `sysctl` s'applique à elle tout entière.
- Pas d'adresse publique : les tunnels Cloudflare sortants marchent, une exposition par DNS public non.
- Redémarrer la machine, c'est `docker compose restart`, pas un vrai `reboot`.
- Le module `runtime.docker` s'installe, mais son stockage tombe sur `vfs` : le noyau refuse overlay2 au-dessus de l'overlay du conteneur. Lent, et rien à voir avec un vrai VPS.
- `runtime.rust` échoue : `/tmp` est monté `noexec` (tmpfs du conteneur), et `rustup-init` s'extrait dans `/tmp` puis s'y exécute. Un vrai VPS a un `/tmp` exécutable et l'installe sans broncher.
- `db.*` en bloc sature le stockage `vfs` (30 min, échecs d'apt sous la contention) alors que chaque base seule s'installe très bien ; le `snapshot` à dix projets dépasse de quelques millisecondes son budget de 300 ms, le temps de la virtualisation OrbStack. Les deux passent sur un vrai VPS.

Pour ce que cette liste couvre, un vrai VPS de staging reste le juge.
