#!/usr/bin/env bun
/**
 * @file index.ts
 * @description Main CLI entry point for opencode-sync
 * 
 * Usage:
 *   bunx github:user/opencode-sync sync [target]     - Sync to GitHub secrets
 *   bunx github:user/opencode-sync restore           - Restore bundle in CI
 *   bunx github:user/opencode-sync init              - Create example config
 *   bunx github:user/opencode-sync list              - List configured targets
 */

import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { findConfigFile, loadConfig, resolveTarget, resolveAllTargets, getOpenCodePaths } from "./config.js";
import { createBundle, restoreBundle } from "./bundle.js";
import { syncToGitHub, checkGhCli } from "./github.js";
import type { SyncConfig } from "./types.js";

const VERSION = "0.1.0";

const HELP = `
opencode-sync v${VERSION}

Sync OpenCode auth and config to GitHub secrets for headless/CI environments.

USAGE:
  opencode-sync <command> [options]

COMMANDS:
  sync [target]     Sync auth bundle to GitHub secrets
                    If no target specified, syncs all configured targets
  
  restore           Restore bundle from environment variable (for CI)
                    Reads from OPENCODE_AUTH_BUNDLE by default
  
  init              Create example opencode-sync.json config
  
  list              List configured targets and their settings
  
  check             Verify local auth files exist

OPTIONS:
  -c, --config      Path to config file (auto-discovered if not specified)
  -d, --dry-run     Show what would be synced without actually syncing
  -v, --verbose     Show detailed output
  -h, --help        Show this help
  --version         Show version

CONFIG FILE LOCATIONS (in priority order):
  1. ./opencode-sync.json
  2. ./.opencode/opencode-sync.json
  3. ./.config/opencode-sync.json
  4. ~/.config/opencode-sync/opencode-sync.json
  5. ~/.config/opencode/opencode-sync.json

EXAMPLES:
  # Sync all targets
  opencode-sync sync

  # Sync specific target
  opencode-sync sync my-project

  # Dry run to see what would happen
  opencode-sync sync --dry-run --verbose

  # Restore in CI (reads OPENCODE_AUTH_BUNDLE env var)
  opencode-sync restore

  # Create example config
  opencode-sync init
`;

const EXAMPLE_CONFIG: SyncConfig = {
  defaults: {
    environment: "copilot",
    secretName: "OPENCODE_AUTH_BUNDLE",
    sync: {
      auth: {
        "antigravity-accounts": true,
        auth: true,
        credentials: false,
      },
      config: {
        mode: "none",
      },
    },
  },
  targets: {
    "my-project": {
      repo: "myuser/my-project",
      sync: {
        config: {
          mode: "merge",
          plugins: ["opencode-antigravity-auth@1.2.8"],
          providers: {
            google: true,
          },
          model: "google/antigravity-gemini-3-flash",
        },
      },
    },
    "another-project": {
      repo: "myuser/another-project",
      sync: {
        config: {
          mode: "full",
        },
      },
    },
  },
};

async function cmdSync(args: string[], options: { config?: string; dryRun?: boolean; verbose?: boolean }) {
  const targetName = args[0];
  const configPath = findConfigFile(process.cwd(), options.config);

  if (!configPath) {
    console.error("❌ No config file found. Run 'opencode-sync init' to create one.");
    process.exit(1);
  }

  if (options.verbose) {
    console.log(`📋 Using config: ${configPath}`);
  }

  const config = await loadConfig(configPath);
  const targets = targetName
    ? [resolveTarget(targetName, config)].filter(Boolean)
    : resolveAllTargets(config);

  if (targets.length === 0) {
    console.error(targetName
      ? `❌ Target "${targetName}" not found in config`
      : "❌ No targets configured");
    process.exit(1);
  }

  if (!options.dryRun) {
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
      const { base64 } = await createBundle(target, options.verbose);
      const result = await syncToGitHub(target, base64, options);

      if (result.ok) {
        success++;
        if (!options.verbose) {
          console.log(`✅ ${target.name} -> ${target.repo}/${target.environment}`);
        }
      } else {
        failed++;
        console.error(`❌ ${target.name}: ${result.error}`);
      }
    } catch (err) {
      failed++;
      console.error(`❌ ${target.name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n📊 Synced ${success} target(s)${failed > 0 ? `, ${failed} failed` : ""}`);
  process.exit(failed > 0 ? 1 : 0);
}

async function cmdRestore(options: { envVar?: string; verbose?: boolean }) {
  const envVar = options.envVar ?? "OPENCODE_AUTH_BUNDLE";
  const bundle = process.env[envVar];

  if (!bundle) {
    console.error(`❌ Environment variable ${envVar} not set`);
    process.exit(1);
  }

  try {
    await restoreBundle(bundle, options.verbose);
    console.log("✅ Bundle restored successfully");
  } catch (err) {
    console.error(`❌ Failed to restore: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

async function cmdInit(options: { verbose?: boolean }) {
  const configPath = join(process.cwd(), "opencode-sync.json");

  if (existsSync(configPath)) {
    console.error("❌ opencode-sync.json already exists");
    process.exit(1);
  }

  await Bun.write(configPath, JSON.stringify(EXAMPLE_CONFIG, null, 2));
  console.log("✅ Created opencode-sync.json");
  console.log("\nEdit the file to configure your targets, then run:");
  console.log("  opencode-sync sync");
}

async function cmdList(options: { config?: string; verbose?: boolean }) {
  const configPath = findConfigFile(process.cwd(), options.config);

  if (!configPath) {
    console.error("❌ No config file found");
    process.exit(1);
  }

  console.log(`📋 Config: ${configPath}\n`);

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
    console.log(`    Auth files:  ${Object.entries(target.sync.auth)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ") || "none"}`);
    console.log();
  }
}

async function cmdCheck(options: { verbose?: boolean }) {
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
    if (options.verbose) {
      console.log(`     ${file.path}`);
    }
    if (!exists && file.name !== "credentials.json") {
      allPresent = false;
    }
  }

  console.log();
  if (!allPresent) {
    console.log("⚠️  Some auth files are missing. Run 'opencode auth google' to authenticate.");
  } else {
    console.log("✅ All required auth files present");
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      config: { type: "string", short: "c" },
      "dry-run": { type: "boolean", short: "d" },
      verbose: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
      "env-var": { type: "string", short: "e" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (values.version) {
    console.log(`opencode-sync v${VERSION}`);
    process.exit(0);
  }

  const command = positionals[0];
  const args = positionals.slice(1);

  switch (command) {
    case "sync":
      await cmdSync(args, {
        config: values.config,
        dryRun: values["dry-run"],
        verbose: values.verbose,
      });
      break;

    case "restore":
      await cmdRestore({
        envVar: values["env-var"],
        verbose: values.verbose,
      });
      break;

    case "init":
      await cmdInit({ verbose: values.verbose });
      break;

    case "list":
      await cmdList({
        config: values.config,
        verbose: values.verbose,
      });
      break;

    case "check":
      await cmdCheck({ verbose: values.verbose });
      break;

    default:
      if (command) {
        console.error(`Unknown command: ${command}`);
      }
      console.log(HELP);
      process.exit(command ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
