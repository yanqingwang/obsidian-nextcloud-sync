export type LogLevel = "info" | "warn" | "error" | "debug";
export type LogAction =
	| "upload"
	| "download"
	| "delete-local"
	| "delete-remote"
	| "skip"
	| "conflict"
	| "error"
	| "info";

export interface LogEntry {
	timestamp: number;
	level: LogLevel;
	action: LogAction;
	path: string;
	detail?: string;
	sizeBytes?: number;
	durationMs?: number;
}

export type LogListener = (entry: LogEntry) => void;

/** 分级/分类日志，支持内存订阅（面板）与磁盘落盘（logStore 订阅）。 */
export class Logger {
	private listeners: LogListener[] = [];
	private buffer: LogEntry[] = [];
	private maxBuffer = 2000;

	subscribe(fn: LogListener): void {
		this.listeners.push(fn);
	}

	unsubscribe(fn: LogListener): void {
		this.listeners = this.listeners.filter((l) => l !== fn);
	}

	log(
		level: LogLevel,
		action: LogAction,
		path: string,
		detail?: string,
		sizeBytes?: number,
		durationMs?: number
	): void {
		const entry: LogEntry = {
			timestamp: Date.now(),
			level,
			action,
			path,
			detail,
			sizeBytes,
			durationMs,
		};
		this.buffer.push(entry);
		if (this.buffer.length > this.maxBuffer) this.buffer.shift();
		for (const l of this.listeners) {
			try {
				l(entry);
			} catch {
				// 订阅者异常不应影响主流程
			}
		}
	}

	getBuffer(): LogEntry[] {
		return this.buffer.slice();
	}

	clear(): void {
		this.buffer = [];
	}
}
