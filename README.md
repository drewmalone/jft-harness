# JFT Harness v0.1

Just for Today is a small, transparent TypeScript harness for asking questions about **fictional** recovery journals. It implements the Responses API tool loop directly, without an agent framework. There is no frontend, server, database, authentication, or audio processing.

## Getting started

Use Node.js **24 LTS** (pinned in `.nvmrc`) and npm:

```bash
nvm use
npm ci
cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env` or your shell. Never commit it. `tsx` loads `.env` through Node's native environment-file support; existing shell variables take precedence. Tests need no real credentials or internet access. CLI integration tests bind an ephemeral loopback port.

`OPENAI_MODEL` defaults to `gpt-5.4-mini`, a small GPT-5 model listed in the installed SDK, chosen for a cost-conscious tool-calling default rather than the largest model. You can select another compatible model via the environment or `--model`; account access and model availability vary. The default lives in `src/config.ts`, outside orchestration logic.

```bash
npm run jft -- --fixture ./fixtures/sample-journal.json --question "What helped Nelson when he was anxious?"
npm run jft -- --help
npm test
npm run typecheck
```

On machines where npm's default cache is not writable, use `npm ci --cache /workspace/.npm-cache`.

The fixture contains 18 invented entries over five weeks, including contradictory experiences, missing evidence about coffee, and an explicit injection attempt. No real journals were used. Fixtures are nonempty JSON arrays of `{ id, date, text }`; IDs must be unique, dates must be real ISO 8601 calendar dates (`YYYY-MM-DD`, validated by Zod), and unknown fields are rejected.

## Execution and limits

The model can answer directly or ask the single read-only `search_entries` tool for evidence. Search uses Node's `Intl.Segmenter` with English word boundaries (no regular expressions) and matches distinct case-insensitive word tokens, ranks by number of overlapping tokens, then breaks ties by original fixture order. Results contain IDs, dates and original text. Limit defaults to 5, maximum 10. There is no stemming, synonym expansion, semantic understanding or date-filter argument. Use short keywords; a query such as "walk" will not match "walking".

The harness validates an explicit tool allowlist and all JSON arguments before execution. Calls in a batch execute sequentially in provider output order. Invalid requests receive structured error outputs and count toward the budget. Tool execution failures end the run; they are not retried. Provider/SDK retries are disabled.

Defaults and CLI overrides:

| Flag | Default |
| --- | ---: |
| `--max-model-requests` | 5 |
| `--max-tool-calls` | 6 |
| `--model-timeout-ms` | 30000 |
| `--tool-timeout-ms` | 5000 |
| `--run-timeout-ms` | 120000 |

Model and tool waits are capped by the remaining overall deadline. SIGINT/SIGTERM cancel the run. The adapter receives an abort signal. Timeout settings must not exceed Node's maximum timer delay of 2,147,483,647 milliseconds; oversized values are rejected rather than overflowing into short waits. Arbitrary JavaScript cannot be forcibly interrupted on the event loop; the built-in search is bounded local synchronous work, so very large fixtures are outside v0.1's intended use.

Unsuccessful runs exit nonzero and never print a partial answer as success. Missing CLI configuration and malformed fixtures fail before harness execution. Once a harness run begins, success and failure both attempt trace persistence. A failed trace write is itself an unsuccessful run. The returned in-memory trace records a `trace_write` error and clears the final-answer field; no saved path is reported.

## Inspecting traces

Each run prints `Trace: traces/<uuid>.json` (override with `--trace-dir`). Files are Git-ignored and created with owner-only permissions. Read them with a JSON viewer, for example:

```bash
python -m json.tool traces/<run-id>.json
```

Traces include fixture path, SHA-256 of the original file bytes, complete fictional entries, context and prompt version, logical transcript, ordered timestamped model/tool events, raw provider responses, usage when available, validation outcomes, errors and termination. Subsequent requests include correlated tool results; the initial request plus preceding raw responses reproduces the provider history. No request headers or API keys are recorded. Trace paths are printed only after a successful write.

**These traces contain journal text and questions. Real journals require stricter access controls, redaction, retention/deletion rules, and review of provider data policies before product use.** `store: false` is sent to OpenAI, but it is not a complete privacy policy.

## Validation and limitations

GitHub Actions runs `npm ci`, `npm run typecheck`, and `npm test` on pull requests and pushes to `main` (`.github/workflows/checks.yml`). It needs no API key. Dependency Review checks PR dependency changes and blocks high/critical known vulnerabilities. CodeQL scans JavaScript/TypeScript on PRs, pushes to `main`, and every Monday. These workflows use GitHub-provided authentication, not an OpenAI API key.

`npm test` uses scripted model adapters, SDK request snapshots, and the actual SDK against a local fake Responses endpoint. The CLI integration tests exercise search continuation, final output, saved traces, and a 429 failure with no automatic retry. The fake endpoint uses the SDK's existing `OPENAI_BASE_URL` environment setting and a synthetic key; these tests do not call OpenAI. It exercises orchestration, tool dispatch, fixture validation, deadlines, provider continuation mapping, tracing and CLI failures without live OpenAI calls. Tests prove that journal strings are never executed and cannot add privileged tools. They cannot prove a live model will always resist injection, cite accurately, retrieve all relevant entries, or handle contradictions correctly. Citations and answer grounding are instructed, not mechanically verified. No live OpenAI request was verified during implementation because no API key was available.

This is a learning prototype, not clinical advice or a replacement for human recovery support. See [the architecture](docs/ARCHITECTURE.md) for the loop and design tradeoffs.

Next three small milestones: compare full-context and tool-retrieval runs; evaluate evidence and citation correctness; add a simple trace viewer or replay tool. Those experiments are deliberately outside v0.1.

## Code documentation

Use [TSDoc](https://tsdoc.org/) `/** ... */` comments for exported functions,
interfaces, and types. Describe contracts and reasoning rather than repeating
TypeScript types. Use `@param` for constraints or ownership that the type does
not express, `@returns` for outcomes, and `@throws` for failures that escape to
the caller. Keep comments beside the implementation and update them when
behavior changes. Internal comments should explain execution order, trust
boundaries, provider continuation, cancellation, and other non-obvious decisions.

No documentation generator is required. Editors display these comments inline;
the architecture guide explains how the components fit together.
