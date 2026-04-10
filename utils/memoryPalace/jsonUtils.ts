/**
 * Memory Palace — JSON 安全解析工具
 *
 * LLM 返回的 JSON 经常有格式问题：
 * - 未转义的引号
 * - 尾随逗号
 * - max_tokens 截断导致 JSON 不完整（最常见！）
 * - Markdown 代码块包裹
 *
 * 四层 fallback 确保尽可能多地解析成功。
 */

/**
 * 从 LLM 回复中安全提取并解析 JSON 数组
 */
export function safeParseJsonArray(raw: string): any[] {
    if (!raw || !raw.trim()) return [];

    // 去掉 markdown 代码块包裹
    let cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();

    // 1. 尝试提取完整的 [...] 块
    const fullMatch = cleaned.match(/\[[\s\S]*\]/);
    if (fullMatch) {
        // 直接解析
        try {
            const result = JSON.parse(fullMatch[0]);
            if (Array.isArray(result)) return result;
        } catch { /* continue */ }

        // 修复后解析
        try {
            const fixed = fixBrokenJson(fullMatch[0]);
            const result = JSON.parse(fixed);
            if (Array.isArray(result)) return result;
        } catch { /* continue */ }

        // 逐对象抢救
        const salvaged = salvageObjects(fullMatch[0]);
        if (salvaged.length > 0) return salvaged;
    }

    // 2. 没有完整 [...] → 可能是被 max_tokens 截断了
    //    找到 [ 开始，尽力从截断的内容中抢救完整的对象
    const openBracketIdx = cleaned.indexOf('[');
    if (openBracketIdx >= 0) {
        const truncated = cleaned.slice(openBracketIdx);
        const salvaged = salvageObjects(truncated);
        if (salvaged.length > 0) {
            console.warn(`⚡ [JSON] Salvaged ${salvaged.length} objects from truncated response`);
            return salvaged;
        }
    }

    // 3. 连 [ 都没有，直接从整个文本中抢救 {...} 块
    const lastResort = salvageObjects(cleaned);
    if (lastResort.length > 0) {
        console.warn(`⚡ [JSON] Last resort: salvaged ${lastResort.length} objects`);
        return lastResort;
    }

    return [];
}

/** 修复 LLM 输出的 JSON 中常见格式错误 */
function fixBrokenJson(s: string): string {
    // 尾随逗号 ,] 或 ,}
    s = s.replace(/,\s*([}\]])/g, '$1');
    // 属性名单引号→双引号
    s = s.replace(/'(\w+)'\s*:/g, '"$1":');
    // 字符串值中的未转义换行
    s = s.replace(/"([^"]*)\n([^"]*)"/g, (_, a, b) => `"${a}\\n${b}"`);
    return s;
}

/** 按 {...} 块逐个尝试解析，能救多少救多少 */
function salvageObjects(raw: string): any[] {
    const results: any[] = [];
    // 匹配每个完整的 {...} 对象（支持嵌套 {} 和内部 [...] 如 tags 数组）
    const pattern = /\{(?:[^{}[\]]*|\{[^{}]*\}|\[[^\[\]]*\])*\}/g;
    let match;
    while ((match = pattern.exec(raw)) !== null) {
        const candidate = match[0];
        // 第一层：直接解析
        try {
            const obj = JSON.parse(candidate);
            if (obj && typeof obj === 'object') {
                results.push(obj);
                continue;
            }
        } catch { /* try fix */ }
        // 第二层：修复后解析
        try {
            const obj = JSON.parse(fixBrokenJson(candidate));
            if (obj && typeof obj === 'object') {
                results.push(obj);
            }
        } catch { /* skip this object */ }
    }
    return results;
}
