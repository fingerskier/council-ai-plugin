---
name: council-orchestrator
description: Orchestrates a council of personality "seats" for Claude and Codex. Use when the user runs /council, asks to convene a council, hold a council meeting, inspect council info, or have the council work on a task. Handles the convene, info, meeting, and work verbs by reading .council/, spawning seat workers, driving the shared scratchpad, and having the chair synthesize.
---

# Council Orchestrator

A **council** is a set of named **seats** (personalities) plus a **chair** that
routes them and synthesizes their output. This skill runs the three council
verbs. You are the orchestrator - you do not voice the seats yourself; you spawn
a worker per seat using the host's worker facility carrying that seat's persona,
and you let the chair route and synthesize.

## Host adapter

The council's durable mechanics are host-neutral: bundled `templates/` and
`personalities/` seed a project-local `.council/`, and sessions write
`.council/scratch/`, `.council/records/`, and `.council/memory/`. Only the entry
point, plugin-root variable, and worker-spawn tool differ by host.

- **Claude Code:** the user invokes `commands/council.md` as `/council ...`.
  Treat `${CLAUDE_PLUGIN_ROOT}` as `COUNCIL_PLUGIN_ROOT`. Spawn seats with the
  Claude `Task` tool.
- **Codex:** the user invokes the skill conversationally, e.g.
  `council convene software-team`, `council info`,
  `council meeting "<task>"`, or `council work "<task>"`. Resolve
  `COUNCIL_PLUGIN_ROOT` as the installed plugin root that contains this
  `skills/council-orchestrator/SKILL.md` file plus the sibling `templates/` and
  `personalities/` directories. For seat workers, use `multi_agent_v1.spawn_agent`
  when available; if the tool is not loaded, discover it with `tool_search` using
  a query like `multi-agent spawn subagent`.

When the user asks to run a council meeting or work session in Codex, that
request is explicit permission to use sub-agents as the council's execution
mechanism. Do not set a model override for spawned agents unless the user
explicitly requests it.

## Where things live

- **Plugin library (read-only):** `COUNCIL_PLUGIN_ROOT/templates/*.yaml` and
  `COUNCIL_PLUGIN_ROOT/personalities/*.md`. The source material `convene`
  copies from.
- **The convened council (user-owned):** `.council/` in the working repo.
  ```
  .council/
  ├── council.yaml        # active council: name, chair, seats, work_budget
  ├── seats/<seat>.md     # editable copies of the seat personalities
  ├── memory/<topic>.md   # long-term council memory: one file per topic
  ├── scratch/<id>.md     # live shared scratchpad for one meeting/work session
  ├── records/<id>.md     # durable synthesized outputs
  └── worktrees/<id>/     # git worktrees for `work` sessions (ephemeral)
  ```

## Preflight (every verb except `convene`)

**Anchor the project root** (`ROOT="$(pwd)"`, or the absolute path the host
reports) and address every `.council/…` read and write as `$ROOT/.council/…`, never
a bare relative path — the Bash tool persists cwd across calls, so a relative path
is only safe while cwd happens to be the repo root. Read `$ROOT/.council/council.yaml`.
If it does not exist, tell the user the council hasn't been convened yet and to run
`/council convene [template]`, then stop. Otherwise note the `chair`, the `seats`,
and `work_budget`.

The **chair** is whichever seat `council.yaml` names. The chair routes (picks
which seats are relevant, who speaks/acts next) and synthesizes. Read the
chair's persona from `.council/seats/<chair>.md`.

**Interrupted sessions.** A meeting or work run can die before it records — a
crash, a closed terminal, a `work` the user walked away from. If you notice the
leftovers on any verb, surface them; do **not** silently resume or delete:
- A `$ROOT/.council/scratch/<id>.md` with **no** matching
  `$ROOT/.council/records/<id>.md` is an unconcluded session. Offer **resume or
  archive** — resume by reopening that scratchpad and continuing its loop, or
  archive it to `$ROOT/.council/records/<id>.scratch.md` (the same audit-preserving
  rename a clean conclude does) — never just delete it.
- A `council/work-<id>` branch whose session never recorded is **unaudited**:
  label it so, and offer archive-or-delete; never present it as mergeable, since
  nothing synthesized or reviewed what it holds.
- When you act on a scratchpad's header fields (Task, Session, Chair,
  Started(epoch)), parse them from the **header block only** — the fields above the
  first `---` — never by last-match across the file, since a later turn can quote a
  field name and a naive last-match would read the wrong value.

