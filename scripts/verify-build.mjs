// Opt-in local verification. Patches ORIGINAL bundles (standalone install) and,
// optionally, bundles already patched by cursor-gpt-link and cursor-claude-link
// (combined install), then executes the new code paths with stubs.
// Cursor's bundled code is read locally and never included in this repository.
//
//   node scripts/verify-build.mjs --original <resources/app | companion backup dir> [--combined <resources/app>] [--version 3.21.12]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {patchWorkbench, patchRuntime, providerConfigBranch, mercuryReasoningBranch} from '../patches.mjs';
import {settingsCardSrc, apiKeyName} from '../settings-card.mjs';
import {pickerSectionHelpersSrc} from '../picker-sections.mjs';
import {prefix, providerModels} from '../models.mjs';
import {supportedVersions, tunnelledBuilds} from '../build-support.mjs';
import {verifyConversationActionsWorkbench, verifyConversationActionsRuntime} from './checks/conversation-actions-check.mjs';
import {verifySubagentLifecycle} from './checks/subagent-lifecycle-check.mjs';
import {verifySubagentRegistration} from './checks/subagent-registration-check.mjs';
import {verifySubagentModels} from './checks/subagent-model-check.mjs';
import {verifySubagentSettings} from './checks/subagent-settings-check.mjs';
import {verifyMaxMode, verifyContextBudget} from './checks/max-mode-check.mjs';
import {verifyWorkbenchRouting} from './checks/workbench-routing-check.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => (i % 2 ? pairs : [...pairs, [all[i].slice(2), all[i + 1]]]), []));
if (!args.original) throw new Error('Usage: node scripts/verify-build.mjs --original <resources/app | gpt backup dir> [--combined <resources/app>]');
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
// Default to the newest reviewed build; --version checks an older one.
const version = args.version ?? supportedVersions[0];
const symbols = JSON.parse(fs.readFileSync(path.join(here, '..', `symbols-${version}.json`), 'utf8'));
// Builds that let the agent run on the SSH host instead of the dedicated UI runtime.
const remoteTunnel = tunnelledBuilds.includes(version);
const config = {port:43189, key:'0'.repeat(64)};

