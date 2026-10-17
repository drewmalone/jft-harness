# Architecture

JFT keeps the harness explicit so two engineers can follow each decision. `cli-options.ts` uses Commander for parsing, required arguments, help and integer option validation. `config.ts` validates model credentials and defaults. `cli.ts` loads configuration, loads the fixture, supplies cancellation, and prints either a final answer or a failed-run message. `fixture-validation.ts` validates calendar dates, unique IDs and text with Zod's ISO 8601 date validator and validator's alphanumeric checks. `entries.ts` loads the file and hashes its original bytes. `context.ts` holds the versioned instructions and a small date-range context; retrieval mode sends journal content through tool results, while full mode sends every entry in a separate user-role JSON message before the question. Trusted instructions never contain journal text. The latest fixture date anchors relative-date questions, making historical fixture runs reproducible.

`limits.ts` validates programmatic execution budgets. `tools/search-entries.ts` owns tool authorization and argument validation; response completion is checked beside model-turn handling in the harness. `tool-execution.ts` executes validated search calls and records their results. `timeout.ts` isolates deadline and cancellation handling. `harness.ts` owns orchestration and a logical user/assistant/tool transcript. Its narrow `ModelAdapter` interface permits a scripted fake for tests; it is not a universal provider framework. `provider.ts` owns the official OpenAI SDK and maps output function calls to `{id, name, arguments}` while retaining provider-specific output items. `tools/search-entries.ts` owns search arguments, the generated JSON Schema and deterministic search. `trace.ts` handles trace construction and file persistence without driving execution.

## One tool interaction

```mermaid
sequenceDiagram
  participant CLI
  participant Harness
  participant Adapter
  participant OpenAI
  participant Search
  CLI->>Harness: question + validated fixture + limits
  Harness->>Adapter: context and question
  Adapter->>OpenAI: Responses request with search definition
  OpenAI-->>Adapter: function_call (call_id, raw arguments)
  Adapter-->>Harness: normalized call + raw response
  Harness->>Harness: allowlist, JSON parse, Zod, budget
  Harness->>Search: validated query and limit
  Search-->>Harness: entries (untrusted data)
  Harness->>Adapter: result correlated by call_id
  Adapter->>OpenAI: prior output items + function_call_output
  OpenAI-->>Adapter: final text
  Adapter-->>Harness: answer + usage + raw response
  Harness->>Harness: finish and save trace
  Harness-->>CLI: outcome, answer, trace path
```

## Continuation and termination

Each run creates one adapter. It sends `store: false`, requests encrypted reasoning content for stateless continuation, and replays local history, including complete reasoning items, assistant messages and function calls, then matching `function_call_output` items. This avoids assuming text-only role messages capture Responses API state. Unsupported output types fail explicitly. Instructions are supplied on every request. Raw provider responses in ordered events preserve inspectable continuation evidence; the harness transcript is a simpler logical view.

All calls in a response are considered before accepting final text. If calls and text coexist, text is recorded but not treated as final. Calls execute sequentially in output order. In retrieval mode only `search_entries` is allowed; full mode advertises no tools and rejects every tool call at the execution boundary. Otherwise, and its JSON arguments must pass the same Zod schema used to generate the advertised tool schema. API strict mode is off to permit an omitted default limit; local validation is always enforced. Unknown fields, malformed JSON, invalid limits and unknown tools produce correlated error outputs for the next model turn. No dynamic tool lookup, shell execution or automatic tool retry exists.

Rejected requests consume budget. On budget exhaustion the loop stops without making another provider request, so unprocessed calls need no continuation outputs. A tool execution exception or timeout records a structured tool failure and terminates rather than continuing a partially processed batch. Termination distinguishes `completed`, `model_limit`, `tool_limit`, `timeout`, `provider_error` and `internal_error`. Empty and incomplete provider responses fail; no misleading successful partial answer is returned.

