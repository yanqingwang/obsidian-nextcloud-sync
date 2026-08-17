// 测试用 "obsidian" 桩模块（Node 无 Obsidian 运行时）。
// 仅覆盖被测试代码在运行时真正引用到的导出。

export class App {}
export class Plugin {
	app: any;
	manifest: any;
	constructor(app?: any, manifest?: any) {
		this.app = app;
		this.manifest = manifest;
	}
	async loadData(): Promise<any> {
		return {};
	}
	async saveData(_d: any): Promise<void> {}
	addCommand(_c: any): any {}
	addRibbonIcon(_i: any, _t: string, _cb: any): any {}
	addStatusBarItem(): any {
		return { setText() {}, setTooltip() {} };
	}
	addSettingTab(_t: any): void {}
	registerEvent(_e: any): void {}
	registerInterval(_id: number): number {
		return _id;
	}
}
export class PluginSettingTab {
	app: any;
	containerEl: any;
	plugin: any;
	constructor(app: any, plugin: any) {
		this.app = app;
		this.plugin = plugin;
	}
	display(): void {}
}
export class Setting {
	constructor(_c: any) {}
	setName(): this {
		return this;
	}
	setDesc(): this {
		return this;
	}
	addText(): this {
		return this;
	}
	addButton(): this {
		return this;
	}
	addToggle(): this {
		return this;
	}
	addDropdown(): this {
		return this;
	}
	addTextArea(): this {
		return this;
	}
}
export class Notice {
	constructor(_m: any) {}
}
export class TFile {
	path = "";
	stat = { size: 0, mtime: 0, ctime: 0 };
}
export class TAbstractFile {
	path = "";
}
export class Vault {
	adapter: any;
	getFiles(): any[] {
		return [];
	}
	getAbstractFileByPath(): any {
		return null;
	}
	getFileByPath(): any {
		return null;
	}
	async trash(): Promise<void> {}
}
export class WorkspaceLeaf {}
export class Modal {
	app: any;
	contentEl: any;
	constructor(app?: any) {
		this.app = app;
	}
	open(): void {}
	close(): void {}
}
export function debounce(_fn: any, _ms?: number): any {
	return _fn;
}
export function requestUrl(_param: any): Promise<any> {
	return Promise.reject(new Error("requestUrl 在测试中不可用"));
}
export type DataAdapter = any;
export type EventRef = any;
export type CachedMetadata = any;
