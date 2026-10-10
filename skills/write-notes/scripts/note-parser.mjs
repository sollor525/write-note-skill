/**
 * 创建无文件系统依赖的笔记解析器；词汇表由调用方提供，不修改输入。
 * 函数及其内部实现可完整内嵌到单文件看板，浏览器和 Node 使用同一份逻辑。
 */
export function createNoteParser(vocabulary) {
    /** 归一化换行后保留原始行，并遮住代码块、注释和引用；行号从零开始。 */
    function mask(raw) {
        const lines = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
        let fence = '';
        let commented = false;
        const visible = lines.map((line) => {
            if (fence) {
                const end = /^ {0,3}(`+|~+)\s*$/.exec(line);
                if (end && end[1][0] === fence[0] && end[1].length >= fence.length) fence = '';
                return '';
            }

            // 注释可以跨行，也可以出现在正文中间；只移除注释本身。
            let rest = line;
            let text = '';
            while (rest) {
                if (commented) {
                    const end = rest.indexOf('-->');
                    if (end === -1) break;
                    rest = rest.slice(end + 3);
                    commented = false;
                } else {
                    const start = rest.indexOf('<!--');
                    if (start === -1) {
                        text += rest;
                        break;
                    }
                    text += rest.slice(0, start);
                    rest = rest.slice(start + 4);
                    commented = true;
                }
            }
            const start = /^ {0,3}(`{3,}|~{3,})/.exec(text);
            if (start) {
                fence = start[1];
                return '';
            }
            return /^\s*>/.test(text) ? '' : text;
        });
        return {
            // 换行归一化后的完整原文行，供小节正文提取使用。
            lines,
            // 与原文一一对应的可见行；示例和注释位置为空字符串。
            visible,
        };
    }

    /** 去掉二级标题前缀与括号说明，返回用于匹配词汇表的名称。 */
    function headingBase(heading) {
        return heading.replace(/^##\s+/, '').replace(/[（(].*$/, '').trimEnd();
    }

    /** 返回真实二级标题的位置和完整正文；代码示例中的标题不切分小节。 */
    function sections(raw) {
        const { lines, visible } = mask(raw);
        const headings = [];
        for (let index = 0; index < visible.length; index++) {
            if (visible[index].startsWith('## ')) {
                // 每个小节记录归本次解析所有；正文在下一遍填充。
                headings.push({
                    // 去掉括号说明后的标题，供别名匹配使用。
                    name: headingBase(visible[index]),
                    // 标题在归一化原文中的行号，从零开始。
                    start: index,
                    // 原文中的完整小节正文，包含其中的代码示例。
                    body: '',
                });
            }
        }
        for (let index = 0; index < headings.length; index++) {
            headings[index].body = lines.slice(headings[index].start + 1, headings[index + 1]?.start ?? lines.length).join('\n').trim();
        }
        return headings;
    }

    /** 提取正文中的行内 Markdown 链接目标；代码块、注释和行内代码不产生链接。 */
    function links(raw) {
        const text = mask(raw).visible.join('\n').replace(/(`+)[^\n]*?\1/g, '');
        return [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1].trim());
    }

    /** 解析看板记录；保留完整正文，关联目标由调用方提供的路径索引解析。 */
    function parseNote(raw, relPath, slugToId = new Map()) {
        const slug = relPath.split('/').pop().replace(/\.md$/, '');
        const [lifecycle, cls] = relPath.split('/');
        const titleLine = mask(raw).visible.find((line) => /^# Agent Note[:：]/.test(line));
        const parts = sections(raw);
        /** 按共享别名取首个真实小节，不在首个空行处截断。 */
        const body = (names) => parts.find((section) => names.includes(section.name))?.body ?? '';
        const outLinks = [];
        for (const target of links(raw)) {
            const href = target.split('#')[0].replace(/\.zh\.md$/, '.md');
            if (!href.endsWith('.md') || href.includes('://')) continue;
            const resolved = [];
            for (const segment of `${lifecycle}/${cls}/${href}`.split('/')) {
                if (segment === '..') resolved.pop();
                else if (segment && segment !== '.') resolved.push(segment);
            }
            const destination = slugToId.get(resolved.join('/')) ?? slugToId.get(href.split('/').pop().replace(/\.md$/, ''));
            if (destination && destination !== relPath) outLinks.push(destination);
        }
        // 所有正文和数组归返回值所有，调用方可以独立保存或脱敏。
        return {
            // 笔记根目录内的相对路径，作为看板主键。
            id: relPath,
            // 去掉扩展名后的文件名，含首次提出日期。
            slug,
            // 路径中的生命周期目录，由上游路径校验约束。
            lifecycle,
            // 路径中的分类目录，由上游路径校验约束。
            cls,
            // 从文件名取得的首次提出日期；无法识别时为空串。
            date: /^\d{4}-\d{2}-\d{2}/.exec(slug)?.[0] ?? '',
            // 文档标题；缺失时使用文件名作为显示名称。
            title: titleLine?.replace(/^# Agent Note[:：]\s*/, '').trim() || slug,
            // 看板筛选状态，始终跟随目录中的生命周期。
            status: lifecycle,
            // 首个问题小节的正文；缺失时为空串。
            problem: body(vocabulary.sections.problem),
            // 首个决定或提案小节的正文；缺失时为空串。
            decision: body([...vocabulary.sections.decision, ...vocabulary.sections.mandate]),
            // 首个备选方案小节的正文；缺失时为空串。
            alternatives: body(vocabulary.alternatives),
            // 首个后果小节的正文；缺失时为空串。
            consequences: body(vocabulary.sections.consequences),
            // 已解析且去重的关联笔记主键，不含自身链接。
            outLinks: [...new Set(outLinks)],
            // 未归一化的全文，保留原始换行与代码示例。
            rawBody: raw,
        };
    }

    return { mask, headingBase, sections, links, parseNote };
}
