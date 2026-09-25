package devcli_test

import (
	"encoding/json"
	"errors"
	"io"
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
)

// Each launch runs a real protocol server over pipes, limited unless --privileged, as main does.
type sudoBench struct {
	launched [][]string
	ran      []string
}

func (b *sudoBench) launch(argv []string) (devcli.Pipe, error) {
	b.launched = append(b.launched, argv)

	server := protocol.NewServer(protocol.Options{
		AgentVersion: "1.2.0",
		Entitlement:  entitlement.Fixed(contract.EntitlementValid),
		Limited:      !slices.Contains(argv, "--privileged"),
	})

	server.Register("project.logs", func(ctx *protocol.Context, _ json.RawMessage) (any, error) {
		b.ran = append(b.ran, "project.logs")
		ctx.Emit("log", map[string]any{"line": "vite v7 ready"})

		return map[string]any{"lines": []string{}}, nil
	})

	server.Register("db.import", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		b.ran = append(b.ran, "db.import")

		return map[string]any{"imported": []string{"shop"}}, nil
	})

	server.Register("project.up", func(_ *protocol.Context, _ json.RawMessage) (any, error) {
		return nil, protocol.NewError(contract.ErrorProjectNotFound, "no such project").WithFix("Declare it first.")
	})

	requests, toServer := io.Pipe()
	fromServer, answers := io.Pipe()

	done := make(chan error, 1)

	go func() {
		err := server.Serve(requests, answers)
		answers.Close()
		done <- err
	}()

	return devcli.Pipe{In: toServer, Out: fromServer, Wait: func() error { return <-done }}, nil
}

func remoteOn(bench *sudoBench) *devcli.Remote {
	return &devcli.Remote{Sudo: sudoPath, Version: "1.2.0", Launch: bench.launch}
}

func TestALimitedVerbRidesTheSessionSudoOpensWithoutAPassword(t *testing.T) {
	bench := &sudoBench{}
	remote := remoteOn(bench)
	defer remote.Close()

	var lines []string

	result, err := remote.Call("project.logs", map[string]any{"name": "web", "process": "web"}, func(event string, fields map[string]any) {
		if event == "log" {
			lines = append(lines, fields["line"].(string))
		}
	})
	if err != nil {
		t.Fatal(err)
	}

	if raw, _ := json.Marshal(result); string(raw) != `{"lines":[]}` || !slices.Equal(lines, []string{"vite v7 ready"}) {
		t.Fatalf("result %s, lines %v", raw, lines)
	}

	if want := []string{sudoPath, "-n", devcli.Binary, "serve"}; len(bench.launched) != 1 || !slices.Equal(bench.launched[0], want) {
		t.Fatalf("launched %v", bench.launched)
	}
}

func TestAPrivilegedVerbOpensTheSessionThePasswordGuards(t *testing.T) {
	bench := &sudoBench{}
	remote := remoteOn(bench)
	defer remote.Close()

	if _, err := remote.Call("project.logs", map[string]any{"name": "web", "process": "web"}, nil); err != nil {
		t.Fatal(err)
	}

	if _, err := remote.Call("db.import", map[string]any{"engine": "mysql"}, nil); err != nil {
		t.Fatal(err)
	}

	if _, err := remote.Call("project.logs", map[string]any{"name": "web", "process": "web"}, nil); err != nil {
		t.Fatal(err)
	}

	want := [][]string{{sudoPath, "-n", devcli.Binary, "serve"}, {sudoPath, devcli.Binary, "serve", "--privileged"}}
	if !slices.EqualFunc(bench.launched, want, slices.Equal[[]string]) {
		t.Fatalf("launched %v", bench.launched)
	}

	if !slices.Equal(bench.ran, []string{"project.logs", "db.import", "project.logs"}) {
		t.Fatalf("ran %v", bench.ran)
	}
}

func TestTheAgentsRefusalReachesTheVerbAsItStands(t *testing.T) {
	remote := remoteOn(&sudoBench{})
	defer remote.Close()

	_, err := remote.Call("project.up", map[string]any{"name": "nope"}, nil)

	var refusal *protocol.Error
	if !errors.As(err, &refusal) || refusal.Code != contract.ErrorProjectNotFound || refusal.Fix != "Declare it first." {
		t.Fatalf("error = %#v", err)
	}
}

// sudo without a terminal cannot ask for the password, so the session never answers hello.
func TestAPrivilegedVerbWithoutThePasswordSaysWhatItNeeds(t *testing.T) {
	i18n.Use("en")

	remote := &devcli.Remote{Sudo: sudoPath, Version: "1.2.0", Launch: func([]string) (devcli.Pipe, error) {
		return devcli.Pipe{In: discarded{}, Out: strings.NewReader("")}, nil
	}}

	_, err := remote.Call("db.import", map[string]any{"engine": "mysql"}, nil)

	var refusal *protocol.Error
	if !errors.As(err, &refusal) || refusal.Code != contract.ErrorPrivilegeRequired || refusal.Fix != i18n.T("devcli.elevate.privileged.fix") {
		t.Fatalf("error = %#v", err)
	}
}

type discarded struct{}

func (discarded) Write(p []byte) (int, error) { return len(p), nil }

func (discarded) Close() error { return nil }
