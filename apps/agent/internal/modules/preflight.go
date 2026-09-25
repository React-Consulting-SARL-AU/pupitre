package modules

import (
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/sys/net"
)

// The installed module's own port is not taken: a change to any other field keeps it.
func PortTaken(ctx *Context, key string) *contract.FieldProblem {
	port := ctx.Int(key)
	if port <= 0 || port == asInt(ctx.Held(key)) || !net.Listening(ctx).Has(port) {
		return nil
	}

	return &contract.FieldProblem{
		Module:   ctx.Module(),
		Field:    key,
		Code:     contract.ProblemFormat,
		Expected: contract.FormatPort,
		Message:  i18n.T("field.port.taken", strconv.Itoa(port)),
	}
}

// A path that exists but is not a directory: nothing could be cloned into it.
func DirectoryOccupied(ctx *Context, key string) *contract.FieldProblem {
	path := strings.TrimSpace(ctx.String(key))
	if path == "" {
		return nil
	}

	entries, err := ctx.Sys().ReadDir(path)
	if err == nil || len(entries) > 0 {
		return nil
	}

	if exists, _ := ctx.Sys().Exists(path); !exists {
		return nil
	}

	return &contract.FieldProblem{
		Module:   ctx.Module(),
		Field:    key,
		Code:     contract.ProblemFormat,
		Expected: contract.FormatPath,
		Message:  i18n.T("field.path.occupied", path),
	}
}

const zoneinfo = "/usr/share/zoneinfo/"

func TimezoneUnknown(ctx *Context, key string) *contract.FieldProblem {
	zone := strings.TrimSpace(ctx.String(key))
	if zone == "" {
		return nil
	}

	if exists, err := ctx.Sys().Exists(zoneinfo + zone); err != nil || exists {
		return nil
	}

	return &contract.FieldProblem{
		Module:   ctx.Module(),
		Field:    key,
		Code:     contract.ProblemFormat,
		Expected: contract.FormatTimezone,
		Message:  i18n.T("field.timezone.unknown", zone),
	}
}

func Problems(found ...*contract.FieldProblem) []contract.FieldProblem {
	problems := []contract.FieldProblem{}

	for _, one := range found {
		if one != nil {
			problems = append(problems, *one)
		}
	}

	return problems
}
