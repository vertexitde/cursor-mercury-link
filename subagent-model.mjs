// An empty optional Task model means no explicit selection. Keep the native
// resolver in charge of inheritance, defaults, forced models and access checks.
export function normalizeMercurySubagentModel(options) {
  if(typeof options.parentModelId !== 'string' || !options.parentModelId.startsWith('inception-mercury/') || typeof options.requestedModel !== 'string' || options.requestedModel.trim() !== '') return options;
  return {...options,requestedModel:undefined};
}
export function patchSubagentModel(source) {
  const matches=[...source.matchAll(/const\{subagentConfig:[\w$]+,requestedModel:[\w$]+,parentModelId:[\w$]+/g)];
  if(matches.length!==1)throw new Error('Subagent model resolver anchor is not unique');
  const anchor=matches[0][0];
  if(source.includes('__normalizeMercurySubagentModel'))throw new Error('Subagent model patch already present');
  return source.replace(anchor,()=>'e=__normalizeMercurySubagentModel(e);'+anchor)+'\n'+normalizeMercurySubagentModel.toString().replace('function normalizeMercurySubagentModel','function __normalizeMercurySubagentModel')+'\n';
}
