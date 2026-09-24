package main

import (
	"bufio"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/backup/seal"
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

// The secret comes on standard input, never on the command line where ps would show it.
func runBackup(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	if len(args) == 0 || args[0] != "open" {
		fmt.Fprintln(stderr, i18n.T("cli.backup.usage"))

		return 2
	}

	var salt, path string
	iterations := contract.Backup.KDF.Iterations
	byKey := false

	for _, arg := range args[1:] {
		switch {
		case strings.HasPrefix(arg, "--salt="):
			salt = strings.TrimPrefix(arg, "--salt=")
		case strings.HasPrefix(arg, "--iterations="):
			parsed, err := strconv.Atoi(strings.TrimPrefix(arg, "--iterations="))
			if err != nil || parsed <= 0 {
				fmt.Fprintln(stderr, i18n.T("cli.argument.unknown", arg))

				return 2
			}
			iterations = parsed
		case arg == "--private-key":
			byKey = true
		case strings.HasPrefix(arg, "-") || path != "":
			fmt.Fprintln(stderr, i18n.T("cli.argument.unknown", arg))
			fmt.Fprintln(stderr, i18n.T("cli.backup.usage"))

			return 2
		default:
			path = arg
		}
	}

	if path == "" || (salt == "" && !byKey) {
		fmt.Fprintln(stderr, i18n.T("cli.backup.usage"))

		return 2
	}

	if err := openPart(path, secretLine(stdin), salt, iterations, byKey, stdout); err != nil {
		fmt.Fprintln(stderr, i18n.T("cli.backup.failed", path, openFailure(err)))

		return 1
	}

	return 0
}

func secretLine(stdin io.Reader) string {
	line, _ := bufio.NewReader(stdin).ReadString('\n')

	return strings.TrimRight(line, "\r\n")
}

func openPart(path, secret, salt string, iterations int, byKey bool, out io.Writer) error {
	private, err := seal.DecodeKey(secret)
	if !byKey {
		var identity seal.Identity
		identity, err = seal.Derive(secret, salt, iterations)
		private = identity.PrivateKey
	}
	if err != nil {
		return err
	}

	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	opened, err := seal.NewReader(file, private)
	if err != nil {
		return err
	}

	unzipped, err := gzip.NewReader(opened)
	if err != nil {
		return err
	}

	_, err = io.Copy(out, unzipped)

	return err
}

func openFailure(err error) string {
	switch {
	case errors.Is(err, seal.ErrDoesNotOpen):
		return i18n.T("cli.backup.wrong")
	case errors.Is(err, seal.ErrDecomposed):
		return i18n.T("cli.backup.decomposed")
	case errors.Is(err, seal.ErrNotABackup), errors.Is(err, seal.ErrHeaderOnly), errors.Is(err, seal.ErrChunkSize):
		return i18n.T("cli.backup.foreign")
	case errors.Is(err, seal.ErrKeySize):
		return i18n.T("cli.backup.key")
	}

	return err.Error()
}
