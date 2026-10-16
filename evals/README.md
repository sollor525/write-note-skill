# 模型行为评测

这里验证模型使用 skill 后实际选择了什么文件动作，补充 `test-gates` 的格式、路径、归档和看板回归测试。场景中的请求明确调用技能，不评估自动发现或未调用技能时的行为。

## 运行

需要 Node.js 24、Git、已安装并登录的 Codex CLI。真实评测会调用模型并消耗用量；默认沿用本机模型配置，不在 CI 自动执行。

```sh
npm run test-evals
npm run eval-notes
npm run eval-notes -- --case complete-proposal,reject-proposal
npm run eval-notes -- --edition zh --case local-fix,existing-adr
npm run eval-notes -- --prepare --case partial-supersession
```

`test-evals` 只测试评分器能否拒绝错误结果，不调用模型。`--prepare` 只创建夹具和请求，不计入通过数。可用 `--model <名称>` 显式指定模型、`--timeout <秒>` 设置每例上限（默认 300，范围 10–1800），或 `--output /tmp/<新目录>` 保留到指定位置；目标必须不存在且位于本仓库之外。

每例在系统临时目录创建独立 Git 仓库，复制当前源码中的技能及初始文件。请求不包含期望动作、断言或人工评分项；模型也不需要读取评测源码。运行使用 `workspace-write` 沙箱，明确允许夹具内的 `.agents` 写入，不绕过审批或沙箱。沿用本机全局配置与指令，所以报告中的配置提示不等于服务端最终解析的完整配置。

已记录的实测：[2026-10-16 结果与内容复核](results/2026-10-16.md)。

## 场景与观察项

| 场景 | 期望动作 | 关键检查 |
|---|---|---|
| `local-fix` | 不新建 | 修复既定边界；不初始化空笔记树 |
| `fact-update` | 更新归属 | 默认值与代码同步；没有重复记录 |
| `new-decision` | 新建 | 已落地的 SQLite 选择进入 implemented |
| `complete-proposal` | 完成 | 保持身份与日期，转 implemented，移除提案骨架 |
| `reject-proposal` | 拒绝 | 转 rejected，保留原提案并说明拒绝原因 |
| `existing-adr` | 更新宿主 ADR | 保留平铺文件及 Accepted 状态；不建平行笔记库 |
| `partial-supersession` | 新建并关联 | 保留仍有效旧篇，双向链接，醒目标明替代范围 |
| `board-generation` | 生成看板 | 无 package.json 时生成本地浏览器和内嵌笔记的独立文件 |

## 结果与复核

运行器输出结果目录，其中 `report.json` 保存 CLI 版本、配置提示、技能整体 SHA-256、用量、耗时和逐例状态。每例还保留 `host/`、`prompt.txt`、`events.jsonl`、`stderr.log`、`response.md`、`changes.diff`。目录保留供复核，不会自动删除；使用完后自行清理。

- `automated-pass`：文件动作、独立代码断言和适用的真实门禁通过。**语义评审仍是 pending**。
- `behavior-fail`：模型完成调用，但结果违反文件动作或检查；退出码 1。
- `infrastructure-error`：模型调用失败、超时或缺少完成事件；退出码 2，停止后续场景，不算行为失败或通过。
- `prepared` / `notRun`：只准备或未执行，不能作为评测证据。退出码 0 也可能只是 `--prepare` 成功。

复核者应读取差异和最终回复，逐项判断 `review` 中的理由是否成立：是否保留旧理由、是否公平描述实际备选、是否误把完成当拒绝、是否虚构验证。评分器不会用关键词数量或模型自述替代这些判断；片段或数字匹配只检查文件契约与参数事实。平铺 ADR 不运行不兼容的 skill 门禁，需检查模型如实报告人工审阅。

新增场景时，将任务与初始文件放在 `note-behavior/cases.mjs`，机器断言放在 `grade.mjs`，并为新失败模式添加离线测试。每个场景只说明业务事实，不在请求里直接给出“不写 / 更新 / 新建”的答案。单次全部通过仅是此快照、配置和请求下的观察，不是稳定通过率或对其他模型的保证。
