//go:build staging

package staging

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
)

const hostVariable = "PUPITRE_STAGING_HOST"

type request struct {
	Cmd     string
	Params  any
	Secrets string
}

type response struct {
	OK     bool
	Result json.RawMessage
	Error  json.RawMessage
	Events []contract.StepEvent
}

// The staging host is root@<address> of a reinstallable VPS holding a freshly built pupitred; never a machine of the owner.
func stagingHost(t *testing.T) string {
	t.Helper()

	host := os.Getenv(hostVariable)
	if host == "" {
		t.Skipf("%s is not set", hostVariable)
	}

	return host
}

func address(host string) string {
	if _, addr, ok := strings.Cut(host, "@"); ok {
		return addr
	}

	return host
}

func sshCommand(host string, argv ...string) *exec.Cmd {
	args := append([]string{"-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new", host}, argv...)

	return exec.Command("ssh", args...)
}

func ssh(t *testing.T, host string, argv ...string) string {
	t.Helper()

	out, err := sshCommand(host, argv...).CombinedOutput()
	if err != nil {
		t.Fatalf("ssh %s %s: %v\n%s", host, strings.Join(argv, " "), err, out)
	}

	return string(out)
}

func reachable(host string) bool {
	return sshCommand(host, "true").Run() == nil
}

func agent(t *testing.T, host string, requests ...request) []response {
	t.Helper()

	return succeeded(t, converse(t, host, requests...), requests)
}

// The refusals are part of the contract too: this one hands back what the agent answered, failure included.
func attempt(t *testing.T, host string, requests ...request) []response {
	t.Helper()

	return converse(t, host, requests...)
}

// The secret line follows its request on the same standard input, exactly as the app writes it.
func agentWithSecrets(t *testing.T, host, secrets string, requests ...request) []response {
	t.Helper()

	if len(requests) == 0 {
		t.Fatal("agentWithSecrets needs a request to carry the secret line")
	}

	carrying := append([]request{}, requests...)
	carrying[0].Secrets = secrets

	return succeeded(t, converse(t, host, carrying...), requests)
}

func converse(t *testing.T, host string, requests ...request) []response {
	t.Helper()

	cmd := sshCommand(host, "sudo", "-n", "pupitred", "serve")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	stdin, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}

	all := append([]request{{Cmd: "hello", Params: map[string]any{"app_version": "0.0.0-staging", "protocol": contract.ProtocolVersion}}}, requests...)
	go func() {
		defer stdin.Close()
		for i, req := range all {
			// A command that takes no argument still sends an object: the agent's
			// params are a closed shape, and a bare null is not one.
			params := req.Params
			if params == nil {
				params = map[string]any{}
			}

			line, _ := json.Marshal(map[string]any{"id": i + 1, "cmd": req.Cmd, "params": params})
			fmt.Fprintf(stdin, "%s\n", line)

			if req.Secrets != "" {
				fmt.Fprintf(stdin, "%s\n", req.Secrets)
			}
		}
	}()

	responses := make([]response, len(all))
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 1<<20), 1<<20)
	for scanner.Scan() {
		var line struct {
			ID      int             `json:"id"`
			Event   string          `json:"event"`
			OK      bool            `json:"ok"`
			Result  json.RawMessage `json:"result"`
			Error   json.RawMessage `json:"error"`
			Module  string          `json:"module"`
			Step    string          `json:"step"`
			Status  string          `json:"status"`
			Message string          `json:"message"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &line); err != nil || line.ID < 1 || line.ID > len(all) {
			t.Fatalf("unreadable line from the agent: %s", scanner.Text())
		}

		current := &responses[line.ID-1]
		if line.Event == "step" {
			current.Events = append(current.Events, contract.StepEvent{Module: line.Module, Step: line.Step, Status: contract.StepStatus(line.Status), Message: line.Message})
			continue
		}

		current.OK, current.Result, current.Error = line.OK, line.Result, line.Error
	}

	if err := cmd.Wait(); err != nil {
		t.Fatalf("pupitred serve on %s: %v\n%s", host, err, stderr.String())
	}

	if !responses[0].OK {
		t.Fatalf("hello failed: %s", responses[0].Error)
	}

	return responses[1:]
}

func succeeded(t *testing.T, responses []response, requests []request) []response {
	t.Helper()

	for i, resp := range responses {
		if !resp.OK {
			t.Fatalf("%s failed: %s", requests[i].Cmd, resp.Error)
		}
	}

	return responses
}

func decode[T any](t *testing.T, raw json.RawMessage) T {
	t.Helper()

	var value T
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatalf("unreadable result %s: %v", raw, err)
	}

	return value
}

func messages(resp response) []string {
	var said []string
	for _, event := range resp.Events {
		if event.Message != "" {
			said = append(said, event.Message)
		}
	}

	return said
}

func steps(resp response, status contract.StepStatus) []string {
	var matching []string
	for _, event := range resp.Events {
		if event.Status == status {
			matching = append(matching, event.Module+"·"+event.Step)
		}
	}

	return matching
}

func timed(t *testing.T, label string, fn func()) time.Duration {
	t.Helper()

	started := time.Now()
	fn()
	elapsed := time.Since(started)
	t.Logf("%s took %s", label, elapsed.Round(time.Millisecond))

	return elapsed
}
