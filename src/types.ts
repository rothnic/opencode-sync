/**
 * @file types.ts
 * @description Type definitions for opencode-sync configuration and operations
 */

export type {
  AuthSync,
  ConfigSync,
  SyncSpec,
  TargetConfig,
  SyncConfig,
  ResolvedTarget,
  BundleManifest,
} from "./schema.js";

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
