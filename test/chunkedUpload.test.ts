import { test } from "node:test";
import assert from "node:assert";
import { uploadWithChunking } from "../src/webdav/chunkedUpload";

function makeClient() {
	const calls: any[] = [];
	const client: any = {
		uploadChunkUrl: (rel: string, forUpload = true) =>
			forUpload ? `http://nc/uploads/${rel}` : `http://nc/files/${rel}`,
		rawRequest: async (method: string, url: string, opts: any = {}) => {
			calls.push({
				method,
				url,
				headers: opts.headers || {},
				bodyLen: opts.body ? (opts.body as ArrayBuffer).byteLength : 0,
			});
			let status = 200;
			if (method === "MKCOL") status = 201;
			if ((globalThis as any).__failPut && method === "PUT") status = 500;
			return { status, headers: {}, body: new ArrayBuffer(0), text: "" };
		},
	};
	return { client, calls };
}

test("uploadWithChunking: 协议流程 MKCOL→分块PUT→MOVE (V-8/R6)", async () => {
	const { client, calls } = makeClient();
	const data = new ArrayBuffer(25);
	await uploadWithChunking(client, "dir/我的文件.md", data, 10);
	// 1 MKCOL + 3 PUT + 1 MOVE
	assert.equal(calls.length, 5);
	assert.equal(calls[0].method, "MKCOL");
	assert.equal(calls[0].headers.Destination, "http://nc/files/dir/我的文件.md");

	const puts = calls.filter((c) => c.method === "PUT");
	assert.equal(puts.length, 3);
	const base = "http://nc/uploads/%E6%88%91%E7%9A%84%E6%96%87%E4%BB%B6.md";
	assert.equal(puts[0].url, `${base}/00001`);
	assert.equal(puts[1].url, `${base}/00002`);
	assert.equal(puts[2].url, `${base}/00003`);
	// 每块 body 长度：10, 10, 5
	assert.deepEqual(puts.map((p) => p.bodyLen), [10, 10, 5]);

	const move = calls.find((c) => c.method === "MOVE")!;
	assert.equal(move.url, `${base}/.file`);
	assert.equal(move.headers.Destination, "http://nc/files/dir/我的文件.md");
	assert.equal(move.headers["OC-Total-Length"], "25");
	assert.equal(move.headers.Overwrite, "T");
});

test("uploadWithChunking: 单块边界 (size<=chunkSize → 1块)", async () => {
	const { client, calls } = makeClient();
	await uploadWithChunking(client, "a.md", new ArrayBuffer(5), 10);
	assert.equal(calls.filter((c) => c.method === "PUT").length, 1);
});

test("uploadWithChunking: 分块PUT失败→清理临时目录并抛错 (V-8/R6 容错)", async () => {
	(globalThis as any).__failPut = true;
	const { client, calls } = makeClient();
	await assert.rejects(() =>
		uploadWithChunking(client, "a.md", new ArrayBuffer(25), 10)
	);
	assert.ok(calls.some((c) => c.method === "DELETE"), "失败后应清理临时上传目录");
	(globalThis as any).__failPut = false;
});
