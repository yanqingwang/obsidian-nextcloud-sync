import { test } from "node:test";
import assert from "node:assert";
import { ConflictResolver } from "../src/sync/conflictResolver";

test("makeConflictPath: 基础命名带时间戳与扩展名 (V-4/R3)", () => {
	const d = new Date(2026, 7, 17, 22, 15, 5); // 月份 0-based → 8月
	const p = ConflictResolver.makeConflictPath("note.md", d);
	assert.equal(p, "note.sync-conflict-20260817-221505.md");
});

test("makeConflictPath: 保留目录与多扩展名/无扩展名 (V-4)", () => {
	const d = new Date(2026, 7, 17, 0, 0, 0);
	assert.equal(
		ConflictResolver.makeConflictPath("dir/sub/README", d),
		"dir/sub/README.sync-conflict-20260817-000000"
	);
	assert.equal(
		ConflictResolver.makeConflictPath("a.b.c.md", d),
		"a.b.c.sync-conflict-20260817-000000.md"
	);
});
