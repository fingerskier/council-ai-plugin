# Example: a convened council

`sample-council/` is a reference snapshot of a `.council/` directory after a few
sessions. It is **documentation, not runtime** — nothing reads it. Its purpose is
to pin down the on-disk formats so the orchestrator and any contributor agree on
what these files look like.

```
sample-council/
├── council.yaml                              # the active council (from a template)
├── seats/                                    # one persona file per seat — body IS the system prompt
│   ├── staff-engineer.md                     #   (chair)
│   ├── security-engineer.md
│   ├── qa-engineer.md                        #   shows a per-project hand-edit
│   └── product-manager.md
├── memory/                                   # durable, one file per topic (decision #5)
│   ├── job-queue.md
│   └── testing-standards.md
├── scratch/                                  # ephemeral per-session working memory (gitignored)
│   └── 20260605-141200-rate-limiter.md       #   shown mid-meeting, Round 2 pending
└── records/                                  # durable synthesized outputs, kept + committed
    └── 20260603-093000-adopt-job-queue.md
```

Format conventions illustrated here:

- **Seats** are **one markdown file per seat**, named to match the seat's entry
  in `council.yaml` (`qa-engineer` → `seats/qa-engineer.md`). The frontmatter is
  metadata (`name`, `title`, `voice`, and the v1-documentation-only `model`/
  `tools`); the **body is that seat's system prompt**. `convene` copies these
  from the plugin's `personalities/` library, and from then on they're the
  user's to customize — `qa-engineer.md` shows a hand-edit appended to the
  persona for this council only.
- **Memory** is **one markdown file per topic**, not a single log. After a
  `meeting` or `work` session, the chair creates or updates the relevant
  topic file with the decision and its *why* — short, not a transcript.
- **Scratchpad** is append-only, one file per session, named
  `<YYYYMMDD-HHMMSS>-<slug>`. Every seat reads it before speaking. It is deleted
  once its content is folded into a record, and never committed.
- **Record** is the durable synthesis: a single recommendation, the reasoning
  trail, and **preserved dissent**. Named like the scratchpad it came from.

The cross-links are intentional: the `job-queue` meeting produced both
`records/20260603-093000-adopt-job-queue.md` and the `memory/job-queue.md` topic
file, and each points at the other.
