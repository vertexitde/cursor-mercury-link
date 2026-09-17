import assert from 'node:assert/strict';
import {normalizeMercurySubagentModel} from '../../subagent-model.mjs';

// Execute Cursor's native subagent model resolver with its minified helpers
// bound by the role each one plays.
export async function verifySubagentModels(source) {
 const anchor=source.search(/const\{subagentConfig:[\w$]+,requestedModel:[\w$]+,parentModelId:[\w$]+/);
 const start=source.lastIndexOf('async function(e){',anchor),end=source.indexOf('}({subagentConfig:',anchor);
 assert.ok(start>=0&&end>start,'Native subagent model resolver found');
 const body=source.slice(start,end+1);
 const identity=value=>value;
 const forced=async options=>options.forceModelId && !options.isModelBlocked(options.forceModelId)?options.forceModelId:undefined;
 const role=(label,pattern)=>{const m=body.match(pattern);assert.ok(m,'Native resolver '+label+' found');return m;};
 const explore=role('subagent type',/([\w$]+)\(t\.subagent_type\)===([\w$]+)/);
 const policy=role('force policy',/===([\w$]+)&&void 0!==[\w$]+\)throw new ([\w$]+)\(/);
 const speed=role('speed tiers',/endsWith\("-fast"\)\?([\w$]+):"default"===[\w$]+\|\|"auto"===[\w$]+\?([\w$]+):void 0/);
 const vars={
  [explore[1]]:identity, [explore[2]]:'explore',
  [role('canonical slug',/\(t\.defaultModelIds\?\?\[\]\)\.map\(e=>([\w$]+)\(e\)\)/)[1]]:identity,
  [role('generic base check',/=[\w$]+&&\(([\w$]+)\([\w$]+\)\|\|[\w$]+\.has\([\w$]+\)\)/)[1]]:()=>false,
  [role('forced model resolver',/([\w$]+)\(\{subagentModelForcePolicy:/)[1]]:forced,
  [policy[1]]:'forced', [policy[2]]:Error,
  [role('slug lookup',/=([\w$]+)\([\w$]+,[\w$]+\.modelsBySlug\)/)[1]]:identity,
  [speed[1]]:'fast', [speed[2]]:'auto',
  __normalizeClaudeSubagentModel:identity,__normalizeChatgptSubagentModel:identity,__normalizeMercurySubagentModel:normalizeMercurySubagentModel};
 const make=values=>new Function(...Object.keys(values),'return ('+body+')')(...Object.values(values));
 const resolve=make(vars),parent='inception-mercury/mercury-2.5';
 const options={subagentConfig:{subagent_type:'generalPurpose'},requestedModel:'',parentModelId:parent,parentMaxMode:false,
  subagentModels:{modelsBySlug:new Map([[parent,{slug:parent}],['configured',{slug:'configured'}]])},isModelBlocked:()=>false,isModelValid:()=>true,compareModelCosts:()=>0};
 await assert.rejects(make({...vars,__normalizeMercurySubagentModel:identity})(options),/non-empty string/);
 for(const requestedModel of ['', '  ', undefined, 'inherit'])assert.equal(await resolve({...options,requestedModel}),parent);
 assert.equal(options.requestedModel,'','Caller input is unchanged');
 assert.equal(await resolve({...options,requestedModel:'configured'}),'configured');
 assert.equal(await resolve({...options,subagentConfig:{...options.subagentConfig,defaultModelIds:['configured']}}),'configured');
 assert.equal(await resolve({...options,forceModelId:'configured',subagentModelForcePolicy:'forced'}),'configured');
 await assert.rejects(resolve({...options,isModelBlocked:()=>true}),/No usable model/);
 await assert.rejects(resolve({...options,requestedModel:'not-a-model',isModelValid:()=>false}),/Invalid model selection/);
 await assert.rejects(resolve({...options,parentModelId:'ordinary'}),/non-empty string/);
 console.log('Native subagent model resolver: empty-model failure reproduced; inheritance, defaults and restrictions passed.');
}
