package contract

import (
	_ "embed"
	"encoding/json"
	"testing"
)

// The fixtures the app validates against, exported by `bun run contracts:export`.
// A case that passes here and fails there is the drift this file exists to catch.
//
//go:embed fields.fixtures.json
var fixturesRaw []byte

type fieldCase struct {
	Name   string          `json:"name"`
	Field  Field           `json:"field"`
	Value  json.RawMessage `json:"value"`
	Held   int             `json:"held"`
	Expect *string         `json:"expect"`
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
			held := func(string, string) int { return single.Held }
			problem := ValidateField("tool.demo", single.Field, decoded(t, single.Value), held)

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

		held := func(string, string) int { return single.Held }

		problem := ValidateField("tool.demo", single.Field, decoded(t, single.Value), held)
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

	held := func(string, string) int { return 0 }

	if problems := ValidateModule(manifest, nil, held); len(problems) != 0 {
		t.Fatalf("a request that sends nothing is the manifest's own defaults: %+v", problems)
	}

	sent := map[string]any{"port": 80}
	problems := ValidateModule(manifest, sent, held)

	if len(problems) != 1 || problems[0].Field != "port" || problems[0].Code != ProblemMin {
		t.Fatalf("problems = %+v", problems)
	}
}
