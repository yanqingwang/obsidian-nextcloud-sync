import type { WebdavClient } from "./client";

/**
 * Nextcloud NG chunking v2 分块上传。
 *
 * 协议（参照 Nextcloud 官方文档）：
 *   1. MKCOL   {uploadsBase}/{transferId}           创建临时上传目录
 *   2. PUT     {uploadsBase}/{transferId}/{00001}    分块，每块带 Destination 头
 *      ...
 *   3. MOVE    {uploadsBase}/{transferId}/.file      组装到目标，带 Destination + OC-Total-Length
 *
 * uploadBase 与 filesBase 仅 dav 段不同（files ↔ uploads）。
 */
export async function uploadWithChunking(
	client: WebdavClient,
	relPath: string,
	data: ArrayBuffer,
	chunkSize: number
): Promise<void> {
	const destUrl = client.uploadChunkUrl(relPath, false); // filesBase 下的目标地址

	// transferId = 文件名的 URL 编码
	const basename = relPath.split("/").pop() || "file";
	const transferId = encodeURIComponent(basename);
	const uploadUrl = (suffix: string) => client.uploadChunkUrl(`${transferId}/${suffix}`, true);

	// 1. 创建临时上传目录
	const mk = await client.rawRequest("MKCOL", uploadUrl(""), {
		headers: { Destination: destUrl },
	});
	if (mk.status !== 201 && mk.status !== 405) {
		throw new Error(`chunked MKCOL failed: HTTP ${mk.status}`);
	}

	// 2. 分块 PUT
	const total = data.byteLength;
	const nChunks = Math.max(1, Math.ceil(total / chunkSize));
	for (let i = 0; i < nChunks; i++) {
		const start = i * chunkSize;
		const end = Math.min(total, start + chunkSize);
		const chunk = data.slice(start, end);
		const chunkName = `${i + 1}`.padStart(5, "0");
		const r = await client.rawRequest("PUT", uploadUrl(chunkName), {
			body: chunk,
			contentType: "application/octet-stream",
			headers: {
				Destination: destUrl,
				"OC-Total-Length": `${total}`,
			},
		});
		if (r.status < 200 || r.status >= 300) {
			// 失败清理临时目录
			await client.rawRequest("DELETE", uploadUrl(""));
			throw new Error(`chunked PUT ${chunkName} failed: HTTP ${r.status}`);
		}
	}

	// 3. MOVE 组装
	const mv = await client.rawRequest("MOVE", uploadUrl(".file"), {
		headers: {
			Destination: destUrl,
			"OC-Total-Length": `${total}`,
			Overwrite: "T",
		},
	});
	if (mv.status < 200 || mv.status >= 300) {
		await client.rawRequest("DELETE", uploadUrl(""));
		throw new Error(`chunked MOVE failed: HTTP ${mv.status}`);
	}
}
