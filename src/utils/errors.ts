/**
 * 流空闲超时错误
 * 当流在指定时间内没有收到新数据时抛出
 */
export class StreamIdleTimeoutError extends Error {
  readonly idleSeconds: number;

  constructor(idleSeconds: number) {
    super(`Stream idle timeout after ${idleSeconds}s`);
    this.name = "StreamIdleTimeoutError";
    this.idleSeconds = idleSeconds;
  }
}

/**
 * 上游服务错误
 * 当与 Grok 上游服务通信出现问题时抛出
 */
export class UpstreamError extends Error {
  readonly statusCode: number;
  readonly details: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 502,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "UpstreamError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * 检查是否为 HTTP/2 流错误
 */
export function isHttp2StreamError(e: Error | unknown): boolean {
  const errStr = String(e).toLowerCase();
  return (
    errStr.includes("http/2") ||
    errStr.includes("curl: (92)") ||
    errStr.includes("stream")
  );
}
