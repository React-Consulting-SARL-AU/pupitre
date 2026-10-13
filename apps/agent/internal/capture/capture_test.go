package capture_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/capture"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys"
)

const dir = "/tmp/pupitre-capture"

func machine() *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Files[capture.Browsers[0]] = []byte("chrome")

	return fake
}

func TestACaptureHandsBackTheImageAndLeavesNothingBehind(t *testing.T) {
	fake := machine()
	fake.Replies["screenshot"] = "\x89PNG image"

	image, err := capture.Take(modtest.NewSysContext(fake), capture.Request{URL: "https://example.org", Dir: dir})
	if err != nil {
		t.Fatal(err)
	}

	if string(image) != "\x89PNG image" {
		t.Fatalf("the capture must return the browser's image, got %q", image)
	}

	for path := range fake.Files {
		if strings.HasPrefix(path, dir+"/") {
			t.Fatalf("the image must not stay on the disk: %s", path)
		}
	}
}

func TestTheBrowserRunsHeadlessAtTheAskedSize(t *testing.T) {
	fake := machine()

	if _, err := capture.Take(modtest.NewSysContext(fake), capture.Request{URL: "https://example.org", Mobile: true, Wait: 2000, Dir: dir}); err != nil {
		t.Fatal(err)
	}

	launch := browserCall(fake)
	if launch.User != "" {
		t.Fatalf("the capture runs as its caller, not as %q", launch.User)
	}

	line := strings.Join(launch.Argv, " ")
	for _, want := range []string{"--headless=new", "--no-sandbox", "--window-size=" + capture.MobileSize, "--virtual-time-budget=10000", "iPhone"} {
		if !strings.Contains(line, want) {
			t.Errorf("the launch line lacks %q:\n%s", want, line)
		}
	}

	if last := launch.Argv[len(launch.Argv)-1]; last != "https://example.org" {
		t.Fatalf("the address closes the line, got %q", last)
	}
}

func TestTheWaitIsCapped(t *testing.T) {
	fake := machine()

	if _, err := capture.Take(modtest.NewSysContext(fake), capture.Request{URL: "https://example.org", Wait: 10 * capture.MaxWait, Dir: dir}); err != nil {
		t.Fatal(err)
	}

	if line := strings.Join(browserCall(fake).Argv, " "); !strings.Contains(line, "--virtual-time-budget=38000") {
		t.Fatalf("the wait must stop at the cap:\n%s", line)
	}
}

func TestOnlyAWebAddressReachesTheBrowser(t *testing.T) {
	fake := machine()

	for _, source := range []string{"--remote-debugging-port=9222", "file:///etc/passwd", "/home/dev/out.png", ""} {
		if _, err := capture.Take(modtest.NewSysContext(fake), capture.Request{URL: source, Dir: dir}); err == nil {
			t.Errorf("%q must be refused", source)
		}
	}

	if len(fake.Calls) != 0 {
		t.Fatalf("a refused address runs nothing, got %+v", fake.Calls)
	}
}

func TestWithoutABrowserTheCaptureSaysSo(t *testing.T) {
	_, err := capture.Take(modtest.NewSysContext(modtest.NewFakeSys()), capture.Request{URL: "https://example.org", Dir: dir})
	if err == nil || !strings.Contains(err.Error(), "headless browser") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func browserCall(fake *modtest.FakeSys) sys.Command {
	for _, call := range fake.Calls {
		if call.Argv[0] == capture.Browsers[0] {
			return call
		}
	}

	return sys.Command{}
}
