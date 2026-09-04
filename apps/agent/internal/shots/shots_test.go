package shots_test

import (
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/shots"
	"pupitre.studio/agent/internal/state"
	"pupitre.studio/agent/internal/sys"
)

const projectsConf = "shots|.|-|service|127.0.0.1|8099|shots|-|-\n"

func machine(t *testing.T) *modtest.FakeSys {
	t.Helper()

	fake := modtest.NewFakeSys()
	fake.Files[shots.Browsers[0]] = []byte("chrome")
	fake.Files["/etc/pupitre/projects.conf"] = []byte(projectsConf)

	return fake
}

func reader(fake *modtest.FakeSys) *state.Reader {
	return state.New(state.Options{
		Sys:   fake,
		Now:   func() time.Time { return modtest.Epoch },
		Shots: state.ShotOptions{Dir: shots.Dir},
	})
}

func options() shots.Options {
	return shots.Options{Now: func() time.Time { return modtest.Epoch }}
}

func TestACaptureShowsUpInTheGallery(t *testing.T) {
	fake := machine(t)
	ctx := modtest.NewSysContext(fake)

	capture, err := shots.Take(ctx, options(), shots.Request{Source: "https://example.org"})
	if err != nil {
		t.Fatal(err)
	}

	if capture.Path != shots.Dir+"/2026-09-04/example-org-120000.png" {
		t.Fatalf("the capture is filed by day and by slug, got %s", capture.Path)
	}

	if capture.URL != "http://127.0.0.1:8099/2026-09-04/example-org-120000.png" {
		t.Fatalf("the URL must answer where the gallery listens, got %s", capture.URL)
	}

	listed := reader(fake).Shots()
	if len(listed) != 1 {
		t.Fatalf("shots.list must show the capture, got %+v", listed)
	}

	if listed[0].Name != "example-org-120000.png" || listed[0].Path != "2026-09-04/example-org-120000.png" {
		t.Fatalf("unexpected row: %+v", listed[0])
	}

	if listed[0].SizeBytes == 0 {
		t.Error("an empty capture is a failed capture")
	}
}

func TestTheBrowserRunsHeadlessAtTheAskedSize(t *testing.T) {
	fake := machine(t)

	if _, err := shots.Take(modtest.NewSysContext(fake), options(), shots.Request{Source: "https://example.org", Mobile: true, Wait: 2000}); err != nil {
		t.Fatal(err)
	}

	var launch sys.Command
	for _, call := range fake.Calls {
		if strings.HasSuffix(call.Argv[0], "google-chrome-stable") {
			launch = call
		}
	}

	if launch.User != "" {
		t.Fatalf("shot captures under the identity that called it, not as %q", launch.User)
	}

	line := strings.Join(launch.Argv, " ")
	for _, want := range []string{"--headless=new", "--no-sandbox", "--window-size=" + shots.MobileSize, "--virtual-time-budget=10000", "iPhone"} {
		if !strings.Contains(line, want) {
			t.Errorf("the launch line lacks %q:\n%s", want, line)
		}
	}
}

func TestAFileIsFiledUnderTheNameItIsGiven(t *testing.T) {
	fake := machine(t)
	fake.Files["/home/dev/projects/web/out.png"] = []byte("image")

	capture, err := shots.Take(modtest.NewSysContext(fake), options(), shots.Request{Source: "/home/dev/projects/web/out.png", Name: "maquette.png"})
	if err != nil {
		t.Fatal(err)
	}

	if capture.Path != shots.Dir+"/2026-09-04/maquette.png" || string(fake.Files[capture.Path]) != "image" {
		t.Fatalf("unexpected capture: %+v", capture)
	}
}

func TestWithoutABrowserTheUrlCaptureSaysSo(t *testing.T) {
	fake := modtest.NewFakeSys()

	_, err := shots.Take(modtest.NewSysContext(fake), options(), shots.Request{Source: "https://example.org"})
	if err == nil || !strings.Contains(err.Error(), "navigateur") {
		t.Fatalf("unexpected error: %v", err)
	}
}