---

## Verb: convene

Create or recreate `.council/` from a template. No task runs.

**Anchor the project root first (cwd-drift guard).** Before anything else,
capture the working-repo root as an absolute path and pin it for the whole verb —
e.g. `ROOT="$(pwd)"` in the host shell (or note the absolute path the host
reports). Every `.council/…` artifact below is written under **`$ROOT/.council/…`**,
never a bare relative `.council/…`. Why: picking the template (step 1) reads
`COUNCIL_PLUGIN_ROOT/templates/`, and any `cd`/list/grep into the plugin tree can
drift the host shell's cwd there — and the Bash tool **persists cwd across calls** —
so a later relative `mkdir -p .council/…` or `cp … .council/…` would silently stamp
the council into the **read-only plugin dir** instead of the repo. Capturing `$ROOT`
*before* step 1 (while cwd is still the repo) and addressing every write absolutely
makes the writes immune to that drift. **Invariant:** the plugin `templates/` and
`personalities/` are read-only library material — **nothing is ever written under
`COUNCIL_PLUGIN_ROOT`**. (The `work` verb already pins worktrees by absolute path
for exactly this reason; convene gets the same rigor.)

1. **Pick the template.** If the user gave a name, use it. Otherwise list the
   templates in `COUNCIL_PLUGIN_ROOT/templates/` with their `description` as
   text, then ask which to use with the host's structured question tool when
   available: one question, up to four template options — `software-team` first,
   labeled `(Recommended)` — each option's description taken from the template's
   `description` field. When there are more than four templates, the text list
   above keeps the rest visible and the user picks an unlisted one by typing its
   name via "Other". (If structured questions are unavailable, ask in plain
   conversation; default `software-team`.)
2. **Guard existing council.** If `$ROOT/.council/council.yaml` already exists, warn
   that recreating will overwrite **`council.yaml` and the `seats/` copies** (where
   hand-edits live) and confirm before proceeding — ask with the
   **AskUserQuestion** tool, options **Cancel — keep the current council**
   first and **Recreate — overwrite roster and seats** second (plain
   conversation if the tool is unavailable). Do not clobber without a yes.
   Recreate is **scoped to those two**: it **never deletes `memory/`, `records/`,
   or `scratch/`**. The council's accumulated memory and audit trail are its most
   valuable, least-recreatable state, so a re-convene rebuilds the roster *around*
   them — it does not reset the council. (Even a confirmed recreate leaves memory
   and records intact; a user who truly wants a clean slate removes `.council/` by
   hand.)
3. **Create any missing tree dirs** — `mkdir -p`, never destructive:
   `$ROOT/.council/seats/`, `$ROOT/.council/memory/`, `$ROOT/.council/scratch/`,
   `$ROOT/.council/records/`. Existing `memory/` and `records/` content is left
   untouched (step 2).
4. **Write `$ROOT/.council/council.yaml`** from the chosen template
   (`COUNCIL_PLUGIN_ROOT/templates/<name>.yaml`).
5. **Copy the seats.** For each seat in the template's `seats:` list, copy
   `COUNCIL_PLUGIN_ROOT/personalities/<seat>.md` to `$ROOT/.council/seats/<seat>.md`.
6. **Leave `memory/` empty.** Memory is one markdown file per topic, created by
   the chair when a meeting or work session concludes — there's nothing to seed
   at convene time. (The directory exists from step 3.)
7. **Write `$ROOT/.council/.gitignore`** so ephemeral state isn't committed:
   ```
   scratch/
   worktrees/
   ```
8. **Report**: the council name, chair, and roster, and tell the user the files
   under `.council/seats/` and `.council/council.yaml` are theirs to edit
   (tweak a voice, add/remove a seat, change the chair or budget).

---

## Verb: info

Read-only. Print a concise table of the convened council. No session, no
workers, no writes.

1. **Preflight** as above — if `.council/council.yaml` is missing, tell the user
   to `convene` first and stop.
2. **Read the roster.** From `council.yaml` take `name`, `chair`, the `seats`
   list, `work_budget`, and the optional `memory_budget`. For each seat, read the
   frontmatter of `.council/seats/<seat>.md` for its `title` and `voice`.
