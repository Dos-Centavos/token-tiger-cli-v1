---
name: token-tiger-cli
description: >-
  Documents the token-tiger-cli-v1 Node.js CLI (program name token-tiger): login,
  create-user, info, check-balance, create-token, create-collection,
  create-sharable-collection, show-collections, show-collection-tokens, and
  export-token. Covers environment variables, session file at user-data/user.json,
  required and optional flags, API endpoints, and typical workflows. Use when
  running, explaining, or automating this CLI; debugging Token Tiger API
  integration; Tus uploads, NFT minting, exporting tokens, credit checks; or when
  the user mentions token-tiger, Token Tiger, or this repository's CLI commands.
---

# Token Tiger CLI

This skill applies to the **token-tiger-cli-v1** repository: a Node.js ESM CLI using Commander, Axios, and tus-js-client. Entry point: `token-tiger-cli.js`. Runtime: **Node.js 20 or newer**.

## Prerequisites

- Install dependencies: `npm install` from the repository root.
- Optional: copy `.env.example` to `.env` and adjust values.
- Run the CLI: `node token-tiger-cli.js` plus a subcommand (see below). Use `node token-tiger-cli.js help` for built-in help.

## Environment variables

Loaded through `config/index.js` via dotenv.

| Variable | Default | Role |
|----------|---------|------|
| TOKEN_TIGER_API_BASE_URL | http://localhost:5001 | Base URL for all HTTP calls |
| TOKEN_TIGER_INBOX_GALLERY | empty | Gallery id for the optional create-token inbox step |
| TOKEN_TIGER_TOKEN | empty | Defined in config as defaultToken; not consumed by command modules today |
| TOKEN_TIGER_LOG_LEVEL | info | Defined in config as logLevel; not consumed by command modules today |

Note: `.env.example` does not list TOKEN_TIGER_INBOX_GALLERY; set it when using the gallery step.

## Session file

- Location: `user-data/user.json` (paths resolved in `src/lib/paths.js`).
- Created or updated by **login** and **create-user**.
- Read by most commands including **info**, **check-balance**, **create-token**, **create-collection**, **create-sharable-collection**, **show-collections**, **show-collection-tokens**, and **export-token**.
- Holds JWT, user record (including email and id fields), and project arrays. Treat as sensitive; login and create-user print the JWT to stdout.

## Commands

Invocation pattern: `node token-tiger-cli.js SUBCOMMAND [options]`

### login

- POST to `{base}/auth` with email and password.
- Required flags: `-e` or `--email`, `-p` or `--password`.
- Persists session to `user-data/user.json`.

### create-user

- POST to `{base}/users` with nested user email and password.
- Same required flags as login.
- Same session persistence pattern as login. API errors may print response JSON.

### info

- No network calls; reads local session and config.
- Prints a small table: API base URL and login display string (email when logged in).

### check-balance

- GET `{base}/users/{userId}` with Bearer JWT.
- Requires prior login or create-user so JWT and user id exist in session.
- Prints available credits from `user.credit.available`.

### create-token

- Full flow: resolve NFT collection, Tus upload main file and thumbnail to `{base}/files`, POST metadata for thumbnail then asset to `{base}/macro/metadata/`, POST `{base}/token/tokenize-payload/`, optionally POST `{base}/gallery/nft/add`.
- Required: `-n` or `--name` (title), `-f` or `--file` (main asset path), `-t` or `--thumbnail` (thumbnail path).
- Optional: `-c` or `--collection` (collection id); `-u` or `--url`; `-d` or `--description`; `--nsfw`; `--skip-gallery`; `-p` or `--public` (public metadata); `-a` or `--address` (destination).
- If collection is omitted: loads collections, picks NFT collections (tokensType 1), or creates a collection and may update the session file.
- Gallery step runs only when `--skip-gallery` is not set and TOKEN_TIGER_INBOX_GALLERY is non-empty.

### create-collection

- Creates a new collection owned by the logged-in user.
- Required flags: `-n` or `--name` (collection label).
- Optional flags: `-t` or `--tokens-type` (`1` for NFT collections; `65` for fungible tokens, depending on server support).
- Requires prior login or create-user so JWT and user id exist in session.
- Updates the session file with the new project/collection id.

### create-sharable-collection

