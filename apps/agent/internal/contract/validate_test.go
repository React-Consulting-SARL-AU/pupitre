package contract

import (
	"encoding/json"
	"strings"
	"testing"
)

func decode(t *testing.T, text string) any {
	t.Helper()

	value, err := Decode([]byte(text))
	if err != nil {
		t.Fatalf("decode %s: %v", text, err)
	}

	return value
}

func assertValidation(t *testing.T, err error, wantErr string) {
	t.Helper()

	if wantErr == "" {
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		return
	}

	if err == nil {
		t.Fatalf("expected an error mentioning %q", wantErr)
	}

	if !strings.Contains(err.Error(), wantErr) {
		t.Fatalf("error %q does not mention %q", err, wantErr)
	}
}

func TestValidateAgainstDefinitions(t *testing.T) {
	cases := []struct {
		name       string
		definition string
		value      string
		wantErr    string
	}{
		{"hello ok", "HelloParams", `{"app_version":"0.2.0","protocol":1}`, ""},
		{"hello missing field", "HelloParams", `{"protocol":1}`, "/app_version"},
		{"hello unknown field", "HelloParams", `{"app_version":"0.2.0","protocol":1,"extra":true}`, "/extra"},
		{"hello wrong type", "HelloParams", `{"app_version":"0.2.0","protocol":"1"}`, "/protocol"},
		{"hello float protocol", "HelloParams", `{"app_version":"0.2.0","protocol":1.5}`, "/protocol"},
		{"hello protocol zero", "HelloParams", `{"app_version":"0.2.0","protocol":0}`, "/protocol"},
		{"hello empty version", "HelloParams", `{"app_version":"","protocol":1}`, "/app_version"},
		{"hello not an object", "HelloParams", `[1]`, "objet"},
		{"ping ok", "PingParams", `{}`, ""},
		{"ping extra", "PingParams", `{"x":1}`, "/x"},
		{"enum ok", "DbDumpParams", `{"engine":"postgres"}`, ""},
		{"enum unknown", "DbDumpParams", `{"engine":"sqlite"}`, "/engine"},
		{"pattern ok", "SecretsSetParams", `{"key":"API_KEY","secrets_stdin":true}`, ""},
		{"pattern rejected", "SecretsSetParams", `{"key":"api_key","secrets_stdin":true}`, "/key"},
		{"const rejected", "SecretsSetParams", `{"key":"API_KEY","secrets_stdin":false}`, "/secrets_stdin"},
		{"anyOf name", "ProjectUpParams", `{"name":"flymate-api"}`, ""},
		{"anyOf all", "ProjectUpParams", `{"name":"all"}`, ""},
		{"anyOf none", "ProjectUpParams", `{"name":"Flymate"}`, "/name"},
		{"items ok", "InstallParams", `{"modules":["core.system"],"config":{"core.system":{"tz":"UTC"}},"secrets_stdin":false}`, ""},
		{"items empty", "InstallParams", `{"modules":[],"config":{},"secrets_stdin":false}`, "/modules"},
		{"items wrong type", "InstallParams", `{"modules":[1],"config":{},"secrets_stdin":false}`, "/modules/0"},
		{"nested additional", "InstallParams", `{"modules":["a"],"config":{"a":"x"},"secrets_stdin":false}`, "/config/a"},
		{"integer max", "ProcessKillParams", `{"pid":9007199254740992}`, "/pid"},
		{"integer as float", "ProcessKillParams", `{"pid":12.0}`, ""},
		{"optional absent", "UpgradeParams", `{}`, ""},
		{"oneOf success", "Response", `{"id":1,"ok":true,"result":{}}`, ""},
		{"oneOf failure with ref", "Response", `{"id":1,"ok":false,"error":{"code":"busy","message":"x"}}`, ""},
		{"oneOf ref rejects code", "Response", `{"id":1,"ok":false,"error":{"code":"nope","message":"x"}}`, "/error/code"},
		{"nullable", "ProbeResult", `{"os":"ubuntu","version":"24.04","arch":"amd64","ram_mb":4096,"disk_free_gb":10.5,"sudo":true,"ports":[],"docker":false,"panel":null,"agent_version":null,"installed_modules":[],"verdict":{"level":"ready","kind":"bare","reasons":[],"fixes":[]}}`, ""},
		{"number rejects string", "ProbeResult", `{"os":"ubuntu","version":"24.04","arch":"amd64","ram_mb":4096,"disk_free_gb":"10","sudo":true,"ports":[],"docker":false,"panel":null,"agent_version":null,"installed_modules":[],"verdict":{"level":"ready","kind":"bare","reasons":[],"fixes":[]}}`, "/disk_free_gb"},
		{"arch describes an unsupported machine", "ProbeResult", `{"os":"debian","version":"12","arch":"i686","ram_mb":4096,"disk_free_gb":10.5,"sudo":true,"ports":[],"docker":false,"panel":null,"agent_version":null,"installed_modules":[],"verdict":{"level":"blocked","kind":"incompatible","reasons":["i686"],"fixes":["choisis amd64 ou arm64"]}}`, ""},
		{"managed carries up_to_date", "ProbeResult", `{"os":"ubuntu","version":"24.04","arch":"amd64","ram_mb":4096,"disk_free_gb":10.5,"sudo":true,"ports":[],"docker":false,"panel":null,"agent_version":"0.2.0","installed_modules":[],"verdict":{"level":"ready","kind":"managed","up_to_date":true,"reasons":[],"fixes":[]}}`, ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := Validate(tc.definition, decode(t, tc.value))

			assertValidation(t, err, tc.wantErr)
		})
	}
}

