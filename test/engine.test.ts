import { test } from "node:test";
import assert from "node:assert";
import { SyncEngine, LocalFile } from "../src/sync/engine";
import type { RemoteEntry } from "../src/webdav/types";

function makeEngine(opts: { excludePatterns?: string; stateMap?: Map<string, any> } = {}) {
	const state = {
		get: (p: string) => opts.stateMap?.get(p),
		set: () => {},
		remove: () => {},
		save: async () => {},
	};
	const settings: any = { excludePatterns: opts.excludePatterns ?? "" };
	const deps: any = { vault: {}, settings, client: {}, state };
	return new SyncEngine(deps);
}

const rf = (path: string, etag: string, size = 10): RemoteEntry => ({
	path,
	href: "",
	isDir: false,
	etag,
	size,
	lastModified: "",
});

test("computeDiff 智能: 幂等（无变化→空计划）(V-3/R2)", () => {
	const eng = makeEngine({
		stateMap: new Map([["a.md", { size: 10, mtime: 1, etag: "e1" }]]),
	});
	const local: LocalFile[] = [{ path: "a.md", size: 10, mtime: 1 }];
	const remote = [rf("a.md", "e1", 10)];
	const plan = eng.computeDiff(local, remote, "smart");
	assert.deepEqual(plan.toUpload, []);
	assert.deepEqual(plan.toDownload, []);
	assert.deepEqual(plan.conflicts, []);
	assert.deepEqual(plan.toDelete, []);
	assert.deepEqual(plan.toDeleteLocal, []);
});

test("computeDiff 智能: 四象限 (V-2/R1)", () => {
	const state = new Map<string, any>([
		["up.md", { size: 10, mtime: 1, etag: "e1" }],
		["down.md", { size: 10, mtime: 1, etag: "e1" }],
		["conf.md", { size: 10, mtime: 1, etag: "e1" }],
	]);
	const eng = makeEngine({ stateMap: state });
	const local: LocalFile[] = [
		{ path: "up.md", size: 20, mtime: 2 }, // 本地改
		{ path: "down.md", size: 10, mtime: 1 }, // 本地未改
		{ path: "conf.md", size: 20, mtime: 2 }, // 本地改
		{ path: "new.md", size: 5, mtime: 3 }, // 仅本地新增
	];
	const remote = [
		rf("up.md", "e1", 10), // 远端未改
		rf("down.md", "e2", 10), // 远端改
		rf("conf.md", "e2", 10), // 远端改
		rf("rnew.md", "e9", 7), // 仅远端新增
	];
	const plan = eng.computeDiff(local, remote, "smart");
	assert.deepEqual(plan.toUpload, ["up.md", "new.md"]);
	assert.deepEqual(plan.toDownload, ["down.md", "rnew.md"]);
	assert.deepEqual(plan.conflicts, ["conf.md"]);
});

test("computeDiff 智能: 仅单侧存在 → 新增 (V-2)", () => {
	const eng = makeEngine();
	const local: LocalFile[] = [{ path: "only-local.md", size: 1, mtime: 1 }];
	const remote = [rf("only-remote.md", "e1")];
	const plan = eng.computeDiff(local, remote, "smart");
	assert.deepEqual(plan.toUpload, ["only-local.md"]);
	assert.deepEqual(plan.toDownload, ["only-remote.md"]);
});

test("computeDiff 强制: force-push / force-pull (V-5/V-6/R4)", () => {
	const eng = makeEngine();
	const local: LocalFile[] = [
		{ path: "a.md", size: 1, mtime: 1 },
		{ path: "b.md", size: 1, mtime: 1 },
	];
	const remote = [rf("a.md", "e1"), rf("c.md", "e2")];
	const fp = eng.computeDiff(local, remote, "force-push");
	assert.deepEqual(fp.toUpload.sort(), ["a.md", "b.md"]);
	assert.deepEqual(fp.toDelete, ["c.md"]);
	const fl = eng.computeDiff(local, remote, "force-pull");
	assert.deepEqual(fl.toDownload.sort(), ["a.md", "c.md"]);
	assert.deepEqual(fl.toDeleteLocal, ["b.md"]);
});

test("shouldExclude: 忽略规则 (V-7/R5)", () => {
	const eng = makeEngine({ excludePatterns: "secret*\n*.tmp" });
	assert.equal(eng.shouldExclude(".obsidian/config.json"), true);
	assert.equal(eng.shouldExclude(".hidden.md"), true);
	assert.equal(eng.shouldExclude("dir/.cache/x.md"), true);
	assert.equal(eng.shouldExclude("normal.md"), false);
	assert.equal(eng.shouldExclude("secret-note.md"), true);
	assert.equal(eng.shouldExclude("draft.tmp"), true);
	assert.equal(eng.shouldExclude(".sync-conflict-20260817-000000.md"), true);
});

test("shouldExclude + computeDiff: 特殊字符路径不被忽略且可同步 (V-10/R7)", () => {
	const eng = makeEngine();
	const local: LocalFile[] = [{ path: "笔记/中文 #%.md", size: 9, mtime: 1 }];
	assert.equal(eng.shouldExclude("笔记/中文 #%.md"), false);
	const plan = eng.computeDiff(local, [], "smart");
	assert.deepEqual(plan.toUpload, ["笔记/中文 #%.md"]);
});
