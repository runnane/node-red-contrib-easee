# CLAUDE.md

Entry point for Claude Code, and **load-bearing** — measured 2026-08-14 on Claude
Code 2.1.232, a project-root `AGENTS.md` with no `CLAUDE.md` is not discovered.
Shrink this file, never delete it. The project conventions live in **AGENTS.md**,
imported below so they load every session.

@AGENTS.md

Topic deep-dives are in [`.agents/`](.agents/) and are **not** auto-loaded — open the
relevant one on demand when working in that area:

- [`.agents/gates.md`](.agents/gates.md) — the gate command, why this repo is the one
  where npm muscle memory matters, what CI runs that the local gate does not, and why
  a green run here means very little
- [`.agents/compatibility.md`](.agents/compatibility.md) — the published-package
  compatibility surface: node type names, flow property names, credentials, and what
  renaming one does to a stranger's flow on upgrade
- [`.agents/testing.md`](.agents/testing.md) — what the 80 tests actually cover (not
  much), the coverage floor and how to raise it, and the jest threshold trap that made
  a 99% floor pass

## Commands — you invoke these

These come from the **userspace bundle** (`runnane/agent-userspace`), not from this
repo. Bare `/name` on a workstation, or `/agent-userspace:name` when loaded with
`--plugin-dir`. They read [`.agents/repo.json`](.agents/repo.json) to learn this repo's
gate command, tracker project, CI and release model, so they behave correctly here
without carrying a paragraph about EASEE.

- `/fix <EASEE-n>` — one issue end to end: branch, implement, gates, PR, tracker.
- `/auto <EASEE-1 EASEE-2 …>` — a given, ordered list, worked serially and autonomously.
- `/sweep` — discovers its own queue and fans out to subagents in worktrees.
- `/plan`, `/research` — think first, record the outcome on the issue.

Three skills load on their own when they apply, also from the bundle: `gate-failures`
(a gate went red), `pr-hygiene` (opening or verifying a PR) and `agent-isolation`
(whose checkout is this). This repo's own gate particulars are in
[`.agents/gates.md`](.agents/gates.md).

**There is no `.claude/commands/` here, and there should not be.** The shared command
bodies were hoisted into the bundle across the whole set; a copy in this repo would be
a fork of them that drifts silently. See "How agent instructions reach this repo" in
AGENTS.md.
