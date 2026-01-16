/**
 * @file presets.ts
 * @description Pre-packaged configuration presets for common OpenCode setups
 */

export interface PresetFile {
  name: string;
  type: "config" | "data";
  path: string; // Relative to the type root (e.g. "antigravity-accounts.json")
}

export interface Preset {
  name: string;
  description: string;
  files: PresetFile[];
}

export const PRESETS: Record<string, Preset> = {
  "antigravity": {
    name: "antigravity",
    description: "Google Antigravity OAuth tokens",
    files: [
      { name: "antigravity-accounts.json", type: "config", path: "antigravity-accounts.json" }
    ]
  },
  "auth": {
    name: "auth",
    description: "Standard OpenCode session state",
    files: [
      { name: "auth.json", type: "data", path: "auth.json" }
    ]
  },
  "credentials": {
    name: "credentials",
    description: "Legacy credentials.json file",
    files: [
      { name: "credentials.json", type: "config", path: "credentials.json" }
    ]
  }
};

export function getPreset(name: string): Preset | undefined {
  return PRESETS[name];
}
