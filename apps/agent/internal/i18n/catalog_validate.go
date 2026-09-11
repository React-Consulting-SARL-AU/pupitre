package i18n

// What the contract validator says when a request does not match the schema.
var validateCatalog = map[string]Message{
	// French puts a space before a colon, English does not.
	"validate.path.reason": {
		FR: "%s : %s",
		EN: "%s: %s",
	},
	"validate.definition.unknown": {
		FR: "définition inconnue : %s",
		EN: "unknown definition: %s",
	},
	"validate.ref.unsupported": {
		FR: "référence non prise en charge : %s",
		EN: "unsupported reference: %s",
	},
	"validate.trailing_data": {
		FR: "données en trop après la valeur JSON",
		EN: "trailing data after the JSON value",
	},
	"validate.type": {
		FR: "doit être %s",
		EN: "must be %s",
	},
	"validate.type.object": {
		FR: "un objet",
		EN: "an object",
	},
	"validate.type.array": {
		FR: "un tableau",
		EN: "an array",
	},
	"validate.type.string": {
		FR: "une chaîne",
		EN: "a string",
	},
	"validate.type.boolean": {
		FR: "un booléen",
		EN: "a boolean",
	},
	"validate.type.number": {
		FR: "un nombre",
		EN: "a number",
	},
	"validate.type.integer": {
		FR: "un entier",
		EN: "an integer",
	},
	"validate.type.null": {
		FR: "nul",
		EN: "null",
	},
	"validate.type.or": {
		FR: "ou",
		EN: "or",
	},
	"validate.const": {
		FR: "doit valoir %s",
		EN: "must equal %s",
	},
	"validate.enum": {
		FR: "doit être l'une des valeurs %s",
		EN: "must be one of %s",
	},
	"validate.oneof.ambiguous": {
		FR: "correspond à plusieurs variantes (oneOf)",
		EN: "matches several variants (oneOf)",
	},
	"validate.field.required": {
		FR: "champ requis",
		EN: "required field",
	},
	"validate.field.unknown": {
		FR: "champ inconnu",
		EN: "unknown field",
	},
	"validate.field.name.invalid": {
		FR: "nom de champ invalide : %s",
		EN: "invalid field name: %s",
	},
	"validate.array.min_items.one": {
		FR: "doit compter au moins %d élément",
		EN: "must hold at least %d item",
	},
	"validate.array.min_items.many": {
		FR: "doit compter au moins %d éléments",
		EN: "must hold at least %d items",
	},
	"validate.array.max_items.one": {
		FR: "doit compter au plus %d élément",
		EN: "must hold at most %d item",
	},
	"validate.array.max_items.many": {
		FR: "doit compter au plus %d éléments",
		EN: "must hold at most %d items",
	},
	"validate.array.item.extra": {
		FR: "élément en trop",
		EN: "extra item",
	},
	"validate.string.min_length.one": {
		FR: "doit compter au moins %d caractère",
		EN: "must hold at least %d character",
	},
	"validate.string.min_length.many": {
		FR: "doit compter au moins %d caractères",
		EN: "must hold at least %d characters",
	},
	"validate.string.pattern": {
		FR: "ne correspond pas au motif %s",
		EN: "does not match the pattern %s",
	},
	"validate.number.unreadable": {
		FR: "nombre illisible",
		EN: "the number cannot be read",
	},
	"validate.number.minimum": {
		FR: "doit être ≥ %s",
		EN: "must be >= %s",
	},
	"validate.number.exclusive_minimum": {
		FR: "doit être > %s",
		EN: "must be > %s",
	},
	"validate.number.maximum": {
		FR: "doit être ≤ %s",
		EN: "must be <= %s",
	},
}
