#!/usr/bin/env node
/**
 * fallledger-mcp — stdio MCP server around @ai-native-solutions/fallledger-sdk
 * Persists ledger state to $FALLLEDGER_STATE (default: ~/.fallledger.json)
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { Ledger } from '@ai-native-solutions/fallledger-sdk';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const STATE_PATH = process.env.FALLLEDGER_STATE || join(homedir(), '.fallledger.json');

let ledger;
try {
  if (existsSync(STATE_PATH)) {
    ledger = Ledger.fromJSON(JSON.parse(readFileSync(STATE_PATH, 'utf8')));
  } else {
    ledger = new Ledger();
  }
} catch (e) {
  console.error('[fallledger-mcp] failed to load state, starting fresh:', e.message);
  ledger = new Ledger();
}

function persist() {
  try { writeFileSync(STATE_PATH, JSON.stringify(ledger.toJSON(), null, 2)); }
  catch (e) { console.error('[fallledger-mcp] persist failed:', e.message); }
}

const server = new Server(
  { name: 'fallledger-mcp', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

/* ---------------- Tools ---------------- */
const TOOLS = [
  {
    name: 'post_journal',
    description: 'Post a balanced double-entry journal. Debits must equal credits. Each line references an accountId (e.g. "A1010" for Bank).',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'ISO date YYYY-MM-DD (default: today)' },
        ref: { type: 'string', description: 'Reference like INV-001' },
        narrative: { type: 'string', description: 'Human description' },
        lines: {
          type: 'array',
          minItems: 2,
          items: {
            type: 'object',
            properties: {
              accountId: { type: 'string' },
              debit: { type: 'number' },
              credit: { type: 'number' },
              memo: { type: 'string' }
            },
            required: ['accountId']
          }
        }
      },
      required: ['lines']
    }
  },
  {
    name: 'add_account',
    description: 'Add a new account to the chart of accounts.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        name: { type: 'string' },
        category: { type: 'string', enum: ['asset','liability','equity','revenue','expense'] }
      },
      required: ['code','name','category']
    }
  },
  {
    name: 'reverse_journal',
    description: 'Post a reversal journal that undoes a prior posting.',
    inputSchema: {
      type: 'object',
      properties: { journalId: { type: 'string' } },
      required: ['journalId']
    }
  },
  {
    name: 'trial_balance',
    description: 'Compute a trial balance for a period. Confirms debits = credits.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'ISO date (default: inception)' },
        to:   { type: 'string', description: 'ISO date (default: today)' }
      }
    }
  },
  {
    name: 'profit_and_loss',
    description: 'Profit and loss statement for a period. Cost of sales = expense accounts with code starting 5.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to:   { type: 'string' }
      }
    }
  },
  {
    name: 'balance_sheet',
    description: 'Balance sheet as at a given date, with computed retained earnings.',
    inputSchema: {
      type: 'object',
      properties: { at: { type: 'string' } }
    }
  },
  {
    name: 'cash_flow',
    description: 'Cash flow statement (indirect method) for a period.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to:   { type: 'string' }
      }
    }
  },
  {
    name: 'vat_return',
    description: 'UK VAT return boxes 1-9 for a period. Informational only.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to:   { type: 'string' }
      }
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    let result;
    switch (name) {
      case 'post_journal':     result = ledger.postJournal(args); persist(); break;
      case 'add_account':      result = ledger.addAccount(args); persist(); break;
      case 'reverse_journal':  result = ledger.reverseJournal(args.journalId); persist(); break;
      case 'trial_balance':    result = ledger.trialBalance(args.from, args.to); break;
      case 'profit_and_loss':  result = ledger.profitAndLoss(args.from, args.to); break;
      case 'balance_sheet':    result = ledger.balanceSheet(args.at); break;
      case 'cash_flow':        result = ledger.cashFlow(args.from, args.to); break;
      case 'vat_return':       result = ledger.vatReturn(args.from, args.to); break;
      default: throw new Error('unknown tool: ' + name);
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: 'error: ' + e.message }], isError: true };
  }
});

/* ---------------- Resources ---------------- */
const RESOURCES = [
  { uri: 'fallledger://accounts',  name: 'chart of accounts', mimeType: 'application/json' },
  { uri: 'fallledger://journals',  name: 'all journals',      mimeType: 'application/json' },
  { uri: 'fallledger://state',     name: 'full ledger state', mimeType: 'application/json' }
];

server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = req.params.uri;
  let data;
  if (uri === 'fallledger://accounts') data = ledger.accounts;
  else if (uri === 'fallledger://journals') data = ledger.journals;
  else if (uri === 'fallledger://state') data = ledger.toJSON();
  else throw new Error('unknown resource: ' + uri);
  return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
});

/* ---------------- Boot ---------------- */
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[fallledger-mcp] running · state at ' + STATE_PATH);
