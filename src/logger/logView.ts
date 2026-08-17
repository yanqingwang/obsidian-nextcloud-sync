import { ItemView, WorkspaceLeaf } from "obsidian";
import type { Logger, LogEntry, LogLevel, LogAction } from "./logger";

export const LOG_VIEW_TYPE = "nextcloud-sync-log-view";

/** 实时日志侧边栏：支持按级别/动作筛选、按文件名搜索、点击跳转打开文件 */
export class SyncLogView extends ItemView {
	private logger: Logger;
	private rootEl?: HTMLElement;
	private filterLevel: LogLevel | "all" = "all";
	private filterAction: LogAction | "all" = "all";
	private searchText = "";

	constructor(leaf: WorkspaceLeaf, logger: Logger) {
		super(leaf);
		this.logger = logger;
	}

	getViewType(): string {
		return LOG_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Nextcloud Sync";
	}

	getIcon(): string {
		return "sync";
	}

	async onOpen(): Promise<void> {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		this.rootEl = root;
		this.renderControls();
		this.renderList();
		this.logger.subscribe(() => this.renderList());
	}

	async onClose(): Promise<void> {
		// 取消订阅在 logger 单例中保持；重建视图时重新订阅即可
	}

	private renderControls(): void {
		const wrap = this.rootEl!.createDiv({ cls: "nc-log-controls" });
		const levelSel = wrap.createEl("select");
		(["all", "info", "warn", "error", "debug"] as const).forEach((l) => {
			const o = levelSel.createEl("option", { text: l, value: l });
			if (l === this.filterLevel) o.selected = true;
		});
		levelSel.onchange = () => {
			this.filterLevel = levelSel.value as LogLevel | "all";
			this.renderList();
		};

		const actionSel = wrap.createEl("select");
		(["all", "upload", "download", "delete-local", "delete-remote", "skip", "conflict", "error"] as const).forEach(
			(a) => {
				const o = actionSel.createEl("option", { text: a, value: a });
				if (a === this.filterAction) o.selected = true;
			}
		);
		actionSel.onchange = () => {
			this.filterAction = actionSel.value as LogAction | "all";
			this.renderList();
		};

		const search = wrap.createEl("input", { placeholder: "搜索文件名" });
		search.oninput = () => {
			this.searchText = search.value.toLowerCase();
			this.renderList();
		};
	}

	private renderList(): void {
		const listEl = this.rootEl!.querySelector(".nc-log-list") as HTMLElement | null;
		const target = listEl ?? this.rootEl!.createDiv({ cls: "nc-log-list" });
		target.empty();

		const entries = this.logger.getBuffer().filter((e) => {
			if (this.filterLevel !== "all" && e.level !== this.filterLevel) return false;
			if (this.filterAction !== "all" && e.action !== this.filterAction) return false;
			if (this.searchText && !e.path.toLowerCase().includes(this.searchText)) return false;
			return true;
		});

		for (const e of entries) {
			const row = target.createDiv({ cls: `nextcloud-sync-log-entry nc-level-${e.level}` });
			row.createSpan({ cls: "nc-log-level", text: e.level });
			row.createSpan({ cls: "nc-log-action", text: e.action });
			const pathEl = row.createSpan({ cls: "nc-log-path", text: e.path });
			if (e.detail) row.setAttribute("title", e.detail);
			pathEl.onClickEvent(() => {
				if (e.path && e.action !== "delete-remote") {
					// 点击跳转打开对应文件（尽力而为）
					const file = this.app.vault.getAbstractFileByPath(e.path);
					if (file) this.app.workspace.getLeaf(false).openFile(file as any);
				}
			});
		}
	}
}
