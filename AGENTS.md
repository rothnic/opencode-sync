# OpenCode Sync

This directory implements the `opencode-sync` tool, which synchronizes local OpenCode authentication and configuration to GitHub secrets. This allows headless environments (like GitHub Copilot Agents and CI workflows) to run OpenCode with full access to Antigravity models.

## Core Components

### `src/cli.ts`
The main entry point using `optique`. Handles command dispatch:
- `sync`: The core logic that bundles auth and pushes to GitHub.
- `restore`: Used by CI to restore the bundle (though `action.yml` is preferred).
- `init`: Scaffolds the `.opencode` config and `.github` workflow.

### `src/bundle.ts`
Handles the secure packaging of auth files:
- Reads `antigravity-accounts.json` (OAuth tokens)
- Reads `auth.json` (session state)
- Merges `opencode.jsonc` based on config rules
- Creates a tar.gz bundle and base64 encodes it for GitHub Secrets

### `src/config.ts` & `src/merge.ts`
Handles configuration logic:
- Discovers `opencode-sync.json` in various locations
- Merges configuration based on "full", "merge", or "none" modes
- Allows overriding models and plugins for remote environments

### `src/github.ts`
Interacts with GitHub via the `gh` CLI:
- Verifies authentication
- Ensures environments exist
- Sets environment secrets

## Security

This project handles sensitive OAuth tokens.
- **NEVER** commit `antigravity-accounts.json` or `auth.json`.
- `lefthook.yml` contains pre-commit hooks to block these files.
- `scripts/check-secrets.ts` scans for secret patterns.

## Configuration Schema

See `src/schema.ts` for the Zod schema.
Key configuration options:
- `defaults.environment`: GitHub environment (default: "copilot")
- `sync.config.mode`: "merge" is recommended to combine local auth with remote-specific settings (like headless models).
