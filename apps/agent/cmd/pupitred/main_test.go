package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestServeAnswersPing(t *testing.T) {
	var out bytes.Buffer

	if err := serve(strings.NewReader(`{"id":1,"cmd":"ping"}`+"\n"), &out); err != nil {
		t.Fatalf("serve: %v", err)
	}

	var res response
	if err := json.Unmarshal(out.Bytes(), &res); err != nil {
		t.Fatalf("decode %q: %v", out.String(), err)
	}

	if res.ID != 1 || !res.OK || res.Error != nil {
		t.Fatalf("unexpected response: %+v", res)
	}

	if _, ok := res.Result["ts"].(string); !ok {
		t.Fatalf("missing ts in %+v", res.Result)
	}
}

func TestServeRejectsUnknownCommand(t *testing.T) {
	var out bytes.Buffer

	if err := serve(strings.NewReader(`{"id":2,"cmd":"reboot"}`+"\n"), &out); err != nil {
		t.Fatalf("serve: %v", err)
	}

	var res response
	if err := json.Unmarshal(out.Bytes(), &res); err != nil {
		t.Fatalf("decode %q: %v", out.String(), err)
	}

	if res.ID != 2 || res.OK || res.Error == nil || res.Error.Code != "unknown_command" {
		t.Fatalf("unexpected response: %+v", res)
	}
}

func TestServeRejectsInvalidJSON(t *testing.T) {
	var out bytes.Buffer

	if err := serve(strings.NewReader("not json\n"), &out); err != nil {
		t.Fatalf("serve: %v", err)
	}

	var res response
	if err := json.Unmarshal(out.Bytes(), &res); err != nil {
		t.Fatalf("decode %q: %v", out.String(), err)
	}

	if res.OK || res.Error == nil || res.Error.Code != "invalid_request" {
		t.Fatalf("unexpected response: %+v", res)
	}
}
