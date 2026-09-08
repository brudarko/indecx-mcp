import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createServer } from '../dist/server.js';
import { startHttp } from '../dist/http.js';

async function connected(fetcher) {
  const server = createServer('test-secret', fetcher);
  const [a,b] = InMemoryTransport.createLinkedPair();
  const client = new Client({name:'test',version:'1'});
  await server.connect(a); await client.connect(b);
  return {client, close: async () => { await client.close(); await server.close(); }};
}

test('tools route reads, auth, query and results through MCP', async () => {
  const calls = [];
  const ctx = await connected(async (url, init) => {
    calls.push({url,init}); return Response.json({total:3, answers:[{review:9}]});
  });
  try {
    const {tools} = await ctx.client.listTools();
    assert.equal(tools.length,8);
    assert(tools.every(t => t.annotations.readOnlyHint));
    const cases = [
      ['indecx_list_actions',{},'/v2/actions-info'],
      ['indecx_get_action',{actionId:'abc'},'/v2/actions-info/abc'],
      ['indecx_get_answers',{page:2,limit:1,startDate:'01-09-2026'},'/v2/answers-info/all'],
      ['indecx_get_invites',{},'/v2/invites-info/all'],
      ['indecx_get_no_response',{actionId:'abc',clienteId:'c1'},'/v2/no-response/abc'],
      ['indecx_get_categories',{},'/v2/category-info/all'],
      ['indecx_get_blocklist',{},'/v2/blocklist-info'],
      ['indecx_list_branches',{},'/v2/branches'],
    ];
    for (const [name,args,path] of cases) {
      const result = await ctx.client.callTool({name,arguments:args});
      assert(!result.isError);
      assert.equal(JSON.parse(result.content[0].text).total,3);
      const {url,init} = calls.at(-1);
      assert.equal(url.origin,'https://indecx.com'); assert.equal(url.pathname,path);
      assert.equal(init.headers['company-key'],'test-secret');
      assert.equal(init.redirect,'error'); assert(init.signal);
      assert.equal(init.method,undefined); assert.equal(init.body,undefined);
    }
    assert.equal(calls[2].url.searchParams.get('page'),'2');
    assert.equal(calls[2].url.searchParams.get('startDate'),'01-09-2026');
    assert.equal(calls[4].url.searchParams.get('clienteId'),'c1');
    for (const args of [{limit:1001},{page:0},{actionId:'../send'},{startDate:'31-02-2026'},{startDate:'02-09-2026',endDate:'01-09-2026'}]) {
      assert((await ctx.client.callTool({name:'indecx_get_answers',arguments:args})).isError);
    }
    assert.equal(calls.length,8);
  } finally { await ctx.close(); }
});

test('provider failures never disclose secrets or response bodies', async () => {
  for (const fetcher of [async () => new Response('test-secret private data',{status:401}), async () => {throw new Error('test-secret');}, async () => new Response('invalid json')]) {
    const ctx = await connected(fetcher);
    try {
      const result = await ctx.client.callTool({name:'indecx_list_actions',arguments:{}});
      assert(result.isError); assert(!JSON.stringify(result).includes('test-secret'));
    } finally {await ctx.close();}
  }
});

test('stdio handshake and tool discovery', async () => {
  const client = new Client({name:'test',version:'1'});
  try {
    await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],env:{INDECX_COMPANY_KEY:'test-secret'}}));
    assert.equal((await client.listTools()).tools.length,8);
  } finally {await client.close();}
});

test('HTTP requires auth and rejects hostile origins; MCP handshake works', async () => {
  assert.throws(() => startHttp('key',{host:'0.0.0.0',port:0}), /requires/);
  const token = 'a'.repeat(32);
  const http = startHttp('test-secret',{host:'127.0.0.1',port:0,token});
  await once(http,'listening');
  const url = new URL(`http://127.0.0.1:${http.address().port}/mcp`);
  const client = new Client({name:'test',version:'1'});
  try {
    assert.equal((await fetch(url,{method:'POST'})).status,401);
    assert.equal((await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,Origin:'https://evil.example'}})).status,403);
    const hostile = await new Promise((resolve, reject) => {
      const req = request(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,Host:'evil.example'}}, res => {res.resume(); resolve(res.statusCode);});
      req.on('error',reject); req.end();
    });
    assert.equal(hostile,403);
    await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
    assert.equal((await client.listTools()).tools.length,8);
  } finally {await client.close(); http.closeAllConnections(); await new Promise(resolve => http.close(resolve));}
});
