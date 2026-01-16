import {
  command,
  option,
  flag,
  argument,
  constant,
  object,
  or,
  withDefault,
  optional,
} from "@optique/core/parser";
import { string } from "@optique/core/valueparser";
import { message } from "@optique/core/message";
import { run } from "@optique/run";
import { z } from "zod";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import {
  findConfigFile,
  loadConfig,
  resolveTarget,
  resolveAllTargets,
  getOpenCodePaths,
} from "./config.js";
import { createBundle, restoreBundle } from "./bundle.js";
import { syncToGitHub, checkGhCli } from "./github.js";
import { SyncConfigSchema } from "./schema.js";

const VERSION = "0.1.0";

const syncCmd = command(
  "sync",
  object({
    kind: constant("sync"),
    target: optional(argument(string())),
    config: optional(option("-c", "--config", string())),
    dryRun: withDefault(flag("-d", "--dry-run"), false),
    verbose: withDefault(flag("-v", "--verbose"), false),
  })
);

const restoreCmd = command(
  "restore",
  object({
    kind: constant("restore"),
    envVar: withDefault(
      option("-e", "--env-var", string()),
      "OPENCODE_AUTH_BUNDLE"
    ),
    verbose: withDefault(flag("-v", "--verbose"), false),
  })
);

const initCmd = command(
  "init",
  object({
    kind: constant("init"),
    verbose: withDefault(flag("-v", "--verbose"), false),
  })
);

const listCmd = command(
  "list",
  object({
    kind: constant("list"),
    config: optional(option("-c", "--config", string())),
  })
);

const checkCmd = command(
  "check",
  object({
    kind: constant("check"),
    verbose: withDefault(flag("-v", "--verbose"), false),
  })
);

const installCmd = command(
  "install",
  object({
    kind: constant("install"),
    workflows: withDefault(flag("-w", "--workflows"), false),
    commands: withDefault(flag("-c", "--commands"), false),
    all: withDefault(flag("-a", "--all"), false),
    verbose: withDefault(flag("-v", "--verbose"), false),
  })
);

const app = or(syncCmd, restoreCmd, initCmd, listCmd, checkCmd, installCmd);

