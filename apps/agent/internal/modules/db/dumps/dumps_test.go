package dumps

import (
	"errors"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
)

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Module: "db.mysql"})
}

func withDumps(t *testing.T, paths ...string) (*modtest.FakeSys, *modules.Context) {
	t.Helper()

	fake := modtest.NewFakeSys()
	fake.Dirs[Dir] = true
	fake.Replies["find"] = strings.Join(paths, "\n") + "\n"

	return fake, newContext(t, fake)
}

func loaded(into *[]string) func(File) error {
	return func(dump File) error {
		*into = append(*into, dump.Database+" ← "+dump.Path)

		return nil
	}
}

func TestImportNamesOneStepPerDump(t *testing.T) {
	var seen []string
	fake, ctx := withDumps(t, Dir+"/fulldump_shop_20260101.sql", Dir+"/intranet.sql")

	imported, err := Import(ctx, Options{Patterns: []string{"*.sql"}, Load: loaded(&seen)})
	if err != nil {
		t.Fatal(err)
	}

	if strings.Join(imported, ",") != "shop,intranet" {
		t.Fatalf("imported = %v", imported)
	}

	if strings.Join(seen, " · ") != "shop ← "+Dir+"/fulldump_shop_20260101.sql · intranet ← "+Dir+"/intranet.sql" {
		t.Fatalf("loaded = %v", seen)
	}

	var steps []string
	for _, event := range ctx.Events() {
		steps = append(steps, event.Step+":"+string(event.Status))
	}
	if strings.Join(steps, " ") != "import-shop:ok import-intranet:ok" {
		t.Fatalf("the report must name each imported database, got %v", steps)
	}

	for _, marker := range []string{markerDir + "/fulldump_shop_20260101.sql.done", markerDir + "/intranet.sql.done"} {
		if _, ok := fake.Files[marker]; !ok {
			t.Fatalf("marker %s missing: %v", marker, fake.Files)
		}
	}
}

func TestImportSkipsWithoutDumpsDirectory(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake)

	var seen []string
	if _, err := Import(ctx, Options{Patterns: []string{"*.sql"}, Load: loaded(&seen)}); err != nil {
		t.Fatal(err)
	}

	events := ctx.Events()
	if len(events) != 1 || events[0].Step != "import-dumps" || events[0].Status != contract.StepSkip {
		t.Fatalf("events = %+v", events)
	}

	if len(seen) != 0 || len(fake.Mutations) != 0 {
		t.Fatalf("nothing must be touched: %v %v", seen, fake.Mutations)
	}
}

func TestImportedDumpIsNeverReplayed(t *testing.T) {
	var seen []string
	fake, ctx := withDumps(t, Dir+"/shop.sql")
	fake.Files[markerDir+"/shop.sql.done"] = []byte("shop\n")

	imported, err := Import(ctx, Options{Patterns: []string{"*.sql"}, Load: loaded(&seen)})
	if err != nil {
		t.Fatal(err)
	}

	if len(imported) != 0 || len(seen) != 0 {
		t.Fatalf("an imported dump must not be replayed: %v %v", imported, seen)
	}

	events := ctx.Events()
	if len(events) != 1 || events[0].Status != contract.StepSkip {
		t.Fatalf("events = %+v", events)
	}
}

func TestForcedImportIgnoresTheMarkersOfOneDatabase(t *testing.T) {
	var seen []string
	fake, ctx := withDumps(t, Dir+"/shop.sql", Dir+"/intranet.sql")
	fake.Files[markerDir+"/shop.sql.done"] = []byte("shop\n")
	fake.Files[markerDir+"/intranet.sql.done"] = []byte("intranet\n")

	imported, err := Import(ctx, Options{Patterns: []string{"*.sql"}, Only: "shop", Force: true, Load: loaded(&seen)})
	if err != nil {
		t.Fatal(err)
	}

	if strings.Join(imported, ",") != "shop" {
		t.Fatalf("only the named database must be imported again: %v", imported)
	}
}

