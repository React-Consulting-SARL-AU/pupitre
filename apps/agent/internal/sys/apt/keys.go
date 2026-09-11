package apt

import "pupitre.studio/agent/internal/sys"

var secureCurl = []string{"curl", "-fsSL", "--proto", "=https", "--tlsv1.2"}

// DownloadKey fetches a repository key over TLS 1.2 or better and nothing else: apt trusts whatever lands at path.
func DownloadKey(ctx sys.Context, url, path string) error {
	argv := append(append([]string{}, secureCurl...), "-o", path, url)
	_, err := sys.Exec(ctx, sys.Command{Argv: argv})

	return err
}

// DearmorKey turns an armoured key into the keyring apt reads. The armoured copy
// sits beside the keyring, root's alone, never under a shared /tmp where a fixed
// name is anyone's to plant.
func DearmorKey(ctx sys.Context, url, keyring string) error {
	armoured := keyring + ".asc"

	if err := DownloadKey(ctx, url, armoured); err != nil {
		return err
	}

	if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"gpg", "--batch", "--yes", "--dearmor", "-o", keyring, armoured}}); err != nil {
		return err
	}

	return ctx.Sys().Remove(armoured)
}
