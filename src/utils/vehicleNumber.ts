/**
 * Vehicle registration number normalization helpers.
 *
 * ParkSmart targets Indian registrations (WB12AB1234, DL7CAB1234, 22AA1234AB
 * "Bharat Series", MH 12 AB 1234, ...) plus temporary/valet style plates.
 *
 * The rules below deliberately ONLY remove separator characters and
 * upper-case the value. They never rewrite, pad, or otherwise alter the
 * characters of a registration number, so a legitimate plate always survives
 * round-tripping:
 *
 *   'wb12 ab 1234'   -> 'WB12AB1234'
 *   'WB-12-AB-1234'  -> 'WB12AB1234'
 *   'WB12AB1234'     -> 'WB12AB1234'
 *   '  mh 12 ab 1234 -> 'MH12AB1234'
 */

/** Characters stripped during normalization: whitespace, dashes, dots,
 *  underscores and the decorative separators people paste from RC books. */
const SEPARATORS = /[\s.\-_/·•]+/g;

/** Anything that is not a letter, digit or one of the separators above. */
const NON_PLATE_CHARS = /[^A-Za-z0-9\s.\-_/·•]/g;

/**
 * Normalize a vehicle registration number for storage/comparison.
 * Returns an upper-case, separator-free string ('' for empty/invalid input).
 */
export function normalizeVehicleNumber(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFKC')
    .replace(NON_PLATE_CHARS, '')
    .replace(SEPARATORS, '')
    .toUpperCase();
}

/**
 * Loose structural validation for a normalized plate.
 * Accepts the common Indian formats (state-code plates, BH series, older
 * 3+4 digit plates, test/temporary plates) without rejecting unusual but
 * legitimate registrations. 6–14 alphanumeric characters.
 */
export function isValidVehicleNumber(raw: string | null | undefined): boolean {
  const normalized = normalizeVehicleNumber(raw);
  if (normalized.length < 6 || normalized.length > 14) return false;
  return /^[A-Z0-9]+$/.test(normalized);
}

/** True when two registration numbers refer to the same vehicle. */
export function vehicleNumbersMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = normalizeVehicleNumber(a);
  const right = normalizeVehicleNumber(b);
  if (!left || !right) return false;
  return left === right;
}

/**
 * Display formatting used on tickets/verification screens: re-inserts a
 * single space every 4 characters so long plates stay readable
 * ('WB12AB1234' -> 'WB12 AB1234'). Purely cosmetic — never used for
 * comparison.
 */
export function formatVehicleNumberForDisplay(raw: string | null | undefined): string {
  const normalized = normalizeVehicleNumber(raw);
  if (!normalized) return '';
  return normalized.replace(/(.{4})/g, '$1 ').trim();
}