func TestFieldDefinitionKnowsBooleanAndList(t *testing.T) {
	cases := []struct {
		name  string
		value string
		valid bool
	}{
		{"boolean", `{"key":"tunnel","kind":"boolean","label":"Tunnel","required":false,"default":true}`, true},
		{"boolean bad default", `{"key":"tunnel","kind":"boolean","label":"Tunnel","required":false,"default":"yes"}`, false},
		{"boolean required", `{"key":"tunnel","kind":"boolean","label":"Tunnel","required":true,"default":true}`, false},
		{"list of secrets", `{"key":"providers","kind":"list","label":"Providers","required":true,"items":"secret","min":1,"max":8}`, true},
		{"list of text", `{"key":"extensions","kind":"list","label":"Extensions","required":false,"items":"text"}`, true},
		{"list without items", `{"key":"providers","kind":"list","label":"Providers","required":true}`, false},
		{"list unknown items", `{"key":"providers","kind":"list","label":"Providers","required":true,"items":"number"}`, false},
		{"list negative min", `{"key":"providers","kind":"list","label":"Providers","required":true,"items":"text","min":-1}`, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := Validate("Field", decode(t, tc.value))

			if tc.valid && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if !tc.valid && err == nil {
				t.Fatal("expected a validation error")
			}
		})
	}
}

func TestFieldOneOfMessagesAreExactAndStable(t *testing.T) {
	cases := []struct {
		name  string
		value string
		want  string
	}{
		{"boolean default wrong type", `{"key":"tunnel","kind":"boolean","label":"Tunnel","required":false,"default":"yes"}`, "/default : doit être un booléen"},
		{"version missing default", `{"key":"php","kind":"version","label":"PHP","options":["8.3"]}`, "/default : champ requis"},
		{"list missing items", `{"key":"providers","kind":"list","label":"Providers","required":true}`, "/items : champ requis"},
		{"secret unknown field", `{"key":"token","kind":"secret","label":"Token","required":true,"default":"x"}`, "/default : champ inconnu"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := Validate("Field", decode(t, tc.value))

			if err == nil {
				t.Fatalf("expected an error, got nil")
			}

			if err.Error() != tc.want {
				t.Fatalf("message = %q, want %q", err.Error(), tc.want)
			}
		})
	}
}

