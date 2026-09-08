package i18n

// What a configuration gets wrong, field by field. One phrase per problem code, and one per format.
var fieldCatalog = map[string]Message{
	"field.problem.required": {
		FR: "ce champ est obligatoire",
		EN: "this field is required",
	},
	"field.problem.type": {
		FR: "une valeur de type %s est attendue",
		EN: "a %s is expected",
	},
	"field.problem.min": {
		FR: "trop petit : attendu %s",
		EN: "too small: %s expected",
	},
	"field.problem.max": {
		FR: "trop grand : attendu %s",
		EN: "too large: %s expected",
	},
	"field.problem.minLength": {
		FR: "trop court : %s caractères au minimum",
		EN: "too short: %s characters at least",
	},
	"field.problem.maxLength": {
		FR: "trop long : %s caractères au maximum",
		EN: "too long: %s characters at most",
	},
	"field.problem.options": {
		FR: "valeur inconnue : attendu %s",
		EN: "unknown value: expected %s",
	},
	"field.problem.pattern": {
		FR: "cette valeur n'a pas la forme attendue",
		EN: "this value does not have the expected shape",
	},
	"field.problem.connection": {
		FR: "aucun compte %s n'est connecté",
		EN: "no %s account is connected",
	},
	"field.problem.format.port": {
		FR: "un port entre 1 et 65535 est attendu",
		EN: "a port between 1 and 65535 is expected",
	},
	"field.problem.format.hostname": {
		FR: "un nom d'hôte est attendu, sans espace ni barre oblique",
		EN: "a hostname is expected, with no space and no slash",
	},
	"field.problem.format.domain": {
		FR: "un domaine est attendu, comme flymate.dev, sans schéma ni barre oblique",
		EN: "a domain is expected, like flymate.dev, with no scheme and no slash",
	},
	"field.problem.format.email": {
		FR: "une adresse électronique est attendue",
		EN: "an email address is expected",
	},
	"field.problem.format.identifier": {
		FR: "un identifiant est attendu : minuscules, chiffres et tirets bas, commençant par une lettre",
		EN: "an identifier is expected: lower case, digits and underscores, starting with a letter",
	},
	"field.problem.format.path": {
		FR: "un chemin absolu est attendu, sans espace, commençant par /",
		EN: "an absolute path is expected, with no space, starting with /",
	},
	"field.problem.format.timezone": {
		FR: "un fuseau IANA est attendu, comme Europe/Paris",
		EN: "an IANA time zone is expected, like Europe/Paris",
	},
	"field.problem.format.size": {
		FR: "une taille est attendue, comme 256M ou 1G",
		EN: "a size is expected, like 256M or 1G",
	},
	"field.problem.format.url": {
		FR: "une adresse http ou https est attendue",
		EN: "an http or https address is expected",
	},
	"field.invalid.config": {
		FR: "la configuration est refusée : %s",
		EN: "the configuration is refused: %s",
	},
	"field.invalid.config.fix": {
		FR: "Corrige les champs signalés dans l'écran de configuration, puis relance l'installation.",
		EN: "Fix the fields marked on the configuration screen, then run the installation again.",
	},
	"field.invalid.one": {
		FR: "%s · %s : %s",
		EN: "%s · %s: %s",
	},
	"field.managed.refused": {
		FR: "%s : le champ %s est géré, et ce module ne déclare aucune connexion",
		EN: "%s: field %s is managed, and this module declares no connection",
	},
	"field.managed.refused.fix": {
		FR: "Retire ce champ de la requête : seul un module qui déclare une connexion en porte un.",
		EN: "Drop that field from the request: only a module that declares a connection carries one.",
	},
	"field.port.taken": {
		FR: "le port %s est déjà écouté sur cette machine",
		EN: "port %s is already listening on this machine",
	},
	"field.path.occupied": {
		FR: "%s existe et n'est pas un dossier",
		EN: "%s exists and is not a directory",
	},
	"field.timezone.unknown": {
		FR: "cette machine ne connaît pas le fuseau %s",
		EN: "this machine does not know the %s time zone",
	},
}
