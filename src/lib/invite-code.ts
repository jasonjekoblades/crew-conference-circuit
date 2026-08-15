import "server-only";
import { createHash, timingSafeEqual } from "crypto";

/**
 * The invite code is a single shared secret (not a per-user password), so a
 * plain salted hash is enough — no bcrypt needed. What matters is (a) it's
 * not stored in app_settings as plaintext, and (b) comparison is constant
 * time so response timing can't be used to brute-force it character by
 * character.
 */
export function hashInviteCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export function verifyInviteCode(submittedCode: string, storedHash: string): boolean {
  const submittedHash = hashInviteCode(submittedCode);
  const a = Buffer.from(submittedHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
