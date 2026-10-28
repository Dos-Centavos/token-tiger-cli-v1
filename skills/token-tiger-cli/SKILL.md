---
name: token-tiger-cli
description: >-
  Documents the token-tiger-cli-v1 Node.js CLI (program name token-tiger): login,
  create-user, info, check-balance, create-token, create-bulk-tokens,
  append-bulk-tokens, show-bulk-batch, show-bulk-jobs, create-collection,
  create-sharable-collection, show-collections, show-collection-tokens, and
  export-token. Covers environment variables, session file at user-data/user.json,
  required and optional flags, bulk manifests, API endpoints, polling, and typical
  workflows. Use when running, explaining, or automating this CLI; debugging Token
  Tiger API integration; Tus uploads, single or bulk NFT minting, exporting tokens,
  credit checks; or when the user mentions token-tiger, Token Tiger, or this
  repository's CLI commands.
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
| TOKEN_TIGER_INBOX_GALLERY | empty | Gallery id for the optional create-token inbox step; **not used by bulk commands** |
| TOKEN_TIGER_TOKEN | empty | Defined in config as defaultToken; not consumed by command modules today |
| TOKEN_TIGER_LOG_LEVEL | info | Defined in config as logLevel; not consumed by command modules today |

Notes:

- `.env.example` does not list TOKEN_TIGER_INBOX_GALLERY; set it when using the create-token gallery step.
- Bulk gallery membership is controlled by each job's `addToGallery` flag. The pearson-api worker finds the inbox gallery itself by matching `description` against `/inbox/i`; the CLI does not send a gallery id.

## Session file

- Location: `user-data/user.json` (paths resolved in `src/lib/paths.js`).
- Created or updated by **login** and **create-user**.
- Read by most commands including **info**, **check-balance**, **create-token**, **create-bulk-tokens**, **append-bulk-tokens**, **show-bulk-batch**, **show-bulk-jobs**, **create-collection**, **create-sharable-collection**, **show-collections**, **show-collection-tokens**, and **export-token**.
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

### create-bulk-tokens

- Queues a batch of up to **10** NFT jobs. The request returns immediately; minting is asynchronous on the API.
- Required: `-m` or `--manifest <path>` (JSON manifest).
- Optional: `-c` or `--collection <id>` (overrides `manifest.collection`; if neither is set, uses the last NFT collection or creates one); `-a` or `--address <string>` (default destination for items without an address); `--gallery` (sets `addToGallery` true for every item); `--dry-run` (validate and print the plan without uploading or queueing).
- Flow: load session, load and validate the manifest, resolve the collection, Tus upload every `file` then every `thumbnail` to `{base}/files`, POST `{base}/macro/payload/bulk` with the `items` array.
- Uploaded names are normalized the same way the API normalizes them (whitespace becomes `-`); the queued `originalFileName` and `thumbnailFileName` match the files stored on the server.
- Prints the returned `batchId`, the queued count, and the polling command.
- If enqueue fails after uploads succeed, the uploaded files remain on the server; the API exposes no delete endpoint.

Manifest shape:

```json
{
  "collection": "64f0c2a1b2c3d4e5f6071829",
  "items": [
    {
      "file": "./art/one.png",
      "thumbnail": "./art/one-thumb.png",
      "title": "One",
      "address": "simpleledger:...",
      "public": false,
      "addToGallery": false,
      "url": "https://tokentiger.com",
      "description": "About this token",
      "nsfw": false
    }
  ]
}
```

Manifest rules (`src/lib/bulk-manifest.js`):

- Root must be a JSON object with a non-empty `items` array of at most 10 entries.
- `collection` is optional and must be a string when present.
- Per item: `file` and `thumbnail` are required, must be strings, and must exist on the local filesystem.
- `title` is optional; it defaults to the asset's basename without extension, then `Untitled`.
- `address` (or `destAddr`) is optional and becomes the API's `destAddr`.
- `public`, `addToGallery`, and `nsfw` are booleans when present; `addToGallery` defaults to false.
- `url`, `description`, and `nsfw` are folded into the token `customData` (`issuerUrl`, `about`, `nsfw`, `ticker: NFT`, `userData.currentUrl`).
- `metadata` and `customData` are optional objects. They override the generated defaults; `metadata.meta` is merged shallowly over the generated `meta` (`fileData`, `filePreview`, `emailOwner`).
- Unknown fields are ignored.

