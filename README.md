# cursor-mercury-link

An experimental patch that adds Inception's Mercury models to Cursor. You enter your Inception API key in Cursor's settings, next to the Google and OpenAI keys. Cursor keeps its agent harness, tools and approval controls. No extension is installed.

Companion projects: [cursor-gpt-link](https://github.com/vertexitde/cursor-gpt-link) and [cursor-claude-link](https://github.com/vertexitde/cursor-claude-link). All three can be installed together.

## Status

| Item | Current status |
| --- | --- |
| Client platform | Windows x64 |
| Supported Cursor | 3.22.9, commit `2ca0f45baa06796a86f6c6ba2b9bedacaf94c370`; 3.22.5, commit `a00aa8754ab5bae70b637d98e126f9dbd4e1e5d0`; 3.21.18, commit `c4730f7d93d787d9ab120af715999f0345ee5bc0`; 3.21.16, commit `8ae78e8eee1e63479c7e0504b664bc0a80c68000`; 3.21.13, commit `e44a49c17e334d442e58bbde931d791200f014a0`; 3.21.12, commit `05ddb9e824590e2c1db6bd2548dd71bf67ac9d20`; 3.21.9, commit `9998796a6096ce83d83a9332bfe7473b985db750` |
| Models | Mercury 2.5 (260K context), Mercury 2 (128K context) |
| Inception API | Text, tool calls, parallel tool calls and streaming verified live on September 17, 2026 |
| Cursor 3.22.9 | Symbols re-derived and reviewed; all automated checks pass standalone and on top of both companions |
| Standalone and combined install | Automated checks pass on original bundles and on top of cursor-gpt-link and cursor-claude-link |
| Subagents | Task bubble registration, empty model inheritance, Explore Subagent Model with its effort, and stop cascade pass automated checks |
| Queued follow-ups and Plan to Build | Pass automated checks |
| Context window | Runtime reports 260K and 128K from the bridge catalog; checked against Cursor's native context budget |
| Max mode | Chosen effort is kept with Max mode on; checked against Cursor's native variant solver |
| Remote SSH | From 3.22.9 the agent runs on the host and reaches the bridge through an ssh reverse forward the installer writes; automated checks pass, not yet tested on a real remote |
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

## Remote sessions

In a Remote-SSH window the agent runs on the host, so the host has to reach the bridge. The installer adds a reverse forward to `~/.ssh/config`, inside a marked block it owns:

```
# >>> cursor subscription links: bridge forwarding >>>
Host your-server
    RemoteForward 127.0.0.1:43189 127.0.0.1:43189
# <<< cursor subscription links: bridge forwarding <<<
```

The hosts are the ones you have opened in Cursor that are also declared in your `~/.ssh/config`; nothing else is touched, so ssh to anything outside that list, `git push` included, is unaffected. All three links share the block, each owning the line for its own port, and `npm run restore` removes only its own. A copy of the file as it was before the first change is kept as `config.before-cursor-links`.

### The host's own runtime

The workbench patch is on the client, but four repairs live in the two extension runtimes, and those run wherever the agent runs: reasoning effort and Fast forwarding, the subagent model repair that lets an omitted Task model inherit the parent, the Explore subagent settings, and the receiver for queued follow-ups. In a remote session the host uses its own copy of Cursor under `~/.cursor-server`, so without this step a Task call that omits the optional `model` is rejected there with *Invalid model selection ""*, and the effort you picked is dropped before the request leaves the host.

```powershell
npm run install:remote -- your-server
```

It reads the two bundles over ssh, patches and syntax-checks them on the client, writes them back with a rename and keeps the untouched copy beside each file. `--check` reports what would change without writing, and `--restore` puts the originals back. The three links share one manifest on the host, each adding its own provider, so install them in the same order as locally.

**After the first time this is automatic.** A local install walks the hosts in the ssh block, and every host that already carries the manifest is brought to the new build. A host that was never patched is passed over: installing on a machine is a decision of its own, not a side effect of patching this client. `--no-remote` skips the step.

A Windows host is handled too: its default shell is cmd, so every command travels as an encoded PowerShell script and file contents move as base64 in both directions. `--all` walks the hosts in the ssh block and takes every one that already runs a server for this build; a host you have not opened since the Cursor update has nothing to patch yet, so connect once and run it again.

| Flag | Effect |
| --- | --- |
| `--ssh-hosts=a,b` | Configure exactly these hosts instead of the detected ones |
| `--no-ssh` | Change nothing in `~/.ssh/config` |
| `--no-remote` | Do not carry the runtime patch to known hosts |

Two things to know. A second ssh session to the same host cannot bind the port again and ssh prints `remote port forwarding failed`; the session still works, and the first one keeps serving the bridge. And the bridge becomes reachable on that host's loopback, so only forward to hosts you trust with it. The bridge still requires its per-installation key.

The agent on the host uses the server's own copy of Cursor's runtime under `~/.cursor-server`, which this patch does not touch. Model selection, tool calls and file edits work from there, but the runtime-side extras this patch adds locally, reasoning effort forwarding and the subagent model repairs, are not present on the host yet.

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
- In the workbench, the patch adds the models and settings card, routes Mercury through the local runtime, and joins the shared queue, stop and subagent handling that the companion patches install. In a Remote-SSH window the agent runs on the host and reaches the bridge through an ssh reverse forward the installer writes; see [Remote sessions](#remote-sessions).

## Security

The Inception key is stored by Cursor's secret storage and held in memory only while a request is prepared. The bridge accepts connections from the local machine only and rejects requests without its installation key. `config.json` contains that local key; do not share it. See [testing notes](docs/testing.md) for what was verified.

## License

MIT. Cursor is a trademark of Anysphere. Inception and Mercury are trademarks of Inception Labs. This project is not affiliated with either.
