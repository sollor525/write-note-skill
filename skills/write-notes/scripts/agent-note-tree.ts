/** 笔记目录的共享结构规则；根目录来自 AGENT_NOTE_ROOT 或宿主当前目录。 */
import { readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** 递归收集普通 Markdown 文件并返回相对路径；点目录也参与检查，读取失败直接抛出。 */
function listMd(dir: string, prefix: string): string[] {
    if (!existsSync(dir)) return []
    const out: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) out.push(...listMd(resolve(dir, entry.name), rel))
        else if (entry.isFile() && entry.name.endsWith('.md')) out.push(rel)
    }
    return out
}

/** 解析宿主笔记根目录；环境变量相对当前目录展开，不创建目录。 */
function resolveAgentNoteRoot(): string {
    if (process.env.AGENT_NOTE_ROOT) return resolve(process.env.AGENT_NOTE_ROOT)
    return resolve(process.cwd(), '.agents/notes')
}

export const agentNoteRoot = resolveAgentNoteRoot()

const AGENT_NOTE_LIFECYCLES = ['proposed', 'implemented', 'rejected'] as const
export const AGENT_NOTE_CLASSES = ['feature', 'bug-fix', 'simplification', 'architecture', 'process', 'testing'] as const
export const AGENT_NOTE_ARCHIVE = 'archived'

/** 一篇活跃笔记的目录身份；所有路径均相对本次扫描根目录。 */
export interface AgentNote {
    /** proposed、implemented 或 rejected，由一级目录确定。 */
    lifecycle: string
    /** 包含中文配对后缀的实际文件路径，读取时不可替换为基础文件。 */
    rel: string
    /** 文件名中的首次提出日，格式 YYYY-MM-DD。 */
    date: string
}

/** 只读遍历全部活跃笔记，收集合法路径与结构错误；I/O 错误直接抛出。 */
export function walkAgentNoteTree(): { notes: AgentNote[]; errors: string[] } {
    const notes: AgentNote[] = []
    const errors: string[] = []
    if (!existsSync(agentNoteRoot)) return { notes, errors }
    for (const entry of readdirSync(agentNoteRoot, { withFileTypes: true })) {
        if (entry.name === 'INDEX.md') {
            errors.push('structure: INDEX.md — centralized Agent Note indexes are forbidden; browse the lifecycle/class tree or search the repository')
            continue
        }
        if (entry.isDirectory() && entry.name !== AGENT_NOTE_ARCHIVE && !(AGENT_NOTE_LIFECYCLES as readonly string[]).includes(entry.name)) {
            errors.push(`structure: ${entry.name}/ — unknown lifecycle folder (allowed: ${AGENT_NOTE_LIFECYCLES.join(', ')}, plus ${AGENT_NOTE_ARCHIVE}/)`)
        }
    }
    for (const lifecycle of AGENT_NOTE_LIFECYCLES) {
        for (const match of listMd(resolve(agentNoteRoot, lifecycle), lifecycle).sort()) {
            const segs = match.replace(/\.zh\.md$/, '.md').split('/')
            // 中文配对文件必须有基础文件；两篇均加入结果，分别接受内容与链接检查。
            if (match.endsWith('.zh.md')) {
                const baseRel = `${match.slice(0, -'.zh.md'.length)}.md`
                if (!existsSync(resolve(agentNoteRoot, baseRel))) {
                    errors.push(`structure: ${match} — language variant requires its base note ${baseRel}`)
                }
            }
            const cls = segs[1]
            const base = segs[2]
            if (segs.length !== 3 || cls === undefined || base === undefined) {
                errors.push(`structure: ${match} — expected {lifecycle}/{class}/file.md (got depth ${segs.length})`)
                continue
            }
            if (!(AGENT_NOTE_CLASSES as readonly string[]).includes(cls)) {
                errors.push(`structure: ${match} — unknown class folder "${cls}" (allowed: ${AGENT_NOTE_CLASSES.join(', ')})`)
                continue
            }
            if (!/^\d{4}-\d{2}-\d{2}-.+\.md$/.test(base)) {
                errors.push(`structure: ${match} — filename must be yyyy-mm-dd-topic.md`)
                continue
            }
            notes.push({ lifecycle, rel: match, date: base.slice(0, 10) })
        }
    }
    return { notes, errors }
}
