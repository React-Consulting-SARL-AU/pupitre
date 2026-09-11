package protocol

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"sync"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/i18n"
)

type Options struct {
	AgentVersion string
	Entitlement  func() entitlement.State
	// Config says where the configuration on the machine stands against this
	// binary. Nil is a server with no ledger to consult — a test, a direct
	// call — and its commands are gated by the entitlement alone.
	Config func() contract.ConfigRevision
	Now    func() time.Time
}

type Server struct {
	options  Options
	handlers map[string]Handler
}

func NewServer(options Options) *Server {
	if options.Now == nil {
		options.Now = time.Now
	}

	server := &Server{options: options, handlers: map[string]Handler{}}
	server.Register("hello", server.hello)
	server.Register("ping", server.ping)

	return server
}

func (s *Server) Register(cmd string, handler Handler) {
	if _, ok := contract.Definition(contract.ParamsDefinition(cmd)); !ok {
		panic(fmt.Sprintf("protocol: %q is not a command of the contract", cmd))
	}

	if _, exists := s.handlers[cmd]; exists {
		panic(fmt.Sprintf("protocol: %q is already registered", cmd))
	}

	s.handlers[cmd] = handler
}

// A session is long-lived: the entitlement is asked again for every command, so a platform back after a week reopens the agent without a reconnection.
func (s *Server) Entitlement() entitlement.State {
	if s.options.Entitlement == nil {
		return entitlement.State{Entitlement: contract.EntitlementDev, Enrolled: true}
	}

	return s.options.Entitlement()
}

// Config is asked again for every command, like the entitlement: a migration
// that goes through mid-session reopens the agent without a reconnection.
func (s *Server) Config() contract.ConfigRevision {
	if s.options.Config == nil {
		return contract.ConfigRevision{State: contract.ConfigCurrent}
	}

	return s.options.Config()
}

func (s *Server) gate(cmd string) (contract.ConfigRevision, bool) {
	config := s.Config()

	return config, !(config.Current() || allowedWhileMigrating(cmd))
}

func (s *Server) Capabilities() []string {
	capabilities := make([]string, 0, len(s.handlers))
	for cmd := range s.handlers {
		capabilities = append(capabilities, cmd)
	}
	sort.Strings(capabilities)

	return capabilities
}

// One command, without a session: this is the door pupitred dev enters by, so a
// human on a terminal runs the very handler the app reaches over SSH, with the
// same validation and the same refusals.
func (s *Server) Call(cmd string, params any, emit func(event string, fields map[string]any)) (any, error) {
	handler, known := s.handlers[cmd]
	if !known {
		return nil, unknownCommand(cmd)
	}

	if !s.Entitlement().Allows(cmd) {
		return nil, EntitlementRequired()
	}

	if config, gated := s.gate(cmd); gated {
		return nil, migrationRequired(config)
	}

	if params == nil {
		params = map[string]any{}
	}

	raw, err := json.Marshal(params)
	if err != nil {
		return nil, badRequest(i18n.T("protocol.params.unreadable", err.Error()))
	}

	value, err := contract.Decode(raw)
	if err != nil {
		return nil, badRequest(i18n.T("protocol.params.unreadable", err.Error()))
	}

	if err := contract.Validate(contract.ParamsDefinition(cmd), value); err != nil {
		return nil, badRequest(i18n.T("protocol.params.invalid", "params"+err.Error()))
	}

	result, failure := call(handler, &Context{sink: sink(emit)}, raw)
	if failure != nil {
		return nil, failure
	}

	return result, nil
}

func sink(emit func(event string, fields map[string]any)) func(map[string]any) {
	if emit == nil {
		return nil
	}

	return func(line map[string]any) {
		event, _ := line["event"].(string)
		delete(line, "event")
		delete(line, "id")

		emit(event, line)
	}
}

func (s *Server) Serve(in io.Reader, out io.Writer) error {
	current := &session{server: s, out: out, lastID: -1, in: bufio.NewReader(in)}

	for {
		line, err := current.nextLine()

		if len(bytes.TrimSpace(line)) > 0 {
			if handleErr := current.handle(line); handleErr != nil {
				return handleErr
			}
		}

		if err == nil || current.pushback != nil {
			continue
		}

		if err == io.EOF {
			return nil
		}

		return err
	}
}

type session struct {
	server   *Server
	out      io.Writer
	in       *bufio.Reader
	pushback []byte
	lastID   int64
	greeted  bool

	writeMu  sync.Mutex
	writeErr error
}

