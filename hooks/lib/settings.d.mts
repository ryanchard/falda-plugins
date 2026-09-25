export function parseSettingsFileOrThrow(settingsPath: string): Record<string, unknown>;

export function assertSettingsWritable(settingsPath: string): void;

/**
 * `null` deletes the key; a string sets it. A delete-only patch against a
 * missing file writes nothing and reports `changed: false`.
 */
export function writeSettingsEnv(
  settingsPath: string,
  patch: Record<string, string | null>,
): { backupPath?: string; changed: boolean };
