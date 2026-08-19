export const DEFAULT_TOOL_MAX_CHARS: number;

export const TOOL_INPUT_MAX_CHARS: number;

export function stringifyPayload(value: unknown): string;

export function truncateMiddle(
  text: string,
  maxChars: number,
): string;

export function toolMaxChars(
  env?: Record<string, string | undefined>,
): number;
