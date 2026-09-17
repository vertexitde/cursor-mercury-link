import {patchPickerSections} from './picker-sections.mjs';
import {patchSettingsCard, apiKeyName} from './settings-card.mjs';
import {patchSubagentBubbles} from './subagent-bubbles.mjs';
import {patchSubagentLifecycle} from './subagent-lifecycle.mjs';
import {patchConversationActionsWorkbench, patchConversationActionsRuntime} from './conversation-actions.mjs';
import {patchSubagentModel} from './subagent-model.mjs';
import {patchSubagentSettingsWorkbench, patchSubagentSettingsRuntime} from './subagent-settings.mjs';
import {patchMaxMode} from './max-mode.mjs';
import {pickerModels, prefix} from './models.mjs';

export const keyHeader = 'x-inception-api-key';
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function once(source, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Unsupported or repeated patch anchor (${count} matches): ${before.slice(0, 100)}`);
  return source.replace(before, () => after);
}

function onlyMatch(source, pattern, label) {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`${label} anchor is not unique (${matches.length} matches)`);
  return matches[0];
}

export function workbenchPrelude({port, key}) {
  return `
/* cursor-mercury-link: the Inception API key stays in Cursor's secret storage */
var __mercuryModels=${JSON.stringify(pickerModels())};
const __mercuryBridgeBase=${JSON.stringify('http://127.0.0.1:' + port)},__mercuryBridgeKey=${JSON.stringify(key)},__mercuryApiKeyName=${JSON.stringify(apiKeyName)};
function __isMercuryModel(m){return typeof m==="string"&&m.startsWith(${JSON.stringify(prefix)})}
function __withMercuryModels(models){return [...models.filter(m=>!__isMercuryModel(m.name)),...__mercuryModels]}
`;
}

// Returned for Mercury models before Cursor's own provider resolution. The key
// is read from secret storage on every request and sent only to the bridge.
export function providerConfigBranch(modelExpression, secretStorage) {
  return `if(__isMercuryModel(${modelExpression})){let __mercuryKey;try{__mercuryKey=await this.instantiationService.invokeFunction(a=>a.get(${secretStorage})).get(__mercuryApiKeyName)}catch{}return{baseUrl:__mercuryBridgeBase+"/v1",apiKey:__mercuryBridgeKey,customHeaders:__mercuryKey?{${JSON.stringify(keyHeader)}:__mercuryKey}:{}}}`;
}

export function patchWorkbench(source, surface, symbols, config) {
  if (!['desktop', 'glass'].includes(surface)) throw new Error('Unknown workbench surface: ' + surface);
  if (source.includes('__mercuryBridgeBase')) throw new Error('Mercury patch marker already present.');
  const s = symbols;
  source = workbenchPrelude(config) + source;
  source = patchPickerSections(source, once, s);

  // The default model list, possibly already wrapped by cursor-gpt-link or cursor-claude-link.
  const getter = onlyMatch(source, /getAvailableDefaultModels\(\)\{return ?((?:__with[\w$]+\()*\[\.\.\.this\._availableDefaultModels\(\)\]\)*)\}/g, 'Default model getter');
  source = once(source, getter[0], `getAvailableDefaultModels(){return __withMercuryModels(${getter[1]})}`);
  const mapper = new RegExp(escapeRegex(s.mapPrefix) + escapeRegex(s.mapVar) + '=((?:__with[\\w$]+\\()*' + escapeRegex(s.mapVar) + '\\)*)\\.map\\(' + escapeRegex(s.mapper) + '\\)', 'g');
  const map = onlyMatch(source, mapper, 'Default model mapping');
  source = once(source, map[0], `${s.mapPrefix}${s.mapVar}=__withMercuryModels(${map[1]}).map(${s.mapper})`);

  const provider = onlyMatch(source, /async getLocalAgentProviderConfig\(([\w$]+),([\w$]+)\)\{/g, 'Provider configuration');
  source = once(source, provider[0], provider[0] + providerConfigBranch(`${provider[2]}?.requestedModel?.modelId??${provider[1]}?.modelId`, s.secretStorage));

  // Route Mercury requests through the local agent runtime.
  const requested = 'u?.requestedModel?.modelId??i?.modelId';
  if (source.includes('const __chatgptLocal=')) source = once(source, 'const __chatgptLocal=', `const __chatgptLocal=__isMercuryModel(${requested})||`);
  else if (source.includes('const __claudeLocal=')) source = once(source, 'const __claudeLocal=', `const __claudeLocal=__isMercuryModel(${requested})||`);
  else {
    const local = s.localMode;
    source = once(source, s.runAnchor, s.runAnchor
      .replace('{const ', `{const __mercuryLocal=__isMercuryModel(${requested});const `)
      .replace(`localMode:${local}.localMode})`, `localMode:${local}.localMode||__mercuryLocal})`)
      .replace(`if(${local}.localMode){`, `if(${local}.localMode||__mercuryLocal){`));
  }
  // Remote SSH: keep inference local while tools run through the workspace host.
  const dedicated = `${s.host}(this.storageService,"useDedicatedLocalAgentRuntimeHost")`;
  source = once(source, dedicated, `(__isMercuryModel(${s.hostModelVar})&&Boolean(this.environmentService.remoteAuthority)||${dedicated})`);
  if (source.includes(s.activation)) source = once(source, s.activation, s.activation.replace('return ', 'return typeof __mercuryBridgeBase==="string"||'));

  source = patchSettingsCard(source, once, s);
  source = patchMaxMode(patchSubagentSettingsWorkbench(source));
  source = patchSubagentBubbles(source, surface, s);
  source = patchSubagentLifecycle(source, surface, prefix, s);
  source = patchConversationActionsWorkbench(source, surface, prefix);
  return source;
}

// The runtime maps the picker's Effort to reasoning_effort; the bridge removes
// the prefix and anything Inception does not accept.
export function mercuryReasoningBranch(params) {
  return `if(typeof t==="string"&&t.startsWith(${JSON.stringify(prefix)})){const selected=${params}?.find(p=>p.id==="reasoning")?.value;if(selected!==undefined)e.reasoning_effort=selected;delete e.reasoning;delete e.service_tier;return}`;
}

export function patchRuntime(source) {
  if (source.includes(`t.startsWith(${JSON.stringify(prefix)})`)) throw new Error('Mercury runtime patch already present.');
  const effort = onlyMatch(source, /"none"===([\w$]+)\?void 0:\1\}\(([\w$]+)\);/g, 'Reasoning effort');
  source = once(source, effort[0], effort[0] + mercuryReasoningBranch(effort[2]));
  source = patchSubagentSettingsRuntime(patchSubagentModel(source));
  return patchConversationActionsRuntime(source, prefix);
}
