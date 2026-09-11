# Test passes

Three sweeps over the running system. They act through real signed-in sessions
where a user would, and through the service role only where the application
legitimately does.

    npm run qa            # features, then edge cases
    npm run qa:pages      # every route, as every role (needs the app running)
    npm run qa:classroom  # fifty students sit one exam (needs the app running)
    npm run qa:crowd      # ten admins, ten teachers, ten students at once
    npm run qa:speed      # how fast every safeguard reaches the teacher's monitor
    npm run qa:review     # a teacher's mark overrules the key; a student's cannot

`qa:pages` loads pages over HTTP and defaults to `http://localhost:3001`; set
`QA_BASE` to point it elsewhere.

**These run against the live project.** They create accounts, classes, exams and
sittings, and delete them again — including on failure, from a `finally` block.
They also change system settings while running and put them back. If one is
killed part-way, check Accounts for leftovers named `qa-`, `qb-` or `qc-`.

Sign-ins are rate-limited to 30 per five minutes per IP, which is why each pass
uses few accounts and reuses their sessions. Running all three back to back can
approach that limit.

Findings are collected rather than asserted, so one failure does not hide the
rest of the sweep.

`qa:classroom` is sized deliberately: fifty students on a twenty-five question
paper is over 1,100 answers, past the 1,000-row reply cap, which is where
silent truncation shows up. It takes a few minutes, most of it waiting out the
sign-in rate limit — that wait is itself one of the findings, not an accident.

`qa:crowd` runs the roles concurrently rather than one at a time, because the
failures that survive careful single-user testing are races: two people creating
the same thing, a check-then-insert with a gap in the middle. It measures each
admin page alone first, so a slow number under eighty simultaneous renders can
be read as contention on one server rather than mistaken for a slow page.

`qa:speed` times each safeguard end to end: the flag being written by
`record_flag()`, and the same row arriving on a teacher's monitor over Realtime,
for every flag type, plus answer saving, opening a recording, uploading a
thirty-second piece of video and a teacher fetching a link to watch it. The
in-browser half of each detection is stated from the code, since there is no
browser in the run. It also checks that the monitor's fifteen-second refresh
finds every flag, including any the live feed dropped. `SPEED_RUNS` sets how
many of each (default 8).
