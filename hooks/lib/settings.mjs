/**
 * The one writer for `env` keys in a Claude Code `settings.json`.
 *
 * Both `login` (FALDA_MCP_URL/FALDA_TOKEN/FALDA_TENANT, user settings) and
 * `pool` (FALDA_POOL, project settings) edit a file the user also edits by
 * hand, so the same discipline applies to both: refuse to touch a file we
 * cannot parse, back it up before changing it, write atomically, keep the
 * result 0600, and preserve every key we were not asked about.
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  openSync,
  closeSync,
  renameSync,
  realpathSync,
  accessSync,
  constants,
} from "node:fs";
import { join } from "node:path";

/** Parse settingsPath's existing content, or throw a message naming the path. Caller checks existence first. */
export function parseSettingsFileOrThrow(settingsPath) {
  const raw = readFileSync(settingsPath, "utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${settingsPath} is not valid JSON (${err.message}) — fix it and re-run`);
  }
}

/**
 * Pre-flight check, run before an irreversible step (the login's one-time
 * authorization code exchange): fail fast on a broken or unwritable
 * settings target rather than burn the code and only then discover the
 * write can't happen.
 */
export function assertSettingsWritable(settingsPath) {
  if (existsSync(settingsPath)) parseSettingsFileOrThrow(settingsPath);
  const dir = join(settingsPath, "..");
  mkdirSync(dir, { recursive: true });
  accessSync(dir, constants.W_OK);
}

/**
 * Copy the file aside before it is replaced, and return the backup's path.
 *
 * The backup is created already restricted to 0600 via an exclusive open —
 * copyFileSync followed by a later chmodSync would leave it briefly
 * world-readable under the process umask. The exclusive open also means
 * two writes in the same millisecond (bind then clear, say) collide
 * instead of one silently overwriting the other's backup, so the name
 * gains a counter rather than the second write failing.
 */
function backup(settingsPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (let n = 0; n < 100; n++) {
    const backupPath = `${settingsPath}.bak-${stamp}${n ? `-${n}` : ""}`;
    let fd;
    try {
      fd = openSync(backupPath, "wx", 0o600);
    } catch (err) {
      if (err.code === "EEXIST") continue;
      throw err;
    }
    try { writeFileSync(fd, readFileSync(settingsPath)); } finally { closeSync(fd); }
    return backupPath;
  }
  throw new Error(`could not create a backup of ${settingsPath} — too many backups with the same timestamp`);
}

/**
 * Apply `patch` to `doc.env` in the settings file at `settingsPath`: a
 * string value sets the key, `null` deletes it. Returns the backup path
 * when an existing file was replaced.
 */
export function writeSettingsEnv(settingsPath, patch) {
  const exists = existsSync(settingsPath);
  const doc = exists ? parseSettingsFileOrThrow(settingsPath) : {};
  const backupPath = exists ? backup(settingsPath) : undefined;
  const env = { ...(doc.env ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete env[k];
    else env[k] = v;
  }
  doc.env = env;
  const dir = join(settingsPath, "..");
  mkdirSync(dir, { recursive: true });
  // Atomic write: write the new content to a temp file, then rename onto
  // the real target. Renaming onto realpathSync(settingsPath) — rather
  // than settingsPath itself — preserves symlink behaviour: a symlinked
  // settings file keeps pointing at the same real file instead of being
  // replaced by a plain file at the symlink's location.
  const target = exists ? realpathSync(settingsPath) : settingsPath;
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\n", { mode: 0o600 });
  try {
    renameSync(tmp, target);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
  return { backupPath };
}
