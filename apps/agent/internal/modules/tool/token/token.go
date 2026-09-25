package token

import (
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/env"
)

func Store(ctx *modules.Context, step, key, value string) error {
	return ctx.Step(step, func() (modules.Outcome, error) {
		changed, err := env.Set(ctx, key, value)
		if err != nil {
			return modules.Failed, err
		}

		if !changed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func Export(ctx *modules.Context, step, key, value string) error {
	return ctx.Step(step, func() (modules.Outcome, error) {
		changed, err := shell.SetUserEnv(ctx, key, value)
		if err != nil {
			return modules.Failed, err
		}

		if !changed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func Forget(ctx *modules.Context, step string, keys ...string) error {
	return ctx.Step(step, func() (modules.Outcome, error) {
		forgotten := false

		for _, key := range keys {
			removed, err := env.Unset(ctx, key)
			if err != nil {
				return modules.Failed, err
			}

			exported, err := shell.UnsetUserEnv(ctx, key)
			if err != nil {
				return modules.Failed, err
			}

			forgotten = forgotten || removed || exported
		}

		if !forgotten {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}
