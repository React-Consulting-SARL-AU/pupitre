package capture

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	DesktopSize = "1440,900"
	MobileSize  = "390,844"
	MobileAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

	BaseWait = 8000
	MaxWait  = 30000
)

// Where ai.browser unpacks Chrome for Testing's headless shell on arm64, which Google's apt repository does not serve.
const HeadlessDir = "/opt/chrome-headless-shell"

// Ubuntu's chromium-browser is left out: it is a snap stub, not a browser.
var Browsers = []string{
	"/usr/bin/google-chrome-stable",
	"/opt/google/chrome/google-chrome",
	HeadlessDir + "/chrome-headless-shell-linux-arm64/chrome-headless-shell",
	"/usr/bin/chromium",
}

type Request struct {
	URL    string
	Size   string
	Mobile bool
	Wait   int
	// Where the browser writes the image before it is read back and removed.
	Dir string
	Now func() time.Time
}

// Returns the PNG itself: the caller hands it on, nothing is kept on the disk.
func Take(ctx sys.Context, request Request) ([]byte, error) {
	if !IsURL(request.URL) {
		return nil, errors.New(i18n.T("capture.url.invalid", request.URL))
	}

	browser := Browser(ctx)
	if browser == "" {
		return nil, errors.New(i18n.T("capture.browser.none"))
	}

	if err := ctx.Sys().MkdirAll(request.Dir, 0o700); err != nil {
		return nil, err
	}

	target := request.Dir + "/capture-" + strconv.FormatInt(now(request).UnixNano(), 36) + ".png"
	defer func() { _, _ = file.Remove(ctx, target) }()

	if _, err := sys.Exec(ctx, sys.Command{Argv: launch(browser, request, target)}); err != nil {
		return nil, errors.New(i18n.T("capture.failed", request.URL))
	}

	image, err := file.Read(ctx, target)
	if err != nil || len(image) == 0 {
		return nil, errors.New(i18n.T("capture.failed", request.URL))
	}

	return image, nil
}

func launch(browser string, request Request, target string) []string {
	size := request.Size
	if size == "" {
		size = DesktopSize
		if request.Mobile {
			size = MobileSize
		}
	}

	wait := min(max(request.Wait, 0), MaxWait)

	argv := []string{
		browser, "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
		"--hide-scrollbars", fmt.Sprintf("--virtual-time-budget=%d", BaseWait+wait),
		"--window-size=" + size,
	}
	if request.Mobile {
		argv = append(argv, "--user-agent="+MobileAgent)
	}

	return append(argv, "--screenshot="+target, request.URL)
}

func Browser(ctx sys.Context) string {
	for _, candidate := range Browsers {
		if file.Exists(ctx, candidate) {
			return candidate
		}
	}

	return ""
}

// The scheme keeps the address from ever reading as one of the browser's flags.
func IsURL(source string) bool {
	return strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://")
}

func now(request Request) time.Time {
	if request.Now == nil {
		return time.Now()
	}

	return request.Now()
}
