# Test passes

Three sweeps over the running system. They act through real signed-in sessions
where a user would, and through the service role only where the application
legitimately does.

    npm run qa            # features, then edge cases
    npm run qa:pages      # every route, as every role (needs the app running)
    npm run qa:classroom  # fifty students sit one exam (needs the app running)

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
