/**
 * 远端条目（PROPFIND 解析结果）。
 * path 为相对远端根目录的路径，不含前导斜杠；根目录为 ""。
 */
export interface RemoteEntry {
	/** 相对路径，无前导斜杠；目录不带尾斜杠 */
	path: string;
	/** PROPFIND 返回的原始 href */
	href: string;
	isDir: boolean;
	etag?: string;
	lastModified?: string;
	size?: number;
	contentType?: string;
	/** 解析自 oc:checksums，形如 ["SHA1:abc", "MD5:def"] */
	checksums: string[];
	/** 提取出的 sha1（如有），无则 undefined */
	sha1?: string;
}

/** requestUrl 的归一化响应 */
export interface WebdavResponse {
	status: number;
	headers: Record<string, string>;
	body: ArrayBuffer;
	text: string;
}

/** 服务器能力探测结果 */
export interface Capabilities {
	/** 是否支持 chunking v2（Nextcloud NG） */
	chunkingV2: boolean;
	/** 是否为 Nextcloud */
	isNextcloud: boolean;
	/** 版本字符串 */
	version?: string;
}