3. **Print a table** — one row per seat, in `council.yaml` order, with the chair
   marked. Columns: seat (the `name`), title, voice. Head it with the council
   name, the chair, and the budget. For example:

   ```
   Council: software-team — chair: staff-engineer
   Budget: max_turns 12 · scratch 200k · memory 8k

     Seat                Title                Voice                                           Chair
     ──────────────────  ───────────────────  ──────────────────────────────────────────────  ─────
     staff-engineer      Staff Engineer       rigorous, systems-thinking, plain-spoken        ★
     security-engineer   Security Engineer    adversarial, threat-modeling, specific
     qa-engineer         QA Engineer          meticulous, edge-case-hunting, evidence-driven
     product-manager     Product Manager      user-centered, prioritizing, outcome-driven
   ```

   Pull `title`/`voice` straight from each seat's frontmatter; if a field is
   absent, leave it blank. **Omit budget fields the council doesn't set** — this
   includes the optional `max_wall_seconds` (render it, e.g. append ` · wall 1800s`,
   **only when present** in `work_budget`) and the optional
   `memory_budget.manifest_max_bytes` (append ` · memory 8k` **only when set `> 0`**).
   The example above sets no `max_wall_seconds`, so the banner omits it; it does set
   `memory_budget` (the default templates do), so ` · memory 8k` shows. Keep it to the
   table plus the header — no commentary unless the user asks.
4. **Open follow-ups.** Below the table, list the council's unresolved follow-ups:
   grep the records for lines that begin `- [ ]` (`grep -rn '^- \[ \]'
   $ROOT/.council/records/*.md`, anchored at column 0 so prose bullets don't match)
   and print one row each — the item text, its owner, and the record id it lives in.
   Closing a follow-up is a **manual** `- [ ]` → `- [x]` edit by its owner in the
   record file; `info` only *reports* the open set, it never closes anything. If
   there are none, say so in one line.
5. **Loose ends.** Flag leftover state a clean session would have cleaned up, so the
   user can act on it — this is a **report, not a repair**; `info` writes nothing:
   - **dangling scratchpads** — `$ROOT/.council/scratch/<id>.md` with no matching
     `$ROOT/.council/records/<id>.md` (a meeting or work session that never
     concluded, or crashed mid-run);
   - **stale worktrees / work branches** — `$ROOT/.council/worktrees/<id>/`
     directories and `council/work-<id>` branches (`git worktree list`,
     `git branch --list 'council/work-*'`), noting for each whether its session has
     a record (safe to remove) or none (**unaudited** — see the Preflight
     interrupted-session note).
   Print each as `<id> — <what it is> — <suggested action>`; if everything is clean,
   say so in one line.

---

## Verb: meeting

A human-in-the-loop round-table. Seats speak in turn on a shared scratchpad; you
the orchestrator pause each round for the user's input; the user concludes; the
chair synthesizes. Seats are **read-only** (no worktree, no commits) — and that
read-only instruction is **injected into every meeting seat's prompt** (see
*Spawning a seat*), not merely assumed.

1. **Session id:** `<YYYYMMDD-HHMMSS>-<short-slug-of-task>`.
2. **Open the scratchpad** `.council/scratch/<id>.md` with a header. Pin the
   fields and heading conventions exactly (see the example
   `examples/sample-council/scratch/20260605-141200-rate-limiter.md`):
   ```
   # Scratchpad — meeting

   <1-2 sentence note that this is ephemeral, append-only working memory.>

   - **Task:** <the task / topic>
   - **Session:** <id>
   - **Started:** <YYYY-MM-DD HH:MM>
   - **Chair:** <chair seat name>
   - **Seats (all seats speak in a meeting):** <comma-separated seat names>

   ---
   ```
   Then each round is appended under a `## Round N — <seat>` heading, and each
   user pause under a `## User input after Round N` heading.
3. **All seats participate.** A `meeting` has no seat selection — every seat in
   `council.yaml` speaks. Record the roster in the scratchpad.
