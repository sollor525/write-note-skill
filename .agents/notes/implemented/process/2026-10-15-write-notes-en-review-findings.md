# Agent Note: write-notes-en 评审发现及已完成的处置

Status: implemented

## Problem

2026-10-15 对 `skills/write-notes-en/` 的外部评审发现 7 项问题。其中归档缺口已复现：缺少 `## Alternatives considered` 的笔记会被活跃树格式门禁拒绝，却能被归档并通过归档校验。评审清单需要保留可追溯的处置结果，且生命周期必须反映修复是否落地。

完整评审证据保留在仓库根目录 `REVIEW.md`。原记录因“没有待办”被误放进 rejected；完成实现应标记 implemented，只有未实现且明确放弃的方案才是 rejected。

## Decision

本篇作为已完成的评审清单保留在 `implemented/process/`，日期仍为首次提出日。实现规则分别由[归档校验](../bug-fix/2026-10-15-archive-body-gate-and-anchor-root.md)、[完整锚点路径解析](../bug-fix/2026-10-16-resolve-full-note-anchor-paths.md)与[双语笔记配对](2026-10-15-bilingual-note-pairing-exception.md)维护，本篇只记录发现与落点。

| 发现 | 处置 |
|---|---|
| #1 归档跳过正文格式门禁 | 共用 `validateNoteContent`，写入前校验正文；无效输入不改变源文件或封印 |
| #2 锚点检查写死 `.agents/notes/` | 按完整路径解析并检查 `AGENT_NOTE_ROOT` 边界；相对路径、错误前缀和同名文件均有回归覆盖 |
| #3 `AGENT_NOTE_CODE_ROOTS` 未入文档 | 两版参考文档记录多扫描根与旧单数变量兼容 |
| #4 CI 注释用例数过期 | 注释改为描述离线回归套件，用例数以测试输出为准 |
| #5 README 脚本名不符 | 宿主脚本示例统一为 `archive-agent-note` |
| #6 `-en.md` 绕过配对约定 | 保留本仓库例外，以结构和元数据同步守卫检查 |
| #7 漏译守卫只扫 `SKILL.md` | 扩至英文版全部文档，只豁免门禁支持的中文别名与状态示例 |

两版技能入口和流转说明都明确区分“已完成”与“未实现且放弃”，避免再次把已实现方案归入 rejected。

## Alternatives considered

- **保持 proposed 并在正文写已完成**：不必移动文件，但状态与实际工作相矛盾，检索仍会把它当待办。
- **因为没有待办而标记 rejected**：可以从待办列表移除，但会错误表示这些修复未被采纳；生命周期取决于实际处置，而非待办数量。
- **删除本篇**：减少一个文件，但会丢失七项发现与各实现记录之间的直接对应关系，因此保留精简的完成记录。

## Consequences

检索和看板能正确区分已完成与被否决的提案。实现细节仍保存在各自的归属笔记，避免多处维护。历史评审的行号和测试计数只是当时快照，判断当前状态需要重跑检查。

## Verification

`npm run verify-notes` 与 `npm run verify-notes-en` 检查移动后的状态、正文和相对链接。`npm run test-gates` 覆盖原评审的格式、归档、双语配对问题及本次补齐的锚点边界场景。
