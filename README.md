# hledger-webuix
web interface for editing/reporting on hledger plain text accounting files. 

This is a single file HTML file that provides a web interface for hledger. Load the file in your browser, throw in your ledger data file and you get four tabs:

- one tab for the transactions. You can edit and append transactions
- one tab for the balance sheet
- one tab for the P&L
- one **dashboard** tab with Fava-style charts: net worth over time, income vs expenses per month/quarter/year, and an expense/income breakdown as treemap, sunburst or icicle
- **Multi-currency** — every commodity is tracked per posting. Collapsed view values everything in one commodity (like `hledger -X cur --infer-market-prices`, prices from `P` directives and from the journal itself); Expanded view shows one commodity at a time. Toggle and commodity select are in the filter bar.

That's it. Super simple, should be self-explanatory.

## Charts

- **Dashboard** — net worth line/area chart (daily to yearly granularity), income vs expenses stacked bars, expense or income hierarchy (treemap / sunburst / icicle switchable), and quick stats (total assets, liabilities, net worth, income, expenses, net income)
- **Balance Sheet** — a collapsible account hierarchy chart above the table
- **P&L** — a collapsible income vs expenses bar chart above the table
- **Account drill-down** — click any account name in the balance sheet or P&L tables to see its balance over time and its sub-account hierarchy
- All charts follow the filter bar (period, account, tag, free text) and remember your chart preferences locally
- Everything is rendered with vanilla JS and inline SVG — no external JavaScript dependencies, works offline

Please note:
- I am in Europe and my ledger data files use 'EUR' as the currency symbol. There is a test ledger file bcexample.hledger available at https://github.com/simonmichael/hledger/blob/master/examples/bcexample.hledger, that file has 'USD' as currency. hledger-webuix loads this file without any complaints; each commodity is displayed in its own symbol.
- Multi-currency is supported; select the main journal together with the journals it includes (and an optional price journal) so `include` lines resolve. Saving writes a single flattened file.
- my accounts start with ass: lia: inc: exp. I am not sure if that is standard hledger lingo, but it is what I use at the moment. I may need to change that for others to use this web-interface, not sure. The test file bcexample.hledger uses Assets: Liabilities: Income: Expense: and this seems to work fine as well, no parsing errors.
- my dates are in 2026/01/31 format. I think my regexp also parses 2026-01-31.
- functionality is a subset of hledger CLI and hledger-ui.

So more work may be required to make this a useful tool for other people. For now you're free to try and leave comments.

<img width="1497" height="958" alt="Screenshot 2026-03-04 195250" src="https://github.com/user-attachments/assets/a52e6368-3fae-4abe-9e45-07e6114db6dd" />

Final note: No I am NOT a programmer. I have some basic knowledge of Javascript and Python and Pascal and stuff like that, but I am not a programmer. This web interface I built just by talking to Claude at claude.io. Amazing tool!

<img width="1920" height="1200" alt="Screenshot 2026-03-06 220349" src="https://github.com/user-attachments/assets/eaa3dc22-eff8-41dd-a6ea-136ac9eba72d" />

<img width="1920" height="1200" alt="Screenshot 2026-03-06 220430" src="https://github.com/user-attachments/assets/56eb9434-9667-4fa8-b930-50ee05aff0e7" />

