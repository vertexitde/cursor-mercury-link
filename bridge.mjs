// Local connection between Cursor's agent runtime and the Inception API.
// Cursor sends the user's Inception key from its secret storage with every
// request; the bridge forwards it and never stores it.
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {prefix, findModel, providerModels, efforts} from './models.mjs';

export const upstreamBase = 'https://api.inceptionlabs.ai/v1';
export const keyHeader = 'x-inception-api-key';
const maxBody = 64 * 1024 * 1024;

// Parameters the chat completions endpoint accepts. Anything else Cursor adds
// for other providers is dropped rather than forwarded.
const allowedFields = new Set(['messages', 'tools', 'tool_choice', 'parallel_tool_calls', 'stream', 'stream_options',
  'max_completion_tokens', 'temperature', 'top_p', 'stop', 'response_format', 'reasoning_effort',
  'presence_penalty', 'frequency_penalty', 'seed', 'n', 'user']);
const allowedRoles = new Set(['system', 'user', 'assistant', 'tool', 'function']);
const effortAliases = {none:'instant', minimal:'instant', xhigh:'high', max:'high'};

export class BridgeError extends Error {
  constructor(status, message, code, type = 'invalid_request_error') {
    super(message);
    Object.assign(this, {status, code, type});
  }
}

export const errorBody = (message, code, type = 'invalid_request_error') => ({error:{message, type, param:null, code}});

// Mercury accepts text only (the API rejects image_url and file parts with 400),
// so non-text parts become a short note instead of failing the whole turn. This
// matters when a conversation that already holds images switches to Mercury.
function textPart(part) {
  if (typeof part === 'string') return {type:'text', text:part};
  if (!part || typeof part !== 'object') return undefined;
  if (part.type === 'text' || part.type === 'input_text') return {type:'text', text:String(part.text ?? '')};
  if (['image_url', 'input_image', 'image'].includes(part.type)) return {type:'text', text:'[Image omitted: Mercury accepts text only.]'};
  if (['file', 'input_file', 'document'].includes(part.type)) return {type:'text', text:'[File omitted: Mercury accepts text only.]'};
  return {type:'text', text:`[${String(part.type || 'Content')} omitted: Mercury accepts text only.]`};
}

function prepareMessage(message) {
  if (!message || typeof message !== 'object') throw new BridgeError(400, 'Each message must be an object.', 'invalid_message');
  // Inception rejects the OpenAI "developer" role.
  const role = message.role === 'developer' ? 'system' : message.role;
  if (!allowedRoles.has(role)) throw new BridgeError(400, `Unsupported message role: ${message.role}`, 'invalid_message');
  const out = {role};
  if (Array.isArray(message.content)) out.content = message.content.map(textPart).filter(Boolean);
  else if (message.content !== undefined) out.content = message.content;
  if (message.name !== undefined) out.name = message.name;
  if (message.tool_call_id !== undefined) out.tool_call_id = message.tool_call_id;
  if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
    out.tool_calls = message.tool_calls.map(call => ({id:call.id, type:call.type ?? 'function',
      function:{name:call.function?.name, arguments:call.function?.arguments ?? ''}}));
  }
  return out;
}

export function prepareRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BridgeError(400, 'Request body must be a JSON object.', 'invalid_body');
  if (typeof body.model !== 'string' || !body.model.startsWith(prefix)) throw new BridgeError(404, `Unknown model: ${body.model}`, 'model_not_found');
  const model = findModel(body.model.slice(prefix.length));
  if (!model) throw new BridgeError(404, `Unknown Mercury model: ${body.model}`, 'model_not_found');
  if (!Array.isArray(body.messages) || !body.messages.length) throw new BridgeError(400, 'messages must be a non-empty array.', 'invalid_messages');

  const request = {model:model.id};
  for (const [field, value] of Object.entries(body)) if (allowedFields.has(field) && value !== undefined && value !== null) request[field] = value;
  request.messages = body.messages.map(prepareMessage);

  const effort = body.reasoning_effort ?? body.reasoning?.effort;
  const mapped = effortAliases[effort] ?? effort;
  if (efforts.includes(mapped)) request.reasoning_effort = mapped; else delete request.reasoning_effort;

  const limit = request.max_completion_tokens ?? body.max_tokens;
  if (Number.isFinite(limit) && limit > 0) request.max_completion_tokens = Math.min(Math.floor(limit), model.maxOutputTokens);
  else delete request.max_completion_tokens;
  return request;
}

