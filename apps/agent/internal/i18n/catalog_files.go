package i18n

// The files of the client's own tree: what a path may name, and what a read or a write refuses.
var filesCatalog = map[string]Message{
	"files.path.unreadable": {
		FR: "chemin illisible",
		EN: "the path cannot be read",
	},
	"files.path.unreadable.fix": {
		FR: "Donnez un chemin relatif au dossier de travail, sans retour à la ligne ni octet nul.",
		EN: "Give a path relative to the work folder, with no line break and no null byte.",
	},
	"files.path.absolute": {
		FR: "chemin absolu refusé : %s",
		EN: "absolute path refused: %s",
	},
	"files.path.absolute.fix": {
		FR: "Donnez un chemin relatif au dossier de travail, par exemple projects/flymate/api.",
		EN: "Give a path relative to the work folder, for example projects/flymate/api.",
	},
	"files.path.outside": {
		FR: "chemin hors du dossier de travail : %s",
		EN: "the path leaves the work folder: %s",
	},
	"files.path.outside.fix": {
		FR: "Restez sous le dossier de travail, sans « .. » et sans lien qui en sort.",
		EN: `Stay under the work folder, without ".." and without a link that leaves it.`,
	},
	"files.missing": {
		FR: "introuvable : %s",
		EN: "not found: %s",
	},
	"files.missing.fix": {
		FR: "Listez le dossier parent avec fs.list et reprenez le chemin d'une de ses entrées.",
		EN: "List the parent folder with fs.list and take the path of one of its entries.",
	},
	"files.notFolder": {
		FR: "ce n'est pas un dossier : %s",
		EN: "this is not a folder: %s",
	},
	"files.notFolder.fix": {
		FR: "Lisez ce chemin avec fs.read, ou listez le dossier qui le contient.",
		EN: "Read this path with fs.read, or list the folder that holds it.",
	},
	"files.notFile": {
		FR: "ce n'est pas un fichier : %s",
		EN: "this is not a file: %s",
	},
	"files.notFile.fix": {
		FR: "Listez ce chemin avec fs.list.",
		EN: "List this path with fs.list.",
	},
	"files.tooLarge": {
		FR: "fichier trop lourd : %d octets pour un maximum de %d",
		EN: "the file is too heavy: %d bytes for a maximum of %d",
	},
	"files.tooLarge.fix": {
		FR: "Téléchargez ce fichier au lieu de le lire : le canal porte ce qui s'affiche, pas un transfert.",
		EN: "Download this file instead of reading it: the channel carries what is shown, not a transfer.",
	},
	"files.unsupported": {
		FR: "type de fichier non pris en charge : %s",
		EN: "unsupported file type: %s",
	},
	"files.unsupported.fix": {
		FR: "Téléchargez ce fichier : la lecture ne rend que du texte et les images de la galerie.",
		EN: "Download this file: a read carries text and the gallery's images only.",
	},
	"files.unreadable": {
		FR: "fichier illisible : %s",
		EN: "the file cannot be read: %s",
	},
	"files.write.tooLarge": {
		FR: "écriture trop lourde : %d octets pour un maximum de %d",
		EN: "the write is too heavy: %d bytes for a maximum of %d",
	},
	"files.write.tooLarge.fix": {
		FR: "Déposez ce fichier autrement : le canal n'est pas un transfert.",
		EN: "Put this file there another way: the channel is not a transfer.",
	},
	"files.write.content": {
		FR: "contenu illisible : du base64 est attendu",
		EN: "the content cannot be read: base64 is expected",
	},
	"files.write.content.fix": {
		FR: "Encodez le contenu en base64, sans retour à la ligne.",
		EN: "Encode the content as base64, with no line break.",
	},
	"files.write.changed": {
		FR: "%s a changé depuis la lecture",
		EN: "%s has changed since it was read",
	},
	"files.write.changed.fix": {
		FR: "Relisez le fichier avec fs.read, reportez-y vos modifications, puis réécrivez avec la nouvelle empreinte.",
		EN: "Read the file again with fs.read, carry your changes over, then write with the new digest.",
	},
	"files.write.exists": {
		FR: "%s existe déjà",
		EN: "%s already exists",
	},
	"files.write.exists.fix": {
		FR: "Lisez le fichier avec fs.read et accompagnez l'écriture de son empreinte sha256.",
		EN: "Read the file with fs.read and give the write its sha256 digest.",
	},
	"files.write.failed": {
		FR: "écriture refusée par la machine : %s",
		EN: "the machine refused the write: %s",
	},
	"files.mkdir.taken": {
		FR: "un fichier porte déjà ce nom : %s",
		EN: "a file already carries this name: %s",
	},
	"files.mkdir.taken.fix": {
		FR: "Choisissez un autre nom de dossier.",
		EN: "Choose another folder name.",
	},
	"files.mkdir.failed": {
		FR: "dossier non créé : %s",
		EN: "the folder was not created: %s",
	},
	"files.rename.taken": {
		FR: "%s existe déjà",
		EN: "%s already exists",
	},
	"files.rename.taken.fix": {
		FR: "Choisissez une destination libre, ou supprimez d'abord celle-ci.",
		EN: "Choose a free destination, or delete that one first.",
	},
	"files.rename.failed": {
		FR: "déplacement refusé par la machine : %s",
		EN: "the machine refused the move: %s",
	},
	"files.remove.notEmpty": {
		FR: "dossier non vide : %s contient %d entrées",
		EN: "the folder is not empty: %s holds %d entries",
	},
	"files.remove.notEmpty.fix": {
		FR: "Rappelez fs.remove avec recursive: true pour supprimer le dossier et ce qu'il contient.",
		EN: "Call fs.remove again with recursive: true to delete the folder and what it holds.",
	},
	"files.remove.failed": {
		FR: "suppression refusée par la machine : %s",
		EN: "the machine refused the deletion: %s",
	},
}
