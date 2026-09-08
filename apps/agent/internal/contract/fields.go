package contract

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"pupitre.studio/agent/internal/i18n"
)

// The problem codes, in the order the shared contract declares them.
const (
	ProblemRequired   = "required"
	ProblemType       = "type"
	ProblemMin        = "min"
	ProblemMax        = "max"
	ProblemMinLength  = "min_length"
	ProblemMaxLength  = "max_length"
	ProblemOptions    = "options"
	ProblemFormat     = "format"
	ProblemPattern    = "pattern"
	ProblemConnection = "connection"
)

// FieldProblem is what a configuration gets wrong. Field is empty when the problem is the module's own — a connection nobody has given.
type FieldProblem struct {
	Module   string `json:"module"`
	Field    string `json:"field"`
	Code     string `json:"code"`
	Expected string `json:"expected,omitempty"`
	Message  string `json:"message,omitempty"`
}

const (
	portMin = 1
	portMax = 65535
)

var formatPatterns = loadFormats()

func loadFormats() map[string]*regexp.Regexp {
	raw, ok := Definition("FieldFormats")
	if !ok {
		panic("contract: schema.json has no FieldFormats definition")
	}

	var exported struct {
		Const map[string]string `json:"const"`
	}
	if err := json.Unmarshal(raw, &exported); err != nil {
		panic("contract: FieldFormats definition is unreadable: " + err.Error())
	}

	compiled := make(map[string]*regexp.Regexp, len(exported.Const))
	for name, pattern := range exported.Const {
		expression, err := regexp.Compile(pattern)
		if err != nil {
			panic("contract: format " + name + " is not a valid expression: " + err.Error())
		}

		compiled[name] = expression
	}

	return compiled
}

var patternCache sync.Map

func compiled(pattern string) (*regexp.Regexp, error) {
	if held, ok := patternCache.Load(pattern); ok {
		expression, _ := held.(*regexp.Regexp)

		return expression, nil
	}

	expression, err := regexp.Compile(pattern)
	if err != nil {
		return nil, err
	}

	patternCache.Store(pattern, expression)

	return expression, nil
}

// A hostname or a domain is compared in lower case: a zone is not two zones.
func Normalize(format, value string) string {
	trimmed := strings.TrimSpace(value)

	switch format {
	case FormatDomain, FormatHostname, FormatEmail:
		return strings.ToLower(trimmed)
	}

	return trimmed
}

func MatchesFormat(format, value string) bool {
	expression, ok := formatPatterns[format]
	if !ok {
		return true
	}

	candidate := Normalize(format, value)
	if !expression.MatchString(candidate) {
		return false
	}

	if format != FormatPort {
		return true
	}

	port, err := strconv.Atoi(candidate)

	return err == nil && port >= portMin && port <= portMax
}

func problemOf(module, key, code, expected string) *FieldProblem {
	return &FieldProblem{
		Module:   module,
		Field:    key,
		Code:     code,
		Expected: expected,
		Message:  problemMessage(code, expected),
	}
}

func problemMessage(code, expected string) string {
	switch code {
	case ProblemRequired:
		return i18n.T("field.problem.required")
	case ProblemType:
		return i18n.T("field.problem.type", expected)
	case ProblemMin:
		return i18n.T("field.problem.min", expected)
	case ProblemMax:
		return i18n.T("field.problem.max", expected)
	case ProblemMinLength:
		return i18n.T("field.problem.minLength", expected)
	case ProblemMaxLength:
		return i18n.T("field.problem.maxLength", expected)
	case ProblemOptions:
		return i18n.T("field.problem.options", expected)
	case ProblemFormat:
		return i18n.T("field.problem.format."+expected, expected)
	case ProblemPattern:
		return i18n.T("field.problem.pattern")
	case ProblemConnection:
		return i18n.T("field.problem.connection", expected)
	}

	return code
}

func blank(value any) bool {
	if value == nil {
		return true
	}

	return strings.TrimSpace(stringOf(value)) == ""
}

func stringOf(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	case float64:
		if typed == float64(int64(typed)) {
			return strconv.FormatInt(int64(typed), 10)
		}

		return strconv.FormatFloat(typed, 'f', -1, 64)
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case bool:
		return strconv.FormatBool(typed)
	case nil:
		return ""
	}

	return fmt.Sprint(value)
}

// The whole numbers a number field accepts, and nothing else: a boolean is not a port, and neither is 5432.5.
func integerOf(value any) (int, bool) {
	switch typed := value.(type) {
	case bool:
		return 0, false
	case int:
		return typed, true
	case int64:
		return int(typed), true
	case float64:
		if typed != float64(int64(typed)) {
			return 0, false
		}

		return int(typed), true
	case json.Number:
		parsed, err := typed.Int64()

		return int(parsed), err == nil
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		if err != nil || parsed != float64(int64(parsed)) {
			return 0, false
		}

		return int(parsed), true
	}

	return 0, false
}

