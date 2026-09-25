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

// An artefact on the client's disk is compared byte for byte for idempotence, so it cannot follow the session locale.
var frenchIsAllowed = map[string]string{
	"internal/modules/ai/agents/context.go": "the context corpus deployed for the client's AI agents",
}

var frenchWords = map[string]bool{
	"le": true, "la": true, "les": true, "une": true, "des": true, "du": true,
	"dans": true, "pour": true, "avec": true, "que": true,
	"qui": true, "est": true, "sont": true, "cette": true, "aux": true,
	"leur": true, "elle": true, "nous": true, "vous": true, "chaque": true,
	"invalide": true, "inconnu": true, "inconnue": true, "introuvable": true,
	"illisible": true, "aucun": true, "aucune": true, "rejeu": true,
	"fichier": true, "dossier": true, "manquante": true, "attend": true,
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
