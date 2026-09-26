# Testing notes

Updated on September 26, 2026.

## Environment

| Component | Version |
| --- | --- |
| Operating system | Windows, x64 |
| Cursor | 3.22.9, commit `2ca0f45baa06796a86f6c6ba2b9bedacaf94c370` (earlier reviewed builds: 3.22.5, 3.21.18, 3.21.16, 3.21.13, 3.21.12 and 3.21.9) |
| Node.js | 26.7.0 |
| Companion patches | cursor-gpt-link and cursor-claude-link, both installed for the same build |

## Inception API, verified live

Requests went directly to `https://api.inceptionlabs.ai/v1` with a temporary key.

| Check | Result |
| --- | --- |
| `GET /v1/models` | `mercury-2.5` (260,000 context, 65,536 output) and `mercury-2` (128,000 / 50,000); input modality `text` only |
| Text completion | Both models |
| `reasoning_effort` | `instant`, `low`, `medium`, `high` accepted; `max` rejected with 400 |
| Image part (`image_url`) | 400: multimodal content is not supported |
| PDF part (`file`) | 400: multimodal content is not supported |
| Tool call, parallel tool calls, tool result round trip, `tool_choice: "required"` | Work on Mercury 2.5; streamed tool calls also on Mercury 2 |
| Streaming with `stream_options.include_usage` | Usage in the final chunk |
| `developer` role | Rejected with 400 |
| Unknown OpenAI parameters (`store`, `metadata`, `service_tier`, `prompt_cache_key`), `cache_control` on text parts, `max_tokens` | Accepted |

Streamed chunks carry `content: null` and `tool_calls: null` in deltas, `id: null` and `name: null` on tool call continuations, and a top-level `reasoning_summary`. Reasoning tokens count towards `max_completion_tokens`; a 300-token budget ended tool-call requests with `finish_reason: "length"` before any call.

## Bridge

Unit tests (`npm test`) cover request preparation, stream normalisation, error messages, bridge authentication, the missing-key path and forwarding with a fake upstream.

Live through the bridge, a single streamed request combining a `developer` message, an image part, a PDF part, `max_tokens`, `reasoning.effort: "xhigh"`, `store`, `service_tier` and `prompt_cache_key` completed with a `read_file` tool call. The only `null` left in the stream was `finish_reason`, as in the OpenAI format. A missing key returned 401 before contacting Inception; an invalid key returned Inception's 401 with a pointer to the settings card; an unknown model returned 404.

After installation, the bridge started by Cursor served both models and streamed tool calls for Mercury 2.5 (medium effort, about 1.0 s) and Mercury 2 (instant, about 0.4 s).

## Cursor 3.22.9 update

Cursor 3.22.9 renamed 16 of the editor's and 31 of the Agents Window's derived symbols and changed nothing else; `scripts/derive-symbols.mjs` matched every one exactly once after reproducing the reviewed 3.22.5 values. Only `symbols-3.22.9.json`, the file hashes and the installer version changed. Both verification scenarios and the unit tests pass, and all three patches were installed together; Cursor started with no workbench errors and the bridge served both models.

## Cursor 3.22.5 update

Cursor 3.22.5 renamed 42 of the editor's and 41 of the Agents Window's derived symbols, and `scripts/derive-symbols.mjs` still matched every one of them exactly once after reproducing the reviewed 3.21.18 values. Two anchors moved with the minor release: the default model map renamed its prefix binding and mapper, and `subscribeHeaders` replaced its disposed-store ternary with an early return and dropped the reactive read. `subagent-lifecycle.mjs` now handles both shapes; the older builds keep their original treatment. Both verification scenarios and the unit tests pass, and all three patches were installed together; Cursor started with no workbench errors and the bridge served both models.

## Cursor 3.21.18 update

Cursor 3.21.18 renamed 11 of the editor's and 13 of the Agents Window's derived symbols without changing the anchored code. `scripts/derive-symbols.mjs` matched every symbol exactly once, after reproducing the reviewed 3.21.16 values, so only `symbols-3.21.18.json`, the file hashes and the installer version changed. Both verification scenarios and the unit tests pass, and all three patches were installed together; Cursor started with no workbench errors and the bridge served both models.

## Cursor 3.21.16 update

