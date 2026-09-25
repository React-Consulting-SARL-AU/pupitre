package onepassword

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
)

const serverToken = "PUPITRE_SERVER_TOKEN=ne-doit-jamais-sortir\n"

// A repository is anybody's code: a link it carries to the server's token must not have root copy that token into .env.local.
func TestEnvNeverReadsALinkThatLeavesTheProject(t *testing.T) {
	fake := machine()
	fake.Files["/etc/pupitre/server.token"] = []byte(serverToken)
	delete(fake.Files, home+"/"+templateName)
	delete(fake.Files, root+"/"+configName)
	fake.Links[home+"/"+templateName] = "/etc/pupitre/server.token"
	fake.Links[root+"/"+configName] = "../../../../etc/pupitre/server.token"
	fake.Links[home+"/"+exampleName] = "/etc/pupitre/server.token"
	ctx := newContext(t, fake, modtest.Secrets{"service_account_token": token})

	result, _ := Env(ctx, "flymate", "web", false)

	if strings.Contains(string(fake.Files[target]), "ne-doit-jamais-sortir") || strings.Contains(strings.Join(result.Keys, ","), "PUPITRE_SERVER_TOKEN") {
		t.Fatalf("the token must not reach .env.local: %q %+v", fake.Files[target], result)
	}

	for _, call := range fake.Calls {
		if strings.Contains(string(call.Stdin), "ne-doit-jamais-sortir") {
			t.Fatalf("the token must not reach op inject: %q", call.Stdin)
		}
	}
}

func TestEnvNeverReadsAnEnvFileThatIsALinkOutOfTheProject(t *testing.T) {
	fake := machine()
	fake.Files["/etc/pupitre/server.token"] = []byte(serverToken)
	fake.Links[target] = "/etc/pupitre/server.token"
	ctx := newContext(t, fake, modtest.Secrets{"service_account_token": token})

	result, _ := Env(ctx, "flymate", "web", false)

	if strings.Contains(strings.Join(result.Keys, ","), "PUPITRE_SERVER_TOKEN") {
		t.Fatalf("the names of a file out of the project must not be read: %+v", result)
	}
}

// A monorepo may point a workspace's example at the one of its root: a link that stays in the project is followed.
func TestEnvFollowsALinkThatStaysInTheProject(t *testing.T) {
	fake := machine()
	delete(fake.Packages, pkg)
	delete(fake.Files, home+"/"+templateName)
	fake.Files[root+"/"+exampleName] = []byte(example)
	fake.Links[home+"/"+exampleName] = "../../" + exampleName
	ctx := newContext(t, fake, nil)

	result, err := Env(ctx, "flymate", "web", false)
	if err != nil {
		t.Fatal(err)
	}

	if !result.Written || string(fake.Files[target]) != example {
		t.Fatalf("the example the link leads to is copied: %+v %q", result, fake.Files[target])
	}
}
