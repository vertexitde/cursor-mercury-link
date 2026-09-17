import assert from 'node:assert/strict';
import {ensureMercuryTaskBubble} from '../../subagent-bubbles.mjs';

// Execute Cursor's extracted subagent barrier with the Mercury repair wired in.
export async function verifySubagentRegistration(source) {
 const start=source.indexOf('async _waitForParentTaskBubbleIfPossible(');
 const end=source.indexOf('async createOrResumeSubagent(',start);
 assert.ok(start>=0&&end>start,'Native subagent barrier found');
 const method=source.slice(start,end);
 const trim=value=>value?.trim()||undefined;
 class Params {constructor(value){Object.assign(this,value);}}
 const trimName=method.match(/const [\w$]+=([\w$]+)\([\w$]+\.parentConversationId\)/)[1];
 const symbols=method.match(/__ensureMercuryTaskBubble\(this\._composerDataService,[\w$]+,[\w$]+,([\w$]+)\.TASK_V2,([\w$]+),([\w$]+)\.TOOL_FORMER/);
 assert.ok(symbols,'Native Task symbols found');
 const factory=new Function(trimName,symbols[1],symbols[2],symbols[3],'__ensureChatgptTaskBubble','__ensureClaudeTaskBubble','__ensureMercuryTaskBubble',
  'return ({'+method+'})._waitForParentTaskBubbleIfPossible');

 const parent={data:{modelConfig:{selectedModels:[{modelId:'inception-mercury/mercury-2.5'}]}}};
 const request={parentConversationId:'parent',toolCallId:'task',modelId:'inception-mercury/mercury-2.5',prompt:'Test',subagentType:'explore'};
 const bubbles=new Map();let signals=0,waits=0;
 const service={_composerDataService:{getHandleIfLoaded:id=>id==='parent'?parent:undefined,loadComposerCapabilities(){},getComposerCapability:()=>({getBubbleIdByToolCallId:id=>bubbles.get(id),getOrCreateBubbleId:args=>bubbles.set(args.toolCallId,'bubble')})},
 _pendingApprovalRegistry:{signalBubbleCreated(parentId,id){assert.equal(parentId,'parent');assert.ok(bubbles.has(id),'Only a real bubble releases the barrier');signals++;},async waitForBubbleCreation(){waits++;throw new Error('Timeout waiting for bubble creation');}}};
 const run=helper=>factory(trim,{TASK_V2:2},Params,{TOOL_FORMER:1},()=>{},()=>{},helper).call(service,request);
 await assert.rejects(run(()=>{}),/Timeout waiting for bubble creation/);
 assert.equal(signals,0);assert.equal(waits,1);
 await run(ensureMercuryTaskBubble);assert.equal(signals,1);assert.equal(waits,1);
 await run(ensureMercuryTaskBubble);assert.equal(bubbles.size,1);
 const [created]=bubbles.keys();assert.equal(created,'task');
 console.log('Native subagent barrier: reproduced missing Task failure; registration repair passed.');
}