func TestResponseOneOfMessageIsExact(t *testing.T) {
	err := Validate("Response", decode(t, `{"id":1,"ok":false,"error":{"code":"nope","message":"x"}}`))

	if err == nil {
		t.Fatal("expected an error, got nil")
	}

	if got, want := err.Error(), "/error/code : doit être l'une des valeurs hello_required, protocol_mismatch, bad_request, unknown_command, entitlement_required, project_not_found, module_not_found, module_failed, no_report, service_not_found, secrets_required, bad_signature, busy, internal"; got != want {
		t.Fatalf("message = %q, want %q", got, want)
	}
}

func TestValidateRejectsNonObjectAndBadRefs(t *testing.T) {
	if err := Validate("HelloParams", decode(t, `[1]`)); err == nil {
		t.Fatal("array accepted as HelloParams")
	}

	if err := Validate("Response", decode(t, `{"id":1,"ok":false,"error":{"code":"nope","message":"x"}}`)); err == nil {
		t.Fatal("unknown error code accepted through $ref")
	}

	if err := Validate("Nope", decode(t, `{}`)); err == nil {
		t.Fatal("unknown definition accepted")
	}
}

func TestValidateSchemaKeywords(t *testing.T) {
	cases := []struct {
		name    string
		schema  string
		value   string
		wantErr string
	}{
		{"type list accepts null", `{"type":["string","null"]}`, `null`, ""},
		{"type list rejects number", `{"type":["string","null"]}`, `1`, "chaîne"},
		{"prefixItems ok", `{"type":"array","prefixItems":[{"type":"number"},{"type":"number"}],"items":false,"minItems":2,"maxItems":2}`, `[0.1,0.2]`, ""},
		{"prefixItems too many", `{"type":"array","prefixItems":[{"type":"number"}],"items":false,"maxItems":1}`, `[0.1,0.2]`, "1"},
		{"prefixItems wrong type", `{"type":"array","prefixItems":[{"type":"number"},{"type":"number"}]}`, `[0.1,"x"]`, "/1"},
		{"minimum", `{"type":"integer","minimum":1}`, `0`, "1"},
		{"exclusiveMinimum", `{"type":"integer","exclusiveMinimum":0}`, `0`, "0"},
		{"maximum", `{"type":"integer","maximum":65535}`, `70000`, "65535"},
		{"minLength", `{"type":"string","minLength":1}`, `""`, "1"},
		{"const string", `{"const":"all"}`, `"none"`, "all"},
		{"propertyNames", `{"type":"object","propertyNames":{"type":"string","pattern":"^[a-z]+$"},"additionalProperties":{}}`, `{"Ab":1}`, "Ab"},
		{"additionalProperties schema", `{"type":"object","additionalProperties":{"type":"integer"}}`, `{"a":"x"}`, "/a"},
		{"boolean", `{"type":"boolean"}`, `"true"`, "booléen"},
		{"ref", `{"$ref":"#/$defs/ErrorCode"}`, `"busy"`, ""},
		{"ref rejects", `{"$ref":"#/$defs/ErrorCode"}`, `"nope"`, "busy"},
		{"empty schema accepts anything", `{}`, `{"a":[1,2,{"b":null}]}`, ""},
		{"oneOf exactly one", `{"oneOf":[{"type":"string"},{"type":"string","minLength":1}]}`, `"x"`, "oneOf"},
		{"anyOf reports the best failure", `{"anyOf":[{"type":"string"},{"type":"integer","minimum":5}]}`, `1`, "5"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertValidation(t, ValidateSchema(json.RawMessage(tc.schema), decode(t, tc.value)), tc.wantErr)
		})
	}
}

func TestDecodeKeepsIntegersExact(t *testing.T) {
	value := decode(t, `{"id":9007199254740991}`)

	object, ok := value.(map[string]any)
	if !ok {
		t.Fatalf("decoded %T, want object", value)
	}

	number, ok := object["id"].(json.Number)
	if !ok {
		t.Fatalf("id decoded as %T, want json.Number", object["id"])
	}

	if number.String() != "9007199254740991" {
		t.Fatalf("id = %s", number)
	}
}
