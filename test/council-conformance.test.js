// Format-conformance gates for the council's audit trail.
//
// Runs over two corpora — the shipped `examples/sample-council/` and the repo's
// own dogfood `.council/` — and enforces only what the templates and SKILL.md
// prose cannot self-enforce: record/memory/scratch *shape*, and the two gates
// pinned in `.council/memory/council-record-and-memory-format.md`:
//   Gate 1 — dissents are preserved (a `## Dissents (preserved)` section exists
//            and is non-empty, and the scratch archive survives so the semantic
//            half stays human-re-checkable);
//   Gate 2 — bidirectional cross-link closure between a record's
//            `→ memory updated:` lines and a memory topic's `→ record:` lines.
//
// Scope is format only: no secret-shape scan and no git-history invariant — this
// is a local tool and that framing is documented in the README's
// "Security & trust (local-only)" section.
//
// Every marker grep is anchored at column 0 (`^→ record: `, `^## Dissents`, …):
// the corpus discusses these literal markers in prose, so an unanchored match
// would false-positive on a sentence that merely mentions one.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

// The only two records exempt from "a record has a scratch archive": they predate
// the archive-don't-delete rule (see the "Archive, don't delete, the scratchpad"
// resolved gap in .council/memory/council-record-and-memory-format.md). This is a
// closed list, not a skip-if-missing — the two are asserted to exist below.
const NO_SCRATCH_GRANDFATHER = new Set([
  "20260607-210234-implement-phase-2",
  "20260607-213032-review-phase-2",
]);

const CORPORA = [
  { label: "examples/sample-council", root: path.join(repoRoot, "examples", "sample-council") },
  { label: "dogfood .council", root: path.join(repoRoot, ".council") },
];

const RECORD_NAME = /^(\d{8}-\d{6}-[a-z0-9-]+)\.md$/;
const CONCLUDED = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
const FIELD_ORDER = ["Session", "Mode", "Concluded", "Chair", "Seats", "Task"];

function read(file) {
  // Normalize CRLF → LF so byte-exact `\n## …` section scans work on Windows.
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function listMarkdown(dir, { excludeScratch = false } = {}) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !(excludeScratch && f.endsWith(".scratch.md")))
    .sort();
}

// The line-anchored value of a record field, e.g. field(text, "Mode") → "work".
function field(text, name) {
  const m = text.match(new RegExp(`^- \\*\\*${name}:\\*\\* (.+)$`, "m"));
  return m ? m[1].trim() : null;
}

// The body lines of a `## Heading` up to the next `## ` (or EOF).
function sectionBody(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf(`## ${heading}`);
  if (start === -1) return null;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join("\n");
}

// Record → the memory topics it declares updated. `none` is the legal empty form.
function memoryUpdated(text) {
  const topics = [];
  let sawNone = false;
  let count = 0;
  for (const m of text.matchAll(/^→ memory updated: (.+)$/gm)) {
    count += 1;
    const val = m[1].trim();
    if (val === "none") {
      sawNone = true;
      continue;
    }
    const mm = val.match(/^`memory\/([a-z0-9-]+\.md)`$/);
    topics.push({ raw: val, topic: mm ? mm[1] : null });
  }
  return { topics, sawNone, count };
}

