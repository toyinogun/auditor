# Overpayment Auditor

Finds money a company has overpaid its suppliers. An LLM reads invoices, contracts and purchase orders; plain code checks every invoice against the contract, goods received and the payment ledger; an analyst approves each finding and exports a claim list. Runs on fictional sample data only.

Stack and architecture: [docs/specs/0001-stack-architecture](docs/specs/0001-stack-architecture/index.md).

## Run it locally

Needs Node 22 (see `.nvmrc`) and pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev        # http://localhost:3000
pnpm build      # production build (standalone output)
pnpm typecheck
```
