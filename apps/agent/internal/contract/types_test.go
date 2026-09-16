package contract

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func sampleManifest() Manifest {
	return Manifest{
		ID:        "db.redis",
		Category:  "database",
		Name:      "Redis 7",
		Summary:   "Cache et files d'attente.",
		Requires:  []string{"core.system"},
		Resources: Resources{RAMMB: 128, DiskMB: 64},
		Arch:      []string{"amd64", "arm64"},
		Fields: []Field{
			{Key: "password", Kind: FieldSecret, Label: "Mot de passe", Required: true, Generate: true},
			{Key: "port", Kind: FieldNumber, Label: "Port", Required: false, Default: 6379},
			{Key: "engine", Kind: FieldSelect, Label: "Moteur", Required: true, Options: []string{"mysql", "mariadb"}, Default: "mysql"},
			{Key: "version", Kind: FieldVersion, Label: "Version", Options: []string{"7", "8"}, Default: "7"},
			{Key: "providers", Kind: FieldList, Label: "Fournisseurs", Required: true, Items: ItemsSecret, Min: 1, Max: 6},
			{Key: "node_versions", Kind: FieldVersions, Label: "Node", Options: []string{"24", "22"}, Default: []string{"24"}},
		},
		Mandatory: false,
		Since:     "0.2.0",
	}
}

func TestManifestValidatesAgainstTheSchema(t *testing.T) {
	if err := ValidateValue("Manifest", sampleManifest()); err != nil {
		t.Fatal(err)
	}

	bare := Manifest{ID: "core.system", Category: "core", Name: "Système", Summary: "Socle.", Arch: []string{"amd64"}, Since: "0.1.0", Mandatory: true}
	if err := ValidateValue("Manifest", bare); err != nil {
		t.Fatalf("nil slices must serialise as empty arrays: %v", err)
	}
}

func TestFieldSerialisesOnlyTheKeysOfItsKind(t *testing.T) {
	encoded, err := json.Marshal(sampleManifest().Fields)
	if err != nil {
		t.Fatal(err)
	}

	var fields []map[string]any
	if err := json.Unmarshal(encoded, &fields); err != nil {
		t.Fatal(err)
	}

	for i, field := range fields {
		if err := ValidateValue("Field", field); err != nil {
			t.Errorf("field %d: %v", i, err)
		}
	}

	if _, ok := fields[3]["required"]; ok {
		t.Error("a version field must not carry required")
	}

	if _, ok := fields[0]["options"]; ok {
		t.Error("a secret field must not carry options")
	}

	if _, ok := fields[4]["default"]; ok {
		t.Error("a list field must not carry default")
	}

	if _, ok := fields[5]["required"]; ok {
		t.Error("a versions field must not carry required")
	}

	var decoded []Field
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}

	if decoded[0].Generate != true || decoded[3].Default != "7" || !reflect.DeepEqual(decoded[2].Options, []string{"mysql", "mariadb"}) {
		t.Fatalf("round trip lost data: %+v", decoded)
	}

	if decoded[4].Items != ItemsSecret || decoded[4].Min != 1 || decoded[4].Max != 6 {
		t.Fatalf("round trip lost the list bounds: %+v", decoded[4])
	}
}

