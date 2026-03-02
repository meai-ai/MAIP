/**
 * Transport-agnostic identity processing.
 */

import type { IdentityDocument, TransportResult } from "@maip/core";
import type { NodeContext } from "../context.js";

/**
 * Process an identity request (transport-agnostic).
 *
 * Returns this node's signed identity document.
 */
export function processIdentityRequest(
  ctx: NodeContext
): TransportResult<IdentityDocument> {
  return {
    ok: true,
    data: ctx.identity,
    httpStatus: 200,
  };
}
