/**
 * Tiny file-backed JSON persistence layer used by the server-side stores
 * (bookings, audit log, notifications, lot ownership).
 *
 * ParkSmart's backend previously kept everything in process memory. Booking
 * verification state must survive a restart (a QR that "forgets" it was
 * checked in would be a replay hole), so every store is persisted to
 * `PARKSMART_DATA_DIR` (default `<cwd>/data`) as JSON.
 *
 * Writes are atomic (temp file + rename) so a crash can never leave a
 * half-written file behind.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Directory holding the JSON data files. Overridable for tests. */
export function dataDir(): string {
  return process.env.PARKSMART_DATA_DIR || path.join(process.cwd(), 'data');
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readJsonFile<T>(fileName: string, fallback: T): T {
  const file = path.join(dataDir(), fileName);
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[storage] Failed to read ${fileName}, using fallback:`, err);
    return fallback;
  }
}

/** Atomically persist `value` to `<dataDir>/<fileName>`. */
export function writeJsonFile(fileName: string, value: unknown): void {
  const dir = dataDir();
  const file = path.join(dir, fileName);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    ensureDir(dir);
    fs.writeFileSync(tmp, JSON.stringify(value), 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error(`[storage] Failed to write ${fileName}:`, err);
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore cleanup failure */
    }
    throw err;
  }
}
