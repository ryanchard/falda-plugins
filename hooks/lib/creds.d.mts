export interface McpCredentials {
  mcpUrl: string;
  token: string;
  tenant: string;
  /** The bound Globus group UUID (FALDA_POOL), when this project has one. */
  pool?: string;
  /** FALDA_RECALL_SCOPE: "all" | "pool" | "self", when set. */
  recallScope?: string;
}

export interface HookFeatures {
  capture: boolean;
  autoRecall: boolean;
  distillOnCompact: boolean;
  recallOnCompact: boolean;
}

export function resolveCreds(
  env?: Record<string, string | undefined>,
): McpCredentials | null;

export function features(
  env?: Record<string, string | undefined>,
): HookFeatures;
