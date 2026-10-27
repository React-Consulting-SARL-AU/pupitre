package browser

import (
	"strings"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/agents"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	headlessVersion = "155.0.8059.39"
	headlessURL     = "https://storage.googleapis.com/chrome-for-testing-public/" + headlessVersion + "/linux-arm64/chrome-headless-shell-linux-arm64.zip"
	headlessArchive = "chrome-headless-shell-linux-arm64.zip"

	headlessBinary      = agents.HeadlessDir + "/chrome-headless-shell-linux-arm64/chrome-headless-shell"
	headlessVersionPath = agents.HeadlessDir + "/VERSION"
)

// Pinned beside the version: Chrome for Testing publishes no checksum, so the agent carries the one it was released with.
var headlessDigest = "9fb86f7c0b2734c5febc0bbb4e85f37da43553f3f8a7970949828c5713e87e94"

func headlessInstalled(ctx *modules.Context) string {
	if !file.Exists(ctx, headlessBinary) {
		return ""
	}

	raw, err := file.Read(ctx, headlessVersionPath)
	if err != nil {
		return ""
	}

	return strings.TrimSpace(string(raw))
}

// The folder is replaced whole, so a version never runs beside the files of another.
func installHeadless(ctx *modules.Context) error {
	staged, done, err := download.Verified(ctx, headlessArchive, headlessURL, headlessDigest)
	if err != nil {
		return err
	}
	defer done()

	if err := removeHeadless(ctx); err != nil {
		return err
	}

	if err := ctx.Sys().MkdirAll(agents.HeadlessDir, 0o755); err != nil {
		return err
	}

	if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"unzip", "-q", "-o", staged, "-d", agents.HeadlessDir}}); err != nil {
		return err
	}

	return file.WriteAtomic(ctx, headlessVersionPath, []byte(headlessVersion+"\n"), 0o644)
}

func removeHeadless(ctx *modules.Context) error {
	_, err := sys.Exec(ctx, sys.Command{Argv: []string{"rm", "-rf", agents.HeadlessDir}})

	return err
}
