import { readFileSync, readdirSync, readlinkSync, statSync } from "node:fs";
import { posix } from "node:path";
import { ROOT, ADR } from "./cases.mjs";

/** 读取宿主快照，跳过 Git 内部文件且不跟随链接；超大输出使评测失败，避免无限读取。 */
export function snapshot(root) {
    // files 保存相对路径到 UTF-8 内容（链接仅存目标文本）；directories 另存空目录。
    const files = {};
    const directories = [];
    let bytes = 0;
    /** 深度遍历本次宿主；目录名使用 POSIX 分隔符以稳定报告和规则匹配。 */
    function walk(relative = "") {
        for (const entry of readdirSync(`${root}/${relative}`, { withFileTypes: true })) {
            if (!relative && entry.name === ".git") continue;
            const path = relative ? `${relative}/${entry.name}` : entry.name;
            const absolute = `${root}/${path}`;
            if (entry.isSymbolicLink()) {
                files[path] = `SYMLINK: ${readlinkSync(absolute)}`;
            } else if (entry.isDirectory()) {
                directories.push(path);
                walk(path);
            } else if (entry.isFile()) {
                bytes += statSync(absolute).size;
                if (bytes > 16 * 1024 * 1024) throw new Error("Host output exceeds the 16 MiB snapshot limit");
                files[path] = readFileSync(absolute, "utf8");
            } else {
                throw new Error(`Unsupported output file: ${path}`);
            }
        }
    }
    walk();
    return { files, directories };
}

/** 提取 H2 小节正文；缺节返回空串，不用正文关键词冒充语义判断。 */
function section(text, heading) {
    const marker = `## ${heading}\n`;
    const start = text.indexOf(marker);
    if (start < 0) return "";
    return text.slice(start + marker.length).split(/\n## /)[0].trim();
}

/** 检查笔记之间的相对链接实际指向目标文件；忽略片段，不接受仅提到文件名。 */
function linksTo(text, from, target) {
    return [...text.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)].some((match) => {
        const href = match[1].split("#")[0];
        return posix.normalize(posix.join(posix.dirname(from), href)) === target;
    });
}

/** 按实际文件评动作，不读取模型自述；代码断言与格式门禁由运行器另行执行。 */
export function grade(testCase, before, after) {
    const failures = [];
    const changed = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])]
        .filter((path) => before.files[path] !== after.files[path]).sort();
    const notes = Object.keys(after.files).filter((path) => path.startsWith(`${ROOT}/`) && path.endsWith(".md"));
    const fresh = notes.filter((path) => !(path in before.files));
    const owner = testCase.owner;
    const text = after.files[owner] || "";
    /** 累积所有失败，避免第一个错误遮住错误迁移或重复记录等独立问题。 */
    function require(condition, message) {
        if (!condition) failures.push(message);
    }

    // 限定任务的输出范围；允许为代码任务新增测试，但不允许修改输入测试或技能快照。
    for (const path of changed) {
        const allowed = testCase.mutable.includes(path)
            || (!(path in before.files) && path.startsWith(`${ROOT}/`) && path.endsWith(".md") && ["create", "implement", "reject", "supersede"].includes(testCase.action))
            || (!(path in before.files) && testCase.checks.length > 0 && /(?:^tests?\/.*|(?:^|\/)test[-_.][^/]+|\.test)\.mjs$/.test(path))
            || (testCase.action === "board" && ["board.html", "demo.html"].includes(path));
        require(allowed, `Unexpected file change: ${path}`);
    }
    if (["none", "adr"].includes(testCase.action)) {
        require(!after.directories.includes(ROOT), "Created a parallel or empty skill note tree");
        require(notes.length === 0, "Created a note where none was needed");
    }
    if (["update", "adr"].includes(testCase.action)) {
        require(text !== "" && changed.includes(owner), "Did not update the owning record");
        require(/\b2000\b/.test(text) && !/\b1000\b/.test(text), "The recorded timeout is stale");
        require(fresh.length === 0, "Created a duplicate record for a fact-only change");
        if (testCase.action === "adr") {
            require(text.startsWith("# 0001. Bound request time\n") && /^Status: Accepted$/m.test(text), "Changed the host ADR identity or status convention");
            for (const heading of ["Context", "Decision", "Consequences"]) require(section(text, heading), `Missing host ADR section: ${heading}`);
            require(changed.filter((path) => path.startsWith("docs/adr/")).every((path) => path === ADR), "Migrated or duplicated the flat ADR");
        } else {
            require(notes.length === 1, "Fact update must retain exactly one decision record");
        }
    }
    if (testCase.action === "create") {
        require(notes.length === 1 && fresh.length === 1, "Expected exactly one new decision");
        require(fresh.every((path) => path.startsWith(`${ROOT}/implemented/`)), "Recorded landed code as proposed or rejected");
    }
    if (["implement", "reject"].includes(testCase.action)) {
        const state = testCase.action === "implement" ? "implemented" : "rejected";
        const target = owner.replace("/proposed/", `/${state}/`);
        const moved = after.files[target] || "";
        require(!(owner in after.files), "Left the original proposal active");
        require(notes.length === 1 && notes[0] === target, `Expected a move to ${target}, preserving the date and class`);
        require(new RegExp(`^Status: ${state}(?:$| — .+)$`, "m").test(moved), `Incorrect ${state} status`);
        if (state === "rejected") {
            require(/^Status: rejected — \S.+$/m.test(moved), "Missing rejection reason");
            require(section(moved, "Proposal") === section(before.files[owner], "Proposal"), "Rewrote or removed the rejected proposal");
        }
    }
    if (testCase.action === "supersede") {
        require(text !== "" && changed.includes(owner), "Removed the old record or omitted its supersession notice");
        require(notes.length === 2 && fresh.length === 1, "Expected the existing record and one successor");
        require(notes.every((path) => path.startsWith(`${ROOT}/implemented/`)), "Archived or rejected the still-valid decision");
        if (fresh.length === 1) {
            require(linksTo(text, owner, fresh[0]), "Old decision does not link to its successor");
            require(linksTo(after.files[fresh[0]], fresh[0], owner), "Successor does not link back to the old decision");
            require(linksTo(section(text, "Problem").slice(0, 700), owner, fresh[0]), "Supersession link is not prominent in Problem");
        }
    }
    if (testCase.action === "board") {
        const board = after.files["board.html"] || "";
        const demo = after.files["demo.html"] || "";
        for (const [name, html] of [["board.html", board], ["demo.html", demo]]) {
            require(html.includes('generator" content="agent-notes-board"'), `${name} is not a generated board`);
            require(html.includes('id="brand-project-title">Fixture Decisions<'), `${name} has the wrong title`);
        }
        require(board.includes("window.__INLINE_DATA__ = null;"), "Local viewer has the wrong data mode");
        require(!demo.includes("window.__INLINE_DATA__ = null;") && demo.includes("Bounded request time") && demo.includes("1000"), "Standalone board does not embed the existing note");
    }
    // passed 仅表示文件动作；changed/failures 为证据和错误，review 留给人工判断语义。
    return { passed: failures.length === 0, changed, failures, review: testCase.review };
}
