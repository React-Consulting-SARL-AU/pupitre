package i18n

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"unicode"
)

// The places through which a phrase reaches the app or the terminal. Anything passing through here comes from the catalogue, or nowhere.
var sinks = map[string]bool{
	"NewError":   true,
	"WithFix":    true,
	"Warn":       true,
	"badRequest": true,
	"line":       true,
}

// An error built inside a module step is what the report shows for that step.
var stepErrors = map[string]bool{
	"Errorf": true,
	"New":    true,
}

var verbs = regexp.MustCompile(`%[-+# 0-9.]*[a-zA-Z%]`)

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

			if name(value.Fun) == "Step" {
				blameStepErrors(t, path, value)
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

// A step's closure is where a failure gets its words: an error built there lands in the report as it is.
func blameStepErrors(t *testing.T, path string, step *ast.CallExpr) {
	t.Helper()

	for _, arg := range step.Args {
		closure, ok := arg.(*ast.FuncLit)
		if !ok {
			continue
		}

		ast.Inspect(closure.Body, func(node ast.Node) bool {
			if call, ok := node.(*ast.CallExpr); ok && stepErrors[name(call.Fun)] && len(call.Args) > 0 {
				blame(t, path, call.Args[0])
			}

			return true
		})
	}
}

// blame: a phrase is recognized by a space between words — "db.postgres" is an identifier, "%-24s %s" a layout, "Mot de passe" interface text. It looks through concatenations and formatting to the literal underneath.
func blame(t *testing.T, path string, node ast.Node) {
	t.Helper()

	switch value := node.(type) {
	case *ast.BinaryExpr:
		blame(t, path, value.X)
		blame(t, path, value.Y)
	case *ast.CallExpr:
		if (name(value.Fun) == "Sprintf" || name(value.Fun) == "Errorf") && len(value.Args) > 0 {
			blame(t, path, value.Args[0])
		}
	case *ast.BasicLit:
		if value.Kind == token.STRING && phrase(strings.Trim(value.Value, "`\"")) {
			t.Errorf("%s: a visible phrase outside the catalogue — %q", path, strings.Trim(value.Value, "`\""))
		}
	}
}

func phrase(text string) bool {
	words := strings.TrimSpace(verbs.ReplaceAllString(text, ""))
	if !strings.Contains(words, " ") {
		return false
	}

	return strings.ContainsFunc(words, unicode.IsLetter)
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
