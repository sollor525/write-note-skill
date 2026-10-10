/** 归档校验器与写入命令共用的封印存储逻辑。
 * manifest 是索引，ledger 是按路径排序并计算哈希链的账本，两者必须逐项一致。
 * 本地文件可被一起改写；历史保证仍依赖变更前的 Git 基线。 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { commitFileUpdates } from "./file-updates.ts";
import { join } from "node:path";

/** 一次读取拥有的封印索引；写入时与账本一起更新。 */
export interface Manifest {
    /** 固定为 1，其他版本需要显式迁移。 */
    version: 1;
    /** 归档相对路径到 sha256 摘要的映射，每个条目须对应磁盘文件。 */
    files: Record<string, string>;
}

/** 单篇归档的封印；由其所属账本持有，写入时整体重算链。 */
export interface LedgerEntry {
    /** 相对笔记根目录的 archived 路径。 */
    key: string;
    /** 原始文件字节的 sha256 摘要，含算法前缀。 */
    seal: string;
    /** 链接前一条记录的哈希；排序插入新记录后需重算后续链值。 */
    chain: string;
}

/** 本次操作独占的账本；写入命令必须串行执行。 */
export interface Ledger {
    /** 固定为 1，防止误读未知格式。 */
    version: 1;
    /** 按路径排序的封印，已有路径与摘要受 Git 基线约束。 */
    entries: LedgerEntry[];
}

export const MANIFEST_NAME = "manifest.json";
export const LEDGER_NAME = ".seal-ledger.json";

/** 封印元数据的文件名集合；不作为归档笔记扫描。 */
export const BOOKKEEPING = new Set([MANIFEST_NAME, LEDGER_NAME]);

/** 返回归档目录内的索引路径，不检查文件是否存在。 */
export const manifestPathIn = (archiveDir: string) => join(archiveDir, MANIFEST_NAME);
/** 返回归档目录内的账本路径，不检查文件是否存在。 */
export const ledgerPathIn = (archiveDir: string) => join(archiveDir, LEDGER_NAME);

/** 计算原始字节或 UTF-8 字符串的 sha256，返回不带前缀的十六进制摘要。 */
export const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

/** 读取一篇归档文件并返回带 sha256: 前缀的摘要；I/O 失败向上传递。 */
export function sealFile(notesRoot: string, relFromRoot: string): string {
    return `sha256:${sha256(readFileSync(join(notesRoot, relFromRoot)))}`;
}

/** 由前一条链值与当前路径、摘要计算新链值，不修改输入。 */
export function chainOf(prevChain: string, entry: Pick<LedgerEntry, "key" | "seal">): string {
    return sha256(`${prevChain}\n${entry.key}\n${entry.seal}`);
}

/** 读取并检查索引版本和摘要类型；缺失与损坏分别报告，不修补文件。 */
export function readManifest(path: string): { manifest: Manifest; exists: boolean; invalid: boolean } {
    if (!existsSync(path)) return { manifest: { version: 1, files: {} }, exists: false, invalid: false };
    try {
        const parsed = JSON.parse(readFileSync(path, "utf8")) as Manifest;
        if (parsed.version !== 1 || !parsed.files || typeof parsed.files !== "object" || Array.isArray(parsed.files) || Object.values(parsed.files).some((seal) => typeof seal !== "string" || !/^sha256:[a-f0-9]{64}$/.test(seal))) {
            return { manifest: { version: 1, files: {} }, exists: true, invalid: true };
        }
        return { manifest: parsed, exists: true, invalid: false };
    } catch {
        return { manifest: { version: 1, files: {} }, exists: true, invalid: true };
    }
}

