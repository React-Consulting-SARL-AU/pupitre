package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/selfupdate"
)

const (
	maxPushedBytes = 256 << 20
	maxHeaderBytes = 4 << 10
)

type pushedHeader struct {
	Version   string `json:"version"`
	Signature string `json:"signature,omitempty"`
}

// The agent pushed by the app to a server it reaches as dev. sudo runs `pupitred binary install` exactly without a password, so
// what the signature covers rides the first line of standard input, and every flag is a line only the password opens.
func runBinary(upgrader *selfupdate.Upgrader, binaryPath string, args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	staged, ok := stagedFrom(args, stderr)
	if !ok {
		usage(stderr)

		return 2
	}

	input := bufio.NewReaderSize(stdin, maxHeaderBytes)

	header, err := readHeader(input)
	if err != nil {
		fmt.Fprintln(stderr, i18n.T("cli.binary.header.invalid", err.Error()))
		fmt.Fprintln(stderr, i18n.T("cli.binary.header.fix"))

		return 1
	}

	binary, err := io.ReadAll(io.LimitReader(input, maxPushedBytes+1))
	if err == nil && len(binary) == 0 {
		err = errors.New(i18n.T("cli.binary.empty"))
	}
	if err == nil && len(binary) > maxPushedBytes {
		err = errors.New(i18n.T("cli.binary.too_large", maxPushedBytes>>20))
	}
	if err != nil {
		fmt.Fprintln(stderr, err)

		return 1
	}

	staged.Version = header.Version
	staged.Signature = header.Signature
	staged.Binary = binary

	if _, err := upgrader.Place(staged); err != nil {
		return devcli.PrintFailure(stderr, err)
	}

	fmt.Fprintf(stdout, "%s  %s\n", selfupdate.Fingerprint(binary), binaryPath)

	return 0
}

func stagedFrom(args []string, stderr io.Writer) (selfupdate.Staged, bool) {
	if len(args) == 0 || args[0] != "install" {
		return selfupdate.Staged{}, false
	}

	var staged selfupdate.Staged
	seen := map[string]bool{}

	for _, arg := range args[1:] {
		if seen[arg] {
			fmt.Fprintln(stderr, i18n.T("cli.binary.argument.unknown", arg))

			return selfupdate.Staged{}, false
		}
		seen[arg] = true

		switch arg {
		case "--privileged":
			staged.Privileged = true
		case "--allow-downgrade":
			staged.AllowDowngrade = true
			staged.Privileged = true
		default:
			fmt.Fprintln(stderr, i18n.T("cli.binary.argument.unknown", arg))

			return selfupdate.Staged{}, false
		}
	}

	return staged, true
}

func readHeader(input *bufio.Reader) (pushedHeader, error) {
	line, err := input.ReadSlice('\n')
	if err != nil {
		return pushedHeader{}, err
	}

	decoder := json.NewDecoder(bytes.NewReader(line))
	decoder.DisallowUnknownFields()

	var header pushedHeader
	if err := decoder.Decode(&header); err != nil {
		return pushedHeader{}, err
	}

	if header.Version == "" || strings.ContainsFunc(header.Version, isSpace) {
		return pushedHeader{}, errors.New(i18n.T("cli.binary.version.expected"))
	}

	return header, nil
}

func isSpace(r rune) bool {
	return r == ' ' || r == '\t' || r == '\n' || r == '\r'
}
