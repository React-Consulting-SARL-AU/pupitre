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

// The places through which a phrase reaches the app. Anything passing through here comes from the catalogue, or nowhere.
var sinks = map[string]bool{
	"NewError":   true,
	"WithFix":    true,
	"Warn":       true,
	"badRequest": true,
}

var sinkFields = map[string]bool{
	"Summary":  true,
	"Label":    true,
	"Help":     true,
	"HintText": true,
}

func TestNoVisiblePhraseLivesOutsideTheCatalogue(t *testing.T) {
	root := filepath.Join("..", "..")

	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() || !strings.HasSuffix(path, ".go") {
			return err
		}

		if strings.HasSuffix(path, "_test.go") || strings.Contains(path, "internal/i18n") || strings.Contains(path, "modtest") {
			return nil
		}

		return check(t, path)
	})
	if err != nil {
		t.Fatal(err)
	}
}

func check(t *testing.T, path string) error {
	t.Helper()

	file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
	if err != nil {
		return err
	}

	ast.Inspect(file, func(node ast.Node) bool {
		switch value := node.(type) {
		case *ast.CallExpr:
			if name(value.Fun) != "" && sinks[name(value.Fun)] {
				for _, arg := range value.Args {
					blame(t, path, arg)
				}
			}
		case *ast.KeyValueExpr:
			if key, ok := value.Key.(*ast.Ident); ok && sinkFields[key.Name] {
				blame(t, path, value.Value)
			}
		}

		return true
	})

	return nil
}

// blame: a phrase is recognized by a space — "db.postgres" is an identifier, "Mot de passe" is interface text.
func blame(t *testing.T, path string, node ast.Node) {
	t.Helper()

	literal, ok := node.(*ast.BasicLit)
	if !ok || literal.Kind != token.STRING {
		return
	}

	text := strings.Trim(literal.Value, "`\"")
	if !strings.Contains(strings.TrimSpace(text), " ") {
		return
	}

	t.Errorf("%s: a visible phrase outside the catalogue — %q", path, text)
}

func name(expr ast.Expr) string {
	switch value := expr.(type) {
	case *ast.Ident:
		return value.Name
	case *ast.SelectorExpr:
		return value.Sel.Name
	}

	return ""
}
