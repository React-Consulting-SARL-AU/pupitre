package shots_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/shots"
	"pupitre.studio/agent/internal/state"
	"pupitre.studio/agent/internal/sys"
)

func machine(t *testing.T) *modtest.FakeSys {
	t.Helper()

	fake := modtest.NewFakeSys()
	fake.Files[shots.Browsers[0]] = []byte("chrome")

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

func TestACaptureShowsUpInTheGalleryUnderItsProject(t *testing.T) {
	fake := machine(t)
	ctx := modtest.NewSysContext(fake)

	capture, err := shots.Take(ctx, options(), shots.Request{Source: "https://example.org", Project: "web"})
	if err != nil {
		t.Fatal(err)
	}

	if capture.Path != shots.Dir+"/web/2026-09-04/example-org-120000.png" {
		t.Fatalf("the capture is filed by project, by day and by slug, got %s", capture.Path)
	}

	if capture.URL != "http://127.0.0.1:8099/web/2026-09-04/example-org-120000.png" {
		t.Fatalf("the URL must mirror the folder, got %s", capture.URL)
	}

	listed := reader(fake).Shots()
	if len(listed) != 1 {
		t.Fatalf("shots.list must show the capture, got %+v", listed)
	}

	if listed[0].Name != "example-org-120000.png" || listed[0].Path != "web/2026-09-04/example-org-120000.png" {
		t.Fatalf("unexpected row: %+v", listed[0])
	}

	if listed[0].Project == nil || *listed[0].Project != "web" || listed[0].SizeBytes == 0 {
		t.Fatalf("unexpected row: %+v", listed[0])
	}
}

func TestACaptureWithoutAProjectIsFiledApart(t *testing.T) {
	fake := machine(t)

	capture, err := shots.Take(modtest.NewSysContext(fake), shots.Options{Base: "https://shots.flyleaf.dev/abc", Now: options().Now}, shots.Request{Source: "https://example.org"})
	if err != nil {
		t.Fatal(err)
	}

	if capture.URL != "https://shots.flyleaf.dev/abc/_unfiled/2026-09-04/example-org-120000.png" {
		t.Fatalf("got %s", capture.URL)
	}

	if listed := reader(fake).Shots(); listed[0].Project != nil {
		t.Fatalf("an unfiled capture has no project: %+v", listed[0])
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

	capture, err := shots.Take(modtest.NewSysContext(fake), options(), shots.Request{Source: "/home/dev/projects/web/out.png", Name: "maquette.png", Project: "web"})
	if err != nil {
		t.Fatal(err)
	}

	if capture.Path != shots.Dir+"/web/2026-09-04/maquette.png" || string(fake.Files[capture.Path]) != "image" {
		t.Fatalf("unexpected capture: %+v", capture)
	}
}

func TestWithoutABrowserTheUrlCaptureSaysSo(t *testing.T) {
	fake := modtest.NewFakeSys()

	_, err := shots.Take(modtest.NewSysContext(fake), options(), shots.Request{Source: "https://example.org"})
	if err == nil || !strings.Contains(err.Error(), "headless browser") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCapturesFiledByDayMoveUnderUnfiled(t *testing.T) {
	fake := machine(t)
	fake.Files[shots.Dir+"/2026-09-01/old.png"] = []byte("old")
	fake.Files[shots.Dir+"/2026-09-04/today.png"] = []byte("today")
	fake.Files[shots.Dir+"/_unfiled/2026-09-04/new.png"] = []byte("new")
	fake.Files[shots.Dir+"/web/2026-09-04/kept.png"] = []byte("kept")

	for _, dir := range []string{"", "/_unfiled", "/_unfiled/2026-09-04"} {
		fake.Dirs[shots.Dir+dir] = true
	}

	ctx := modtest.NewSysContext(fake)

	moved, err := shots.FileLoose(ctx, shots.Dir)
	if err != nil || moved != 2 {
		t.Fatalf("moved %d, err %v", moved, err)
	}

	for _, want := range []string{"_unfiled/2026-09-01/old.png", "_unfiled/2026-09-04/today.png", "_unfiled/2026-09-04/new.png", "web/2026-09-04/kept.png"} {
		if _, found := fake.Files[shots.Dir+"/"+want]; !found {
			t.Errorf("%s is missing: %v", want, fake.Files)
		}
	}

	if again, _ := shots.FileLoose(ctx, shots.Dir); again != 0 {
		t.Fatalf("a filed gallery has nothing left to move, moved %d", again)
	}
}

func TestTheProjectIsTheOneNamedThenTheFolderThenTheServer(t *testing.T) {
	projects := []contract.Project{
		{Name: "web", Path: "/home/dev/projects/web", Processes: []contract.ProjectProcess{{Host: "127.0.0.1", Port: 3000}}},
		{Name: "api", Path: "/home/dev/projects/api", Processes: []contract.ProjectProcess{{Host: "api.localhost", Port: 4000, Routes: []contract.Route{{Label: "web", Port: 4000, Hostname: "api.flyleaf.dev"}}}}},
	}

	cases := []struct {
		named, cwd, source, want string
	}{
		{"api", "/home/dev/projects/web", "http://127.0.0.1:3000", "api"},
		{"", "/home/dev/projects/web/src", "https://example.org", "web"},
		{"", "/home/dev", "http://localhost:3000/login", "web"},
		{"", "/home/dev", "http://api.localhost:4000", "api"},
		{"", "/home/dev", "https://api.flyleaf.dev/admin", "api"},
		{"", "/home/dev/projects/website", "https://example.org", ""},
		{"", "/tmp", "/tmp/chart.png", ""},
	}

	for _, each := range cases {
		got, err := shots.Resolve(projects, each.named, each.cwd, each.source)
		if err != nil || got != each.want {
			t.Errorf("Resolve(%q, %q, %q) = %q, %v; want %q", each.named, each.cwd, each.source, got, err, each.want)
		}
	}

	if _, err := shots.Resolve(projects, "../etc", "/", "https://example.org"); err == nil || !strings.Contains(err.Error(), "web, api") {
		t.Fatalf("an unknown project is refused with the known ones: %v", err)
	}
}

func TestTheExposureReadsBackWhatIsWritten(t *testing.T) {
	fake := machine(t)
	ctx := modtest.NewSysContext(fake)

	if shots.ReadExposure(ctx).Published() {
		t.Fatal("an absent file publishes nothing")
	}

	written := shots.Exposure{Hostname: "shots.flyleaf.dev", Token: "abc123"}
	if err := shots.WriteExposure(ctx, written); err != nil {
		t.Fatal(err)
	}

	if read := shots.ReadExposure(ctx); read != written || read.Base() != "https://shots.flyleaf.dev/abc123" {
		t.Fatalf("got %+v", read)
	}

	if fake.Modes[shots.ExposurePath] != 0o600 {
		t.Fatalf("the token is root's alone, mode %o", fake.Modes[shots.ExposurePath])
	}

	token, err := shots.NewToken()
	if err != nil || len(token) != 32 {
		t.Fatalf("token %q, err %v", token, err)
	}
}

func TestTheGalleryAnswersOnlyUnderItsToken(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "web", "2026-09-04"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(dir, "web", "2026-09-04", "login.png"), []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}

	handler, err := shots.Handler(dir, "abc123")
	if err != nil {
		t.Fatal(err)
	}

	cases := map[string]int{
		"/":                                   http.StatusNotFound,
		"/web/2026-09-04/login.png":           http.StatusNotFound,
		"/abc1234/web/2026-09-04/login.png":   http.StatusNotFound,
		"/abc123/../web/2026-09-04/login.png": http.StatusNotFound,
		"/abc123/":                            http.StatusOK,
		"/abc123/web/2026-09-04/login.png":    http.StatusOK,
	}

	for target, want := range cases {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, target, nil))

		if recorder.Code != want {
			t.Errorf("GET %s = %d, want %d", target, recorder.Code, want)
		}

		if recorder.Header().Get("X-Robots-Tag") == "" {
			t.Errorf("GET %s lets a crawler index the gallery", target)
		}
	}

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/abc123/", nil))

	if !strings.Contains(recorder.Body.String(), `href="/abc123/web"`) {
		t.Fatalf("the index links under the token:\n%s", recorder.Body.String())
	}
}
