/**
 * @file bundle.ts
 * @description Create tar.gz bundles of auth files and config for transport
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { homedir, tmpdir } from "node:os";
import type { ResolvedTarget, BundleManifest } from "./types.js";
import { getOpenCodePaths } from "./config.js";
import { buildMergedConfig } from "./merge.js";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

interface BundleFile {
  sourcePath: string;
  targetPath: string;
  relativeTo: "config" | "data";
}

export async function collectBundleFiles(
  target: ResolvedTarget
): Promise<BundleFile[]> {
  const paths = getOpenCodePaths();
  const files: BundleFile[] = [];
  const authSpec = target.sync.auth;

  if (authSpec["antigravity-accounts"]) {
    if (existsSync(paths.antigravityAccounts)) {
      files.push({
        sourcePath: paths.antigravityAccounts,
        targetPath: "antigravity-accounts.json",
        relativeTo: "config",
      });
    }
  }

  if (authSpec.auth) {
    if (existsSync(paths.auth)) {
      files.push({
        sourcePath: paths.auth,
        targetPath: "auth.json",
        relativeTo: "data",
      });
    }
  }

  if (authSpec.credentials) {
    if (existsSync(paths.credentials)) {
      files.push({
        sourcePath: paths.credentials,
        targetPath: "credentials.json",
        relativeTo: "config",
      });
    }
  }

  return files;
}

export async function buildBundleConfig(
  target: ResolvedTarget
): Promise<JsonObject | null> {
  const paths = getOpenCodePaths();
  const configSpec = target.sync.config;

  if (configSpec.mode === "none") {
    return null;
  }

  // Load source config
  let sourceConfig: JsonObject = {};
  if (existsSync(paths.opencodeConfig)) {
    try {
      sourceConfig = await Bun.file(paths.opencodeConfig).json() as JsonObject;
    } catch (e) {
      console.warn(`Warning: Failed to parse ${paths.opencodeConfig}, proceeding with empty config.`);
    }
  }

  return buildMergedConfig(sourceConfig, null, configSpec);
}

export async function createBundleDirectory(
  target: ResolvedTarget,
  verbose = false
): Promise<{ dir: string; manifest: BundleManifest }> {
  const bundleDir = join(tmpdir(), `opencode-sync-${Date.now()}`);
  mkdirSync(bundleDir, { recursive: true });

  const configDir = join(bundleDir, "config", "opencode");
  const dataDir = join(bundleDir, "data", "opencode");
  mkdirSync(configDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });

  const files = await collectBundleFiles(target);
  const manifestFiles: BundleManifest["files"] = [];

  for (const file of files) {
    const destDir = file.relativeTo === "config" ? configDir : dataDir;
    const destPath = join(destDir, file.targetPath);
    
    if (verbose) {
      console.log(`  📄 ${file.sourcePath} -> ${relative(bundleDir, destPath)}`);
    }

    await Bun.write(destPath, Bun.file(file.sourcePath));
    manifestFiles.push({
      path: file.targetPath,
      relativeTo: file.relativeTo,
    });
  }

  const config = await buildBundleConfig(target);
  if (config) {
    const configPath = join(configDir, "opencode.jsonc");
    if (verbose) {
      console.log(`  📄 [generated] -> config/opencode/opencode.jsonc`);
    }
    await Bun.write(configPath, JSON.stringify(config, null, 2));
    manifestFiles.push({
      path: "opencode.jsonc",
      relativeTo: "config",
    });
  }

  const manifest: BundleManifest = {
    version: "1.0.0",
    created: new Date().toISOString(),
    target: target.name,
    files: manifestFiles,
    configMode: target.sync.config.mode,
  };

  await Bun.write(
    join(bundleDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  return { dir: bundleDir, manifest };
}

export async function createTarball(bundleDir: string): Promise<Uint8Array> {
  const proc = Bun.spawn(["tar", "-czf", "-", "-C", bundleDir, "."], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).arrayBuffer();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`tar failed: ${stderr}`);
  }

  return new Uint8Array(output);
}

export async function createBundle(
  target: ResolvedTarget,
  verbose = false
): Promise<{ base64: string; manifest: BundleManifest }> {
  if (verbose) {
    console.log(`\n📦 Creating bundle for target: ${target.name}`);
  }

  const { dir, manifest } = await createBundleDirectory(target, verbose);

  try {
    const tarball = await createTarball(dir);
    const base64 = Buffer.from(tarball).toString("base64");

    if (verbose) {
      console.log(`  ✅ Bundle size: ${(tarball.length / 1024).toFixed(1)} KB`);
      console.log(`  ✅ Base64 size: ${(base64.length / 1024).toFixed(1)} KB`);
    }

    return { base64, manifest };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function restoreBundle(
  base64: string,
  verbose = false
): Promise<void> {
  const home = homedir();
  const configDir = join(home, ".config", "opencode");
  const dataDir = join(home, ".local", "share", "opencode");

  mkdirSync(configDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });

  const tarball = Buffer.from(base64, "base64");
  const tmpDir = join(tmpdir(), `opencode-restore-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  try {
    const tarPath = join(tmpDir, "bundle.tar.gz");
    await Bun.write(tarPath, tarball);

    const proc = Bun.spawn(["tar", "-xzf", tarPath, "-C", tmpDir], {
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`tar extract failed`);
    }

    const manifestPath = join(tmpDir, "manifest.json");
    if (!existsSync(manifestPath)) {
      throw new Error("Invalid bundle: missing manifest.json");
    }
    const manifest: BundleManifest = await Bun.file(manifestPath).json();

    if (verbose) {
      console.log(`\n📦 Restoring bundle (created: ${manifest.created})`);
    }

    for (const file of manifest.files) {
      const srcDir = file.relativeTo === "config"
        ? join(tmpDir, "config", "opencode")
        : join(tmpDir, "data", "opencode");
      const destDir = file.relativeTo === "config" ? configDir : dataDir;
      const srcPath = join(srcDir, file.path);
      const destPath = join(destDir, file.path);

      if (existsSync(srcPath)) {
        if (verbose) {
          console.log(`  📄 ${file.path} -> ${destPath}`);
        }
        await Bun.write(destPath, Bun.file(srcPath));
      }
    }

    if (verbose) {
      console.log(`  ✅ Restored ${manifest.files.length} files`);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
