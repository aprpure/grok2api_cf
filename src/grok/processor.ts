import type { GrokSettings, GlobalSettings } from "../settings";
import { StreamIdleTimeoutError, UpstreamError, isHttp2StreamError } from "../utils/errors";

type GrokNdjson = Record<string, unknown>;

/**
 * Tag 过滤器 - 支持跨 token 的精确过滤
 * 只过滤标签内的内容，保留标签外的文本
 *
 * 例如: "Hello <xai:artifact>内容</xai:artifact> World"
 * 过滤后: "Hello  World"
 */
class TagFilter {
  private tags: string[];
  private inFilterTag = false;
  private tagBuffer = "";
  private pendingPrefix = ""; // 可能是标签开头，等待更多字符确认

  constructor(filterTags: string[]) {
    this.tags = filterTags.filter(Boolean);
  }

  /**
   * 过滤 token 中的标签内容
   * @param token 输入的 token
   * @returns 过滤后的文本（可能为空）
   */
  filter(token: string): string {
    if (!this.tags.length) return token;

    let result = "";
    let i = 0;

    while (i < token.length) {
      const char = token[i]!;

      // 如果有待确认的前缀，继续累积
      if (this.pendingPrefix) {
        this.pendingPrefix += char;

        // 检查是否匹配任何标签开头
        let anyMatch = false;
        let fullMatch = false;
        for (const tag of this.tags) {
          const openTag = `<${tag}`;
          if (openTag.startsWith(this.pendingPrefix)) {
            anyMatch = true;
          }
          if (this.pendingPrefix.startsWith(openTag)) {
            // 完整匹配开始标签
            fullMatch = true;
            this.inFilterTag = true;
            this.tagBuffer = this.pendingPrefix;
            this.pendingPrefix = "";
            break;
          }
        }

        if (fullMatch) {
          i++;
          continue;
        }

        if (!anyMatch) {
          // 不是标签开头，输出累积的内容
          result += this.pendingPrefix;
          this.pendingPrefix = "";
        }
        i++;
        continue;
      }

      // 如果正在过滤标签内容
      if (this.inFilterTag) {
        this.tagBuffer += char;

        if (char === ">") {
          // 检查是否是自闭合标签 />
          if (this.tagBuffer.endsWith("/>")) {
            this.inFilterTag = false;
            this.tagBuffer = "";
          } else {
            // 检查是否是结束标签
            for (const tag of this.tags) {
              if (this.tagBuffer.includes(`</${tag}>`)) {
                this.inFilterTag = false;
                this.tagBuffer = "";
                break;
              }
            }
          }
        }
        i++;
        continue;
      }

      // 检查是否开始一个标签
      if (char === "<") {
        this.pendingPrefix = "<";
        i++;
        continue;
      }

      // 普通字符，直接输出
      result += char;
      i++;
    }

    return result;
  }

  /**
   * 重置过滤器状态
   */
  reset(): void {
    this.inFilterTag = false;
    this.tagBuffer = "";
    this.pendingPrefix = "";
  }

  /**
   * 获取待输出的挂起内容（在流结束时调用）
   */
  flush(): string {
    const pending = this.pendingPrefix;
    this.pendingPrefix = "";
    return pending;
  }
}

/**
 * 对完整内容进行 tag 过滤（非流式场景）
 */
function filterTagsFromContent(content: string, filterTags: string[]): string {
  if (!filterTags.length) return content;

  const filter = new TagFilter(filterTags);
  const result = filter.filter(content) + filter.flush();
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  ms: number,
): Promise<ReadableStreamReadResult<Uint8Array> | { timeout: true }> {
  if (ms <= 0) return { timeout: true };
  return Promise.race([
    reader.read(),
    sleep(ms).then(() => ({ timeout: true }) as const),
  ]);
}

function makeChunk(
  id: string,
  created: number,
  model: string,
  content: string,
  finish_reason?: "stop" | "error" | null,
): string {
  const payload: Record<string, unknown> = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: content ? { role: "assistant", content } : {},
        finish_reason: finish_reason ?? null,
      },
    ],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function makeDone(): string {
  return "data: [DONE]\n\n";
}

