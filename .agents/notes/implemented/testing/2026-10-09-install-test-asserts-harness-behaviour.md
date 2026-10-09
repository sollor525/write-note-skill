# Agent Note: 安装测试按 harness 行为断言，并显式给 shell 参数加引号

Status: implemented

## Problem

`test-skill-install.mjs` 是唯一真正驱动 `skills` 安装器的测试，它此前只断言"文件存在"，因此漏掉了三类真实缺陷，而文档把它们当成已兑现的承诺：

1. **Claude Code 拿到的是链接，不是目录。** 安装器把 `.claude/skills/<名字>` 建成指向通用 `.agents/skills/<名字>` 的链接（Windows 上是 junction）。原测试只用 `readdirSync` 看内容，链接与真实目录无法区分，"是不是链接"从未被验证。
2. **语言选择没有验证。** 测试从不传 `--skill`，因此"装中文版不会顺带装英文版"这件事没有测试覆盖。
3. **交付内容只查存在性，不查内容。** 上游安装器出过"子目录未被下载"的问题，而 `references/`、`templates/`、看板模板都只被检查了文件是否存在。

同时这个脚本**在 Windows 上根本跑不起来**：`spawnSync('npx')` 报 ENOENT（`npx` 是 shell 脚本而非可执行文件），改成 `spawnSync('npx.cmd')` 报 EINVAL（Node 拒绝直接 spawn `.cmd`）。它只在 Linux CI 上跑过，所以一直没暴露。

## Decision

测试改为断言**安装器的行为**，而不是文件存在性：

- 断言通用目录与 Claude Code 目录都存在，且 Claude Code 那条在默认模式下确实是能解析到通用目录的链接（`lstatSync().isSymbolicLink()` 加 `realpathSync` 比对），在 `--copy` 模式下则是内容完整的真实目录；
- 断言 `--skill` 只装被点名的语言版本，另一版不出现；
- 用一个目录遍历函数把交付文件列表与源目录逐字节比对，而不是抽查几个文件名；
- 覆盖多种 harness：只用通用目录的（Codex、Gemini CLI、GitHub Copilot）与需要自己目录的（Claude Code）一起装，确认共用与分发的行为都对。

调用 shell 的问题上，选择"显式加引号 + `shell: true`"：先给每个参数套上按需引号，再交给 shell 执行，从而同时满足"Windows 上能启动 `npx`"与"含空格的参数不被拆开"。

## Alternatives considered

- **继续只断言文件存在**——正是这套断言让三类缺陷同时潜伏；放宽断言的收益是零，代价是文档承诺持续无法验证。放弃。
- **`spawnSync('npx.cmd')` 直接启动**——Node 出于安全考虑拒绝直接启动 `.cmd`/`.bat`，报 EINVAL。放弃。
- **`shell: true` 但不加引号**——这是实测踩到的坑：`'Install check'` 被 shell 按空格拆成两个参数，看板标题静默变成 `Install`。这类失败不会报错，只是产物悄悄错了。因此必须显式引号。
- **改用 `execFileSync('npx', ...)`**——在 Windows 上同样失败（`.cmd` 不在 Node 直接启动的白名单内）。放弃。
- **把安装测试并进 `test-gates`**——它会联网获取 CLI 与 `tsx`，而门禁套件刻意保持离线可跑。两者分成两条命令、两个 CI 作业。

## Consequences

- **收益**：文档承诺的落点、语言选择与交付内容第一次被真正验证；同一份测试在 Windows 与 Linux 上都能跑。CI 的 install 作业已在真实推送上通过。
- **代价与已知上限**：测试依赖网络与固定的 CLI 版本 `skills@1.7.1`，安装器升级后需要重新核对断言。参数引号是自己实现的（跨平台加引号没有标准库可用），当前只处理空格与双引号——所有参数都是字面量或本仓库控制的绝对路径，不接受外部输入。

## Verification

- `npm run test-skill-install` 三条断言线全部通过：默认模式（通用目录 + Claude Code 链接、宿主门禁、两种看板、归档与重校验）、`--copy` 模式（英文版、两侧都是完整真实目录）、多语言多 harness。
- GitHub Actions 的 `install` 作业在该提交上通过，`gates` 作业的失败与本测试无关。
