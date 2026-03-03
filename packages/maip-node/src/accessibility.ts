/**
 * Accessibility layer for MAIP nodes.
 *
 * Provides hooks for:
 * - Voice interface integration (text-to-speech / speech-to-text adapters)
 * - Lightweight client support (minimal payload mode)
 * - Offline mode (queue messages when disconnected, flush on reconnect)
 */

import type { MAIPMessage } from "@maip/core";

// ── Voice Interface Hooks ──────────────────────────────────────

/** Voice adapter interface for text-to-speech and speech-to-text. */
export interface VoiceAdapter {
  /** Convert text to speech audio (returns audio buffer or URL). */
  textToSpeech(text: string, options?: { language?: string; voice?: string }): Promise<string | Buffer>;
  /** Convert speech audio to text. */
  speechToText(audio: Buffer, options?: { language?: string }): Promise<string>;
  /** Whether this adapter is available/configured. */
  isAvailable(): boolean;
}

/** A no-op voice adapter for when no voice service is configured. */
export class NoOpVoiceAdapter implements VoiceAdapter {
  async textToSpeech(text: string): Promise<string> {
    return text; // Pass through
  }
  async speechToText(_audio: Buffer): Promise<string> {
    return "[voice input not supported]";
  }
  isAvailable(): boolean {
    return false;
  }
}

// ── Lightweight Client Mode ────────────────────────────────────

/** Strip a message down to minimal fields for bandwidth-constrained clients. */
export function toMinimalPayload(msg: MAIPMessage): {
  id: string;
  from: string;
  text?: string;
  type: string;
  ts: string;
} {
  return {
    id: msg.id,
    from: msg.from,
    text: msg.content.text,
    type: msg.type,
    ts: msg.timestamp,
  };
}

// ── Offline Message Queue ──────────────────────────────────────

/** A queue that holds messages when the network is unavailable. */
export class OfflineQueue {
  private queue: Array<{ message: MAIPMessage; targetEndpoint: string; queuedAt: number }> = [];
  private _isOnline = true;

  /** Queue a message for later delivery. */
  enqueue(message: MAIPMessage, targetEndpoint: string): void {
    this.queue.push({ message, targetEndpoint, queuedAt: Date.now() });
  }

  /** Get all queued messages. */
  pending(): Array<{ message: MAIPMessage; targetEndpoint: string; queuedAt: number }> {
    return [...this.queue];
  }

  /** Clear delivered messages from the queue. */
  dequeue(messageId: string): void {
    this.queue = this.queue.filter((item) => item.message.id !== messageId);
  }

  /** Clear all queued messages. */
  clear(): void {
    this.queue = [];
  }

  /** Number of queued messages. */
  get size(): number {
    return this.queue.length;
  }

  /** Whether the node is currently online. */
  get isOnline(): boolean {
    return this._isOnline;
  }

  /** Mark the node as online (triggers flush). */
  setOnline(online: boolean): void {
    this._isOnline = online;
  }

  /** Get messages older than maxAgeMs. */
  expired(maxAgeMs: number): Array<{ message: MAIPMessage; targetEndpoint: string }> {
    const cutoff = Date.now() - maxAgeMs;
    return this.queue
      .filter((item) => item.queuedAt < cutoff)
      .map(({ message, targetEndpoint }) => ({ message, targetEndpoint }));
  }

  /** Remove expired messages. */
  purgeExpired(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    const before = this.queue.length;
    this.queue = this.queue.filter((item) => item.queuedAt >= cutoff);
    return before - this.queue.length;
  }
}
