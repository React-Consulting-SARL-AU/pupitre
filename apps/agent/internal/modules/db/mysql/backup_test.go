package mysql

import (
	"io"
	"slices"
	"strconv"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
)

func TestTheSystemDatabasesAreNeverListed(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("SHOW DATABASES", "information_schema\nintranet\nmysql\nperformance_schema\nsys\n")

	names, err := Databases(modtest.NewContext(t, fake, modtest.Options{Manifest: manifest()}))
	if err != nil || !slices.Equal(names, []string{"intranet"}) {
		t.Fatalf("names = %v, %v", names, err)
	}
}

func TestTheHandMadeAccountsAreCarriedWithTheirDigestsAndTheirGrants(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("SELECT CONCAT(QUOTE(User)", "'reporting'@'%'\n'shop'@'localhost'\n")
	fake.Answer("SHOW CREATE USER 'reporting'@'%'", "CREATE USER `reporting`@`%` IDENTIFIED WITH 'caching_sha2_password' AS 0x24410030\nGRANT USAGE ON *.* TO `reporting`@`%`\nGRANT `readers`@`%` TO `reporting`@`%`\n")
	fake.Answer("SHOW CREATE USER 'shop'@'localhost'", "CREATE USER `shop`@`localhost` IDENTIFIED WITH 'caching_sha2_password' AS 0x2441\nGRANT ALL PRIVILEGES ON `shop`.* TO `shop`@`localhost`\n")
	ctx := modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: modtest.Values{"engine": "mysql", "app_user": "app", "remote_user": "dev"}})

	var out strings.Builder
	if err := DumpUsers(ctx, &out); err != nil {
		t.Fatal(err)
	}

	want := strings.Join([]string{
		"DROP USER IF EXISTS 'reporting'@'%'",
		"CREATE USER `reporting`@`%` IDENTIFIED WITH 'caching_sha2_password' AS 0x24410030",
		"DROP USER IF EXISTS 'shop'@'localhost'",
		"CREATE USER `shop`@`localhost` IDENTIFIED WITH 'caching_sha2_password' AS 0x2441",
		"GRANT USAGE ON *.* TO `reporting`@`%`",
		"GRANT `readers`@`%` TO `reporting`@`%`",
		"GRANT ALL PRIVILEGES ON `shop`.* TO `shop`@`localhost`",
		"FLUSH PRIVILEGES",
	}, ";\n") + ";\n"
	if out.String() != want {
		t.Fatalf("every account is made before any grant names it:\n%s", out.String())
	}

	listing := fake.Commands()[0]

	for _, kept := range []string{"'root'", "'mysql.sys'", "'debian-sys-maint'", "'app'", "'dev'"} {
		if !strings.Contains(listing, kept) {
			t.Fatalf("%s is the server's or the module's, never carried: %s", kept, listing)
		}
	}

	if !strings.Contains(fake.Commands()[1], "print_identified_with_as_hex = ON") {
		t.Fatalf("a MySQL digest travels in hex: %s", fake.Commands()[1])
	}

	if err := RestoreUsers(ctx, strings.NewReader(out.String())); err != nil {
		t.Fatal(err)
	}

	if string(fake.FedTo("mysql --protocol=socket --default-character-set=utf8mb4")) != want {
		t.Fatal("the restore replays the script as written")
	}
}

func TestMariaDBDigestsAreTextAlready(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("SELECT CONCAT(QUOTE(User)", "'shop'@'localhost'\n")
	fake.Answer("SHOW CREATE USER", "CREATE USER `shop`@`localhost` IDENTIFIED BY PASSWORD '*6BB4837EB74329105EE4568DDA7DC67ED2CA2AD9'\n")
	ctx := modtest.NewContext(t, fake, modtest.Options{Manifest: manifest(), Values: modtest.Values{"engine": "mariadb"}})

	if err := DumpUsers(ctx, io.Discard); err != nil {
		t.Fatal(err)
	}

	if strings.Contains(fake.Commands()[1], "print_identified_with_as_hex") {
		t.Fatalf("MariaDB has no such variable, and would refuse the whole statement: %s", fake.Commands()[1])
	}
}

func TestAServerWithoutHandMadeAccountsWritesAnEmptyScript(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("SELECT CONCAT(QUOTE(User)", "")
	ctx := modtest.NewContext(t, fake, modtest.Options{Manifest: manifest()})

	var out strings.Builder
	if err := DumpUsers(ctx, &out); err != nil || out.String() != "FLUSH PRIVILEGES;\n" {
		t.Fatalf("out %q, %v", out.String(), err)
	}
}

func TestADumpCarriesWhatMakesTheDatabaseAgain(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("mysqldump", "CREATE DATABASE intranet;")
	ctx := modtest.NewContext(t, fake, modtest.Options{Manifest: manifest()})

	var out strings.Builder
	if err := DumpTo(ctx, "intranet", &out); err != nil {
		t.Fatal(err)
	}

	line := strings.Join(fake.Calls[0].Argv, " ")
	if out.String() != "CREATE DATABASE intranet;" || !strings.Contains(line, "--single-transaction") || !strings.HasSuffix(line, "--databases intranet") {
		t.Fatalf("out %q, line %s", out.String(), line)
	}

	if err := RestoreFrom(ctx, "intranet", 25, strings.NewReader("CREATE DATABASE intranet;")); err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(strings.Join(fake.Commands(), "\n"), "DROP DATABASE IF EXISTS `intranet`") || string(fake.FedTo("--default-character-set=utf8mb4")) == "" {
		t.Fatalf("commands = %v", fake.Commands())
	}
}

const gib = int64(1) << 30

func dfAnswer(available int64) string {
	return "Filesystem 1-blocks Used Available Capacity Mounted on\n/dev/sda1 42949672960 0 " + strconv.FormatInt(available, 10) + " 90% /\n"
}

func TestADatabaseTheDiskCannotHoldAgainIsNeverDropped(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("information_schema.tables WHERE table_schema = 'intranet'", strconv.FormatInt(gib, 10)+"\n")
	fake.Answer("df -P -B1 /var/lib/mysql", dfAnswer(gib))
	ctx := modtest.NewContext(t, fake, modtest.Options{Manifest: manifest()})

	err := RestoreFrom(ctx, "intranet", 3*gib, strings.NewReader("CREATE DATABASE intranet;"))
	if err == nil || !strings.Contains(err.Error(), "/var/lib/mysql") {
		t.Fatalf("err = %v", err)
	}

	if commands := strings.Join(fake.Commands(), "\n"); strings.Contains(commands, "DROP DATABASE") || fake.FedTo("--default-character-set") != nil {
		t.Fatalf("a restore that cannot fit leaves the database as it is:\n%s", commands)
	}
}

func TestWhatTheDropGivesBackCountsTowardsTheRoom(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("information_schema.tables WHERE table_schema = 'intranet'", strconv.FormatInt(3*gib, 10)+"\n")
	fake.Answer("df -P -B1 /var/lib/mysql", dfAnswer(gib))
	ctx := modtest.NewContext(t, fake, modtest.Options{Manifest: manifest()})

	if err := RestoreFrom(ctx, "intranet", 3*gib, strings.NewReader("CREATE DATABASE intranet;")); err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(strings.Join(fake.Commands(), "\n"), "DROP DATABASE IF EXISTS `intranet`") {
		t.Fatalf("commands = %v", fake.Commands())
	}
}
