import { requestUrl, RequestUrlParam } from "obsidian";
import type { NextcloudSettings } from "../settings";
import { parsePropfind } from "./xmlParser";
import type { Capabilities, RemoteEntry, WebdavResponse } from "./types";
import { uploadWithChunking } from "./chunkedUpload";

/**
 * WebDAV / Nextcloud 客户端。
 *
 * 关键约束：所有网络请求必须走 Obsidian requestUrl（绕过 CORS，移动端可用），
 * 不能用浏览器 fetch。
 */
export class WebdavClient {
	private settings: NextcloudSettings;
	private capsCache: Capabilities | null = null;

	constructor(settings: NextcloudSettings) {
		this.settings = settings;
	}

	/** 服务器地址规范化（去尾斜杠） */
	private get server(): string {
		return this.settings.serverUrl.replace(/\/+$/, "");
	}

	/** 文件 WebDAV 根 Base URL */
	private get filesBase(): string {
		const user = encodeURIComponent(this.settings.username);
		let base = this.settings.remoteBasePath.trim().replace(/^\/+|\/+$/g, "");
		const tail = base ? `/${encodeURIComponent(base)}` : "";
		return `${this.server}/remote.php/dav/files/${user}${tail}/`;
	}

	/** 上传地址：dav/files → dav/uploads */
	private get uploadsBase(): string {
		const user = encodeURIComponent(this.settings.username);
		return `${this.server}/remote.php/dav/uploads/${user}`;
	}

	/** Basic 认证头 */
	private get authHeader(): string {
		const cred = `${this.settings.username}:${this.settings.appPassword}`;
		let b64: string;
		try {
			b64 = btoa(unescape(encodeURIComponent(cred)));
		} catch {
			b64 = btoa(cred);
		}
		return `Basic ${b64}`;
	}

	/** 路径段编码（保留斜杠分隔） */
	private enc(p: string): string {
		return p.split("/").map((s) => encodeURIComponent(s)).join("/");
	}

	/** 完整 URL（可选仅编码路径部分） */
	private url(relPath: string, forUpload = false): string {
		const base = forUpload ? this.uploadsBase : this.filesBase;
		if (!relPath) return base;
		const clean = relPath.replace(/^\/+/, "");
		return base + this.enc(clean);
	}

	/** 归一化请求封装 */
	private async request(
		method: string,
		url: string,
		opts: {
			headers?: Record<string, string>;
			body?: string | ArrayBuffer;
			contentType?: string;
			throwOnError?: boolean;
		} = {}
	): Promise<WebdavResponse> {
		const headers: Record<string, string> = {
			Authorization: this.authHeader,
			"Cache-Control": "no-cache",
			...opts.headers,
		};
		const param: RequestUrlParam = {
			url,
			method,
			headers,
			throw: false,
		};
		if (opts.body !== undefined) {
			param.body = opts.body;
			if (opts.contentType) param.contentType = opts.contentType;
		}
		const resp = await requestUrl(param);
		if (opts.throwOnError && resp.status >= 400) {
			throw new Error(`WebDAV ${method} ${url} failed: HTTP ${resp.status}`);
		}
		return {
			status: resp.status,
			headers: resp.headers,
			body: resp.arrayBuffer,
			text: resp.text,
		};
	}

	/** 测试连接：对根目录 depth=0 PROPFIND */
	async testConnection(): Promise<boolean> {
		const r = await this.request("PROPFIND", this.filesBase, {
			headers: { Depth: "0" },
		});
		return r.status >= 200 && r.status < 300;
	}

	/** 探测服务器能力（chunking v2 / 是否 Nextcloud），带缓存 */
	async getCapabilities(): Promise<Capabilities> {
		if (this.capsCache) return this.capsCache;
		const capsUrl = `${this.server}/ocs/v1.php/cloud/capabilities?format=json`;
		try {
			const r = await this.request("GET", capsUrl, {
				headers: { "OCS-APIRequest": "true", Accept: "application/json" },
			});
			if (r.status >= 200 && r.status < 300) {
				const json = JSON.parse(r.text || "{}");
				const dav = json?.ocs?.data?.capabilities?.dav || {};
				const isNextcloud = !!json?.ocs?.data?.version?.edition || !!dav?.chunking;
				return {
					chunkingV2: isNextcloud && dav?.chunking !== undefined,
					isNextcloud,
					version: json?.ocs?.data?.version?.string,
				};
			}
		} catch {
			// 探测失败，保守返回
		}
		return { chunkingV2: false, isNextcloud: false };
	}