/** 读取并检查账本版本与条目类型；缺失与损坏分别报告，链由 verifyChain 验证。 */
export function readLedger(path: string): { ledger: Ledger; exists: boolean; invalid: boolean } {
    if (!existsSync(path)) return { ledger: { version: 1, entries: [] }, exists: false, invalid: false };
    try {
        const parsed = JSON.parse(readFileSync(path, "utf8")) as Ledger;
        if (parsed.version !== 1 || !Array.isArray(parsed.entries) || parsed.entries.some((entry) => !entry || typeof entry.key !== "string" || typeof entry.seal !== "string" || !/^sha256:[a-f0-9]{64}$/.test(entry.seal) || typeof entry.chain !== "string" || !/^[a-f0-9]{64}$/.test(entry.chain))) {
            return { ledger: { version: 1, entries: [] }, exists: true, invalid: true };
        }
        return { ledger: parsed, exists: true, invalid: false };
    } catch {
        return { ledger: { version: 1, entries: [] }, exists: true, invalid: true };
    }
}

/** 只读验证账本链；返回已确认条目、尾哈希和首个结构或重复错误。 */
export function verifyChain(ledger: Ledger): {
    /** 已通过链校验的条目索引，条目仍归输入账本所有。 */
    byKey: Map<string, LedgerEntry>;
    /** 最后一个合法条目的链值；没有合法条目时为空串。 */
    tail: string;
    /** 首个损坏条目的路径与原因；null 表示未发现损坏。 */
    broken: { key: string; reason: string } | null;
    /** 首个重复路径；null 表示未发现重复。 */
    duplicate: string | null;
} {
    const byKey = new Map<string, LedgerEntry>();
    let prevChain = "";
    for (const entry of ledger.entries) {
        if (typeof entry?.key !== "string" || typeof entry?.seal !== "string" || typeof entry?.chain !== "string") {
            return { byKey, tail: prevChain, broken: { key: "<malformed>", reason: "malformed entry" }, duplicate: null };
        }
        if (byKey.has(entry.key)) {
            return { byKey, tail: prevChain, broken: null, duplicate: entry.key };
        }
        if (entry.chain !== chainOf(prevChain, entry)) {
            return {
                byKey,
                tail: prevChain,
                broken: { key: entry.key, reason: "chain broken; the seal history was edited, dropped or reordered" },
                duplicate: null,
            };
        }
        byKey.set(entry.key, entry);
        prevChain = entry.chain;
    }
    return { byKey, tail: prevChain, broken: null, duplicate: null };
}

/** 合并封印、按路径排序并原地重算整条链；返回本次新增或更新的条目引用。 */
function mergeAndRechain(ledger: Ledger, seals: Iterable<readonly [string, string]>): LedgerEntry[] {
    const touched: LedgerEntry[] = [];
    for (const [key, seal] of seals) {
        const existing = ledger.entries.find((e) => e.key === key);
        if (existing) {
            existing.seal = seal;
            touched.push(existing);
        } else {
            const entry: LedgerEntry = { key, seal, chain: "" };
            ledger.entries.push(entry);
            touched.push(entry);
        }
    }
    ledger.entries.sort((a, b) => a.key.localeCompare(b.key));
    rechainInPlace(ledger);
    return touched;
}

/** 记录已经通过校验的封印并成对写入元数据；输入索引会同步更新，失败抛出错误。 */
export function sealEntries(
    archiveDir: string,
    manifest: Manifest,
    seals: Iterable<readonly [string, string]>,
): LedgerEntry[] {
    const ledgerRead = readLedger(ledgerPathIn(archiveDir));
    const ledger = ledgerRead.invalid ? { version: 1, entries: [] } : ledgerRead.ledger;

    const list = [...seals];
    // 写入前再次拒绝损坏或不一致的账本，不能依赖调用方已检查的假设。
    if (ledgerRead.invalid) {
        throw new Error("archived/.seal-ledger.json exists but is not valid JSON; refusing to rebuild the seal history");
    }

    const errors = sealIndexErrors(manifest, ledger);
    if (errors.length) throw new Error(errors.join("\n"));
    const touched = mergeAndRechain(ledger, list);
    for (const [key, seal] of list) manifest.files[key] = seal;
    writeLedgerAndManifest(archiveDir, manifest, ledger);
    return touched;
}

/** 按当前条目顺序原地重算链并返回末条哈希；调用方先保证排序和输入合法。 */
export function rechainInPlace(ledger: Ledger): string {
    let prev = "";
    for (const entry of ledger.entries) {
        entry.chain = chainOf(prev, entry);
        prev = entry.chain;
    }
    return prev;
}

