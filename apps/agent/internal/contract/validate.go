package contract

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"sync"

	"pupitre.studio/agent/internal/i18n"
)

type ValidationError struct {
	Path   string
	Reason string

	typeMismatch bool
}

func (e *ValidationError) Error() string {
	if e.Path == "" {
		return e.Reason
	}

	return i18n.T("validate.path.reason", e.Path, e.Reason)
}

type schema struct {
	Ref                  string             `json:"$ref"`
	Type                 typeSet            `json:"type"`
	Properties           map[string]*schema `json:"properties"`
	Required             []string           `json:"required"`
	AdditionalProperties *schemaOrBool      `json:"additionalProperties"`
	PropertyNames        *schema            `json:"propertyNames"`
	Enum                 []json.RawMessage  `json:"enum"`
	Const                json.RawMessage    `json:"const"`
	AnyOf                []*schema          `json:"anyOf"`
	OneOf                []*schema          `json:"oneOf"`
	Items                *schemaOrBool      `json:"items"`
	PrefixItems          []*schema          `json:"prefixItems"`
	Minimum              *float64           `json:"minimum"`
	ExclusiveMinimum     *float64           `json:"exclusiveMinimum"`
	Maximum              *float64           `json:"maximum"`
	MinLength            *int               `json:"minLength"`
	Pattern              string             `json:"pattern"`
	MinItems             *int               `json:"minItems"`
	MaxItems             *int               `json:"maxItems"`

	propertyOrder []string
}

func (s *schema) UnmarshalJSON(data []byte) error {
	type alias schema

	var raw alias
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	*s = schema(raw)

	order, err := propertyKeyOrder(data)
	if err != nil {
		return err
	}

	s.propertyOrder = order

	return nil
}

func propertyKeyOrder(data []byte) ([]string, error) {
	var envelope struct {
		Properties json.RawMessage `json:"properties"`
	}

	if err := json.Unmarshal(data, &envelope); err != nil {
		return nil, err
	}

	if len(envelope.Properties) == 0 {
		return nil, nil
	}

	decoder := json.NewDecoder(bytes.NewReader(envelope.Properties))

	open, err := decoder.Token()
	if err != nil {
		return nil, err
	}

	if delim, ok := open.(json.Delim); !ok || delim != '{' {
		return nil, nil
	}

	var order []string

	for decoder.More() {
		key, err := decoder.Token()
		if err != nil {
			return nil, err
		}

		order = append(order, key.(string))

		if err := skipValue(decoder); err != nil {
			return nil, err
		}
	}

	return order, nil
}

func skipValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}

	delim, ok := token.(json.Delim)
	if !ok || (delim != '{' && delim != '[') {
		return nil
	}

	depth := 1

	for depth > 0 {
		inner, err := decoder.Token()
		if err != nil {
			return err
		}

		if d, ok := inner.(json.Delim); ok {
			if d == '{' || d == '[' {
				depth++
			} else {
				depth--
			}
		}
	}

	return nil
}

type typeSet []string

func (t *typeSet) UnmarshalJSON(data []byte) error {
	var single string
	if err := json.Unmarshal(data, &single); err == nil {
		*t = typeSet{single}
		return nil
	}

	var many []string
	if err := json.Unmarshal(data, &many); err != nil {
		return err
	}

	*t = typeSet(many)

	return nil
}

type schemaOrBool struct {
	allowed bool
	schema  *schema
}

func (s *schemaOrBool) UnmarshalJSON(data []byte) error {
	var allowed bool
	if err := json.Unmarshal(data, &allowed); err == nil {
		s.allowed = allowed
		return nil
	}

	s.allowed = true
	s.schema = &schema{}

	return json.Unmarshal(data, s.schema)
}

var (
	compiledDefinitions sync.Map
	compiledPatterns    sync.Map
)

func Decode(data []byte) (any, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()

	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}

	if decoder.More() {
		return nil, errors.New(i18n.T("validate.trailing_data"))
	}

	return value, nil
}

func Validate(definition string, value any) error {
	compiled, err := definitionSchema(definition)
	if err != nil {
		return err
	}

	return validate(compiled, value, "")
}

func definitionSchema(name string) (*schema, error) {
	if cached, ok := compiledDefinitions.Load(name); ok {
		return cached.(*schema), nil
	}

	raw, ok := Definition(name)
	if !ok {
		return nil, &ValidationError{Reason: i18n.T("validate.definition.unknown", name)}
	}

	var compiled schema
	if err := json.Unmarshal(raw, &compiled); err != nil {
		return nil, fmt.Errorf("contract: definition %s: %w", name, err)
	}

	compiledDefinitions.Store(name, &compiled)

	return &compiled, nil
}