4. **Round loop:**
   a. For each seat **in turn**, spawn a seat worker (see *Spawning a
      seat* below) with the task and the current scratchpad. Append its response
      to the scratchpad under a `## Round N — <seat>` heading.
   b. After the round, give the user a tight summary of what each seat said —
      a markdown table, one row per seat (`Seat | Position | Dissent?`), the
      position compressed to a line and the dissent column flagging any seat
      that marked dissent this round. Directly above the input prompt, show a
      one-line size signal — `Round N · scratchpad NN KB` (the just-completed
      round number and the current byte size of `.council/scratch/<id>.md`,
      rounded to KB) — so the user can feel the meeting growing. It is a **signal,
      not a knob**: a meeting has no budget field and the human is its stop trigger
      by design. Then **ask for their input** with the **AskUserQuestion** tool.

      The user has **three** real choices, and the prompt must make all three
      legible — the buried one is the steer, so name it in the question body
      itself. Use header `"Where next?"` and a question body that spells out the
      steer path before the options:

      > **To steer the next round, reply in "Other"** — type a response,
      > constraint, or new question and the council folds it into Round N+1.
      > Or pick an option:

      Then exactly two options, each description saying what *actually happens*
      so neither is mistaken for the other:
      - **Another round** — *Continue with no new input from you; seats build on
        the discussion so far.*
      - **Conclude** — *End the meeting now; the chair synthesizes the final
        recommendation, the preserved dissents, and any open threads.*

      So: **Conclude** ends it; **Another round** continues unchanged; **Other**
      continues *with* the user's steer — that free text *is* the input Round
      N+1 builds on, and choosing "Other" never concludes. Append whatever the
      user chose or typed to the scratchpad under `## User input after Round N`:
      the selected option and any free text verbatim, so the audit trail
      captures the steer exactly.
      (If the AskUserQuestion tool is unavailable, ask in plain conversation
      and wait — the pause is the contract, not the widget.)
   c. Repeat rounds until the user concludes.
5. **Conclude:** spawn the **chair** as a worker over the full scratchpad +
   memory to synthesize: a unified recommendation, preserved dissents (who
   disagreed and why), and any open threads.
6. **Record + memory:** write the synthesis to `.council/records/<id>.md` using
   the pinned **record file** structure (*Synthesis contract* below; `Mode:
   meeting`). Then fold durable takeaways into memory **by topic** — for each
   topic the session touched, create or update `.council/memory/<topic>.md`
   (pinned **memory topic** structure; follow the **topic naming** rule) with the
   decision and its *why* (short, not a transcript). Run the **post-synthesis
   conformance check** before continuing, then **archive the scratchpad** — rename
   `.council/scratch/<id>.md` to `.council/records/<id>.scratch.md`. Do **not**
   delete it: it's the audit artifact Gate 1 is checked against, and a future
   review can re-verify that no dissent was flattened only if it survives.
   Then **commit** the record, the archived scratch, and the memory files — the
   gates are defined over committed artifacts, so an uncommitted record/memory
   leaves the audit trail unverifiable from the tree (write *and* commit, not
   write alone).
7. **Report** the synthesis to the user and point at the record file.

---

## Verb: work

Autonomous take-turns until done. The chair selects seats and drives the loop
with **no user input**; seats work in a **git worktree**; on completion the
chair synthesizes and records, then **declares done and hands the merge to the
user** (it never auto-merges). This verb scales: a quick question resolves in a
turn or two; a bounded implementation grinds for many.

1. **Session id:** as above.
2. **Set up the worktree** (if this is a git repo):
   ```
   git worktree add -b council/work-<id> .council/worktrees/<id> HEAD
   ```
   Seats do their file work with this directory as cwd. (If not a git repo, work
   in place and note that isolation is unavailable.)
3. **Open the scratchpad** `.council/scratch/<id>.md` with a header. Pin the
   fields and heading conventions exactly (see the archived example
   `examples/sample-council/records/20260606-101500-extract-retry-helper.scratch.md`):
   ```
   # Scratchpad — work

   <1-2 sentence note that this is ephemeral, append-only working memory.>

   - **Task:** <the task>
   - **Session:** <id>
   - **Started:** <YYYY-MM-DD HH:MM>
   - **Started (epoch):** <output of `date +%s` at session open — the machine clock the wall-clock trigger reads; do not derive elapsed time from the human `Started` field>
   - **Chair:** <chair seat name>
   - **Seats (chair-selected subset — work does not run all seats):** <comma-separated seat names>

   ---
   ```
   Then each turn is appended under a `## Turn N — <seat>` heading (work is
   chair-routed turns, not rounds, and there is **no** user-input section). `N`
   counts **seat** actions. The chair's own entries for a turn — written **inline
   by the orchestrator**, not spawned — share that turn's number and take a role
   suffix: `## Turn N — <chair> — routing` (written *before* the seat acts: who
   acts next and the concrete sub-goal) and `## Turn N — <chair> — adjudication`
   (written *after*: the continue/stop call). Every non-chair turn's sub-goal is
   the one named in its nearest preceding `— routing` entry. Because those chair
   entries are inline and never advance `N`, `max_turns` counts seat actions only
   (step 6c).
