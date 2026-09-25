import type { McpCredentials } from "./creds.d.mts";

export interface Pool {
  id: string;
  name: string;
  role?: string;
  /** "group" | "legacy" today; left open so a new server kind is not a type error. */
  kind?: string;
  access?: string;
}

export function isPoolUuid(s: string): boolean;

export function listPools(creds: McpCredentials, f?: typeof fetch): Promise<Pool[]>;

export function resolvePool(arg: string, pools: Pool[]): { id: string; name: string };

export function writeProjectPool(
  settingsPath: string,
  uuid: string | null,
): { backupPath?: string; changed: boolean };
