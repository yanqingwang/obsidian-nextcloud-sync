# 回归测试报告 — obsidian-nextcloud-sync v0.1.0

生成时间：2026-08-17
运行环境：Node v26.7.0 + esbuild 0.19 + jsdom（DOMParser 注入）
测试框架：Node.js 内置 `node:test`

---

## 1. 测试结论

| 项 | 结果 |
|----|------|
| 单元/逻辑回归用例总数 | **16** |
| 通过 | **16** |
| 失败 | **0** |
| TypeScript 类型检查 (`tsc --noEmit -skipLibCheck`) | 0 错误 |
| 生产构建 (`esbuild production` → `main.js`) | 成功 (43,388 B) |

> 注：R2/R6/R8（真实 Nextcloud 服务端集成场景：跨端双向同步、chunking v2 大文件、连接容错）因沙箱无 Docker/Nextcloud 实例，**未在本环境自动跑通**，改为提供 `test/integration-webdav.sh` 脚本 + 人工验证清单（见 §5）。逻辑层已用 mock WebDAV client 覆盖协议流程。

---

## 2. 运行方式

```bash
cd obsidian-nextcloud-sync
npm install
npm test          # 等价：esbuild 打包 test/all.test.ts → node --test
```

测试文件：
- `test/obsidian-shim.ts` — 轻量 `obsidian` 模块替身（requestUrl / Vault / TFile 等），使核心逻辑可脱离 Obsidian 运行。
- `test/setup.ts` — 注入 jsdom 的 `DOMParser` 到全局（**关键修正：必须取 `new JSDOM("").window.DOMParser`，而非 `new JSDOM("").DOMParser`**）。
- `test/xmlParser.test.ts` — PROPFIND 响应解析。
- `test/conflictResolver.test.ts` — 冲突命名。
- `test/engine.test.ts` — 四象限 diff + 三种同步模式 + 忽略规则。
- `test/chunkedUpload.test.ts` — Nextcloud chunking v2 协议流程与容错。
- `test/integration-webdav.sh` — 真实服务端集成验证脚本（需 Docker Nextcloud）。

---

## 3. 用例映射（回归矩阵）

| 用例 | 覆盖回归点 | 设计文档条款 |
|------|-----------|-------------|
| parsePropfind: etag/mtime/size/type/isDir | R1 元数据解析 | V-2/V-3 |
| parsePropfind: 目录识别 + 过滤根自身 | R1 目录过滤 | V-2 |
| parsePropfind: 特殊字符路径 URL 解码 | R7 特殊字符 | V-10 |
| parsePropfind: 非 XML 安全返回空 | R1 容错 | V-2 |
| parsePropfind: oc:checksums 文本整段格式 | R1 checksum 兼容（新增） | V-3 |
| makeConflictPath: 基础命名 | R3 冲突命名 | V-4 |
| makeConflictPath: 保留目录/多扩展名 | R3 冲突命名边界 | V-4 |
| computeDiff 智能: 幂等 | R2 幂等 | V-3 |
| computeDiff 智能: 四象限 | R1 四象限 | V-2 |
| computeDiff 智能: 仅单侧存在→新增 | R1 单侧 | V-2 |
| computeDiff 强制: force-push/pull | R4 强制模式 | V-5/V-6 |
| shouldExclude: 忽略规则 | R5 忽略 | V-7 |
| shouldExclude+computeDiff: 特殊字符不被忽略 | R5+R7 交叉 | V-10 |
| uploadWithChunking: MKCOL→分块PUT→MOVE | R6 协议流程 | V-8 |
| uploadWithChunking: 单块边界 | R6 边界 | V-8 |
| uploadWithChunking: 分块失败→清理+抛错 | R6 容错 | V-8 |

---

## 4. 本次回归发现并修复的问题

### 问题 A（测试桩，已修）—— `setup.ts` DOMParser 取错层级
- **现象**：`new JSDOM("")` 解构出的 `DOMParser` 为 `undefined`，导致所有 `parsePropfind` 用例静默返回 `[]`。
- **根因**：jsdom 的 DOMParser 位于 `new JSDOM("").window.DOMParser`，而非实例顶层属性。
- **修复**：`const { DOMParser } = new JSDOM("").window;`
- **影响**：仅测试环境；生产代码在 Obsidian（浏览器环境）中 `DOMParser` 为全局，无需此桩。

### 问题 B（源码，已修并加固）—— `xmlParser.ts` 仅识别 `<oc:checksum>` 子元素
- **现象**：Nextcloud 真实返回 `<oc:checksums><oc:checksum>SHA1:..</oc:checksum>...</oc:checksums>` 时 `sha1` 为 `undefined`；部分服务器把整段放文本 `<oc:checksums>SHA1:.. MD5:..</oc:checksums>`。
- **根因**：旧代码只 `getElementsByTagNameNS("*","checksum")` 找单数子元素，漏掉复数容器整段文本。
- **修复**：同时支持「嵌套 `<oc:checksum>` 子元素」与「`<oc:checksums>` 文本整段」两种格式。
- **影响**：提升对真实 Nextcloud / ownCloud 的 checksum 兼容度（关系到 V-3 断点续传/去重判断）。

### 问题 C（构建脚本，已修）—— `esbuild.config.mjs` 依赖 cwd
- **现象**：在非插件目录下运行 `node esbuild.config.mjs production` 报 `Could not resolve "src/main.ts"`。
- **修复**：改用 `import.meta.url` 推导 `__dirname`，入口/输出均用绝对路径。

---

## 5. 真实服务端集成验证（R2/R6/R8）— 待执行清单

因当前沙箱无 Nextcloud 实例，以下为**人工/CI 验证清单**（脚本 `test/integration-webdav.sh` 已就绪）：

- [ ] 启动 `docker run -d -p 8080:80 nextcloud`（或自有服务器）
- [ ] 配置账号，在设置中填入 WebDAV 地址/账号/密码/根目录
- [ ] **R2 双向同步**：本地新建 `a.md` → 智能同步 → 服务端出现；服务端改 `a.md` → 拉取 → 本地更新；再次智能同步应为**空计划（幂等）**
- [ ] **R6 大文件**：放置 ≥ `largeFileThresholdMb` 的文件 → 走 chunking v2（观察 `.fileid.xxxx.upload` 临时目录 → MOVE）→ 校验 sha1 一致
- [ ] **R8 容错**：同步中途断网 → 应报错且不破坏已同步文件；重连后重试成功
- [ ] **V-1/V-9**：Obsidian 状态栏显示同步状态；日志侧边栏可查看/搜索/跳转

---

## 6. 交付状态

- 代码：16 个源文件 + 7 个测试文件，全部通过类型检查与单元回归。
- 构建产物：`main.js`（43,388 B）、`manifest.json`（id=`obsidian-nextcloud-sync`, v0.1.0）、`styles.css`。
- 下一步：发布到 GitHub（tag `0.1.0`，无 `v` 前缀）+ 提交 Obsidian 社区插件市场 PR + 安装到 `test` vault。
