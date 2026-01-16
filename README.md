# OpenCode Sync

Sync your local OpenCode authentication and configuration to GitHub secrets for use in GitHub Copilot agents and CI workflows.

This tool is the "missing link" that enables [OpenCode GitHub Integration](https://opencode.ai/docs/github/) to work in headless environments like GitHub Actions or Copilot Agents.

## The Problem
The OpenCode GitHub plugin needs:
1. **Authentication**: OAuth tokens for your model provider (e.g., Google Antigravity)
2. **Configuration**: Which models to use, plugins to load
3. **Secrets**: GitHub tokens for the agent to do work

In a local environment, these are in `~/.config/opencode`. In a headless CI/Agent environment, they are missing.

## The Solution
`opencode-sync` bundles your local credentials and configuration into a secure, encrypted bundle and pushes it to GitHub Secrets. The matching GitHub Action then restores it at runtime.

## Usage

### 1. Initialize

In your project root:

```bash
bunx opencode-sync init
```

### 2. Configure

Edit `.opencode/opencode-sync.json`. To use with the **GitHub Plugin**, make sure to add it:

```json
{
  "defaults": {
    "sync": {
      "config": {
        "mode": "merge",
        "plugins": [
          "opencode-antigravity-auth@1.2.8",
          "@opencode-ai/github"  // Add the GitHub plugin
        ]
      }
    }
  }
}
```

### 3. Sync

```bash
bunx opencode-sync sync
```

### 4. Workflow

Your `.github/workflows/opencode-agent.yml`:

```yaml
jobs:
  agent:
    runs-on: ubuntu-latest
    environment: copilot
    steps:
      - uses: actions/checkout@v4
      
      # Restore auth & install plugins
      - uses: user/opencode-sync@v1
        with:
          bundle: ${{ secrets.OPENCODE_AUTH_BUNDLE }}
          
      # Run the agent (GitHub plugin will now have auth!)
      - run: opencode run "Check this PR for issues"
```
