/**
 * MAIP Crypto — re-exported from a single entry point.
 */

export {
  generateKeyPair,
  keyPairFromSecretKey,
  publicKeyToDid,
  didToPublicKey,
  isValidDid,
  exportSecretKey,
  importSecretKey,
  getPublicKeyBase58,
  getEncryptionKeyBase58,
  type MAIPKeyPair,
} from "./keys.js";

export {
  canonicalize,
  sign,
  verify,
  verifyWithDid,
  signDocument,
  verifyDocument,
} from "./signing.js";

export { encrypt, decrypt } from "./encryption.js";

export {
  encodeBase64,
  decodeBase64,
  encodeHex,
  decodeHex,
} from "./encoding.js";

export { encodeBase58, decodeBase58 } from "./base58.js";
