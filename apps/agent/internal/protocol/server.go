package protocol

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
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
	// Nil means no ledger to consult: commands are then gated by the entitlement alone.
	Config   func() contract.ConfigRevision
	ServerID func() string
	Now      func() time.Time
	// The passwordless sudo session: refuses what the contract reserves for --privileged.
	Limited bool
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

// Resolved per command so a long-lived session reopens as soon as the platform is back.
func (s *Server) Entitlement() entitlement.State {
	if s.options.Entitlement == nil {
		return entitlement.State{Entitlement: contract.EntitlementDev, Enrolled: true}
	}

	return s.options.Entitlement()
}

// Resolved per command so a migration run mid-session reopens it without a reconnection.
func (s *Server) Config() contract.ConfigRevision {
	if s.options.Config == nil {
		return contract.ConfigRevision{State: contract.ConfigCurrent}
	}

	return s.options.Config()
}

func (s *Server) privileged(cmd string, params any) *Error {
	if !s.options.Limited || !contract.RequiresPrivilege(cmd, params) {
		return nil
	}

	return NewError(contract.ErrorPrivilegeRequired, i18n.T("protocol.privilege.required", cmd)).
		WithFix(i18n.T("protocol.privilege.required.fix"))
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

// pupitred dev enters here, so a terminal gets the same handlers, validation and refusals as the app.
func (s *Server) Call(cmd string, params any, emit func(event string, fields map[string]any)) (any, error) {
	handler, known := s.handlers[cmd]
	if !known {
		return nil, unknownCommand(cmd)
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

	if refused := s.privileged(cmd, value); refused != nil {
		return nil, refused
	}

	if !s.Entitlement().Allows(cmd) {
		return nil, EntitlementRequired()
	}

	if config, gated := s.gate(cmd); gated {
		return nil, MigrationRequired(config)
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
	current := &session{server: s, out: out, lastID: -1, lines: make(chan read), closed: make(chan struct{}), broken: make(chan struct{})}
	go current.read(bufio.NewReader(in))

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
	lines    chan read
	pushback []byte
	lastID   int64
	greeted  bool

	// Closed when stdin ends or a write fails: a running follow must notice the channel is gone.
	closed chan struct{}
	broken chan struct{}

	writeMu  sync.Mutex
	writeErr error
}

type read struct {
	line []byte
	err  error
}

// Mirrors the desktop's flood cap so a peer that lost its own cannot grow this root process.
const lineLimit = 4 << 20

var errLineTooLong = errors.New("protocol: line over the limit")

// Not ReadBytes: it would gather whatever the peer sends, and this reader runs as root.
func readLine(in *bufio.Reader) ([]byte, error) {
	var line []byte

	for {
		chunk, err := in.ReadSlice('\n')
		line = append(line, chunk...)

		if len(line) > lineLimit {
			return nil, errLineTooLong
		}

		if err == bufio.ErrBufferFull {
			continue
		}

		return line, err
	}
}

// Reads one line ahead, never more, so end of input is seen even while a handler holds the loop.
func (s *session) read(in *bufio.Reader) {
	for {
		line, err := readLine(in)
		if err == errLineTooLong {
			s.fail(0, badRequest(i18n.T("protocol.line.too_long")))
		}
		if err != nil {
			close(s.closed)
		}

		s.lines <- read{line: line, err: err}

		if err != nil {
			close(s.lines)

			return
		}
	}
}

func (s *session) handle(line []byte) error {
	value, err := contract.Decode(line)
	object, isObject := value.(map[string]any)
	if err != nil || !isObject {
		s.fail(0, badRequest(i18n.T("protocol.request.unreadable")))
		return s.writeFailure()
	}

	id, ok := requestID(object["id"])
	if !ok {
		s.fail(0, badRequest(i18n.T("protocol.id.invalid")))
		return s.writeFailure()
	}

	if id <= s.lastID {
		s.fail(id, badRequest(i18n.T("protocol.id.not_increasing", id, s.lastID)))
		return s.writeFailure()
	}

	s.lastID = id

	if err := contract.Validate("Request", value); err != nil {
		s.fail(id, badRequest(i18n.T("protocol.request.invalid", err.Error())))
		return s.writeFailure()
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

	return s.writeFailure()
}

// The secrets line is consumed before any refusal: left on the input, root would read it as a request.
func (s *session) dispatch(id int64, cmd string, params any, line []byte) (any, *Error) {
	var secrets json.RawMessage
	var secretsErr *Error
	if wantsSecrets(params) {
		secrets, secretsErr = s.readSecrets()
	}

	if !s.greeted && cmd != "hello" {
		return nil, helloRequired()
	}

	handler, known := s.server.handlers[cmd]
	if !known {
		return nil, unknownCommand(cmd)
	}

	if refused := s.server.privileged(cmd, params); refused != nil {
		return nil, refused
	}

	if !s.server.Entitlement().Allows(cmd) {
		return nil, EntitlementRequired()
	}

	if config, gated := s.server.gate(cmd); gated {
		return nil, MigrationRequired(config)
	}

	if err := contract.Validate(contract.ParamsDefinition(cmd), params); err != nil {
		return nil, badRequest(i18n.T("protocol.params.invalid", "params"+err.Error()))
	}

	if secretsErr != nil {
		return nil, secretsErr
	}

	channel, release := s.channel()
	defer release()

	ctx := &Context{ID: id, Secrets: secrets, session: s, sink: func(line map[string]any) { s.write(line) }, channel: channel}

	return call(handler, ctx, rawParams(line))
}

// Only follows honour it: install, upgrade and harden run to the end even once the channel is gone.
func (s *session) channel() (context.Context, func()) {
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})

	go func() {
		select {
		case <-s.closed:
		case <-s.broken:
		case <-done:
		}

		cancel()
	}()

	return ctx, func() { close(done) }
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

// Same stream as the request: ssh forwards descriptors 0, 1 and 2 and nothing else.
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

// A request in place of the secret line goes back to the loop, so a client that forgot its secrets still gets answers.
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

	next, open := <-s.lines
	if !open {
		return nil, io.EOF
	}

	return next.line, next.err
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

	if s.writeErr != nil {
		close(s.broken)
	}
}

// The reader goroutine writes too when it refuses an oversized line.
func (s *session) writeFailure() error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	return s.writeErr
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
