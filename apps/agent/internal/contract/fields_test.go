package contract

import (
	_ "embed"
	"encoding/json"
	"reflect"
	"testing"
)

//go:embed fields.fixtures.json
var fixturesRaw []byte

type fieldCase struct {
	Name   string          `json:"name"`
	Field  Field           `json:"field"`
	Value  json.RawMessage `json:"value"`
	Held   json.RawMessage `json:"held"`
	Expect *string         `json:"expect"`
}

// A count stands for that many held values the app could not see but the agent always does.
func (c fieldCase) held(t *testing.T) SecretsHeld {
	t.Helper()

	var values []string

	if c.Held == nil {
		return func(string, string) []string { return nil }
	}

	if err := json.Unmarshal(c.Held, &values); err == nil {
		return func(string, string) []string { return values }
	}

	var count int
	if err := json.Unmarshal(c.Held, &count); err != nil {
		t.Fatalf("%s: held = %s", c.Name, c.Held)
	}

	for range count {
		values = append(values, "held")
	}

	return func(string, string) []string { return values }
}

func fieldCases(t *testing.T) []fieldCase {
	t.Helper()

	var document struct {
		Cases []fieldCase `json:"cases"`
	}
	if err := json.Unmarshal(fixturesRaw, &document); err != nil {
		t.Fatalf("read fixtures: %v", err)
	}

	if len(document.Cases) == 0 {
		t.Fatal("the fixtures declare no case")
	}

	return document.Cases
}

func decoded(t *testing.T, raw json.RawMessage) any {
	t.Helper()

	if raw == nil {
		return nil
	}

	value, err := Decode(raw)
	if err != nil {
		t.Fatalf("decode value: %v", err)
	}

	return value
}

func TestFieldsAgreeWithTheApp(t *testing.T) {
	for _, single := range fieldCases(t) {
		t.Run(single.Name, func(t *testing.T) {
			problem := ValidateField("tool.demo", single.Field, decoded(t, single.Value), single.held(t))

			got := ""
			if problem != nil {
				got = problem.Code
			}

			want := ""
			if single.Expect != nil {
				want = *single.Expect
			}

			if got != want {
				t.Fatalf("code = %q, want %q", got, want)
			}
		})
	}
}

func TestEveryProblemCarriesAPhrase(t *testing.T) {
	for _, single := range fieldCases(t) {
		if single.Expect == nil {
			continue
		}

		problem := ValidateField("tool.demo", single.Field, decoded(t, single.Value), single.held(t))
		if problem == nil || problem.Message == "" {
			t.Fatalf("%s: a problem without a phrase", single.Name)
		}
	}
}

func TestEveryFixtureFieldIsContractValid(t *testing.T) {
	for _, single := range fieldCases(t) {
		encoded, err := json.Marshal(single.Field)
		if err != nil {
			t.Fatalf("%s: encode field: %v", single.Name, err)
		}

		value, err := Decode(encoded)
		if err != nil {
			t.Fatalf("%s: decode field: %v", single.Name, err)
		}

		if err := Validate("Field", value); err != nil {
			t.Fatalf("%s: %v", single.Name, err)
		}
	}
}

func TestEveryFormatHasAPattern(t *testing.T) {
	for _, format := range []string{
		FormatPort, FormatHostname, FormatDomain, FormatEmail,
		FormatIdentifier, FormatPath, FormatTimezone, FormatSize, FormatURL,
	} {
		if _, ok := formatPatterns[format]; !ok {
			t.Fatalf("format %s has no pattern in the contract", format)
		}

		if MatchesFormat(format, "") {
			t.Fatalf("format %s accepts an empty value", format)
		}
	}
}

func TestAnAbsentValueFallsBackOnTheManifestDefault(t *testing.T) {
	manifest := Manifest{
		ID: "db.postgres",
		Fields: []Field{
			{Key: "version", Kind: FieldVersion, Label: "Version", Options: []string{"18", "17"}, Default: "17"},
			{Key: "port", Kind: FieldNumber, Label: "Port", Required: true, Default: 5432, Min: 1024, Max: 65535},
			{Key: "app_role", Kind: FieldText, Label: "Rôle", Format: FormatIdentifier, Required: true, Default: "app"},
		},
	}

	held := func(string, string) []string { return nil }

	if problems := ValidateModule(manifest, nil, held); len(problems) != 0 {
		t.Fatalf("a request that sends nothing is the manifest's own defaults: %+v", problems)
	}

	sent := map[string]any{"port": 80}
	problems := ValidateModule(manifest, sent, held)

	if len(problems) != 1 || problems[0].Field != "port" || problems[0].Code != ProblemMin {
		t.Fatalf("problems = %+v", problems)
	}
}

func TestASecretHoldingALineBreakOrANulIsRefused(t *testing.T) {
	single := Field{Key: "password", Kind: FieldSecret, Label: "Mot de passe", Required: true}
	list := Field{Key: "keys", Kind: FieldList, Items: ItemsSecret, Label: "Clés"}

	for _, value := range []string{"s3cret\nrename-command CONFIG \"\"", "s3cret\r", "s3cr\x00et"} {
		held := func(string, string) []string { return []string{value} }

		if problem := ValidateField("db.redis", single, nil, held); problem == nil || problem.Code != ProblemPattern {
			t.Errorf("secret %q: problem = %+v", value, problem)
		}

		listed := func(string, string) []string { return []string{"fine", value} }

		if problem := ValidateField("ai.hermes", list, nil, listed); problem == nil || problem.Code != ProblemPattern {
			t.Errorf("secret list holding %q: problem = %+v", value, problem)
		}
	}

	held := func(string, string) []string { return []string{`s3cret with spaces, quotes " and ' and a tab	too`} }

	if problem := ValidateField("db.redis", single, nil, held); problem != nil {
		t.Fatalf("anything but a line break or a nul passes: %+v", problem)
	}
}

func TestTheValuesAModuleReadsAreTheOnesThatWereJudged(t *testing.T) {
	manifest := Manifest{
		ID: "exposure.caddy",
		Fields: []Field{
			{Key: "domain", Kind: FieldText, Label: "Domaine", Format: FormatDomain},
			{Key: "app_role", Kind: FieldText, Label: "Rôle", Format: FormatIdentifier},
			{Key: "hosts", Kind: FieldList, Label: "Hôtes", Format: FormatHostname},
			{Key: "port", Kind: FieldNumber, Label: "Port"},
			{Key: "engine", Kind: FieldSelect, Label: "Moteur", Options: []string{"mysql"}},
		},
	}

	sent := map[string]any{
		"domain":   "  Flyleaf.DEV \n",
		"app_role": " app ",
		"hosts":    []any{" API.flyleaf.dev", "web.flyleaf.dev "},
		"port":     float64(443),
		"engine":   "mysql",
		"unknown":  " kept as sent ",
	}

	got := NormalizeValues(manifest, sent)

	want := map[string]any{
		"domain":   "flyleaf.dev",
		"app_role": "app",
		"hosts":    []any{"api.flyleaf.dev", "web.flyleaf.dev"},
		"port":     float64(443),
		"engine":   "mysql",
		"unknown":  " kept as sent ",
	}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("normalized = %#v", got)
	}

	if sent["domain"] != "  Flyleaf.DEV \n" {
		t.Fatal("the request itself is left as it was sent")
	}

	if NormalizeValues(manifest, nil) != nil {
		t.Fatal("nothing sent stays nothing")
	}
}
