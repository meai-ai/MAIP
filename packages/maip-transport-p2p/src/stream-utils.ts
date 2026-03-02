/**
 * Length-prefixed stream helpers for libp2p protocol streams.
 *
 * Wire format: [4-byte uint32 BE length][JSON UTF-8 payload]
 *
 * In libp2p v3, streams use .send() to write and async iteration to read.
 * stream.close() closes the write side while keeping the read side open.
 */

import type { Stream } from "@libp2p/interface";

const MAX_MESSAGE_SIZE = 1024 * 1024; // 1 MB

/**
 * Write a JSON payload to a libp2p stream with a 4-byte length prefix,
 * then close the write side so the remote knows the message is complete.
 */
export async function writeLengthPrefixed(stream: Stream, data: unknown): Promise<void> {
  const json = JSON.stringify(data);
  const payload = new TextEncoder().encode(json);

  if (payload.length > MAX_MESSAGE_SIZE) {
    throw new Error(`Message too large: ${payload.length} bytes (max ${MAX_MESSAGE_SIZE})`);
  }

  // 4-byte big-endian length prefix
  const header = new Uint8Array(4);
  new DataView(header.buffer).setUint32(0, payload.length, false);

  // Combine header + payload into a single frame
  const frame = new Uint8Array(4 + payload.length);
  frame.set(header, 0);
  frame.set(payload, 4);

  // Write using the v3 send() API
  stream.send(frame);

  // Close the write side so the remote knows the message is complete.
  // The stream remains readable until the remote also closes their write side.
  await stream.close();
}

/**
 * Read a length-prefixed JSON payload from a libp2p stream.
 *
 * Reads all incoming data via async iteration (completes when the remote
 * closes their write side), then parses the length-prefixed frame.
 */
export async function readLengthPrefixed<T = unknown>(stream: Stream): Promise<T> {
  const chunks: Uint8Array[] = [];

  // In libp2p v3, Stream is AsyncIterable<Uint8Array | Uint8ArrayList>
  for await (const chunk of stream) {
    // chunk may be a Uint8ArrayList; ensure we get a Uint8Array
    const bytes = chunk instanceof Uint8Array ? chunk : chunk.subarray();
    chunks.push(bytes);
  }

  if (chunks.length === 0) {
    throw new Error("Empty stream — no data received");
  }

  // Concatenate all chunks
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const buffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  if (buffer.length < 4) {
    throw new Error(`Stream too short: ${buffer.length} bytes (need at least 4 for header)`);
  }

  const payloadLength = new DataView(buffer.buffer, buffer.byteOffset).getUint32(0, false);

  if (payloadLength > MAX_MESSAGE_SIZE) {
    throw new Error(`Payload too large: ${payloadLength} bytes (max ${MAX_MESSAGE_SIZE})`);
  }

  if (buffer.length < 4 + payloadLength) {
    throw new Error(`Incomplete payload: expected ${payloadLength} bytes, got ${buffer.length - 4}`);
  }

  const payloadBytes = buffer.subarray(4, 4 + payloadLength);
  const json = new TextDecoder().decode(payloadBytes);

  return JSON.parse(json) as T;
}
