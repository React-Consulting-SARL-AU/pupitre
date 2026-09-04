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

func Run(ctx sys.Context, name string, argv ...string) (string, error) {
	return RunIn(ctx, name, Home(name), argv...)
}

func RunIn(ctx sys.Context, name, dir string, argv ...string) (string, error) {
	home := Home(name)
	if name == "" {
		name = "root"
	}
	if dir == "" {
		dir = home
	}

	out, err := sys.Exec(ctx, sys.Command{
		User: name,
		Argv: argv,
		Dir:  dir,
		Env: []string{
			"HOME=" + home,
			"USER=" + name,
			"LOGNAME=" + name,
			"PATH=" + home + "/.local/bin:" + home + "/.local/share/mise/shims:" + home + "/.bun/bin:" + basePath,
			"MISE_YES=1",
			"COREPACK_ENABLE_DOWNLOAD_PROMPT=0",
		},
	})

	return out.Stdout, err
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
