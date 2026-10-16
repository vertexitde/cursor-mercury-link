// cursor-gpt-link and cursor-claude-link each prepend this exact two-provider
// helper. Every copy is executed, so redefining it would be overwritten by the
// copies that run after ours; replace each copy with a superset instead.
export const legacyPickerSectionHelpersSrc='var __withSubscriptionPickerSections=function(g){const claude=[],chatgpt=[];const rest=function(list){const out=[];for(const m of list||[]){const n=m&&m.name;if(typeof n==="string"&&n.startsWith("claude-subscription/"))claude.push(m);else if(typeof n==="string"&&n.startsWith("chatgpt-codex/"))chatgpt.push(m);else out.push(m)}return out};return{leading:rest(g.leading),promoted:rest(g.promoted),others:rest(g.others),claude,chatgpt}};';

export const pickerSectionHelpersSrc='var __withSubscriptionPickerSections=function(g){const claude=[],chatgpt=[],mercury=[];const rest=function(list){const out=[];for(const m of list||[]){const n=m&&m.name;if(typeof n==="string"&&n.startsWith("claude-subscription/"))claude.push(m);else if(typeof n==="string"&&n.startsWith("chatgpt-codex/"))chatgpt.push(m);else if(typeof n==="string"&&n.startsWith("inception-mercury/"))mercury.push(m);else out.push(m)}return out};return{leading:rest(g.leading),promoted:rest(g.promoted),others:rest(g.others),claude,chatgpt,mercury}};';

export function withSubscriptionPickerSections(g) {
  return new Function(pickerSectionHelpersSrc + 'return __withSubscriptionPickerSections;')()(g);
}

// From 3.24 the picker went through the React compiler: the promoted section is
// a memoized variable and the sections are listed in a fragment that is
// rebuilt only when one of its memo slots changes. The section goes into that
// list, and while subscription sections exist the fragment is rebuilt on every
// render. cursor-gpt-link and cursor-claude-link write the very same condition,
// so whichever link comes first adds it and the others find it.
export const compiledRebuild = modelsVar =>
  `${modelsVar}.chatgpt?.length||${modelsVar}.claude?.length||${modelsVar}.mercury?.length||`;

export function compiledSectionsParts(sectionsReturn) {
  const match = sectionsReturn.match(/^return (.+)\?\(([\w$]+)=([\w$]+)\(([\w$]+),\{children:\[([\w$]+),([\w$]+),([\w$]+),([\w$]+)\]\}\)$/);
  if (!match) throw new Error('Unrecognised picker sections fragment: ' + sectionsReturn.slice(0, 100));
  const [, condition, result, fragment, component, leading, promoted, pinned, others] = match;
  return {condition, result, fragment, component, leading, promoted, pinned, others};
}

function insertCompiledSection(source, once, {modelsVar, sectionsReturn}, section) {
  const parts = compiledSectionsParts(sectionsReturn);
  if (!source.includes(`return ${compiledRebuild(modelsVar)}`))
    source = once(source, `return ${parts.condition}?(${parts.result}=`, `return ${compiledRebuild(modelsVar)}${parts.condition}?(${parts.result}=`);
  // The list ends in the promoted, pinned and other sections whatever a
  // companion put in front of them.
  const tail = `,${parts.promoted},${parts.pinned},${parts.others}]})`;
  // 3.25's Agents Window has a second fragment ending in the same names, so
  // the tail is looked for only after this picker's own fragment.
  const fragment = `(${parts.result}=${parts.fragment}(${parts.component},{children:[${parts.leading},`;
  const start = source.indexOf(fragment);
  if (start < 0 || source.indexOf(fragment, start + 1) >= 0) throw new Error('Picker sections fragment is missing or not unique');
  const at = source.indexOf(tail, start);
  if (at < 0) throw new Error('Picker sections tail not found');
  return source.slice(0, at) + ',' + section + source.slice(at);
}

export function patchPickerSections(source, once, symbols) {
  const {groupReturn, promotedAnchor, modelsVar, jsx, fmt, renderModel} = symbols;
  if (source.includes(legacyPickerSectionHelpersSrc)) source = source.split(legacyPickerSectionHelpersSrc).join(pickerSectionHelpersSrc);
  else if (!source.includes(pickerSectionHelpersSrc)) source = pickerSectionHelpersSrc + '\n' + source;
  if (!source.includes('__withSubscriptionPickerSections(')) {
    source = once(source, groupReturn, 'return __withSubscriptionPickerSections(' + groupReturn.slice('return '.length) + ')');
  }
  if (!source.includes('"inception-mercury-models"')) {
    const section = modelsVar + '.mercury.length>0&&' + jsx + '(' + fmt + ',{models:' + modelsVar + '.mercury,title:"Inception Mercury",renderModel:' + renderModel + '},"inception-mercury-models")';
    source = promotedAnchor
      ? once(source, promotedAnchor, section + ',' + promotedAnchor)
      : insertCompiledSection(source, once, symbols, section);
  }
  return source;
}
