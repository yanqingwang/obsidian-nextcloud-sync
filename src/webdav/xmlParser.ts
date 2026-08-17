import type { RemoteEntry } from "./types";

const DAV_NS = "DAV:";
const OC_NS = "http://owncloud.org/ns";

/** 取某元素下所有匹配 localName 的子元素（忽略命名空间前缀差异） */
function childrenByLocalName(el: Element, localName: string): Element[] {
	const out: Element[] = [];
	for (let i = 0; i < el.children.length; i++) {
		const c = el.children[i];
		if (c.localName === localName) out.push(c);
	}
	return out;
}

function firstByLocalName(el: Element, localName: string): Element | null {
	for (let i = 0; i < el.children.length; i++) {
		const c = el.children[i];
		if (c.localName === localName) return c;
	}
	return null;
}

/** 从 href 计算相对远端根目录的路径 */
function relativePathFromHref(href: string, baseHref: string): string {
	let h = href;
	try {
		h = decodeURIComponent(h);
	} catch {
		// 保留原样
	}
	// 去掉前导斜杠
	h = h.replace(/^\/+/, "");
	let b = baseHref;
	try {
		b = decodeURIComponent(b);
	} catch {
		// ignore
	}
	b = b.replace(/^\/+/, "").replace(/\/+$/, "");
	if (b && h.startsWith(b + "/")) {
		h = h.slice(b.length + 1);
	} else if (h === b) {
		h = "";
	}
	return h.replace(/\/+$/, "");
}

/**
 * 解析 PROPFIND multistatus 响应。
 * @param xml PROPFIND 响应体（文本）
 * @param baseHref 本次 PROPFIND 的请求 href（用于剥离前缀）
 */
export function parsePropfind(xml: string, baseHref: string): RemoteEntry[] {
	let doc: Document;
	try {
		doc = new DOMParser().parseFromString(xml, "application/xml");
	} catch {
		return [];
	}
	// 解析器错误（<parsererror>）容错
	if (doc.getElementsByTagName("parsererror").length > 0) {
		return [];
	}

	const responses = doc.getElementsByTagNameNS("*", "response");
	const entries: RemoteEntry[] = [];

	for (const resp of Array.from(responses)) {
		const hrefEl = firstByLocalName(resp, "href");
		if (!hrefEl || !hrefEl.textContent) continue;
		const href = hrefEl.textContent;

		// 找到状态为 200 的 propstat（跳过 404 propstat）
		const propstats = childrenByLocalName(resp, "propstat");
		let prop: Element | null = null;
		for (const ps of propstats) {
			const statusEl = firstByLocalName(ps, "status");
			if (statusEl && statusEl.textContent && statusEl.textContent.includes("200")) {
				prop = firstByLocalName(ps, "prop");
				break;
			}
		}
		if (!prop) continue;

		const etagEl = firstByLocalName(prop, "getetag");
		const mtimeEl = firstByLocalName(prop, "getlastmodified");
		const lenEl = firstByLocalName(prop, "getcontentlength");
		const typeEl = firstByLocalName(prop, "getcontenttype");
		const resTypeEl = firstByLocalName(prop, "resourcetype");

		const isDir = resTypeEl !== null && firstByLocalName(resTypeEl, "collection") !== null;

		// oc:checksums → checksum 列表
		// Nextcloud 真实格式：<oc:checksums><oc:checksum>SHA1:..</oc:checksum>...</oc:checksums>
		// 部分服务器直接把整段放在文本：<oc:checksums>SHA1:.. MD5:..</oc:checksums>
		const checksums: string[] = [];
		const checksumContainers = prop.getElementsByTagNameNS("*", "checksums");
		for (const container of Array.from(checksumContainers)) {
			const childChecksums = container.getElementsByTagNameNS("*", "checksum");
			if (childChecksums.length > 0) {
				for (const cs of Array.from(childChecksums)) {
					const t = cs.textContent?.trim();
					if (t) checksums.push(...t.split(/\s+/).filter(Boolean));
				}
			} else {
				const t = container.textContent?.trim();
				if (t) checksums.push(...t.split(/\s+/).filter(Boolean));
			}
		}

		let sha1: string | undefined;
		for (const c of checksums) {
			if (c.toUpperCase().startsWith("SHA1:")) {
				sha1 = c.slice(5);
				break;
			}
		}

		const sizeRaw = lenEl?.textContent;
		entries.push({
			path: relativePathFromHref(href, baseHref),
			href,
			isDir,
			etag: etagEl?.textContent?.trim() || undefined,
			lastModified: mtimeEl?.textContent?.trim() || undefined,
			size: sizeRaw ? parseInt(sizeRaw, 10) : undefined,
			contentType: typeEl?.textContent?.trim() || undefined,
			checksums,
			sha1,
		});
	}

	// 过滤掉根目录自身（path 为空且是目录）
	return entries.filter((e) => !(e.isDir && e.path === ""));
}
