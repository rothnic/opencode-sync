import { z } from "zod";

export const AuthSyncSchema = z.object({
  "antigravity-accounts": z.boolean().default(true),
  auth: z.boolean().default(true),
  credentials: z.boolean().default(false),
  presets: z.array(z.string()).optional(),
});

export const AgentSyncSchema = z.boolean().default(true);
export const SkillSyncSchema = z.boolean().default(true);
export const CommandSyncSchema = z.boolean().default(true);

export const FileSyncSchema = z.union([
  z.string(),
  z.object({
    source: z.string(),
    dest: z.string(),
  })
]);

export const ConfigSyncSchema = z.object({
  mode: z.enum(["full", "merge", "none"]).default("none"),
  plugins: z.array(z.string()).optional(),
  providers: z.record(z.string(), z.union([z.boolean(), z.record(z.string(), z.unknown())])).optional(),
  model: z.string().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

export const SyncSpecSchema = z.object({
  config: ConfigSyncSchema.optional(),
  auth: AuthSyncSchema.optional(),
  agents: AgentSyncSchema.optional(),
  skills: SkillSyncSchema.optional(),
  commands: CommandSyncSchema.optional(),
  opencodeConfigDir: z.boolean().default(false),
  opencodeDataDir: z.boolean().default(false),
  include: z.array(FileSyncSchema).optional(),
});

export const TargetConfigSchema = z.object({
  repo: z.string().regex(/^[^/]+\/[^/]+$/, "Must be in owner/repo format"),
  environment: z.string().optional(),
  secretName: z.string().optional(),
  sync: SyncSpecSchema,
});

export const SyncConfigSchema = z.object({
  targets: z.record(z.string(), TargetConfigSchema),
  defaults: z.object({
    environment: z.string().optional(),
    secretName: z.string().optional(),
    sync: SyncSpecSchema.optional(),
  }).optional(),
});

export type AuthSync = z.infer<typeof AuthSyncSchema>;
export type ConfigSync = z.infer<typeof ConfigSyncSchema>;
export type SyncSpec = z.infer<typeof SyncSpecSchema>;
export type TargetConfig = z.infer<typeof TargetConfigSchema>;
export type SyncConfig = z.infer<typeof SyncConfigSchema>;

export interface ResolvedTarget {
  name: string;
  repo: string;
  environment: string;
  secretName: string;
  sync: {
    auth: z.infer<typeof AuthSyncSchema>;
    config: z.infer<typeof ConfigSyncSchema>;
    agents: boolean;
    skills: boolean;
    commands: boolean;
    opencodeConfigDir: boolean;
    opencodeDataDir: boolean;
    include?: Array<string | { source: string; dest: string }>;
  };
}

export interface BundleManifest {
  version: string;
  created: string;
  target: string;
  files: Array<{
    path: string;
    relativeTo: "config" | "data" | "root";
  }>;
  configMode: "full" | "merge" | "none";
}
