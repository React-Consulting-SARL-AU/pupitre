package shots

import (
	"errors"
	"net"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

// A project name starts with a letter or a digit, so no project can take this folder.
const Unfiled = "_unfiled"

var dayFolder = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func Folder(project string) string {
	if project == "" {
		return Unfiled
	}

	return project
}

func ProjectOf(folder string) *string {
	if folder == Unfiled {
		return nil
	}

	return &folder
}

// Captures were filed by day at the gallery's root before they were sorted by project.
func FileLoose(ctx sys.Context, dir string) (int, error) {
	if !file.Exists(ctx, dir) {
		return 0, nil
	}

	entries, err := ctx.Sys().ReadDir(dir)
	if err != nil {
		return 0, err
	}

	moved := 0

	for _, entry := range entries {
		if !entry.Dir || !dayFolder.MatchString(entry.Name) {
			continue
		}

		if err := file.MkdirOwned(ctx, dir+"/"+Unfiled, User, User, 0o755); err != nil {
			return moved, err
		}

		if err := fileDay(ctx, dir, entry.Name); err != nil {
			return moved, err
		}

		moved++
	}

	return moved, nil
}

func fileDay(ctx sys.Context, dir, day string) error {
	target := Unfiled + "/" + day
	if !file.Exists(ctx, dir+"/"+target) {
		return ctx.Sys().RenameIn(dir, day, target)
	}

	captures, err := ctx.Sys().ReadDir(dir + "/" + day)
	if err != nil {
		return err
	}

	for _, capture := range captures {
		if file.Exists(ctx, dir+"/"+target+"/"+capture.Name) {
			continue
		}

		if err := ctx.Sys().RenameIn(dir, day+"/"+capture.Name, target+"/"+capture.Name); err != nil {
			return err
		}
	}

	return ctx.Sys().RemoveIn(dir, day, false)
}

// The first answer wins: the project named, the one the command runs in, the one serving the page.
func Resolve(projects []contract.Project, named, cwd, source string) (string, error) {
	if named != "" {
		for _, project := range projects {
			if project.Name == named {
				return named, nil
			}
		}

		return "", errors.New(i18n.T("shots.project.unknown", named, names(projects)))
	}

	if project := containing(projects, cwd); project != "" {
		return project, nil
	}

	return serving(projects, source), nil
}

func names(projects []contract.Project) string {
	listed := make([]string, 0, len(projects))
	for _, project := range projects {
		listed = append(listed, project.Name)
	}

	if len(listed) == 0 {
		return "—"
	}

	return strings.Join(listed, ", ")
}

func containing(projects []contract.Project, cwd string) string {
	found, depth := "", 0

	for _, project := range projects {
		root := strings.TrimSuffix(project.Path, "/")
		if root == "" || (cwd != root && !strings.HasPrefix(cwd, root+"/")) {
			continue
		}

		if len(root) > depth {
			found, depth = project.Name, len(root)
		}
	}

	return found
}

func serving(projects []contract.Project, source string) string {
	address, err := url.Parse(source)
	if err != nil || !isURL(source) {
		return ""
	}

	host := address.Hostname()
	port := portOf(address)

	for _, project := range projects {
		for _, process := range project.Processes {
			if answers(process, host, port) {
				return project.Name
			}
		}
	}

	return ""
}

func answers(process contract.ProjectProcess, host string, port int) bool {
	local := host == process.Host || loopback(host)

	if local && port == process.Port {
		return true
	}

	for _, route := range process.Routes {
		if route.Hostname != "" && route.Hostname == host {
			return true
		}

		if local && port == route.Port {
			return true
		}
	}

	return false
}

func loopback(host string) bool {
	if host == "localhost" {
		return true
	}

	ip := net.ParseIP(host)

	return ip != nil && (ip.IsLoopback() || ip.IsUnspecified())
}

func portOf(address *url.URL) int {
	if port, err := strconv.Atoi(address.Port()); err == nil {
		return port
	}

	if address.Scheme == "https" {
		return 443
	}

	return 80
}
