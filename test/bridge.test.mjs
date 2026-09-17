import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRequest, normalizeChunk, normalizeSseLine, upstreamError, createBridge, BridgeError, upstreamBase} from '../bridge.mjs';

const base = {model:'inception-mercury/mercury-2.5', messages:[{role:'user', content:'hi'}]};

test('strips the provider prefix and rejects unknown models', () => {
  assert.equal(prepareRequest(base).model, 'mercury-2.5');
  assert.equal(prepareRequest({...base, model:'inception-mercury/mercury-2'}).model, 'mercury-2');
  for (const model of ['mercury-2.5', 'inception-mercury/mercury-edit-2', 'claude-subscription/opus'])
    assert.throws(() => prepareRequest({...base, model}), error => error instanceof BridgeError && error.status === 404);
});

test('maps the developer role and replaces images and files with text notes', () => {
  const request = prepareRequest({...base, messages:[
    {role:'developer', content:'rules'},
    {role:'user', content:[{type:'text', text:'look', cache_control:{type:'ephemeral'}}, {type:'image_url', image_url:{url:'data:'}}, {type:'file', file:{}}, {type:'input_audio'}]}]});
  assert.equal(request.messages[0].role, 'system');
  assert.deepEqual(request.messages[1].content, [
    {type:'text', text:'look'},
    {type:'text', text:'[Image omitted: Mercury accepts text only.]'},
    {type:'text', text:'[File omitted: Mercury accepts text only.]'},
    {type:'text', text:'[input_audio omitted: Mercury accepts text only.]'}]);
  assert.throws(() => prepareRequest({...base, messages:[{role:'critic', content:'x'}]}), /Unsupported message role/);
});

test('keeps tool calls and tool results intact', () => {
  const messages = [{role:'user', content:'go'},
    {role:'assistant', content:null, reasoning_content:'hidden', tool_calls:[{id:'call_1', type:'function', function:{name:'read_file', arguments:'{"path":"a"}'}, extra:1}]},
    {role:'tool', tool_call_id:'call_1', content:'data'}];
  const request = prepareRequest({...base, messages, tools:[{type:'function', function:{name:'read_file'}}], tool_choice:'auto', parallel_tool_calls:true});
  assert.deepEqual(request.messages[1], {role:'assistant', content:null, tool_calls:[{id:'call_1', type:'function', function:{name:'read_file', arguments:'{"path":"a"}'}}]});
  assert.deepEqual(request.messages[2], {role:'tool', content:'data', tool_call_id:'call_1'});
  assert.equal(request.tool_choice, 'auto');
  assert.equal(request.parallel_tool_calls, true);
});

test('accepts only the four documented reasoning efforts', () => {
  for (const effort of ['instant', 'low', 'medium', 'high']) assert.equal(prepareRequest({...base, reasoning_effort:effort}).reasoning_effort, effort);
  assert.equal(prepareRequest({...base, reasoning:{effort:'low'}}).reasoning_effort, 'low');
  assert.equal(prepareRequest({...base, reasoning_effort:'max'}).reasoning_effort, 'high');
  assert.equal(prepareRequest({...base, reasoning_effort:'none'}).reasoning_effort, 'instant');
  assert.equal('reasoning_effort' in prepareRequest({...base, reasoning_effort:'turbo'}), false);
});

test('drops parameters Inception does not accept and clamps output tokens', () => {
  const request = prepareRequest({...base, store:false, metadata:{}, service_tier:'priority', prompt_cache_key:'k', reasoning:{effort:'low'}, max_tokens:999999, stream:true, stream_options:{include_usage:true}});
  assert.deepEqual(Object.keys(request).sort(), ['max_completion_tokens', 'messages', 'model', 'reasoning_effort', 'stream', 'stream_options']);
  assert.equal(request.max_completion_tokens, 65536);
  assert.equal(prepareRequest({...base, model:'inception-mercury/mercury-2', max_completion_tokens:1000}).max_completion_tokens, 1000);
});

test('removes null delta fields and the reasoning summary from stream chunks', () => {
  const chunk = normalizeChunk({id:'x', reasoning_summary:null, choices:[{index:0, finish_reason:null,
    delta:{role:'assistant', content:null, tool_calls:[{index:0, id:null, type:'function', function:{name:null, arguments:'"a"}'}}]}}]});
  assert.deepEqual(chunk, {id:'x', choices:[{index:0, finish_reason:null, delta:{role:'assistant', tool_calls:[{index:0, type:'function', function:{arguments:'"a"}'}}]}}]});
  assert.equal(normalizeSseLine('data: [DONE]'), 'data: [DONE]');
  assert.equal(normalizeSseLine(': keep-alive'), ': keep-alive');
  assert.equal(normalizeSseLine('data: {"choices":[{"delta":{"content":null}}]}'), 'data: {"choices":[{"delta":{}}]}');
});

