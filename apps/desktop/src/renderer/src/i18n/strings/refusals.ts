/**
 * What the main process refuses, in the language of whoever is looking.
 *
 * A refusal coming from the app names one of these entries; a refusal coming
 * from the agent is shown as is, in the language the server answered in.
 */
export const refusals = {
  en: {
    "refusal.project.command.unknown": "Unknown project command: {cmd}.",
    "refusal.module.undeclared":
      "This server's catalogue does not declare {module}.",
    "refusal.harden.account":
      "The server is hardened, but the app could not move its connection to {user}.",
    "refusal.binary.arch":
      "This app carries no agent for the {arch} architecture.",
    "refusal.binary.checksum":
      "The embedded binary {file} does not match its checksum.",
    "refusal.binary.timeout":
      "Sending the agent did not finish within {seconds} s.",
    "refusal.binary.send":
      "The agent could not be sent to the server: {detail}",
    "refusal.binary.install":
      "The agent could not be installed on the server: {detail}",
    "refusal.probe.timeout": "The probe did not answer within {seconds} s.",
    "refusal.probe.failed": "The probe could not run on the server.",
    "refusal.probe.failed.detail":
      "The probe could not run on the server: {detail}",
    "refusal.command.timeout":
      "Command {cmd} did not answer within {seconds} s.",
    "refusal.platform.silent": "The console did not answer: {reason}.",
    "refusal.platform.refused": "The console refused the request ({status}).",
    "refusal.release.unpublished":
      "The console has no downloadable binary for {version}.",
    "refusal.reach.refused": "Nothing listens on port {port} of {host}.",
    "refusal.reach.unreachable": "{host} is not reachable from this computer.",
    "refusal.reach.timeout": "{host}:{port} did not answer in time.",
    "refusal.reach.wrongPort":
      "{host}:{port} answers, but it is not an SSH server.",
    "refusal.project.unknown":
      "This server has declared no project named {name}.",
    "refusal.project.action.unknown": "Unknown action: {action}.",
    "refusal.branch.unknown": "Invalid branch name: {branch}.",
    "refusal.secret.unknown": "Invalid key: {key}.",
    "refusal.secrets.stale": "This server has declared no key named {key}.",
    "refusal.account.suspended.fix":
      "Settle the subscription in the console: {console}",
    "refusal.account.stale.fix":
      "Reconnect this computer, or check the account's state: {console}",
    "refusal.account.required.fix":
      "Sign in from the settings, or open the console: {console}",
    "refusal.binary.write.fix":
      "Check that the account in use may write to {path}, then run the installation again.",
    "refusal.enroll.consumed": "This enrolment token has already been used.",
    "refusal.agent.dropped": "The connection to the server was interrupted.",
    "refusal.agent.dropped.detail":
      "The connection to the server was interrupted: {detail}",
    "refusal.agent.dropped.fix":
      "Check that the server answers, then run the command again.",
    "refusal.command.timeout.fix":
      "Run the command again, or open a diagnosis with doctor.",
    "refusal.platform.silent.local": "The console did not answer: {reason}.",
    "refusal.platform.silent.local.fix":
      "No console answers on {baseUrl}: run `bun run dev:web`.",
    "refusal.platform.silent.fix":
      "Check your connection. Pupitre stays usable for seven days without the console.",
    "refusal.platform.refused.fix":
      "Sign in again from the settings, then try again.",
    "refusal.account.signedOut": "No account is signed in on this computer.",
    "refusal.account.signedOut.fix":
      "Sign in from the account screen, then try again.",
    "refusal.account.stale":
      "The console has not answered for more than seven days: the usage right has expired.",
    "refusal.enrollment.none":
      "The console handed no enrolment token for this server.",
    "refusal.binary.mismatch":
      "The server does not have the same checksum as the binary that was sent.",
    "refusal.setup.host": "« {host} » does not look like a server address.",
    "refusal.setup.host.fix":
      "An IP address or a host name, with no space and no punctuation — « 203.0.113.10 » or « vps.example.net ».",
    "refusal.setup.port": "Port {port} does not exist.",
    "refusal.setup.port.fix":
      "A port between 1 and 65535: 22 for an ordinary SSH server.",
    "refusal.setup.user": "« {user} » is not a user name.",
    "refusal.setup.user.fix":
      "The account to open on the server: « root » at first contact, « dev » once the machine is hardened.",
    "refusal.key.name": "« {serverId} » cannot name a key.",
    "refusal.key.name.fix":
      "An identifier of letters, digits and dashes: nothing that could point at another folder.",
    "refusal.key.generate": "ssh-keygen could not create the key.",
    "refusal.key.generate.fix":
      "Install OpenSSH on this computer, or import a key you already have.",
    "refusal.key.unreadable": "This private key could not be read.",
    "refusal.key.unreadable.fix":
      "A key protected by a passphrase does not fit here: import one without a passphrase, or let the app generate one.",
    "refusal.key.missing": "File {source} was not found.",
    "refusal.key.missing.fix":
      "Pick the key's file, the one without the .pub extension.",
    "refusal.key.public": "This file is not a private key.",
    "refusal.key.public.fix":
      "Take the private half — « id_ed25519 » — and not the « id_ed25519.pub » that comes with it.",
    "refusal.key.system":
      "This host comes from your ~/.ssh/config: the app installs no key on it.",
    "refusal.key.system.fix":
      "Your own configuration says which key opens it, and the app does not touch that file.",

    "refusal.keyInstall.denied": "The server refused the password.",
    "refusal.keyInstall.denied.detail":
      "The server refused the password. It said: {detail}",
    "refusal.keyInstall.denied.detail.fix":
      "It is the password of the remote account, the one your host gave you when the machine was created.",
    "refusal.keyInstall.denied.fix":
      "It is the password of the remote account, the one your host gave you when the machine was created.",
    "refusal.keyInstall.keysOnly":
      "This server only accepts keys, and none of the ones this computer holds opens it.",
    "refusal.keyInstall.keysOnly.detail":
      "This server only accepts keys, and none of the ones this computer holds opens it. It said: {detail}",
    "refusal.keyInstall.keysOnly.detail.fix":
      "Install the public key below yourself, from a session that already opens the machine, then come back.",
    "refusal.keyInstall.keysOnly.fix":
      "Install the public key below yourself, from a session that already opens the machine, then come back.",
    "refusal.keyInstall.hostKey":
      "The machine did not present the fingerprint the app pinned.",
    "refusal.keyInstall.hostKey.detail":
      "The machine did not present the fingerprint the app pinned. It said: {detail}",
    "refusal.keyInstall.hostKey.detail.fix":
      "Settle that first: a reinstalled server is said so in the list, and anything else is not this machine.",
    "refusal.keyInstall.hostKey.fix":
      "Settle that first: a reinstalled server is said so in the list, and anything else is not this machine.",
    "refusal.keyInstall.unreachable":
      "The address did not answer while the key was being installed.",
    "refusal.keyInstall.unreachable.detail":
      "The address did not answer while the key was being installed. It said: {detail}",
    "refusal.keyInstall.unreachable.detail.fix":
      "Check the address and the port, then try again.",
    "refusal.keyInstall.unreachable.fix":
      "Check the address and the port, then try again.",
    "refusal.keyInstall.failed": "The app could not install the key by itself.",
    "refusal.keyInstall.failed.detail":
      "The app could not install the key by itself. ssh said: {detail}",
    "refusal.keyInstall.windows":
      "On Windows, ssh cannot be given a password without a terminal.",
    "refusal.keyInstall.windows.fix":
      "Paste the line below into a terminal: it asks for the password itself.",
    "refusal.release.checksum":
      "The downloaded binary does not match the digest announced for {version}.",
    "refusal.release.checksum.fix":
      "Run the installation again: the console may have served a truncated file.",
    "refusal.release.unsigned":
      "The console did not sign agent version {version}.",
    "refusal.release.unsigned.fix":
      "Publish a signed agent version before installing it on a server.",
    "refusal.release.key":
      "This app carries no public key to validate the agent's binaries.",
    "refusal.release.key.fix":
      "Build the app again with the release signing key.",
    "refusal.release.signature":
      "The signature of agent version {version} is invalid.",
    "refusal.release.signature.fix":
      "Do not install this binary: report it, then try again from the console.",
    "refusal.fleet.unknown.fix":
      "Reload your organization's servers from the settings.",
    "refusal.fleet.withdrawn": "This server is no longer granted to you.",
    "refusal.fleet.withdrawn.fix":
      "Ask an administrator of your organization to grant it to you again.",
    "refusal.fleet.pending":
      "The console has not pushed your key on this server yet.",
    "refusal.fleet.pending.fix":
      "Leave the window open: the app tries again on its own.",
    "refusal.module.none": "This module has no name.",
    "refusal.module.none.fix": "Pick a service in the list.",
    "refusal.module.notDatabase": "{module} is not a database.",
    "refusal.module.notDatabase.fix":
      "This action exists for the modules of the « databases » category only.",
    "refusal.params.invalid": "Invalid parameters for {cmd}.",
    "refusal.bridge.credential":
      "{cmd} answers with a credential and does not cross this bridge.",
    "refusal.bridge.secret":
      "{cmd} carries a secret and does not cross this bridge.",
    "refusal.agent.project": "An agent opens on a project.",
    "refusal.agent.project.fix": "Open the agent from a project's page.",
    "refusal.channel.closed": "The connection to the server was closed.",
    "refusal.channel.closed.fix":
      "Open the server again, or run the command once more.",
    "refusal.port.range": "This port does not exist.",
    "refusal.port.range.fix":
      "A port runs from 1 to 65535; the service's own is on its card.",
    "refusal.terminal.kind": "Unknown terminal kind: {kind}.",
    "refusal.terminal.kind.fix":
      "Open a terminal, or the tab of an installed agent.",
    "refusal.cloudflare.absent": "No Cloudflare account is connected.",
    "refusal.cloudflare.absent.fix":
      "Connect your Cloudflare account in the settings before exposing projects.",
    "refusal.cloudflare.call": "Cloudflare refused: {reason}.",
    "refusal.cloudflare.call.fix":
      "Check that the token still carries the tunnel and zone DNS rights.",
    "refusal.cloudflare.token.none": "This token is empty.",
    "refusal.cloudflare.token.none.fix":
      "Paste an account token with the Cloudflare Tunnel and zone DNS rights.",
    "refusal.cloudflare.account.none": "This token opens no account.",
    "refusal.cloudflare.account.none.fix":
      "Create the token on the Cloudflare account that carries your zone, then give it again.",
    "refusal.cloudflare.zone.unknown":
      "No zone of the connected account carries {domain}.",
    "refusal.cloudflare.zone.unknown.fix":
      "Pick a domain under one of the account's zones, or add that zone to Cloudflare.",
    "refusal.cloudflare.zone.none": "This zone is incomplete.",
    "refusal.cloudflare.zone.none.fix":
      "Give the account, the zone and the domain the projects are published under.",
    "refusal.project.name.none": "This project has no name.",
    "refusal.project.name.none.fix": "Name the project before publishing it.",
    "refusal.server.unknown": "This server is no longer in the list.",
    "refusal.server.unknown.fix": "Pick a server in the settings.",
    "refusal.modules.none": "No module to install.",
    "refusal.modules.none.fix": "Pick at least one module in the catalogue.",
    "refusal.modules.unreadable": "The module list cannot be read.",
    "refusal.modules.unreadable.fix":
      "Reload the catalogue, then make your selection again.",
    "refusal.modules.stale.fix":
      "Reload the list of services, then run the update again.",
    "refusal.selection.unreadable": "The module list cannot be read.",
    "refusal.selection.unreadable.fix":
      "Go back to the catalogue and make your selection again.",
    "refusal.repair.failed.fix":
      "Run the repair again, or reconnect this computer from the settings.",
    "refusal.command.unknown": "Unknown command: {cmd}.",
    "refusal.harden.account.fix":
      "Open the settings, fix this server's account, then sign in again.",
    "refusal.account.none": "No account is signed in on this computer.",
    "refusal.account.none.fix":
      "Sign in from the account screen, then try again.",
    "refusal.account.suspended":
      "This organization's usage right is suspended.",
    "refusal.account.required":
      "Installing a server asks for a Pupitre account.",
    "refusal.signIn.denied": "The request was denied in the browser.",
    "refusal.signIn.denied.fix":
      "Start signing in again and approve the code shown.",
    "refusal.signIn.expired": "The code shown expired before it was approved.",
    "refusal.signIn.expired.fix": "Start signing in again for a fresh code.",
    "refusal.device.none": "This computer is signed in to no Pupitre account.",
    "refusal.device.none.fix":
      "Sign in from the settings, then run the repair again.",
    "refusal.device.none.console":
      "This computer is signed in to no Pupitre account.",
    "refusal.device.none.console.fix":
      "Sign in from the settings, or open the console: {console}",
    "refusal.probe.unreachable.fix":
      "Check that the server answers over SSH, then run the inspection again.",
    "refusal.probe.unreadable": "The probe returned no readable report.",
    "refusal.probe.unreadable.fix":
      "Run the inspection again; if the server answers with a banner, take it out of the connection profile.",
    "refusal.probe.slow.fix":
      "Run the inspection again, or check the latency of the connection to the server.",
    "refusal.binary.missing.fix":
      "Build the agent with bun --cwd=apps/agent run build, then build the app again.",
    "refusal.binary.stale.fix":
      "Build the app again: bun --cwd=apps/desktop run build.",
    "refusal.binary.slow.fix":
      "Check the throughput of the connection to the server, then run the installation again.",
    "refusal.binary.unreachable.fix":
      "Check that the server answers over SSH, then run the installation again.",
    "refusal.binary.mismatch.fix":
      "Run the installation again; if the gap stays, check the server's disk space.",
    "refusal.release.none": "No agent version is published for this machine.",
    "refusal.release.none.fix":
      "Publish an agent version from the console before installing a server.",
    "refusal.binary.missing": "This app carries no agent binary.",
    "refusal.agent.unreachable.fix":
      "Check that the server answers, then run the command again.",
    "refusal.agent.retry.fix":
      "Run the command again, or open a diagnosis with doctor.",
    "refusal.server.added": "This server could not be added.",
    "refusal.server.added.fix":
      "Try again; if it happens once more, generate the key rather than importing it.",
    "refusal.terminal.unknown": "This terminal has no identifier.",
    "refusal.terminal.unknown.fix": "Close this tab and open another one.",
    "refusal.session.expired.fix":
      "Sign in again from the settings, then try again.",
    "refusal.release.unpublished.fix":
      "Publish an agent version, or stay on a development build.",
    "refusal.port.invalid": "The port has to be a number between 1 and 65535.",
    "refusal.port.invalid.fix": "SSH usually listens on port 22.",
    "refusal.reach.refused.fix":
      "Check that the SSH server runs, and that the port is the right one.",
    "refusal.reach.unreachable.fix":
      "Check the address, your connection, and the server's firewall.",
    "refusal.reach.timeout.fix":
      "A firewall often lets the connection open without ever answering.",
    "refusal.reach.wrongPort.fix": "Check the port: it usually is 22.",
    "refusal.hostKey.changed":
      "This server's host key has changed since the first contact. The connection is refused: that happens when a server is reinstalled, and also when someone answers in its place.",
    "refusal.hostKey.changed.fix":
      "If you have just reinstalled this server, replace the pinned fingerprint. Otherwise, do not connect: check the machine first.",
    "refusal.project.unreadable": "The project's description is incomplete.",
    "refusal.project.unreadable.fix": "Go back over the form.",
    "refusal.project.unknown.fix":
      "Reload the list of projects, then start again.",
    "refusal.project.action.unknown.fix": "Pick start, stop or restart.",
    "refusal.file.none": "No file was named.",
    "refusal.file.none.fix": "Pick a file from the working tree.",
    "refusal.branch.unknown.fix":
      "Pick a branch from the list the server gave.",
    "refusal.secret.unknown.fix": "Pick a key from the list the server gave.",
    "refusal.secret.value.invalid":
      "The value is empty or spans several lines.",
    "refusal.secret.value.invalid.fix": "Give a value on a single line.",
    "refusal.secrets.stale.fix":
      "Reload the list of secrets, then start again.",
    "refusal.secret.screen.fix":
      "Use the Services screen, which keeps the value in the main process.",
    "refusal.install.screen.fix":
      "Use the installation screen, which sends the secret from the main process.",
  },
  fr: {
    "refusal.project.command.unknown": "Commande de projet inconnue : {cmd}.",
    "refusal.module.undeclared":
      "Le catalogue de ce serveur ne déclare pas {module}.",
    "refusal.harden.account":
      "Le serveur est durci, mais l'app n'a pas pu passer sa connexion sur {user}.",
    "refusal.binary.arch":
      "Cette app ne porte pas d'agent pour l'architecture {arch}.",
    "refusal.binary.checksum":
      "Le binaire {file} embarqué ne correspond pas à sa somme de contrôle.",
    "refusal.binary.timeout":
      "L'envoi de l'agent n'a pas abouti en {seconds} s.",
    "refusal.binary.send":
      "L'agent n'a pas pu être envoyé sur le serveur : {detail}",
    "refusal.binary.install":
      "L'agent n'a pas pu être installé sur le serveur : {detail}",
    "refusal.probe.timeout": "La sonde n'a pas répondu en {seconds} s.",
    "refusal.probe.failed": "La sonde n'a pas pu s'exécuter sur le serveur.",
    "refusal.probe.failed.detail":
      "La sonde n'a pas pu s'exécuter sur le serveur : {detail}",
    "refusal.command.timeout":
      "La commande {cmd} n'a pas répondu en {seconds} s.",
    "refusal.platform.silent": "La console n'a pas répondu : {reason}.",
    "refusal.platform.refused": "La console a refusé la demande ({status}).",
    "refusal.release.unpublished":
      "La console n'a pas de binaire téléchargeable pour {version}.",
    "refusal.reach.refused": "Rien n'écoute sur le port {port} de {host}.",
    "refusal.reach.unreachable":
      "{host} n'est pas joignable depuis cet ordinateur.",
    "refusal.reach.timeout": "{host}:{port} n'a pas répondu à temps.",
    "refusal.reach.wrongPort":
      "{host}:{port} répond, mais ce n'est pas un serveur SSH.",
    "refusal.project.unknown":
      "Ce serveur n'a pas déclaré de projet nommé {name}.",
    "refusal.project.action.unknown": "Action inconnue : {action}.",
    "refusal.branch.unknown": "Nom de branche invalide : {branch}.",
    "refusal.secret.unknown": "Clé invalide : {key}.",
    "refusal.secrets.stale": "Ce serveur n'a pas déclaré de clé nommée {key}.",
    "refusal.account.suspended.fix":
      "Régularise l'abonnement dans la console : {console}",
    "refusal.account.stale.fix":
      "Reconnecte cet appareil, ou vérifie l'état du compte : {console}",
    "refusal.account.required.fix":
      "Connecte-toi depuis les réglages, ou ouvre la console : {console}",
    "refusal.binary.write.fix":
      "Vérifie que le compte utilisé peut écrire dans {path}, puis relance l'installation.",
    "refusal.enroll.consumed": "Ce jeton d'enrôlement a déjà servi.",
    "refusal.agent.dropped": "La connexion au serveur s'est interrompue.",
    "refusal.agent.dropped.detail":
      "La connexion au serveur s'est interrompue : {detail}",
    "refusal.agent.dropped.fix":
      "Vérifie que le serveur répond, puis relance la commande.",
    "refusal.command.timeout.fix":
      "Relance la commande, ou ouvre un diagnostic avec doctor.",
    "refusal.platform.silent.local": "La console n'a pas répondu : {reason}.",
    "refusal.platform.silent.local.fix":
      "Aucune console ne répond sur {baseUrl} : lance `bun run dev:web`.",
    "refusal.platform.silent.fix":
      "Vérifie ta connexion. Pupitre reste utilisable sept jours sans la console.",
    "refusal.platform.refused.fix":
      "Reconnecte-toi depuis les réglages, puis réessaie.",
    "refusal.account.signedOut":
      "Aucun compte n'est connecté sur cet appareil.",
    "refusal.account.signedOut.fix":
      "Connecte-toi depuis l'écran de compte, puis réessaie.",
    "refusal.account.stale":
      "La console n'a pas répondu depuis plus de sept jours : le droit d'usage a expiré.",
    "refusal.enrollment.none":
      "La console n'a remis aucun jeton d'enrôlement pour ce serveur.",
    "refusal.binary.mismatch":
      "Le serveur n'a pas la même somme de contrôle que le binaire envoyé.",
    "refusal.setup.host":
      "« {host} » ne ressemble pas à une adresse de serveur.",
    "refusal.setup.host.fix":
      "Une adresse IP ou un nom d'hôte, sans espace ni ponctuation — « 203.0.113.10 » ou « vps.exemple.net ».",
    "refusal.setup.port": "Le port {port} n'existe pas.",
    "refusal.setup.port.fix":
      "Un port entre 1 et 65535 : 22 pour un serveur SSH ordinaire.",
    "refusal.setup.user": "« {user} » n'est pas un nom d'utilisateur.",
    "refusal.setup.user.fix":
      "Le compte à ouvrir sur le serveur : « root » au premier contact, « dev » une fois la machine durcie.",
    "refusal.key.name": "« {serverId} » ne peut pas nommer une clé.",
    "refusal.key.name.fix":
      "Un identifiant de lettres, de chiffres et de tirets : rien qui puisse désigner un autre dossier.",
    "refusal.key.generate": "ssh-keygen n'a pas pu créer la clé.",
    "refusal.key.generate.fix":
      "Installez OpenSSH sur cet ordinateur, ou importez une clé que vous avez déjà.",
    "refusal.key.unreadable": "Cette clé privée n'a pas pu être lue.",
    "refusal.key.unreadable.fix":
      "Une clé protégée par une phrase de passe ne convient pas ici : importez-en une sans phrase de passe, ou laissez l'app en générer une.",
    "refusal.key.missing": "Le fichier {source} est introuvable.",
    "refusal.key.missing.fix":
      "Choisissez le fichier de la clé, celui qui ne porte pas l'extension .pub.",
    "refusal.key.public": "Ce fichier n'est pas une clé privée.",
    "refusal.key.public.fix":
      "Prenez la moitié privée — « id_ed25519 » — et non le « id_ed25519.pub » qui l'accompagne.",
    "refusal.key.system":
      "Cet hôte vient de votre ~/.ssh/config : l'app n'y installe aucune clé.",
    "refusal.key.system.fix":
      "Votre propre configuration dit quelle clé l'ouvre, et l'app ne touche pas à ce fichier.",

    "refusal.keyInstall.denied": "Le serveur a refusé le mot de passe.",
    "refusal.keyInstall.denied.detail":
      "Le serveur a refusé le mot de passe. Il a dit : {detail}",
    "refusal.keyInstall.denied.detail.fix":
      "C'est le mot de passe du compte distant, celui que votre hébergeur vous a donné à la création de la machine.",
    "refusal.keyInstall.denied.fix":
      "C'est le mot de passe du compte distant, celui que votre hébergeur vous a donné à la création de la machine.",
    "refusal.keyInstall.keysOnly":
      "Ce serveur n'accepte que des clés, et aucune de celles que cet ordinateur détient ne l'ouvre.",
    "refusal.keyInstall.keysOnly.detail":
      "Ce serveur n'accepte que des clés, et aucune de celles que cet ordinateur détient ne l'ouvre. Il a dit : {detail}",
    "refusal.keyInstall.keysOnly.detail.fix":
      "Posez vous-même la clé publique ci-dessous, depuis une session qui ouvre déjà la machine, puis revenez.",
    "refusal.keyInstall.keysOnly.fix":
      "Posez vous-même la clé publique ci-dessous, depuis une session qui ouvre déjà la machine, puis revenez.",
    "refusal.keyInstall.hostKey":
      "La machine n'a pas présenté l'empreinte que l'app avait épinglée.",
    "refusal.keyInstall.hostKey.detail":
      "La machine n'a pas présenté l'empreinte que l'app avait épinglée. Elle a dit : {detail}",
    "refusal.keyInstall.hostKey.detail.fix":
      "Réglez cela d'abord : un serveur réinstallé se dit dans la liste, et tout le reste n'est pas cette machine.",
    "refusal.keyInstall.hostKey.fix":
      "Réglez cela d'abord : un serveur réinstallé se dit dans la liste, et tout le reste n'est pas cette machine.",
    "refusal.keyInstall.unreachable":
      "L'adresse n'a pas répondu pendant l'installation de la clé.",
    "refusal.keyInstall.unreachable.detail":
      "L'adresse n'a pas répondu pendant l'installation de la clé. Elle a dit : {detail}",
    "refusal.keyInstall.unreachable.detail.fix":
      "Vérifiez l'adresse et le port, puis réessayez.",
    "refusal.keyInstall.unreachable.fix":
      "Vérifiez l'adresse et le port, puis réessayez.",
    "refusal.keyInstall.failed":
      "L'app n'a pas pu installer la clé toute seule.",
    "refusal.keyInstall.failed.detail":
      "L'app n'a pas pu installer la clé toute seule. ssh a dit : {detail}",
    "refusal.keyInstall.windows":
      "Sous Windows, on ne peut pas donner un mot de passe à ssh sans terminal.",
    "refusal.keyInstall.windows.fix":
      "Collez la ligne ci-dessous dans un terminal : elle demande le mot de passe elle-même.",
    "refusal.release.checksum":
      "Le binaire téléchargé ne correspond pas à la somme annoncée pour {version}.",
    "refusal.release.checksum.fix":
      "Relance l'installation : la console a peut-être servi un fichier tronqué.",
    "refusal.release.unsigned":
      "La console n'a pas signé la version {version} de l'agent.",
    "refusal.release.unsigned.fix":
      "Publie une version signée de l'agent avant de l'installer sur un serveur.",
    "refusal.release.key":
      "Cette app ne porte pas la clé publique qui valide les binaires de l'agent.",
    "refusal.release.key.fix":
      "Reconstruis l'app avec la clé de signature des releases.",
    "refusal.release.signature":
      "La signature de la version {version} de l'agent est invalide.",
    "refusal.release.signature.fix":
      "N'installe pas ce binaire : signale-le, puis réessaie depuis la console.",
    "refusal.fleet.unknown.fix":
      "Recharge les serveurs de ton organisation depuis les réglages.",
    "refusal.fleet.withdrawn": "Ce serveur ne t'est plus attribué.",
    "refusal.fleet.withdrawn.fix":
      "Demande à un administrateur de ton organisation de te l'attribuer à nouveau.",
    "refusal.fleet.pending":
      "La console n'a pas encore posé ta clé sur ce serveur.",
    "refusal.fleet.pending.fix":
      "Laisse la fenêtre ouverte : l'app réessaie toute seule.",
    "refusal.module.none": "Ce module n'a pas de nom.",
    "refusal.module.none.fix": "Choisis un service dans la liste.",
    "refusal.module.notDatabase": "{module} n'est pas une base de données.",
    "refusal.module.notDatabase.fix":
      "Cette action n'existe que pour les modules de la catégorie « bases de données ».",
    "refusal.params.invalid": "Paramètres invalides pour {cmd}.",
    "refusal.bridge.credential":
      "{cmd} répond avec un identifiant et ne passe pas par ce pont.",
    "refusal.bridge.secret":
      "{cmd} porte un secret et ne passe pas par ce pont.",
    "refusal.agent.project": "Un agent s'ouvre sur un projet.",
    "refusal.agent.project.fix": "Ouvre l'agent depuis la page d'un projet.",
    "refusal.channel.closed": "La connexion au serveur a été fermée.",
    "refusal.channel.closed.fix": "Rouvre le serveur, ou relance la commande.",
    "refusal.port.range": "Ce port n'existe pas.",
    "refusal.port.range.fix":
      "Un port va de 1 à 65535 ; celui du service est dans sa fiche.",
    "refusal.terminal.kind": "Genre de terminal inconnu : {kind}.",
    "refusal.terminal.kind.fix":
      "Ouvre un terminal, ou l'onglet d'un agent installé.",
    "refusal.cloudflare.absent": "Aucun compte Cloudflare n'est connecté.",
    "refusal.cloudflare.absent.fix":
      "Connecte ton compte Cloudflare dans les réglages avant d'exposer des projets.",
    "refusal.cloudflare.call": "Cloudflare a refusé : {reason}.",
    "refusal.cloudflare.call.fix":
      "Vérifie que le jeton porte toujours les droits Tunnel et DNS de la zone.",
    "refusal.cloudflare.token.none": "Ce jeton est vide.",
    "refusal.cloudflare.token.none.fix":
      "Colle un jeton de compte avec les droits Cloudflare Tunnel et DNS de la zone.",
    "refusal.cloudflare.account.none": "Ce jeton n'ouvre aucun compte.",
    "refusal.cloudflare.account.none.fix":
      "Crée le jeton sur le compte Cloudflare qui porte ta zone, puis redonne-le.",
    "refusal.cloudflare.zone.unknown":
      "Aucune zone du compte connecté ne porte {domain}.",
    "refusal.cloudflare.zone.unknown.fix":
      "Choisis un domaine sous une des zones du compte, ou ajoute cette zone à Cloudflare.",
    "refusal.cloudflare.zone.none": "Cette zone est incomplète.",
    "refusal.cloudflare.zone.none.fix":
      "Donne le compte, la zone et le domaine sous lequel les projets sont publiés.",
    "refusal.project.name.none": "Ce projet n'a pas de nom.",
    "refusal.project.name.none.fix": "Nomme le projet avant de le publier.",
    "refusal.server.unknown": "Ce serveur n'est plus dans la liste.",
    "refusal.server.unknown.fix": "Choisis un serveur dans les réglages.",
    "refusal.modules.none": "Aucun module à installer.",
    "refusal.modules.none.fix": "Choisis au moins un module dans le catalogue.",
    "refusal.modules.unreadable": "La liste des modules est illisible.",
    "refusal.modules.unreadable.fix":
      "Recharge le catalogue, puis refais ta sélection.",
    "refusal.modules.stale.fix":
      "Recharge la liste des services, puis relance la mise à jour.",
    "refusal.selection.unreadable": "La liste des modules est illisible.",
    "refusal.selection.unreadable.fix":
      "Reviens au catalogue et refais ta sélection.",
    "refusal.repair.failed.fix":
      "Relance la réparation, ou reconnecte cet appareil depuis les réglages.",
    "refusal.command.unknown": "Commande inconnue : {cmd}.",
    "refusal.harden.account.fix":
      "Ouvre les réglages et corrige le compte de ce serveur, puis reconnecte-toi.",
    "refusal.account.none": "Aucun compte n'est connecté sur cet appareil.",
    "refusal.account.none.fix":
      "Connecte-toi depuis l'écran de compte, puis réessaie.",
    "refusal.account.suspended":
      "Le droit d'usage de cette organisation est suspendu.",
    "refusal.account.required":
      "Installer un serveur demande un compte Pupitre.",
    "refusal.signIn.denied": "La demande a été refusée dans le navigateur.",
    "refusal.signIn.denied.fix":
      "Relance la connexion et approuve le code affiché.",
    "refusal.signIn.expired": "Le code affiché a expiré avant d'être approuvé.",
    "refusal.signIn.expired.fix":
      "Relance la connexion pour obtenir un nouveau code.",
    "refusal.device.none":
      "Cet appareil n'est connecté à aucun compte Pupitre.",
    "refusal.device.none.fix":
      "Connecte-toi depuis les réglages, puis relance la réparation.",
    "refusal.device.none.console":
      "Cet appareil n'est connecté à aucun compte Pupitre.",
    "refusal.device.none.console.fix":
      "Connecte-toi depuis les réglages, ou ouvre la console : {console}",
    "refusal.probe.unreachable.fix":
      "Vérifie que le serveur répond en SSH, puis relance l'inspection.",
    "refusal.probe.unreadable": "La sonde n'a pas renvoyé de rapport lisible.",
    "refusal.probe.unreadable.fix":
      "Relance l'inspection ; si le serveur répond avec une bannière, retire-la du profil de connexion.",
    "refusal.probe.slow.fix":
      "Relance l'inspection, ou vérifie la latence de la connexion au serveur.",
    "refusal.binary.missing.fix":
      "Construis l'agent avec bun --cwd=apps/agent run build, puis reconstruis l'app.",
    "refusal.binary.stale.fix":
      "Reconstruis l'app : bun --cwd=apps/desktop run build.",
    "refusal.binary.slow.fix":
      "Vérifie le débit de la connexion au serveur, puis relance l'installation.",
    "refusal.binary.unreachable.fix":
      "Vérifie que le serveur répond en SSH, puis relance l'installation.",
    "refusal.binary.mismatch.fix":
      "Relance l'installation ; si l'écart persiste, vérifie l'espace disque du serveur.",
    "refusal.release.none":
      "Aucune version de l'agent n'est publiée pour cette machine.",
    "refusal.release.none.fix":
      "Publie une version de l'agent depuis la console avant d'installer un serveur.",
    "refusal.binary.missing": "Cette app ne porte pas de binaire d'agent.",
    "refusal.agent.unreachable.fix":
      "Vérifie que le serveur répond, puis relance la commande.",
    "refusal.agent.retry.fix":
      "Relance la commande, ou ouvre un diagnostic avec doctor.",
    "refusal.server.added": "Ce serveur n'a pas pu être ajouté.",
    "refusal.server.added.fix":
      "Réessayez ; si cela recommence, générez la clé plutôt que de l'importer.",
    "refusal.terminal.unknown": "Ce terminal n'a pas d'identifiant.",
    "refusal.terminal.unknown.fix": "Ferme cet onglet et ouvre-en un autre.",
    "refusal.session.expired.fix":
      "Reconnecte-toi depuis les réglages, puis réessaie.",
    "refusal.release.unpublished.fix":
      "Publie une version de l'agent, ou reste sur un build de développement.",
    "refusal.port.invalid": "Le port doit être un nombre entre 1 et 65535.",
    "refusal.port.invalid.fix": "SSH écoute en général sur le port 22.",
    "refusal.reach.refused.fix":
      "Vérifiez que le serveur SSH tourne, et que le port est le bon.",
    "refusal.reach.unreachable.fix":
      "Vérifiez l'adresse, votre connexion, et le pare-feu du serveur.",
    "refusal.reach.timeout.fix":
      "Un pare-feu laisse souvent la connexion s'ouvrir sans jamais répondre.",
    "refusal.reach.wrongPort.fix": "Vérifiez le port : c'est en général 22.",
    "refusal.hostKey.changed":
      "La clé d'hôte de ce serveur a changé depuis le premier contact. La connexion est refusée : cela arrive quand un serveur est réinstallé, et aussi quand quelqu'un répond à sa place.",
    "refusal.hostKey.changed.fix":
      "Si vous venez de réinstaller ce serveur, remplacez l'empreinte épinglée. Sinon, ne vous connectez pas : vérifiez la machine avant tout.",
    "refusal.project.unreadable": "La description du projet est incomplète.",
    "refusal.project.unreadable.fix": "Reprends le formulaire.",
    "refusal.project.unknown.fix":
      "Recharge la liste des projets, puis reprends.",
    "refusal.project.action.unknown.fix":
      "Choisis démarrer, arrêter ou redémarrer.",
    "refusal.file.none": "Aucun fichier n'a été désigné.",
    "refusal.file.none.fix": "Choisis un fichier de l'arbre de travail.",
    "refusal.branch.unknown.fix":
      "Choisis une branche dans la liste que le serveur a donnée.",
    "refusal.secret.unknown.fix":
      "Choisis une clé de la liste que le serveur a donnée.",
    "refusal.secret.value.invalid":
      "La valeur est vide ou tient sur plusieurs lignes.",
    "refusal.secret.value.invalid.fix": "Donne une valeur sur une seule ligne.",
    "refusal.secrets.stale.fix":
      "Recharge la liste des secrets, puis reprends.",
    "refusal.secret.screen.fix":
      "Utilise l'écran Services, qui garde la valeur dans le processus principal.",
    "refusal.install.screen.fix":
      "Utilise l'écran d'installation, qui envoie le secret depuis le processus principal.",
  },
} as const;
