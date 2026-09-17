import assert from 'node:assert/strict';
import {mercuryVariant} from '../../max-mode.mjs';
import {pickerModels} from '../../models.mjs';

// Execute Cursor's native variant solver on the real Mercury picker models.
export function verifyMaxMode(source) {
 const m=source.match(/function ([\w$]+)\(([\w$]+),([\w$]+),([\w$]+)\)\{if\(\2.variants.length===0\|\|!\4&&\2.supportsNonMaxMode===!1\)return;/);
 assert.ok(m,'Native Max-mode solver found');
 const end=source.indexOf('}var ',m.index);assert.ok(end>m.index);
 const fn=source.slice(m.index,end+1);
 const eq=fn.match(/\.variants.find\([\w$]+=>([\w$]+)\(/)[1];
 const def=fn.match(/:([\w$]+)\([\w$]+,\{maxMode:/)[1];
 const same=(variant,params)=>variant.parameterValues.length===params.length&&variant.parameterValues.every(p=>params.some(q=>p.id===q.id&&p.value===q.value));
 // Cursor's default-variant helper: default config for the mode, then a variant of that mode, then the first.
 const defaults=(model,{maxMode})=>model.variants.find(v=>maxMode?v.isDefaultMaxConfig===true:v.isDefaultNonMaxConfig===true)??model.variants.find(v=>(v.isMaxMode===true)===maxMode)??model.variants[0];
 const none=()=>undefined;
 const dependencies={[eq]:same,[def]:defaults,__isMercuryModel:name=>typeof name==='string'&&name.startsWith('inception-mercury/'),
  __MercuryModelVariant:mercuryVariant,__ChatgptMaxModeVariant:none,__ClaudeMaxModeVariant:none};
 const solve=new Function(...Object.keys(dependencies),'return ('+fn+')')(...Object.values(dependencies));
 const [model]=pickerModels();
 const ordinary={...model,name:'ordinary',variants:model.variants.map(v=>({...v,isDefaultMaxConfig:false}))};
 const high=model.variants.find(v=>v.parameterValues[0].value==='high');
 assert.equal(solve(ordinary,high.parameterValues,true).variant.parameterValues[0].value,'instant','Native Max mode drops the chosen effort');
 for(const variant of model.variants)for(const maxMode of [false,true]){
  const result=solve(model,variant.parameterValues,maxMode);
  assert.deepEqual(result.parameters,variant.parameterValues,'effort survives with Max mode '+maxMode);
 }
 assert.equal(defaults(model,{maxMode:true}).parameterValues[0].value,'medium','picker shows Medium with Max mode on');
 assert.equal(defaults(model,{maxMode:false}).parameterValues[0].value,'medium');
 console.log('Native Max toggle: Instant fallback reproduced; every Mercury effort survives in both modes; default is Medium.');
}

// Execute Cursor's native context budget with a Mercury catalog entry.
export function verifyContextBudget(source,entry) {
 const marker='return Object.assign(Object.assign({modelId:t,apiTypes:';
 // The two runtime bundles order these minified locals differently.
 const pivot=source.indexOf(marker),start=source.lastIndexOf('function(e,t){',pivot),end=pivot+source.slice(pivot).search(/\}\([\w$]+,[\w$]+\)/);
 assert.ok(start>=0&&end>start,'Native model metadata decoder found');
 const fn=source.slice(start,end+1),number=fn.match(/contextLength:([\w$]+)\(/)[1];
 const parse=new Function(number,'return ('+fn+')')(value=>typeof value==='number'&&Number.isFinite(value)&&value>0?Math.floor(value):undefined);
 const metadata=parse(entry,entry.id);assert.equal(metadata.contextLength,entry.capabilities.context_length);
 assert.equal(parse({id:entry.id,context_window:metadata.contextLength},entry.id).contextLength,undefined,'Old top-level field was ignored');
 const m=source.match(/([\w$]+)=null!\=\=\(([\w$]+)=i.contextLength\)[\s\S]{0,2000}?,([\w$]+)=void 0!==([\w$]+)\?Math.min\(\4,null!=\1\?\1:\4\):\1/);
 assert.ok(m,'Native context budget found');
 const window=m[1],scratch=m[2],budgeted=m[3];
 const catalog=m[0].match(/of ([\w$]+).values\(\)/)[1],key=m[0].match(/e.id===([\w$]+)/)[1];
 const budget=new Function('i','e',catalog,key,'var '+scratch+';const '+m[0]+';return '+budgeted+';');
 for(const requested of [Math.min(200000,metadata.contextLength),metadata.contextLength,metadata.contextLength*2]){
  assert.equal(budget(metadata,{modelId:entry.id,modelParameters:[{id:'context',value:String(requested)}]},new Map(),'context'),Math.min(requested,metadata.contextLength));
 }
 assert.equal(budget(metadata,{modelId:entry.id,modelParameters:[]},new Map(),'context'),metadata.contextLength);
 console.log('Native context budget uses the selected size, reports the provider window and caps it at the advertised limit.');
}
