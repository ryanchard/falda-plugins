export const DEFAULT_CLIENT_ID: string;
export const DEFAULT_MCP_URL: string;

export function apiBase(mcpUrl: string): string;

export function openBrowser(url: string): Promise<boolean>;

export interface StartLoginOptions {
  clientId?: string;
  env?: Record<string, string | undefined>;
  stateDir?: string;
  open?: (url: string) => Promise<boolean>;
  now?: () => number;
}

export function startLogin(
  opts?: StartLoginOptions,
): Promise<{ url: string }>;

export interface WriteClaudeSettingsInput {
  url: string;
  token: string;
  tenant: string;
}

export function writeClaudeSettings(
  settingsPath: string,
  input: WriteClaudeSettingsInput,
): { backupPath?: string };

export interface FinishLoginOptions {
  url?: string;
  clientId?: string;
  env?: Record<string, string | undefined>;
  stateDir?: string;
  fetch?: typeof fetch;
  tokenUrl?: string;
  label?: string;
  settingsPath?: string;
  write?: boolean;
  now?: () => number;
}

export interface FinishLoginResult {
  tenant: string;
  api_key: string;
  settingsPath?: string;
  backupPath?: string;
}

export function finishLogin(
  code: string,
  opts?: FinishLoginOptions,
): Promise<FinishLoginResult>;