Per-operation timers race work and pass cancellation signals. Overall remaining time caps each operation. Configured durations are capped at Node's timer maximum (2,147,483,647 milliseconds), and the timeout helper also rejects overflowing/nonfinite delays before work starts. Timers and listeners are cleaned up. SDK retries are zero and there are no harness retries. Cancellation cannot forcibly interrupt synchronous JavaScript; fixture size limits or worker isolation would be needed for untrusted large datasets. Missing configuration and invalid fixtures are preflight errors, outside attempted harness runs.

## Tracing and evidence

Every begun run collects timestamped typed events in order, including requests, responses, raw calls, validation, tool results, durations and errors. The trace identifies contextMode; the final trace adds outcome, answer if available and total duration. Existing request/tool events supply counts, and model_response events retain provider-reported usage without fabricated totals. It contains prompt version, context, fixture bytes hash and parsed data for reproduction. Persistence is attempted once at termination; if it fails, the CLI fails and reports the disk/permissions issue. The returned in-memory trace changes to `internal_error`, removes `finalAnswer`, and appends a `trace_write` event while preserving any earlier provider/tool failure evidence. Hard process termination cannot guarantee a trace. Failed provider requests record the logical request and error rather than fabricating a response or usage.

Journal entries are untrusted strings inside tool result objects (retrieval) or a separate user-role JSON message (full). JSON serialization preserves strings and entry IDs/dates but does not make a model immune to instructions inside those strings. Instructions explicitly separate them from authority. Deterministic tests verify the dispatch boundary even when scripted model output requests an unauthorized tool after seeing malicious content. This proves the allowlist, not model-level injection resistance or factual accuracy. A live model can still misinterpret text, omit contrary evidence or invent citations.

## Tradeoffs

Search tokenization uses `Intl.Segmenter('en')` word boundaries without regular expressions. Exact keyword search is readable, cheap, stable and testable without external services. It has weak recall for synonyms and morphology, cannot infer semantic relationships, and relies on the model for date interpretation. Stable fixture-order ties make failures reproducible. The selectable full-context experiment trades keyword recall and search round trips for larger initial input; both modes reuse the same orchestration loop.

There are no agents, planners, parallel tools, generic plugin registry, embeddings, vector stores, database, frontend, audio, authentication, deployment or evaluation infrastructure. Prompt changes are a versioned constant rather than a management system. Real journal use requires a separate privacy and retention design; full content traces are acceptable here only because all data is fictional.

The orchestration code separates requesting a model turn, executing a sequential tool batch, advancing the loop, classifying failures, and finishing the trace. The loop itself carries only pending results and execution budgets.

Fixture validation uses existing libraries for syntax and calendar rules:
`validator` checks ASCII alphanumeric IDs with explicitly permitted `_` and `-`
characters, and `z.iso.date()` accepts only real ISO 8601 `YYYY-MM-DD` dates.
There is no application-owned date parser or character classifier. The duplicate
ID check stays local because uniqueness across entries is a fixture-level rule.
A date arithmetic library is unnecessary while the harness only validates and
sorts dates; fixed-width ISO calendar dates sort chronologically as strings.

Tool execution receives only entries, an optional search implementation, and a
cancellation signal; it has no dependency on harness configuration. Execution
owns the instructions and copies them into the trace, so tracing remains an
observer rather than the source of model context. Run outcomes distinguish a
completed answer from a failed run with an error. Tool outputs similarly contain
either entries or a structured error, never both. Provider-specific raw evidence
remains opaque.

Provider tests snapshot each SDK request at invocation so later mutations to
continuation history cannot change earlier expectations. CLI integration tests
launch the actual CLI process and SDK against a loopback HTTP server implementing
two scripted Responses turns, then inspect correlated search results and the saved
trace. A local 429 response also verifies nonzero exit and disabled SDK retries.
These are protocol checks with synthetic data, not live-model validation.
