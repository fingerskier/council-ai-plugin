# Memory: Publish Readiness

Durable conclusion on whether/how this plugin ships to the public, and the bar a
v0.1 open-source drop has to clear.

## Decision

The plugin is **structurally sound and ready to publish**; the only things that
ever blocked a public drop were **docs and hygiene, not code**. All four seats
agreed, and the readiness claim is evidence-backed: QA ran both conformance gates
against a real live record plus the fixtures (all pass, mutually consistent — the
spec dogfoods itself), and security's leakage scan of all tracked files came back
clean (no creds, no home-paths). The **v0.1 bar is "honest, installable, doesn't
leak"** — not "complete" — and the gate to actually tag it is the PM's readiness
metric: a stranger, from the README alone, can state in one sentence why a council
beats a plain agent *and* reach a running `/council convene` without asking.

Two must-fixes were made and committed this session (`ac221f7`): a root
`.gitignore` (`skidl.*`, `*.log`, `*.erc`, OS cruft) that closes the only PII
vector (untracked `skidl.*` files embedding `C:\dev\fingerskier\...`), and a README
rewrite — value-prop "why a council" hook, Install section, Trust-model note (with
a POSIX-shell caveat), corrected Status.
→ record: `records/20260608-082623-publish-readiness.md`

## Why

A solo agent doesn't disagree with itself, and the same risk applies to "is this
ready?" — so the question was put to the full roster. The convergence (sound
structure, doc/hygiene gaps only) is what made same-session fixes sufficient
instead of another review cycle. The bar was held deliberately at v0.1 minimalism:
ship honest/installable/non-leaking, not exhaustive.

## Deferred to v0.2 (explicitly parked, not settled)

- `plugin.json` `author`/`homepage`/`repository` metadata.
- Keep-vs-untrack the tracked dogfood `.council/` — kept + documented for v0.1; the
  untrack question is a v0.2 decision, not re-litigated for the first drop.
- `dogfood.cmd`/`dogfood.sh` asymmetry — commit both or drop one.
- Security hardening: wrap injected seat/memory/scratch in `<untrusted>` delimiters.
  Owed **before councils become shareable**, not before v0.1.

## Standing dissent (security-engineer)

The prompt-injection surface is **documented, not fixed**. Seat and memory files
are injected *verbatim* into bash-capable `work` workers, and the git worktree is a
soft guardrail on the *same channel* as attacker-authored text — not a sandbox.
Adopting a shared/third-party council preset, or pulling a repo with an
attacker-authored `.council/memory`, yields arbitrary edit/exec under the user's
creds. Acceptable for v0.1 (requires adopting an untrusted `.council/`), but it is
THE path the moment councils become shareable — the `<untrusted>`-delimiter
hardening is owed before any council-sharing feature lands. The dormant
QA-vs-PM drift-control-vs-process-overhead tension (see
[[council-record-and-memory-format]]) did not fire this session — no format changed.
