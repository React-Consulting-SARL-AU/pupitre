package state_test

import (
	"bytes"
	"io"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/state"
)

// A follow holds its channel for as long as the reader stays: the moment standard input closes, the follow ends, not a quarter of an hour later.
func TestAFollowEndsWhenTheChannelIsCut(t *testing.T) {
	fake := modtest.NewFakeSys()
	machine(fake)
	fake.Files[registry.DefaultConf] = []byte(conf)
	fake.Dirs["/home/dev/projects/web"] = true
	fake.Serves("web/web", 3000)

	reader := state.New(state.Options{
		Sys:          fake,
		Now:          time.Now,
		Registry:     modules.NewRegistry(),
		Entitlement:  func() contract.Entitlement { return contract.EntitlementDev },
		AgentVersion: "0.0.0-test",
		Follow:       state.FollowOptions{Interval: time.Millisecond, Limit: time.Hour},
	})
	if _, err := reader.Up("web", ""); err != nil {
		t.Fatal(err)
	}

	server := protocol.NewServer(protocol.Options{AgentVersion: "0.0.0-test", Entitlement: entitlement.Fixed(contract.EntitlementDev)})
	state.RegisterCommands(server, reader)

	in, stdin := io.Pipe()
	var out bytes.Buffer
	served := make(chan error, 1)
	go func() { served <- server.Serve(in, &out) }()

	io.WriteString(stdin, `{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":2}}`+"\n")
	io.WriteString(stdin, `{"id":2,"cmd":"project.logs","params":{"name":"web","process":"web","lines":5,"follow":true}}`+"\n")
	time.Sleep(20 * time.Millisecond)
	stdin.Close()

	select {
	case err := <-served:
		if err != nil {
			t.Fatalf("serve: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the follow outlived the channel that read it")
	}

	if !strings.Contains(out.String(), `"id":2,"ok":true`) {
		t.Fatalf("the follow must answer once it ends:\n%s", out.String())
	}
}