func TestReportAndResultsValidateAgainstTheSchema(t *testing.T) {
	report := Report{
		StartedAt:    "2026-09-04T12:00:00Z",
		FinishedAt:   "2026-09-04T12:00:01Z",
		AgentVersion: "0.0.0-test",
		Modules: []ModuleReport{
			{ID: "core.system", Status: ModuleOK, Steps: []ReportStep{{Step: "install-packages", Status: StepOK, Ms: 12}}},
			{ID: "db.redis", Status: ModuleFail, Steps: []ReportStep{{Step: "install-package", Status: StepFail, Ms: 3, Replay: "sudo pupitred install --only=db.redis", Message: "E: Unable to locate package"}}},
		},
		Failed:     []string{"db.redis"},
		ReportPath: "/var/lib/pupitre/report.json",
	}

	if err := ValidateValue("ReportResult", report); err != nil {
		t.Fatal(err)
	}

	if err := ValidateValue("ReportResult", Report{StartedAt: "a", FinishedAt: "b", AgentVersion: "c", ReportPath: "/x"}); err != nil {
		t.Fatalf("an empty report must still validate: %v", err)
	}

	if err := ValidateValue("InstallResult", InstallResult{Failed: []string{}, Warned: []string{}, ReportPath: "/x"}); err != nil {
		t.Fatal(err)
	}

	if err := ValidateValue("UninstallResult", UninstallResult{Failed: []string{}}); err != nil {
		t.Fatal(err)
	}

	status := ServiceStatus{ID: "db.redis", Name: "Redis 7", State: ServiceRunning, Version: "7.0.15", Port: 6379, Unit: "redis-server", Credentials: map[string]string{"Mot de passe": "REDIS_PASSWORD"}}
	if err := ValidateValue("ServiceStatusResult", status); err != nil {
		t.Fatal(err)
	}

	signed := ServiceStatus{ID: "tool.github", Name: "GitHub", State: ServiceRunning, Login: &Login{State: LoginSignedIn, Account: "jordan"}}
	if err := ValidateValue("ServiceStatusResult", signed); err != nil {
		t.Fatal(err)
	}

	if err := ValidateValue("ServiceStatusResult", ServiceStatus{ID: "tool.github", Name: "GitHub", State: ServiceRunning, Login: &Login{State: "expired"}}); err == nil {
		t.Fatal("a login state outside the contract must be refused")
	}
}

func TestStepEventValidatesOnceWrappedByTheProtocol(t *testing.T) {
	event := StepEvent{Module: "db.redis", Step: "install-package", Status: StepFail, Ms: 3, Replay: "sudo pupitred install --only=db.redis"}

	value, err := ToJSONValue(event)
	if err != nil {
		t.Fatal(err)
	}

	line := value.(map[string]any)
	line["id"] = json.Number("7")
	line["event"] = "step"

	if err := Validate("StepEvent", line); err != nil {
		t.Fatal(err)
	}
}

func TestPresetsComeFromTheSchema(t *testing.T) {
	var exported struct {
		Const []Preset `json:"const"`
	}
	if err := json.Unmarshal(mustDefinition(t, "Presets"), &exported); err != nil {
		t.Fatalf("decode Presets: %v", err)
	}

	if len(exported.Const) == 0 {
		t.Fatal("schema.json exports no preset content")
	}

	if !reflect.DeepEqual(Presets, exported.Const) {
		t.Fatalf("Presets = %+v, schema.json says %+v", Presets, exported.Const)
	}

	if err := ValidateValue("Presets", Presets); err != nil {
		t.Fatal(err)
	}

	seen := map[string]bool{}
	for _, preset := range Presets {
		if err := ValidateValue("Preset", preset); err != nil {
			t.Errorf("preset %s: %v", preset.ID, err)
		}
		seen[preset.ID] = true
	}

	for _, id := range enumOf(t, "Preset", "properties", "id") {
		if !seen[id] {
			t.Errorf("preset %s is in the schema but not in Presets", id)
		}
	}

	var mandatory struct {
		Const []string `json:"const"`
	}
	if err := json.Unmarshal(mustDefinition(t, "MandatoryModules"), &mandatory); err != nil {
		t.Fatalf("decode MandatoryModules: %v", err)
	}

	if len(mandatory.Const) == 0 || !reflect.DeepEqual(MandatoryModules, mandatory.Const) {
		t.Fatalf("MandatoryModules = %v, schema.json says %v", MandatoryModules, mandatory.Const)
	}

	for _, id := range MandatoryModules {
		if !strings.HasPrefix(id, "core.") {
			t.Errorf("mandatory module %s is not a core module", id)
		}
	}

	if !reflect.DeepEqual(Presets[2].Modules, MandatoryModules) {
		t.Errorf("minimal preset must be exactly the mandatory modules, got %v", Presets[2].Modules)
	}
}

func TestCategoriesAndArchitecturesMatchTheSchema(t *testing.T) {
	if got := enumOf(t, "Manifest", "properties", "category"); !reflect.DeepEqual(got, Categories) {
		t.Errorf("Categories = %v, schema says %v", Categories, got)
	}

	if got := enumOf(t, "Manifest", "properties", "arch", "items"); !reflect.DeepEqual(got, Architectures) {
		t.Errorf("Architectures = %v, schema says %v", Architectures, got)
	}
}
