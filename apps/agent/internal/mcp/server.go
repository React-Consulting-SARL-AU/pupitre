package mcp

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"slices"

	"pupitre.studio/agent/internal/i18n"
)

// Newest first: a client asking for one of these gets it back, any other gets the newest.
var ProtocolVersions = []string{"2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"}

const (
	jsonRPC = "2.0"

	// The agent protocol's own ceiling: no request a client sends here comes near it.
	maxLine = 4 << 20

	codeParse          = -32700
	codeInvalidRequest = -32600
	codeMethodNotFound = -32601
	codeInvalidParams  = -32602
)

type Content struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	Data     string `json:"data,omitempty"`
	MimeType string `json:"mimeType,omitempty"`
}

type Result struct {
	Content []Content `json:"content"`
	IsError bool      `json:"isError,omitempty"`
}

type Tool struct {
	Name        string         `json:"name"`
	Title       string         `json:"title"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
	Annotations Annotations    `json:"annotations"`

	Run func(arguments json.RawMessage) (Result, error) `json:"-"`
}

type Annotations struct {
	ReadOnly    bool `json:"readOnlyHint"`
	Destructive bool `json:"destructiveHint"`
	Idempotent  bool `json:"idempotentHint"`
	OpenWorld   bool `json:"openWorldHint"`
}

type Server struct {
	Name         string
	Version      string
	Instructions string
	Tools        []Tool
}

type message struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type reply struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// One message per line, answered in order: a tool call is short, and the client waits on it anyway.
func (s Server) Serve(in io.Reader, out io.Writer) error {
	scanner := bufio.NewScanner(in)
	scanner.Buffer(make([]byte, 0, 64*1024), maxLine)

	encoder := json.NewEncoder(out)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		answer, respond := s.handle(line)
		if !respond {
			continue
		}

		if err := encoder.Encode(answer); err != nil {
			return err
		}
	}

	if errors.Is(scanner.Err(), bufio.ErrTooLong) {
		return encoder.Encode(failure(json.RawMessage("null"), codeInvalidRequest, i18n.T("mcp.line.tooLong", maxLine)))
	}

	return scanner.Err()
}

func (s Server) handle(line []byte) (reply, bool) {
	var request message
	if err := json.Unmarshal(line, &request); err != nil {
		return failure(json.RawMessage("null"), codeParse, i18n.T("mcp.parse", err.Error())), true
	}

	notification := len(request.ID) == 0
	if request.JSONRPC != jsonRPC || request.Method == "" {
		return failure(idOf(request), codeInvalidRequest, i18n.T("mcp.request.invalid")), !notification
	}

	if notification {
		return reply{}, false
	}

	switch request.Method {
	case "initialize":
		return success(request.ID, s.initialize(request.Params)), true
	case "ping":
		return success(request.ID, struct{}{}), true
	case "tools/list":
		return success(request.ID, map[string]any{"tools": s.Tools}), true
	case "tools/call":
		return s.call(request)
	}

	return failure(request.ID, codeMethodNotFound, i18n.T("mcp.method.unknown", request.Method)), true
}

func (s Server) initialize(raw json.RawMessage) map[string]any {
	var params struct {
		ProtocolVersion string `json:"protocolVersion"`
	}

	_ = json.Unmarshal(raw, &params)

	version := ProtocolVersions[0]
	if slices.Contains(ProtocolVersions, params.ProtocolVersion) {
		version = params.ProtocolVersion
	}

	return map[string]any{
		"protocolVersion": version,
		"capabilities":    map[string]any{"tools": map[string]any{"listChanged": false}},
		"serverInfo":      map[string]any{"name": s.Name, "version": s.Version},
		"instructions":    s.Instructions,
	}
}

// A refusal from the tool is its result, read by the model; only a call that names no tool is a protocol error.
func (s Server) call(request message) (reply, bool) {
	var params struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}

	if err := json.Unmarshal(request.Params, &params); err != nil {
		return failure(request.ID, codeInvalidParams, i18n.T("mcp.params.invalid", err.Error())), true
	}

	index := slices.IndexFunc(s.Tools, func(tool Tool) bool { return tool.Name == params.Name })
	if index < 0 {
		return failure(request.ID, codeInvalidParams, i18n.T("mcp.tool.unknown", params.Name)), true
	}

	result, err := s.Tools[index].Run(params.Arguments)
	if err != nil {
		result = Refusal(err)
	}

	return success(request.ID, result), true
}

func Text(text string) Result {
	return Result{Content: []Content{{Type: "text", Text: text}}}
}

func Refusal(err error) Result {
	result := Text(describe(err))
	result.IsError = true

	return result
}

func success(id json.RawMessage, result any) reply {
	return reply{JSONRPC: jsonRPC, ID: id, Result: result}
}

func failure(id json.RawMessage, code int, message string) reply {
	return reply{JSONRPC: jsonRPC, ID: id, Error: &rpcError{Code: code, Message: message}}
}

func idOf(request message) json.RawMessage {
	if len(request.ID) == 0 {
		return json.RawMessage("null")
	}

	return request.ID
}
