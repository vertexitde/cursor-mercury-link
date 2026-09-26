import assert from 'node:assert/strict';

// Exercise the patched workbench routing method with synthetic services: Remote
// SSH selection, the Explore model catalog and the forwarded run options.
export async function verifyWorkbenchRouting(source, prefix='inception-mercury/', {remoteTunnel = false} = {}) {
  // With the tunnel, a remote session runs the agent on the SSH host, so a
  // Mercury model takes the same route as an ordinary one.
  const remoteRoute = remoteTunnel ? 'workspace' : 'dedicated';
  const name=source.includes('async _subscriptionNativeLocalAgent(')?'_subscriptionNativeLocalAgent':'runLocalAgentInExtensionHost';
  const start = source.indexOf('async '+name+'(');
  const end = source.indexOf('}runLocalAgentInDedicatedExtensionHost(', start);
  assert.ok(start >= 0 && end > start, 'Native workbench routing method found');
  const method = source.slice(start, end + 1).replace('async '+name+'(', 'async runLocalAgentInExtensionHost(');
  const identity = value => value;
  const injected=helper=>{const match=source.match(new RegExp('function '+helper+'\\(existing,[\\s\\S]*?\\n}'));return match?new Function('return ('+match[0]+')')():identity;};
  const trim=method.match(/([\w$]+)\([\w$]+\.requestedModel\?\.modelId\)/)[1];
  const binary=method.match(/defaultModel:([\w$]+)\.wrap/)[1];
  const setting=method.match(/([\w$]+)\(this.storageService,"useDedicatedLocalAgentRuntimeHost"\)/)[1];
  const factory = new Function('__ChatgptSelectedModelIds','__ClaudeSelectedModelIds','__MercurySelectedModelIds','__useChatgptDedicatedRuntime','__isClaudeBridgeModel','__isMercuryModel',trim,binary,setting,
    'return ({' + method + '}).runLocalAgentInExtensionHost;');
  for (const [modelId, authority, nativeSetting, expected] of [
    [prefix+'mercury-2.5', 'ssh-remote+test-host', false, remoteRoute],
    [prefix+'mercury-2.5', undefined, false, 'workspace'],
    ['ordinary-model', 'ssh-remote+test-host', false, 'workspace'],
    ['ordinary-model', 'ssh-remote+test-host', true, 'dedicated']
  ]) {
    const route = factory(injected('__ChatgptSelectedModelIds'),injected('__ClaudeSelectedModelIds'),injected('__MercurySelectedModelIds'),
      (model,remote)=>model.startsWith('chatgpt-codex/')&&Boolean(remote),model=>model.startsWith('claude-subscription/'),model=>typeof model==='string'&&model.startsWith(prefix),
      identity,{wrap:identity},()=>nativeSetting);
    const calls = [];
    const provider = {waitForProviderRegistration:async () => calls.push('registered'),
      runLocalAgent:async (...args) => calls.push(['workspace', ...args])};
    const service = {
      getLocalAgentProviderConfig:async () => ({baseUrl:'http://127.0.0.1:43189/v1', apiKey:'synthetic-test-key', customHeaders:{'x-inception-api-key':'sk_test'}}),
      reactiveStorageService:{applicationUserPersistentStorage:{}},
      logService:{info() {}, warn() {}}, agentExecProviderService:provider,
      productService:{version:'synthetic', urlProtocol:'synthetic'},
      cursorAuthenticationService:{granularPrivacyModeRawEnum:() => 0},
      experimentService:{checkFeatureGate:() => false},
      workspaceContextService:{getWorkspace:() => ({folders:[]})},
      environmentService:{remoteAuthority:authority}, storageService:{},
      runLocalAgentInDedicatedExtensionHost:async (...args) => calls.push(['dedicated', ...args])
    };
    const bytes = {toBinary:() => new Uint8Array()};
    const model = {...bytes, modelId};
    const signal = new AbortController().signal;
    const resources = {workspaceAuthority:authority, marker:'existing-exec-resources'};
    const override={subagentType:'explore',selection:{case:'model',value:{modelId:'selected-explore-model'}},toBinary:()=>new Uint8Array([1,2,3])};
    await route.call(service, {signal}, bytes, bytes, model, {}, {}, {}, [], resources,
      {subscriptionActionChannel:'subscription-actions:test',subscriptionPlanPrepends:[[1,2]],conversationId:'synthetic-conversation', requestedModel:{...bytes, modelId},subagentModelOverrides:[override]});
    assert.equal(calls[0], 'registered');
    const [kind, request, callbacks, ...rest] = calls[1];
    assert.equal(kind, expected, `${modelId} with ${authority ?? 'local workspace'}`);
    assert.deepEqual(request.availableModelIds, modelId.startsWith(prefix)?['selected-explore-model']:[], 'Explore subagent model reaches the local runtime');
    assert.deepEqual(request.runOptions.subagentModelOverrides,[override.toBinary()]);
    if(name==='_subscriptionNativeLocalAgent'){assert.equal(request.runOptions.subscriptionActionChannel,'subscription-actions:test');assert.deepEqual(request.runOptions.subscriptionPlanPrepends,[[1,2]]);}
    assert.equal(request.baseUrl, 'http://127.0.0.1:43189/v1');
    assert.deepEqual(request.customHeaders, {'x-inception-api-key':'sk_test'}, 'Inception key header reaches the runtime');
    assert.equal(typeof callbacks.queryInteraction, 'function');
    assert.equal(typeof callbacks.handleCheckpoint, 'function');
    assert.deepEqual(rest, expected === 'dedicated' ? [resources, signal] : [signal]);
  }
  console.log('Native workbench routing: Remote SSH selection, Explore catalog, run options and key header passed.');
}