function bundleFiles(dir) {
  if (fs.existsSync(path.join(dir, '0-workbench.desktop.main.js'))) return {
    desktop:path.join(dir, '0-workbench.desktop.main.js'), glass:path.join(dir, '1-workbench.glass.main.js'),
    exec:path.join(dir, '2-main.js'), runtime:path.join(dir, '3-main.js')};
  return {desktop:path.join(dir, 'out/vs/workbench/workbench.desktop.main.js'), glass:path.join(dir, 'out/vs/workbench/workbench.glass.main.js'),
    exec:path.join(dir, 'extensions/cursor-agent-exec/dist/main.js'), runtime:path.join(dir, 'extensions/cursor-local-agent-runtime/dist/main.js')};
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-mercury-link-verify-'));
function syntax(label, content) {
  const file = path.join(temp, label.replace(/\W+/g, '-') + '.mjs');
  fs.writeFileSync(file, content);
  execFileSync(process.execPath, ['--check', file], {stdio:'pipe', windowsHide:true});
  fs.unlinkSync(file);
}

async function verifySettingsCard(content, surface) {
  const s = symbols[surface];
  const src = settingsCardSrc(s);
  assert.ok(content.includes(src), 'settings card source present');
  assert.ok(content.includes(`${s.keyJsx}(__MercuryApiKeyCard,{settingsWorkspace:n},"inception-api-key")`), 'card placed after the Google card');
  const calls = [], opened = [];
  const secrets = {get:async name => (calls.push(['get', name]), 'sk_saved'), set:async (name, value) => calls.push(['set', name, value]), delete:async name => calls.push(['delete', name])};
  const effects = [];
  const jsx = (type, props, key) => ({type, props, key});
  const scope = {
    [s.useService]:id => (assert.equal(id, 'SECRETS'), secrets), [s.secretStorage]:'SECRETS',
    [s.settingsService]:(workspace, id) => (assert.equal(id, 'OPENER'), {open:url => opened.push(url)}), [s.openerId]:'OPENER',
    [s.useState]:initial => [initial, () => {}], [s.useEffect]:effect => effects.push(effect),
    [s.jsxs]:jsx, [s.keyJsx]:jsx, [s.descriptionWrapper]:'Description', [s.link]:'Link', [s.card]:'Card', [s.keyInput]:'Input',
    [s.zs]:{Root:'Root', Entry:'Entry'}, __mercuryApiKeyName:apiKeyName};
  const card = new Function(...Object.keys(scope), src + 'return __MercuryApiKeyCard;')(...Object.values(scope));
  const tree = card({settingsWorkspace:{}});
  assert.equal(tree.props.title, 'Inception API Key');
  effects.forEach(effect => effect());
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(calls[0], ['get', apiKeyName], 'saved key is read from secret storage');
  const input = tree.props.children.props.children.props.children;
  assert.equal(input.props.type, 'password');
  input.props.onCommit('  sk_new  ');
  input.props.onCommit('');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(calls.slice(1), [['set', apiKeyName, 'sk_new'], ['delete', apiKeyName]], 'commit stores trimmed key, empty removes it');
  tree.props.description.props.children[2].props.onClick();
  assert.deepEqual(opened, ['https://platform.inceptionlabs.ai/dashboard/api-keys']);
}

async function verifyProviderConfig(content, surface) {
  const s = symbols[surface];
  const header = content.match(/async getLocalAgentProviderConfig\(([\w$]+),([\w$]+)\)\{/);
  const branch = providerConfigBranch(`${header[2]}?.requestedModel?.modelId??${header[1]}?.modelId`, s.secretStorage);
  assert.ok(content.includes(header[0] + branch), 'provider branch runs first');
  const make = key => new Function('__isMercuryModel', '__mercuryBridgeBase', '__mercuryBridgeKey', '__mercuryApiKeyName', s.secretStorage,
    `return async function(${header[1]},${header[2]}){${branch}return "native"}`)(
    m => typeof m === 'string' && m.startsWith(prefix), 'http://127.0.0.1:43189', 'bridge-key', apiKeyName, 'SECRETS');
  const service = key => ({instantiationService:{invokeFunction:fn => fn({get:id => (assert.equal(id, 'SECRETS'), {get:async name => (assert.equal(name, apiKeyName), key)})})}});
  // Both surfaces pass the request first and the run options second; only the
  // minified parameter names differ.
  const [first, second] = [{modelId:prefix + 'mercury-2'}, {requestedModel:{modelId:prefix + 'mercury-2.5'}}];
  const withKey = await make().call(service('sk_live'), first, second);
  assert.deepEqual(withKey, {baseUrl:'http://127.0.0.1:43189/v1', apiKey:'bridge-key', customHeaders:{'x-inception-api-key':'sk_live'}});
  assert.deepEqual((await make().call(service(undefined), first, second)).customHeaders, {}, 'missing key sends no header');
  assert.equal(await make().call(service('sk'), {modelId:'claude-subscription/opus'}, {}), 'native', 'other models untouched');
}

function verifyWorkbenchWiring(content, surface) {
  const s = symbols[surface];
  assert.ok(content.includes(pickerSectionHelpersSrc), 'three-provider picker helper present');
  const helper = new Function(pickerSectionHelpersSrc + 'return __withSubscriptionPickerSections;')();
  const grouped = helper({leading:[{name:prefix + 'mercury-2'}], promoted:[{name:'claude-subscription/opus'}, {name:'gpt-5'}], others:[{name:'chatgpt-codex/gpt-6'}]});
  assert.deepEqual(grouped.mercury.map(m => m.name), [prefix + 'mercury-2']);
  assert.deepEqual(grouped.promoted.map(m => m.name), ['gpt-5']);
  assert.equal(grouped.claude.length + grouped.chatgpt.length, 2);
  assert.ok(content.includes(`${s.modelsVar}.mercury.length>0&&${s.jsx}(${s.fmt},{models:${s.modelsVar}.mercury,title:"Inception Mercury",renderModel:${s.renderModel}},"inception-mercury-models")`), 'Mercury section rendered');
  assert.match(content, /getAvailableDefaultModels\(\)\{return __withMercuryModels\(/, 'default models include Mercury');
  assert.ok(content.includes(`${s.mapVar}=__withMercuryModels(`), 'mapped models include Mercury');
  assert.match(content, /__isMercuryModel\(u\?\.requestedModel\?\.modelId\?\?i\?\.modelId\)/, 'Mercury requests use the local runtime');
  // With the tunnel, a remote session keeps Cursor's own decision and runs the
  // agent on the host; before it, Mercury was forced into the local runtime.
  const forced = `(__isMercuryModel(${s.hostModelVar})&&Boolean(this.environmentService.remoteAuthority)||${s.host}(this.storageService,"useDedicatedLocalAgentRuntimeHost"))`;
  if (remoteTunnel) {
    assert.ok(!content.includes(forced), 'remote sessions are not forced into the local runtime');
    assert.ok(content.includes(`${s.host}(this.storageService,"useDedicatedLocalAgentRuntimeHost")`), 'the native runtime decision is still there');
  } else assert.ok(content.includes(forced), 'remote SSH routing');
  assert.ok(content.includes('__ensureMercuryTaskBubble(this._composerDataService,'), 'task bubble repair wired');
  for (const registry of ['__subscriptionSubagentPrefixes', '__subscriptionActionPrefixes']) {
    const list = JSON.parse(content.match(new RegExp(`var ${registry}=(\\[[^;]+\\]);`))[1]);
    assert.ok(list.includes(prefix), `${registry} includes Mercury`);
  }
}

function verifyRuntime(content) {
  const effort = content.match(/"none"===([\w$]+)\?void 0:\1\}\(([\w$]+)\);/);
  assert.ok(content.includes(effort[0] + mercuryReasoningBranch(effort[2])), 'reasoning branch wired');
  const header = content.match(/function\(e,t,[\w$]+,[\w$]+,[\w$]+,[\w$]+=!1,i\)\{const a=function\(e\)\{/);
  const end = content.slice(header.index).search(/\}\([\w$]+,t,[\w$]+,[\w$]+,[\w$]+,null!=[\w$]+&&[\w$]+,a\)/) + header.index;
  const normalize = new Function('return (' + content.slice(header.index, end + 1) + ')')();
  for (const value of ['instant', 'low', 'medium', 'high']) {
    const request = {reasoning:{effort:'x'}, service_tier:'priority'};
    normalize(request, prefix + 'mercury-2.5', [{id:'reasoning', value}], 'openai_compatible');
    assert.deepEqual(request, {reasoning_effort:value});
  }
  assert.ok(content.includes('__normalizeMercurySubagentModel'), 'subagent model normalization wired');
  assert.ok(JSON.parse(content.match(/var __subscriptionActionPrefixes=(\[[^;]+\]);/)[1]).includes(prefix), 'runtime action registry includes Mercury');
}

// The runtime trusts catalog context and output limits only for entries whose
// API type, tool use, streaming and text output it recognises.
function verifyCatalogCapabilities(content) {
  const types = content.match(/const ([\w$]+)=new Set\((\["chat_completions",[^\]]*\])\),([\w$]+)=new Set\(\[\.\.\.\1,"anthropic_messages"\]\)/);
  assert.ok(types, 'Native API type list found');
  const known = new Set([...JSON.parse(types[2]), 'anthropic_messages']);
  assert.ok(content.includes('return!1;return ') && /!0===n\.supports_tool_use&&!0===n\.supports_streaming&&!0===\(null===\(t=n\.output_modalities\)/.test(content), 'Native extended capability check found');
  for (const entry of providerModels()) {
    const c = entry.capabilities;
    assert.ok(entry.api_types.some(type => known.has(type)) && c.supports_tool_use === true && c.supports_streaming === true && c.output_modalities.includes('text'),
      `${entry.id} passes the extended capability check`);
    verifyContextBudget(content, entry);
  }
}

const registry = (content, name) => JSON.parse(content.match(new RegExp(`var ${name}=(\\[[^;]+\\]);`))[1]);

async function scenario(label, dir) {
  const files = bundleFiles(dir);
  for (const surface of ['desktop', 'glass']) {
    const content = patchWorkbench(fs.readFileSync(files[surface], 'utf8'), surface, symbols[surface], config, {remoteTunnel});
    syntax(`${label}-${surface}`, content);
    verifyWorkbenchWiring(content, surface);
    await verifySettingsCard(content, surface);
    await verifyProviderConfig(content, surface);
    console.log(`${label} ${surface}: syntax, unique anchors, picker, settings card and provider configuration passed.`);
    verifyMaxMode(content);
    await verifySubagentRegistration(content);
    await verifySubagentLifecycle(content, registry(content, '__subscriptionSubagentPrefixes'));
    await verifyConversationActionsWorkbench(content, registry(content, '__subscriptionActionPrefixes'));
    await verifyWorkbenchRouting(content, undefined, {remoteTunnel});
  }
  for (const name of ['exec', 'runtime']) {
    const content = patchRuntime(fs.readFileSync(files[name], 'utf8'));
    syntax(`${label}-${name}`, content);
    verifyRuntime(content);
    console.log(`${label} ${name}: syntax, unique anchors, reasoning forwarding and registries passed.`);
    await verifySubagentModels(content);
    verifySubagentSettings(content);
    verifyConversationActionsRuntime(content);
    verifyCatalogCapabilities(content);
  }
}

try {
  await scenario('standalone', args.original);
  if (args.combined) await scenario('combined', args.combined);
} finally {
  fs.rmSync(temp, {recursive:true, force:true});
}
