/**
 * @file github.ts
 * @description GitHub secrets sync via gh CLI
 */

import type { ResolvedTarget } from "./types.js";

/**
 * Check if gh CLI is available and authenticated
 */
export async function checkGhCli(): Promise<{ ok: boolean; error?: string }> {
  try {
    const proc = Bun.spawn(["gh", "auth", "status"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return { ok: false, error: `gh CLI not authenticated: ${stderr}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "gh CLI not found. Install: https://cli.github.com" };
  }
}

/**
 * Check if repository exists and we have access
 */
export async function checkRepoAccess(repo: string): Promise<{ ok: boolean; error?: string }> {
  const proc = Bun.spawn(["gh", "repo", "view", repo, "--json", "name"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    return { ok: false, error: `Cannot access repo ${repo}: ${stderr}` };
  }
  return { ok: true };
}

/**
 * Check if environment exists (creates if not)
 */
export async function ensureEnvironment(
  repo: string,
  environment: string,
  verbose = false
): Promise<{ ok: boolean; created?: boolean; error?: string }> {
  // Check if environment exists
  const checkProc = Bun.spawn(
    ["gh", "api", `repos/${repo}/environments/${environment}`],
    { stdout: "pipe", stderr: "pipe" }
  );
  const checkExit = await checkProc.exited;

  if (checkExit === 0) {
    return { ok: true, created: false };
  }

  // Try to create environment
  if (verbose) {
    console.log(`  📁 Creating environment: ${environment}`);
  }

  const createProc = Bun.spawn(
    ["gh", "api", "-X", "PUT", `repos/${repo}/environments/${environment}`],
    { stdout: "pipe", stderr: "pipe" }
  );
  const createExit = await createProc.exited;

  if (createExit !== 0) {
    const stderr = await new Response(createProc.stderr).text();
    return { ok: false, error: `Failed to create environment: ${stderr}` };
  }

  return { ok: true, created: true };
}

/**
 * Set a secret in a repository environment
 */
export async function setEnvironmentSecret(
  repo: string,
  environment: string,
  secretName: string,
  secretValue: string,
  verbose = false
): Promise<{ ok: boolean; error?: string }> {
  if (verbose) {
    console.log(`  🔐 Setting secret: ${secretName} in ${repo}/${environment}`);
  }

  const proc = Bun.spawn(
    ["gh", "secret", "set", secretName, "--repo", repo, "--env", environment],
    {
      stdin: new TextEncoder().encode(secretValue),
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    return { ok: false, error: `Failed to set secret: ${stderr}` };
  }

  return { ok: true };
}

/**
 * Sync bundle to GitHub environment secret
 */
export async function syncToGitHub(
  target: ResolvedTarget,
  base64Bundle: string,
  options: { dryRun?: boolean; verbose?: boolean } = {}
): Promise<{ ok: boolean; error?: string }> {
  const { dryRun = false, verbose = false } = options;

  if (verbose) {
    console.log(`\n🔄 Syncing to GitHub: ${target.repo}`);
    console.log(`   Environment: ${target.environment}`);
    console.log(`   Secret: ${target.secretName}`);
  }

  if (dryRun) {
    console.log(`   ⏭️  [DRY RUN] Would set secret (${(base64Bundle.length / 1024).toFixed(1)} KB)`);
    return { ok: true };
  }

  // Check gh CLI
  const ghCheck = await checkGhCli();
  if (!ghCheck.ok) {
    return ghCheck;
  }

  // Check repo access
  const repoCheck = await checkRepoAccess(target.repo);
  if (!repoCheck.ok) {
    return repoCheck;
  }

  // Ensure environment exists
  const envCheck = await ensureEnvironment(target.repo, target.environment, verbose);
  if (!envCheck.ok) {
    return envCheck;
  }

  // Set secret
  const secretResult = await setEnvironmentSecret(
    target.repo,
    target.environment,
    target.secretName,
    base64Bundle,
    verbose
  );

  if (secretResult.ok && verbose) {
    console.log(`   ✅ Secret synced successfully`);
  }

  return secretResult;
}

/**
 * Sync to multiple targets
 */
export async function syncToTargets(
  targets: ResolvedTarget[],
  bundleCreator: (target: ResolvedTarget) => Promise<string>,
  options: { dryRun?: boolean; verbose?: boolean } = {}
): Promise<{ success: string[]; failed: Array<{ target: string; error: string }> }> {
  const success: string[] = [];
  const failed: Array<{ target: string; error: string }> = [];

  for (const target of targets) {
    try {
      const base64 = await bundleCreator(target);
      const result = await syncToGitHub(target, base64, options);

      if (result.ok) {
        success.push(target.name);
      } else {
        failed.push({ target: target.name, error: result.error ?? "Unknown error" });
      }
    } catch (err) {
      failed.push({
        target: target.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { success, failed };
}
