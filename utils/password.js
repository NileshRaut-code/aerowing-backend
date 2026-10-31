//Nilesh, 31-10-2026, password hashing with built-in scrypt (no native deps)
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const KEYLEN = 64;

//Nilesh, 31-10-2026, hash → "salt:hash" (hex)
export const hashPassword = async (plain) => {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(plain, salt, KEYLEN);
  return `${salt}:${hash.toString("hex")}`;
};

// fixed dummy so unknown-user logins cost the same time as real ones
const DUMMY = `${"0".repeat(32)}:${"0".repeat(KEYLEN * 2)}`;

//Nilesh, 31-10-2026, constant-time verify; pass null stored hash for unknown users
export const verifyPassword = async (plain, stored) => {
  const [salt, hex] = (stored ?? DUMMY).split(":");
  const actual = await scrypt(plain, salt, KEYLEN);
  return Boolean(stored) && timingSafeEqual(actual, Buffer.from(hex, "hex"));
};

//Nilesh, 31-10-2026, constant-time compare of two secrets of any length (e.g. registration code)
const sha = (s) => createHash("sha256").update(String(s)).digest();
export const safeEqual = (a, b) => timingSafeEqual(sha(a), sha(b));
