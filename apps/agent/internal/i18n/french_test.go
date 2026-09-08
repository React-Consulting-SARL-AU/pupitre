package i18n

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strings"
	"testing"
)

// Files that legitimately hold French outside the catalogue, and why.
//
// Both are artefacts written to the client's disk, not phrases answered to the
// app: their content is compared byte for byte to decide whether the machine is
// already configured, so making it follow the session locale would break
// idempotence.
var frenchIsAllowed = map[string]string{
	"internal/modules/ai/agents/context.go": "the context corpus deployed for the client's AI agents",
	"internal/registry/registry.go":         "the header written into projects.conf",

	// Typed by hand in a login shell, outside any protocol session: nothing has
	// stated a locale by then. Making these follow the reader would mean holding
	// the language on the machine, or forwarding it over SSH — an open decision.
	"cmd/pupitred/cli_shot.go": "the shot command's usage text",
	"internal/devcli/run.go":   "the dev command's usage text",
}

// Unambiguous French words, for the phrases that carry no accent at all.
var frenchWords = map[string]bool{
	"le": true, "la": true, "les": true, "une": true, "des": true, "du": true,
	"dans": true, "pour": true, "avec": true, "que": true,
	"qui": true, "est": true, "sont": true, "cette": true, "aux": true,
	"leur": true, "elle": true, "nous": true, "vous": true, "chaque": true,
}

func TestFrenchLivesOnlyInTheCatalogue(t *testing.T) {
	root := filepath.Join("..", "..")

	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() || !strings.HasSuffix(path, ".go") {
			return err
		}

		if skipped(path) {
			return nil
		}

		return scan(t, path)
	})
	if err != nil {
		t.Fatal(err)
	}
}

func skipped(path string) bool {
	clean := filepath.ToSlash(path)

	for allowed := range frenchIsAllowed {
		if strings.HasSuffix(clean, allowed) {
			return true
		}
	}

	return strings.HasSuffix(clean, "_test.go") ||
		strings.Contains(clean, "internal/i18n") ||
		strings.Contains(clean, "modtest") ||
		strings.Contains(clean, "/testdata/")
}

func scan(t *testing.T, path string) error {
	t.Helper()

	file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
	if err != nil {
		return err
	}

	ast.Inspect(file, func(node ast.Node) bool {
		literal, ok := node.(*ast.BasicLit)
		if !ok || literal.Kind != token.STRING {
			return true
		}

		if text := strings.Trim(literal.Value, "`\""); looksFrench(text) {
			t.Errorf("%s: French outside the catalogue — %q. Give it a key in internal/i18n and render it with i18n.T.", path, text)
		}

		return true
	})

	return nil
}

func looksFrench(text string) bool {
	if strings.ContainsAny(text, "éèêëàâäîïôöûüùçœÉÈÊËÀÂÄÎÏÔÖÛÜÙÇŒ") {
		return true
	}

	for _, word := range strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !('a' <= r && r <= 'z')
	}) {
		if frenchWords[word] {
			return true
		}
	}

	return false
}
