/** 少量关联文件的批量更新：先准备全部内容，普通 I/O 失败时恢复已改文件。 */
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** 一次调用独占的文件快照；内存占用与本批文件总字节数成正比。 */
interface Snapshot {
    /** 更新前的原始字节；null 表示原路径不存在。 */
    original: Buffer | null;
    /** 原文件权限位；新文件使用常规创建权限并受 umask 限制。 */
    mode: number;
    /** 与目标处于同一目录的临时文件路径，调用结束前清理。 */
    temporary: string;
}

/**
 * 按映射顺序替换或删除文件；null 表示删除，其他值是完整新内容。
 * 输入错误发生在首次替换前；写入失败则回滚并抛出原始原因及恢复错误。
 * 调用方必须串行写入这些路径；不承诺进程被终止或断电时的跨文件原子性。
 */
export function commitFileUpdates(updates: ReadonlyMap<string, string | Buffer | null>): void {
    const snapshots = new Map<string, Snapshot>();
    const applied: string[] = [];
    const failures: unknown[] = [];
    try {
        // 先读取所有旧内容，拒绝目录和符号链接，避免更新一半才发现输入不合法。
        for (const path of updates.keys()) {
            const stat = existsSync(path) ? lstatSync(path) : null;
            if (stat && !stat.isFile()) throw new Error(`Refusing to replace a non-regular file: ${path}`);
            snapshots.set(path, {
                original: stat ? readFileSync(path) : null,
                mode: stat ? stat.mode & 0o777 : 0o666,
                temporary: `${path}.${randomUUID()}.tmp`,
            });
        }
        for (const [path, content] of updates) {
            if (content === null) continue;
            mkdirSync(dirname(path), { recursive: true });
            const snapshot = snapshots.get(path)!;
            writeFileSync(snapshot.temporary, content, { flag: "wx", mode: snapshot.mode });
        }
        for (const [path, content] of updates) {
            if (content === null) rmSync(path);
            else renameSync(snapshots.get(path)!.temporary, path);
            applied.push(path);
        }
    } catch (error) {
        failures.push(error);
        for (const path of applied.reverse()) {
            const snapshot = snapshots.get(path)!;
            try {
                if (snapshot.original === null) rmSync(path, { force: true });
                else {
                    writeFileSync(snapshot.temporary, snapshot.original, { mode: snapshot.mode });
                    renameSync(snapshot.temporary, path);
                }
            } catch (restoreError) {
                failures.push(new Error(`Could not restore ${path}; restore it from version control before retrying`, { cause: restoreError }));
            }
        }
    } finally {
        for (const snapshot of snapshots.values()) {
            try {
                rmSync(snapshot.temporary, { force: true });
            } catch (cleanupError) {
                failures.push(new Error(`Could not remove temporary file ${snapshot.temporary}`, { cause: cleanupError }));
            }
        }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length) throw new AggregateError(failures, "File update or recovery failed; inspect the reported paths before retrying");
}