func (s *session) handle(line []byte) error {
	value, err := contract.Decode(line)
	object, isObject := value.(map[string]any)
	if err != nil || !isObject {
		s.fail(0, badRequest(i18n.T("protocol.request.unreadable")))
		return s.writeErr
	}

	id, ok := requestID(object["id"])
	if !ok {
		s.fail(0, badRequest(i18n.T("protocol.id.invalid")))
		return s.writeErr
	}

	if id <= s.lastID {
		s.fail(id, badRequest(i18n.T("protocol.id.not_increasing", id, s.lastID)))
		return s.writeErr
	}
	s.lastID = id

	if err := contract.Validate("Request", value); err != nil {
		s.fail(id, badRequest(i18n.T("protocol.request.invalid", err.Error())))
		return s.writeErr
	}

	cmd := object["cmd"].(string)
	params, hasParams := object["params"]
	if !hasParams {
		params = map[string]any{}
	}

	if result, err := s.dispatch(id, cmd, params, line); err != nil {
		s.fail(id, err)
	} else {
		s.write(successResponse{ID: id, OK: true, Result: result})
	}

	return s.writeErr
}

func (s *session) dispatch(id int64, cmd string, params any, line []byte) (any, *Error) {
	if !s.greeted && cmd != "hello" {
		return nil, helloRequired()
	}

	handler, known := s.server.handlers[cmd]
	if !known {
		return nil, unknownCommand(cmd)
	}

	if !s.server.Entitlement().Allows(cmd) {
		return nil, EntitlementRequired()
	}

	if config, gated := s.server.gate(cmd); gated {
		return nil, migrationRequired(config)
	}

	if err := contract.Validate(contract.ParamsDefinition(cmd), params); err != nil {
		return nil, badRequest(i18n.T("protocol.params.invalid", "params"+err.Error()))
	}

	ctx := &Context{ID: id, session: s, sink: func(line map[string]any) { s.write(line) }}

	if wantsSecrets(params) {
		secrets, err := s.readSecrets()
		if err != nil {
			return nil, err
		}
		ctx.Secrets = secrets
	}

	return call(handler, ctx, rawParams(line))
}

func call(handler Handler, ctx *Context, params json.RawMessage) (result any, failure *Error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			result, failure = nil, internalError(fmt.Sprint(recovered))
		}
	}()

	result, err := handler(ctx, params)
	if err == nil {
		return result, nil
	}

	if protocolErr, ok := err.(*Error); ok {
		return nil, protocolErr
	}

	return nil, internalError(err.Error())
}

// The line that follows a request carrying secrets_stdin, on the very stream the
// request came in on: ssh forwards descriptors 0, 1 and 2 and nothing else.
func (s *session) readSecrets() (json.RawMessage, *Error) {
	for {
		raw, err := s.nextLine()
		line := bytes.TrimSpace(raw)

		if len(line) > 0 {
			return s.decodeSecretLine(line)
		}

		if err != nil {
			return nil, missingSecrets(i18n.T("protocol.secrets.stdin_closed"))
		}
	}
}

// A request in place of the secret line is handed back to the loop rather than
// eaten: a client that forgot its secrets still gets an answer to what follows.
func (s *session) decodeSecretLine(line []byte) (json.RawMessage, *Error) {
	value, err := contract.Decode(line)
	if _, isObject := value.(map[string]any); err != nil || !isObject {
		return nil, badRequest(i18n.T("protocol.secrets.unreadable")).WithFix(secretsFix())
	}

	if contract.Validate("Request", value) == nil {
		s.pushback = line

		return nil, missingSecrets(i18n.T("protocol.secrets.next_is_request"))
	}

	return json.RawMessage(line), nil
}

func (s *session) nextLine() ([]byte, error) {
	if s.pushback != nil {
		line := s.pushback
		s.pushback = nil

		return line, nil
	}

	return s.in.ReadBytes('\n')
}

func (s *session) fail(id int64, failure *Error) {
	s.write(failureResponse{ID: id, OK: false, Error: failure})
}

func (s *session) write(line any) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	if s.writeErr != nil {
		return
	}

	encoder := json.NewEncoder(s.out)
	encoder.SetEscapeHTML(false)
	s.writeErr = encoder.Encode(line)
}

func requestID(value any) (int64, bool) {
	number, ok := value.(json.Number)
	if !ok {
		return 0, false
	}

	id, err := number.Int64()
	if err != nil || id < 0 {
		return 0, false
	}

	return id, true
}

func wantsSecrets(params any) bool {
	object, ok := params.(map[string]any)
	if !ok {
		return false
	}

	flag, ok := object["secrets_stdin"].(bool)

	return ok && flag
}

func rawParams(line []byte) json.RawMessage {
	var envelope struct {
		Params json.RawMessage `json:"params"`
	}

	if err := json.Unmarshal(line, &envelope); err != nil || len(envelope.Params) == 0 {
		return json.RawMessage("{}")
	}

	return envelope.Params
}