func validate(s *schema, value any, path string) error {
	if s.Ref != "" {
		name, ok := strings.CutPrefix(s.Ref, "#/$defs/")
		if !ok {
			return &ValidationError{Path: path, Reason: i18n.T("validate.ref.unsupported", s.Ref)}
		}

		target, err := definitionSchema(name)
		if err != nil {
			return err
		}

		return validate(target, value, path)
	}

	if len(s.Type) > 0 && !matchesAnyType(s.Type, value) {
		return &ValidationError{Path: path, Reason: i18n.T("validate.type", describeTypes(s.Type)), typeMismatch: true}
	}

	if s.Const != nil {
		if err := checkConst(s.Const, value, path); err != nil {
			return err
		}
	}

	if len(s.Enum) > 0 {
		if err := checkEnum(s.Enum, value, path); err != nil {
			return err
		}
	}

	if len(s.AnyOf) > 0 {
		if err := checkAnyOf(s.AnyOf, value, path); err != nil {
			return err
		}
	}

	if len(s.OneOf) > 0 {
		if err := checkOneOf(s.OneOf, value, path); err != nil {
			return err
		}
	}

	switch v := value.(type) {
	case map[string]any:
		return validateObject(s, v, path)
	case []any:
		return validateArray(s, v, path)
	case string:
		return validateString(s, v, path)
	case json.Number:
		return validateNumber(s, v, path)
	}

	return nil
}

func describeTypes(types []string) string {
	names := make([]string, len(types))

	for i, t := range types {
		names[i] = typeLabel(t)
	}

	return strings.Join(names, " "+i18n.T("validate.type.or")+" ")
}

func typeLabel(t string) string {
	switch t {
	case "object", "array", "string", "boolean", "number", "integer", "null":
		return i18n.T("validate.type." + t)
	}

	return t
}

func matchesAnyType(types []string, value any) bool {
	for _, t := range types {
		if matchesType(t, value) {
			return true
		}
	}

	return false
}

func matchesType(t string, value any) bool {
	switch t {
	case "object":
		_, ok := value.(map[string]any)
		return ok
	case "array":
		_, ok := value.([]any)
		return ok
	case "string":
		_, ok := value.(string)
		return ok
	case "boolean":
		_, ok := value.(bool)
		return ok
	case "null":
		return value == nil
	case "number":
		_, ok := value.(json.Number)
		return ok
	case "integer":
		number, ok := value.(json.Number)
		return ok && isInteger(number)
	}

	return false
}

func isInteger(number json.Number) bool {
	if _, err := number.Int64(); err == nil {
		return true
	}

	f, err := number.Float64()

	return err == nil && !math.IsInf(f, 0) && f == math.Trunc(f)
}

func checkConst(raw json.RawMessage, value any, path string) error {
	expected, err := Decode(raw)
	if err != nil {
		return err
	}

	if !reflect.DeepEqual(expected, value) {
		return &ValidationError{Path: path, Reason: i18n.T("validate.const", string(raw))}
	}

	return nil
}

func checkEnum(raws []json.RawMessage, value any, path string) error {
	labels := make([]string, 0, len(raws))

	for _, raw := range raws {
		expected, err := Decode(raw)
		if err != nil {
			return err
		}

		if reflect.DeepEqual(expected, value) {
			return nil
		}

		labels = append(labels, strings.Trim(string(raw), `"`))
	}

	return &ValidationError{Path: path, Reason: i18n.T("validate.enum", strings.Join(labels, ", "))}
}

func checkAnyOf(branches []*schema, value any, path string) error {
	var failures []error

	for _, branch := range branches {
		err := validate(branch, value, path)
		if err == nil {
			return nil
		}

		failures = append(failures, err)
	}

	return mostRelevant(failures)
}

func checkOneOf(branches []*schema, value any, path string) error {
	var failures []error
	var discriminated []error
	matches := 0

	for _, branch := range branches {
		err := validate(branch, value, path)
		if err == nil {
			matches++
			continue
		}

		failures = append(failures, err)

		if discriminatorMatches(branch, value) {
			discriminated = append(discriminated, err)
		}
	}

	switch matches {
	case 1:
		return nil
	case 0:
		if len(discriminated) > 0 {
			return mostRelevant(discriminated)
		}

		return mostRelevant(failures)
	default:
		return &ValidationError{Path: path, Reason: i18n.T("validate.oneof.ambiguous")}
	}
}

// In a discriminated oneOf, the branch whose const matches names the real mistake, whatever its path length.
func discriminatorMatches(s *schema, value any) bool {
	object, ok := value.(map[string]any)
	if !ok {
		return false
	}

	matched := false

	for key, property := range s.Properties {
		if property == nil || property.Const == nil {
			continue
		}

		actual, present := object[key]
		if !present {
			return false
		}

		expected, err := Decode(property.Const)
		if err != nil || !reflect.DeepEqual(expected, actual) {
			return false
		}

		matched = true
	}

	return matched
}

func mostRelevant(failures []error) error {
	var best *ValidationError

	for _, failure := range failures {
		candidate, ok := failure.(*ValidationError)
		if !ok {
			return failure
		}

		if best == nil || moreRelevant(candidate, best) {
			best = candidate
		}
	}

	return best
}

// At equal depth, the branch that got past its type check usually names the real mistake.
func moreRelevant(candidate, best *ValidationError) bool {
	if len(candidate.Path) != len(best.Path) {
		return len(candidate.Path) > len(best.Path)
	}

	return best.typeMismatch && !candidate.typeMismatch
}