function toImgProxyUrl(globalCfg: GlobalSettings, origin: string, path: string): string {
  const baseUrl = (globalCfg.base_url ?? "").trim() || origin;
  return `${baseUrl}/images/${path}`;
}

function buildVideoTag(src: string): string {
  return `<video src="${src}" controls="controls" width="500" height="300"></video>\n`;
}

function buildVideoPosterPreview(videoUrl: string, posterUrl?: string): string {
  const href = String(videoUrl || "").replace(/"/g, "&quot;");
  const poster = String(posterUrl || "").replace(/"/g, "&quot;");
  if (!href) return "";
  if (!poster) return `<a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>\n`;
  return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;position:relative;max-width:100%;text-decoration:none;">
  <img src="${poster}" alt="video" style="max-width:100%;height:auto;border-radius:12px;display:block;" />
  <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
    <span style="width:64px;height:64px;border-radius:9999px;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;">
      <span style="width:0;height:0;border-top:12px solid transparent;border-bottom:12px solid transparent;border-left:18px solid #fff;margin-left:4px;"></span>
    </span>
  </span>
</a>\n`;
}

function buildVideoHtml(args: { videoUrl: string; posterUrl?: string; posterPreview: boolean }): string {
  if (args.posterPreview) return buildVideoPosterPreview(args.videoUrl, args.posterUrl);
  return buildVideoTag(args.videoUrl);
}

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeAssetPath(raw: string): string {
  try {
    const u = new URL(raw);
    // Keep full URL (query etc.) to avoid lossy pathname-only encoding (some URLs may encode the real path in query).
    return `u_${base64UrlEncode(u.toString())}`;
  } catch {
    const p = raw.startsWith("/") ? raw : `/${raw}`;
    return `p_${base64UrlEncode(p)}`;
  }
}

function normalizeGeneratedAssetUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s) continue;
    if (s === "/") continue;

    try {
      const u = new URL(s);
      if (u.pathname === "/" && !u.search && !u.hash) continue;
    } catch {
      // ignore (path-style strings are allowed)
    }

    out.push(s);
  }

  return out;
}

export function createOpenAiStreamFromGrokNdjson(
  grokResp: Response,
  opts: {
    cookie: string;
    settings: GrokSettings;
    global: GlobalSettings;
    origin: string;
    onFinish?: (result: { status: number; duration: number }) => Promise<void> | void;
  },
): ReadableStream<Uint8Array> {
  const { settings, global, origin } = opts;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  const filteredTags = (settings.filtered_tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const showThinking = settings.show_thinking !== false;

  const firstTimeoutMs = Math.max(0, (settings.stream_first_response_timeout ?? 30) * 1000);
  const chunkTimeoutMs = Math.max(0, (settings.stream_chunk_timeout ?? 120) * 1000);
  const totalTimeoutMs = Math.max(0, (settings.stream_total_timeout ?? 600) * 1000);
  // 新增：独立的空闲超时配置（用于更细粒度控制）
  const idleTimeoutMs = Math.max(0, (settings.stream_idle_timeout ?? 45) * 1000);
  const videoIdleTimeoutMs = Math.max(0, (settings.video_idle_timeout ?? 90) * 1000);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const body = grokResp.body;
      if (!body) {
        controller.enqueue(encoder.encode(makeChunk(id, created, "grok-4-mini-thinking-tahoe", "Empty response", "error")));
        controller.enqueue(encoder.encode(makeDone()));
        controller.close();
        return;
      }

      const reader = body.getReader();
      const startTime = Date.now();
      let finalStatus = 200;
      let lastChunkTime = startTime;
      let firstReceived = false;

      let currentModel = "grok-4-mini-thinking-tahoe";
      let isImage = false;
      let isVideo = false; // 标记当前是否在处理视频流
      let isThinking = false;
      let thinkingFinished = false;
      let videoProgressStarted = false;
      let lastVideoProgress = -1;

      let buffer = "";

      // 创建 Tag 过滤器实例（跨 token 状态保持）
      const tagFilter = new TagFilter(filteredTags);

      const flushStop = () => {
        controller.enqueue(encoder.encode(makeChunk(id, created, currentModel, "", "stop")));
        controller.enqueue(encoder.encode(makeDone()));
      };

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const now = Date.now();
          const elapsed = now - startTime;
          if (!firstReceived && elapsed > firstTimeoutMs) {
            flushStop();
            if (opts.onFinish) await opts.onFinish({ status: finalStatus, duration: (Date.now() - startTime) / 1000 });
            controller.close();
            return;
          }
          if (totalTimeoutMs > 0 && elapsed > totalTimeoutMs) {
            flushStop();
            if (opts.onFinish) await opts.onFinish({ status: finalStatus, duration: (Date.now() - startTime) / 1000 });
            controller.close();
            return;
          }
          const idle = now - lastChunkTime;
          // 根据是否为视频流选择不同的空闲超时阈值
          const currentIdleTimeoutMs = isVideo ? videoIdleTimeoutMs : idleTimeoutMs;
          if (firstReceived && currentIdleTimeoutMs > 0 && idle > currentIdleTimeoutMs) {
            // 抛出独立的空闲超时错误，便于上层区分处理
            throw new StreamIdleTimeoutError(idle / 1000);
          }
          // 保留原有的 chunkTimeout 检测作为后备
          if (firstReceived && idle > chunkTimeoutMs) {
            flushStop();
            if (opts.onFinish) await opts.onFinish({ status: finalStatus, duration: (Date.now() - startTime) / 1000 });
            controller.close();
            return;
          }

          const perReadTimeout = Math.min(
            firstReceived ? chunkTimeoutMs : firstTimeoutMs,
            totalTimeoutMs > 0 ? Math.max(0, totalTimeoutMs - elapsed) : Number.POSITIVE_INFINITY,
          );

          const res = await readWithTimeout(reader, perReadTimeout);
          if ("timeout" in res) {
            flushStop();
            if (opts.onFinish) await opts.onFinish({ status: finalStatus, duration: (Date.now() - startTime) / 1000 });
            controller.close();
            return;
          }

          const { value, done } = res;
          if (done) break;
          if (!value) continue;
          buffer += decoder.decode(value, { stream: true });

          let idx: number;
          while ((idx = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line) continue;

            let data: GrokNdjson;
            try {
              data = JSON.parse(line) as GrokNdjson;
            } catch {
              continue;
            }

            firstReceived = true;
            lastChunkTime = Date.now();

            const err = (data as any).error;
            if (err?.message) {
              finalStatus = 500;
              controller.enqueue(
                encoder.encode(makeChunk(id, created, currentModel, `Error: ${String(err.message)}`, "stop")),
              );
              controller.enqueue(encoder.encode(makeDone()));
              if (opts.onFinish) await opts.onFinish({ status: finalStatus, duration: (Date.now() - startTime) / 1000 });
              controller.close();
              return;
            }

            const grok = (data as any).result?.response;
            if (!grok) continue;

            const userRespModel = grok.userResponse?.model;
            if (typeof userRespModel === "string" && userRespModel.trim()) currentModel = userRespModel.trim();

            // Video generation stream
            const videoResp = grok.streamingVideoGenerationResponse;
            if (videoResp) {
              isVideo = true; // 标记当前为视频流，使用更长的空闲超时
              const progress = typeof videoResp.progress === "number" ? videoResp.progress : 0;
              const videoUrl = typeof videoResp.videoUrl === "string" ? videoResp.videoUrl : "";
              const thumbUrl = typeof videoResp.thumbnailImageUrl === "string" ? videoResp.thumbnailImageUrl : "";

              if (progress > lastVideoProgress) {
                lastVideoProgress = progress;
                if (showThinking) {
                  let msg = "";
                  if (!videoProgressStarted) {
                    msg = `<think>视频已生成${progress}%\n`;
                    videoProgressStarted = true;
                  } else if (progress < 100) {
                    msg = `视频已生成${progress}%\n`;
                  } else {
                    msg = `视频已生成${progress}%</think>\n`;
                  }
                  controller.enqueue(encoder.encode(makeChunk(id, created, currentModel, msg)));
                }
              }

              if (videoUrl) {
                const videoPath = encodeAssetPath(videoUrl);
                const src = toImgProxyUrl(global, origin, videoPath);

                let poster: string | undefined;
                if (thumbUrl) {
                  const thumbPath = encodeAssetPath(thumbUrl);
                  poster = toImgProxyUrl(global, origin, thumbPath);
                }

                controller.enqueue(
                  encoder.encode(
                    makeChunk(
                      id,
                      created,
                      currentModel,
                      buildVideoHtml({
                        videoUrl: src,
                        posterPreview: settings.video_poster_preview === true,
                        ...(poster ? { posterUrl: poster } : {}),
                      }),
                    ),
                  ),
                );
              }
              continue;
            }

            if (grok.imageAttachmentInfo) isImage = true;
            const rawToken = grok.token;

            if (isImage) {
              const modelResp = grok.modelResponse;
              if (modelResp) {
                const urls = normalizeGeneratedAssetUrls(modelResp.generatedImageUrls);
                if (urls.length) {
                  const linesOut: string[] = [];
                  for (const u of urls) {
                    const imgPath = encodeAssetPath(u);
                    const imgUrl = toImgProxyUrl(global, origin, imgPath);
                    linesOut.push(`![Generated Image](${imgUrl})`);
                  }
                  controller.enqueue(
                    encoder.encode(makeChunk(id, created, currentModel, linesOut.join("\n"), "stop")),
                  );
                  controller.enqueue(encoder.encode(makeDone()));
                  if (opts.onFinish) await opts.onFinish({ status: finalStatus, duration: (Date.now() - startTime) / 1000 });
                  controller.close();
                  return;
                }
              } else if (typeof rawToken === "string" && rawToken) {
                controller.enqueue(encoder.encode(makeChunk(id, created, currentModel, rawToken)));
              }
              continue;
            }

            // Text chat stream
            if (Array.isArray(rawToken)) continue;
            if (typeof rawToken !== "string" || !rawToken) continue;

            // 使用跨 token Tag 过滤器精确过滤标签内容
            const token = tagFilter.filter(rawToken);
            if (!token) continue; // 过滤后为空则跳过

            const currentIsThinking = Boolean(grok.isThinking);
            const messageTag = grok.messageTag;

            if (thinkingFinished && currentIsThinking) continue;

            // 处理 web 搜索结果（附加到 token 后面）
            let tokenWithSearch = token;
            if (grok.toolUsageCardId && grok.webSearchResults?.results && Array.isArray(grok.webSearchResults.results)) {
              if (currentIsThinking) {
                if (showThinking) {
                  let appended = "";
                  for (const r of grok.webSearchResults.results) {
                    const title = typeof r.title === "string" ? r.title : "";
                    const url = typeof r.url === "string" ? r.url : "";
                    const preview = typeof r.preview === "string" ? r.preview.replace(/\n/g, "") : "";
                    appended += `\n- [${title}](${url} \"${preview}\")`;
                  }
                  tokenWithSearch += `${appended}\n`;
                } else {
                  continue;
                }
              } else {
                continue;
              }
            }

            let content = tokenWithSearch;
            if (messageTag === "header") content = `\n\n${tokenWithSearch}\n\n`;

            let shouldSkip = false;
            if (!isThinking && currentIsThinking) {
              if (showThinking) content = `<think>\n${content}`;
              else shouldSkip = true;
            } else if (isThinking && !currentIsThinking) {
              if (showThinking) content = `\n</think>\n${content}`;
              thinkingFinished = true;
            } else if (currentIsThinking && !showThinking) {
              shouldSkip = true;
            }

            if (!shouldSkip) controller.enqueue(encoder.encode(makeChunk(id, created, currentModel, content)));
            isThinking = currentIsThinking;
          }
        }

        controller.enqueue(encoder.encode(makeChunk(id, created, currentModel, "", "stop")));
        controller.enqueue(encoder.encode(makeDone()));
        if (opts.onFinish) await opts.onFinish({ status: finalStatus, duration: (Date.now() - startTime) / 1000 });
        controller.close();
      } catch (e) {
        // 区分处理不同类型的错误
        if (e instanceof StreamIdleTimeoutError) {
          // 流空闲超时：优雅地结束流，而不是报告为错误
          console.warn(`[StreamIdleTimeout] ${isVideo ? "视频" : "文本"}流空闲超时: ${e.idleSeconds}s`);
          flushStop();
          if (opts.onFinish) await opts.onFinish({ status: finalStatus, duration: (Date.now() - startTime) / 1000 });
          controller.close();
        } else if (isHttp2StreamError(e)) {
          // HTTP/2 流错误：通常是连接问题，优雅结束
          console.warn(`[Http2StreamError] HTTP/2 流错误: ${e instanceof Error ? e.message : String(e)}`);
          flushStop();
          if (opts.onFinish) await opts.onFinish({ status: 502, duration: (Date.now() - startTime) / 1000 });
          controller.close();
        } else {
          // 其他错误：报告为处理错误
          finalStatus = 500;
          controller.enqueue(
            encoder.encode(
              makeChunk(id, created, currentModel, `处理错误: ${e instanceof Error ? e.message : String(e)}`, "error"),
            ),
          );
          controller.enqueue(encoder.encode(makeDone()));
          if (opts.onFinish) await opts.onFinish({ status: finalStatus, duration: (Date.now() - startTime) / 1000 });
          controller.close();
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // ignore
        }
      }
    },
  });
}