// Inception streams delta keys as null (content, tool_calls, and id or name on
// continuation chunks) and adds a top-level reasoning_summary. Omit them so the
// chunks match the OpenAI shape clients expect.
export function normalizeChunk(chunk) {
  if (!chunk || typeof chunk !== 'object') return chunk;
  delete chunk.reasoning_summary;
  for (const choice of chunk.choices ?? []) {
    const delta = choice.delta;
    if (!delta) continue;
    for (const key of Object.keys(delta)) if (delta[key] === null) delete delta[key];
    for (const call of delta.tool_calls ?? []) {
      if (call.id === null) delete call.id;
      if (call.function) for (const key of Object.keys(call.function)) if (call.function[key] === null) delete call.function[key];
    }
  }
  return chunk;
}

export function normalizeSseLine(line) {
  if (!line.startsWith('data:')) return line;
  const payload = line.slice(5).trim();
  if (!payload || payload === '[DONE]') return line;
  try { return 'data: ' + JSON.stringify(normalizeChunk(JSON.parse(payload))); } catch { return line; }
}

// Inception reports validation errors as a list of objects; Cursor expects a string.
export function upstreamError(status, text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch {}
  const raw = parsed?.error ?? parsed?.detail ?? parsed;
  let message = raw?.message ?? raw;
  if (Array.isArray(message)) message = message.map(item => item?.msg ?? JSON.stringify(item)).join('; ');
  if (typeof message !== 'string' || !message) message = `Inception API request failed with HTTP ${status}.`;
  if (status === 401) message = `Inception rejected the API key. Check it in Cursor Settings > Models > Inception API Key. (${message})`;
  if (status === 402) message = `Inception billing is inactive or the quota is exhausted. (${message})`;
  return errorBody(message, raw?.code ?? parsed?.error?.code ?? `http_${status}`, raw?.type ?? 'api_error');
}

const send = (response, status, body) => {
  if (response.headersSent) return response.end();
  response.writeHead(status, {'content-type':'application/json'});
  response.end(JSON.stringify(body));
};

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > maxBody) { reject(new BridgeError(413, 'Request body is too large.', 'body_too_large')); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function authorized(request, bridgeKey) {
  const given = Buffer.from(String(request.headers.authorization ?? ''));
  const expected = Buffer.from('Bearer ' + bridgeKey);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

async function forwardChat(request, response, fetchImpl) {
  const apiKey = String(request.headers[keyHeader] ?? '').trim();
  if (!apiKey) throw new BridgeError(401, 'No Inception API key is set. Add it in Cursor Settings > Models > Inception API Key.', 'missing_api_key', 'authentication_error');
  let body;
  try { body = JSON.parse(await readBody(request)); } catch (error) {
    if (error instanceof BridgeError) throw error;
    throw new BridgeError(400, 'Request body is not valid JSON.', 'invalid_json');
  }
  const prepared = prepareRequest(body);
  const abort = new AbortController();
  response.on('close', () => { if (!response.writableFinished) abort.abort(); });
  const upstream = await fetchImpl(upstreamBase + '/chat/completions', {method:'POST', signal:abort.signal,
    headers:{'content-type':'application/json', authorization:'Bearer ' + apiKey}, body:JSON.stringify(prepared)});
  if (!upstream.ok) return send(response, upstream.status, upstreamError(upstream.status, await upstream.text()));
  if (!prepared.stream) {
    const text = await upstream.text();
    response.writeHead(200, {'content-type':'application/json'});
    return response.end(text);
  }
  response.writeHead(200, {'content-type':'text/event-stream', 'cache-control':'no-cache', connection:'keep-alive'});
  let buffer = '';
  for await (const chunk of Readable.fromWeb(upstream.body)) {
    buffer += chunk.toString('utf8');
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      response.write(normalizeSseLine(line) + '\n');
    }
  }
  if (buffer) response.write(normalizeSseLine(buffer) + '\n');
  response.end();
}

export function createBridge({bridgeKey, fetchImpl = fetch}) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    try {
      if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, {ok:true, name:'cursor-mercury-link'});
      if (!authorized(request, bridgeKey)) return send(response, 401, errorBody('Unauthorized bridge request.', 'bridge_unauthorized', 'authentication_error'));
      if (request.method === 'GET' && url.pathname === '/v1/models') return send(response, 200, {object:'list', data:providerModels()});
      if (request.method === 'POST' && url.pathname === '/v1/chat/completions') return await forwardChat(request, response, fetchImpl);
      return send(response, 404, errorBody('Not found.', 'not_found'));
    } catch (error) {
      if (error?.name === 'AbortError') return response.destroy();
      const status = error instanceof BridgeError ? error.status : 502;
      const message = error instanceof BridgeError ? error.message : `Could not reach the Inception API: ${error?.message ?? error}`;
      return send(response, status, errorBody(message, error?.code ?? 'bridge_error', error?.type ?? 'api_error'));
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const config = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
  createBridge({bridgeKey:config.key}).listen(config.port, '127.0.0.1');
}
