# Repository standards

The shared conventions originate in [jft-app PR #1](https://github.com/drewmalone/jft-app/pull/1), verified merged on October 18, 2026. The app's current `main` at `15a0c77` and PR branch at `ac8909b` were inspected before aligning this repository. This document adapts those conventions to the harness; no shared package or product integration is introduced.

## Verification and formatting

Use `npm ci` followed by `npm run check` locally and in the CI job named `Verify`. [CONTRIBUTING.md](../CONTRIBUTING.md#commands) owns command descriptions. The harness needs its standalone TypeScript check and no build; browser tests and web framework tooling belong to the app.

`.prettierrc.json`, `.editorconfig`, the exact Prettier version, and format scripts match the app. `.prettierignore` excludes harness output, traces, coverage, dependencies, lockfile formatting, and TypeScript build metadata. Configuration files own formatting values. ESLint checks code rules rather than formatting.

## Repository settings

These are intended settings, not changes applied by this PR. Observed metadata on October 18, 2026 is listed separately from policy.

| Setting                   | Intended policy                                                           | Observed status                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Default branch            | `main`                                                                    | `main`                                                                                                                                  |
| Merge methods             | Squash only                                                               | Squash enabled; merge commits and rebase disabled                                                                                       |
| Squash title              | PR title                                                                  | `COMMIT_OR_PR_TITLE`; use the validated PR title manually                                                                               |
| Squash description        | PR body                                                                   | `COMMIT_MESSAGES`                                                                                                                       |
| Automatic branch deletion | Enabled                                                                   | Disabled                                                                                                                                |
| Auto-merge                | Disabled; maintainer explicitly merges                                    | Disabled                                                                                                                                |
| Main branch rule          | Require PR, resolved conversations, passing checks, and up-to-date branch | Rulesets API returned no rulesets; classic branch protection could not be read (integration returned 403), so enforcement is unverified |
| Required checks           | `Verify`, `Conventional PR title`, `Dependency Review`, `CodeQL`          | Workflow files define these names; required-check configuration is unverified                                                           |
| Required approvals        | Zero for solo maintainer; request peer review when available              | Unverified                                                                                                                              |
| Force pushes and deletion | Block on `main`                                                           | Unverified                                                                                                                              |
| Rule bypass               | No routine bypass actors                                                  | Unverified                                                                                                                              |

Select the actual successful check runs from their GitHub Actions workflows before configuring required checks. Existing rules may still refer to the previous `test` job; a maintainer must inspect and update those separately. This PR does not alter repository settings.

Enable the dependency graph, Dependabot alerts, and Dependabot security updates. Confirm Actions and code scanning are enabled and CodeQL uses the committed workflow without duplicate default setup. Recent successful Dependency Review and CodeQL runs establish that those workflows work; they do not verify every security setting. Dependabot alerts/security-update settings were not readable through the available metadata.

## Documentation and data vocabulary

[CONTRIBUTING.md](../CONTRIBUTING.md) owns authoring, testing, conventional PR titles, and squash-merge instructions. The [PR template](../.github/pull_request_template.md) owns Summary / Validation / Limitations prompts. [Architecture](ARCHITECTURE.md) owns design decisions; [README](../README.md) owns product usage and provider/trace behavior. The [data glossary](DATA_GLOSSARY.md) distinguishes fictional fixtures, journal entries, shares, traces, and personal data without creating a shared schema.

## Dependency and security maintenance

[Dependabot configuration](../.github/dependabot.yml) matches the app: npm and GitHub Actions updates weekly, Monday at 09:00 America/Chicago; minor and patch updates grouped per ecosystem, majors separate; five scheduled open PRs per ecosystem; `chore(deps)` and `ci(deps)` commit prefixes. Scheduled configuration becomes active on the default branch after merge. Security updates are a separate repository setting and need not wait for that schedule.

Dependency Review blocks newly introduced high/critical known vulnerabilities on PRs. CodeQL scans JavaScript/TypeScript on PRs, pushes to `main`, and Mondays at 08:00 UTC. The Conventional PR title workflow validates naming. Permissions remain limited to each workflow's needs. Workflow success alone does not prove privacy, correctness, or the absence of vulnerabilities.

Inspect actual failed jobs and vulnerability findings. A missing dependency graph is a settings issue; an advisory finding needs a dependency fix. Prefer targeted updates, never disable or weaken checks to make them pass. Do not copy the app's Next.js/PostCSS override: the harness has neither dependency. No temporary dependency override is introduced. Any future override must document the affected dependency, advisory, scope, and upstream release or condition that permits removal in the architecture guide.