	/** 带缓存的能力读取（上传时复用，避免每文件一次网络探测） */
	private async getCapsCached(): Promise<Capabilities> {
		if (!this.capsCache) this.capsCache = await this.getCapabilities();
		return this.capsCache;
	}

	/** 递归列出远端所有条目（逐层 BFS，避免 depth=infinity 超时） */
	async listAll(): Promise<RemoteEntry[]> {
		const out: RemoteEntry[] = [];
		const queue: string[] = [""];
		while (queue.length) {
			const dir = queue.shift()!;
			const r = await this.request("PROPFIND", this.url(dir), {
				headers: { Depth: "1" },
			});
			if (r.status < 200 || r.status >= 300) continue;
			const baseHref = this.url(dir);
			const entries = parsePropfind(r.text, baseHref);
			for (const e of entries) {
				if (e.isDir && e.path !== dir) {
					queue.push(e.path);
				}
				out.push(e);
			}
		}
		return out;
	}

	/** 下载文件 → ArrayBuffer */
	async getFile(relPath: string): Promise<ArrayBuffer> {
		const r = await this.request("GET", this.url(relPath));
		if (r.status < 200 || r.status >= 300) {
			throw new Error(`GET ${relPath} failed: HTTP ${r.status}`);
		}
		return r.body;
	}

	/** 计算断点续传 Range（默认从头；offset 指定已下载字节数） */
	async getFileRange(relPath: string, offset: number): Promise<ArrayBuffer> {
		const r = await this.request("GET", this.url(relPath), {
			headers: { Range: `bytes=${offset}-` },
		});
		if (r.status < 200 || (r.status >= 300 && r.status !== 206)) {
			throw new Error(`GET(range) ${relPath} failed: HTTP ${r.status}`);
		}
		return r.body;
	}

	/** 创建目录 */
	async mkdir(relPath: string): Promise<void> {
		const r = await this.request("MKCOL", this.url(relPath));
		if (r.status !== 201 && r.status !== 405) {
			// 405 = 已存在，视为成功
			throw new Error(`MKCOL ${relPath} failed: HTTP ${r.status}`);
		}
	}

	/** 上传文件（小文件整 PUT，大文件 chunking v2；大文件失败回退整 PUT） */
	async putFile(relPath: string, data: ArrayBuffer, contentType: string): Promise<void> {
		const threshold = this.settings.largeFileThresholdMb * 1024 * 1024;
		const caps = await this.getCapsCached();
		if (data.byteLength > threshold && caps.chunkingV2) {
			try {
				await uploadWithChunking(this, relPath, data, this.settings.chunkSizeMb * 1024 * 1024);
				return;
			} catch (e) {
				console.warn(`[nextcloud-sync] chunking failed, fallback to PUT`, e);
				// 继续走下方整文件 PUT
			}
		}
		const r = await this.request("PUT", this.url(relPath), {
			body: data,
			contentType: contentType || "application/octet-stream",
			headers: { "If-None-Match": "*" },
		});
		if (r.status < 200 || r.status >= 300) {
			throw new Error(`PUT ${relPath} failed: HTTP ${r.status}`);
		}
	}

	/** 移动/重命名 */
	async move(from: string, to: string): Promise<void> {
		const dest = this.url(to);
		const r = await this.request("MOVE", this.url(from), {
			headers: { Destination: dest, Overwrite: "T" },
		});
		if (r.status < 200 || r.status >= 300) {
			throw new Error(`MOVE ${from} -> ${to} failed: HTTP ${r.status}`);
		}
	}

	/** 删除（Nextcloud 默认进回收站） */
	async delete(relPath: string): Promise<void> {
		const r = await this.request("DELETE", this.url(relPath));
		if (r.status < 200 || r.status >= 300) {
			throw new Error(`DELETE ${relPath} failed: HTTP ${r.status}`);
		}
	}

	/** 是否存在 */
	async exists(relPath: string): Promise<boolean> {
		const r = await this.request("PROPFIND", this.url(relPath), {
			headers: { Depth: "0" },
		});
		return r.status >= 200 && r.status < 300;
	}

	/** 单个文件的相关 URL（供 chunkedUpload 复用） */
	get uploadChunkUrl(): (relPath: string, forUpload?: boolean) => string {
		return (p: string, forUpload = true) => this.url(p, forUpload);
	}

	/** 暴露底层 request 给 chunkedUpload 使用 */
	rawRequest(
		method: string,
		url: string,
		opts?: Parameters<WebdavClient["request"]>[2]
	): Promise<WebdavResponse> {
		return this.request(method, url, opts);
	}
}