// A zero bound is an absent bound, exactly as the manifest serialises it: what the app reads and what the agent checks are the same two numbers.
func bounds(min, max int) string {
	if min != 0 && max != 0 {
		return strconv.Itoa(min) + "–" + strconv.Itoa(max)
	}

	if min != 0 {
		return strconv.Itoa(min)
	}

	return strconv.Itoa(max)
}

func textProblem(module string, field Field, raw string) *FieldProblem {
	if field.MinLength > 0 && len([]rune(raw)) < field.MinLength {
		return problemOf(module, field.Key, ProblemMinLength, strconv.Itoa(field.MinLength))
	}

	if field.MaxLength > 0 && len([]rune(raw)) > field.MaxLength {
		return problemOf(module, field.Key, ProblemMaxLength, strconv.Itoa(field.MaxLength))
	}

	if field.Format != "" && !MatchesFormat(field.Format, raw) {
		return problemOf(module, field.Key, ProblemFormat, field.Format)
	}

	if field.Pattern != "" {
		expression, err := compiled(field.Pattern)
		if err != nil || !expression.MatchString(strings.TrimSpace(raw)) {
			return problemOf(module, field.Key, ProblemPattern, field.Pattern)
		}
	}

	return nil
}

func optionProblem(module string, field Field, value any) *FieldProblem {
	if len(field.Options) == 0 {
		return nil
	}

	candidate := stringOf(value)
	for _, option := range field.Options {
		if option == candidate {
			return nil
		}
	}

	return problemOf(module, field.Key, ProblemOptions, strings.Join(field.Options, ", "))
}

func numberProblem(module string, field Field, value any) *FieldProblem {
	parsed, ok := integerOf(value)
	if !ok {
		return problemOf(module, field.Key, ProblemType, "number")
	}

	if field.Min != 0 && parsed < field.Min {
		return problemOf(module, field.Key, ProblemMin, bounds(field.Min, field.Max))
	}

	if field.Max != 0 && parsed > field.Max {
		return problemOf(module, field.Key, ProblemMax, bounds(field.Min, field.Max))
	}

	return textProblem(module, field, strconv.Itoa(parsed))
}

func listProblem(module string, field Field, value any, held SecretsHeld) *FieldProblem {
	least := field.Min
	if field.Required && least < 1 {
		least = 1
	}

	var items []string

	if field.Items == ItemsSecret {
		items = make([]string, held(module, field.Key))
	} else if declared, ok := value.([]any); ok {
		for _, item := range declared {
			if text := strings.TrimSpace(stringOf(item)); text != "" {
				items = append(items, text)
			}
		}
	}

	if len(items) < least {
		return problemOf(module, field.Key, ProblemRequired, strconv.Itoa(least))
	}

	if field.Max > 0 && len(items) > field.Max {
		return problemOf(module, field.Key, ProblemMax, strconv.Itoa(field.Max))
	}

	if field.Items == ItemsSecret {
		return nil
	}

	for _, item := range items {
		if wrong := textProblem(module, field, item); wrong != nil {
			return wrong
		}
	}

	return nil
}

// SecretsHeld says how many values are held for a secret field: 0, 1, or the length of a list.
type SecretsHeld func(module, key string) int

// ValidateField weighs one field against one value, by the rules the app applies to the same pair.
func ValidateField(module string, field Field, value any, held SecretsHeld) *FieldProblem {
	switch field.Kind {
	case FieldVersion:
		return optionProblem(module, field, value)
	case FieldBoolean:
		if value == nil {
			return nil
		}

		if _, ok := value.(bool); !ok {
			return problemOf(module, field.Key, ProblemType, "boolean")
		}

		return nil
	case FieldSecret:
		if field.Required && held(module, field.Key) == 0 {
			return problemOf(module, field.Key, ProblemRequired, "")
		}

		return nil
	case FieldList:
		return listProblem(module, field, value, held)
	}

	if blank(value) {
		if field.Required {
			return problemOf(module, field.Key, ProblemRequired, "")
		}

		return nil
	}

	switch field.Kind {
	case FieldSelect:
		return optionProblem(module, field, value)
	case FieldNumber:
		return numberProblem(module, field, value)
	}

	return textProblem(module, field, strings.TrimSpace(stringOf(value)))
}

// Resolved is the value a module will actually read: what was sent, and the manifest's own default when nothing was.
func Resolved(field Field, values map[string]any) any {
	if value, sent := values[field.Key]; sent && value != nil {
		return value
	}

	return field.Default
}

// ValidateModule weighs a whole module, every field against the value it will be configured with.
func ValidateModule(manifest Manifest, values map[string]any, held SecretsHeld) []FieldProblem {
	problems := []FieldProblem{}

	for _, field := range manifest.Fields {
		if wrong := ValidateField(manifest.ID, field, Resolved(field, values), held); wrong != nil {
			problems = append(problems, *wrong)
		}
	}

	return problems
}
