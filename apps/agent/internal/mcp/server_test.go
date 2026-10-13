package mcp_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/mcp"
	"pupitre.studio/agent/internal/protocol"
)

type response struct {
	ID     json.RawMessage `json:"id"`
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func exchange(t *testing.T, server mcp.Server, lines ...string) []response {
	t.Helper()

	var out bytes.Buffer
	if err := server.Serve(strings.NewReader(strings.Join(lines, "\n")+"\n"), &out); err != nil {
		t.Fatal(err)
	}

	var replies []response

	for _, line := range strings.Split(strings.TrimSpace(out.String()), "\n") {
		if line == "" {
			continue
		}

		var reply response
		if err := json.Unmarshal([]byte(line), &reply); err != nil {
			t.Fatalf("%q is not one JSON message: %v", line, err)
		}

		replies = append(replies, reply)
	}

	return replies
}

func echo() mcp.Server {
	return mcp.Server{
		Name:         "pupitre",
		Version:      "2.1.0",
		Instructions: mcp.Instructions,
		Tools: []mcp.Tool{
			{
				Name:        "echo",
				InputSchema: map[string]any{"type": "object"},
				Run: func(raw json.RawMessage) (mcp.Result, error) {
					return mcp.Text(string(raw)), nil
				},
			},
			{
				Name:        "refuse",
				InputSchema: map[string]any{"type": "object"},
				Run: func(json.RawMessage) (mcp.Result, error) {
					return mcp.Result{}, protocol.NewError(contract.ErrorBusy, "an installation is running").WithFix("Wait for it to end.")
				},
			},
		},
	}
}

func TestInitializeAnswersInTheVersionTheClientSpeaks(t *testing.T) {
	replies := exchange(t, echo(),
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"claude-code","version":"2"}}}`,
		`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
		`{"jsonrpc":"2.0","id":2,"method":"initialize","params":{"protocolVersion":"1999-01-01"}}`,
	)

	if len(replies) != 2 {
		t.Fatalf("a notification is never answered, got %d replies", len(replies))
	}

	var known struct {
		ProtocolVersion string `json:"protocolVersion"`
		Capabilities    struct {
			Tools map[string]any `json:"tools"`
		} `json:"capabilities"`
		ServerInfo struct {
			Name    string `json:"name"`
			Version string `json:"version"`
		} `json:"serverInfo"`
		Instructions string `json:"instructions"`
	}

	if err := json.Unmarshal(replies[0].Result, &known); err != nil {
		t.Fatal(err)
	}

	if known.ProtocolVersion != "2025-06-18" || known.Capabilities.Tools == nil || known.ServerInfo.Name != "pupitre" || known.Instructions == "" {
		t.Fatalf("initialize = %s", replies[0].Result)
	}

	var unknown struct {
		ProtocolVersion string `json:"protocolVersion"`
	}

	if err := json.Unmarshal(replies[1].Result, &unknown); err != nil || unknown.ProtocolVersion != mcp.ProtocolVersions[0] {
		t.Fatalf("an unknown version gets the newest: %s", replies[1].Result)
	}
}

func TestToolsAreListedWithTheirSchema(t *testing.T) {
	replies := exchange(t, echo(), `{"jsonrpc":"2.0","id":"list","method":"tools/list"}`)

	var listed struct {
		Tools []map[string]any `json:"tools"`
	}

	if err := json.Unmarshal(replies[0].Result, &listed); err != nil {
		t.Fatal(err)
	}

	if string(replies[0].ID) != `"list"` || len(listed.Tools) != 2 || listed.Tools[0]["name"] != "echo" || listed.Tools[0]["inputSchema"] == nil {
		t.Fatalf("tools/list = %s", replies[0].Result)
	}
}

func TestACallRunsTheToolAndARefusalIsItsResult(t *testing.T) {
	replies := exchange(t, echo(),
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"echo","arguments":{"say":"hi"}}}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"refuse","arguments":{}}}`,
	)

	var said mcp.Result
	if err := json.Unmarshal(replies[0].Result, &said); err != nil || said.IsError || said.Content[0].Text != `{"say":"hi"}` {
		t.Fatalf("echo = %s", replies[0].Result)
	}

	var refused mcp.Result
	if err := json.Unmarshal(replies[1].Result, &refused); err != nil {
		t.Fatal(err)
	}

	if replies[1].Error != nil || !refused.IsError || refused.Content[0].Text != "an installation is running\nWait for it to end." {
		t.Fatalf("a refusal reaches the model with its fix: %s", replies[1].Result)
	}
}

func TestWhatIsNotARequestIsAProtocolError(t *testing.T) {
	replies := exchange(t, echo(),
		`{not json`,
		`{"jsonrpc":"2.0","id":2,"method":"resources/list"}`,
		`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"nothing"}}`,
		`{"id":4,"method":"ping"}`,
		`{"jsonrpc":"2.0","id":5,"method":"ping"}`,
	)

	for index, want := range []int{-32700, -32601, -32602, -32600} {
		if replies[index].Error == nil || replies[index].Error.Code != want {
			t.Errorf("reply %d: want error %d, got %+v", index, want, replies[index])
		}
	}

	if string(replies[0].ID) != "null" {
		t.Errorf("an unreadable message is answered under a null id, got %s", replies[0].ID)
	}

	if replies[4].Error != nil || string(replies[4].Result) != "{}" {
		t.Fatalf("ping = %+v", replies[4])
	}
}

func TestRefusalWithoutFixKeepsTheMessageAlone(t *testing.T) {
	if got := mcp.Refusal(errors.New("plain")).Content[0].Text; got != "plain" {
		t.Fatalf("got %q", got)
	}
}
