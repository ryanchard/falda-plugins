/**
 * Tool-payload serialization and size policy.
 *
 * Pure and dependency-free so the size policy is testable without spawning
 * a hook process or a server. See docs/future/tool-output-capture.md §2.
 */

/** Verbatim ceiling for a tool result before head+tail truncation. */
export const DEFAULT_TOOL_MAX_CHARS = 16384;

/** Ceiling for the echoed tool_input. A Write call's `content` argument can
 *  be arbitrarily large and is already visible in the resulting file, so the
 *  echo exists for provenance, not fidelity. */
export const TOOL_INPUT_MAX_CHARS = 1024;

/** Fraction of the budget kept from the head. Headers, schemas and commands
 *  sit at the top; results, errors and exit status sit at the bottom. */
const HEAD_FRACTION = 0.75;

/** Render any tool payload as text. Most tools return an object
 *  ({stdout, stderr, interrupted} for Bash), so a bare String() would yield
 *  "[object Object]" and silently discard the output. */
export function stringifyPayload(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    // Circular or otherwise unserializable — never throw inside a hook.
    return String(value);
  }
}

/**
 * Head+tail truncation with an explicit elision marker.
 *
 * The marker is load-bearing, not cosmetic: it tells distillation the row is
 * partial, so the extraction LLM does not state a confident fact drawn from a
 * severed table. `maxChars` governs RETAINED PAYLOAD; the marker is overhead
 * on top of it, so the returned string is slightly longer than the budget.
 */
export function truncateMiddle(text, maxChars) {
  if (typeof text !== "string") return "";
  if (!(maxChars > 0) || text.length <= maxChars) return text;
  const head = Math.floor(maxChars * HEAD_FRACTION);
  const tail = maxChars - head;
  const elided = text.length - head - tail;
  return `${text.slice(0, head)}\n…[${elided} chars elided]…\n${text.slice(text.length - tail)}`;
}

/** Resolve the verbatim ceiling, ignoring junk and non-positive overrides. */
export function toolMaxChars(env = process.env) {
  const raw = Number(env.FALDA_CAPTURE_TOOL_MAX_CHARS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TOOL_MAX_CHARS;
}
