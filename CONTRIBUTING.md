# Contributing

Pull requests must stay small and reviewable.

## PR rules

- Keep one problem or feature per PR. Split unrelated backend, frontend, config, and UI work into separate PRs.
- Fill in the PR template, including a concrete test report.
- Include screenshots or before/after evidence for UI changes.
- Do not commit generated files or runtime data such as `dist/`, `coverage/`, `node_modules/`, or `.data/`.
- Default limits enforced by CI:
  - changed files: 25
  - added lines: 1200
  - deleted lines: 1000
  - total changed lines: 1500
  - single non-doc, non-lockfile file: 700 changed lines

If a PR must exceed these limits, split it first. Maintainers can raise the limits in `.github/workflows/pr-gate.yml` for a specific policy change.

## Required checks

The repository has two PR gates:

- `PR policy / Validate PR policy`: validates the PR template, test report, file count, line count, and generated-file rules.
- `CI / Build`: installs dependencies, runs `npm test --if-present`, and builds the app.

To make these checks block merging, enable branch protection for `main` in GitHub:

1. Open `Settings -> Branches -> Add branch protection rule`.
2. Set the branch name pattern to `main`.
3. Enable `Require status checks to pass before merging`.
4. Select `PR policy / Validate PR policy` and `CI / Build`.
5. Enable `Require pull request reviews before merging`.

After this, reviewers should only review PRs after both checks are green.
