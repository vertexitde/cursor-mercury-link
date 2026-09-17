import fs from 'node:fs';
import {modelTooltip} from './model-tooltip.mjs';

export const prefix = 'inception-mercury/';

// Chat models from https://docs.inceptionlabs.ai/get-started/models. Both accept
// text only, support tool calling on /v1/chat/completions and the four
// documented reasoning efforts. Mercury Edit 2 serves FIM and edits only.
export const catalog = [
  {id:'mercury-2.5', name:'Mercury 2.5', contextLength:260000, maxOutputTokens:65536,
    summary:'Inception\'s latest diffusion reasoning model for fast agents, tool calling and everyday coding.'},
  {id:'mercury-2', name:'Mercury 2', contextLength:128000, maxOutputTokens:50000,
    summary:'The previous Mercury diffusion reasoning model, with a 128K context window.'}
];
export const efforts = ['instant', 'low', 'medium', 'high'];
export const defaultEffort = 'medium';

// The Inception mark, recoloured to follow the picker's text colour. The picker
// keeps line breaks in labels, so the markup must be a single line.
const inceptionIcon = fs.readFileSync(new URL('./inception.svg', import.meta.url), 'utf8').trim()
  .replace(/>\s+</g, '><').replace(/\s+/g, ' ')
  .replace('<svg width="322" height="329" ', '<svg width="12" height="12" aria-hidden="true" style="display:inline-block;vertical-align:-2px;margin-right:6px;flex:none" ');

const effortName = value => value[0].toUpperCase() + value.slice(1);
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function findModel(id) {
  return catalog.find(model => model.id === id);
}

export function pickerModels() {
  return catalog.map(model => {
    const id = prefix + model.id, name = model.name;
    const tooltip = effort => modelTooltip(name, model.summary, model.contextLength, effort);
    return {name:id, serverModelName:id, clientDisplayName:name, inputboxShortModelName:name,
      defaultOn:true, supportsAgent:true, supportsImages:false, supportsThinking:true,
      supportsNonMaxMode:true, supportsMaxMode:false, supportsPlanMode:true, supportsAutoContext:true,
      contextTokenLimit:model.contextLength, contextTokenLimitForMaxMode:model.contextLength, autoContextMaxTokens:model.contextLength,
      namedModelSectionIndex:0, vendorName:'inception', vendor:{id:0, displayName:'Inception'},
      modelPickerBadges:[], cloudAgentEffortModes:[], tagline:model.summary, tooltipData:tooltip(defaultEffort),
      parameterDefinitions:[{id:'reasoning', name:'Effort', isCycleableByHotkey:true,
        markdownTooltip:'How long Mercury deliberates before answering. Instant skips reasoning; High spends the most time on multi-step problems.',
        parameterType:{enumParameter:{values:efforts.map(value => ({value, displayName:effortName(value), modelPickerBadges:[]}))}}}],
      variants:efforts.map(effort => ({
        parameterValues:[{id:'reasoning', value:effort}],
        displayName:inceptionIcon + escape(name) + ' <span style="color: var(--cursor-text-tertiary);">' + effortName(effort) + '</span>',
        displayNameOutsidePicker:name + ' ' + effortName(effort),
        variantStringRepresentation:id + '[reasoning=' + effort + ']',
        // Mercury has no Max variants. With Max mode on, Cursor looks for the
        // default Max configuration and otherwise falls back to the first
        // variant (Instant), so the default effort serves both modes.
        isMaxMode:false, isDefaultNonMaxConfig:effort === defaultEffort, isDefaultMaxConfig:effort === defaultEffort,
        tagline:model.summary, tooltipData:tooltip(effort)})),
      legacySlugs:[], idAliases:[]};
  });
}

// Served to Cursor's local agent runtime from GET /v1/models. The runtime only
// trusts these fields when tool use, streaming and text output are declared.
export function providerModels() {
  return catalog.map(model => ({id:prefix + model.id, object:'model', owned_by:'inception', api_types:['chat_completions'],
    capabilities:{context_length:model.contextLength, max_output_tokens:model.maxOutputTokens,
      supports_vision:false, supports_reasoning:true, supports_tool_use:true, supports_streaming:true,
      input_modalities:['text'], output_modalities:['text']}}));
}
