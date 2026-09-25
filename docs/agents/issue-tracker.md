# Issue tracker: GitHub

Issues live in ANAMASGARD/EchoLeaks. Use `gh` to read issues, comments, and
labels, and to publish approved tickets. Use `--body-file` for multiline
issue bodies. Design specifications remain versioned in the repository;
include their relevant requirements in tickets so tickets are self-contained.

Publish one issue per ticket in dependency order. Use native blocking
relationships; if unavailable, list blocking issue numbers in the body.
Apply `ready-for-agent` to approved implementation tickets. Work requiring
physical captures or human assessment uses `ready-for-human`.
Do not modify or close a parent issue.

Use native dependency links with the blocking issue's numeric database ID,
not its issue number or GraphQL node ID. Verify the created relationships.
A ticket may start only after all of its blocking acceptance gates pass;
a readiness label does not override an unresolved blocker.

PRs as a request surface: no.
