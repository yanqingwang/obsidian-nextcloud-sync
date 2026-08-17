import { Notice, TFile, Vault } from "obsidian";
import type { NextcloudSettings } from "../settings";
import type { WebdavClient } from "../webdav/client";
import type { RemoteEntry } from "../webdav/types";
import { StateStore } from "./stateStore";
import { ConflictResolver } from "./conflictResolver";

export type SyncMode = "smart" | "force-push" | "force-pull";

export interface LocalFile {
	path: string; // vault 相对，无前导斜杠
	size: number;
	mtime: number; // 毫秒
}

export interface SyncPlan {
	toUpload: string[];
	toDownload: string[];
	toDeleteLocal: string[];
	toDelete: string[]; // 远端删除
	conflicts: string[];
}

export interface SyncResult {
	uploaded: number;
	downloaded: number;
	deletedLocal: number;
	deletedRemote: number;
	conflicts: number;
	skipped: number;
	errors: number;
}

export interface EngineDeps {
	vault: Vault;
	settings: NextcloudSettings;
	client: WebdavClient;
	state: StateStore;
	onProgress?: (done: number, total: number, label: string) => void;
}

function simpleGlobToRegExp(glob: string): RegExp | null {
	if (!glob) return null;
	let re = "";
	for (const ch of glob) {
		if (ch === "*") re += "[^/]*";
		else if (ch === "?") re += "[^/]";
		else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	}
	try {
		return new RegExp(`^${re}$`);
	} catch {
		return null;
	}
}

export class SyncEngine {
	private deps: EngineDeps;

	constructor(deps: EngineDeps) {
		this.deps = deps;
	}

	/** 忽略判断：点开头/隐藏、.obsidian、excludePatterns、冲突文件 */
	shouldExclude(path: string): boolean {
		const segments = path.split("/").filter(Boolean);
		for (const seg of segments) {
			if (seg.startsWith(".")) return true; // 隐藏文件/目录，含 .obsidian
		}
		if (path.includes(".sync-conflict-")) return true; // 冲突文件不参与同步
		const patterns = this.deps.settings.excludePatterns
			.split(/\r?\n/)
			.map((p) => p.trim())
			.filter(Boolean);
		for (const p of patterns) {
			const re = simpleGlobToRegExp(p);
			if (re && re.test(path)) return true;
		}
		return false;
	}

	/** 本地文件枚举（vault 内存模型，已过滤忽略项） */
	async collectLocalFiles(): Promise<LocalFile[]> {
		const files = this.deps.vault.getFiles();
		const out: LocalFile[] = [];
		for (const f of files) {
			if (this.shouldExclude(f.path)) continue;
			out.push({ path: f.path, size: f.stat.size, mtime: f.stat.mtime });
		}
		return out;
	}

