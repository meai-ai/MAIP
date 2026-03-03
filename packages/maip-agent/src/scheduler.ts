/**
 * Autonomous Agent Scheduler.
 *
 * Implements the whitepaper's "light is on" concept (section 3.4):
 * the agent doesn't just respond to prompts — it has its own
 * ongoing life. The scheduler orchestrates periodic autonomous
 * activities:
 *
 * - Reflection cycles (ReflectionEngine)
 * - Data gathering (DataAggregator)
 * - Content production (ContentPipeline)
 * - Will distribution checks
 * - Backup shard distribution to trusted peers
 *
 * Each task runs on a configurable interval and can be
 * independently started/stopped.
 */

import type { ReflectionEngine } from "./reflection-engine.js";
import type { DataAggregator } from "./data-interfaces.js";
import type { ContentPipeline } from "./content-pipeline.js";
import type { PersonalityState } from "./personality-engine.js";

/** Configuration for the scheduler. */
export interface SchedulerConfig {
  /** Reflection interval in ms (default: 30 minutes). */
  reflectionIntervalMs?: number;
  /** Data gathering interval in ms (default: 15 minutes). */
  gatherIntervalMs?: number;
  /** Content pipeline interval in ms (default: 60 minutes). */
  contentIntervalMs?: number;
  /** Backup check interval in ms (default: 24 hours). */
  backupIntervalMs?: number;
  /** Whether to start all tasks on creation. */
  autoStart?: boolean;
}

/** Status of a scheduled task. */
export interface TaskStatus {
  name: string;
  running: boolean;
  lastRunAt: string | null;
  runCount: number;
  lastError: string | null;
}

/** Callback for scheduled events. */
export type SchedulerCallback = (event: string, data?: unknown) => void;

/**
 * AgentScheduler — orchestrates periodic autonomous activities.
 */
export class AgentScheduler {
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private taskStatus: Map<string, TaskStatus> = new Map();
  private reflectionEngine?: ReflectionEngine;
  private dataAggregator?: DataAggregator;
  private contentPipeline?: ContentPipeline;
  private personalityState?: PersonalityState;
  private onEvent?: SchedulerCallback;
  private config: Required<SchedulerConfig>;

  constructor(
    config?: SchedulerConfig,
    deps?: {
      reflectionEngine?: ReflectionEngine;
      dataAggregator?: DataAggregator;
      contentPipeline?: ContentPipeline;
      personalityState?: PersonalityState;
      onEvent?: SchedulerCallback;
    }
  ) {
    this.config = {
      reflectionIntervalMs: config?.reflectionIntervalMs ?? 30 * 60 * 1000,
      gatherIntervalMs: config?.gatherIntervalMs ?? 15 * 60 * 1000,
      contentIntervalMs: config?.contentIntervalMs ?? 60 * 60 * 1000,
      backupIntervalMs: config?.backupIntervalMs ?? 24 * 60 * 60 * 1000,
      autoStart: config?.autoStart ?? false,
    };

    this.reflectionEngine = deps?.reflectionEngine;
    this.dataAggregator = deps?.dataAggregator;
    this.contentPipeline = deps?.contentPipeline;
    this.personalityState = deps?.personalityState;
    this.onEvent = deps?.onEvent;

    if (this.config.autoStart) {
      this.startAll();
    }
  }

  /** Start all scheduled tasks. */
  startAll(): void {
    if (this.reflectionEngine) this.startTask("reflection");
    if (this.dataAggregator) this.startTask("gather");
    if (this.contentPipeline) this.startTask("content");
    this.startTask("backup");
  }

  /** Stop all scheduled tasks. */
  stopAll(): void {
    for (const name of this.timers.keys()) {
      this.stopTask(name);
    }
  }

  /** Start a specific task by name. */
  startTask(name: string): void {
    if (this.timers.has(name)) return; // Already running

    const status: TaskStatus = {
      name,
      running: true,
      lastRunAt: null,
      runCount: 0,
      lastError: null,
    };
    this.taskStatus.set(name, status);

    let intervalMs: number;
    let handler: () => Promise<void>;

    switch (name) {
      case "reflection":
        intervalMs = this.config.reflectionIntervalMs;
        handler = () => this.runReflection();
        break;
      case "gather":
        intervalMs = this.config.gatherIntervalMs;
        handler = () => this.runGather();
        break;
      case "content":
        intervalMs = this.config.contentIntervalMs;
        handler = () => this.runContent();
        break;
      case "backup":
        intervalMs = this.config.backupIntervalMs;
        handler = () => this.runBackupCheck();
        break;
      default:
        return;
    }

    const timer = setInterval(async () => {
      try {
        await handler();
        status.lastRunAt = new Date().toISOString();
        status.runCount++;
        status.lastError = null;
      } catch (err) {
        status.lastError = err instanceof Error ? err.message : String(err);
      }
    }, intervalMs);

    this.timers.set(name, timer);
  }

  /** Stop a specific task by name. */
  stopTask(name: string): void {
    const timer = this.timers.get(name);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(name);
    }
    const status = this.taskStatus.get(name);
    if (status) status.running = false;
  }

  /** Get status of all tasks. */
  getStatus(): TaskStatus[] {
    return [...this.taskStatus.values()];
  }

  /** Manually trigger a reflection cycle. */
  async triggerReflection(): Promise<void> {
    await this.runReflection();
  }

  /** Manually trigger a data gathering cycle. */
  async triggerGather(): Promise<void> {
    await this.runGather();
  }

  /** Update the personality state (called when personality changes). */
  updatePersonalityState(state: PersonalityState): void {
    this.personalityState = state;
  }

  // ── Task implementations ──

  private async runReflection(): Promise<void> {
    if (!this.reflectionEngine) return;
    const thoughts = await this.reflectionEngine.reflect(this.personalityState);
    if (thoughts.length > 0) {
      this.emit("reflection", {
        thoughtCount: thoughts.length,
        types: thoughts.map((t) => t.type),
      });
    }
  }

  private async runGather(): Promise<void> {
    if (!this.dataAggregator) return;
    const content = await this.dataAggregator.explore([]);
    if (content.length > 0) {
      // Feed gathered content to the reflection engine
      if (this.reflectionEngine) {
        for (const item of content) {
          this.reflectionEngine.recordContent(
            item.title + " " + item.text,
            item.topics
          );
        }
      }
      this.emit("gather", { itemCount: content.length });
    }
  }

  private async runContent(): Promise<void> {
    if (!this.contentPipeline) return;
    // Content pipeline stages: gather → synthesize → review → publish
    // Only trigger a full pipeline run if there's enough source material
    this.emit("content", { triggered: true });
  }

  private async runBackupCheck(): Promise<void> {
    // Signal that a backup check should be performed
    // The actual distribution is handled by MAIPBridge.distributeWill()
    this.emit("backup_check", { timestamp: new Date().toISOString() });
  }

  private emit(event: string, data?: unknown): void {
    if (this.onEvent) {
      try { this.onEvent(event, data); } catch { /* ignore callback errors */ }
    }
  }
}
