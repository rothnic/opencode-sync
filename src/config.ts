/**
 * @file config.ts
 * @description Config file discovery and loading with global + per-project support
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { SyncConfig, ResolvedTarget, SyncSpec, AuthSync, ConfigSync } from "./types.js";

/** Config file name */
const CONFIG_FILENAME = "opencode-sync.json";

/** Default values */
const DEFAULTS = {
  environment: "copilot",
  secretName: "OPENCODE_AUTH_BUNDLE",
  auth: {
    "antigravity-accounts": true,
    auth: true,
    credentials: false,
  } satisfies AuthSync,
  config: {
    mode: "none",
  } satisfies ConfigSync,
};

/**
 * Possible config file locations in priority order (highest first)
 */
export function getConfigSearchPaths(cwd: string = process.cwd()): string[] {
  const home = homedir();
  return [
    // Per-project (highest priority)
    join(cwd, CONFIG_FILENAME),
    join(cwd, ".opencode", CONFIG_FILENAME),
    join(cwd, ".config", CONFIG_FILENAME),
    // Global (lower priority)
    join(home, ".config", "opencode-sync", CONFIG_FILENAME),
    join(home, ".config", "opencode", CONFIG_FILENAME.replace(".json", ".json")),
    join(home, CONFIG_FILENAME),
  ];
}

/**
 * Find the first existing config file
 */
export function findConfigFile(cwd?: string, explicitPath?: string): string | null {
  if (explicitPath) {
    const resolved = resolve(explicitPath);
    return existsSync(resolved) ? resolved : null;
  }

  for (const path of getConfigSearchPaths(cwd)) {
    if (existsSync(path)) {
      return path;
    }
  }
  return null;
}

/**
 * Load and parse config file
 */
export async function loadConfig(path: string): Promise<SyncConfig> {
  return Bun.file(path).json();
}

/**
 * Merge sync specs with defaults
 */
function mergeSyncSpec(spec: SyncSpec | undefined, defaults: SyncSpec | undefined): Required<SyncSpec> {
  const mergedAuth: AuthSync = {
    ...DEFAULTS.auth,
    ...defaults?.auth,
    ...spec?.auth,
  };

  const mergedConfig: ConfigSync = {
    ...DEFAULTS.config,
    ...defaults?.config,
    ...spec?.config,
  };

  return {
    auth: mergedAuth,
    config: mergedConfig,
  };
}

/**
 * Resolve a target with all defaults applied
 */
export function resolveTarget(
  name: string,
  config: SyncConfig
): ResolvedTarget | null {
  const target = config.targets[name];
  if (!target) return null;

  const defaults = config.defaults;

  return {
    name,
    repo: target.repo,
    environment: target.environment ?? defaults?.environment ?? DEFAULTS.environment,
    secretName: target.secretName ?? defaults?.secretName ?? DEFAULTS.secretName,
    sync: mergeSyncSpec(target.sync, defaults?.sync),
  };
}

/**
 * Get all resolved targets from config
 */
export function resolveAllTargets(config: SyncConfig): ResolvedTarget[] {
  return Object.keys(config.targets)
    .map((name) => resolveTarget(name, config))
    .filter((t): t is ResolvedTarget => t !== null);
}

/**
 * OpenCode paths on the local machine
 */
export function getOpenCodePaths() {
  const home = homedir();
  return {
    configDir: join(home, ".config", "opencode"),
    dataDir: join(home, ".local", "share", "opencode"),
    antigravityAccounts: join(home, ".config", "opencode", "antigravity-accounts.json"),
    auth: join(home, ".local", "share", "opencode", "auth.json"),
    credentials: join(home, ".config", "opencode", "credentials.json"),
    opencodeConfig: join(home, ".config", "opencode", "opencode.jsonc"),
  };
}
