# @ai-native-solutions/fallledger-mcp

Model Context Protocol (stdio) server exposing [`fallledger-sdk`](https://github.com/sjgant80-hub/fallledger-sdk) — a sovereign double-entry general ledger — as tools + resources for Claude Desktop, Claude Code, or any MCP client.

## Install & wire into Claude Code

```bash
claude mcp add fallledger -- npx -y @ai-native-solutions/fallledger-mcp
```

State persists to `~/.fallledger.json` by default. Override with `FALLLEDGER_STATE=/path/to/state.json`.

## Tools

| Tool | What it does |
|---|---|
| `post_journal` | Post a balanced multi-line journal (throws if debits ≠ credits) |
| `add_account` | Add a new account to the chart |
| `reverse_journal` | Post a reversal that undoes a prior journal |
| `trial_balance` | Debit/credit totals + per-account net |
| `profit_and_loss` | Revenue − COGS − expenses = operating profit |
| `balance_sheet` | Assets vs liabilities + equity, with retained earnings |
| `cash_flow` | Indirect-method cash flow |
| `vat_return` | UK HMRC 9-box VAT layout, informational |

## Resources

| URI | Contents |
|---|---|
| `fallledger://accounts` | Chart of accounts JSON |
| `fallledger://journals` | Every posted journal |
| `fallledger://state` | Full ledger state (round-trippable) |

## Example prompt

> "Add a Sales account under revenue if it isn't there, then post: I invoiced Acme £1,200 for consulting today, with £200 VAT. Then show me the trial balance and confirm it balances."

## License

MIT — AI Native Solutions
