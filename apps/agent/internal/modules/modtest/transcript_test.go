package modtest

import (
	"strings"
	"testing"
)

func TestATranscriptLineIsCheckedAgainstTheDefinitionOfItsCommand(t *testing.T) {
	commands := map[int64]string{1: "ping", 2: "fs.stat", 3: "nothing.typed"}

	cases := map[string]struct {
		line      string
		violation string
	}{
		"a result that matches":            {line: `{"id":1,"ok":true,"result":{"ts":"2026-09-25T00:00:00Z"}}`},
		"a refusal carries no result":      {line: `{"id":3,"ok":false,"error":{"code":"bad_request","message":"no"}}`},
		"a result that breaks its command": {line: `{"id":1,"ok":true,"result":{}}`, violation: "PingResult"},
		"a file command is checked too":    {line: `{"id":2,"ok":true,"result":{}}`, violation: "FsStatResult"},
		"a command without a definition":   {line: `{"id":3,"ok":true,"result":{}}`, violation: "NothingTypedResult"},
		"an answer nobody asked for":       {line: `{"id":4,"ok":true,"result":{}}`, violation: "no request"},
		"a typed event":                    {line: `{"id":1,"event":"log","line":"up"}`},
		"an event that breaks its type":    {line: `{"id":1,"event":"log"}`, violation: "LogEvent"},
		"an event without a definition":    {line: `{"id":1,"event":"progress","pct":10}`, violation: "ProgressEvent"},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			err := contractViolation(tc.line, commands)

			if tc.violation == "" {
				if err != nil {
					t.Fatalf("unexpected violation: %v", err)
				}
				return
			}

			if err == nil || !strings.Contains(err.Error(), tc.violation) {
				t.Fatalf("violation = %v, want one naming %s", err, tc.violation)
			}
		})
	}
}
