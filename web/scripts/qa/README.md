# Test passes

Three sweeps over the running system. They act through real signed-in sessions
where a user would, and through the service role only where the application
legitimately does.

    npm run qa           # features, then edge cases
    npm run qa:pages     # every route, as every role (needs the app running)

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
