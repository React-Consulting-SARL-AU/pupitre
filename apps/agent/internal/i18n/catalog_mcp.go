package i18n

var mcpCatalog = map[string]Message{
	"mcp.line.tooLong": {
		FR: "message de plus de %d octets refusé",
		EN: "message longer than %d bytes refused",
	},
	"mcp.parse": {
		FR: "message JSON illisible : %s",
		EN: "unreadable JSON message: %s",
	},
	"mcp.request.invalid": {
		FR: "requête JSON-RPC 2.0 attendue, avec une méthode",
		EN: "a JSON-RPC 2.0 request with a method is expected",
	},
	"mcp.method.unknown": {
		FR: "méthode inconnue : %s",
		EN: "unknown method: %s",
	},
	"mcp.params.invalid": {
		FR: "paramètres illisibles : %s",
		EN: "unreadable parameters: %s",
	},
	"mcp.tool.unknown": {
		FR: "outil inconnu : %s",
		EN: "unknown tool: %s",
	},
	"mcp.arguments.invalid": {
		FR: "arguments refusés : %s",
		EN: "arguments refused: %s",
	},
	"mcp.project.unknown": {
		FR: "projet inconnu : %s",
		EN: "unknown project: %s",
	},
	"mcp.project.unknown.fix": {
		FR: "Projets de ce serveur : %s.",
		EN: "Projects on this server: %s.",
	},
	"mcp.process.unknown": {
		FR: "processus %s inconnu dans le projet %s",
		EN: "no process %s in project %s",
	},
	"mcp.process.unknown.fix": {
		FR: "Processus du projet : %s.",
		EN: "The project's processes: %s.",
	},
	"mcp.screenshot.target": {
		FR: "nommez soit une URL, soit un projet",
		EN: "name either a URL or a project",
	},
	"mcp.screenshot.path": {
		FR: "le chemin de la page commence par / : %q",
		EN: "the page's path starts with /: %q",
	},
	"mcp.screenshot.noPort": {
		FR: "aucun processus du projet %s n'écoute sur un port",
		EN: "no process of project %s listens on a port",
	},
}
