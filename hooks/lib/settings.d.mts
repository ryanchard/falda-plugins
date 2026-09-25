export function parseSettingsFileOrThrow(settingsPath: string): Record<string, unknown>;

export function assertSettingsWritable(settingsPath: string): void;

/** `null` deletes the key; a string sets it. */
export function writeSettingsEnv(
  settingsPath: string,
  patch: Record<string, string | null>,
): { backupPath?: string };
