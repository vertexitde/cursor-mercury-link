# cursor-mercury-link

An experimental patch that adds Inception's Mercury models to Cursor. You enter your Inception API key in Cursor's settings, next to the Google and OpenAI keys. Cursor keeps its agent harness, tools and approval controls. No extension is installed.

Companion projects: [cursor-gpt-link](https://github.com/vertexitde/cursor-gpt-link) and [cursor-claude-link](https://github.com/vertexitde/cursor-claude-link). All three can be installed together.

## Status

| Item | Current status |
| --- | --- |
| Client platform | Windows x64 |
| Supported Cursor | 3.21.18, commit `c4730f7d93d787d9ab120af715999f0345ee5bc0`; 3.21.16, commit `8ae78e8eee1e63479c7e0504b664bc0a80c68000`; 3.21.13, commit `e44a49c17e334d442e58bbde931d791200f014a0`; 3.21.12, commit `05ddb9e824590e2c1db6bd2548dd71bf67ac9d20`; 3.21.9, commit `9998796a6096ce83d83a9332bfe7473b985db750` |
| Models | Mercury 2.5 (260K context), Mercury 2 (128K context) |
| Inception API | Text, tool calls, parallel tool calls and streaming verified live on September 17, 2026 |
| Cursor 3.21.18 | Symbols re-derived and reviewed; all automated checks pass standalone and on top of both companions |
| Standalone and combined install | Automated checks pass on original bundles and on top of cursor-gpt-link and cursor-claude-link |
| Subagents | Task bubble registration, empty model inheritance, Explore Subagent Model with its effort, and stop cascade pass automated checks |
| Queued follow-ups and Plan to Build | Pass automated checks |
| Context window | Runtime reports 260K and 128K from the bridge catalog; checked against Cursor's native context budget |
| Max mode | Chosen effort is kept with Max mode on; checked against Cursor's native variant solver |
| Remote SSH | Inference stays local; routing passes automated checks, not yet tested on a real remote |
| Local installation | Installed after both companions; restore and reinstall verified; Cursor starts with no workbench errors and the bridge streams tool calls from Inception |
| In-app use | The picker section has been seen in Cursor. The settings card and agent turns with tools, edits and subagents have not yet been confirmed in the UI |
| Node.js used locally | 26.7.0 |

## What it adds

**Inception Mercury** appears as its own section in the model picker, below ChatGPT Subscription and Claude Subscription when those are installed. Each model carries the Inception mark and offers **Effort**: Instant, Low, Medium (default) or High, the four values the API accepts.

**Settings → Models** gains an **Inception API Key** card directly below the Google card, in the editor and in the Agents Window. The key is kept in Cursor's secret storage, the same store Cursor uses for its own provider keys. Clearing the field removes it. The link on the card opens the [Inception dashboard](https://platform.inceptionlabs.ai/dashboard/api-keys).

Mercury Edit 2 is not added: it serves fill-in-the-middle and edit completions, not chat or agent turns.

### In Cursor's agent harness

- **Subagents** run on Mercury like on other local models. A missing parent Task bubble is registered before Cursor waits for it, an empty `model` on a Task call inherits the parent model, and stopping a chat also stops its running subagents.
- **Explore Subagent Model**: selecting a Mercury model there reaches the local runtime together with its effort. Default, Inherit and Disabled keep Cursor's behaviour.
- **Queued follow-ups** are delivered to the running Mercury turn, and **Build** keeps unconfirmed messages when a plan starts.
- **Context**: the bridge reports each model's context window and output limit in the form Cursor's runtime reads, so context usage and summarisation work from 260K (Mercury 2.5) and 128K (Mercury 2).
- **Max mode**: Mercury has no Max variants. Cursor would otherwise replace a chosen effort with Instant while Max mode is on; the patch keeps the chosen effort, and the picker shows Medium by default in both modes.
- These features are shared with cursor-gpt-link and cursor-claude-link. Installing Mercury adds its models to the existing handling instead of installing a second copy.

## Images and PDFs

Mercury models accept text only. The Inception API rejects image and file parts with HTTP 400 (verified live), and Inception's own model catalog lists `text` as the only input modality. The patch therefore reports the models as text-only to Cursor. If a conversation that already contains images or PDFs is continued with Mercury, for example after switching from Claude, those parts are replaced by a short note such as `[Image omitted: Mercury accepts text only.]` instead of failing the whole request.

## Requirements

- Windows x64 and the supported Cursor build.
- Node.js 22 or newer on PATH.
- An Inception API key.
- Permission to modify the Cursor installation.

There are no npm dependencies.

## Install

Close Cursor. If you use cursor-gpt-link or cursor-claude-link, install them first; Mercury goes last.

```powershell
git clone https://github.com/vertexitde/cursor-mercury-link.git
cd cursor-mercury-link
npm test
npm run check
npm run install:patch
```

`check` verifies the Cursor version, commit, original file hashes (or matching companion installations), unique patch anchors and JavaScript syntax without writing anything. Start Cursor, open **Settings → Models**, paste your key into **Inception API Key**, and pick a Mercury model.

## Remove

Close Cursor and remove Mercury **before** removing either companion patch, because all three modify the same files:

```powershell
npm run restore
```

Restore checks that every patched file is unchanged, puts back the files as they were before Mercury, and updates the companion manifests so they keep recognising their own files.

## After a Cursor update

A Cursor update replaces the patched files. The installer refuses unknown builds. Supporting a new build means deriving its symbols from the original bundles, reviewing them and committing them:

```powershell
node scripts/derive-symbols.mjs <path to original resources/app>
node scripts/verify-build.mjs --original <original resources/app> --combined <resources/app with companions installed> [--version <build>]
```

`derive-symbols` locates each symbol by the role it plays and fails if any match is missing or ambiguous. Then remove the stale `installed.json`, and reinstall in order: ChatGPT, Claude, Mercury.

## How it works

- A local bridge listens on `127.0.0.1:43189` and starts with Cursor. It requires a random per-installation key.
- Cursor's local agent runtime asks the bridge for its model list and then sends chat completion requests to it. For each Mercury request, Cursor reads your Inception key from secret storage and sends it to the bridge in a request header. The bridge forwards it to `api.inceptionlabs.ai` and does not write it anywhere.
- The bridge removes the `inception-mercury/` model prefix, maps the `developer` role to `system`, keeps only parameters the API accepts, limits output tokens to the model's maximum, and normalises streamed chunks to the usual OpenAI shape.
- Missing or rejected keys and billing problems come back as readable errors that point to the settings card.
- In the workbench, the patch adds the models and settings card, routes Mercury through the local runtime (including Remote SSH, where inference stays local), and joins the shared queue, stop and subagent handling that the companion patches install.

## Security

The Inception key is stored by Cursor's secret storage and held in memory only while a request is prepared. The bridge accepts connections from the local machine only and rejects requests without its installation key. `config.json` contains that local key; do not share it. See [testing notes](docs/testing.md) for what was verified.

## License

MIT. Cursor is a trademark of Anysphere. Inception and Mercury are trademarks of Inception Labs. This project is not affiliated with either.
