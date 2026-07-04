# Memory: Session workflow roadmap

Durable roadmap from the full-council review of the deliberation logic, UX, and
workflow. The architecture needs no structural change; this topic carries the
ranked cleanup plan and the rulings behind it.

## Decision

**The core design is sound** (personalities-as-data, one orchestrator,
chair-routes-and-synthesizes, two-tier memory, five fireable stop triggers, two
mechanical gates). The remaining work is operational edges and doc hygiene, in
this priority order:

1. **Audit-commit hardening — blocking for continued dogfood use** (security-engineer;
   mechanical forms qa-engineer). Pin the audit commit, both verbs, as an explicit
   path allowlist — `git add .council/records/<id>.md .council/records/<id>.scratch.md
   .council/memory/`, never `-A`/`-am`; give work step 6b a failure action (halt,
   report escaped paths, never commit) plus a session-start `git status --porcelain`
   snapshot diff at turn boundaries; add secret hygiene in the same commit step
   (seat-prompt "never quote credential or secret values" line + pre-commit
   secret-shape grep). Not a third gate. The settled auto-commit-on-current-branch
   decision is safe *because of* the pinned pathset.
2. **README fix → stranger cold read → tag v0.1** (product-manager, user). The
   install contradiction blocks the tag — see [[publish-readiness]].
3. **Conformance script + test wiring** (qa-engineer). `test/council-conformance.test.js`
   over `examples/sample-council/` and `.council/`: both gates, both directions;
   closure lines anchored at column 0 (corpus prose discusses the literal markers —
   a naive grep false-positives); pinned grandfather list of exactly
   `20260607-210234-implement-phase-2` and `20260607-213032-review-phase-2` (no
   scratch archives — they predate archive-don't-delete; never a silent skip);
   eight-pattern secret-shape scan (corpus dry-run clean); history invariant
   "commits touching `.council/records|memory` touch only allowlisted paths,"
   armed from a pinned cutoff SHA (legacy mixed commits are deliberate bundles —
   you cannot audit intent, only paths). Plus `package.json` test script + minimal
   CI: the existing tests are dark today.
4. **Pin routing/budget semantics, then verb signals** (staff-engineer). Ruling:
   routing is orchestrator-inline (chair spawned only for synthesis/adjudication);
   entry form `## Turn N — <chair> — routing` / `— adjudication` pinned, with every
   non-chair turn's sub-goal in the nearest preceding chair entry; `max_turns`
   counts spawned seat turns only (see [[work-verb-stop-triggers]]). Then the
   `work` per-turn progress line and the meeting `Round N · scratchpad NN KB`
   header — signals, not knobs; no meeting budget field ships.
5. **`info` = status page; sessions die cleanly** (product-manager, staff-engineer,
   security-engineer). `info` lists open follow-ups (grep `^- \[ \]` across records;
   closing stays a manual checkbox edit, pinned in one sentence) and dangling
   scratchpads/worktrees; preflight offers resume-or-archive for an orphaned
   scratchpad; a crashed `work` branch is labeled **unaudited** (archive-or-delete,
   never mergeable-looking); acted-on scratchpad header fields parse from the
   header block only, never last-match; seat-spawn failure = note, continue round,
   skip a twice-failed seat; Claude meeting seats use a read-only agent type where
   the host offers one (mirrors the Codex worker/default split — capability, not
   persuasion; stops mutation, not disclosure).

→ record: `records/20260704-111118-deliberation-ux-review.md`

## Why

Each fix is the smallest change closing a specific per-verb user loss (PM's
frame: stranger/README, returning-user/`info`, decision-owner/meeting signal,
delegator/`work` progress). Commit scoping outranks everything because it guards
the user's own branch today and history cannot distinguish a sweep from a bundle
after the fact. Signals beat knobs per the stop-trigger principle — an
indefensible threshold is a false guardrail. Semantics get pinned before UX is
built on them because unpinned structure drifts: the routing-entry form already
exists in dogfood by one chair's good taste only, and chair turns silently ate
half a real session's budget.

## Parked (named triggers)

- **Seat rotation (rotate the round's starting seat):** cut by PM under
  delegated authority — no dogfood evidence of anchoring bias. Revisit only if a
  record shows the opening seat's frame surviving a multi-round meeting
  unchallenged.
- Re-affirmed, not reopened: no meeting budget knob, no third gate, no
  follow-ups ledger/statuses/auto-injection.
