import { setIcon, setTooltip } from "obsidian";
import type { SyncResult } from "../sync/engine";

/** 状态栏：同步中进度 + 结果摘要 */
export class StatusBar {
	private el: HTMLElement;

	constructor(el: HTMLElement) {
		this.el = el;
		this.el.addClass("nc-status-bar");
		this.setIdle();
	}

	setIdle(): void {
		this.el.setText("Nextcloud: 空闲");
		setIcon(this.el, "cloud");
		setTooltip(this.el, "Nextcloud Sync 空闲");
	}

	setSyncing(done: number, total: number, label: string): void {
		this.el.setText(`Nextcloud: 同步中 ${done}/${total} ${label}`);
		setIcon(this.el, "refresh-cw");
	}

	setResult(r: SyncResult): void {
		const ok = r.errors === 0;
		const text = `Nextcloud: ✔ 上传${r.uploaded} 下载${r.downloaded} 冲突${r.conflicts}${
			r.errors ? ` 错误${r.errors}` : ""
		}`;
		this.el.setText(text);
		setIcon(this.el, ok ? "check" : "alert-triangle");
		setTooltip(this.el, text);
	}
}
