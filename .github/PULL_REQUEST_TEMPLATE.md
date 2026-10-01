## What this changes

<!-- One sentence: what is delivered, and why. Link the issue it closes: "Closes #123". -->

## What proves it

<!-- One box per verified behaviour, checked when a test establishes it. -->

- [ ]

## Checks

<!-- The last lines of `bun run lint`, `bun run check:types`, `bun run test`, `bun run build`, and of `go vet` / `go test` if the agent is touched. -->

- [ ] The pull request targets `staging`, not `main`.
- [ ] A contract that crosses a boundary (app ↔ agent, app ↔ platform, console ↔ API) is typed in `packages/shared` first.
- [ ] A changed configuration file shape comes with its numbered migration.
- [ ] User-facing text exists in English and French.
