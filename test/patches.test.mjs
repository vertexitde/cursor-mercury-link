import test from 'node:test';
import assert from 'node:assert/strict';
import {once, patchRuntime, mercuryReasoningBranch} from '../patches.mjs';
import {patchPickerSections, legacyPickerSectionHelpersSrc, pickerSectionHelpersSrc, withSubscriptionPickerSections} from '../picker-sections.mjs';
import {patchSettingsCard, settingsCardSrc} from '../settings-card.mjs';
import {pickerModels, providerModels, catalog} from '../models.mjs';

test('anchors must occur exactly once, and replacements are literal', () => {
  assert.throws(() => once('a b a', 'a', 'x'), /2 matches/);
  assert.throws(() => once('abc', 'z', 'x'), /0 matches/);
  assert.equal(once('call(K)', 'K', "$&$'$1$K"), "call($&$'$1$K)");
});

test('picker helper keeps both companion buckets and adds Mercury', () => {
  const groups = withSubscriptionPickerSections({leading:[{name:'inception-mercury/mercury-2'}], promoted:[{name:'claude-subscription/opus'}, {name:'composer'}], others:[{name:'chatgpt-codex/gpt'}]});
  assert.deepEqual(groups.leading, []);
  assert.deepEqual(groups.promoted.map(m => m.name), ['composer']);
  assert.deepEqual([groups.claude.length, groups.chatgpt.length, groups.mercury.length], [1, 1, 1]);
});

const picker = {groupReturn:'return c.x?{a:1}:{a:2}', promotedAnchor:'HP(f,{models:B.promoted,title:c?.t', modelsVar:'B', jsx:'HP', fmt:'f', renderModel:'x'};
test('replaces every companion helper copy instead of redefining it', () => {
  const combined = legacyPickerSectionHelpersSrc + '\n' + legacyPickerSectionHelpersSrc + '\nreturn __withSubscriptionPickerSections(c.x?{a:1}:{a:2});B.claude.length>0&&HP(f,{},"claude-subscription-models"),HP(f,{models:B.promoted,title:c?.t';
  const out = patchPickerSections(combined, once, picker);
  assert.equal(out.split(legacyPickerSectionHelpersSrc).length, 1);
  assert.equal(out.split(pickerSectionHelpersSrc).length, 3);
  assert.ok(out.includes('"claude-subscription-models"),B.mercury.length>0&&HP(f,{models:B.mercury,title:"Inception Mercury",renderModel:x},"inception-mercury-models"),HP(f,{models:B.promoted'));
});

test('installs the helper and wrapper when no companion is present', () => {
  const out = patchPickerSections('return c.x?{a:1}:{a:2};HP(f,{models:B.promoted,title:c?.t', once, picker);
  assert.ok(out.startsWith(pickerSectionHelpersSrc));
  assert.ok(out.includes('return __withSubscriptionPickerSections(c.x?{a:1}:{a:2})'));
});

const cardSymbols = {googleCard:'Oxy', googleCardComposition:'s=Iv(Oxy,{settingsWorkspace:n})', keyJsx:'Iv', jsxs:'FY', useService:'Nr', secretStorage:'K6e',
  settingsService:'sf', openerId:'ZV', useState:'Fea', useEffect:'Oea', descriptionWrapper:'BYt', link:'Bea', card:'sb', zs:'Ts', keyInput:'zre'};
test('places the Inception card right after the Google card', () => {
  const source = 'function Oxy(e){return 1}function Vxy(e){let r,s;s=Iv(Oxy,{settingsWorkspace:n}),o=Iv(Fxy,{settingsWorkspace:n})}';
  const out = patchSettingsCard(source, once, cardSymbols);
  assert.ok(out.includes(settingsCardSrc(cardSymbols) + 'function Oxy('));
  assert.ok(out.includes('s=[Iv(Oxy,{settingsWorkspace:n},"google-api-key"),Iv(__MercuryApiKeyCard,{settingsWorkspace:n},"inception-api-key")],o=Iv(Fxy'));
  assert.throws(() => patchSettingsCard(out, once, cardSymbols), /already present/);
});

test('runtime branch sets reasoning_effort for Mercury only', () => {
  const normalizer = 'function(e,t,r,n,o,s=!1,i){const a=function(e){const r=e?.find(p=>p.id==="reasoning")?.value;return void 0===r||""===r||"none"===r?void 0:r}(r);if(void 0===a)return;e.native=a}';
  const source = 'x=' + normalizer + ';const{subagentConfig:t,requestedModel:r,parentModelId:n}=e;';
  assert.throws(() => patchRuntime(source), /anchor is not unique/, 'an incomplete bundle is rejected');
  const patched = once(source, '"none"===r?void 0:r}(r);', '"none"===r?void 0:r}(r);' + mercuryReasoningBranch('r'));
  const run = new Function('return (' + patched.slice(2, patched.indexOf(';const{')) + ')')();
  const mercury = {reasoning:{effort:'x'}, service_tier:'priority'};
  run(mercury, 'inception-mercury/mercury-2.5', [{id:'reasoning', value:'instant'}]);
  assert.deepEqual(mercury, {reasoning_effort:'instant'});
  const other = {};
  run(other, 'gpt-5', [{id:'reasoning', value:'low'}]);
  assert.deepEqual(other, {native:'low'});
});

test('picker and provider catalogs describe text-only reasoning models', () => {
  const models = pickerModels();
  assert.deepEqual(models.map(m => m.name), catalog.map(m => 'inception-mercury/' + m.id));
  for (const model of models) {
    assert.equal(model.supportsImages, false);
    assert.equal(model.supportsMaxMode, false);
    assert.deepEqual(model.parameterDefinitions[0].parameterType.enumParameter.values.map(v => v.value), ['instant', 'low', 'medium', 'high']);
    assert.deepEqual(model.variants.filter(v => v.isDefaultNonMaxConfig).map(v => v.parameterValues[0].value), ['medium']);
    assert.deepEqual(model.variants.filter(v => v.isDefaultMaxConfig).map(v => v.parameterValues[0].value), ['medium'], 'Max mode also defaults to Medium');
    assert.ok(model.variants.every(v => v.isMaxMode === false));
    assert.ok(model.variants[0].displayName.startsWith('<svg width="12" height="12"'));
    assert.ok(!model.variants[0].displayName.includes('fill="white"'), 'icon follows the text colour');
    assert.ok(!/[\r\n]/.test(model.variants[0].displayName), 'label stays on one line');
  }
  assert.deepEqual(providerModels().map(m => m.capabilities.context_length), [260000, 128000]);
});

test('Max mode keeps the chosen Mercury effort', async () => {
  const {mercuryVariant, patchMaxMode} = await import('../max-mode.mjs');
  const [model] = pickerModels();
  for (const effort of ['instant', 'low', 'medium', 'high'])
    assert.equal(mercuryVariant(model, [{id:'reasoning', value:effort}]).parameterValues[0].value, effort);
  assert.equal(mercuryVariant(model, []).parameterValues[0].value, 'medium');
  const solver = 'function J4g(e,t,n){if(e.variants.length===0||!n&&e.supportsNonMaxMode===!1)return;return"native"}';
  const patched = patchMaxMode(solver);
  const solve = new Function('__isMercuryModel', patched + ';return J4g')(name => name.startsWith('inception-mercury/'));
  assert.equal(solve(model, [{id:'reasoning', value:'high'}], true).parameters[0].value, 'high');
  assert.equal(solve({...model, name:'gpt-5'}, [], true), 'native');
  assert.throws(() => patchMaxMode('function x(){}'), /not unique/);
});
