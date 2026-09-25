package devcli

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
)

type Caller interface {
	Call(cmd string, params any, emit func(event string, fields map[string]any)) (any, error)
}

type Pipe struct {
	In   io.WriteCloser
	Out  io.Reader
	Wait func() error
}

type Launch func(argv []string) (Pipe, error)

// A command the contract keeps for --privileged opens a second session, whose password sudo asks on the terminal.
type Remote struct {
	Sudo    string
	Version string
	Launch  Launch

	sessions map[bool]*remoteSession
}

type remoteSession struct {
	pipe Pipe
	out  *bufio.Reader
	next int64
}

func (r *Remote) Call(cmd string, params any, emit func(event string, fields map[string]any)) (any, error) {
	if params == nil {
		params = map[string]any{}
	}

	session, err := r.session(contract.RequiresPrivilege(cmd, params))
	if err != nil {
		return nil, err
	}

	return session.call(cmd, params, emit)
}

func (r *Remote) Close() {
	for _, session := range r.sessions {
		session.pipe.In.Close()

		if session.pipe.Wait != nil {
			_ = session.pipe.Wait()
		}
	}

	r.sessions = nil
}

func (r *Remote) session(privileged bool) (*remoteSession, error) {
	if held, found := r.sessions[privileged]; found {
		return held, nil
	}

	argv := []string{r.Sudo, "-n", Binary, "serve"}
	if privileged {
		argv = []string{r.Sudo, Binary, "serve", "--privileged"}
	}

	pipe, err := r.Launch(argv)
	if err != nil {
		return nil, unopened(privileged)
	}

	opened := &remoteSession{pipe: pipe, out: bufio.NewReader(pipe.Out)}

	hello := map[string]any{"app_version": r.Version, "protocol": contract.ProtocolVersion, "locale": i18n.Current()}
	if _, err := opened.call("hello", hello, nil); err != nil {
		pipe.In.Close()

		var refusal *protocol.Error
		if errors.As(err, &refusal) && refusal.Code == contract.ErrorProtocolMismatch {
			return nil, refusal
		}

		return nil, unopened(privileged)
	}

	if r.sessions == nil {
		r.sessions = map[bool]*remoteSession{}
	}

	r.sessions[privileged] = opened

	return opened, nil
}

func (s *remoteSession) call(cmd string, params any, emit func(event string, fields map[string]any)) (any, error) {
	s.next++

	request, err := json.Marshal(map[string]any{"id": s.next, "cmd": cmd, "params": params})
	if err != nil {
		return nil, err
	}

	if _, err := s.pipe.In.Write(append(request, '\n')); err != nil {
		return nil, lost(err)
	}

	for {
		line, err := s.out.ReadBytes('\n')

		if answer, done, failure := s.take(line, emit); done {
			return answer, failure
		}

		if err != nil {
			return nil, lost(err)
		}
	}
}

func (s *remoteSession) take(line []byte, emit func(event string, fields map[string]any)) (any, bool, error) {
	var fields map[string]any
	if json.Unmarshal(bytes.TrimSpace(line), &fields) != nil {
		return nil, false, nil
	}

	if id, _ := fields["id"].(float64); int64(id) != s.next {
		return nil, false, nil
	}

	if event, isEvent := fields["event"].(string); isEvent {
		if emit != nil {
			delete(fields, "id")
			delete(fields, "event")
			emit(event, fields)
		}

		return nil, false, nil
	}

	var response struct {
		OK     bool            `json:"ok"`
		Result json.RawMessage `json:"result"`
		Error  *protocol.Error `json:"error"`
	}

	if err := json.Unmarshal(line, &response); err != nil {
		return nil, true, lost(err)
	}

	if !response.OK {
		if response.Error == nil {
			return nil, true, lost(errors.New("a failure without its error"))
		}

		return nil, true, response.Error
	}

	return response.Result, true, nil
}

func unopened(privileged bool) error {
	if privileged {
		return protocol.NewError(contract.ErrorPrivilegeRequired, i18n.T("devcli.elevate.privileged")).
			WithFix(i18n.T("devcli.elevate.privileged.fix"))
	}

	return protocol.NewError(contract.ErrorEntitlementRequired, i18n.T("devcli.elevate.required")).
		WithFix(i18n.T("devcli.elevate.password.fix"))
}

func lost(err error) error {
	return protocol.NewError(contract.ErrorInternal, i18n.T("devcli.elevate.lost", err.Error()))
}

// Stderr stays the terminal's, so sudo's password prompt and pupitred's own errors reach the reader.
func LaunchSudo(argv []string) (Pipe, error) {
	command := exec.Command(argv[0], argv[1:]...)
	command.Stderr = os.Stderr

	in, err := command.StdinPipe()
	if err != nil {
		return Pipe{}, err
	}

	out, err := command.StdoutPipe()
	if err != nil {
		return Pipe{}, err
	}

	if err := command.Start(); err != nil {
		return Pipe{}, err
	}

	return Pipe{In: in, Out: out, Wait: command.Wait}, nil
}