func TestAFailedImportIsReportedAndLetsTheNextOneThrough(t *testing.T) {
	var seen []string
	fake, ctx := withDumps(t, Dir+"/shop.sql", Dir+"/intranet.sql")

	imported, err := Import(ctx, Options{Patterns: []string{"*.sql"}, Load: func(dump File) error {
		if dump.Database == "shop" {
			return errors.New("ERROR 1064 (42000) at line 12")
		}

		return loaded(&seen)(dump)
	}})
	if err != nil {
		t.Fatal(err)
	}

	if strings.Join(imported, ",") != "intranet" {
		t.Fatalf("imported = %v", imported)
	}

	if _, marked := fake.Files[markerDir+"/shop.sql.done"]; marked {
		t.Fatal("a failed import must stay replayable")
	}

	var steps []string
	for _, event := range ctx.Events() {
		steps = append(steps, event.Step+":"+string(event.Status))
	}
	if strings.Join(steps, " ") != "import-intranet:ok import-shop:fail" {
		t.Fatalf("the report must carry the failed import: %v", steps)
	}

	journal := strings.Join(ctx.Output(), "\n")
	if !strings.Contains(journal, "1064") || !strings.Contains(journal, "sudo pupitred install --only=db.mysql") {
		t.Fatalf("the failure must name its replay command:\n%s", journal)
	}
}

// A plain x.sql beside x.sql.gz is the client's: the archive is decompressed under a name of its own, and only that copy goes.
func TestGzippedDumpIsDecompressedUnderItsOwnNameThenRemoved(t *testing.T) {
	var seen []string
	fake, ctx := withDumps(t, Dir+"/dump_shop_20260101.sql.gz")
	fake.Files[Dir+"/dump_shop_20260101.sql.gz"] = []byte("gz")
	fake.Files[Dir+"/dump_shop_20260101.sql"] = []byte("-- the client's own plain dump\n")

	if _, err := Import(ctx, Options{Patterns: []string{"*.sql.gz"}, Load: loaded(&seen)}); err != nil {
		t.Fatal(err)
	}

	copied := Dir + "/.pupitre-import-dump_shop_20260101.sql"
	if strings.Join(seen, "") != "shop ← "+copied {
		t.Fatalf("the loader must receive the decompressed copy: %v", seen)
	}

	if _, kept := fake.Files[copied]; kept {
		t.Fatal("the decompressed copy must be removed once imported")
	}

	if string(fake.Files[Dir+"/dump_shop_20260101.sql"]) != "-- the client's own plain dump\n" {
		t.Fatalf("the client's plain dump must stay as it was: %q", fake.Files[Dir+"/dump_shop_20260101.sql"])
	}

	if _, kept := fake.Files[Dir+"/dump_shop_20260101.sql.gz"]; !kept {
		t.Fatal("the original archive stays where the client put it")
	}
}

func TestEngineThatReadsGzipItselfKeepsTheArchive(t *testing.T) {
	var seen []string
	fake, ctx := withDumps(t, Dir+"/shop.archive.gz")

	if _, err := Import(ctx, Options{Patterns: []string{"*.archive.gz"}, NativeGzip: true, Load: loaded(&seen)}); err != nil {
		t.Fatal(err)
	}

	if strings.Join(seen, "") != "shop ← "+Dir+"/shop.archive.gz" {
		t.Fatalf("loaded = %v", seen)
	}

	for _, call := range fake.Commands() {
		if strings.HasPrefix(call, "gzip") {
			t.Fatalf("no decompression is needed: %s", call)
		}
	}
}

func TestADumpWhoseNameIsNotUsableIsLeftAlone(t *testing.T) {
	var seen []string
	fake, ctx := withDumps(t, Dir+"/ma base; DROP.sql", Dir+"/intranet.sql")

	imported, err := Import(ctx, Options{Patterns: []string{"*.sql"}, Load: loaded(&seen)})
	if err != nil {
		t.Fatal(err)
	}

	if strings.Join(imported, ",") != "intranet" {
		t.Fatalf("imported = %v", imported)
	}

	if _, marked := fake.Files[markerDir+"/ma base; DROP.sql.done"]; marked {
		t.Fatal("nothing was imported from it, nothing marks it as done")
	}

	if !strings.Contains(strings.Join(ctx.Output(), "\n"), "was skipped") {
		t.Fatalf("the client must be told:\n%s", strings.Join(ctx.Output(), "\n"))
	}
}

func TestDatabaseNameComesFromTheFileName(t *testing.T) {
	cases := map[string]string{
		"fulldump_shop_20260101.sql":      "shop",
		"dump_intranet_1735689600.sql":    "intranet",
		"dump_intranet_1735689600.sql.gz": "intranet",
		"shop.sql":                        "shop",
		"shop.archive.gz":                 "shop",
		"Shop-Prod.sql":                   "Shop-Prod",
	}

	for name, want := range cases {
		if got := database(name); got != want {
			t.Errorf("database(%q) = %q, want %q", name, got, want)
		}
	}
}
