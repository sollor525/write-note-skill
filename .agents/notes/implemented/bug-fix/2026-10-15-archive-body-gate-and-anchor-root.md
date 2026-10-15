# Agent Note: 归档前跑完整格式校验，锚点匹配锚定笔记自身路径

Status: implemented

## Problem

外部评审（2026-10-15）发现两条门禁缺口，都会让"检查通过"名不副实：

1. **归档是格式校验的盲区。** `archive-agent-note.ts` 只校验固定头部四行就允许移动；`verify-agent-note-format.ts` 只遍历活跃树，而归档后的笔记落在 `archived/` 下不再被遍历。一篇缺少 `## Alternatives considered` 的 `implemented` 笔记会被格式门禁拒绝，却能正常归档并以非零风险进入冻结区——归档正是笔记变永久的一刻，最不该少检。

2. **锚点路径写死 `.agents/notes/`。** `check-note-anchors.ts` 的 `PATH_RE` 硬编码该前缀，而所有其他工具都尊重 `AGENT_NOTE_ROOT`。笔记放在 `docs/adr/` 的宿主里，写 `// Note: ... docs/adr/...` 会被报成"缺路径的锚点"，真正的锚点又匹配不上任何笔记，报告整体失真。

## Decision

正文规则提取为 `note-sections.ts` 的 `validateNoteContent`，由格式门禁与归档命令共用同一份实现：头部形状、状态行唯一性、首节、必需小节、`implemented` 禁用的提案期标题、备选方案与 grandfather 标记判定都在其中。`archive-agent-note.ts` 在**写入任何文件之前**对源文件跑一遍该校验，失败时逐条打印原因并拒绝归档，源文件与封印文件均不动。归档因此不再是格式门禁的盲区。

锚点匹配改为锚定笔记自身的 `{lifecycle}/{class}/file.md` 三段，路径前缀不再参与匹配：绝对路径、相对仓库根、相对书写文件三种写法得到同一结果。前缀仍要求以分隔符或字符串起始为界，避免 `my-rejected/x/y.md` 之类的片段被当成笔记路径。识别到的三段直接拼在 `agentNoteRoot` 之下，悬空锚点与"缺路径的锚点"继续分别报告。

## Alternatives considered

- **只把归档命令改成调用格式校验脚本** —— 无需重构。但那需要子进程或复制一份规则，而规则复制正是本仓库已记录过两次的缺陷来源；提取共享函数是同一份逻辑的第二处调用。放弃。
- **归档时只检查正文小节，不检查头部** —— 改动更小。但头部契约与正文骨架同属一份格式契约，分开维护会再次分叉；归档命令本来已在检查头部，合并后判据只有一处。放弃。
- **锚点匹配保留前缀推导，按"代码文件目录 / 仓库根 / 绝对路径"三种写法枚举正则** —— 表面上最贴近原实现。但同一路径的三种写法共享同一尾段，正则会在更靠后的位置用短前缀抢先匹配，把后面三段切错位（实现过程中实测到 `bug-fix/2026-10-10-cr.md/undefined` 这类错位键）。锚定笔记自身三段没有这个歧义。放弃。
- **锚点匹配只扫 `implemented/` 与 `rejected/`，不要求任何前缀** —— 最简单。但 `src/implemented/foo/bar.md` 这种用户代码目录会被误报为悬空锚点；锚点检查是软报告，误报会直接降低它的可信度。改为锚定三段并保留前缀边界，误报面收窄到"代码目录恰好复用同一套生命周期名"，可接受。放弃。

## Consequences

- **收益**：归档前置条件与格式门禁在正文上完全一致，"能归档"不再意味着"没被格式校验过"；自定义笔记根目录的锚点报告恢复可信，真实锚点不再被误判为缺路径。
- **代价与已知上限**：归档现在会因正文不合规而失败，宿主若有历史遗留的残缺 `implemented` 笔记，将无法再归档——需先修正文（或对 `FORMAT_ADOPTED` 之前的旧笔记使用 grandfather 标记）。锚点匹配仍可能对"代码目录恰好复用 `proposed|implemented|rejected` + 两段路径"的仓库产生悬空误报；出现该信号时按实际笔记根目录收敛扫描范围。
- 归档失败现在会在 `stderr` 打印具体小节缺项，重跑前无需猜测原因。

## Verification

`npm run test-gates` 新增断言：缺 `## Alternatives considered` 的笔记被格式门禁与归档命令**同时**拒绝，且源文件字节不变、`archived/` 未被创建；残留 `## Plan` 的 `implemented` 笔记两条路径一致拒绝；`AGENT_NOTE_ROOT=docs/adr` 的临时宿主里，`docs/adr/...` 锚点被识别、悬空锚点被报告、已锚定的 implemented 笔记不计入"无锚点"。当前 111/111 通过；`npm run verify-notes`、`npm run verify-notes-en` 均通过。