func validateObject(s *schema, object map[string]any, path string) error {
	for _, key := range s.Required {
		if _, ok := object[key]; !ok {
			return &ValidationError{Path: childPath(path, key), Reason: i18n.T("validate.field.required")}
		}
	}

	for _, key := range orderedKeys(s, object) {
		value := object[key]
		child := childPath(path, key)

		if s.PropertyNames != nil {
			if err := validate(s.PropertyNames, key, child); err != nil {
				return &ValidationError{Path: child, Reason: i18n.T("validate.field.name.invalid", reasonOf(err))}
			}
		}

		property, declared := s.Properties[key]
		if declared {
			if err := validate(property, value, child); err != nil {
				return err
			}
			continue
		}

		if s.AdditionalProperties == nil {
			continue
		}

		if !s.AdditionalProperties.allowed {
			return &ValidationError{Path: child, Reason: i18n.T("validate.field.unknown")}
		}

		if s.AdditionalProperties.schema != nil {
			if err := validate(s.AdditionalProperties.schema, value, child); err != nil {
				return err
			}
		}
	}

	return nil
}

func orderedKeys(s *schema, object map[string]any) []string {
	ordered := make([]string, 0, len(object))
	seen := make(map[string]bool, len(object))

	for _, key := range s.propertyOrder {
		if _, present := object[key]; present {
			ordered = append(ordered, key)
			seen[key] = true
		}
	}

	rest := make([]string, 0, len(object))

	for key := range object {
		if !seen[key] {
			rest = append(rest, key)
		}
	}

	sort.Strings(rest)

	return append(ordered, rest...)
}

func validateArray(s *schema, items []any, path string) error {
	if s.MinItems != nil && len(items) < *s.MinItems {
		return &ValidationError{Path: path, Reason: i18n.Count(*s.MinItems, "validate.array.min_items.one", "validate.array.min_items.many")}
	}

	if s.MaxItems != nil && len(items) > *s.MaxItems {
		return &ValidationError{Path: path, Reason: i18n.Count(*s.MaxItems, "validate.array.max_items.one", "validate.array.max_items.many")}
	}

	for index, item := range items {
		child := childPath(path, fmt.Sprint(index))

		if index < len(s.PrefixItems) {
			if err := validate(s.PrefixItems[index], item, child); err != nil {
				return err
			}
			continue
		}

		if s.Items == nil {
			continue
		}

		if !s.Items.allowed {
			return &ValidationError{Path: child, Reason: i18n.T("validate.array.item.extra")}
		}

		if err := validate(s.Items.schema, item, child); err != nil {
			return err
		}
	}

	return nil
}

func validateString(s *schema, value string, path string) error {
	if s.MinLength != nil && len([]rune(value)) < *s.MinLength {
		return &ValidationError{Path: path, Reason: i18n.Count(*s.MinLength, "validate.string.min_length.one", "validate.string.min_length.many")}
	}

	if s.Pattern != "" {
		pattern, err := compilePattern(s.Pattern)
		if err != nil {
			return err
		}

		if !pattern.MatchString(value) {
			return &ValidationError{Path: path, Reason: i18n.T("validate.string.pattern", s.Pattern)}
		}
	}

	return nil
}

func validateNumber(s *schema, number json.Number, path string) error {
	value, err := number.Float64()
	if err != nil {
		return &ValidationError{Path: path, Reason: i18n.T("validate.number.unreadable")}
	}

	if s.Minimum != nil && value < *s.Minimum {
		return &ValidationError{Path: path, Reason: i18n.T("validate.number.minimum", formatNumber(*s.Minimum))}
	}

	if s.ExclusiveMinimum != nil && value <= *s.ExclusiveMinimum {
		return &ValidationError{Path: path, Reason: i18n.T("validate.number.exclusive_minimum", formatNumber(*s.ExclusiveMinimum))}
	}

	if s.Maximum != nil && value > *s.Maximum {
		return &ValidationError{Path: path, Reason: i18n.T("validate.number.maximum", formatNumber(*s.Maximum))}
	}

	return nil
}

func compilePattern(pattern string) (*regexp.Regexp, error) {
	if cached, ok := compiledPatterns.Load(pattern); ok {
		return cached.(*regexp.Regexp), nil
	}

	compiled, err := regexp.Compile(pattern)
	if err != nil {
		return nil, fmt.Errorf("contract: pattern %q: %w", pattern, err)
	}

	compiledPatterns.Store(pattern, compiled)

	return compiled, nil
}

func childPath(path, key string) string {
	escaped := strings.NewReplacer("~", "~0", "/", "~1").Replace(key)

	return path + "/" + escaped
}

func reasonOf(err error) string {
	if validation, ok := err.(*ValidationError); ok {
		return validation.Reason
	}

	return err.Error()
}

func formatNumber(value float64) string {
	if value == math.Trunc(value) && math.Abs(value) < 1e15 {
		return fmt.Sprintf("%d", int64(value))
	}

	return fmt.Sprint(value)
}
