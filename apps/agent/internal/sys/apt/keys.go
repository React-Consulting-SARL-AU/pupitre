package apt

import (
	"errors"
	"slices"
	"strings"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/sys"
)

// TLS only proves who served a key: one outside its vendor's pinned primaries, or from an unpinned URL, is refused.
var Pins = map[string][]string{
	"https://download.docker.com/linux/ubuntu/gpg":                  {"9DC858229FC7DD38854AE2D88D81803C0EBFCD88"},
	"https://dl.cloudsmith.io/public/caddy/stable/gpg.key":          {"65760C51EDEA2017CEA2CA15155B6D79CA56EA34"},
	"https://pkg.cloudflare.com/cloudflare-main.gpg":                {"CC94B39C77AE7342A68B89628A682D308D4E5E73", "FBA8C0EE63617C5EED695C43254B391D8CACCBF8"},
	"https://pkgs.tailscale.com/stable/ubuntu/jammy.noarmor.gpg":    {tailscaleFingerprint},
	"https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg":    {tailscaleFingerprint},
	"https://www.postgresql.org/media/keys/ACCC4CF8.asc":            {"B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8"},
	"https://www.mongodb.org/static/pgp/server-7.0.asc":             {"E58830201F7DD82CD808AA84160D26BB1785BA38"},
	"https://www.mongodb.org/static/pgp/server-8.0.asc":             {"4B0752C1BCA238C0B4EE14DC41DE058A4E7DCA05"},
	"https://dl.google.com/linux/linux_signing_key.pub":             {"EB4C1BFD4F042F6DDDCCEC917721F63BD38B4796", "4CCA1EAF950CEE4AB83976DCA040830F7FAC5991"},
	"https://downloads.1password.com/linux/keys/1password.asc":      {"3FEF9748469ADBE15DA7CA80AC2D62742012EA22"},
	"https://cli.github.com/packages/githubcli-archive-keyring.gpg": {"2C6106201985B60E6C7AC87323F3D4EA75716059", "7F38BBB59D064DBCB3D84D725612B36462313325"},
}

const tailscaleFingerprint = "2596A99EAAB33821893C0A79458CA832957F5868"

func DownloadKey(ctx sys.Context, url, path string) error {
	pinned, known := Pins[url]
	if !known {
		return errors.New(i18n.T("apt.key.unpinned", url))
	}

	if _, err := sys.Exec(ctx, sys.Command{Argv: sys.CurlText("-o", path, url)}); err != nil {
		return err
	}

	if err := verifyKey(ctx, path, pinned); err != nil {
		_ = ctx.Sys().Remove(path)

		return errors.New(i18n.T("apt.key.refused", url, err.Error()))
	}

	return nil
}

func verifyKey(ctx sys.Context, path string, pinned []string) error {
	out, err := sys.Exec(ctx, sys.Command{Argv: []string{"gpg", "--batch", "--with-colons", "--show-keys", path}})
	if err != nil {
		return err
	}

	held := PrimaryFingerprints(out.Stdout)
	if len(held) == 0 {
		return errors.New(i18n.T("apt.key.empty"))
	}

	for _, fingerprint := range held {
		if !slices.Contains(pinned, fingerprint) {
			return errors.New(i18n.T("apt.key.unexpected", fingerprint))
		}
	}

	return nil
}

// In gpg --with-colons, an fpr record belongs to the pub or sub just above it; only a pub's is a primary key.
func PrimaryFingerprints(listing string) []string {
	var fingerprints []string
	record := ""

	for _, line := range strings.Split(listing, "\n") {
		fields := strings.Split(strings.TrimSpace(line), ":")
		switch fields[0] {
		case "pub", "sub", "sec", "ssb":
			record = fields[0]
		case "fpr":
			if record == "pub" && len(fields) > 9 && fields[9] != "" {
				fingerprints = append(fingerprints, strings.ToUpper(fields[9]))
			}

			record = ""
		}
	}

	return fingerprints
}

// The armoured copy sits beside the keyring, never under a shared /tmp where a fixed name is anyone's to plant.
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