	/** 计算 diff（智能模式四象限） */
	computeDiff(
		local: LocalFile[],
		remote: RemoteEntry[],
		mode: SyncMode
	): SyncPlan {
		const localMap = new Map(local.map((f) => [f.path, f]));
		const remoteMap = new Map(
			remote.filter((r) => !r.isDir).map((r) => [r.path, r])
		);
		const state = this.deps.state;
		const plan: SyncPlan = {
			toUpload: [],
			toDownload: [],
			toDeleteLocal: [],
			toDelete: [],
			conflicts: [],
		};

		if (mode === "force-push") {
			for (const f of local) plan.toUpload.push(f.path);
			for (const r of remoteMap.keys()) {
				if (!localMap.has(r)) plan.toDelete.push(r);
			}
			return plan;
		}
		if (mode === "force-pull") {
			for (const r of remoteMap.keys()) plan.toDownload.push(r);
			for (const f of localMap.keys()) {
				if (!remoteMap.has(f)) plan.toDeleteLocal.push(f);
			}
			return plan;
		}

		// 智能模式
		const allPaths = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);
		for (const path of allPaths) {
			const l = localMap.get(path);
			const r = remoteMap.get(path);
			const s = state.get(path);
			if (l && r) {
				const localChanged =
					!s || s.size !== l.size || s.mtime !== l.mtime;
				const remoteChanged = !s || s.etag !== r.etag;
				if (localChanged && !remoteChanged) plan.toUpload.push(path);
				else if (!localChanged && remoteChanged) plan.toDownload.push(path);
				else if (localChanged && remoteChanged) plan.conflicts.push(path);
				// 都未变：跳过
			} else if (l && !r) {
				plan.toUpload.push(path); // 新增
			} else if (!l && r) {
				plan.toDownload.push(path); // 远端新增
			}
			// 都不在：已在两端删除，跳过
		}
		return plan;
	}

	/** 执行计划 */
	async execute(plan: SyncPlan): Promise<SyncResult> {
		const { vault, client, state, settings } = this.deps;
		const result: SyncResult = {
			uploaded: 0,
			downloaded: 0,
			deletedLocal: 0,
			deletedRemote: 0,
			conflicts: 0,
			skipped: 0,
			errors: 0,
		};

		const total =
			plan.toUpload.length +
			plan.toDownload.length +
			plan.toDelete.length +
			plan.toDeleteLocal.length +
			plan.conflicts.length;
		let done = 0;
		const tick = (label: string) => {
			done++;
			this.deps.onProgress?.(done, total, label);
		};

		// 上传
		for (const path of plan.toUpload) {
			try {
				const f = vault.getAbstractFileByPath(path);
				if (!(f instanceof TFile)) continue;
				const data = await vault.adapter.readBinary(path);
				await client.putFile(path, data, "application/octet-stream");
				// 记录状态（etag 取不到则留空，下次以 size/mtime 兜底）
				const lf = vault.getFileByPath(path);
				state.set(path, lf?.stat.size ?? f.stat.size, lf?.stat.mtime ?? f.stat.mtime);
				result.uploaded++;
			} catch (e) {
				result.errors++;
				console.error(`[nextcloud-sync] upload ${path} failed`, e);
			}
			tick(`上传 ${path}`);
		}

		// 下载
		for (const path of plan.toDownload) {
			try {
				const data = await client.getFile(path);
				await this.ensureLocalParent(path);
				await vault.adapter.writeBinary(path, data);
				const lf = vault.getFileByPath(path);
				state.set(path, lf?.stat.size ?? data.byteLength, lf?.stat.mtime ?? Date.now());
				result.downloaded++;
			} catch (e) {
				result.errors++;
				console.error(`[nextcloud-sync] download ${path} failed`, e);
			}
			tick(`下载 ${path}`);
		}

		// 冲突：保留本地，远端内容落盘为 conflict，随后本地覆盖远端
		for (const path of plan.conflicts) {
			try {
				const data = await client.getFile(path);
				const conflictPath = ConflictResolver.makeConflictPath(path);
				await this.ensureLocalParent(conflictPath);
				await vault.adapter.writeBinary(conflictPath, data);
				// 本地覆盖远端
				const f = vault.getAbstractFileByPath(path);
				if (f instanceof TFile) {
					const localData = await vault.adapter.readBinary(path);
					await client.putFile(path, localData, "application/octet-stream");
					const lf = vault.getFileByPath(path);
					state.set(path, lf?.stat.size ?? f.stat.size, lf?.stat.mtime ?? f.stat.mtime);
				}
				result.conflicts++;
			} catch (e) {
				result.errors++;
				console.error(`[nextcloud-sync] conflict ${path} failed`, e);
			}
			tick(`冲突 ${path}`);
		}

		// 远端删除（DELETE 默认进 Nextcloud 回收站）
		for (const path of plan.toDelete) {
			if (settings.deleteStrategy === "never") continue;
			try {
				await client.delete(path);
				state.remove(path);
				result.deletedRemote++;
			} catch (e) {
				result.errors++;
				console.error(`[nextcloud-sync] delete-remote ${path} failed`, e);
			}
			tick(`删除远端 ${path}`);
		}

		// 本地删除（进系统回收站）
		for (const path of plan.toDeleteLocal) {
			if (settings.deleteStrategy === "never") continue;
			try {
				const af = vault.getAbstractFileByPath(path);
				if (af) await vault.trash(af, false);
				state.remove(path);
				result.deletedLocal++;
			} catch (e) {
				result.errors++;
				console.error(`[nextcloud-sync] delete-local ${path} failed`, e);
			}
			tick(`删除本地 ${path}`);
		}

		await state.save();
		return result;
	}

	/** 确保本地父目录存在 */
	private async ensureLocalParent(path: string): Promise<void> {
		const idx = path.lastIndexOf("/");
		if (idx < 0) return;
		const dir = path.slice(0, idx);
		if (!(await this.deps.vault.adapter.exists(dir))) {
			await this.deps.vault.adapter.mkdir(dir);
		}
	}

	/** 仅计算计划（用于强制操作前的二次确认统计） */
	async preview(mode: SyncMode): Promise<SyncPlan> {
		const local = await this.collectLocalFiles();
		const remote = await this.deps.client.listAll();
		return this.computeDiff(local, remote, mode);
	}

	/** 顶层编排 */
	async sync(mode: SyncMode): Promise<SyncResult> {
		const local = await this.collectLocalFiles();
		const remote = await this.deps.client.listAll();
		const plan = this.computeDiff(local, remote, mode);
		const result = await this.execute(plan);
		const summary = `上传${result.uploaded} 下载${result.downloaded} 跳过${result.skipped} 冲突${result.conflicts}`;
		if (result.errors > 0) {
			new Notice(`Nextcloud 同步完成（有错误）：${summary} 错误${result.errors}`);
		} else {
			new Notice(`Nextcloud 同步完成：${summary}`);
		}
		return result;
	}
}
