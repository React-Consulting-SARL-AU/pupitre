# Code preferences

## Comments

- By default, **no comments**. The code should read through its names and its
  structure.
- Never a block, banner or separator comment (`// === Section ===`,
  `/* ---- Helpers ---- */`, lines of dashes).
- When modifying an existing function, do not comment what changed, why the
  branch was added, or what the old version did. That belongs in the commit
  message, not in the source.
- Never a comment that repeats the code (`// fetch user`, `// loop over items`,
  `// return result`).
- Never a comment that cites the task, the PR, the ticket or the caller
  (`// added for X flow`, `// used by Y`, `// fixes #123`).
- Never commented-out code, nor `// removed X` / `// old version` markers.
  Delete it — git is the memory.
- A comment is only acceptable when the **why** is genuinely not obvious: a
  hidden constraint, a subtle invariant, a workaround for a specific bug, a
  behaviour that would surprise a careful reader. One short line, never a
  paragraph.
- When in doubt, remove the comment.

## Formatting

- **Blank lines between the logical blocks** of a function: between the
  declarations and the work that consumes them, between the steps (validation,
  reading, transformation, return), after early-return guards, before a `return`
  when the body is more than a couple of lines.
- No wall of dense code. Readability beats compactness.
- The project's formatter and linter (Biome, Prettier, ESLint, ruff, gofmt,
  rustfmt…) are authoritative; these preferences sit on top and never contradict
  them.

## Cleanliness

- Clean code = explicit names + clear structure + minimal noise. A comment is a
  last resort, not a habit.
- Prefer extracting a well-named function over writing a comment above a block.
- Tempted to write a comment? Try renaming first. Only keep the comment if the
  *why* genuinely cannot be expressed in code.
