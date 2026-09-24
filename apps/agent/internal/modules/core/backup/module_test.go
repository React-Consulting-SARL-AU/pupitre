package backup

import (
	"net/http"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/s3"
	"pupitre.studio/agent/internal/s3/s3test"
)

const secret = s3test.Secret

func values(endpoint string) modtest.Values {
	return modtest.Values{
		"endpoint": endpoint, "region": "auto", "bucket": "backups", "prefix": "pupitre", "path_style": true,
		"access_key_id": s3test.AccessKey, "recipient": "A10gydBSR5g4m/L8q8Msuz7sSJNSPyytp4QgelrXxEw=", "kdf_salt": "lneDgZnxLTb17pcdSfaKvA==",
	}
}

// aimed sends the module's probes to the fake bucket, over its own HTTPS, and answers the endpoint to configure.
func aimed(t *testing.T, bucket *s3test.Fake) string {
	t.Helper()

	fake := bucket.Client(true)
	kept := reach
	reach = func(client s3.Client) s3.Client {
		client.HTTP = fake.HTTP

		return client
	}
	t.Cleanup(func() { reach = kept })

	return fake.Endpoint
}

func newContext(t *testing.T, fake *modtest.FakeSys, endpoint string, secrets modtest.Secrets) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: values(endpoint), Secrets: secrets})
}

func TestTheValuesComeBackWithinTheirBounds(t *testing.T) {
	ctx := modtest.NewContext(t, modtest.NewFakeSys(), modtest.Options{Manifest: manifest(), Values: modtest.Values{
		"interval_hours": -4, "hour": 31, "keep": 0, "prefix": "/pupitre/", "extra_paths": []any{"notes", "work/drafts/"},
	}})

	settings := Read(ctx)
	if settings.IntervalHours != DefaultInterval || settings.Hour != DefaultHour || settings.Keep != DefaultKeep || settings.Projects != ProjectsFull || settings.Prefix != "pupitre" {
		t.Fatalf("settings = %+v", settings)
	}

	if !settings.Databases || !settings.Home || !settings.PathStyle || len(settings.ExtraPaths) != 2 || settings.Configured() {
		t.Fatalf("defaults = %+v", settings)
	}
}

func TestTwoBoxesMakeTheProjectsMode(t *testing.T) {
	for _, tc := range []struct {
		carried, envOnly any
		want             string
	}{
		{nil, nil, ProjectsFull},
		{true, true, ProjectsEnv},
		{false, true, ProjectsNone},
	} {
		ctx := modtest.NewContext(t, modtest.NewFakeSys(), modtest.Options{Manifest: manifest(), Values: modtest.Values{"projects": tc.carried, "projects_env_only": tc.envOnly}})

		if got := Read(ctx).Projects; got != tc.want {
			t.Errorf("projects %v, env only %v: %s, want %s", tc.carried, tc.envOnly, got, tc.want)
		}
	}
}

func TestTheInstallProvesTheBucketAndWritesNothing(t *testing.T) {
	bucket := s3test.New(t, "backups")
	fake := modtest.NewFakeSys()
	fake.Files["/etc/pupitre/server.id"] = []byte("srv_42\n")
	ctx := newContext(t, fake, aimed(t, bucket), modtest.Secrets{"secret_access_key": secret})

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}

	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	if bucket.Calls("HeadBucket") != 1 || bucket.Calls("PutObject") != 1 || bucket.Calls("DeleteObject") != 1 || len(bucket.Keys()) != 0 {
		t.Fatalf("the probe must write under the server's prefix and leave nothing: %v", bucket.Keys())
	}

	if len(fake.Mutations) != 0 {
		t.Fatalf("the module writes nothing on the machine: %v", fake.Mutations)
	}

	status, err := (Module{}).Status(ctx)
	if err != nil || !status.Installed || !status.Configured || status.State != contract.ServiceRunning {
		t.Fatalf("status = %+v, %v", status, err)
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, secret) {
			t.Fatalf("secret in output: %s", line)
		}
	}
}

func TestARefusingBucketFailsTheStepWithItsRemedy(t *testing.T) {
	bucket := s3test.New(t, "backups")
	bucket.Refuse("PutObject", http.StatusForbidden, "AccessDenied")
	ctx := newContext(t, modtest.NewFakeSys(), aimed(t, bucket), modtest.Secrets{"secret_access_key": secret})

	if err := (Module{}).Configure(ctx); err == nil {
		t.Fatal("expected the step to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Step != "verify-bucket" || last.Replay != "sudo pupitred install --only=core.backup" || !strings.Contains(last.Message, "AccessDenied") {
		t.Fatalf("event = %+v", last)
	}
}

func TestThePreflightJudgesOnlyWithASecretTheServerHolds(t *testing.T) {
	endpoint := aimed(t, s3test.New(t, "elsewhere"))

	if problems := (Module{}).Preflight(newContext(t, modtest.NewFakeSys(), endpoint, nil)); len(problems) != 0 {
		t.Fatalf("no secret held, nothing to judge: %v", problems)
	}

	problems := (Module{}).Preflight(newContext(t, modtest.NewFakeSys(), endpoint, modtest.Secrets{"secret_access_key": secret}))
	if len(problems) != 1 || problems[0].Code != contract.ProblemConnection || problems[0].Module != ID {
		t.Fatalf("an unknown bucket is the connection's problem: %v", problems)
	}
}

func TestAPlainHTTPEndpointIsNeverOneToBackUpTo(t *testing.T) {
	ctx := newContext(t, modtest.NewFakeSys(), "http://s3.example.org", modtest.Secrets{"secret_access_key": secret})

	if Read(ctx).Configured() {
		t.Fatal("an http endpoint is not configured")
	}

	if err := (Module{}).Configure(ctx); err == nil {
		t.Fatal("the install must refuse an http endpoint without reaching it")
	}

	for field, value := range map[string]any{"endpoint": "http://s3.example.org", "bucket": "Bad_Bucket", "region": "EU West"} {
		given := values("https://s3.example.org")
		given[field] = value

		if problems := contract.ValidateModule(manifest(), given, func(string, string) []string { return []string{secret} }); len(problems) != 1 || problems[0].Field != field {
			t.Errorf("%s = %v: problems %v", field, value, problems)
		}
	}
}

func TestAModuleNobodyConfiguredIsNotInstalled(t *testing.T) {
	status, err := (Module{}).Check(modtest.NewContext(t, modtest.NewFakeSys(), modtest.Options{Manifest: manifest()}))
	if err != nil || status.Installed {
		t.Fatalf("status = %+v, %v", status, err)
	}

	if err := (Module{}).Uninstall(modtest.NewContext(t, modtest.NewFakeSys(), modtest.Options{Manifest: manifest()})); err != nil {
		t.Fatal(err)
	}
}

var _ modules.Module = Module{}
var _ modules.Preflighter = Module{}
