package protocol

import (
	"context"
	"encoding/json"
)

type successResponse struct {
	ID     int64 `json:"id"`
	OK     bool  `json:"ok"`
	Result any   `json:"result"`
}

type failureResponse struct {
	ID    int64  `json:"id"`
	OK    bool   `json:"ok"`
	Error *Error `json:"error"`
}

type Handler func(ctx *Context, params json.RawMessage) (any, error)

type Context struct {
	ID      int64
	Secrets json.RawMessage

	session *session
	sink    func(map[string]any)
	channel context.Context
}

// Channel is done once the session that carried the command is cut: its
// standard input closed, or a write refused. A command that must outlive the
// channel simply never asks.
func (c *Context) Channel() context.Context {
	if c.channel == nil {
		return context.Background()
	}

	return c.channel
}

func (c *Context) Emit(event string, fields map[string]any) {
	if c.sink == nil {
		return
	}

	line := make(map[string]any, len(fields)+2)
	for key, value := range fields {
		line[key] = value
	}

	line["id"] = c.ID
	line["event"] = event

	c.sink(line)
}
