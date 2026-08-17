import type { DataAdapter } from "obsidian";

/** 单文件上次同步后的快照 */
export interface FileState {
	path: string;
	/** 上次同步时本地大小 */
	size: number;
	/** 上次同步时本地 mtime（毫秒） */
	mtime: number;
	/** 上次同步时远端 etag */
	etag?: string;
}

/**
 * 本地同步状态表持久化（路径 → FileState）。
 * 存储于插件数据目录下的 sync-state.json，位于 .obsidian/ 内（本插件忽略 .obsidian，不会被自身同步）。
 */
export class StateStore {
	private adapter: DataAdapter;
	private filePath: string;
	private states: Map<string, FileState> = new Map();
	private dirty = false;

	constructor(adapter: DataAdapter, filePath: string) {
		this.adapter = adapter;
		this.filePath = filePath;
	}

	async load(): Promise<void> {
		try {
			if (await this.adapter.exists(this.filePath)) {
				const raw = await this.adapter.read(this.filePath);
				const obj = JSON.parse(raw || "{}");
				this.states = new Map(Object.entries(obj));
			}
		} catch {
			// 损坏则重新构建
			this.states = new Map();
		}
	}

	async save(): Promise<void> {
		if (!this.dirty) return;
		const obj = Object.fromEntries(this.states);
		await this.adapter.write(this.filePath, JSON.stringify(obj, null, 0));
		this.dirty = false;
	}

	get(path: string): FileState | undefined {
		return this.states.get(path);
	}

	/** 记录一次成功同步后的状态 */
	set(path: string, size: number, mtime: number, etag?: string): void {
		this.states.set(path, { path, size, mtime, etag });
		this.dirty = true;
	}

	remove(path: string): void {
		if (this.states.delete(path)) this.dirty = true;
	}

	clear(): void {
		this.states.clear();
		this.dirty = true;
	}

	keys(): string[] {
		return Array.from(this.states.keys());
	}
}
