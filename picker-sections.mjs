// cursor-gpt-link and cursor-claude-link each prepend this exact two-provider
// helper. Every copy is executed, so redefining it would be overwritten by the
// copies that run after ours; replace each copy with a superset instead.
export const legacyPickerSectionHelpersSrc='var __withSubscriptionPickerSections=function(g){const claude=[],chatgpt=[];const rest=function(list){const out=[];for(const m of list||[]){const n=m&&m.name;if(typeof n==="string"&&n.startsWith("claude-subscription/"))claude.push(m);else if(typeof n==="string"&&n.startsWith("chatgpt-codex/"))chatgpt.push(m);else out.push(m)}return out};return{leading:rest(g.leading),promoted:rest(g.promoted),others:rest(g.others),claude,chatgpt}};';

export const pickerSectionHelpersSrc='var __withSubscriptionPickerSections=function(g){const claude=[],chatgpt=[],mercury=[];const rest=function(list){const out=[];for(const m of list||[]){const n=m&&m.name;if(typeof n==="string"&&n.startsWith("claude-subscription/"))claude.push(m);else if(typeof n==="string"&&n.startsWith("chatgpt-codex/"))chatgpt.push(m);else if(typeof n==="string"&&n.startsWith("inception-mercury/"))mercury.push(m);else out.push(m)}return out};return{leading:rest(g.leading),promoted:rest(g.promoted),others:rest(g.others),claude,chatgpt,mercury}};';

export function withSubscriptionPickerSections(g) {
  return new Function(pickerSectionHelpersSrc + 'return __withSubscriptionPickerSections;')()(g);
}

export function patchPickerSections(source, once, {groupReturn, promotedAnchor, modelsVar, jsx, fmt, renderModel}) {
  if (source.includes(legacyPickerSectionHelpersSrc)) source = source.split(legacyPickerSectionHelpersSrc).join(pickerSectionHelpersSrc);
  else if (!source.includes(pickerSectionHelpersSrc)) source = pickerSectionHelpersSrc + '\n' + source;
  if (!source.includes('__withSubscriptionPickerSections(')) {
    source = once(source, groupReturn, 'return __withSubscriptionPickerSections(' + groupReturn.slice('return '.length) + ')');
  }
  if (!source.includes('"inception-mercury-models"')) {
    source = once(source, promotedAnchor,
      modelsVar + '.mercury.length>0&&' + jsx + '(' + fmt + ',{models:' + modelsVar + '.mercury,title:"Inception Mercury",renderModel:' + renderModel + '},"inception-mercury-models"),' +
      promotedAnchor);
  }
  return source;
}
