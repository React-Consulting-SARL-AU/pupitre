package agents

import (
	"io/fs"
	"regexp"
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/devcli"
)

var (
	codeSpan         = regexp.MustCompile("`([^`\n]+)`")
	commandSeparator = regexp.MustCompile(`\|\||&&|[|;(]`)
)

var devFlags = []string{devcli.JSONFlag, devcli.FollowFlag, "--follow", "-n", "--lines"}

// Markdown code: inline spans, fenced blocks, and indented blocks, which only open after a blank line.
func codeTexts(markdown string) []string {
	var texts []string

	fenced, indented, blank := false, false, true

	for _, line := range strings.Split(markdown, "\n") {
		trimmed := strings.TrimSpace(line)

		switch {
		case strings.HasPrefix(trimmed, "```"):
			fenced = !fenced
		case fenced:
			texts = append(texts, trimmed)
		case trimmed != "" && (strings.HasPrefix(line, "    ") || strings.HasPrefix(line, "\t")) && (blank || indented):
			indented = true
			texts = append(texts, trimmed)
		default:
			indented = indented && trimmed == ""

			for _, span := range codeSpan.FindAllStringSubmatch(line, -1) {
				texts = append(texts, span[1])
			}
		}

		blank = trimmed == ""
	}

	return texts
}

func devCommands(text string) [][]string {
	var commands [][]string

	for _, segment := range commandSeparator.Split(text, -1) {
		words := strings.Fields(strings.TrimPrefix(strings.TrimSpace(segment), "$ "))

		if len(words) > 0 && words[0] == "sudo" {
			words = words[1:]

			for len(words) > 0 && strings.HasPrefix(words[0], "-") {
				words = words[1:]
			}
		}

		if len(words) > 1 && words[0] == "pupitred" {
			words = words[1:]
		}

		if len(words) > 0 && words[0] == devcli.Command {
			commands = append(commands, words[1:])
		}
	}

	return commands
}

func placeholder(word string) bool {
	return strings.HasPrefix(word, "<") || strings.HasPrefix(word, "[")
}

func literalChoices(choices []string) bool {
	for _, choice := range choices {
		if strings.HasPrefix(choice, "$") || strings.HasPrefix(choice, "-") {
			return false
		}
	}

	return len(choices) > 0
}

func unknownDevCommands(markdown string) []string {
	verbs := map[string][]string{}

	for _, verb := range devcli.Grammar() {
		var first []string
		if len(verb.Args) > 0 {
			first = verb.Args[0]
		}

		verbs[verb.Name] = first
	}

	var unknown []string

	for _, text := range codeTexts(markdown) {
		for _, words := range devCommands(text) {
			if len(words) == 0 {
				continue
			}

			first, known := verbs[words[0]]

			switch {
			case placeholder(words[0]):
			case !known:
				unknown = append(unknown, text)
			case len(words) > 1 && !placeholder(words[1]) && !strings.HasPrefix(words[1], "-") && literalChoices(first) && !slices.Contains(first, words[1]):
				unknown = append(unknown, text)
			default:
				for _, word := range words[1:] {
					if strings.HasPrefix(word, "-") && !slices.Contains(devFlags, word) {
						unknown = append(unknown, text)

						break
					}
				}
			}
		}
	}

	return unknown
}

func TestTheCheckerCatchesADevCommandTheGrammarRefuses(t *testing.T) {
	sample := strings.Join([]string{
		"Run `dev status --json` or `dev logs <project> -f`.",
		"",
		"    dev up all",
		"    dev snapshot",
		"",
		"```",
		"echo row | dev project add",
		"sudo pupitred dev backup run",
		"dev db url --verbose",
		"```",
		"Then `bun run dev --host 127.0.0.1` and `next dev -p 3000`.",
	}, "\n")

	got := unknownDevCommands(sample)
	want := []string{"dev snapshot", "echo row | dev project add", "sudo pupitred dev backup run", "dev db url --verbose"}

	if !slices.Equal(got, want) {
		t.Fatalf("refused commands:\n got  %q\n want %q", got, want)
	}
}

func TestEveryDevCommandTheContentNamesIsOneTheGrammarAccepts(t *testing.T) {
	documents := map[string]string{"context": string(machineContext())}

	err := fs.WalkDir(content, "content", func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}

		body, err := content.ReadFile(path)
		documents[path] = string(body)

		return err
	})
	if err != nil {
		t.Fatal(err)
	}

	named := 0

	for path, body := range documents {
		for _, text := range codeTexts(body) {
			named += len(devCommands(text))
		}

		for _, command := range unknownDevCommands(body) {
			t.Errorf("%s names %q, which pupitred dev does not know", path, command)
		}
	}

	if named < 10 {
		t.Fatalf("only %d dev commands found in the content: the extraction no longer reads it", named)
	}
}