export async function parseOpenAiFromGrokNdjson(
  grokResp: Response,
  opts: { cookie: string; settings: GrokSettings; global: GlobalSettings; origin: string; requestedModel: string },
): Promise<Record<string, unknown>> {
  const { global, origin, requestedModel, settings } = opts;
  const text = await grokResp.text();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let content = "";
  let model = requestedModel;
  for (const line of lines) {
    let data: GrokNdjson;
    try {
      data = JSON.parse(line) as GrokNdjson;
    } catch {
      continue;
    }

    const err = (data as any).error;
    if (err?.message) throw new Error(String(err.message));

    const grok = (data as any).result?.response;
    if (!grok) continue;

    const videoResp = grok.streamingVideoGenerationResponse;
    if (videoResp?.videoUrl && typeof videoResp.videoUrl === "string") {
      const videoPath = encodeAssetPath(videoResp.videoUrl);
      const src = toImgProxyUrl(global, origin, videoPath);

      let poster: string | undefined;
      if (typeof videoResp.thumbnailImageUrl === "string" && videoResp.thumbnailImageUrl) {
        const thumbPath = encodeAssetPath(videoResp.thumbnailImageUrl);
        poster = toImgProxyUrl(global, origin, thumbPath);
      }

      content = buildVideoHtml({
        videoUrl: src,
        posterPreview: settings.video_poster_preview === true,
        ...(poster ? { posterUrl: poster } : {}),
      });
      model = requestedModel;
      break;
    }

    const modelResp = grok.modelResponse;
    if (!modelResp) continue;
    if (typeof modelResp.error === "string" && modelResp.error) throw new Error(modelResp.error);

    if (typeof modelResp.model === "string" && modelResp.model) model = modelResp.model;
    if (typeof modelResp.message === "string") content = modelResp.message;

    const rawUrls = modelResp.generatedImageUrls;
    const urls = normalizeGeneratedAssetUrls(rawUrls);
    if (urls.length) {
      for (const u of urls) {
        const imgPath = encodeAssetPath(u);
        const imgUrl = toImgProxyUrl(global, origin, imgPath);
        content += `\n![Generated Image](${imgUrl})`;
      }
      break;
    }

    // If upstream emits placeholder/empty generatedImageUrls in intermediate frames, keep scanning.
    if (Array.isArray(rawUrls)) continue;

    // For normal chat replies, the first modelResponse is enough.
    break;
  }

  // 对非流式响应应用 tag 过滤
  const filteredTags = (settings.filtered_tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const filteredContent = filterTagsFromContent(content, filteredTags);

  return {
    id: `chatcmpl-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: filteredContent },
        finish_reason: "stop",
      },
    ],
    usage: null,
  };
}
