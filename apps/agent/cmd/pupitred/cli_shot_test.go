package main

import (
	"bytes"
	"errors"
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

	request, _, _ = parseShot([]string{"--project", "web", "out.png"})
	want = shots.Request{Source: "out.png", Project: "web"}
	if request != want {
		t.Fatalf("request = %+v, want %+v", request, want)
	}

	if _, list, _ := parseShot([]string{"--list"}); !list {
		t.Error("--list must be recognised")
	}

	for _, args := range [][]string{{}, {"--size"}, {"--wait", "soon"}, {"--zoom", "2"}, {"--project"}} {
		if _, _, err := parseShot(args); err == nil {
			t.Errorf("%v must be refused", args)
		}
	}
}

type agentAnswers map[string]any

func (a agentAnswers) Call(cmd string, _ any, _ func(string, map[string]any)) (any, error) {
	answer, known := a[cmd]
	if !known {
		return nil, errors.New("refused: " + cmd)
	}

	return answer, nil
}

func shotReader() *state.Reader {
	fake := modtest.NewFakeSys()
	fake.Files[shots.Browsers[0]] = []byte("chrome")

	return state.New(state.Options{
		Sys:   fake,
		Now:   func() time.Time { return modtest.Epoch },
		Shots: state.ShotOptions{Dir: shots.Dir},
	})
}

var exposedAgent = agentAnswers{
	"project.list": map[string]any{"projects": []map[string]any{
		{"name": "web", "path": "/home/dev/projects/web", "processes": []map[string]any{{"host": "127.0.0.1", "port": 3000}}},
	}},
	"shots.url": map[string]any{"url": "https://shots.flyleaf.dev/abc123", "exposed": true},
}

func TestShotPrintsThePublicUrlLastAndThePathAside(t *testing.T) {
	reader := shotReader()

	var stdout, stderr bytes.Buffer
	if code := runShot(reader, exposedAgent, "/home/dev/projects/web/src", []string{"https://example.org"}, &stdout, &stderr); code != 0 {
		t.Fatalf("code %d, stderr: %s", code, stderr.String())
	}

	if got := strings.TrimSpace(stdout.String()); got != "https://shots.flyleaf.dev/abc123/web/2026-09-04/example-org-120000.png" {
		t.Fatalf("the last line printed is the public URL, under the project of the folder: %q", got)
	}

	if !strings.Contains(stderr.String(), shots.Dir+"/web/") {
		t.Fatalf("the local path goes to the error output: %q", stderr.String())
	}

	stdout.Reset()

	if code := runShot(reader, exposedAgent, "/", []string{"--list"}, &stdout, &stderr); code != 0 {
		t.Fatalf("code %d", code)
	}

	if !strings.Contains(stdout.String(), "web/2026-09-04/") {
		t.Fatalf("--list shows the gallery: %q", stdout.String())
	}
}

func TestShotStillCapturesWhenTheAgentCannotBeAsked(t *testing.T) {
	var stdout, stderr bytes.Buffer
	if code := runShot(shotReader(), agentAnswers{}, "/home/dev", []string{"https://example.org"}, &stdout, &stderr); code != 0 {
		t.Fatalf("code %d, stderr: %s", code, stderr.String())
	}

	if got := strings.TrimSpace(stdout.String()); got != "http://127.0.0.1:8099/_unfiled/2026-09-04/example-org-120000.png" {
		t.Fatalf("got %q", got)
	}
}

func TestShotRefusesAProjectItCannotVouchFor(t *testing.T) {
	var stdout, stderr bytes.Buffer

	if code := runShot(shotReader(), exposedAgent, "/", []string{"--project", "../etc", "https://example.org"}, &stdout, &stderr); code != 1 {
		t.Fatalf("an unknown project is refused, code %d", code)
	}

	if code := runShot(shotReader(), agentAnswers{}, "/", []string{"-p", "web", "https://example.org"}, &stdout, &stderr); code != 1 {
		t.Fatalf("a named project the agent cannot confirm is refused, code %d", code)
	}

	if stdout.Len() != 0 {
		t.Fatalf("a refused capture prints no URL: %q", stdout.String())
	}
}