// Memory → the record ids it back-links to. STANDING is the record-less form.
function recordBacklinks(text) {
  const links = [];
  for (const m of text.matchAll(/^→ record: (.+)$/gm)) {
    const val = m[1].trim();
    const asPath = val.match(/^`records\/(\d{8}-\d{6}-[a-z0-9-]+)\.md`(?: \(.*)?$/);
    const asStanding = /^STANDING\b/.test(val);
    links.push({ raw: val, record: asPath ? asPath[1] : null, standing: asStanding });
  }
  return links;
}

for (const corpus of CORPORA) {
  const recordsDir = path.join(corpus.root, "records");
  const memoryDir = path.join(corpus.root, "memory");
  const records = listMarkdown(recordsDir, { excludeScratch: true });
  const memories = listMarkdown(memoryDir);

  test(`[${corpus.label}] corpus has records and memory`, () => {
    assert.ok(records.length > 0, "expected at least one record");
    assert.ok(memories.length > 0, "expected at least one memory topic");
  });

  // ---- Per-record structure -------------------------------------------------
  for (const file of records) {
    const stem = file.replace(/\.md$/, "");
    const text = read(path.join(recordsDir, file));

    test(`[${corpus.label}] record ${stem} is well-formed`, () => {
      assert.match(file, RECORD_NAME, "filename must be <YYYYMMDD-HHMMSS>-<slug>.md");
      assert.match(text, /^# Record — .+/m, "H1 must be `# Record — <title>`");

      // Six bold fields, present and in canonical order.
      let prev = -1;
      for (const name of FIELD_ORDER) {
        const at = text.search(new RegExp(`^- \\*\\*${name}:\\*\\* `, "m"));
        assert.notEqual(at, -1, `missing field **${name}:**`);
        assert.ok(at > prev, `field **${name}:** is out of order`);
        prev = at;
      }

      assert.equal(field(text, "Session"), stem, "Session must equal the filename stem");
      assert.ok(["meeting", "work"].includes(field(text, "Mode")), "Mode must be meeting|work");
      assert.match(field(text, "Concluded"), CONCLUDED, "Concluded must be `YYYY-MM-DD HH:MM`");

      // Canonical sections, in order.
      const sectionOrder = ["Recommendation", "Reasoning trail", "Dissents (preserved)", "Follow-ups"];
      let sPrev = -1;
      for (const h of sectionOrder) {
        const at = text.indexOf(`\n## ${h}\n`);
        assert.notEqual(at, -1, `missing section ## ${h}`);
        assert.ok(at > sPrev, `section ## ${h} is out of order`);
        sPrev = at;
      }

      // Gate 1: the dissents section is non-empty (bullets or an explicit
      // no-dissent sentence — never a bare heading).
      const dissents = sectionBody(text, "Dissents (preserved)");
      assert.ok(dissents !== null, "Dissents (preserved) section is required");
      assert.ok(dissents.trim().length > 0, "Dissents (preserved) must not be empty");

      // Follow-up owners ∈ this record's Seats ∪ {user}. Items may wrap across
      // lines, so validate over the whole section: one `(owner: …)` per item.
      const followups = sectionBody(text, "Follow-ups") || "";
      const seats = field(text, "Seats")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const validOwners = new Set([...seats, "user"]);
      const itemStarts = (followups.match(/^- \[[ x]\] /gm) || []).length;
      const owners = [...followups.matchAll(/\(owner: ([a-z0-9-]+)\)/g)].map((m) => m[1]);
      assert.equal(owners.length, itemStarts, "every follow-up must name exactly one owner");
      for (const owner of owners) {
        assert.ok(validOwners.has(owner), `unknown follow-up owner: ${owner}`);
      }

      // `→ memory updated:` lines are well-formed (backticked path or `none`),
      // and `none` is exclusive.
      const { topics, sawNone, count } = memoryUpdated(text);
      assert.ok(count > 0, "record must carry at least one `→ memory updated:` line");
      for (const t of topics) {
        assert.ok(t.topic, `malformed → memory updated value: ${t.raw}`);
      }
      if (sawNone) {
        assert.equal(count, 1, "`→ memory updated: none` must be the only such line");
        assert.equal(topics.length, 0);
      }

      // Gate 1 (audit half): a scratch archive survives — except the two
      // grandfathered ids.
      if (!NO_SCRATCH_GRANDFATHER.has(stem)) {
        const scratch = path.join(recordsDir, `${stem}.scratch.md`);
        assert.ok(fs.existsSync(scratch), `missing scratch archive ${stem}.scratch.md`);
      }
    });
  }

  // ---- Scratch archives match their record ---------------------------------
  for (const file of listMarkdown(recordsDir).filter((f) => f.endsWith(".scratch.md"))) {
    const stem = file.replace(/\.scratch\.md$/, "");
    const text = read(path.join(recordsDir, file));

    test(`[${corpus.label}] scratch ${stem} matches its record`, () => {
      const recordFile = path.join(recordsDir, `${stem}.md`);
      assert.ok(fs.existsSync(recordFile), `scratch archive has no record: ${stem}.md`);

      const mode = text.match(/^# Scratchpad — (meeting|work)\b/m);
      assert.ok(mode, "scratch H1 must be `# Scratchpad — meeting|work`");
      assert.equal(mode[1], field(read(recordFile), "Mode"), "scratch mode must match record Mode");

      // Header fields present (Seats carries a parenthetical label in scratch).
      for (const label of ["Task", "Session", "Started", "Chair"]) {
        assert.match(text, new RegExp(`^- \\*\\*${label}:\\*\\* `, "m"), `scratch missing **${label}:**`);
      }
      assert.match(text, /^- \*\*Seats\b/m, "scratch missing **Seats** line");
      // Started (epoch) is spec-pinned but absent from every committed fixture —
      // deliberately not required here.

      // The turn/round convention is present (form varies across history).
      assert.match(text, /^## (Turn|Round) \d+\b/m, "scratch has no ## Turn/Round headings");
    });
  }

  // ---- Per-memory structure ------------------------------------------------
  for (const file of memories) {
    const text = read(path.join(memoryDir, file));

    test(`[${corpus.label}] memory ${file} is well-formed`, () => {
      assert.match(file, /^[a-z0-9]+(-[a-z0-9]+)*\.md$/, "memory filename must be kebab-case");
      assert.doesNotMatch(file, /^\d{8}-\d{6}-/, "memory filename must be dateless (subject slug)");
      assert.match(text, /^# Memory: .+/m, "H1 must be `# Memory: <subject>`");
      assert.match(text, /^## Decision\s*$/m, "memory must have a ## Decision");
      assert.match(text, /^## Why\s*$/m, "memory must have a ## Why");
      assert.doesNotMatch(text, /^## Round \d+/m, "memory must not carry a transcript (## Round N)");
      assert.doesNotMatch(text, /^## Turn \d+/m, "memory must not carry a transcript (## Turn N)");

      for (const link of recordBacklinks(text)) {
        assert.ok(
          link.record || link.standing,
          `→ record must be a backticked records/<id>.md path or STANDING: ${link.raw}`,
        );
      }
    });
  }

  // ---- Gate 2: bidirectional cross-link closure ----------------------------
  test(`[${corpus.label}] Gate 2 — record→memory links close`, () => {
    for (const file of records) {
      const stem = file.replace(/\.md$/, "");
      const { topics } = memoryUpdated(read(path.join(recordsDir, file)));
      for (const { topic } of topics) {
        const memPath = path.join(memoryDir, topic);
        assert.ok(fs.existsSync(memPath), `${stem} → memory/${topic}, but that file is missing`);
        const backlinks = recordBacklinks(read(memPath)).map((l) => l.record);
        assert.ok(
          backlinks.includes(stem),
          `${stem} declares memory/${topic}, but memory/${topic} has no → record back-link to it`,
        );
      }
    }
  });

  test(`[${corpus.label}] Gate 2 — memory→record links close`, () => {
    for (const file of memories) {
      for (const link of recordBacklinks(read(path.join(memoryDir, file)))) {
        if (link.standing) continue; // STANDING is record-less by design
        const recordFile = path.join(recordsDir, `${link.record}.md`);
        assert.ok(fs.existsSync(recordFile), `memory/${file} → records/${link.record}.md, which is missing`);
        const forward = memoryUpdated(read(recordFile)).topics.map((t) => t.topic);
        assert.ok(
          forward.includes(file),
          `memory/${file} back-links records/${link.record}.md, but that record does not declare memory/${file}`,
        );
      }
    }
  });
}

// ---- The grandfather list is real, not a silent skip ------------------------
test("grandfathered no-scratch records still exist", () => {
  const recordsDir = path.join(repoRoot, ".council", "records");
  for (const stem of NO_SCRATCH_GRANDFATHER) {
    assert.ok(fs.existsSync(path.join(recordsDir, `${stem}.md`)), `grandfather record missing: ${stem}.md`);
    assert.ok(
      !fs.existsSync(path.join(recordsDir, `${stem}.scratch.md`)),
      `grandfather record ${stem} unexpectedly has a scratch archive — remove it from the exemption list`,
    );
  }
});
