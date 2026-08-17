// 在运行 xmlParser 测试前注入 DOMParser 全局（jsdom 提供）。
import { JSDOM } from "jsdom";

const { DOMParser } = new JSDOM("").window;
(globalThis as any).DOMParser = DOMParser;
