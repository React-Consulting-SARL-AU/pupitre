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

	"pupitre.sh/agent/internal/contract"
	"pupitre.sh/agent/internal/entitlement"
)

type Options struct {
	AgentVersion string
	Entitlement  contract.Entitlement
	Now          func() time.Time
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

func (s *Server) Capabilities() []string {
	capabilities := make([]string, 0, len(s.handlers))
	for cmd := range s.handlers {
		capabilities = append(capabilities, cmd)
	}
	sort.Strings(capabilities)

	return capabilities
}

func (s *Server) Serve(in io.Reader, out io.Writer, secrets io.Reader) error {
	current := &session{server: s, out: out, lastID: -1}
	if secrets != nil {
		current.secrets = bufio.NewReader(secrets)
	}

	reader := bufio.NewReader(in)
	for {
		line, err := reader.ReadBytes('\n')

		if len(bytes.TrimSpace(line)) > 0 {
			if handleErr := current.handle(line); handleErr != nil {
				return handleErr
			}
		}

		if err == io.EOF {
			return nil
		}

		if err != nil {
			return err
		}
	}
}

type session struct {
	server  *Server
	out     io.Writer
	secrets *bufio.Reader
	lastID  int64
	greeted bool

	writeMu  sync.Mutex
	writeErr error
}

func (s *session) handle(line []byte) error {
	value, err := contract.Decode(line)
	object, isObject := value.(map[string]any)
	if err != nil || !isObject {
		s.fail(0, badRequest("requête illisible : un objet JSON {id, cmd, params?} par ligne est attendu"))
		return s.writeErr
	}

	id, ok := requestID(object["id"])
	if !ok {
		s.fail(0, badRequest("id manquant ou invalide : entier ≥ 0 attendu"))
		return s.writeErr
	}

	if id <= s.lastID {
		s.fail(id, badRequest(fmt.Sprintf("id %d refusé : l'id doit être strictement croissant, dernier id reçu %d", id, s.lastID)))
		return s.writeErr
	}
	s.lastID = id

	if err := contract.Validate("Request", value); err != nil {
		s.fail(id, badRequest("requête invalide : "+err.Error()))
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

	if s.server.options.Entitlement == contract.EntitlementRestricted && !entitlement.AllowedInRestrictedMode(cmd) {
		return nil, entitlementRequired()
	}

	if err := contract.Validate(contract.ParamsDefinition(cmd), params); err != nil {
		return nil, badRequest("paramètres invalides : params" + err.Error())
	}

	ctx := &Context{ID: id, session: s}

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

func (s *session) readSecrets() (json.RawMessage, *Error) {
	if s.secrets == nil {
		return nil, badRequest("secrets_stdin demandé mais aucun flux secret ouvert").
			WithFix("Ouvre le descripteur 3 avant de lancer pupitred serve et écris-y les secrets en JSON sur une ligne.")
	}

	line, err := s.secrets.ReadBytes('\n')
	line = bytes.TrimSpace(line)
	if len(line) == 0 && err != nil {
		return nil, badRequest("flux secret fermé avant l'envoi des secrets")
	}

	value, decodeErr := contract.Decode(line)
	if _, isObject := value.(map[string]any); decodeErr != nil || !isObject {
		return nil, badRequest("flux secret illisible : un objet JSON sur une ligne est attendu")
	}

	return json.RawMessage(line), nil
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
