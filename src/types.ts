/**
 * @file types.ts
 * @description Type definitions for opencode-sync configuration and operations
 */

/** Which auth files to include in the sync bundle */
export interface AuthSync {
  /** Include ~/.config/opencode/antigravity-accounts.json */
  "antigravity-accounts"?: boolean;
  /** Include ~/.local/share/opencode/auth.json */
  auth?: boolean;
  /** Include ~/.config/opencode/credentials.json (legacy) */
  credentials?: boolean;
}

/** How to handle the opencode.jsonc configuration */
export interface ConfigSync {
  /**
   * Sync mode:
   * - "full": Use entire local opencode.jsonc
   * - "merge": Merge specified pieces into target's existing config
   * - "none": Don't sync config, only auth
   */
  mode: "full" | "merge" | "none";

  /**
   * Plugins to include (only used when mode is "merge")
   * These will be merged into the target's plugin array
   */
  plugins?: string[];

  /**
   * Provider blocks to sync (only used when mode is "merge")
   * Key is provider name, value is true to sync entire block
   * or an object with specific keys to sync
   */
  providers?: Record<string, boolean | Record<string, unknown>>;

  /** Model to set (only used when mode is "merge") */
  model?: string;

  /** Additional config keys to merge */
  extra?: Record<string, unknown>;
}

/** Configuration for what to sync to a target */
export interface SyncSpec {
  config?: ConfigSync;
  auth?: AuthSync;
}

/** Target repository configuration */
export interface TargetConfig {
  /** GitHub repo in owner/repo format */
  repo: string;

  /** GitHub environment name (default: "copilot") */
  environment?: string;

  /** Secret name for the bundle (default: "OPENCODE_AUTH_BUNDLE") */
  secretName?: string;

  /** What to sync to this target */
  sync: SyncSpec;
}

/** Root configuration file schema */
export interface SyncConfig {
  /** Named targets for syncing */
  targets: Record<string, TargetConfig>;

  /** Default values applied to all targets */
  defaults?: {
    environment?: string;
    secretName?: string;
    sync?: SyncSpec;
  };
}

/** Resolved target with all defaults applied */
export interface ResolvedTarget {
  name: string;
  repo: string;
  environment: string;
  secretName: string;
  sync: Required<SyncSpec>;
}

/** Bundle manifest for restore operations */
export interface BundleManifest {
  version: string;
  created: string;
  target: string;
  files: Array<{
    path: string;
    relativeTo: "config" | "data";
  }>;
  configMode: "full" | "merge" | "none";
}

/** CLI command options */
export interface SyncOptions {
  target?: string;
  dryRun?: boolean;
  verbose?: boolean;
  configPath?: string;
}

export interface RestoreOptions {
  bundlePath?: string;
  fromEnv?: string;
  verbose?: boolean;
}
