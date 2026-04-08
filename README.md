# token-tiger-cli-v1

Token Tiger CLI — ESM, Commander, JavaScript Standard Style, Mocha, Chai, Sinon, and c8. Layout matches `prompt/cli/example`.

## Layout

| Path | Role |
|------|------|
| `token-tiger-cli.js` | Entry: registers commands and calls `program.parseAsync()` |
| `config/index.js` | App config; loads `dotenv` |
| `src/commands/` | One class per subcommand (`run`, `validateFlags`, dependency injection) |
| `src/lib/` | Shared utilities |
| `test/unit/` | Unit tests (`*-unit.js`), mocks under `test/unit/mocks/` |
| `test/integration/` | Integration tests (real CLI process; `npm run test:integration`) |

## Requirements

Node.js v20 or higher.

## Setup

```bash
cd token-tiger-cli-v1
npm install
cp .env.example .env   # optional
```

## Usage

```bash
node token-tiger-cli.js help
node token-tiger-cli.js info
node token-tiger-cli.js login -e <email> -p <password>
```

## Scripts

- `npm test` — unit tests with c8 text coverage
- `npm run test:integration` — integration tests (Mocha, longer timeout)
- `npm run lint` — Standard (`--env mocha --fix`)
- `npm run coverage` — HTML coverage report
