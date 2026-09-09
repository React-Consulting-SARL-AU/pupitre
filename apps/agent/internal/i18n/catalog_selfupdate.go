package i18n

// The agent's self-update: what a refusal says, and the fix that comes with it.
var selfupdateCatalog = map[string]Message{
	"selfupdate.signature.bad": {
		FR: "le binaire de la version %s ne correspond pas à sa signature : rien n'a été installé",
		EN: "the binary of version %s does not match its signature: nothing was installed",
	},
	"selfupdate.signature.bad.fix": {
		FR: "Relancez la mise à jour depuis l'app ; si le refus persiste, signale-le, le binaire publié est en cause.",
		EN: "Run the update again from the app; if it keeps refusing, report it, the published binary is at fault.",
	},
	"selfupdate.signature.unverifiable": {
		FR: "signature invérifiable : %s",
		EN: "the signature cannot be verified: %s",
	},
	"selfupdate.signature.unverifiable.fix": {
		FR: "Relancez la mise à jour ; la signature vient de la plateforme, qui publie celle de la version demandée.",
		EN: "Run the update again; the signature comes from the platform, which publishes the one of the version asked for.",
	},
	"selfupdate.corrupted": {
		FR: "le binaire de la version %s a l'empreinte %s, la plateforme en annonce %s : rien n'a été installé",
		EN: "the binary of version %s has digest %s, the platform announces %s: nothing was installed",
	},
	"selfupdate.corrupted.fix": {
		FR: "Relancez la mise à jour ; si le refus persiste, signale-le, le téléchargement de cette version est en cause.",
		EN: "Run the update again; if it keeps refusing, report it, the download of this version is at fault.",
	},
	"selfupdate.downgrade.refused": {
		FR: "la version %s est antérieure à %s, que ce serveur ne redescend pas en dessous : rien n'a été installé",
		EN: "version %s is older than %s, which this server does not go below: nothing was installed",
	},
	"selfupdate.downgrade.refused.fix": {
		FR: "Installez %s ou plus récent ; pour revenir en arrière malgré tout, relancez avec allow_downgrade.",
		EN: "Install %s or newer; to go back anyway, run again with allow_downgrade.",
	},
	"selfupdate.metadata.unreadable": {
		FR: "empreinte de la version %s illisible : %s",
		EN: "the digest of version %s cannot be read: %s",
	},
	"selfupdate.platform.unreachable.fix": {
		FR: "Vérifiez que le serveur joint la plateforme en HTTPS sortant, puis relancez la mise à jour.",
		EN: "Check that the server reaches the platform over outbound HTTPS, then run the update again.",
	},
	"selfupdate.version.unpublished": {
		FR: "la plateforme ne publie pas la version %s pour cette architecture",
		EN: "the platform does not publish version %s for this architecture",
	},
	"selfupdate.version.unpublished.fix": {
		FR: "Choisissez une version publiée, ou laisse l'app demander la dernière.",
		EN: "Pick a published version, or let the app ask for the latest.",
	},
	"selfupdate.token.refused": {
		FR: "la plateforme refuse le jeton de ce serveur : %s",
		EN: "the platform refuses this server's token: %s",
	},
	"selfupdate.token.refused.fix": {
		FR: "Ouvrez https://app.pupitre.studio pour rétablir l'abonnement de ce serveur.",
		EN: "Open https://app.pupitre.studio to restore this server's usage right.",
	},
	"selfupdate.download.failed": {
		FR: "téléchargement impossible : %s",
		EN: "the download failed: %s",
	},
	"selfupdate.state.unreadable": {
		FR: "version cible illisible : %s",
		EN: "the target version cannot be read: %s",
	},
	"selfupdate.state.unreadable.fix": {
		FR: "Passez la version à installer dans les paramètres de agent.upgrade.",
		EN: "Pass the version to install in the parameters of agent.upgrade.",
	},
	"selfupdate.restart.failed": {
		FR: "la version %s n'a pas pu redémarrer : %s",
		EN: "version %s could not restart: %s",
	},
	"selfupdate.restart.failed.fix": {
		FR: "Regardez journalctl -u pupitred sur le serveur, puis relancez la mise à jour.",
		EN: "Look at journalctl -u pupitred on the server, then run the update again.",
	},
	"selfupdate.silent": {
		FR: "la version %s ne répond pas au protocole (%s) : l'agent %s a été rétabli",
		EN: "version %s does not answer the protocol (%s): agent %s was restored",
	},
	"selfupdate.silent.fix": {
		FR: "Reste sur cette version ; signale l'incident pour que la version publiée soit corrigée.",
		EN: "Stay on this version; report the incident so the published one gets fixed.",
	},
	"selfupdate.token.missing.fix": {
		FR: "Réinstalle ce serveur depuis l'app pour lui rendre un jeton de serveur.",
		EN: "Reinstall this server from the app to give it a server token back.",
	},
	"selfupdate.root.required.fix": {
		FR: "Vérifiez que la commande tourne en root sur le serveur.",
		EN: "Check that the command runs as root on the server.",
	},
	"selfupdate.replace.failed": {
		FR: "%s non remplacé : %s",
		EN: "%s was not replaced: %s",
	},
	"selfupdate.replace.failed.fix": {
		FR: "Vérifiez l'espace disque du serveur, puis relancez la mise à jour.",
		EN: "Check the server's disk space, then run the update again.",
	},
	"selfupdate.rollback.failed": {
		FR: "%s ; le retour à la version précédente a échoué lui aussi : %s",
		EN: "%s; going back to the previous version failed too: %s",
	},
	"selfupdate.rollback.failed.fix": {
		FR: "Pousse le binaire de l'agent depuis l'app pour rétablir le serveur.",
		EN: "Push the agent's binary from the app to bring the server back.",
	},
	"selfupdate.params.unreadable": {
		FR: "paramètres illisibles : %s",
		EN: "the parameters cannot be read: %s",
	},
}
