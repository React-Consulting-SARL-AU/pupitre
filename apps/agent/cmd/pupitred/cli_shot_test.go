package main

import (
	"bytes"
	"reflect"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/shots"
	"pupitre.studio/agent/internal/state"
)

func TestTheBinaryAnswersToTheNameItIsCalledBy(t *testing.T) {
	if got := arguments([]string{"/usr/local/bin/shot", "https://example.org"}); !reflect.DeepEqual(got, []string{"shot", "https://example.org"}) {
		t.Fatalf("a call through the link is a shot: %v", got)
	}

	if got := arguments([]string{"/usr/local/bin/pupitred", "serve"}); !reflect.DeepEqual(got, []string{"serve"}) {
		t.Fatalf("a call by its own name is unchanged: %v", got)
	}
}

func TestShotReadsItsOptions(t *testing.T) {
	request, list, err := parseShot([]string{"--mobile", "--size", "1024x768", "--wait", "2000", "https://example.org", "accueil.png"})
	if err != nil || list {
		t.Fatalf("unexpected parse: %v %v", list, err)
	}

	want := shots.Request{Source: "https://example.org", Name: "accueil.png", Size: "1024,768", Wait: 2000, Mobile: true}
	if request != want {
		t.Fatalf("request = %+v, want %+v", request, want)
	}

	if _, list, _ := parseShot([]string{"--list"}); !list {
		t.Error("--list must be recognised")
	}

	for _, args := range [][]string{{}, {"--size"}, {"--wait", "bientôt"}, {"--zoom", "2"}} {
		if _, _, err := parseShot(args); err == nil {
			t.Errorf("%v must be refused", args)
		}
	}
}

func TestShotPrintsTheUrlLastAndThePathAside(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[shots.Browsers[0]] = []byte("chrome")

	reader := state.New(state.Options{
		Sys:   fake,
		Now:   func() time.Time { return modtest.Epoch },
		Shots: state.ShotOptions{Dir: shots.Dir},
	})

	var stdout, stderr bytes.Buffer
	if code := runShot(reader, []string{"https://example.org"}, &stdout, &stderr); code != 0 {
		t.Fatalf("code %d, stderr: %s", code, stderr.String())
	}

	if !strings.HasSuffix(strings.TrimSpace(stdout.String()), ".png") || !strings.HasPrefix(stdout.String(), "http") {
		t.Fatalf("the last line printed is the URL: %q", stdout.String())
	}

	if !strings.Contains(stderr.String(), shots.Dir) {
		t.Fatalf("the local path goes to the error output: %q", stderr.String())
	}

	stdout.Reset()
	if code := runShot(reader, []string{"--list"}, &stdout, &stderr); code != 0 {
		t.Fatalf("code %d", code)
	}

	if !strings.Contains(stdout.String(), "2026-09-04/") {
		t.Fatalf("--list shows the gallery: %q", stdout.String())
	}
}
