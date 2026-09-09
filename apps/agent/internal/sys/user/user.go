package user

import (
	"strings"

	"pupitre.studio/agent/internal/sys"
)

const basePath = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

func Home(name string) string {
	if name == "" || name == "root" {
		return "/root"
	}

	return "/home/" + name
}

// What a command needs beyond its argv: a directory, a standard input the journal never sees, and the variables the caller adds to the user's own.
type Input struct {
	Dir   string
	Stdin []byte
	Env   []string
}

func Run(ctx sys.Context, name string, argv ...string) (string, error) {
	return RunWith(ctx, name, Input{}, argv...)
}

func RunIn(ctx sys.Context, name, dir string, argv ...string) (string, error) {
	return RunWith(ctx, name, Input{Dir: dir}, argv...)
}

func RunWith(ctx sys.Context, name string, input Input, argv ...string) (string, error) {
	home := Home(name)
	if name == "" {
		name = "root"
	}

	dir := input.Dir
	if dir == "" {
		dir = home
	}

	out, err := sys.Exec(ctx, sys.Command{
		User:  name,
		Argv:  argv,
		Dir:   dir,
		Stdin: input.Stdin,
		Env:   append(environment(name, home), input.Env...),
	})

	return out.Stdout, err
}

func environment(name, home string) []string {
	return []string{
		"HOME=" + home,
		"USER=" + name,
		"LOGNAME=" + name,
		"PATH=" + home + "/.local/bin:" + home + "/.local/share/mise/shims:" + home + "/.bun/bin:" + basePath,
		"MISE_YES=1",
		"MISE_NPM_PACKAGE_MANAGER=npm",
		"COREPACK_ENABLE_DOWNLOAD_PROMPT=0",
	}
}

func Exists(ctx sys.Context, name string) bool {
	_, err := ctx.Sys().Run(sys.Command{Argv: []string{"id", "-u", name}})

	return err == nil
}

func Create(ctx sys.Context, name, shell string) error {
	argv := []string{"useradd", "--create-home", "--user-group"}
	if shell != "" {
		argv = append(argv, "--shell", shell)
	}

	_, err := sys.Exec(ctx, sys.Command{Argv: append(argv, name)})

	return err
}

func Groups(ctx sys.Context, name string) ([]string, error) {
	out, err := ctx.Sys().Run(sys.Command{Argv: []string{"id", "-Gn", name}})
	if err != nil {
		return nil, err
	}

	return strings.Fields(out.Stdout), nil
}
