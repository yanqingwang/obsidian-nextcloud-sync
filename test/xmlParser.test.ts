import { test } from "node:test";
import assert from "node:assert";
import { parsePropfind } from "../src/webdav/xmlParser";

const SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
  <d:response>
    <d:href>/remote.php/dav/files/user/vault/</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"root-etag"</d:getetag>
        <d:resourcetype><d:collection/></d:resourcetype>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/user/vault/note.md</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"etag-1"</d:getetag>
        <d:getlastmodified>Wed, 17 Aug 2026 14:00:00 GMT</d:getlastmodified>
        <d:getcontentlength>1024</d:getcontentlength>
        <d:getcontenttype>text/markdown</d:getcontenttype>
        <d:resourcetype/>
        <oc:checksums><oc:checksum>SHA1:abcd1234</oc:checksum><oc:checksum>MD5:ef5678</oc:checksum></oc:checksums>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/user/vault/%E4%B8%AD%E6%96%87%20%23%25.md</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"etag-cn"</d:getetag>
        <d:getcontentlength>10</d:getcontentlength>
        <d:resourcetype/>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;

test("parsePropfind: 解析 etag/mtime/size/type/isDir (V-2/V-3)", () => {
	const entries = parsePropfind(SAMPLE, "/remote.php/dav/files/user/vault/");
	const note = entries.find((e) => e.path === "note.md");
	assert.ok(note, "note.md 应被解析");
	assert.equal(note!.isDir, false);
	assert.equal(note!.size, 1024);
	assert.equal(note!.contentType, "text/markdown");
	assert.equal(note!.etag, '"etag-1"');
	assert.equal(note!.lastModified, "Wed, 17 Aug 2026 14:00:00 GMT");
	assert.equal(note!.sha1, "abcd1234");
});

test("parsePropfind: 目录识别 + 过滤根目录自身", () => {
	const entries = parsePropfind(SAMPLE, "/remote.php/dav/files/user/vault/");
	assert.ok(!entries.some((e) => e.path === ""), "根目录自身应被过滤");
	assert.ok(entries.every((e) => !e.isDir || e.path !== ""), "示例中没有子目录条目");
});

test("parsePropfind: 特殊字符路径 URL 解码 (V-10/R7)", () => {
	const entries = parsePropfind(SAMPLE, "/remote.php/dav/files/user/vault/");
	const cn = entries.find((e) => e.path === "中文 #%.md");
	assert.ok(cn, "URL 编码的 '中文 #%.md' 应被解码还原");
	assert.equal(cn!.size, 10);
});

test("parsePropfind: 非 XML 输入安全返回空数组", () => {
	const entries = parsePropfind("this is not xml <<<", "/base/");
	assert.deepEqual(entries, []);
});

test("parsePropfind: oc:checksums 文本整段格式也能解析 SHA1 (V-3 兼容)", () => {
	const xml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
  <d:response>
    <d:href>/remote.php/dav/files/user/vault/txt.md</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"e-txt"</d:getetag>
        <d:getcontentlength>20</d:getcontentlength>
        <d:resourcetype/>
        <oc:checksums>SHA1:deadbeef MD5:cafe</oc:checksums>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;
	const e = parsePropfind(xml, "/remote.php/dav/files/user/vault/");
	const f = e.find((x) => x.path === "txt.md");
	assert.ok(f, "txt.md 应被解析");
	assert.equal(f!.sha1, "deadbeef");
	assert.deepEqual(f!.checksums, ["SHA1:deadbeef", "MD5:cafe"]);
});
