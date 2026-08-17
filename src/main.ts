import {
	Notice,
	Plugin,
	WorkspaceLeaf,
	debounce,
} from "obsidian";
import { DEFAULT_SETTINGS, NextcloudSettingTab, NextcloudSettings } from "./settings";
import { WebdavClient } from "./webdav/client";
import { StateStore } from "./sync/stateStore";
import { SyncEngine, SyncMode } from "./sync/engine";
import { Logger } from "./logger/logger";
import { LogStore } from "./logger/logStore";
import { SyncLogView, LOG_VIEW_TYPE } from "./logger/logView";
import { StatusBar } from "./ui/statusBar";
import { ConfirmModal } from "./ui/confirmModal";

export default class NextcloudSyncPlugin extends Plugin {
	settings: NextcloudSettings = { ...DEFAULT_SETTINGS };
	logger: Logger = new Logger();
	stateStore!: StateStore;
	logStore!: LogStore;
	statusBar!: StatusBar;
	private running = false;
	private changeHandler?: () => void;

	async onload(): Promise<void> {
		await this.loadSettings();

		const pluginDir = `${this.app.vault.configDir}/plugins/nextcloud-sync`;
		this.stateStore = new StateStore(this.app.vault.adapter, `${pluginDir}/sync-state.json`);
		await this.stateStore.load();
		// 日志落盘（位于 .obsidian，被本插件忽略）
		this.logStore = new LogStore(this.app.vault.adapter, `${pluginDir}/logs`, this.settings.logRetentionDays);
		this.logStore.attach(this.logger);

		this.statusBar = new StatusBar(this.addStatusBarItem());

		this.registerView(LOG_VIEW_TYPE, (leaf: WorkspaceLeaf) => new SyncLogView(leaf, this.logger));

		this.addCommand({ id: "sync", name: "Sync", callback: () => this.doSync("smart") });
		this.addCommand({ id: "force-push", name: "Force push (本地覆盖远端)", callback: () => this.requestForce("force-push") });
		this.addCommand({ id: "force-pull", name: "Force pull (远端覆盖本地)", callback: () => this.requestForce("force-pull") });
		this.addCommand({ id: "open-log", name: "打开同步日志", callback: () => this.activateLogView() });
		this.addCommand({ id: "test-conn", name: "测试连接", callback: async () => {
			const ok = await this.testConnection();
			new Notice(ok ? "✅ 连接成功" : "❌ 连接失败");
		} });

		this.addRibbonIcon("sync", "Nextcloud Sync", () => this.doSync("smart"));
		this.addSettingTab(new NextcloudSettingTab(this.app, this));

		// 自动同步：启动
		this.app.workspace.onLayoutReady(() => {
			if (this.settings.syncOnStartup) this.doSync("smart");
		});
		// 自动同步：文件变更 debounce
		if (this.settings.syncOnChange) this.registerChangeWatcher();
		// 自动同步：定时
		if (this.settings.autoSyncIntervalMinutes > 0) {
			const ms = this.settings.autoSyncIntervalMinutes * 60000;
			const id = window.setInterval(() => this.doSync("smart"), ms);
			this.registerInterval(id);
		}
	}

	onunload(): void {
		// 视图/事件由 Obsidian 自动清理
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = { ...DEFAULT_SETTINGS, ...(data || {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private buildClient(): WebdavClient {
		return new WebdavClient(this.settings);
	}

	async testConnection(): Promise<boolean> {
		try {
			return await this.buildClient().testConnection();
		} catch {
			return false;
		}
	}

	private buildEngine(): SyncEngine {
		return new SyncEngine({
			vault: this.app.vault,
			settings: this.settings,
			client: this.buildClient(),
			state: this.stateStore,
			onProgress: (done, total, label) => this.statusBar.setSyncing(done, total, label),
		});
	}

	async doSync(mode: SyncMode): Promise<void> {
		if (this.running) {
			new Notice("同步正在进行中，已跳过本次触发");
			return;
		}
		if (!this.settings.serverUrl || !this.settings.username || !this.settings.appPassword) {
			new Notice("请先在设置中填写 Nextcloud 连接信息");
			return;
		}
		this.running = true;
		this.statusBar.setSyncing(0, 0, mode);
		try {
			const result = await this.buildEngine().sync(mode);
			this.statusBar.setResult(result);
		} catch (e) {
			console.error("[nextcloud-sync]", e);
			new Notice("同步出错，详见控制台");
			this.statusBar.setIdle();
		} finally {
			this.running = false;
		}
	}

	/** 强制操作：先计算统计，再弹二次确认 */
	async requestForce(mode: "force-push" | "force-pull"): Promise<void> {
		if (this.running) {
			new Notice("同步正在进行中，已跳过本次触发");
			return;
		}
		try {
			const engine = this.buildEngine();
			const plan = await engine.preview(mode);
			new ConfirmModal(this.app, mode, plan, () => this.doSync(mode)).open();
		} catch (e) {
			console.error("[nextcloud-sync]", e);
			new Notice("准备强制操作失败，详见控制台");
		}
	}

	private registerChangeWatcher(): void {
		const debounced = debounce(() => this.doSync("smart"), this.settings.syncOnChangeDebounceMs, true);
		this.changeHandler = () => debounced();
		this.registerEvent(this.app.vault.on("create", () => this.changeHandler!()));
		this.registerEvent(this.app.vault.on("modify", () => this.changeHandler!()));
		this.registerEvent(this.app.vault.on("delete", () => this.changeHandler!()));
		this.registerEvent(this.app.vault.on("rename", () => this.changeHandler!()));
	}

	async activateLogView(): Promise<void> {
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: LOG_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}
}
