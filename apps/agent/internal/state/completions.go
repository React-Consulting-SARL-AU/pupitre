package state

import (
	"path"
	"sort"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

// Past that, a list stops helping: the app shows ten candidates at a time.
const pathLimit = 200

// What a terminal needs to complete a line: the grammar of the driving commands, the projects as declared, and one folder of the projects root.
func (r *Reader) Completions(wanted string) (contract.Completions, error) {
	root := r.options.Paths.Resolved().Projects

	folder, err := under(wanted)
	if err != nil {
		return contract.Completions{}, err
	}

	return contract.Completions{
		Command:  devcli.Command,
		Sub:      devcli.Grammar(),
		Projects: r.names(),
		Root:     root,
		Path:     folder,
		Paths:    r.entries(root, folder),
	}, nil
}

func (r *Reader) names() []string {
	declared := r.registry()

	names := make([]string, 0, len(declared.Projects))
	for _, project := range declared.Projects {
		names = append(names, project.Name)
	}

	return names
}

// A folder that is not there yet answers with an empty list: a completion never turns a keystroke into an error.
func (r *Reader) entries(root, folder string) []string {
	dir := root
	if folder != "" {
		dir += "/" + folder
	}

	listed, err := file.List(r.ctx(), dir)
	if err != nil {
		return []string{}
	}

	sort.Slice(listed, func(a, b int) bool { return listed[a].Name < listed[b].Name })

	names := make([]string, 0, min(len(listed), pathLimit))
	for _, entry := range listed[:min(len(listed), pathLimit)] {
		names = append(names, name(entry))
	}

	return names
}

func name(entry sys.Entry) string {
	if entry.Dir {
		return entry.Name + "/"
	}

	return entry.Name
}

// The projects root is the only folder the app may list: the rest of the machine is not its business, and a completion is not a file browser.
func under(wanted string) (string, error) {
	if strings.ContainsAny(wanted, "\x00\n\r") {
		return "", bad("chemin illisible", "Donne un chemin relatif à la racine des projets.")
	}

	if strings.HasPrefix(wanted, "/") {
		return "", bad("chemin absolu refusé : "+wanted, "Donne un chemin relatif à la racine des projets, par exemple flymate/api.")
	}

	for _, segment := range strings.Split(wanted, "/") {
		if segment == ".." {
			return "", bad("chemin hors de la racine des projets : "+wanted, "Reste sous la racine des projets, sans « .. ».")
		}
	}

	return strings.TrimPrefix(path.Clean("/"+wanted), "/"), nil
}
