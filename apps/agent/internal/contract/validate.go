package contract

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"regexp"
	"strings"
	"sync"
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

	return e.Path + " : " + e.Reason
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
		return nil, fmt.Errorf("trailing data after the JSON value")
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

func ValidateSchema(raw json.RawMessage, value any) error {
	var compiled schema
	if err := json.Unmarshal(raw, &compiled); err != nil {
		return err
	}

	return validate(&compiled, value, "")
}

func definitionSchema(name string) (*schema, error) {
	if cached, ok := compiledDefinitions.Load(name); ok {
		return cached.(*schema), nil
	}

	raw, ok := Definition(name)
	if !ok {
		return nil, &ValidationError{Reason: "définition inconnue : " + name}
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
			return &ValidationError{Path: path, Reason: "référence non prise en charge : " + s.Ref}
		}

		target, err := definitionSchema(name)
		if err != nil {
			return err
		}

		return validate(target, value, path)
	}

	if len(s.Type) > 0 && !matchesAnyType(s.Type, value) {
		return &ValidationError{Path: path, Reason: "doit être de type " + strings.Join(s.Type, " ou "), typeMismatch: true}
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
		return &ValidationError{Path: path, Reason: "doit valoir " + string(raw)}
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

	return &ValidationError{Path: path, Reason: "doit être l'une des valeurs " + strings.Join(labels, ", ")}
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
	matches := 0

	for _, branch := range branches {
		if err := validate(branch, value, path); err != nil {
			failures = append(failures, err)
			continue
		}

		matches++
	}

	switch matches {
	case 1:
		return nil
	case 0:
		return mostRelevant(failures)
	default:
		return &ValidationError{Path: path, Reason: "correspond à plusieurs variantes (oneOf)"}
	}
}

// The branch that got past its type check usually names the real mistake.
func mostRelevant(failures []error) error {
	var best *ValidationError

	for _, failure := range failures {
		candidate, ok := failure.(*ValidationError)
		if !ok {
			return failure
		}

		if best == nil || len(candidate.Path) > len(best.Path) || (len(candidate.Path) == len(best.Path) && best.typeMismatch && !candidate.typeMismatch) {
			best = candidate
		}
	}

	return best
}

func validateObject(s *schema, object map[string]any, path string) error {
	for _, key := range s.Required {
		if _, ok := object[key]; !ok {
			return &ValidationError{Path: childPath(path, key), Reason: "champ requis"}
		}
	}

	for key, value := range object {
		child := childPath(path, key)

		if s.PropertyNames != nil {
			if err := validate(s.PropertyNames, key, child); err != nil {
				return &ValidationError{Path: child, Reason: "nom de champ invalide : " + reasonOf(err)}
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
			return &ValidationError{Path: child, Reason: "champ inconnu"}
		}

		if s.AdditionalProperties.schema != nil {
			if err := validate(s.AdditionalProperties.schema, value, child); err != nil {
				return err
			}
		}
	}

	return nil
}

func validateArray(s *schema, items []any, path string) error {
	if s.MinItems != nil && len(items) < *s.MinItems {
		return &ValidationError{Path: path, Reason: fmt.Sprintf("doit compter au moins %d élément%s", *s.MinItems, plural(*s.MinItems))}
	}

	if s.MaxItems != nil && len(items) > *s.MaxItems {
		return &ValidationError{Path: path, Reason: fmt.Sprintf("doit compter au plus %d élément%s", *s.MaxItems, plural(*s.MaxItems))}
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
			return &ValidationError{Path: child, Reason: "élément en trop"}
		}

		if err := validate(s.Items.schema, item, child); err != nil {
			return err
		}
	}

	return nil
}

func validateString(s *schema, value string, path string) error {
	if s.MinLength != nil && len([]rune(value)) < *s.MinLength {
		return &ValidationError{Path: path, Reason: fmt.Sprintf("doit compter au moins %d caractère%s", *s.MinLength, plural(*s.MinLength))}
	}

	if s.Pattern != "" {
		pattern, err := compilePattern(s.Pattern)
		if err != nil {
			return err
		}

		if !pattern.MatchString(value) {
			return &ValidationError{Path: path, Reason: "ne correspond pas au motif " + s.Pattern}
		}
	}

	return nil
}

func validateNumber(s *schema, number json.Number, path string) error {
	value, err := number.Float64()
	if err != nil {
		return &ValidationError{Path: path, Reason: "nombre illisible"}
	}

	if s.Minimum != nil && value < *s.Minimum {
		return &ValidationError{Path: path, Reason: "doit être ≥ " + formatNumber(*s.Minimum)}
	}

	if s.ExclusiveMinimum != nil && value <= *s.ExclusiveMinimum {
		return &ValidationError{Path: path, Reason: "doit être > " + formatNumber(*s.ExclusiveMinimum)}
	}

	if s.Maximum != nil && value > *s.Maximum {
		return &ValidationError{Path: path, Reason: "doit être ≤ " + formatNumber(*s.Maximum)}
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

func plural(count int) string {
	if count > 1 {
		return "s"
	}

	return ""
}