Cursor 3.21.16 renamed about half the obfuscated workbench symbols on each surface without changing the anchored code. `scripts/derive-symbols.mjs` matched every symbol exactly once, after reproducing the reviewed 3.21.13 values, so only `symbols-3.21.16.json`, the file hashes and the installer version changed. Both verification scenarios and the unit tests pass, and all three patches were installed together; Cursor started with no workbench errors and the bridge served both models.

## Cursor 3.21.13 update

Cursor 3.21.13 renamed the obfuscated workbench symbols again without changing the anchored code. `scripts/derive-symbols.mjs` found every symbol once on the first run, after reproducing the reviewed 3.21.12 values, so only `symbols-3.21.13.json`, the file hashes and the installer version changed. Both verification scenarios and the unit tests pass, and all three patches were installed together; Cursor started with no workbench errors and the bridge served both models.

## Cursor 3.21.12 update

Cursor 3.21.12 renamed the obfuscated workbench symbols again without changing the anchored code. `scripts/derive-symbols.mjs` was run against the original 3.21.12 bundles and reproduced the reviewed 3.21.9 values when run against that build first, so only `symbols-3.21.12.json`, the file hashes and the installer version needed to change. Both verification scenarios and the unit tests pass on 3.21.12, and all three patches were installed together; Cursor started with no workbench errors and the bridge served both models. Names are recycled between builds, so per-version symbol tables are never edited symbol by symbol.

## Cursor bundles

Symbols were derived with `scripts/derive-symbols.mjs` from the original 3.21.9 bundles. Every symbol matched once. The picker, run gate, dedicated runtime host, activation, Task bubble and subagent service values agree with those reviewed for cursor-gpt-link and cursor-claude-link on the same build.

`scripts/verify-build.mjs` patched the original bundles (standalone) and the bundles with both companions installed (combined). In both scenarios, for the editor and the Agents Window, it checked syntax and anchor uniqueness and then executed:

- the three-provider picker helper, and the Inception Mercury section render call;
- the settings card with stub components and services: it reads the saved key, stores a trimmed key, deletes it when cleared, and opens the dashboard link;
- the provider configuration branch: the bridge address and key, the Inception key header when a key is saved, no header without one, and native handling for other models;
- the reasoning branch in both runtime bundles for all four efforts, the subagent model normalisation and the shared action registry.

The same run executes Cursor's own extracted code with Mercury models, adapted from the cursor-gpt-link checks:

- **Max mode solver**: reproduces the native fallback that turns a chosen High effort into Instant while Max mode is on, then confirms every Mercury effort survives in both modes and that the default is Medium.
- **Subagent barrier**: reproduces the missing Task bubble timeout, then confirms the repair registers a real bubble once.
- **Subagent model resolver**: reproduces the empty-model failure, then checks inheritance, configured defaults, forced models, blocked and invalid selections.
- **Explore Subagent Model**: reproduces the missing local catalog entry, then checks model selection with its effort, and Default, Inherit and Disabled.
- **Subagent lifecycle**: idle-parent stop cascade, immediate local stop and transcript cache refresh.
- **Action manager**: queued delivery, Build forwarding, replay, acknowledgement and Stop, in the workbench and both runtime bundles.
- **Workbench routing**: dedicated runtime for Remote SSH, workspace runtime locally, the Explore model catalog, forwarded run options and the Inception key header.
- **Catalog and context**: both catalog entries pass the runtime's extended capability check, and Cursor's context budget reports 260,000 and 128,000.

In the combined scenario, both companion helper copies were replaced, each of the three picker sections was present once, and the shared subagent and action registries listed all three providers. The cursor-gpt-link suite (subscription settings and login, action manager, Max toggle with context and Fast, subagent lifecycle, routing, subagent barrier, model resolver, Explore settings and context budget) also passed on bundles with Mercury installed on top, so the companion behaviour is unchanged.

`npm run check` passed on the local installation with both companion manifests recognised. After `npm run install:patch`, all three manifests matched the files on disk, the workbench checksum matched, and Cursor started with no workbench errors in its logs. `npm run restore` removed the first installation and updated both companion manifests; the current version was then installed again with the same results, and Cursor restarted all three bridges.

## Seen in Cursor

The Inception Mercury section appeared in the model picker below Claude Subscription. That view showed two problems that are now fixed: the icon's line breaks put it on its own line, and with Max mode on both models showed Instant instead of Medium.

## Not yet confirmed

The settings card and agent turns with tool calls, file edits and subagents have not been confirmed in the Cursor UI. Remote SSH with Mercury is untested on a real remote.
