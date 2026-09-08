# Un faux VPS dans Docker

Une machine Ubuntu 24.04 sous systemd, jointe en SSH par clé sur le port 2222, qui tient lieu de VPS de test.
Elle tourne sur le PC Windows ; le MacBook la joint par l'adresse locale du PC.

## Sur le PC Windows

Docker Desktop installé, backend WSL2.

1. Copie ce dossier sur le PC.
2. Dépose la clé publique du MacBook à côté du `Dockerfile`, sous le nom `authorized_keys` (une ligne, telle quelle).
3. Dans le dossier, en PowerShell :

   ```powershell
   docker compose up -d --build
   ```

4. Ouvre le port sur le réseau local, en PowerShell administrateur, une fois pour toutes :

   ```powershell
   New-NetFirewallRule -DisplayName "Pupitre VPS de test" -Direction Inbound -Protocol TCP -LocalPort 2222 -Action Allow -Profile Private
   ```

   Le profil du réseau Wi-Fi doit être `Private` : `Get-NetConnectionProfile`.

5. Relève l'adresse locale du PC : `ipconfig` → « Adresse IPv4 » de la carte utilisée.

## Sur le MacBook

```bash
export VPS=root@192.168.1.42          # l'adresse relevée à l'étape 5
ssh -p 2222 $VPS true                 # doit répondre sans mot de passe

bun --cwd=apps/agent run build:dev
ssh -p 2222 $VPS 'install -m 755 /dev/stdin /usr/local/bin/pupitred' < apps/agent/dist/dev/pupitred-linux-amd64
ssh -p 2222 $VPS pupitred install core
```

Le build `dev` embarque un droit d'usage : ni jeton ni plateforme.
`amd64` si le PC est un x86, `arm64` sinon.

Tests d'intégration :

```bash
PUPITRE_STAGING_HOST="root@192.168.1.42" go test -tags staging ./test/staging/...
```

Le harnais appelle `ssh` sans `-p` : déclare le port dans `~/.ssh/config`.

```sshconfig
Host 192.168.1.42
  Port 2222
  User root
```

Depuis l'app desktop : ajoute le serveur avec l'hôte `192.168.1.42` et le port `2222`.

## La sonde doit voir une machine vierge

Deux détails la feraient conclure « serveur déjà utilisé », et aucun ne dit quoi que ce soit du vrai serveur :

- `/var/lib/docker` la convainc que Docker est là. D'où l'absence de volume nommé sur ce chemin.
- L'image `ubuntu:24.04` livre un compte `ubuntu` en UID 1000, qu'elle compte comme compte non système. D'où le `userdel`.

Si le verdict reste `in_use`, `pupitred probe` sur la machine dit ce qu'elle a vu.

## Remise à zéro

```powershell
docker compose down -v
docker compose up -d --build
```

## Ce que cette machine ne reproduit pas

- `create-swap` échoue — pas de swap dans un conteneur. L'étape se contente d'un avertissement.
- `ufw` et `fail2ban` s'installent, mais filtrent le réseau du conteneur, pas celui d'un vrai VPS.
- Le noyau est celui de WSL2, partagé : `sysctl` s'applique à la machine virtuelle entière.
- Pas d'adresse publique : les tunnels Cloudflare sortants marchent, une exposition par DNS public non.
- Redémarrer la machine, c'est `docker compose restart`, pas un vrai `reboot`.
- Le module `runtime.docker` s'installe, mais son stockage tombe sur `vfs` : le noyau refuse overlay2 au-dessus de l'overlay du conteneur. Lent, et rien à voir avec un vrai VPS.

Pour ce que cette liste couvre, un vrai VPS de staging reste le juge.