/** 比较两份元数据及链完整性，不修改输入；返回每项可定位错误。 */
export function sealIndexErrors(manifest: Manifest, ledger: Ledger): string[] {
    const errors: string[] = [];
    const chained = verifyChain(ledger);
    if (chained.broken) errors.push(`archived/.seal-ledger.json — chain broken at ${chained.broken.key}: ${chained.broken.reason}`);
    if (chained.duplicate) errors.push(`archived/.seal-ledger.json — duplicate entry for ${chained.duplicate}`);
    for (const [key, seal] of Object.entries(manifest.files)) {
        const entry = chained.byKey.get(key);
        if (!entry) errors.push(`${key} — manifest entry missing from seal history`);
        else if (entry.seal !== seal) errors.push(`${key} — manifest seal differs from seal history`);
    }
    for (const key of chained.byKey.keys()) {
        if (!Object.hasOwn(manifest.files, key)) errors.push(`${key} — seal history entry missing from manifest`);
    }
    return errors;
}

/** 生成两份封印文件的完整内容；输入必须已排序且相互一致，不执行 I/O。 */
export function sealFileUpdates(archiveDir: string, manifest: Manifest, ledger: Ledger): Map<string, string> {
    const errors = sealIndexErrors(manifest, ledger);
    if (errors.length) throw new Error(errors.join("\n"));
    const sortedKeys = [...ledger.entries].sort((a, b) => a.key.localeCompare(b.key)).map((entry) => entry.key);
    if (sortedKeys.join("\u0000") !== ledger.entries.map((entry) => entry.key).join("\u0000")) {
        throw new Error("internal: ledger entries are not in sorted key order");
    }
    const files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
    return new Map([
        [manifestPathIn(archiveDir), JSON.stringify({ version: 1, files }, null, 2) + "\n"],
        [ledgerPathIn(archiveDir), JSON.stringify(ledger, null, 2) + "\n"],
    ]);
}

/** 成对更新索引和账本；普通写入失败时恢复原内容并抛出错误。 */
export function writeLedgerAndManifest(archiveDir: string, manifest: Manifest, ledger: Ledger): void {
    commitFileUpdates(sealFileUpdates(archiveDir, manifest, ledger));
}

/**
 * 为归档命令准备新增封印，不写文件；损坏、缺失或不一致的既有元数据直接失败。
 * 返回内容由调用方与笔记移动一起提交，调用期间不得并行修改归档目录。
 */
export function prepareNewSeal(archiveDir: string, key: string, seal: string): Map<string, string> {
    const manifestRead = readManifest(manifestPathIn(archiveDir));
    const ledgerRead = readLedger(ledgerPathIn(archiveDir));
    if (manifestRead.invalid || ledgerRead.invalid) throw new Error("Invalid archive manifest or seal history; restore the original files before archiving");
    if (manifestRead.exists !== ledgerRead.exists) throw new Error("Archive manifest and seal history must both exist; restore the missing file before archiving");
    const manifest = manifestRead.manifest;
    const ledger = ledgerRead.ledger;
    const errors = sealIndexErrors(manifest, ledger);
    if (errors.length) throw new Error(errors.join("\n"));
    if (Object.hasOwn(manifest.files, key)) throw new Error(`Archive already has a seal for ${key}`);
    // 新归档不能顺便重新封印旧内容；检查所有旧条目后才生成变更。
    for (const [oldKey, oldSeal] of Object.entries(manifest.files)) {
        const prefix = "archived/";
        if (!oldKey.startsWith(prefix) || oldKey.split("/").some((part) => part === "..")) throw new Error(`Invalid archive path: ${oldKey}`);
        const actual = `sha256:${sha256(readFileSync(join(archiveDir, oldKey.slice(prefix.length))))}`;
        if (actual !== oldSeal) throw new Error(`${oldKey} — seal mismatch; restore archived content before archiving another note`);
    }
    mergeAndRechain(ledger, [[key, seal]]);
    manifest.files[key] = seal;
    return sealFileUpdates(archiveDir, manifest, ledger);
}
