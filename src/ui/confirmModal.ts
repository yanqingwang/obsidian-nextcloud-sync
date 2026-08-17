import { App, Modal, Setting } from "obsidian";
import type { SyncPlan } from "../sync/engine";

/**
 * 强制上传/下载二次确认：展示将执行的操作统计，
 * 删除均走回收站兜底（远端 _synctrash_ / 本地 .trash）。
 */
export class ConfirmModal extends Modal {
	private plan: SyncPlan;
	private mode: "force-push" | "force-pull";
	private onConfirm: () => void;

	constructor(
		app: App,
		mode: "force-push" | "force-pull",
		plan: SyncPlan,
		onConfirm: () => void
	) {
		super(app);
		this.mode = mode;
		this.plan = plan;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		const title = this.mode === "force-push" ? "强制上传" : "强制下载";
		contentEl.createEl("h3", { text: `${title}确认` });
		contentEl.createEl("p", {
			text:
				this.mode === "force-push"
					? "将用本地覆盖远端。远端多余文件将进入 Nextcloud 回收站（可在网页端恢复）。"
					: "将用远端覆盖本地。本地多余文件将进入系统回收站。",
		});

		const counts = contentEl.createDiv();
		counts.createEl("div", { text: `上传/覆盖：${this.plan.toUpload.length}` });
		counts.createEl("div", { text: `下载/覆盖：${this.plan.toDownload.length}` });
		counts.createEl("div", { text: `删除远端：${this.plan.toDelete.length}` });
		counts.createEl("div", { text: `删除本地：${this.plan.toDeleteLocal.length}` });

		new Setting(contentEl)
			.addButton((b) =>
				b.setButtonText("确认执行").setCta().onClick(() => {
					this.close();
					this.onConfirm();
				})
			)
			.addButton((b) => b.setButtonText("取消").onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