async function handleSync(args: {
  target?: string;
  config?: string;
  dryRun: boolean;
  verbose: boolean;
}) {
  const configPath = findConfigFile(process.cwd(), args.config);

  if (!configPath) {
    console.error(
      "❌ No config file found. Run 'opencode-sync init' to create one."
    );
    process.exit(1);
  }

  if (args.verbose) {
    console.log(`📋 Using config: ${configPath}`);
  }

  const config = await loadConfig(configPath);
  try {
    SyncConfigSchema.parse(config);
  } catch (e) {
    if (e instanceof z.ZodError) {
      console.error("❌ Invalid config format:");
      console.error(e.format());
    } else {
      console.error(e);
    }
    process.exit(1);
  }

  const targets = args.target
    ? [resolveTarget(args.target, config)].filter(Boolean)
    : resolveAllTargets(config);

  if (targets.length === 0) {
    console.error(
      args.target
        ? `❌ Target "${args.target}" not found in config`
        : "❌ No targets configured"
    );
    process.exit(1);
  }

  if (!args.dryRun) {
    const ghCheck = await checkGhCli();
    if (!ghCheck.ok) {
      console.error(`❌ ${ghCheck.error}`);
      process.exit(1);
    }
  }

  let success = 0;
  let failed = 0;

  for (const target of targets) {
    if (!target) continue;

    try {
      const { base64 } = await createBundle(target, args.verbose);
      const result = await syncToGitHub(target, base64, {
        dryRun: args.dryRun,
        verbose: args.verbose,
      });

      if (result.ok) {
        success++;
        if (!args.verbose) {
          console.log(
            `✅ ${target.name} -> ${target.repo}/${target.environment}`
          );
        }
      } else {
        failed++;
        console.error(`❌ ${target.name}: ${result.error}`);
      }
    } catch (err) {
      failed++;
      console.error(
        `❌ ${target.name}: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  console.log(
    `\n📊 Synced ${success} target(s)${failed > 0 ? `, ${failed} failed` : ""}`
  );
  process.exit(failed > 0 ? 1 : 0);
}

async function handleRestore(args: { envVar: string; verbose: boolean }) {
  const bundle = process.env[args.envVar];

  if (!bundle) {
    console.error(`❌ Environment variable ${args.envVar} not set`);
    process.exit(1);
  }

  try {
    await restoreBundle(bundle, args.verbose);
    console.log("✅ Bundle restored successfully");
  } catch (err) {
    console.error(
      `❌ Failed to restore: ${err instanceof Error ? err.message : err}`
    );
    process.exit(1);
  }
}

async function handleInit(args: { verbose: boolean }) {
  const opencodeDir = join(process.cwd(), ".opencode");
  const configPath = join(opencodeDir, "opencode-sync.jsonc");
  const workflowDir = join(process.cwd(), ".github", "workflows");
  const workflowPath = join(workflowDir, "opencode-agent.yml");

  if (!existsSync(opencodeDir)) {
    if (args.verbose) console.log("Creating .opencode directory...");
    mkdirSync(opencodeDir, { recursive: true });
  }

  if (!existsSync(configPath) && !existsSync(join(opencodeDir, "opencode-sync.json"))) {
    const configContent = `/**
 * OpenCode Sync Configuration
 * 
 * This file controls what local OpenCode data is synced to GitHub Secrets
 * for use in GitHub Copilot Agents and CI workflows.
 * 
 * Run 'opencode-sync sync' to apply changes.
 */
{
  "defaults": {
    "environment": "copilot", // The GitHub environment to sync secrets to
    "secretName": "OPENCODE_AUTH_BUNDLE", // The secret name (matches action input)
    "sync": {
      "auth": {
        "presets": ["antigravity", "auth"] // Standard presets
        // "credentials": true // Uncomment if you use API keys in credentials.json
      },
      "agents": true, // Sync .opencode/agent/*.md
      "skills": true, // Sync .opencode/skill/*/SKILL.md
      "commands": true, // Sync .opencode/command/*.md
      
      "config": {
        // "mode": "full", // Sync your entire local opencode.jsonc
        "mode": "merge", // Recommended: Merge specific settings into the default
        
        // Override the model for headless execution (e.g. use Flash for speed/cost)
        "model": "google/antigravity-gemini-3-flash",
        
        // Ensure specific plugins are loaded
        "plugins": [
          "opencode-antigravity-auth@1.2.8",
          "@opencode-ai/github" // Required for GitHub issue management
        ],
        
        // Merge provider configs (e.g. API keys for Google)
        "providers": {
          "google": true
        }
      }
    }
  },
  "targets": {
    "default": {
      // REPLACE THIS with your repository name
      "repo": "owner/repo-name",
      
      // Override defaults for this target if needed
      "sync": {}
    }
  }
}
`;

    await Bun.write(configPath, configContent);
    console.log("✅ Created config: .opencode/opencode-sync.jsonc");
  } else {
    console.log("ℹ️  Config already exists in .opencode/");
  }

  if (!existsSync(workflowPath)) {
    if (args.verbose) console.log("Creating workflow directory...");
    mkdirSync(workflowDir, { recursive: true });

    const workflowContent = `# minimal opencode agent setup
name: OpenCode Agent
on: workflow_dispatch

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  agent:
    runs-on: ubuntu-latest
    environment: copilot  # Required for secret access
    steps:
      - uses: actions/checkout@v4
      
      - uses: oven-sh/setup-bun@v1

      # Install opencode and restore auth in one step
      - name: Restore OpenCode Identity
        uses: ./  # Uses the action in the repo root (if running inside this repo)
                  # In real usage: uses: rothnic/opencode-sync@v1
        with:
          bundle: \${{ secrets.OPENCODE_AUTH_BUNDLE }}
      
      - name: Inspect Environment (Debug)
        run: |
          echo "✅ OpenCode Identity Restored"
          echo "📂 Config Location: ~/.config/opencode/opencode.jsonc"
          if [ -f ~/.config/opencode/opencode.jsonc ]; then
            grep -C 2 "model" ~/.config/opencode/opencode.jsonc || echo "Model not found in config"
          else
            echo "❌ Config file missing"
          fi
          
      - name: Check GitHub Auth
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: gh auth status

      - name: Configure Git Identity
        run: |
          git config --global user.name "OpenCode Agent"
          git config --global user.email "agent@opencode.ai"

      # Now opencode is ready to use!
      - name: Run OpenCode Issue Manager
        timeout-minutes: 30
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: opencode run --command "manage-issues"
`;
    await Bun.write(workflowPath, workflowContent);
    console.log(`✅ Created workflow: .github/workflows/opencode-agent.yml`);
  } else {
    console.log(
      `ℹ️  Workflow already exists: .github/workflows/opencode-agent.yml`
    );
  }

  console.log("\nNext steps:");
  console.log("1. Edit .opencode/opencode-sync.jsonc with your repo details");
  console.log("2. Run 'opencode-sync sync default' to push your auth");
}

async function handleList(args: { config?: string }) {
  const configPath = findConfigFile(process.cwd(), args.config);

  if (!configPath) {
    console.error("❌ No config file found");
    process.exit(1);
  }

  const config = await loadConfig(configPath);
  const targets = resolveAllTargets(config);

  if (targets.length === 0) {
    console.log("No targets configured");
    return;
  }

  console.log("TARGETS:\n");
  for (const target of targets) {
    console.log(`  ${target.name}`);
    console.log(`    Repo:        ${target.repo}`);
    console.log(`    Environment: ${target.environment}`);
    console.log(`    Secret:      ${target.secretName}`);
    console.log(`    Config mode: ${target.sync.config.mode}`);
    if (target.sync.config.model) {
      console.log(`    Model override: ${target.sync.config.model}`);
    }
    console.log(
      `    Auth files:  ${
        Object.entries(target.sync.auth)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(", ") || "none"
      }`
    );
    console.log();
  }
}

async function handleCheck(args: { verbose: boolean }) {
  const paths = getOpenCodePaths();
  const files = [
    { name: "antigravity-accounts.json", path: paths.antigravityAccounts },
    { name: "auth.json", path: paths.auth },
    { name: "credentials.json", path: paths.credentials },
    { name: "opencode.jsonc", path: paths.opencodeConfig },
  ];

  console.log("OpenCode Auth Files:\n");

  let allPresent = true;
  for (const file of files) {
    const exists = existsSync(file.path);
    const symbol = exists ? "✅" : "❌";
    console.log(`  ${symbol} ${file.name}`);
    if (args.verbose) {
      console.log(`     ${file.path}`);
    }
    if (!exists && file.name !== "credentials.json") {
      allPresent = false;
    }
  }

  console.log();
  if (!allPresent) {
    console.log(
      "⚠️  Some auth files are missing. Run 'opencode auth google' to authenticate."
    );
  } else {
    console.log("✅ All required auth files present");
  }
}

async function handleInstall(args: {
  workflows: boolean;
  commands: boolean;
  all: boolean;
  verbose: boolean;
}) {
  const installWorkflows = args.all || args.workflows;
  const installCommands = args.all || args.commands;

  if (!installWorkflows && !installCommands) {
    console.log("Usage: opencode-sync install [--workflows] [--commands] [--all]");
    console.log("");
    console.log("Options:");
    console.log("  -w, --workflows  Install GitHub workflow files");
    console.log("  -c, --commands   Install OpenCode command files");
    console.log("  -a, --all        Install everything");
    process.exit(0);
  }

  const packageRoot = new URL(".", import.meta.url).pathname.replace("/src/", "");
  const targetDir = process.cwd();
  
  let installed = 0;

  if (installCommands) {
    const commandDir = join(targetDir, ".opencode", "command");
    if (!existsSync(commandDir)) {
      mkdirSync(commandDir, { recursive: true });
    }

    const commands = [
      "project-review.md",
      "issue-triage.md",
      "issue-discover.md",
      "issue-organize.md",
      "mention-handler.md",
      "manage-issues.md",
    ];

    for (const cmd of commands) {
      const sourcePath = join(packageRoot, ".opencode", "command", cmd);
      const targetPath = join(commandDir, cmd);

      if (existsSync(sourcePath)) {
        if (existsSync(targetPath)) {
          if (args.verbose) console.log(`  ⏭️  Skipping ${cmd} (already exists)`);
        } else {
          const content = await Bun.file(sourcePath).text();
          await Bun.write(targetPath, content);
          console.log(`  ✅ Installed command: ${cmd}`);
          installed++;
        }
      } else if (args.verbose) {
        console.log(`  ⚠️  Source not found: ${sourcePath}`);
      }
    }
  }

  if (installWorkflows) {
    const workflowDir = join(targetDir, ".github", "workflows");
    if (!existsSync(workflowDir)) {
      mkdirSync(workflowDir, { recursive: true });
    }

    const workflows = [
      { source: "opencode-agent.yml", target: "opencode-agent.yml" },
      { source: "opencode-mention.yml", target: "opencode-mention.yml" },
      { source: "copilot-setup-steps.yml", target: "copilot-setup-steps.yml" },
    ];

    for (const wf of workflows) {
      const sourcePath = join(packageRoot, "examples", wf.source);
      const targetPath = join(workflowDir, wf.target);

      if (existsSync(sourcePath)) {
        if (existsSync(targetPath)) {
          if (args.verbose) console.log(`  ⏭️  Skipping ${wf.target} (already exists)`);
        } else {
          const content = await Bun.file(sourcePath).text();
          await Bun.write(targetPath, content);
          console.log(`  ✅ Installed workflow: ${wf.target}`);
          installed++;
        }
      } else if (args.verbose) {
        console.log(`  ⚠️  Source not found: ${sourcePath}`);
      }
    }
  }

  console.log(`\n📦 Installed ${installed} file(s)`);

  if (installed > 0) {
    console.log("\nNext steps:");
    console.log("1. Review the installed files and customize as needed");
    console.log("2. Run 'opencode-sync sync' to push your auth to GitHub");
    console.log("3. Trigger workflows via GitHub Actions or @opencode mentions");
  }
}


const result = await run(app, {
  programName: "opencode-sync",
  version: VERSION,
  description: message`Sync OpenCode config/auth to GitHub secrets`,
  help: "both",
});

switch (result.kind) {
  case "sync":
    await handleSync(result);
    break;
  case "restore":
    await handleRestore(result);
    break;
  case "init":
    await handleInit(result);
    break;
  case "list":
    await handleList(result);
    break;
  case "check":
    await handleCheck(result);
    break;
  case "install":
    await handleInstall(result);
    break;
}
