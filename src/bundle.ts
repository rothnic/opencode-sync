import { existsSync, mkdirSync, rmSync, readdirSync, statSync, cpSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import type { ResolvedTarget, BundleManifest, JsonValue, JsonObject } from "./types.js";
import { getOpenCodePaths, getProjectPaths } from "./config.js";
import { buildMergedConfig } from "./merge.js";
import { getPreset, type Preset } from "./presets.js";

interface BundleFile {
  sourcePath: string;
  targetPath: string;
  relativeTo: "config" | "data" | "root";
}

function collectMarkdownFiles(
  sourceDir: string,
  targetDir: string,
  relativeTo: "config" | "data" = "config"
): BundleFile[] {
  if (!existsSync(sourceDir)) return [];
  
  return readdirSync(sourceDir)
    .filter(f => f.endsWith(".md"))
    .map(file => ({
      sourcePath: join(sourceDir, file),
      targetPath: join(targetDir, file),
      relativeTo
    }));
}

export async function collectBundleFiles(
  target: ResolvedTarget
): Promise<BundleFile[]> {
  const paths = getOpenCodePaths();
  const projectPaths = getProjectPaths();
  const files: BundleFile[] = [];
  const authSpec = target.sync.auth;
  
  // 1. Collect Presets
  const presetsToLoad = new Set<string>();
  
  if (authSpec?.presets) {
    for (const p of authSpec.presets) presetsToLoad.add(p);
  }

  // Legacy mappings
  if (authSpec?.["antigravity-accounts"]) presetsToLoad.add("antigravity");
  if (authSpec?.auth) presetsToLoad.add("auth");
  if (authSpec?.credentials) presetsToLoad.add("credentials");

  // Process Presets
  for (const presetName of presetsToLoad) {
    const preset = getPreset(presetName);
    if (!preset) {
      console.warn(`Warning: Unknown preset '${presetName}'`);
      continue;
    }

    for (const file of preset.files) {
      // Determine source root based on file type
      const sourceRoot = file.type === "config" ? paths.configDir : paths.dataDir;
      const sourcePath = join(sourceRoot, file.path);

      if (existsSync(sourcePath)) {
        files.push({
          sourcePath,
          targetPath: file.path, // Use same relative path in bundle
          relativeTo: file.type,
        });
      }
    }
  }

  // 2. Agents
  if (target.sync.agents) {
    files.push(...collectMarkdownFiles(projectPaths.agentDir, "agent"));
  }

  // 3. Skills (nested directory structure)
  if (target.sync.skills) {
    if (existsSync(projectPaths.skillDir)) {
      const skills = readdirSync(projectPaths.skillDir);
      for (const skill of skills) {
        const skillPath = join(projectPaths.skillDir, skill);
        if (statSync(skillPath).isDirectory()) {
          const skillFile = join(skillPath, "SKILL.md");
          if (existsSync(skillFile)) {
            files.push({
              sourcePath: skillFile,
              targetPath: join("skill", skill, "SKILL.md"),
              relativeTo: "config"
            });
          }
        }
      }
    }
  }

  // 4. Commands
  if (target.sync.commands) {
    files.push(...collectMarkdownFiles(projectPaths.commandDir, "command"));
  }

  // 5. Full Directories
  if (target.sync.opencodeConfigDir) {
    if (existsSync(paths.configDir)) {
      files.push({
        sourcePath: paths.configDir,
        targetPath: ".",
        relativeTo: "config" 
      });
    }
  }

  if (target.sync.opencodeDataDir) {
    if (existsSync(paths.dataDir)) {
      files.push({
        sourcePath: paths.dataDir,
        targetPath: ".",
        relativeTo: "data"
      });
    }
  }

  // 6. Generic Includes
  if (target.sync.include) {
    for (const item of target.sync.include) {
      if (typeof item === 'string') {
        const source = resolve(process.cwd(), item);
        if (existsSync(source)) {
          files.push({
            sourcePath: source,
            targetPath: item,
            relativeTo: "data" 
          });
        }
      } else {
        const source = resolve(process.cwd(), item.source);
        if (existsSync(source)) {
          files.push({
            sourcePath: source,
            targetPath: item.dest,
            relativeTo: "data"
          });
        }
      }
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

      mkdirSync(dirname(destPath), { recursive: true });

      if (existsSync(srcPath)) {
        if (verbose) {
          console.log(`  📄 ${file.path} -> ${destPath}`);
        }
        cpSync(srcPath, destPath, { recursive: true, force: true });
      }
    }

    if (verbose) {
      console.log(`  ✅ Restored ${manifest.files.length} items`);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
