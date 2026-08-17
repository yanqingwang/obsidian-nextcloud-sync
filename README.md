# Nextcloud Sync

一个**只面向 Nextcloud** 的 Obsidian 双向同步插件。把整个 vault（笔记 + 附件）同步到你自己的 Nextcloud，走 WebDAV 协议。

与通用型 Remotely Save 不同：专一换来更简单的设置、更可靠的变更检测（`oc:checksums` + `etag`）、原生的大文件分块上传（chunking v2），以及清晰的三态操作语义。

## 功能

- **智能双向同步**：基于本地状态缓存对比两端差异，自动决定新增/更新/删除
- **强制上传 / 强制下载**：以一侧为准覆盖另一侧，删除走回收站兜底（远端 `_synctrash_/`、本地 `.trash/`）
- **自动同步**：定时、启动时、文件变更 debounce 后触发
- **附件同步**：vault 内所有文件（图片/PDF/附件），支持忽略规则
- **冲突处理**：`etag` + `mtime` 双重判断，无法判定时生成 `*.sync-conflict-*.md`
- **大文件**：≥10MB 自动走 Nextcloud chunking v2 分块上传 + 断点续传
- **日志系统**：实时侧边栏日志视图 + 磁盘按天落盘

## 配置

1. 在 Nextcloud 网页端「安全」中生成一个 **App 密码**（强烈建议，而非主账户密码）
2. 插件设置中填写：
   - **服务器地址**：`https://your-nextcloud.example.com`（强烈建议 HTTPS）
   - **用户名**：你的 Nextcloud 登录名
   - **App 密码**：上一步生成的应用密码
   - **远端根目录**：vault 在远端存放的目录名，如 `Obsidian`（留空则用 vault 名）
3. 点击「测试连接」验证
4. 命令面板运行 `Nextcloud Sync: Sync` / `Force push` / `Force pull`

## 安全说明

- 凭据（App 密码）以**明文**存储在 Obsidian 插件的 `data.json` 中——这是 Obsidian 插件生态的标准做法（Remotely Save 同样如此）。因此请务必使用 **App 密码** 而非主密码，以便随时单独吊销。
- 插件**只**连接你配置的 Nextcloud 地址，**不向任何第三方上报数据**。
- 建议始终使用 HTTPS，避免凭据与内容明文传输。

## 构建

```bash
npm install
npm run build
```

## 许可

MIT
