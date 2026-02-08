import type { Env } from "../env";
import { dbFirst, dbRun } from "../db";
import { nowMs } from "../utils/time";

export interface RefreshProgress {
  running: boolean;
  current: number;
  total: number;
  success: number;
  failed: number;
  updated_at: number;
}

export async function getRefreshProgress(db: Env["DB"]): Promise<RefreshProgress> {
  const row = await dbFirst<{
    running: number;
    current: number;
    total: number;
    success: number;
    failed: number;
    updated_at: number;
  }>(
    db,
    "SELECT running, current, total, success, failed, updated_at FROM token_refresh_progress WHERE id = 1",
  );
  if (!row) {
    const now = nowMs();
    await dbRun(
      db,
      "INSERT OR REPLACE INTO token_refresh_progress(id,running,current,total,success,failed,updated_at) VALUES(1,0,0,0,0,0,?)",
      [now],
    );
    return { running: false, current: 0, total: 0, success: 0, failed: 0, updated_at: now };
  }
  return {
    running: row.running === 1,
    current: row.current,
    total: row.total,
    success: row.success,
    failed: row.failed,
    updated_at: row.updated_at,
  };
}

export async function setRefreshProgress(db: Env["DB"], p: Partial<RefreshProgress>): Promise<void> {
  const now = nowMs();
  
  // 优化：使用 UPSERT 避免先读取再更新
  // 如果记录不存在则插入默认值，存在则使用 COALESCE 合并更新
  const running = p.running !== undefined ? (p.running ? 1 : 0) : null;
  const current = p.current !== undefined ? p.current : null;
  const total = p.total !== undefined ? p.total : null;
  const success = p.success !== undefined ? p.success : null;
  const failed = p.failed !== undefined ? p.failed : null;

  await dbRun(
    db,
    `INSERT INTO token_refresh_progress(id, running, current, total, success, failed, updated_at)
     VALUES(1, COALESCE(?, 0), COALESCE(?, 0), COALESCE(?, 0), COALESCE(?, 0), COALESCE(?, 0), ?)
     ON CONFLICT(id) DO UPDATE SET
       running = COALESCE(?, token_refresh_progress.running),
       current = COALESCE(?, token_refresh_progress.current),
       total = COALESCE(?, token_refresh_progress.total),
       success = COALESCE(?, token_refresh_progress.success),
       failed = COALESCE(?, token_refresh_progress.failed),
       updated_at = ?`,
    [running, current, total, success, failed, now, running, current, total, success, failed, now],
  );
}

