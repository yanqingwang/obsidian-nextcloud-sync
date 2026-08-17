import { App, PluginSettingTab, Setting } from "obsidian";
import type NextcloudSyncPlugin from "./main";

/**
 * 插件设置。凭据（appPassword）明文存于 data.json——标准做法，
 * README 已明示，并建议使用 App 密码而非主密码。
 */
export interface NextcloudSettings {
	/** 服务器地址，如 https://cloud.example.com（建议 HTTPS） */
	serverUrl: string;
	/** Nextcloud 登录用户名 */
	username: string;
	/** App 密码（应用密码，非主账户密码） */
	appPassword: string;
	/** 远端根目录，如 "Obsidian"；留空则回退为 vault 名 */
	remoteBasePath: string;

	/** 超过此大小（MB）的文件走 chunking v2 分块上传 */
	largeFileThresholdMb: number;
	/** 分块上传每块大小（MB） */
	chunkSizeMb: number;

	/** 自动同步：定时间隔（分钟），0 = 关闭 */
	autoSyncIntervalMinutes: number;
	/** 自动同步：启动时 */
	syncOnStartup: boolean;
	/** 自动同步：文件变更 debounce 后 */
	syncOnChange: boolean;
	/** 变更 debounce 毫秒 */
	syncOnChangeDebounceMs: number;

	/** 删除策略：trash = 回收站兜底（远端 _synctrash_/本地 .trash），never = 只增不删 */
	deleteStrategy: "trash" | "never";
	/** 冲突策略 */
	conflictStrategy: "keep-both" | "local-wins" | "remote-wins";

	/** 忽略规则（每行一个 glob） */
	excludePatterns: string;

	/** 日志磁盘保留天数 */
	logRetentionDays: number;
}

export const DEFAULT_SETTINGS: NextcloudSettings = {
	serverUrl: "",
	username: "",
	appPassword: "",
	remoteBasePath: "",

	largeFileThresholdMb: 10,
	chunkSizeMb: 5,

	autoSyncIntervalMinutes: 0,
	syncOnStartup: false,
	syncOnChange: false,
	syncOnChangeDebounceMs: 1500,

	deleteStrategy: "trash",
	conflictStrategy: "keep-both",

	excludePatterns: "",

	logRetentionDays: 30,
};

export class NextcloudSettingTab extends PluginSettingTab {
	plugin: NextcloudSyncPlugin;

	constructor(app: App, plugin: NextcloudSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("服务器地址").setDesc("Nextcloud 地址，例如 https://cloud.example.com（强烈建议 HTTPS）").addText((text) =>
			text
				.setPlaceholder("https://cloud.example.com")
				.setValue(this.plugin.settings.serverUrl)
				.onChange(async (value) => {
					this.plugin.settings.serverUrl = value.trim().replace(/\/+$/, "");
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl).setName("用户名").setDesc("Nextcloud 登录用户名").addText((text) =>
			text
				.setPlaceholder("username")
				.setValue(this.plugin.settings.username)
				.onChange(async (value) => {
					this.plugin.settings.username = value.trim();
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl).setName("App 密码").setDesc("在 Nextcloud「安全」页生成的应用密码（建议用应用密码而非主密码）").addText((text) =>
			text
				.setPlaceholder("app-password")
				.setValue(this.plugin.settings.appPassword)
				.onChange(async (value) => {
					this.plugin.settings.appPassword = value;
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl).setName("远端根目录").setDesc("vault 在远端存放的目录名，留空则使用 vault 名").addText((text) =>
			text
				.setPlaceholder("Obsidian")
				.setValue(this.plugin.settings.remoteBasePath)
				.onChange(async (value) => {
					this.plugin.settings.remoteBasePath = value.trim();
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl).setName("测试连接").setDesc("验证地址、用户名与密码是否正确").addButton((btn) =>
			btn.setButtonText("测试连接").onClick(async () => {
				btn.setDisabled(true).setButtonText("测试中…");
				try {
					const ok = await this.plugin.testConnection();
					if (ok) {
						btn.setButtonText("✅ 连接成功");
					} else {
						btn.setButtonText("❌ 连接失败");
					}
				} catch {
					btn.setButtonText("❌ 连接失败");
				}
			})
		);

		new Setting(containerEl).setName("大文件阈值（MB）").setDesc("超过此大小的文件使用 chunking v2 分块上传").addText((text) =>
			text
				.setValue(String(this.plugin.settings.largeFileThresholdMb))
				.onChange(async (value) => {
					const n = parseInt(value, 10);
					if (!isNaN(n) && n > 0) {
						this.plugin.settings.largeFileThresholdMb = n;
						await this.plugin.saveSettings();
					}
				})
		);

		new Setting(containerEl).setName("分块大小（MB）").setDesc("chunking v2 每块大小，默认 5MB").addText((text) =>
			text
				.setValue(String(this.plugin.settings.chunkSizeMb))
				.onChange(async (value) => {
					const n = parseInt(value, 10);
					if (!isNaN(n) && n > 0) {
						this.plugin.settings.chunkSizeMb = n;
						await this.plugin.saveSettings();
					}
				})
		);

		new Setting(containerEl).setName("定时同步（分钟）").setDesc("0 = 关闭").addText((text) =>
			text
				.setValue(String(this.plugin.settings.autoSyncIntervalMinutes))
				.onChange(async (value) => {
					const n = parseInt(value, 10);
					this.plugin.settings.autoSyncIntervalMinutes = isNaN(n) ? 0 : n;
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl).setName("启动时同步").addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.syncOnStartup).onChange(async (value) => {
				this.plugin.settings.syncOnStartup = value;
				await this.plugin.saveSettings();
			})
		);

		new Setting(containerEl).setName("文件变更自动同步").addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.syncOnChange).onChange(async (value) => {
				this.plugin.settings.syncOnChange = value;
				await this.plugin.saveSettings();
			})
		);

		new Setting(containerEl).setName("删除策略").setDesc("trash：删除走回收站兜底（推荐）；never：只增不删").addDropdown((dd) =>
			dd
				.addOption("trash", "回收站兜底")
				.addOption("never", "只增不删")
				.setValue(this.plugin.settings.deleteStrategy)
				.onChange(async (value) => {
					this.plugin.settings.deleteStrategy = value as "trash" | "never";
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl).setName("冲突策略").addDropdown((dd) =>
			dd
				.addOption("keep-both", "保留双方")
				.addOption("local-wins", "本地覆盖")
				.addOption("remote-wins", "远端覆盖")
				.setValue(this.plugin.settings.conflictStrategy)
				.onChange(async (value) => {
					this.plugin.settings.conflictStrategy = value as "keep-both" | "local-wins" | "remote-wins";
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl).setName("忽略规则").setDesc("每行一个 glob，例如 temp/、*.log").addTextArea((ta) =>
			ta
				.setPlaceholder("temp/\n*.log")
				.setValue(this.plugin.settings.excludePatterns)
				.onChange(async (value) => {
					this.plugin.settings.excludePatterns = value;
					await this.plugin.saveSettings();
				})
		);

		new Setting(containerEl).setName("日志保留天数").addText((text) =>
			text
				.setValue(String(this.plugin.settings.logRetentionDays))
				.onChange(async (value) => {
					const n = parseInt(value, 10);
					if (!isNaN(n) && n > 0) {
						this.plugin.settings.logRetentionDays = n;
						await this.plugin.saveSettings();
					}
				})
		);
	}
}