4. **Read the budget** from `council.yaml` `work_budget` (`max_turns`,
   `scratch_max_bytes`, and the **optional** `max_wall_seconds`). `max_turns` and
   `scratch_max_bytes` are hard stops you can measure exactly — track **seat**
   turns taken (the chair's inline routing/adjudication entries don't count — see
   step 6c) and the scratchpad byte size as you go. For `max_wall_seconds`: record
   `date +%s` at session open into the header `**Started (epoch):**` field, and at
   each turn boundary compare a fresh `date +%s` against it. It is **armed only
   when present and > 0** — `absent | 0 | negative → unarmed` (absence is the
   off-switch; most councils don't set it). It is honest only at **turn-boundary
   granularity**: a long turn can overshoot the target, because it bounds when the
   *next* turn starts, not a mid-turn cut. (There is no token cap: the
   orchestrator has no reliable per-turn token count, so a token budget couldn't
   fire — `max_turns` bounds how long a run goes; token spend rides along with it.)
5. **Chair selects seats** relevant to the task; record in the scratchpad.
6. **Take-turns loop (chair-driven):**
   a. **Route inline — no spawn.** Acting *as* the chair, the orchestrator reads
      the scratchpad, decides **who acts next** and the concrete sub-goal for this
      turn, and writes that decision itself under a `## Turn N — <chair> —
      routing` heading. Routing is the one chair judgment that is never a spawn —
      that is what halves the per-turn spawn count and keeps `max_turns` honest;
      the chair is spawned only to **synthesize** (step 7) and, for a genuinely
      contested call, to **adjudicate**.
   b. **Show progress, then spawn.** First emit a one-line progress signal naming
      the turn, seat, and sub-goal — `Turn 3/12 — qa-engineer: <sub-goal>` (the
      denominator is `max_turns`, and because routing is inline the count is
      honest — seat work remaining, not routing overhead). Then spawn that seat as
      a worker (see *Spawning a seat*) with the task, the sub-goal, and the
      scratchpad, pointed at the worktree by its **absolute path** — most worker
      tools can't set the worker's cwd, so the worktree is named in the prompt, not
      as a working directory. It may read/edit files and run commands **under** the
      worktree. After it returns, **verify its edits landed in the worktree, not
      the main tree**: `git -C .council/worktrees/<id> status` should show the
      changes while the main working tree stays clean. Append its turn to the
      scratchpad under `## Turn N — <seat>`.
   c. **Adjudicate.** Acting as the chair again, the orchestrator evaluates
      whether to continue and records the call inline under `## Turn N — <chair> —
      adjudication` (a genuinely contested done-call may instead spawn the chair
      for a full-persona ruling on the record; the routine continue/stop check is
      inline). **Stop on whichever of these five fires first:**
      - **chair says done** — the task is genuinely complete;
      - **budget** — `max_turns` reached: a hard stop, a turn count you track
        exactly. It counts **spawned seat turns only** — the chair's inline
        `— routing` and `— adjudication` entries share the seat turn's number `N`
        and never advance it, so `max_turns: 12` buys twelve seat actions, not
        twelve minus whatever routing overhead the chair incurred. (This is the
        run-length cap; there is no separate token cap — see step 4.);
      - **scratchpad size** — the scratchpad has grown past `scratch_max_bytes`
        (a hard stop: byte size is measured exactly);
      - **wall-clock** — `max_wall_seconds` is set and, at this turn boundary,
        `now − Started(epoch) ≥ max_wall_seconds`. A hard stop, but only at turn
        boundaries (a running turn finishes first, so total time can overshoot by
        up to one turn's duration), and **unarmed** when the field is absent, `0`,
        or negative — step 4 has the full arming and granularity mechanics;
      - **user stop** — the user asked to halt the run.
      Otherwise, loop.
7. **Synthesize:** spawn the chair over the full scratchpad + memory to produce
   the outcome (what was built/decided, trade-offs taken, preserved dissent).
8. **Record + memory:** write `.council/records/<id>.md` using the pinned
   **record file** structure (*Synthesis contract* below; `Mode: work`); fold
   takeaways into memory **by topic** (create/update `.council/memory/<topic>.md`
   per the pinned **memory topic** structure and **topic naming** rule). Run the
   **post-synthesis conformance check**, then **archive the scratchpad** — rename
   `.council/scratch/<id>.md` to `.council/records/<id>.scratch.md` (don't delete
   it; it's the audit artifact Gate 1 is checked against).
9. **Commit, in two places that don't cross.** The gates are defined over
   committed artifacts, so an uncommitted audit trail can't be verified from the
   tree — commit both halves, and keep them apart:
   - **The task's file changes** stay **in the worktree, on the `council/work-<id>`
     branch** (`git -C .council/worktrees/<id> add -A && git -C
     .council/worktrees/<id> commit -m "<summary>"`). This is exactly what the
     user's later `git merge --no-ff council/work-<id>` lands — the work isn't
     mergeable until it's committed there.
   - **The audit trail** (record + archived scratch + memory) lives in the **main**
     `.council/`, not the worktree, and is committed **there, on the current
     branch** — *not* on the work branch. Off the work branch, the record survives
     whether or not the user ever merges, and the merge handoff stays purely about
     the code.
10. **Declare done — do not auto-merge.** Leave the branch and worktree in place
    and hand the user a summary plus the exact commands to merge when *they*
    choose to, and to clean up:
    ```
    git merge --no-ff council/work-<id>
    git worktree remove .council/worktrees/<id>
    ```
    The user owns the merge decision; the chair never lands changes on the
    working tree itself.
11. **Report** the outcome, the record path, and the merge status (always
    deferred with instructions).

---

## Spawning a seat

Spawn each seat with the host's worker tool:

- **Claude Code:** use the `Task` tool with `subagent_type: general-purpose`,
  running in the background only if you are fanning out a parallel set.
- **Codex:** use `multi_agent_v1.spawn_agent`. Use `agent_type: worker` for
  `work` turns that may edit files. For read-only meeting turns, use the default
  agent type unless the seat's subtask is specifically codebase exploration. Call
  `wait_agent` for the sequential seat result, then `close_agent` after the
  result is captured.

Meeting and work are sequential, so spawn one seat at a time and wait.

**If a seat spawn fails** (the worker errors out or returns nothing), don't abort
the round: note the failure under that seat's `## Round N` / `## Turn N` heading in
the scratchpad (one line — what failed), then continue with the next seat. Retry a
failed seat **once**; if it fails a second time, **skip it** for the rest of the
session and record that it was skipped — a meeting or work run degrades to the
seats that answer rather than stalling on the one that won't.

Build the prompt as:

```
You are acting as a council seat. Fully adopt this persona — its priorities,
voice, and judgment — and respond in character.

<persona>
{contents of .council/seats/<seat>.md, body below the frontmatter}
</persona>

Council memory — manifest (durable context from past sessions; a pointer index,
not the content — one line per topic, newest-updated first):
{the memory manifest — built per "Memory injection (two-tier)" below — or "none yet"}

Shared scratchpad (the conversation so far — read it before you speak):
{current contents of .council/scratch/<id>.md}

Task: {the user's task}
{For work turns, also: "This turn's sub-goal (assigned by the chair): ..."}
{For work, also: "All your file work happens in the git worktree at the absolute
 path .council/worktrees/<id>/ — treat that subtree as the project root. The
 worker tool may not change your working directory, so address every read, edit, and
 command at a path *under* that worktree; do not touch files outside it. Report the
 paths you changed so the chair can confirm they landed in the worktree."}
{For meeting, also: "This is a meeting and you are read-only: contribute analysis
 and prose only — do not edit files, run state-mutating commands, or commit.
 Filesystem changes are a `work` session's job, never a meeting's."}
{Always, re: memory — "The memory block above is a manifest of pointers, not
 content. Before you rely on any topic — its decision, constraints, or standing
 dissent — Read its full file at the path shown (for work it lives under the main
 repo's .council/memory/, whose absolute path is given above). Never infer a topic's
 content from its one-line summary; a topic's standing dissent is not in the manifest
 at all. Reading is non-mutating, so it is allowed in a read-only meeting too."}

Respond as this seat, building on the scratchpad rather than repeating it. If
you disagree with where the council is heading, say so plainly and mark it as
dissent — dissents are preserved in the record, not papered over. Be concise
and stay in your lane.
```

**Model/effort (v1):** do **not** set a per-seat model. Every seat and the chair
run on the user's current default model/effort. A seat's `model:` and `tools:`
frontmatter are documentation for now — preserve them, don't enforce them. (Per-
seat model routing for cost is declined — see PLAN §9; no phase currently
enforces it.) The **chair** is spawned the same
way as any seat, but **only to *synthesize*** (unified recommendation + dissents)
— and, for a genuinely contested call in `work`, to render an *adjudication*
ruling on the record. **Routing is never a spawn:** the orchestrator writes the
chair's who's-next / decide-done entries inline (see `work` step 6a/6c), so a
chair worker starts for synthesis, not to pick the next seat.

### Memory injection (two-tier)

Memory is injected as a **bounded manifest of pointers**, never the whole corpus.
Concatenating every `.council/memory/*.md` body into every spawn grew without bound
as topics accumulated and was re-paid on every seat and every turn. A manifest keeps
the always-injected slice small **without sacrificing recall** — every topic is still
listed, and any seat can open any file it needs.

**Build the manifest.** One line per topic file in `.council/memory/`, ordered
most-recently-updated first (file mtime, or the newest `→ record:` back-link in the
file), each line:

```
- `memory/<topic>.md` — <title: the text after "# Memory:"> — <the first non-empty
  line under that file's `## Decision`>
```

With no topic files, the manifest is the literal `none yet`.

**Read on demand, don't guess.** The manifest is an index, not the content. A seat or
the chair that needs a topic **Reads its full file before relying on it** — it never
infers a decision, constraint, or standing dissent from the one-line summary. A
topic's `## Standing dissent` is deliberately *not* in the manifest, so the summary is
never a safe substitute for the file. Reads are non-mutating, so they are permitted in
a read-only `meeting`. For `work`, topic files live in the **main** `.council/memory/`,
not the worktree — give the worker the absolute path, the same way you give it the
worktree path.

**Bound it with `memory_budget` (optional).** In `council.yaml`:

```yaml
memory_budget:
  manifest_max_bytes: 8000   # cap on the injected manifest; unset/0 = uncapped
```

Armed only when set `> 0` (mirrors `max_wall_seconds`: absent, `0`, or negative = off).
When the manifest would exceed the cap, inject the newest-updated topics up to the cap
and append one final line — `- (+N older topics — list .council/memory/ and Read as
needed)` — so the remainder stays **discoverable rather than silently dropped**.
Uncapped, the whole manifest goes in; at one short line per topic it is bounded by
topic count, which itself grows sub-linearly because topics are reused and updated
(per the **topic naming** rule below), not spawned per session.

## Synthesis contract (the chair's output)

Whenever the chair synthesizes, produce:

1. a **unified recommendation / outcome** — the single headline answer;
2. a **`## Dissents (preserved)`** section — where seats disagreed and why,
   preserved not flattened (the heading is literal, including the parenthetical);
3. (for the record file) the **reasoning trail** so the deliberation is
   auditable.

A synthesis that erases disagreement is just one opinion in a trench coat —
keep the strongest dissent visible.

The synthesis is written to two places with fixed structures: the **record
file** (one per session) and one or more **memory topic files**. Both formats
are pinned below; `meeting` and `work` share them (the only difference is the
`Mode` field).

### Record file (`records/<id>.md`)

The filename **is** the session id. The H1 is a short prose title for the
session, distinct from the slug. Concrete template (see
`examples/sample-council/records/20260603-093000-adopt-job-queue.md`):

```
# Record — <prose title for the session>

<1-3 sentence preamble.>

- **Session:** <id, i.e. YYYYMMDD-HHMMSS-slug>
- **Mode:** <meeting | work>
- **Concluded:** <YYYY-MM-DD HH:MM>
- **Chair:** <chair seat name>
- **Seats:** <comma-separated seat names that participated>
- **Task:** <the task / topic>

## Recommendation
<the unified recommendation / outcome — what was decided or built.>

## Reasoning trail
<the auditable why: the considerations, alternatives weighed and rejected.>

## Dissents (preserved)
- **<seat>:** <the dissent, in that seat's voice, not flattened.>

## Follow-ups
- [ ] <action> (owner: <seat>)

→ memory updated: `memory/<topic>.md`
```

The six bold fields are all required and in this order. `Mode` is `meeting` or
`work`. `Concluded` uses `YYYY-MM-DD HH:MM`. Each follow-up owner is a **full
seat name** from `council.yaml` (e.g. `qa-engineer`, not `qa`), or the literal
`user` for a handoff the council defers to the human (e.g. the merge decision).

The trailing `→ memory updated:` cross-links every memory topic this session
wrote, **one line per topic**:
- **One topic:** a single line, `→ memory updated: \`memory/<topic>.md\``.
- **Several topics:** one `→ memory updated:` line each, in any order.
- **No durable memory:** exactly one line, `→ memory updated: none`, so the
  absence is explicit rather than a forgotten line (Gate 2 can tell "wrote
  nothing" from "dropped the line").

### Memory topic file (`memory/<topic>.md`)

One file per durable topic — context the seats read on later sessions. Keep it
short: decisions and their *why*, **never a transcript**. Concrete template (see
`examples/sample-council/memory/job-queue.md`):

```
# Memory: <Title Case topic>

<optional 1-2 sentence preamble.>

## Decision
<the durable decision, stated plainly.>
→ record: `records/<id>.md`

## Why
<the reasons — not the round-by-round transcript.>

<topic-specific sections as warranted, e.g. ## Constraints, ## Practice.>

## Standing dissent (<seat>)
<a dissent that should travel with this topic, if any — else omit the section.>
```

`## Decision` and `## Why` are both **required**. `## Decision` ends with one or
more `→ record:` back-links. Each back-link's target is **either** a backticked
`records/<id>.md` path **or** the bare literal `STANDING` (for a standing
practice no single session set) — **never free prose** — optionally followed by a
short parenthetical note. This enum is what makes Gate 2 mechanically checkable:
extract the backticked path (or recognize `STANDING`), assert the file exists and
names this topic back.

**Back-links accrue into a history.** When a later session revises this topic,
**append a new `→ record:` line** (newest last) rather than overwriting the
prior one — the back-links form the topic's record history, mirroring the
reuse-don't-duplicate rule for topic files. (Overwriting would silently dangle
the earlier record's `→ memory updated:` closure.)

`## Why` carries reasons, not transcript: **no `## Round N` headings and no
turn-by-turn conversation belong in memory** — that content stays in the record.

### Topic naming (deterministic)

Pick the topic file name by kebab-casing the **durable subject noun-phrase of
the decision** — not the task phrasing, not the session slug, and no dates.
("Should we adopt a job queue?" → `job-queue`; a decision about how the council
tests → `testing-standards`.) Before creating one, **list the existing
`memory/*.md` files and reuse the file if the subject already has one**;
otherwise create a new file. Updating an existing topic keeps its history and
adds the new decision rather than spawning a near-duplicate file — append a new
`→ record:` back-link for the updating session (newest last); never overwrite the
prior link.

### Post-synthesis conformance check

Two hard gates. **Both MUST pass before you archive the scratchpad** — run them
*while the scratchpad still exists*, since Gate 1 is checked against it. These
catch the silent failures a skim would miss:

1. **Dissents preserved, not flattened.** The record has a literal
   `## Dissents (preserved)` section, and every dissent recorded in the
   scratchpad survives there in its seat's own voice — not summarized away into
   the recommendation. (If there were genuinely no dissents, the section says so
   explicitly rather than being dropped.) Because the scratchpad is **archived,
   not deleted** (`records/<id>.scratch.md`), this gate stays re-checkable after
   the fact — a later review can diff the record's dissents against the archived
   scratchpad.
2. **Cross-link closure (bidirectional), mechanically.** The record's
   `→ memory updated:` lines name every topic file written (or the single literal
   `none` if it wrote none), **and** each named topic file's `## Decision` carries
   a `→ record:` back-link to this record. Every `→ record:` value is a backticked
   `records/<id>.md` path or the literal `STANDING` — never free prose — so this
   gate is a script, not a skim: for each `→ memory updated: memory/X.md`, assert
   `memory/X.md` exists and one of its `→ record:` lines is this record; for each
   topic's `→ record: records/Y.md`, assert `records/Y.md` lists that topic. Both
   directions must close.

The templates above already pin the rest — field order, prose H1, the `Concluded`
`YYYY-MM-DD HH:MM` format, the section names, full-seat-name owners, kebab topic
naming, the `→ record:` enum, no transcript in memory. Follow the templates;
don't re-grade each formatting detail as its own checkbox.
