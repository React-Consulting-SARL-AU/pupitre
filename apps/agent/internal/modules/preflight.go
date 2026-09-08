package modules

import (
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/sys/net"
)

/*
What a module can only learn by looking at the machine.

The shape of a value is settled by the contract, which the app applies to the
same value before it leaves. What is left is the state of this server: a port
another program already holds, a directory that turns out to be a file, a time
zone this kernel never heard of. A module answers these here, in a pass that
changes nothing, and the app marks the field rather than failing on step four.
*/

// PortTaken names a port field whose value another program already listens on. The remedy carries a free port so the screen can offer it.
func PortTaken(ctx *Context, key string) *contract.FieldProblem {
	port := ctx.Int(key)
	if port <= 0 || !net.Listening(ctx).Has(port) {
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

// DirectoryOccupied names a path field whose value exists and is not a directory: nothing would be cloned into it.
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

// The zone database of this machine, which is the only one that decides.
const zoneinfo = "/usr/share/zoneinfo/"

// TimezoneUnknown names a time zone field this kernel's zone database has never heard of.
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

// Problems gathers what the checks above found, dropping the ones that found nothing.
func Problems(found ...*contract.FieldProblem) []contract.FieldProblem {
	problems := []contract.FieldProblem{}

	for _, one := range found {
		if one != nil {
			problems = append(problems, *one)
		}
	}

	return problems
}
