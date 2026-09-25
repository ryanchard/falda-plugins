export const DEFAULT_CLIENT_ID: string;
export const DEFAULT_MCP_URL: string;

/** Re-exported from creds.mjs, where it now lives. */
export function apiBase(mcpUrl: string): string;

export function pickScopedToken(
  tok: { access_token?: string; scope?: string; other_tokens?: Array<{ access_token?: string; scope?: string }> } | undefined,
  serviceScope: string | undefined,
): string | undefined;

export function openBrowser(url: string): Promise<boolean>;

export interface AuthConfig {
  loginClientId?: string;
  serviceScope?: string;
}

export function fetchAuthConfig(
  mcpUrl: string,
  f?: typeof fetch,
): Promise<AuthConfig>;

export interface StartLoginOptions {
  /** MCP url; `/auth/config` is asked for the client id and scope one level up from it. */
  url?: string;
  clientId?: string;
  /** Overrides the server's `service_scope`. */
  scope?: string;
  env?: Record<string, string | undefined>;
  stateDir?: string;
  fetch?: typeof fetch;
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

export interface LoginGroup {
  id: string;
  name: string;
  role: string;
}

export interface FinishLoginResult {
  tenant: string;
  api_key: string;
  user?: string;
  created?: boolean;
  groups: LoginGroup[];
  groups_status?: string;
  settingsPath?: string;
  backupPath?: string;
}

export function finishLogin(
  code: string,
  opts?: FinishLoginOptions,
): Promise<FinishLoginResult>;
