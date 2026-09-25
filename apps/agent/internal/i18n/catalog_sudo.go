package i18n

var sudoCatalog = map[string]Message{
	"protocol.privilege.required": {
		FR: "%s n'est pas ouvert à une session sans le mot de passe sudo de dev",
		EN: "%s is not open to a session without the sudo password of dev",
	},
	"protocol.privilege.required.fix": {
		FR: "L'app ouvre pour ce geste une session privilégiée avec le mot de passe sudo de dev qu'elle garde. Sur la machine : sudo pupitred serve --privileged, qui demande ce mot de passe.",
		EN: "The app opens a privileged session for this gesture with the sudo password of dev it keeps. On the machine: sudo pupitred serve --privileged, which asks for that password.",
	},
	"selfupdate.unsigned.refused": {
		FR: "cet agent n'a pas de clé de release : rien ne vérifie le binaire reçu, et sudo lance cette commande sans mot de passe",
		EN: "this agent has no release key: nothing checks the binary it receives, and sudo runs this command without a password",
	},
	"selfupdate.unsigned.refused.fix": {
		FR: "Un agent de développement se pose par sudo pupitred binary install --privileged, qui demande le mot de passe sudo de dev.",
		EN: "A development agent is placed with sudo pupitred binary install --privileged, which asks for the sudo password of dev.",
	},
	"cli.binary.header.invalid": {
		FR: "première ligne illisible : %s",
		EN: "the first line cannot be read: %s",
	},
	"cli.binary.header.fix": {
		FR: `La première ligne de l'entrée standard porte ce que la signature couvre, {"version":"<v>","signature":"<base64>"}, et le binaire suit.`,
		EN: `The first line of standard input carries what the signature covers, {"version":"<v>","signature":"<base64>"}, and the binary follows.`,
	},
	"cli.binary.argument.unknown": {
		FR: "argument inconnu : %s",
		EN: "unknown argument: %s",
	},
	"cli.binary.version.expected": {
		FR: "la version manque sur la première ligne : celle que la signature couvre",
		EN: "the version is missing from the first line: the one the signature covers",
	},
	"cli.binary.empty": {
		FR: "aucun binaire sur l'entrée standard : rien n'a été installé",
		EN: "no binary on standard input: nothing was installed",
	},
	"cli.binary.too_large": {
		FR: "le binaire dépasse %d Mio : rien n'a été installé",
		EN: "the binary is over %d MiB: nothing was installed",
	},
	"harden.sudo.hash.invalid": {
		FR: "empreinte du mot de passe refusée : %s",
		EN: "the password hash is refused: %s",
	},
	"harden.sudo.hash.invalid.fix": {
		FR: "L'app envoie une empreinte crypt ($y$ ou $6$) sur la ligne de secrets, jamais le mot de passe : relancez la sécurisation depuis l'app.",
		EN: "The app sends a crypt hash ($y$ or $6$) on the secrets line, never the password: run the securing again from the app.",
	},
	"harden.sudo.ssh.passwords": {
		FR: "le serveur SSH accepte encore les mots de passe pour %s (%s) : un mot de passe ouvrirait SSH",
		EN: "the SSH server still takes passwords for %s (%s): a password would open SSH",
	},
	"harden.sudo.ssh.passwords.fix": {
		FR: "Relancez la sécurisation depuis l'app : elle ferme les mots de passe de SSH avant de poser celui de sudo.",
		EN: "Run the securing again from the app: it closes SSH to passwords before it sets the one sudo asks for.",
	},
	"harden.sudo.binary.missing": {
		FR: "%s est introuvable",
		EN: "%s cannot be found",
	},
	"harden.sudo.binary.link": {
		FR: "%s est un lien",
		EN: "%s is a link",
	},
	"harden.sudo.binary.owner": {
		FR: "%s appartient à %s",
		EN: "%s belongs to %s",
	},
	"harden.sudo.binary.writable": {
		FR: "%s est modifiable par d'autres que root (%o)",
		EN: "%s can be changed by others than root (%o)",
	},
	"harden.sudo.binary.unsafe": {
		FR: "pupitred ne peut pas être la seule commande sans mot de passe : %s",
		EN: "pupitred cannot be the one command without a password: %s",
	},
	"harden.sudo.binary.unsafe.fix": {
		FR: "Remettez pupitred en place en root — propriétaire root, mode 755, dans un dossier que seul root modifie — puis relancez la sécurisation.",
		EN: "Put pupitred back as root — owned by root, mode 755, in a folder only root changes — then run the securing again.",
	},
	"harden.sudo.failed": {
		FR: "le mot de passe de sudo n'a pas été posé : %s",
		EN: "the sudo password was not set: %s",
	},
	"harden.sudo.failed.fix": {
		FR: "Rien n'a changé pour sudo tant que la règle n'est pas écrite : relancez la sécurisation depuis l'app.",
		EN: "Nothing changed for sudo until the rule is written: run the securing again from the app.",
	},
}
