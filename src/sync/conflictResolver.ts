/**
 * 冲突文件命名与内容策略。
 *
 * 两端都修改同一文件时，保留本地原文件，把远端内容落盘为
 * `xxx.sync-conflict-YYYYMMDD-HHmmss.md`（Obsidian 风格命名），
 * 并在状态表中标记冲突文件，使其不参与下一轮同步。
 */
export class ConflictResolver {
	/** 生成形如 `dir/name.sync-conflict-20260817-221500.md` 的路径 */
	static makeConflictPath(originalPath: string, date: Date = new Date()): string {
		const idx = originalPath.lastIndexOf("/");
		const dir = idx >= 0 ? originalPath.slice(0, idx + 1) : "";
		const base = idx >= 0 ? originalPath.slice(idx + 1) : originalPath;
		const dot = base.lastIndexOf(".");
		const name = dot > 0 ? base.slice(0, dot) : base;
		const ext = dot > 0 ? base.slice(dot) : "";
		const stamp =
			`${date.getFullYear()}` +
			`${String(date.getMonth() + 1).padStart(2, "0")}` +
			`${String(date.getDate()).padStart(2, "0")}` +
			`-` +
			`${String(date.getHours()).padStart(2, "0")}` +
			`${String(date.getMinutes()).padStart(2, "0")}` +
			`${String(date.getSeconds()).padStart(2, "0")}`;
		return `${dir}${name}.sync-conflict-${stamp}${ext}`;
	}
}
