const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export type IdPrefix = "usr" | "bas" | "tbl" | "fld" | "viw" | "rec" | "com" | "tok" | "sel" | "flt";

/** Airtable-style ids: a 3-letter prefix plus 14 random characters. */
export function newId(prefix: IdPrefix): string {
  return prefix + randomString(14);
}
