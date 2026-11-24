// Mercury has no Max variants. Cursor's native solver discards any non-Max
// variant while Max mode is on and falls back to the first one, which would
// silently turn a chosen effort into Instant. Keep the chosen effort in both modes.
export function mercuryVariant(model, parameters) {
  const effort = parameters?.find(p => p.id === 'reasoning')?.value;
  return model.variants.find(v => v.parameterValues.some(p => p.id === 'reasoning' && p.value === effort))
    ?? model.variants.find(v => v.isDefaultNonMaxConfig) ?? model.variants[0];
}

// From 3.32 the solver lives in workbench.anysphere-ui.js, not in the surfaces.
export const hasMaxModeSolver = source => /function [\w$]+\(([\w$]+),[\w$]+,([\w$]+)\)\{if\(\1\.variants\.length===0\|\|!\2&&\1\.supportsNonMaxMode===!1\)return;/.test(source);
export function patchMaxMode(source) {
  const matches = [...source.matchAll(/function ([\w$]+)\(([\w$]+),([\w$]+),([\w$]+)\)\{if\(\2.variants.length===0\|\|!\4&&\2.supportsNonMaxMode===!1\)return;/g)];
  if (matches.length !== 1) throw new Error('Max-mode variant solver anchor is not unique');
  const [anchor, , model, params] = matches[0];
  const call = `if(__isMercuryModel(${model}.name)){const v=__MercuryModelVariant(${model},${params});if(v)return{model:${model},variant:v,parameters:v.parameterValues}}`;
  return source.replace(anchor, () => anchor + call) + '\n' + mercuryVariant.toString().replace('function mercuryVariant', 'function __MercuryModelVariant') + '\n';
}