test('turns Inception validation errors into readable messages', () => {
  const invalid = upstreamError(400, JSON.stringify({detail:{message:[{msg:'Value error, bad role'}, {msg:'second'}]}}));
  assert.equal(invalid.error.message, 'Value error, bad role; second');
  assert.match(upstreamError(401, '{"error":{"message":"Incorrect API key provided","code":"invalid_api_key"}}').error.message, /Cursor Settings > Models > Inception API Key/);
  assert.match(upstreamError(402, '{"error":{"message":"Account is inactive"}}').error.message, /billing is inactive/);
  assert.equal(upstreamError(503, 'not json').error.message, 'Inception API request failed with HTTP 503.');
});

async function withBridge(fetchImpl, run) {
  const server = createBridge({bridgeKey:'secret', fetchImpl});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const auth = {authorization:'Bearer secret', 'content-type':'application/json'};

test('requires the bridge key and serves the runtime model catalog', async () => {
  await withBridge(() => { throw new Error('no upstream'); }, async url => {
    assert.equal((await fetch(url + '/health')).status, 200);
    assert.equal((await fetch(url + '/v1/models')).status, 401);
    assert.equal((await fetch(url + '/v1/models', {headers:{authorization:'Bearer wrong'}})).status, 401);
    const models = await (await fetch(url + '/v1/models', {headers:auth})).json();
    assert.deepEqual(models.data.map(m => m.id), ['inception-mercury/mercury-2.5', 'inception-mercury/mercury-2']);
    for (const model of models.data) {
      assert.deepEqual(model.api_types, ['chat_completions']);
      assert.equal(model.capabilities.supports_tool_use, true);
      assert.equal(model.capabilities.supports_streaming, true);
      assert.equal(model.capabilities.supports_vision, false);
      assert.deepEqual(model.capabilities.output_modalities, ['text']);
    }
  });
});

test('refuses requests without an Inception key before contacting the API', async () => {
  let called = false;
  await withBridge(() => { called = true; }, async url => {
    const response = await fetch(url + '/v1/chat/completions', {method:'POST', headers:auth, body:JSON.stringify(base)});
    assert.equal(response.status, 401);
    assert.match((await response.json()).error.message, /Add it in Cursor Settings > Models > Inception API Key/);
  });
  assert.equal(called, false);
});

test('forwards the key and prepared body, and normalizes the stream', async () => {
  let seen;
  const upstream = ['data: {"choices":[{"delta":{"content":"Hi","tool_calls":null}}],"reasoning_summary":null}', '', 'data: [DONE]', '', ''].join('\n');
  const fetchImpl = async (url, init) => {
    seen = {url, init};
    return new Response(new ReadableStream({start(controller) {
      const bytes = new TextEncoder().encode(upstream);
      controller.enqueue(bytes.slice(0, 20)); controller.enqueue(bytes.slice(20)); controller.close();
    }}), {status:200, headers:{'content-type':'text/event-stream'}});
  };
  await withBridge(fetchImpl, async url => {
    const response = await fetch(url + '/v1/chat/completions', {method:'POST', headers:{...auth, 'x-inception-api-key':' sk_user '},
      body:JSON.stringify({...base, stream:true, messages:[{role:'developer', content:'rules'}, {role:'user', content:'hi'}]})});
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n');
  });
  assert.equal(seen.url, upstreamBase + '/chat/completions');
  assert.equal(seen.init.headers.authorization, 'Bearer sk_user');
  const body = JSON.parse(seen.init.body);
  assert.equal(body.model, 'mercury-2.5');
  assert.equal(body.messages[0].role, 'system');
});

test('passes upstream failures through with a readable message', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({error:{message:'Incorrect API key provided', code:'invalid_api_key'}}), {status:401});
  await withBridge(fetchImpl, async url => {
    const response = await fetch(url + '/v1/chat/completions', {method:'POST', headers:{...auth, 'x-inception-api-key':'sk_bad'}, body:JSON.stringify(base)});
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error.code, 'invalid_api_key');
    assert.match(body.error.message, /Incorrect API key provided/);
  });
});
