/**
 * @file merge.ts
 * @description Selective merging of OpenCode configuration pieces
 */

import type { ConfigSync, JsonValue, JsonObject } from "./types.js";

/**
 * Deep merge two objects, with source overwriting target
 */
function deepMerge(target: JsonObject, source: JsonObject): JsonObject {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];

    if (
      sourceVal !== null &&
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal as JsonObject, sourceVal as JsonObject);
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}

/**
 * Merge plugin arrays, deduplicating by base name
 */
function mergePlugins(existing: string[], toAdd: string[]): string[] {
  const getBaseName = (plugin: string) => plugin.split("@")[0];
  const result = [...existing];

  for (const plugin of toAdd) {
    const baseName = getBaseName(plugin);
    const existingIndex = result.findIndex((p) => getBaseName(p) === baseName);
    
    if (existingIndex >= 0) {
      // Replace with newer version
      result[existingIndex] = plugin;
    } else {
      result.push(plugin);
    }
  }

  return result;
}

/**
 * Build a merged config based on sync spec
 * 
 * @param sourceConfig - The local opencode.jsonc content
 * @param targetConfig - The target's existing config (if any)
 * @param syncSpec - What pieces to sync
 * @returns The merged config to write
 */
export function buildMergedConfig(
  sourceConfig: JsonObject,
  targetConfig: JsonObject | null,
  syncSpec: ConfigSync
): JsonObject | null {
  if (syncSpec.mode === "none") {
    return null;
  }

  if (syncSpec.mode === "full") {
    return sourceConfig;
  }

  // Mode is "merge"
  const base = targetConfig ?? {};
  let result = { ...base };

  // Merge plugins
  if (syncSpec.plugins && syncSpec.plugins.length > 0) {
    const existingPlugins = Array.isArray(result.plugin) ? (result.plugin as string[]) : [];
    result.plugin = mergePlugins(existingPlugins, syncSpec.plugins);
  }

  // Merge providers
  if (syncSpec.providers) {
    const existingProviders = (result.provider as JsonObject) ?? {};
    const sourceProviders = (sourceConfig.provider as JsonObject) ?? {};
    const mergedProviders = { ...existingProviders };

    for (const [providerName, providerSpec] of Object.entries(syncSpec.providers)) {
      if (providerSpec === true) {
        // Sync entire provider block from source
        const sourceProvider = sourceProviders[providerName];
        if (sourceProvider) {
          mergedProviders[providerName] = sourceProvider;
        }
      } else if (typeof providerSpec === "object" && providerSpec !== null) {
        // Merge specific keys
        const existingProvider = (existingProviders[providerName] as JsonObject) ?? {};
        const sourceProvider = (sourceProviders[providerName] as JsonObject) ?? {};
        mergedProviders[providerName] = deepMerge(
          existingProvider,
          deepMerge(sourceProvider, providerSpec as JsonObject)
        );
      }
    }

    result.provider = mergedProviders;
  }

  // Set model
  if (syncSpec.model) {
    result.model = syncSpec.model;
  }

  // Merge extra config
  if (syncSpec.extra) {
    result = deepMerge(result, syncSpec.extra as JsonObject);
  }

  return result;
}

/**
 * Extract just the specified provider blocks from a config
 */
export function extractProviders(
  config: JsonObject,
  providerNames: string[]
): JsonObject {
  const providers = (config.provider as JsonObject) ?? {};
  const result: JsonObject = {};

  for (const name of providerNames) {
    if (providers[name]) {
      result[name] = providers[name];
    }
  }

  return result;
}

/**
 * Validate that required auth files exist
 */
export function validateAuthFiles(
  paths: Record<string, string>,
  authSpec: Record<string, boolean | undefined>
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  const checks: Array<{ key: keyof typeof authSpec; path: string }> = [
    { key: "antigravity-accounts", path: paths.antigravityAccounts },
    { key: "auth", path: paths.auth },
    { key: "credentials", path: paths.credentials },
  ];

  for (const { key, path } of checks) {
    if (authSpec[key] && !Bun.file(path).size) {
      missing.push(path);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}
