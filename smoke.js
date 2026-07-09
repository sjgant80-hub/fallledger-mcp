// stdio JSON-RPC smoke test for fallledger-mcp
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const proc = spawn(process.execPath, ['bin/fallledger-mcp.js'], {
  env: { ...process.env, FALLLEDGER_STATE: './smoke-state.json' },
  stdio: ['pipe', 'pipe', 'inherit']
});

let buf = '';
const responses = [];
proc.stdout.on('data', (chunk) => {
  buf += chunk.toString('utf8');
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
    if (line.trim()) responses.push(JSON.parse(line));
  }
});

function send(msg) { proc.stdin.write(JSON.stringify(msg) + '\n'); }
async function waitFor(id) {
  for (let i = 0; i < 60; i++) {
    const r = responses.find(x => x.id === id);
    if (r) return r;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('timeout id=' + id);
}

try {
  send({ jsonrpc:'2.0', id:1, method:'initialize', params:{ protocolVersion:'2025-06-18', capabilities:{}, clientInfo:{name:'smoke',version:'1.0'} } });
  await waitFor(1);
  send({ jsonrpc:'2.0', method:'notifications/initialized' });

  send({ jsonrpc:'2.0', id:2, method:'tools/list' });
  const tools = await waitFor(2);
  assert.ok(tools.result.tools.length >= 6, 'has tools');

  send({ jsonrpc:'2.0', id:3, method:'tools/call', params:{ name:'post_journal', arguments:{
    date:'2026-07-09', ref:'INV-1',
    lines:[{accountId:'A1010',debit:500},{accountId:'A4000',credit:500}]
  }}});
  const posted = await waitFor(3);
  assert.equal(posted.result.isError, undefined, 'post ok');

  send({ jsonrpc:'2.0', id:4, method:'tools/call', params:{ name:'trial_balance', arguments:{} } });
  const tb = await waitFor(4);
  const body = JSON.parse(tb.result.content[0].text);
  assert.equal(body.balanced, true, 'TB balanced');

  send({ jsonrpc:'2.0', id:5, method:'resources/list' });
  const rs = await waitFor(5);
  assert.ok(rs.result.resources.length >= 3);

  console.log('OK · MCP smoke passed (' + tools.result.tools.length + ' tools, ' + rs.result.resources.length + ' resources)');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exitCode = 1;
} finally {
  proc.kill();
}
