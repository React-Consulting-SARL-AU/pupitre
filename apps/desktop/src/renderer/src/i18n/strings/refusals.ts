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
      "This server does not offer the service {module}.",
    "refusal.harden.account":
      "The server is secured, but the app could not reconnect with the account {user}.",
    "refusal.binary.arch":
      "This app carries no agent for the {arch} architecture.",
    "refusal.binary.checksum":
      "The agent embedded in the app ({file}) is damaged.",
    "refusal.binary.timeout":
      "The agent did not finish reaching the server within {seconds} s.",
    "refusal.binary.send":
      "The agent could not be sent to the server: {detail}",
    "refusal.binary.install":
      "The agent could not be installed on the server: {detail}",
    "refusal.probe.timeout":
      "The server did not answer the inspection within {seconds} s.",
    "refusal.probe.failed": "The inspection could not run on the server.",
    "refusal.probe.failed.detail":
      "The inspection could not run on the server: {detail}",
    "refusal.command.timeout":
      "The server did not answer within {seconds} s ({cmd}).",
    "refusal.platform.silent": "The console did not answer: {reason}.",
    "refusal.platform.refused": "The console refused the request ({status}).",
    "refusal.release.unpublished":
      "The console has no downloadable agent for {version}.",
    "refusal.release.storage":
      "The release storage refused pupitred {version} ({status} {detail}).",
    "refusal.reach.refused": "Nothing listens on port {port} of {host}.",
    "refusal.reach.unreachable": "{host} is not reachable from this computer.",
    "refusal.reach.timeout": "{host}:{port} did not answer in time.",
    "refusal.reach.wrongPort":
      "{host}:{port} answers, but it is not an SSH access.",
    "refusal.project.unknown":
      "This server has declared no project named {name}.",
    "refusal.project.action.unknown": "Unknown action: {action}.",
    "refusal.project.process.unknown": "Invalid process id: {process}.",
    "refusal.branch.unknown": "Invalid branch name: {branch}.",
    "refusal.secret.unknown": "Invalid key: {key}.",
    "refusal.secrets.stale": "This server has declared no key named {key}.",
    "refusal.account.suspended.fix":
      "Settle the subscription in the console: {console}",
    "refusal.account.unsubscribed.fix":
      "Choose a plan in the console: {console}",
    "refusal.account.stale.fix":
      "Reconnect this computer, or check the account's state: {console}",
    "refusal.account.required.fix":
      "Sign in from the settings, or open the console: {console}",
    "refusal.agent.dropped": "The connection to the server was interrupted.",
    "refusal.agent.dropped.detail":
      "The connection to the server was interrupted: {detail}",
    "refusal.agent.dropped.fix":
      "Check that the server answers, then run the command again.",
    "refusal.command.timeout.fix": "Run the command again, or run a diagnosis.",
    "refusal.platform.silent.local": "The console did not answer: {reason}.",
    "refusal.platform.silent.local.fix":
      "No console answers on {baseUrl}: run `bun run dev:web`.",
    "refusal.platform.silent.fix":
      "Check your connection. Pupitre stays usable for seven days offline.",
    "refusal.platform.refused.fix":
      "Sign in again from the settings, then try again.",
    "refusal.account.signedOut": "No account is signed in on this computer.",
    "refusal.account.signedOut.fix":
      "Sign in from the account screen, then try again.",
    "refusal.account.stale":
      "The console has not answered for more than seven days: the subscription has to be checked again.",
    "refusal.enrollment.none": "The console handed no token for this server.",
    "refusal.binary.mismatch":
      "The agent the server received does not match the one sent.",
    "refusal.setup.host": "« {host} » does not look like a server address.",
    "refusal.setup.host.fix":
      "An IP address or a host name, with no space and no punctuation — « 203.0.113.10 » or « vps.example.net ».",
    "refusal.setup.port": "Port {port} does not exist.",
    "refusal.setup.port.fix":
      "A port between 1 and 65535: 22 for an ordinary SSH server.",
    "refusal.setup.user": "« {user} » is not a user name.",
    "refusal.setup.user.fix":
      "The account to open on the server: « root » at first contact, « dev » once the machine is hardened.",
    "refusal.setup.sshName": "Nothing of « {name} » fits an SSH name.",
    "refusal.setup.sshName.fix":
      "Letters, digits and dashes — « atelier » or « vps-2 » — and not « pupitre- », which the app keeps for itself.",
    "refusal.setup.sshNameTaken": "« {name} » already names another machine.",
    "refusal.setup.sshNameTaken.fix":
      "Another server here, or a host of your ~/.ssh/config, answers to it: choose another word.",
    "refusal.setup.system":
      "This server is a host of your own SSH configuration.",
    "refusal.setup.system.fix":
      "Change its address in ~/.ssh/config: the app writes nothing there.",
    "refusal.setup.password": "{user}@{host} refused that password.",
    "refusal.setup.password.fix":
      "Nothing was created. It is the password of the remote account, the one your host gave you: type it again.",
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
      "Try again later; if it lasts, contact support.",
    "refusal.release.unsigned.fix.dev":
      "Publish a signed agent version before installing it on a server.",
    "refusal.release.key":
      "This app carries no public key to validate the agent's binaries.",
    "refusal.release.key.fix":
      "Reinstall the app from pupitre.studio; if it lasts, contact support.",
    "refusal.release.key.fix.dev":
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
    "refusal.module.none": "This service has no name.",
    "refusal.module.none.fix": "Pick a service in the list.",
    "refusal.module.notDatabase": "{module} is not a database.",
    "refusal.module.notDatabase.fix": "This action exists for databases only.",
    "refusal.database.name": "{name} cannot name a database.",
    "refusal.database.name.fix":
      "Letters, digits, dashes and underscores only, up to 64 characters.",
    "refusal.database.command":
      "The server answered with a command the app refuses to run.",
    "refusal.database.command.fix":
      "Open a terminal on the server and run the shell of the database yourself.",
    "refusal.params.invalid": "Invalid parameters for {cmd}.",
    "refusal.bridge.credential": "{cmd} cannot be called from here.",
    "refusal.bridge.secret": "{cmd} cannot be called from here.",
    "refusal.agent.project": "An agent opens on a project.",
    "refusal.agent.project.fix": "Open the agent from a project's page.",
    "refusal.channel.closed": "The connection to the server was closed.",
    "refusal.channel.closed.fix":
      "Open the server again, or run the command once more.",
    "refusal.sudo.absent":
      "This computer does not hold the sudo password of dev for this server.",
    "refusal.sudo.absent.fix":
      "Enter it in Settings › Servers: the app of a computer that keeps it shows it there. Lost everywhere: set a new one from the hosting console with passwd dev, then enter it.",
    "refusal.sudo.refused":
      "sudo refused the sudo password of dev this computer holds.",
    "refusal.sudo.refused.fix":
      "Enter the current one in Settings › Servers: the app of a computer that keeps it shows it there, or set a new one from the hosting console with passwd dev.",
    "refusal.sudo.open":
      "This server does not ask dev for a sudo password yet.",
    "refusal.sudo.open.fix":
      "Run the securing again: it gives dev a sudo password, kept on this computer.",
    "refusal.sudo.empty": "The sudo password of dev is empty.",
    "refusal.port.range": "This port does not exist.",
    "refusal.port.range.fix":
      "A port runs from 1 to 65535; the service's own is on its card.",
    "refusal.terminal.kind": "Unknown terminal kind: {kind}.",
    "refusal.terminal.kind.fix":
      "Open a terminal, or the tab of an installed agent.",
    "refusal.terminal.session":
      "This session name is not one of ours: {session}.",
    "refusal.terminal.session.fix":
      "Close this tab and open another one: the new session will be named by the app.",
    "refusal.terminal.folder": "This folder cannot open a terminal: {dir}.",
    "refusal.terminal.folder.fix":
      "Open the terminal from a folder of the project, or of the server's files.",
    "refusal.connection.absent": "No {kind} account is connected.",
    "refusal.connection.absent.fix":
      "Connect the account in the settings: a service that needs it cannot be installed without it.",
    "refusal.connection.call": "{kind} refused: {reason}.",
    "refusal.connection.revoked":
      "{kind} no longer answers to this token: {reason}.",
    "refusal.connection.revoked.fix":
      "Create a new token on the provider and connect it again here; every server that uses it takes the new one at its next install.",
    "refusal.connection.call.fix":
      "Check that the token is still valid and still carries the rights the service asks for.",
    "refusal.connection.cloudflare.unlisted":
      "Cloudflare accepts this token but names no account for it.",
    "refusal.connection.cloudflare.unlisted.fix":
      "Add the permission Account · Account Settings · Read to the token: it is what lets Pupitre read which account the token opens. Keep the others.",
    "refusal.connection.account.gone":
      "This token no longer opens the account {account}.",
    "refusal.connection.account.gone.fix":
      "Disconnect this account and connect the token again: you will pick among the accounts it opens today.",
    "refusal.connection.token.none": "This token is empty.",
    "refusal.connection.token.none.fix":
      "Paste the token of the account, with the rights the service asks for.",
    "refusal.connection.kind": "Unknown account: {kind}.",
    "refusal.connection.kind.fix":
      "Connect one of the accounts the settings list.",
    "refusal.cloudflare.zone.unknown":
      "No zone of the connected account carries {domain}.",
    "refusal.cloudflare.zone.unknown.fix":
      "Pick a domain under one of the account's zones, or add that zone to Cloudflare.",
    "refusal.cloudflare.record.taken":
      "{hostname} is already held by a DNS record Pupitre did not write.",
    "refusal.cloudflare.record.taken.fix":
      "Give the port another subdomain, or remove that record from the Cloudflare dashboard if it is yours to remove.",
    "refusal.cloudflare.exposure.unread":
      "This server did not say which tunnel it runs: {reason}.",
    "refusal.cloudflare.exposure.unread.fix":
      "The tunnel was left as it is, because making another one takes down the one running. Wait for the server to answer, then install again.",
    "refusal.server.unknown": "This server is no longer in the list.",
    "refusal.server.unknown.fix": "Pick a server in the settings.",
    "refusal.modules.none": "No service to install.",
    "refusal.modules.none.fix": "Pick at least one service.",
    "refusal.modules.unreadable": "The list of services cannot be read.",
    "refusal.modules.unreadable.fix":
      "Reload the list of services, then make your selection again.",
    "refusal.selection.unreadable": "The list of services cannot be read.",
    "refusal.selection.unreadable.fix":
      "Go back to the services and make your selection again.",
    "refusal.command.unknown": "Unknown command: {cmd}.",
    "refusal.harden.account.fix":
      "Open the settings, fix this server's account, then sign in again.",
    "refusal.account.suspended":
      "This organization's subscription is suspended.",
    "refusal.account.unsubscribed": "This organization has no subscription.",
    "refusal.account.required":
      "Installing a server asks for a Pupitre account.",
    "refusal.signIn.denied": "The request was denied in the browser.",
    "refusal.signIn.denied.fix":
      "Start signing in again and approve the code shown.",
    "refusal.signIn.cancelled": "Signing in was cancelled.",
    "refusal.signIn.expired": "The code shown expired before it was approved.",
    "refusal.signIn.expired.fix": "Start signing in again for a fresh code.",
    "refusal.device.none": "This computer is signed in to no Pupitre account.",
    "refusal.device.none.fix":
      "Sign in from the settings, then run the repair again.",
    "refusal.device.none.console":
      "This computer is signed in to no Pupitre account.",
    "refusal.device.none.console.fix":
      "Sign in from the settings, or open the console: {console}",
    "refusal.device.self": "This computer cannot revoke itself.",
    "refusal.device.self.fix":
      "Sign out instead: the servers close for this computer, and the terminals with them.",
    "refusal.device.unknown": "No device was named.",
    "refusal.device.unknown.fix": "Pick a device in the list.",
    "refusal.probe.unreadable":
      "The server sent back no readable inspection report.",
    "refusal.probe.unreadable.fix":
      "Run the inspection again; if the server prints a welcome message on connection, remove it.",
    "refusal.binary.missing.fix":
      "Build the agent with bun --cwd=apps/agent run build, then build the app again.",
    "refusal.binary.mismatch.fix":
      "Run the installation again; if the gap stays, check the server's disk space.",
    "refusal.release.none":
      "No agent version is available for this machine yet.",
    "refusal.release.none.fix":
      "Try again later; if it lasts, contact support.",
    "refusal.release.none.fix.dev":
      "Publish an agent version from the console before installing a server.",
    "refusal.binary.missing": "This app carries no agent binary.",
    "refusal.server.added": "This server could not be added.",
    "refusal.server.added.fix":
      "Try again; if it happens once more, generate the key rather than importing it.",
    "refusal.terminal.unknown": "This terminal has no identifier.",
    "refusal.terminal.unknown.fix": "Close this tab and open another one.",
    "refusal.release.unpublished.fix":
      "Try again later; if it lasts, contact support.",
    "refusal.release.unpublished.fix.dev":
      "Publish an agent version, or stay on a development build.",
    "refusal.release.storage.fix":
      "Nothing is wrong on your server: the platform signs the download address with its storage credentials. Try again later; if it lasts, tell Pupitre.",
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
    "refusal.project.process.unknown.fix":
      "Pick a process from the list the server gave.",
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
    "refusal.channel.unopened": "The connection to the server is not open.",
    "refusal.channel.unopened.fix":
      "Run the command again: the app reopens the connection on its own.",
    "refusal.channel.flooded":
      "The server sent more than {limit} MiB without a line break: the connection was closed.",
    "refusal.channel.flooded.fix":
      "Check that pupitred is what answers on this server, then run the command again.",
    "refusal.command.cancelled": "{cmd} was stopped from here.",
    "refusal.capability.missing":
      "The agent {agent} on this server does not know the command {cmd}.",
    "refusal.capability.missing.fix":
      "Update the agent from the server's page: this app drives agents from {floor} up.",
    "refusal.bridge.failed": "The app's main process did not answer {channel}.",
    "refusal.bridge.failed.fix":
      "Quit and reopen the app: its window is newer than the process behind it.",
    "refusal.bridge.command": "{cmd} cannot be called from here.",
    "refusal.bridge.command.fix":
      "This command has a screen of its own, or none: nothing sends it from here.",
    "refusal.forward.port.none": "No local port could be reserved.",
    "refusal.forward.port.none.fix":
      "Close a few connections on this computer, then try again.",
    "refusal.platform.unreachable": "The console did not answer.",
    "refusal.platform.unreachable.fix":
      "Check your connection. Pupitre stays usable for seven days offline.",
    "refusal.platform.unreachable.local": "The console did not answer.",
    "refusal.platform.unreachable.local.fix":
      "No console answers on {baseUrl}: run `bun run dev:web`.",
    "refusal.agentUpdate.binary":
      "This app carries no agent for the {arch} architecture, and the console publishes none for this server.",
    "refusal.agentUpdate.binary.fix":
      "Try again later; if it lasts, contact support.",
    "refusal.agentUpdate.binary.fix.dev":
      "Build the agent with bun --cwd=apps/agent run build, then rebuild the app.",
    "refusal.agentUpdate.signature":
      "This app carries no signature for the agent {version} on {arch}, and this server no longer reaches the console that serves it.",
    "refusal.agentUpdate.signature.fix":
      "Check that this server reaches the internet, then try again; if it lasts, contact support.",
    "refusal.agentUpdate.signature.fix.dev":
      "Publish this version with bun --cwd=apps/agent run release, then rebuild the app.",
    "refusal.tunnel.route.foreign":
      "{hostname} is not under {domain}, the domain this server publishes.",
    "refusal.tunnel.route.foreign.fix":
      "A route lives under the server's domain: give the project a subdomain of {domain}.",
  },
  fr: {
    "refusal.project.command.unknown": "Commande de projet inconnue : {cmd}.",
    "refusal.module.undeclared":
      "Ce serveur ne propose pas le service {module}.",
    "refusal.harden.account":
      "Le serveur est sécurisé, mais l'app n'a pas pu se reconnecter avec le compte {user}.",
    "refusal.binary.arch":
      "Cette app ne porte pas d'agent pour l'architecture {arch}.",
    "refusal.binary.checksum":
      "L'agent embarqué dans l'app ({file}) est abîmé.",
    "refusal.binary.timeout":
      "L'agent n'a pas fini d'arriver sur le serveur en {seconds} s.",
    "refusal.binary.send":
      "L'agent n'a pas pu être envoyé sur le serveur : {detail}",
    "refusal.binary.install":
      "L'agent n'a pas pu être installé sur le serveur : {detail}",
    "refusal.probe.timeout":
      "Le serveur n'a pas répondu à l'inspection en {seconds} s.",
    "refusal.probe.failed": "L'inspection n'a pas pu se faire sur le serveur.",
    "refusal.probe.failed.detail":
      "L'inspection n'a pas pu se faire sur le serveur : {detail}",
    "refusal.command.timeout":
      "Le serveur n'a pas répondu en {seconds} s ({cmd}).",
    "refusal.platform.silent": "La console n'a pas répondu : {reason}.",
    "refusal.platform.refused": "La console a refusé la demande ({status}).",
    "refusal.release.unpublished":
      "La console n'a pas d'agent téléchargeable pour {version}.",
    "refusal.release.storage":
      "Le stockage des versions a refusé pupitred {version} ({status} {detail}).",
    "refusal.reach.refused": "Rien n'écoute sur le port {port} de {host}.",
    "refusal.reach.unreachable":
      "{host} n'est pas joignable depuis cet ordinateur.",
    "refusal.reach.timeout": "{host}:{port} n'a pas répondu à temps.",
    "refusal.reach.wrongPort":
      "{host}:{port} répond, mais ce n'est pas un accès SSH.",
    "refusal.project.unknown":
      "Ce serveur n'a pas déclaré de projet nommé {name}.",
    "refusal.project.action.unknown": "Action inconnue : {action}.",
    "refusal.project.process.unknown":
      "Identifiant de processus invalide : {process}.",
    "refusal.branch.unknown": "Nom de branche invalide : {branch}.",
    "refusal.secret.unknown": "Clé invalide : {key}.",
    "refusal.secrets.stale": "Ce serveur n'a pas déclaré de clé nommée {key}.",
    "refusal.account.suspended.fix":
      "Régularisez l'abonnement dans la console : {console}",
    "refusal.account.unsubscribed.fix":
      "Choisissez une offre dans la console : {console}",
    "refusal.account.stale.fix":
      "Reconnectez cet appareil, ou vérifiez l'état du compte : {console}",
    "refusal.account.required.fix":
      "Connectez-vous depuis les réglages, ou ouvrez la console : {console}",
    "refusal.agent.dropped": "La connexion au serveur s'est interrompue.",
    "refusal.agent.dropped.detail":
      "La connexion au serveur s'est interrompue : {detail}",
    "refusal.agent.dropped.fix":
      "Vérifiez que le serveur répond, puis relancez la commande.",
    "refusal.command.timeout.fix":
      "Relancez la commande, ou lancez un diagnostic.",
    "refusal.platform.silent.local": "La console n'a pas répondu : {reason}.",
    "refusal.platform.silent.local.fix":
      "Aucune console ne répond sur {baseUrl} : lancez `bun run dev:web`.",
    "refusal.platform.silent.fix":
      "Vérifiez votre connexion. Pupitre reste utilisable sept jours sans connexion.",
    "refusal.platform.refused.fix":
      "Reconnectez-vous depuis les réglages, puis réessayez.",
    "refusal.account.signedOut":
      "Aucun compte n'est connecté sur cet appareil.",
    "refusal.account.signedOut.fix":
      "Connectez-vous depuis l'écran de compte, puis réessayez.",
    "refusal.account.stale":
      "La console n'a pas répondu depuis plus de sept jours : l'abonnement doit être vérifié à nouveau.",
    "refusal.enrollment.none":
      "La console n'a remis aucun token pour ce serveur.",
    "refusal.binary.mismatch":
      "L'agent reçu par le serveur ne correspond pas à celui envoyé.",
    "refusal.setup.host":
      "« {host} » ne ressemble pas à une adresse de serveur.",
    "refusal.setup.host.fix":
      "Une adresse IP ou un nom d'hôte, sans espace ni ponctuation — « 203.0.113.10 » ou « vps.exemple.net ».",
    "refusal.setup.port": "Le port {port} n'existe pas.",
    "refusal.setup.port.fix":
      "Un port entre 1 et 65535 : 22 pour un serveur SSH ordinaire.",
    "refusal.setup.user": "« {user} » n'est pas un nom d'utilisateur.",
    "refusal.setup.user.fix":
      "Le compte à ouvrir sur le serveur : « root » au premier contact, « dev » une fois la machine sécurisée.",
    "refusal.setup.sshName": "Rien de « {name} » ne tient dans un nom SSH.",
    "refusal.setup.sshName.fix":
      "Des lettres, des chiffres et des tirets — « atelier » ou « vps-2 » — et pas « pupitre- », que l'app garde pour elle.",
    "refusal.setup.sshNameTaken": "« {name} » désigne déjà une autre machine.",
    "refusal.setup.sshNameTaken.fix":
      "Un autre serveur ici, ou un hôte de votre ~/.ssh/config, y répond : choisissez un autre mot.",
    "refusal.setup.system":
      "Ce serveur est un hôte de votre propre configuration SSH.",
    "refusal.setup.system.fix":
      "Changez son adresse dans ~/.ssh/config : l'app n'y écrit rien.",
    "refusal.setup.password": "{user}@{host} a refusé ce mot de passe.",
    "refusal.setup.password.fix":
      "Rien n'a été créé. C'est le mot de passe du compte distant, celui que votre hébergeur vous a donné : retapez-le.",
    "refusal.key.name": "« {serverId} » ne peut pas nommer une clé.",
    "refusal.key.name.fix":
      "Un identifiant de lettres, de chiffres et de tirets : rien qui puisse désigner un autre dossier.",
    "refusal.key.generate": "ssh-keygen n'a pas pu créer la clé.",
    "refusal.key.generate.fix":
      "Installez OpenSSH sur cet ordinateur, ou importez une clé que vous avez déjà.",
    "refusal.key.unreadable": "Cette clé privée n'a pas pu être lue.",
    "refusal.key.unreadable.fix":
      "Une clé protégée par une passphrase ne convient pas ici : importez-en une sans passphrase, ou laissez l'app en générer une.",
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
      "Le binaire téléchargé ne correspond pas au checksum annoncé pour {version}.",
    "refusal.release.checksum.fix":
      "Relancez l'installation : la console a peut-être servi un fichier tronqué.",
    "refusal.release.unsigned":
      "La console n'a pas signé la version {version} de l'agent.",
    "refusal.release.unsigned.fix":
      "Réessayez plus tard ; si ça dure, contactez le support.",
    "refusal.release.unsigned.fix.dev":
      "Publiez une version signée de l'agent avant de l'installer sur un serveur.",
    "refusal.release.key":
      "Cette app ne porte pas la clé publique qui valide les binaires de l'agent.",
    "refusal.release.key.fix":
      "Réinstallez l'app depuis pupitre.studio ; si ça dure, contactez le support.",
    "refusal.release.key.fix.dev":
      "Reconstruisez l'app avec la clé de signature des releases.",
    "refusal.release.signature":
      "La signature de la version {version} de l'agent est invalide.",
    "refusal.release.signature.fix":
      "N'installez pas ce binaire : signalez-le, puis réessayez depuis la console.",
    "refusal.fleet.unknown.fix":
      "Rechargez les serveurs de votre organisation depuis les réglages.",
    "refusal.fleet.withdrawn": "Ce serveur ne vous est plus attribué.",
    "refusal.fleet.withdrawn.fix":
      "Demandez à un administrateur de votre organisation de vous l'attribuer à nouveau.",
    "refusal.fleet.pending":
      "La console n'a pas encore posé votre clé sur ce serveur.",
    "refusal.fleet.pending.fix":
      "Laissez la fenêtre ouverte : l'app réessaie toute seule.",
    "refusal.module.none": "Ce service n'a pas de nom.",
    "refusal.module.none.fix": "Choisissez un service dans la liste.",
    "refusal.module.notDatabase": "{module} n'est pas une base de données.",
    "refusal.module.notDatabase.fix":
      "Cette action n'existe que pour les bases de données.",
    "refusal.database.name": "{name} ne peut pas nommer une base de données.",
    "refusal.database.name.fix":
      "Lettres, chiffres, tirets et tirets bas seulement, 64 caractères au plus.",
    "refusal.database.command":
      "Le serveur a répondu une commande que l'app refuse de lancer.",
    "refusal.database.command.fix":
      "Ouvrez un terminal sur le serveur et lancez vous-même le shell de la base.",
    "refusal.params.invalid": "Paramètres invalides pour {cmd}.",
    "refusal.bridge.credential": "{cmd} ne peut pas être appelé d'ici.",
    "refusal.bridge.secret": "{cmd} ne peut pas être appelé d'ici.",
    "refusal.agent.project": "Un agent s'ouvre sur un projet.",
    "refusal.agent.project.fix": "Ouvrez l'agent depuis la page d'un projet.",
    "refusal.channel.closed": "La connexion au serveur a été fermée.",
    "refusal.channel.closed.fix":
      "Rouvrez le serveur, ou relancez la commande.",
    "refusal.sudo.absent":
      "Cet ordinateur ne tient pas le mot de passe sudo de dev pour ce serveur.",
    "refusal.sudo.absent.fix":
      "Saisissez-le dans Réglages › Serveurs : l'app d'un ordinateur qui le garde l'y montre. Perdu partout : posez-en un nouveau depuis la console de l'hébergeur avec passwd dev, puis saisissez-le.",
    "refusal.sudo.refused":
      "sudo a refusé le mot de passe sudo de dev que cet ordinateur tient.",
    "refusal.sudo.refused.fix":
      "Saisissez l'actuel dans Réglages › Serveurs : l'app d'un ordinateur qui le garde l'y montre, ou posez-en un nouveau depuis la console de l'hébergeur avec passwd dev.",
    "refusal.sudo.open":
      "Ce serveur ne demande pas encore de mot de passe sudo à dev.",
    "refusal.sudo.open.fix":
      "Relancez la sécurisation : elle donne à dev un mot de passe sudo, gardé sur cet ordinateur.",
    "refusal.sudo.empty": "Le mot de passe sudo de dev est vide.",
    "refusal.port.range": "Ce port n'existe pas.",
    "refusal.port.range.fix":
      "Un port va de 1 à 65535 ; celui du service est dans sa fiche.",
    "refusal.terminal.kind": "Genre de terminal inconnu : {kind}.",
    "refusal.terminal.kind.fix":
      "Ouvrez un terminal, ou l'onglet d'un agent installé.",
    "refusal.terminal.session":
      "Ce nom de session n'est pas des nôtres : {session}.",
    "refusal.terminal.session.fix":
      "Fermez cet onglet et ouvrez-en un autre : l'app nommera la nouvelle session.",
    "refusal.terminal.folder":
      "Ce dossier ne peut pas ouvrir un terminal : {dir}.",
    "refusal.terminal.folder.fix":
      "Ouvrez le terminal depuis un dossier du projet, ou des fichiers du serveur.",
    "refusal.connection.absent": "Aucun compte {kind} n'est connecté.",
    "refusal.connection.absent.fix":
      "Connectez le compte dans les réglages : un service qui en a besoin ne s'installe pas sans lui.",
    "refusal.connection.call": "{kind} a refusé : {reason}.",
    "refusal.connection.revoked":
      "{kind} ne répond plus à ce token : {reason}.",
    "refusal.connection.revoked.fix":
      "Créez un nouveau token chez le fournisseur et reconnectez-le ici ; chaque serveur qui l'utilise prend le nouveau à sa prochaine installation.",
    "refusal.connection.call.fix":
      "Vérifiez que le token est toujours valide et porte toujours les droits que le service demande.",
    "refusal.connection.cloudflare.unlisted":
      "Cloudflare accepte ce token mais ne lui nomme aucun compte.",
    "refusal.connection.cloudflare.unlisted.fix":
      "Ajoutez au token la permission Account · Account Settings · Read : c'est elle qui laisse Pupitre lire quel compte le token ouvre. Gardez les autres.",
    "refusal.connection.account.gone":
      "Ce token n'ouvre plus le compte {account}.",
    "refusal.connection.account.gone.fix":
      "Déconnectez ce compte et reconnectez le token : vous choisirez parmi les comptes qu'il ouvre aujourd'hui.",
    "refusal.connection.token.none": "Ce token est vide.",
    "refusal.connection.token.none.fix":
      "Collez le token du compte, avec les droits que le service demande.",
    "refusal.connection.kind": "Compte inconnu : {kind}.",
    "refusal.connection.kind.fix":
      "Connectez l'un des comptes que les réglages listent.",
    "refusal.cloudflare.zone.unknown":
      "Aucune zone du compte connecté ne porte {domain}.",
    "refusal.cloudflare.zone.unknown.fix":
      "Choisissez un domaine sous une des zones du compte, ou ajoutez cette zone à Cloudflare.",
    "refusal.cloudflare.record.taken":
      "{hostname} est déjà tenu par un enregistrement DNS que Pupitre n'a pas écrit.",
    "refusal.cloudflare.record.taken.fix":
      "Donnez un autre sous-domaine au port, ou retirez cet enregistrement du tableau de bord Cloudflare s'il vous appartient.",
    "refusal.cloudflare.exposure.unread":
      "Ce serveur n'a pas dit quel tunnel il fait tourner : {reason}.",
    "refusal.cloudflare.exposure.unread.fix":
      "Le tunnel a été laissé tel quel, car en créer un autre coupe celui qui tourne. Attendez que le serveur réponde, puis relancez l'installation.",
    "refusal.server.unknown": "Ce serveur n'est plus dans la liste.",
    "refusal.server.unknown.fix": "Choisissez un serveur dans les réglages.",
    "refusal.modules.none": "Aucun service à installer.",
    "refusal.modules.none.fix": "Choisissez au moins un service.",
    "refusal.modules.unreadable": "La liste des services est illisible.",
    "refusal.modules.unreadable.fix":
      "Rechargez la liste des services, puis refaites votre sélection.",
    "refusal.selection.unreadable": "La liste des services est illisible.",
    "refusal.selection.unreadable.fix":
      "Revenez aux services et refaites votre sélection.",
    "refusal.command.unknown": "Commande inconnue : {cmd}.",
    "refusal.harden.account.fix":
      "Ouvrez les réglages et corrigez le compte de ce serveur, puis reconnectez-vous.",
    "refusal.account.suspended":
      "L'abonnement de cette organisation est suspendu.",
    "refusal.account.unsubscribed": "Cette organisation n'a pas d'abonnement.",
    "refusal.account.required":
      "Installer un serveur demande un compte Pupitre.",
    "refusal.signIn.denied": "La demande a été refusée dans le navigateur.",
    "refusal.signIn.denied.fix":
      "Relancez la connexion et approuvez le code affiché.",
    "refusal.signIn.cancelled": "La connexion a été annulée.",
    "refusal.signIn.expired": "Le code affiché a expiré avant d'être approuvé.",
    "refusal.signIn.expired.fix":
      "Relancez la connexion pour obtenir un nouveau code.",
    "refusal.device.none":
      "Cet appareil n'est connecté à aucun compte Pupitre.",
    "refusal.device.none.fix":
      "Connectez-vous depuis les réglages, puis relancez la réparation.",
    "refusal.device.none.console":
      "Cet appareil n'est connecté à aucun compte Pupitre.",
    "refusal.device.none.console.fix":
      "Connectez-vous depuis les réglages, ou ouvrez la console : {console}",
    "refusal.device.self": "Cet ordinateur ne peut pas se révoquer lui-même.",
    "refusal.device.self.fix":
      "Déconnectez-vous plutôt : les serveurs se ferment pour cet ordinateur, et les terminaux avec eux.",
    "refusal.device.unknown": "Aucun appareil n'a été nommé.",
    "refusal.device.unknown.fix": "Choisissez un appareil dans la liste.",
    "refusal.probe.unreadable":
      "Le serveur n'a pas renvoyé de rapport d'inspection lisible.",
    "refusal.probe.unreadable.fix":
      "Relancez l'inspection ; si le serveur affiche un message d'accueil à la connexion, retirez-le.",
    "refusal.binary.missing.fix":
      "Construisez l'agent avec bun --cwd=apps/agent run build, puis reconstruisez l'app.",
    "refusal.binary.mismatch.fix":
      "Relancez l'installation ; si l'écart persiste, vérifiez l'espace disque du serveur.",
    "refusal.release.none":
      "Aucune version de l'agent n'est encore disponible pour cette machine.",
    "refusal.release.none.fix":
      "Réessayez plus tard ; si ça dure, contactez le support.",
    "refusal.release.none.fix.dev":
      "Publiez une version de l'agent depuis la console avant d'installer un serveur.",
    "refusal.binary.missing": "Cette app ne porte pas de binaire d'agent.",
    "refusal.server.added": "Ce serveur n'a pas pu être ajouté.",
    "refusal.server.added.fix":
      "Réessayez ; si cela recommence, générez la clé plutôt que de l'importer.",
    "refusal.terminal.unknown": "Ce terminal n'a pas d'identifiant.",
    "refusal.terminal.unknown.fix": "Fermez cet onglet et ouvrez-en un autre.",
    "refusal.release.unpublished.fix":
      "Réessayez plus tard ; si ça dure, contactez le support.",
    "refusal.release.unpublished.fix.dev":
      "Publiez une version de l'agent, ou restez sur un build de développement.",
    "refusal.release.storage.fix":
      "Rien n'est en cause sur votre serveur : la plateforme signe l'adresse de téléchargement avec ses accès au stockage. Réessayez plus tard ; si ça dure, prévenez Pupitre.",
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
    "refusal.project.unreadable.fix": "Reprenez le formulaire.",
    "refusal.project.unknown.fix":
      "Rechargez la liste des projets, puis reprenez.",
    "refusal.project.action.unknown.fix":
      "Choisissez démarrer, arrêter ou redémarrer.",
    "refusal.project.process.unknown.fix":
      "Choisissez un processus de la liste que le serveur a donnée.",
    "refusal.file.none": "Aucun fichier n'a été désigné.",
    "refusal.file.none.fix": "Choisissez un fichier de l'arbre de travail.",
    "refusal.branch.unknown.fix":
      "Choisissez une branche dans la liste que le serveur a donnée.",
    "refusal.secret.unknown.fix":
      "Choisissez une clé de la liste que le serveur a donnée.",
    "refusal.secret.value.invalid":
      "La valeur est vide ou tient sur plusieurs lignes.",
    "refusal.secret.value.invalid.fix":
      "Donnez une valeur sur une seule ligne.",
    "refusal.secrets.stale.fix":
      "Rechargez la liste des secrets, puis reprenez.",
    "refusal.channel.unopened": "La connexion au serveur n'est pas ouverte.",
    "refusal.channel.unopened.fix":
      "Relancez la commande : l'app rouvre la connexion toute seule.",
    "refusal.channel.flooded":
      "Le serveur a envoyé plus de {limit} Mio sans retour à la ligne : la connexion a été fermée.",
    "refusal.channel.flooded.fix":
      "Vérifiez que c'est bien pupitred qui répond sur ce serveur, puis relancez la commande.",
    "refusal.command.cancelled": "{cmd} a été arrêté d'ici.",
    "refusal.capability.missing":
      "L'agent {agent} de ce serveur ne connaît pas la commande {cmd}.",
    "refusal.capability.missing.fix":
      "Mettez l'agent à jour depuis la page du serveur : cette app pilote les agents à partir de {floor}.",
    "refusal.bridge.failed":
      "Le processus principal de l'app n'a pas répondu à {channel}.",
    "refusal.bridge.failed.fix":
      "Quittez et rouvrez l'app : sa fenêtre est plus récente que le processus qui la sert.",
    "refusal.bridge.command": "{cmd} ne peut pas être appelé d'ici.",
    "refusal.bridge.command.fix":
      "Cette commande a un écran à elle, ou aucun : rien ne l'envoie d'ici.",
    "refusal.forward.port.none": "Aucun port local n'a pu être réservé.",
    "refusal.forward.port.none.fix":
      "Fermez quelques connexions sur cet ordinateur, puis réessayez.",
    "refusal.platform.unreachable": "La console n'a pas répondu.",
    "refusal.platform.unreachable.fix":
      "Vérifiez votre connexion. Pupitre reste utilisable sept jours hors ligne.",
    "refusal.platform.unreachable.local": "La console n'a pas répondu.",
    "refusal.platform.unreachable.local.fix":
      "Aucune console ne répond sur {baseUrl} : lancez `bun run dev:web`.",
    "refusal.agentUpdate.binary":
      "Cette app ne porte pas d'agent pour l'architecture {arch}, et la console n'en publie pas pour ce serveur.",
    "refusal.agentUpdate.binary.fix":
      "Réessayez plus tard ; si ça dure, contactez le support.",
    "refusal.agentUpdate.binary.fix.dev":
      "Construisez l'agent avec bun --cwd=apps/agent run build, puis reconstruisez l'app.",
    "refusal.agentUpdate.signature":
      "Cette app ne porte pas la signature de l'agent {version} pour {arch}, et ce serveur n'atteint plus la console qui la sert.",
    "refusal.agentUpdate.signature.fix":
      "Vérifiez que ce serveur joint internet, puis réessayez ; si ça dure, contactez le support.",
    "refusal.agentUpdate.signature.fix.dev":
      "Publiez cette version avec bun --cwd=apps/agent run release, puis reconstruisez l'app.",
    "refusal.tunnel.route.foreign":
      "{hostname} n'est pas sous {domain}, le domaine que ce serveur publie.",
    "refusal.tunnel.route.foreign.fix":
      "Une route vit sous le domaine du serveur : donnez au projet un sous-domaine de {domain}.",
  },
} as const;