Server-side behavior worth knowing when writing manifests:

- The API stores one `metadata` object per job and reuses it for both the thumbnail and the original payload, overriding `title`, `projectId`, `owner`, `isThumbnail`, and `meta.filePreview`. `meta.fileData` therefore reflects the asset file for both metadata documents.
- The API worker always processes bulk items with encryption disabled.

### append-bulk-tokens

- Appends jobs to an existing batch.
- Required: `-b` or `--batch <id>`, `-m` or `--manifest <path>`.
- Optional: `--dry-run`.
- Flow: load session, validate the manifest, GET `{base}/macro/payload/bulk/{batchId}` to verify ownership and capacity (existing items + new items must be <= 10), Tus upload every file and thumbnail, POST `{base}/macro/payload/bulk/{batchId}/items`.
- Only `originalFileName`, `thumbnailFileName`, and `title` are sent. The API takes `projectId`, `metadata`, `customData`, `addToGallery`, and `destAddr` from the oldest row in the batch (`buildAppendedItem`), so other manifest fields have no effect on appended jobs.
- A batch is appendable while at least one row is `queued`, `processing`, or `completed`; a batch whose rows are all `failed` is rejected by the API.
- Failed rows still count toward the 10-item limit.

### show-bulk-batch

- GET `{base}/macro/payload/bulk/{batchId}` with Bearer JWT; only the batch owner can read it.
- Required: `-b` or `--batch <id>`.
- Optional: `--watch` (poll until every item is `completed` or `failed`); `--interval <seconds>` (default 15); `--timeout <seconds>` (default 0, meaning no timeout; watch mode exits with failure after the timeout).
- Prints per-status counts and a table of title, status, payload id, txid, and error.
- The API worker claims one queued row per 15-second tick, so a batch can take several minutes. `processing` rows are not automatically recovered if the API process dies after claiming them.

### show-bulk-jobs

- GET `{base}/macro/payload/bulk/user/{userId}` with Bearer JWT.
- Optional: `--status <queued|processing|completed|failed>`, `--project <collection id>`.
- Prints two tables: per-batch counts (`queued`, `processing`, `completed`, `failed`, `itemCount`) and one row per job (`batchId`, title, status, payload id, txid, error).
- The API applies the filters before aggregating batch counts, so the batch totals reflect only the filtered jobs.

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

## Bulk job lifecycle

A job row holds one of four statuses:

| Status | Meaning |
|--------|---------|
| queued | Accepted; waiting for the API worker |
| processing | Claimed by one worker tick |
| completed | Thumbnail metadata, payload metadata, and token mint finished (and gallery add, if requested) |
| failed | An error occurred; `error` holds the message and one reserved credit is refunded |

Bulk behavior comes from pearson-api:

- Enqueue reserves one tokenization credit per item and writes one MongoDB document per job under a shared `batchId`.
- The worker creates thumbnail metadata, then asset metadata, then mints the token with `skipCreditCharge` because credit was already reserved.
- `addToGallery` is resolved server-side against a gallery whose description matches `inbox`; a missing inbox gallery fails the item after minting.
- There is no cancel or retry endpoint. A failed job is terminal; resubmit the file as a new job to retry.

## HTTP API surface

Commands use the configured API base URL with no trailing slash on the base path. Authentication uses `Authorization: Bearer` plus the session JWT except where noted.

