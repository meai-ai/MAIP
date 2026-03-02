/**
 * Transport-agnostic result types.
 *
 * These types decouple handler logic from the wire transport (HTTP, libp2p, etc.).
 * Handler core functions return TransportResult, and each transport layer maps it
 * to the appropriate wire response.
 */

/**
 * Result returned by transport-agnostic handler core functions.
 * The transport layer maps this to HTTP status codes, libp2p stream responses, etc.
 */
export interface TransportResult<T = unknown> {
  /** Whether the operation succeeded. */
  ok: boolean;
  /** Response data (on success). */
  data?: T;
  /** Error message (on failure). */
  error?: string;
  /** Machine-readable error code (on failure). */
  code?: string;
  /** Hint for HTTP transport — the appropriate status code. */
  httpStatus?: number;
}

/**
 * A peer's address that can be used to reach them over any transport.
 */
export interface PeerAddress {
  /** HTTP endpoint URL (if available). */
  http?: string;
  /** libp2p PeerId (if available). */
  peerId?: string;
  /** libp2p multiaddrs (if available). */
  multiaddrs?: string[];
}
