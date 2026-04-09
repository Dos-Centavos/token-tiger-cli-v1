---
name: token-tiger-login
description: Install and use the Token Tiger CLI login command to authenticate against the Token Tiger API and persist a local session (JWT + user data). Use when you need step-by-step setup (clone, install, configure) and to run `login` successfully.
compatibility: Requires Node.js v20+ and network access to the configured TOKEN_TIGER_API_BASE_URL.
metadata:
  repo: "https://github.com/Dos-Centavos/token-tiger-cli-v1"
---

## Goal

Authenticate to the Token Tiger API using the CLI `login` command, then verify the session was saved locally.

## What `login` does

- Sends `POST /auth` to the configured API base URL with your email and password.
- Saves a local session file at `user-data/user.json` containing:
  - `JWT` (token)
  - `user` (user object from the API response)
  - `projects` (from `user.projects`)

## Prerequisites

- Node.js **v20+**
- `git`
- Access to a running Token Tiger API server (defaults to `http://localhost:5001`)
- Credentials (email + password) that the API will accept

## Setup (clone + install)

1. Clone the repo:

```bash
git clone https://github.com/Dos-Centavos/token-tiger-cli-v1.git
cd token-tiger-cli-v1
```

2. Install dependencies:

```bash
npm install
```

3. (Optional) Create a local `.env` file:

```bash
cp .env.example .env
```

## Configure the API base URL

The CLI reads configuration from environment variables (and `.env` if present).

- **Default**: `TOKEN_TIGER_API_BASE_URL` falls back to `http://localhost:5001`
- If your API is elsewhere, set it before running the CLI:

```bash
export TOKEN_TIGER_API_BASE_URL="http://localhost:5001"
```

Or put this into `.env`:

```bash
TOKEN_TIGER_API_BASE_URL=http://localhost:5001
```

## Run `login`

Run the command from the repo root:

```bash
node token-tiger-cli.js login -e "you@example.com" -p "your-password"
```

Expected output on success includes:

- `Login success!`
- A printed JWT line (`JWT : ...`)

## Verify you are logged in

1. Confirm the session file exists:

```bash
ls -la user-data/user.json
```

2. Check status with `info`:

```bash
node token-tiger-cli.js info
```

You should see a table that includes:

- **API base URL**
- **Login**: `logged in as <email>` (when the session includes `user.email`)

## Common failure cases and fixes

- **Connection errors / wrong server**:
  - Ensure `TOKEN_TIGER_API_BASE_URL` points to a running API server.
  - The CLI calls `POST <baseUrl>/auth` (the trailing slash is removed automatically).
- **Unauthorized / invalid credentials**:
  - Verify the email/password are correct for the API you’re hitting.
- **Session not saved**:
  - Ensure the process has permission to create the `user-data/` directory in the repo.

## Security notes

- Avoid passing passwords in shared shell history. Prefer running in a private terminal session.
- Never commit `user-data/user.json` or `.env` files containing secrets.
