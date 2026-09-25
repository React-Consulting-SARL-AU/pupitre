package user

import (
	"context"
	"strings"

	"pupitre.studio/agent/internal/sys"
)

const (
	basePath = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

	// tmux and every command run as the user open this shell, whatever root runs.
	Shell = "/usr/bin/zsh"
)

func Home(name string) string {
	if name == "" || name == "root" {
		return "/root"
	}

	return "/home/" + name
}

// Stdin, unlike argv, never reaches the journal.
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

// Ends with gone, the channel that asked, rather than outliving a reader who hung up.
func StreamIn(gone context.Context, ctx sys.Context, name, dir string, emit func(string), argv ...string) error {
	home := Home(name)
	if name == "" {
		name = "root"
	}

	if dir == "" {
		dir = home
	}

	command := sys.Command{User: name, Argv: argv, Dir: dir, Env: Environment(name), Context: gone}
	ctx.Logf("$ %s", sys.Describe(command))

	return ctx.Sys().Stream(command, func(line string) {
		ctx.Logf("  %s", line)
		emit(line)
	})
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
		Env:   append(Environment(name), input.Env...),
	})

	return out.Stdout, err
}

// A child of the root daemon would otherwise inherit root's HOME and SHELL.
func Environment(name string) []string {
	home := Home(name)
	if name == "" {
		name = "root"
	}

	env := []string{
		"HOME=" + home,
		"USER=" + name,
		"LOGNAME=" + name,
		"PATH=" + home + "/.local/bin:" + home + "/.local/share/mise/shims:" + home + "/.bun/bin:" + basePath,
		"MISE_YES=1",
		"MISE_NPM_PACKAGE_MANAGER=npm",
		"COREPACK_ENABLE_DOWNLOAD_PROMPT=0",
	}

	if name != "root" {
		env = append(env, "SHELL="+Shell)
	}

	return env
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
