# Contributing

## Setup

Use Node.js 24 LTS and npm. `.nvmrc`, `package.json` engines, and the Node type definitions target the same major version.

```bash
nvm use
npm ci
```

See the [README](README.md#getting-started) for live CLI setup. Development checks need no real credentials. Never commit `.env` files, credentials, or personal recovery text.

## Commands

| Command                 | Purpose                                                         |
| ----------------------- | --------------------------------------------------------------- |
| `npm run jft -- --help` | Show CLI usage                                                  |
| `npm run format`        | Apply repository formatting                                     |
| `npm run format:check`  | Check formatting without changing files                         |
| `npm run lint`          | Check TypeScript code rules with zero warnings                  |
| `npm test`              | Run automated tests, including synthetic local HTTP integration |
| `npm run typecheck`     | Check source and test TypeScript without emitting files         |
| `npm run check`         | Run the complete local verification used by CI                  |

Before opening or updating a PR:

```bash
npm run format
npm run check
```

`check` runs formatting, linting, tests, and TypeScript once each. The CLI runs through `tsx`; no production build is needed. Separate commands remain available for focused work. Once dependencies are installed, checks need no external services; CLI integration tests bind an ephemeral loopback port.

## Organization and documentation

Group source by responsibility under `src/` and mirror those groups under `tests/`. Preserve useful boundaries; use direct imports from owning modules rather than forwarding exports or barrel files. Keep CLI entry points thin and abstractions proportional to the current scope. See [architecture](docs/ARCHITECTURE.md) for the current boundaries and design decisions.

Prettier owns formatting; `.editorconfig` supplies matching editor defaults. ESLint owns code rules, with `eslint-config-prettier` disabling conflicting formatting rules. Do not copy React or Next.js lint presets into this repository.

Use useful TSDoc for exported contracts and non-obvious behavior. Explain constraints, ownership, outcomes, and escaping failures, rather than restating types or names. Keep comments beside implementations and update them when behavior changes. No documentation generator is required.

README owns product usage, `docs/ARCHITECTURE.md` owns design decisions, this document owns contributor instructions, and [repository standards](docs/REPOSITORY_STANDARDS.md) own maintenance and settings policy. Link to the owning document instead of repeating policies. Use the [shared data glossary](docs/DATA_GLOSSARY.md).

## Testing

Preserve existing behavior and tests. Add tests for concrete contract gaps, failure paths, or behavior affected by a change; avoid assertions that merely mirror implementation. Use fixed fictional compatibility fixtures to protect persisted formats, with deliberate migration and compatibility tests if those formats change.

Default tests use scripted adapters, synthetic credentials, and a local fake Responses endpoint. Never require real credentials or live model-provider calls. Keep the synthetic HTTP tests: they exercise the actual CLI and SDK, continuation, tracing, failure outcomes, and disabled provider retries. Automated protocol checks do not establish live-model answer quality or injection resistance.

Run a focused group with, for example, `npm test -- tests/harness`. Report live-provider or manual verification separately from automated checks, and disclose anything unverified.

## Pull requests and merging

Use a focused feature branch and the PR template's Summary, Validation, and Limitations sections. Describe the final implementation, actual validation, and remaining constraints.

PR titles follow [Conventional Commits](https://www.conventionalcommits.org/): `type(optional-scope): description`. Allowed types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`. Breaking changes can use `!`. Single-commit PRs must also have a conventional commit message; additional review commits need no history rewriting.

Use **Squash and merge** with the validated PR title as the final commit title. The title workflow validates naming; see [repository settings](docs/REPOSITORY_STANDARDS.md#repository-settings) for intended settings and observed enforcement. A maintainer explicitly merges after review.

## Dependency maintenance

Commit `package-lock.json` and install with `npm ci`. Review targeted dependency updates and merge manually after checks pass. [Repository standards](docs/REPOSITORY_STANDARDS.md#dependency-and-security-maintenance) own the schedule, grouping, security policy, and override requirements.
