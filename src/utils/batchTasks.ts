/**
 * Batch task manager for admin batch operations (SSE progress).
 * 批量任务管理器 - 支持 SSE 进度推送
 */

export type BatchTaskStatus = "running" | "done" | "error" | "cancelled";

export interface BatchTaskEvent {
  type: "progress" | "done" | "error" | "cancelled";
  task_id: string;
  total: number;
  processed: number;
  ok: number;
  fail: number;
  item?: unknown;
  detail?: unknown;
  error?: string;
  warning?: string | null;
  result?: Record<string, unknown>;
}

export interface BatchTaskSnapshot {
  task_id: string;
  status: BatchTaskStatus;
  total: number;
  processed: number;
  ok: number;
  fail: number;
  warning: string | null;
}

type EventCallback = (event: BatchTaskEvent) => void;

/**
 * 批量任务类
 * 用于管理批量操作的进度跟踪和 SSE 事件推送
 */
export class BatchTask {
  readonly id: string;
  readonly total: number;
  readonly createdAt: number;

  private _processed = 0;
  private _ok = 0;
  private _fail = 0;
  private _status: BatchTaskStatus = "running";
  private _warning: string | null = null;
  private _result: Record<string, unknown> | null = null;
  private _error: string | null = null;
  private _cancelled = false;
  private _finalEvent: BatchTaskEvent | null = null;
  private _callbacks: Set<EventCallback> = new Set();

  constructor(total: number) {
    this.id = crypto.randomUUID().replace(/-/g, "");
    this.total = Math.max(0, Math.floor(total));
    this.createdAt = Date.now();
  }

  get processed(): number {
    return this._processed;
  }

  get ok(): number {
    return this._ok;
  }

  get fail(): number {
    return this._fail;
  }

  get status(): BatchTaskStatus {
    return this._status;
  }

  get warning(): string | null {
    return this._warning;
  }

  get result(): Record<string, unknown> | null {
    return this._result;
  }

  get error(): string | null {
    return this._error;
  }

  get cancelled(): boolean {
    return this._cancelled;
  }

  get finalEvent(): BatchTaskEvent | null {
    return this._finalEvent;
  }

  /**
   * 获取任务快照
   */
  snapshot(): BatchTaskSnapshot {
    return {
      task_id: this.id,
      status: this._status,
      total: this.total,
      processed: this._processed,
      ok: this._ok,
      fail: this._fail,
      warning: this._warning,
    };
  }

  /**
   * 订阅任务事件
   * @returns 取消订阅函数
   */
  subscribe(callback: EventCallback): () => void {
    this._callbacks.add(callback);
    return () => {
      this._callbacks.delete(callback);
    };
  }

  /**
   * 发布事件到所有订阅者
   */
  private _publish(event: BatchTaskEvent): void {
    for (const cb of this._callbacks) {
      try {
        cb(event);
      } catch {
        // Ignore callback errors
      }
    }
  }

  /**
   * 记录单项处理结果
   */
  record(args: { ok: boolean; item?: unknown; detail?: unknown; error?: string }): void {
    const { ok, item, detail, error } = args;
    this._processed++;
    if (ok) {
      this._ok++;
    } else {
      this._fail++;
    }

    const event: BatchTaskEvent = {
      type: "progress",
      task_id: this.id,
      total: this.total,
      processed: this._processed,
      ok: this._ok,
      fail: this._fail,
    };

    if (item !== undefined) event.item = item;
    if (detail !== undefined) event.detail = detail;
    if (error) event.error = error;

    this._publish(event);
  }

  /**
   * 完成任务
   */
  finish(result: Record<string, unknown>, warning?: string): void {
    this._status = "done";
    this._result = result;
    this._warning = warning ?? null;

    const event: BatchTaskEvent = {
      type: "done",
      task_id: this.id,
      total: this.total,
      processed: this._processed,
      ok: this._ok,
      fail: this._fail,
      warning: this._warning,
      result,
    };

    this._finalEvent = event;
    this._publish(event);
  }

  /**
   * 标记任务失败
   */
  failTask(error: string): void {
    this._status = "error";
    this._error = error;

    const event: BatchTaskEvent = {
      type: "error",
      task_id: this.id,
      total: this.total,
      processed: this._processed,
      ok: this._ok,
      fail: this._fail,
      error,
    };

    this._finalEvent = event;
    this._publish(event);
  }

  /**
   * 请求取消任务
   */
  cancel(): void {
    this._cancelled = true;
  }

  /**
   * 完成取消操作
   */
  finishCancelled(): void {
    this._status = "cancelled";

    const event: BatchTaskEvent = {
      type: "cancelled",
      task_id: this.id,
      total: this.total,
      processed: this._processed,
      ok: this._ok,
      fail: this._fail,
    };

    this._finalEvent = event;
    this._publish(event);
  }
}

// 全局任务存储
const _TASKS = new Map<string, BatchTask>();

/**
 * 创建新的批量任务
 */
export function createTask(total: number): BatchTask {
  const task = new BatchTask(total);
  _TASKS.set(task.id, task);
  return task;
}

/**
 * 获取任务
 */
export function getTask(taskId: string): BatchTask | undefined {
  return _TASKS.get(taskId);
}

/**
 * 删除任务
 */
export function deleteTask(taskId: string): void {
  _TASKS.delete(taskId);
}

/**
 * 延迟过期删除任务
 * @param taskId 任务 ID
 * @param delayMs 延迟毫秒数 (默认 5 分钟)
 */
export function expireTask(taskId: string, delayMs = 300_000): void {
  setTimeout(() => {
    deleteTask(taskId);
  }, delayMs);
}

/**
 * 获取所有任务列表
 */
export function listTasks(): BatchTask[] {
  return Array.from(_TASKS.values());
}

/**
 * 创建 SSE 响应流
 * @param task 批量任务
 * @returns ReadableStream 用于 SSE 响应
 */
export function createTaskSSEStream(task: BatchTask): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      // 发送初始快照
      const snapshot = task.snapshot();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "init", ...snapshot })}\n\n`));

      // 如果任务已完成，发送最终事件并关闭
      if (task.finalEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(task.finalEvent)}\n\n`));
        controller.close();
        return;
      }

      // 订阅后续事件
      const unsubscribe = task.subscribe((event) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          // 如果是最终事件，关闭流
          if (event.type === "done" || event.type === "error" || event.type === "cancelled") {
            unsubscribe();
            controller.close();
          }
        } catch {
          unsubscribe();
        }
      });
    },
  });
}

/**
 * 批量执行辅助函数
 * @param items 待处理项目列表
 * @param task 批量任务
 * @param processor 处理函数
 * @param concurrency 并发数
 */
export async function runInBatches<T>(
  items: T[],
  task: BatchTask,
  processor: (item: T) => Promise<{ ok: boolean; detail?: unknown; error?: string }>,
  concurrency = 5,
): Promise<void> {
  const queue = [...items];
  const workers: Promise<void>[] = [];

  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(
      (async () => {
        while (queue.length > 0 && !task.cancelled) {
          const item = queue.shift();
          if (item === undefined) break;

          try {
            const result = await processor(item);
            task.record({
              ok: result.ok,
              item,
              detail: result.detail,
              ...(result.error !== undefined && { error: result.error }),
            });
          } catch (e) {
            task.record({
              ok: false,
              item,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      })(),
    );
  }

  await Promise.all(workers);

  if (task.cancelled) {
    task.finishCancelled();
  }
}