- Creates a sharable NFT collection (a public-id based collection intended for sharing).
- Required flags: `-n` or `--name` (collection label).
- Optional flags: `--public` (collection is publicly discoverable).
- Requires prior login or create-user so JWT and user id exist in session.
- Updates the session file with sharable collection information returned by the API.

### show-collections

- Lists both:
  - Collections owned by the logged-in user (projects), and
  - “Sharable collections” associated with the user.
- Requires prior login or create-user so JWT and user id exist in session.

### show-collection-tokens

- Lists tokens for either:
  - a collection id (24 hex / Mongo object id), or
  - a sharable public id (digits).
- Required flags: `-i` or `--id <string>`.
- Requires prior login or create-user so JWT and user id exist in session.

### export-token

- Exports a token from a collection (or sharable collection) to a destination address.
- Required flags:
  - `-c` or `--collection <id>` (collection id holding the token; can be a 24-hex id or sharable public id)
  - `-t` or `--token-id <string>` (token id to export/send)
  - `-a` or `--address <string>` (destination `simpleledger:` or `bitcoincash:` address)
- Requires prior login or create-user so JWT and user id exist in session.

## HTTP API surface

Commands use the configured API base URL with no trailing slash on the base path. Authentication uses `Authorization: Bearer` plus the session JWT except where noted.

| Command | Method | Path | Notes |
|---------|--------|------|--------|
| login | POST | `/auth` | JSON body: email, password. Response includes token and user. |
| create-user | POST | `/users` | JSON body: user object with email, password. |
| check-balance | GET | `/users/:userId` | Bearer JWT. Response includes user.credit.available. |
| create-collection | POST | `/projects/` | Bearer JWT. JSON body includes name and optionally tokensType. |
| create-sharable-collection | POST | `/users/share/nft/create` | Bearer JWT. Creates sharable collection; may return updated user payload. |
| show-collections | GET | `/projects/` | Bearer JWT. Owned collections. |
| show-collections | GET | `/users/share/nft/collections/` | Bearer JWT. Sharable collections. |
| show-collection-tokens | POST | `/token/project-tokens` | Bearer JWT. Used when id is a 24-hex collection id. |
| show-collection-tokens | GET | `/users/share/nft/tokens/:publicId` | Bearer JWT. Used when id is a sharable public id. |
| export-token | POST | `/token/export/project` | Bearer JWT. Used when collection id is a 24-hex id. |
| export-token | POST | `/token/export/sharable` | Bearer JWT. Used when collection id is a sharable public id. |
| create-token | GET | `/projects/` | Lists projects for collection resolution. |
| create-token | POST | `/projects/` | Creates NFT collection when none exist. |
| create-token | Tus | `/files` | Resumable upload via tus-js-client, not a plain JSON POST. |
| create-token | POST | `/macro/metadata/` | Thumbnail metadata, then asset metadata. |
| create-token | POST | `/token/tokenize-payload/` | Mint step; optional address in body. |
| create-token | POST | `/gallery/nft/add` | Optional; requires inbox gallery id from environment. |

Session file `user-data/user.json` stores JWT, user document (id, email, projects), and optional top-level projects array.

## Recommended workflows

1. New account: create-user, then info or check-balance.
2. Existing account: login, then check-balance or create-token.
3. Configuration check: info.
4. Create a collection explicitly: create-collection (or create-sharable-collection), then create-token with `--collection`.
5. Inspect assets: show-collections, then show-collection-tokens for a chosen id.
6. Send/export a token: export-token with collection id, token id, and destination address.

## Operational notes

- Run commands from the **repository root** so `user-data/` and module paths resolve correctly.
- Many failures log messages or API JSON; exit codes may still be zero because Commander does not map command return values to process.exitCode by default. Rely on console output when diagnosing failures.
- create-token needs real filesystem paths for the asset and thumbnail.

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| User data not found | Run login or create-user first |
| No JWT or user id | Missing or invalid session; re-authenticate |
| Collection not found or not owned | Wrong collection id or permissions |
| Gallery skipped | TOKEN_TIGER_INBOX_GALLERY unset or --skip-gallery |
| API errors | Wrong base URL, expired JWT, or server-side validation |

## Source map

| Concern | Location |
|---------|----------|
| Command registration | token-tiger-cli.js |
| Command implementations | src/commands/ |
| Session and filesystem helpers | src/lib/app-utils.js, src/lib/paths.js |
| Configuration | config/index.js |
