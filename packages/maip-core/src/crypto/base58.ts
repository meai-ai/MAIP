/**
 * Base58 encoding/decoding (Bitcoin alphabet).
 *
 * Used for DID encoding: did:maip:<base58-ed25519-pubkey>
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE = BigInt(58);

/**
 * Encode a Uint8Array to base58 string.
 */
export function encodeBase58(data: Uint8Array): string {
  if (data.length === 0) return "";

  // Count leading zeros
  let zeros = 0;
  for (let i = 0; i < data.length && data[i] === 0; i++) {
    zeros++;
  }

  // Convert to BigInt
  let num = BigInt(0);
  for (let i = 0; i < data.length; i++) {
    num = num * BigInt(256) + BigInt(data[i]);
  }

  // Convert to base58
  let result = "";
  while (num > BigInt(0)) {
    const remainder = num % BASE;
    num = num / BASE;
    result = ALPHABET[Number(remainder)] + result;
  }

  // Add leading '1's for leading zero bytes
  return "1".repeat(zeros) + result;
}

/**
 * Decode a base58 string to Uint8Array.
 */
export function decodeBase58(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);

  // Count leading '1's (represent leading zero bytes)
  let zeros = 0;
  for (let i = 0; i < str.length && str[i] === "1"; i++) {
    zeros++;
  }

  // Convert from base58 to BigInt
  let num = BigInt(0);
  for (let i = 0; i < str.length; i++) {
    const charIndex = ALPHABET.indexOf(str[i]);
    if (charIndex === -1) {
      throw new Error(`Invalid base58 character: ${str[i]}`);
    }
    num = num * BASE + BigInt(charIndex);
  }

  // Convert BigInt to bytes
  const bytes: number[] = [];
  while (num > BigInt(0)) {
    bytes.unshift(Number(num % BigInt(256)));
    num = num / BigInt(256);
  }

  // Add leading zeros
  const result = new Uint8Array(zeros + bytes.length);
  result.set(bytes, zeros);
  return result;
}
