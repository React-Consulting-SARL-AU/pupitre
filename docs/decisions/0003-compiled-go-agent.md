# 0003 — A compiled Go agent rather than scripts

Date: 2026-09-04 · Status: accepted

The server stack is rewritten as a single static Go binary, `pupitred`. The bash and zsh scripts in `server/` become the specification of the modules and disappear module by module.

Why: nothing readable on the customer's server, a single artifact to distribute and sign, a structured JSON protocol instead of ANSI to parse, idempotent steps that can be tested on a reinstalled staging. tmux remains the session manager: the agent drives it, it does not replace it.
