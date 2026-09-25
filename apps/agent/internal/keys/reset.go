package keys

import (
	"path/filepath"
	"strings"
	"time"

	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

func ParsePublic(line string) (Key, error) {
	trimmed := strings.TrimSpace(line)
	if strings.ContainsAny(trimmed, "\r\n") {
		return Key{}, ErrKeyRefused
	}

	fields := strings.Fields(trimmed)
	if len(fields) < 2 {
		return Key{}, ErrKeyRefused
	}

	return ParseApproved(fields[0] + " " + fields[1])
}

// The way back when every device is lost, run from the hosting console: block and trust keep exactly one key.
func Reset(ctx sys.Context, target Target, signersPath string, key Key, now time.Time) error {
	if target.Owner != "" {
		if err := file.MkdirOwned(ctx, filepath.Dir(target.Path), target.Owner, target.Owner, signersDir); err != nil {
			return err
		}
	}

	trust := Trust{Signers: []Signer{{PublicKey: key.Bare(), Via: ViaReset, Since: stamp(now)}}}
	if err := trust.Save(ctx, signersPath, now); err != nil {
		return err
	}

	_, err := Sync(ctx, target, []Key{{Type: key.Type, Blob: key.Blob}})

	return err
}
