import type { DataAdapter } from "obsidian";
import type { LogEntry, Logger } from "./logger";

/**
 * 磁盘落盘：按天 JSON Lines 分文件，保留 N 天（配置）。
 * 订阅 Logger，每条追加写入当日文件。
 */
export class LogStore {
	private adapter: DataAdapter;
	private dir: string;
	private retentionDays: number;
	private today = "";
	private path = "";

	constructor(adapter: DataAdapter, dir: string, retentionDays: number) {
		this.adapter = adapter;
		this.dir = dir.replace(/\/+$/, "");
		this.retentionDays = retentionDays;
	}

	/** 订阅 logger，并立即清理过期文件 */
	attach(logger: Logger): void {
		logger.subscribe((e) => this.append(e));
		this.cleanupOld();
	}

	private dayStr(d: Date = new Date()): string {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		return `${y}-${m}-${day}`;
	}

	private resolvePath(): string {
		const day = this.dayStr();
		if (day !== this.today) {
			this.today = day;
			this.path = `${this.dir}/sync-${day}.log`;
		}
		return this.path;
	}

	private async append(e: LogEntry): Promise<void> {
		try {
			const line = JSON.stringify(e) + "\n";
			const p = this.resolvePath();
			const existing = (await this.adapter.exists(p)) ? await this.adapter.read(p) : "";
			await this.adapter.write(p, existing + line);
		} catch {
			// 日志落盘失败不可影响主流程
		}
	}

	/** 删除超过保留天数的日志 */
	private async cleanupOld(): Promise<void> {
		try {
			if (!(await this.adapter.exists(this.dir))) return;
			const listed = await this.adapter.list(this.dir);
			const all = [...(listed.files || []), ...(listed.folders || [])];
			const limit = Date.now() - this.retentionDays * 86400000;
			for (const f of all) {
				if (!f.includes("/sync-") || !f.endsWith(".log")) continue;
				const day = f.match(/sync-(\d{4}-\d{2}-\d{2})\.log/);
				if (day) {
					const t = new Date(day[1] + "T00:00:00").getTime();
					if (t < limit) await this.adapter.remove(f);
				}
			}
		} catch {
			// ignore
		}
	}
}
