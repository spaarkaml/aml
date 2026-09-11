# WP-3.4 — Goals
**Stage:** 3 · **Depends on:** 3.2, 3.10 · **ADRs:** 004, 010, 011, 013 · **Q:** 18, 19 · **Sessions:** 1

## Goal
A target for the note, a target for the day, and an honest count of what you actually wrote.

## Design

### Three goals, three homes
Q18 asks for per-session, per-day and per-deadline, opt-in. Where each one *lives* is the
whole design, and each answer falls out of asking whose fact it is:

| Goal | Lives in | Because |
|---|---|---|
| This note's target and deadline | the note's own front matter — `target_words`, `deadline` | it is a fact about the work. It travels with the note, survives being opened in any other editor, and is already searchable and already editable in the Properties panel |
| Words a day | `.aml/config.yaml` as `goals.daily` | it is a fact about the project, so both machines aim at the same number |
| What you wrote today | `localStorage` | it is a fact about *this keyboard*. ADR-004 keeps per-device things out of the Folio, and two machines' sessions must not add up to something neither of them wrote |

All three are off until set. A goal you did not set is not a goal you are failing, so the
panel says "No daily goal" and points at Settings rather than showing 0 of 0.

### The session count is what you wrote, not what you opened
The tally follows the editor's word count and adds the *difference*. Opening a 4,000-word
chapter adds nothing; switching notes only moves the mark. Deleting counts against you,
because it is not writing — that is Scrivener's rule and it is the honest one.

It is a subscription to the editor store rather than a call inside it: the editor should not
have to know that anything is counting. Word-count rules are Q19's, unchanged and already
shared with the status bar.

### Deadlines
Q18's "words remaining ÷ days remaining", with today counting as a day you still have — a
deadline of today leaves you one day, not none. A deadline that has passed, or a target
already met, produces **no number at all**: "write 4,000 words a day" for a day that has gone
is not information.

**Per-Project goals are not here, and could not be**: ADR-011 puts a Project's goals in
`project.aml.yaml`, and nothing writes that file until Stage 5. Rather than invent the
manifest early, the deadline arithmetic ships attached to the unit that exists today — the
note — and the same functions will serve a Project when there is one. That is the one line of
the WP that is deferred, and it is deferred to its own ADR's schedule.

### On screen
- **The status bar** carries the ring and `320 / 500` whenever there is a daily goal; clicking
  it opens the Context panel. ADR-013 names `--aml-accent` for goal progress, which is what
  the ring is stroked in — turning to `--aml-primary` when the goal is met, so "done" reads as
  the app's own colour rather than as a warning.
- **The Context panel** gains a Goals section: today against the daily goal with the streak,
  then this note's progress, its pace, and the two fields that set them.
- **Streaks** count consecutive days meeting the daily goal, and today does not count against
  you until it is over — an unmet today is skipped rather than breaking the run. A streak that
  collapsed at 9 a.m. because you had not started yet would be a lie about yesterday.

**Dependencies:** none added.

## Acceptance criteria
- [x] A note's goal is read from its own front matter and is nothing at all unless it is a
      positive number; an unreadable deadline is no deadline rather than a broken goal
      (unit tests `features/goals/goals.test.ts`).
- [x] Progress never overflows or goes backwards; days left count today; pace is words
      remaining ÷ days and is silent when finished, overdue or undated (unit tests).
- [x] A streak survives the morning and stops at the first day that fell short (unit tests).
- [x] The tally counts writing and not opening, counts deleting against you, and keeps a
      year of days (unit tests `features/goals/store.test.ts`).
- [x] The daily goal round-trips through `.aml/config.yaml` beside the other preferences, and
      zero is no goal rather than a goal of nothing (Rust test `config.rs`).
- [x] E2E: opening a note adds nothing, typing adds exactly what was typed, deleting subtracts,
      and the tally survives a reload; a target written from the panel appears in Properties as
      the ordinary property it is; a deadline gives a pace; clearing the target removes the
      property; with no daily goal there is no ring and the panel says where to set one
      (`e2e/goals.spec.ts`).
- [ ] **Gate 3:** "Daily goal progress and deadline maths correct" over a real writing day
      (`docs/qa/stage-3.md` §18–§19).

## Lessons recorded
- The e2e built "tomorrow" in UTC and got today: the app's day is the device's (`todayIso`),
  and in Australian time UTC is still yesterday for ten hours of it. Any test that computes a
  date to compare against the app has to compute it the way the app does.
- The Context panel is a slide-over in the Desk layout and its backdrop swallows clicks on the
  page, so an e2e that types has to open the panel *after* typing, not before. Two tests were
  written the natural way round and both hung on it.

## Not in this work package
- Per-Project goals and deadlines: `project.aml.yaml` does not exist until Stage 5 (ADR-011).
  The maths is written and tested; only the owner is missing.
- A goals *history* view — a chart of the last month. The streak is the one number worth
  carrying; a chart belongs with the Statistics panel (WP-3.7).
- Session goals distinct from daily ones. A "session" that survives a restart is a day, and
  one that does not is a number nobody can check. The day is the honest unit.
- Counting words per Bounding. A Bounding is not a deadline-bearing thing; a Project is.
- A separate tally per Folio. Today's count is one number for the day, whichever Folio the
  words went into — which is right if "what I wrote today" is a fact about the writer, and
  would be wrong if two Folios were two different jobs with two different days' work in them.
  Worth revisiting only if a second Folio ever becomes a habit; the goal itself is already
  per Folio, so the two would disagree.