| Command | Method | Path | Notes |
|---------|--------|------|-------|
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
| create-bulk-tokens | GET | `/projects/` | Lists projects for collection resolution. |
| create-bulk-tokens | POST | `/projects/` | Creates NFT collection when none exist. |
| create-bulk-tokens | Tus | `/files` | One upload per asset and per thumbnail. |
| create-bulk-tokens | POST | `/macro/payload/bulk` | Body `{ items }`. Returns `batchId`, `itemCount`, `status`. |
| append-bulk-tokens | GET | `/macro/payload/bulk/:batchId` | Owner-only; used for existence and capacity checks. |
| append-bulk-tokens | Tus | `/files` | One upload per asset and per thumbnail. |
| append-bulk-tokens | POST | `/macro/payload/bulk/:batchId/items` | Body `{ items }`; only file names and title are used. |
| show-bulk-batch | GET | `/macro/payload/bulk/:batchId` | Owner-only. Body includes `batchId` and `items`. |
| show-bulk-jobs | GET | `/macro/payload/bulk/user/:userId` | JWT user only. Query: `status`, `projectId`. Returns `items` and `batches`. |

Session file `user-data/user.json` stores JWT, user document (id, email, projects), and optional top-level projects array.

## Recommended workflows

1. New account: create-user, then info or check-balance.
2. Existing account: login, then check-balance or create-token.
3. Configuration check: info.
4. Create a collection explicitly: create-collection (or create-sharable-collection), then create-token with `--collection`.
5. Inspect assets: show-collections, then show-collection-tokens for a chosen id.
6. Send/export a token: export-token with collection id, token id, and destination address.
7. Bulk mint: write a manifest, run create-bulk-tokens --dry-run, run create-bulk-tokens, then show-bulk-batch --watch.
8. Extend a running or completed batch: append-bulk-tokens with a manifest of file/thumbnail/title entries, then show-bulk-batch --watch.
9. Audit your jobs: show-bulk-jobs, optionally filtered by `--status` or `--project`.

## Operational notes

- Run commands from the **repository root** so `user-data/` and module paths resolve correctly.
- Many failures log messages or API JSON; exit codes may still be zero because Commander does not map command return values to process.exitCode by default. Rely on console output when diagnosing failures.
- create-token needs real filesystem paths for the asset and thumbnail.
- Bulk commands need real filesystem paths in the manifest and enforce the API's 10-item batch limit locally before uploading.
- Bulk enqueue is fast; minting is not. Expect one item per API timer tick (15 seconds) and poll rather than assuming the batch is done when the command returns.
- Use `--dry-run` first for bulk manifests: it validates every file path and prints the exact items without uploading. When no collection is specified, a create dry run does not resolve or create a collection; it reports that the collection would be resolved at run time.
- `--gallery` on create-bulk-tokens forces gallery membership on for every item; without it, set `addToGallery: true` per item in the manifest.
- `--address` on create-bulk-tokens is a default; a non-empty per-item `address` in the manifest wins.
- Appended items cannot choose a different collection, metadata, customData, gallery setting, or destination; those come from the batch's oldest row.
- The API has no cancel or retry endpoint. Failed rows are terminal and refund one credit.

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| User data not found | Run login or create-user first |
| No JWT or user id | Missing or invalid session; re-authenticate |
| Collection not found or not owned | Wrong collection id or permissions |
| Manifest not found / Invalid JSON | Wrong `-m` path or malformed JSON |
| items[n].file not found | Local path in the manifest is wrong or the file moved |
| A batch cannot contain more than 10 items | Manifest or batch exceeds the API limit |
| Batch already has N item(s) | append-bulk-tokens would exceed 10; start a new batch |
| Could not load the batch | Wrong batch id, not the owner, or the batch no longer exists |
| Job failed after minting | Check `error`; a missing inbox gallery or post-mint step can fail the row even though a token was created |
| JWT expired | Log in again; tokens expire per the API's `jwtExpiration` |
| API errors | Wrong base URL, expired JWT, or server-side validation |
| Gallery skipped (single token) | TOKEN_TIGER_INBOX_GALLERY unset or --skip-gallery |
| Gallery not applied (bulk) | `--gallery` not passed and `addToGallery` not true in the manifest |

## Source map

| Concern | Location |
|---------|----------|
| Command registration | token-tiger-cli.js |
| Command implementations | src/commands/ |
| Bulk manifest parsing and payload shaping | src/lib/bulk-manifest.js |
| Bulk Tus upload helper | src/lib/tus-upload.js |
| Session and filesystem helpers | src/lib/app-utils.js, src/lib/paths.js |
| Configuration | config/index.js |
