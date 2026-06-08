# Record — Publish-readiness review: ship v0.1 after docs + hygiene fixes

A meeting to answer "are we ready to publish, and what needs cleanup (esp. docs)?"
The council found the plugin structurally sound; blockers were docs and hygiene,
not code. Two were fixed and committed mid-session; the rest are non-blocking v0.2
follow-ups.

- **Session:** 20260608-082623-publish-readiness
- **Mode:** meeting
- **Concluded:** 2026-06-08 08:59
- **Chair:** staff-engineer
- **Seats:** staff-engineer, security-engineer, qa-engineer, product-manager
- **Task:** I think we're ready to publish this; anything that needs to be cleaned up (especially docs)?

## Recommendation

**Ship it.** The plugin is structurally sound and ready to publish; the only
blockers were docs and hygiene, and the two that mattered most were fixed and
committed this session (`ac221f7`): a root `.gitignore` now stops the only
PII-leak vector (untracked `skidl.*` files embedding `C:\dev\fingerskier\...`),
and the README now carries the four gaps that made it un-publishable — a "why a
council" value-prop hook, an Install section, a Trust-model note (with the
POSIX-shell caveat), and a corrected Status. The minimal remaining gate before
tagging v0.1 is the **PM's readiness bar**: a stranger working from the README
alone can say in one sentence why a council beats a plain agent *and* reach a
running `/council convene` without asking. That bar is now met on paper — confirm
it with one cold read of the published README, and drop v0.1. The three deferred
items (`plugin.json` `author`/`homepage`/`repository`, keep-vs-untrack the tracked
dogfood `.council/`, `dogfood.cmd`/`.sh` asymmetry) are real but non-blocking; file
them as v0.2 follow-ups.

## Reasoning trail

What was weighed, and why the call holds:

- **Consensus on the core: structure is correct, blockers are hygiene/docs not
  code.** All four seats independently landed here. Staff found the plugin
  "coherent/correct as shipped." That converts a scary "are we ready to
  open-source?" into a bounded checklist, which is why same-session fixes were
  sufficient rather than another review cycle.
- **The evidence was verified, not asserted.** QA ran *both* conformance gates
  against a real live record (`records/20260607-230913-implement-phase-4.md`) and
  against the fixtures — both PASS, mutually consistent. The spec dogfoods itself
  and obeys its own gates; that is the strongest single piece of readiness
  evidence. Security ran a leakage scan across all tracked files — clean, no
  creds, no home-paths — isolating the *only* PII vector to the untracked
  `skidl.*` artifacts, which the new `.gitignore` now covers.
- **Two fixes shipped this session (`ac221f7`).** (1) Root `.gitignore`
  (`skidl.*`, `*.log`, `*.erc`, OS cruft) — closes the security must-fix. (2)
  README rewrite — value-prop hook, Install section (clone + `claude
  --plugin-dir`, marketplace pointer), Trust-model section (verbatim seat/memory
  injection; worktree is a soft guardrail, not a sandbox; POSIX-shell caveat), and
  a Status rewrite (all four verbs implemented and dogfooded; per-seat routing
  declined; recreate-merge deferred). A cross-seat escalation shaped this: QA
  surfaced the bare `date +%s` / `mkdir -p` POSIX-shell issue as an own-lane "one
  doc line" item, and the PM pulled it *up* to must-do — a silent disarm of the
  Phase-4 wall-clock safety trigger is a trust bug, not a footnote. It landed in
  the Trust section's caveat.
- **Alternatives considered and deliberately deferred.** Untracking the 16 tracked
  dogfood `.council/` files (resolved as keep-and-document for v0.1; untrack is a
  v0.2 question). Security's `<untrusted>`-delimiter hardening around injected
  seat/memory content (correct direction, but only matters once councils are
  shared, so post-v0.1). A full `SECURITY.md` (held to one paragraph by the PM's
  scope-line). Each was deferred on the same principle: v0.1's bar is "honest,
  installable, doesn't leak," not "complete."

## Dissents (preserved)

No hard dissent. This was a high-consensus meeting — all four seats agreed the
structure is sound and the gaps were docs/hygiene. QA explicitly declined to raise
its stricter-conformance dissent (no format change ships this publish). What
remains are **standing tensions**, dormant but live, that should not be flattened
into the recommendation:

- **security-engineer:** The injection surface is real and is only *documented*,
  not fixed. Seat and memory files are injected *verbatim* into bash-capable
  `work` workers; the git worktree is a soft guardrail on the *same channel* as
  attacker-authored text, not a sandbox. The attack path — adopt a shared/
  third-party council preset, or pull a repo carrying an attacker-authored
  `.council/memory`, and get arbitrary edit/exec under the user's creds — is in
  the README's Trust section but **not mitigated in code**. Acceptable for v0.1
  (it requires adopting an untrusted `.council/`), but it is THE path the moment
  councils become shareable, and the `<untrusted>`-delimiter hardening is owed
  before that feature lands.
- **qa-engineer / product-manager (standing trade-off):** stricter conformance
  gates (QA's drift-control instinct) vs. keeping process overhead low (PM's v0.1
  instinct). Dormant this session because no format changed — not resolved; it
  resurfaces the next time the record format moves.
- **product-manager (scope-line, holds):** do not re-litigate tracked-vs-untracked
  `.council/` for v0.1, and do not let the security note grow into a full
  `SECURITY.md`. Both correct *for v0.1* — but both are explicitly parked, not
  settled; the v0.2 conversation inherits them.

## Follow-ups

- [ ] Cold-read the published README to confirm the PM readiness bar before tagging v0.1 (owner: user)
- [ ] Add `author`/`homepage`/`repository` to `plugin.json` (owner: user)
- [ ] Decide keep-vs-untrack the tracked dogfood `.council/` (owner: user)
- [ ] Resolve `dogfood.cmd`/`dogfood.sh` asymmetry — commit both or drop one (owner: user)
- [ ] (v0.2, before councils become shareable) wrap injected seat/memory/scratch in `<untrusted>` delimiters (owner: security-engineer)

→ memory updated: `memory/publish-readiness.md`
