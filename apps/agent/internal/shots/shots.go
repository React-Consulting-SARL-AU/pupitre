// Package shots holds the gallery: where a capture is filed, how it is taken, and the read-only server that shows it.
package shots

import (
	"fmt"
	"path"
	"regexp"
	"strings"
	"time"

	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	User = "dev"
	Dir  = "/home/" + User + "/shots"
	Port = 8099

	Command = "shot"
	Binary  = "/usr/local/bin/pupitred"
	Link    = "/usr/local/bin/" + Command

	DesktopSize = "1440,900"
	MobileSize  = "390,844"
	MobileAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

	BaseWait = 8000

	dayLayout   = "2006-01-02"
	stampLayout = "150405"
	slugLimit   = 60
)

// The Google build on amd64, the distribution's chromium elsewhere: the same order the module installs them in.
var Browsers = []string{
	"/usr/bin/google-chrome-stable",
	"/opt/google/chrome/google-chrome",
	"/usr/bin/chromium",
	"/usr/bin/chromium-browser",
}

var slugger = regexp.MustCompile(`[^a-zA-Z0-9]+`)

type Options struct {
	Dir  string
	Base string
	Now  func() time.Time
}

func (o Options) resolved() Options {
	if o.Dir == "" {
		o.Dir = Dir
	}
	if o.Base == "" {
		o.Base = fmt.Sprintf("http://127.0.0.1:%d", Port)
	}
	if o.Now == nil {
		o.Now = time.Now
	}

	return o
}

type Request struct {
	Source string
	Name   string
	Size   string
	Wait   int
	Mobile bool
}

type Capture struct {
	Path string
	URL  string
}

// Files the image and answers with both addresses: the local path for whoever reads it back, the URL for whoever has to open it from elsewhere.
func Take(ctx sys.Context, options Options, request Request) (Capture, error) {
	options = options.resolved()

	day := options.Now().Format(dayLayout)
	folder := options.Dir + "/" + day

	if err := ctx.Sys().MkdirAll(folder, 0o755); err != nil {
		return Capture{}, fmt.Errorf("galerie inaccessible : %s", options.Dir)
	}

	target := folder + "/" + name(options, request)

	if isURL(request.Source) {
		if err := shoot(ctx, request, target); err != nil {
			return Capture{}, err
		}
	} else if err := copyFile(ctx, request.Source, target); err != nil {
		return Capture{}, err
	}

	if !file.Exists(ctx, target) {
		return Capture{}, fmt.Errorf("capture manquante : %s", target)
	}

	return Capture{Path: target, URL: options.Base + "/" + day + "/" + path.Base(target)}, nil
}

func shoot(ctx sys.Context, request Request, target string) error {
	browser := Browser(ctx)
	if browser == "" {
		return fmt.Errorf("aucun navigateur sans interface installé — shot <fichier> reste disponible")
	}

	size := request.Size
	if size == "" {
		size = DesktopSize
		if request.Mobile {
			size = MobileSize
		}
	}

	argv := []string{
		browser, "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
		"--hide-scrollbars", fmt.Sprintf("--virtual-time-budget=%d", BaseWait+request.Wait),
		"--window-size=" + size,
	}
	if request.Mobile {
		argv = append(argv, "--user-agent="+MobileAgent)
	}
	argv = append(argv, "--screenshot="+target, request.Source)

	// No user is forced: shot is invoked by dev through the link, and it captures under the identity that called it.
	if _, err := sys.Exec(ctx, sys.Command{Argv: argv}); err != nil {
		return fmt.Errorf("capture impossible : %s", request.Source)
	}

	return nil
}

func copyFile(ctx sys.Context, source, target string) error {
	content, err := file.Read(ctx, source)
	if err != nil {
		return fmt.Errorf("fichier introuvable : %s", source)
	}

	return file.WriteAtomic(ctx, target, content, 0o644)
}

func Browser(ctx sys.Context) string {
	for _, candidate := range Browsers {
		if file.Exists(ctx, candidate) {
			return candidate
		}
	}

	return ""
}

func name(options Options, request Request) string {
	if request.Name != "" {
		return request.Name
	}

	stamp := options.Now().Format(stampLayout)
	if isURL(request.Source) {
		return slug(request.Source) + "-" + stamp + ".png"
	}

	return stamp + "-" + path.Base(request.Source)
}

func slug(source string) string {
	trimmed := strings.TrimPrefix(strings.TrimPrefix(source, "https://"), "http://")
	cleaned := strings.Trim(slugger.ReplaceAllString(trimmed, "-"), "-")

	if len(cleaned) > slugLimit {
		cleaned = cleaned[:slugLimit]
	}

	return strings.Trim(cleaned, "-")
}

func isURL(source string) bool {
	return strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://")
}
