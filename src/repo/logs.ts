import type { Env } from "../env";
import { dbAll, dbRun } from "../db";
import { nowMs, formatUtcMs } from "../utils/time";

export interface RequestLogRow {
  id: string;
  time: string;
  timestamp: number;
  ip: string;
  model: string;
  duration: number;
  status: number;
  key_name: string;
  token_suffix: string;
  error: string;
}

export async function addRequestLog(
  db: Env["DB"],
  entry: Omit<RequestLogRow, "id" | "time" | "timestamp"> & { id?: string },
): Promise<void> {
  const ts = nowMs();
  const id = entry.id ?? String(ts);
  const time = formatUtcMs(ts);
  await dbRun(
    db,
    "INSERT INTO request_logs(id,time,timestamp,ip,model,duration,status,key_name,token_suffix,error) VALUES(?,?,?,?,?,?,?,?,?,?)",
    [
      id,
      time,
      ts,
      entry.ip,
      entry.model,
      entry.duration,
      entry.status,
      entry.key_name,
      entry.token_suffix,
      entry.error,
    ],
  );
}

export async function getRequestLogs(db: Env["DB"], limit = 1000): Promise<RequestLogRow[]> {
  return dbAll<RequestLogRow>(
    db,
    "SELECT id,time,timestamp,ip,model,duration,status,key_name,token_suffix,error FROM request_logs ORDER BY timestamp DESC LIMIT ?",
    [limit],
  );
}

export async function clearRequestLogs(db: Env["DB"]): Promise<void> {
  await dbRun(db, "DELETE FROM request_logs");
}

export interface RequestStats {
  hourly: Array<{ hour: string; success: number; failed: number }>;
  daily: Array<{ date: string; success: number; failed: number }>;
  models: Array<{ model: string; count: number }>;
  summary: { total: number; success: number; failed: number; success_rate: number };
}

function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 400;
}

function toIsoHourKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}`;
}

function toIsoDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getRequestStats(db: Env["DB"]): Promise<RequestStats> {
  const now = nowMs();
  const since24h = now - 24 * 60 * 60 * 1000;
  const since14d = now - 14 * 24 * 60 * 60 * 1000;
  const since7d = now - 7 * 24 * 60 * 60 * 1000;

  // 优化：只查询一次 14 天数据，24 小时数据在内存中过滤
  // 同时并行执行 14 天日志查询和模型统计查询
  const [last14, models] = await Promise.all([
    dbAll<Pick<RequestLogRow, "timestamp" | "status">>(
      db,
      "SELECT timestamp, status FROM request_logs WHERE timestamp >= ? ORDER BY timestamp ASC",
      [since14d],
    ),
    dbAll<{ model: string; count: number }>(
      db,
      "SELECT model, COUNT(1) as count FROM request_logs WHERE timestamp >= ? GROUP BY model ORDER BY count DESC LIMIT 8",
      [since7d],
    ),
  ]);

  const hourlyMap = new Map<string, { success: number; failed: number }>();
  const dailyMap = new Map<string, { success: number; failed: number }>();
  let success = 0;
  let failed = 0;

  // 单次遍历同时计算 hourly（24h）和 daily（14d）统计
  for (const r of last14) {
    const isSuccess = isSuccessStatus(r.status);
    
    // daily 统计（14 天全部数据）
    const dayKey = toIsoDateKey(r.timestamp);
    const dayCur = dailyMap.get(dayKey) ?? { success: 0, failed: 0 };
    if (isSuccess) dayCur.success += 1;
    else dayCur.failed += 1;
    dailyMap.set(dayKey, dayCur);

    // hourly 统计（仅 24 小时内的数据）
    if (r.timestamp >= since24h) {
      const hourKey = toIsoHourKey(r.timestamp);
      const hourCur = hourlyMap.get(hourKey) ?? { success: 0, failed: 0 };
      if (isSuccess) {
        hourCur.success += 1;
        success += 1;
      } else {
        hourCur.failed += 1;
        failed += 1;
      }
      hourlyMap.set(hourKey, hourCur);
    }
  }

  const hourly: Array<{ hour: string; success: number; failed: number }> = [];
  const startHour = now - 23 * 60 * 60 * 1000;
  for (let i = 0; i < 24; i++) {
    const ts = startHour + i * 60 * 60 * 1000;
    const key = toIsoHourKey(ts);
    const h = new Date(ts).getUTCHours();
    const label = `${String(h).padStart(2, "0")}:00`;
    const v = hourlyMap.get(key) ?? { success: 0, failed: 0 };
    hourly.push({ hour: label, success: v.success, failed: v.failed });
  }

  const daily: Array<{ date: string; success: number; failed: number }> = [];
  const startDay = now - 13 * 24 * 60 * 60 * 1000;
  for (let i = 0; i < 14; i++) {
    const ts = startDay + i * 24 * 60 * 60 * 1000;
    const key = toIsoDateKey(ts);
    const v = dailyMap.get(key) ?? { success: 0, failed: 0 };
    daily.push({ date: key, success: v.success, failed: v.failed });
  }

  const total = success + failed;
  const success_rate = total > 0 ? Math.round((success / total) * 1000) / 10 : 0;

  return { hourly, daily, models, summary: { total, success, failed, success_rate } };
}
