/**
 * Memory Palace — JSON 安全解析工具
 *
 * LLM 返回的 JSON 经常有格式问题（未转义引号、尾随逗号等）。
 * 这个工具提供多层 fallback 确保尽可能解析成功。
 */

/**
 * 从 LLM 回复中安全提取并解析 JSON 数组
 * 三层 fallback：直接解析 → 修复后解析 → 逐对象抢救
 */
export function safeParseJsonArray(raw: string): any[] {
    // 1. 提取 [...] 块
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const jsonStr = jsonMatch[0];

    // 2. 直接解析
    try {
        const result = JSON.parse(jsonStr);
        if (Array.isArray(result)) return result;
    } catch { /* continue */ }

    // 3. 修复常见错误后解析
    try {
        const fixed = fixBrokenJson(jsonStr);
        const result = JSON.parse(fixed);
        if (Array.isArray(result)) return result;
    } catch { /* continue */ }

    // 4. 最后手段：逐对象抢救
    return salvageObjects(jsonStr);
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

/** 按 {...} 块逐个尝试解析 */
function salvageObjects(raw: string): any[] {
    const results: any[] = [];
    const pattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    let match;
    while ((match = pattern.exec(raw)) !== null) {
        try {
            results.push(JSON.parse(match[0]));
        } catch {
            try {
                results.push(JSON.parse(fixBrokenJson(match[0])));
            } catch { /* skip */ }
        }
    }
    return results;
}
