
import { CharacterProfile, UserProfile, DailySchedule, ScheduleSlot } from '../types';
import { ContextBuilder } from './context';
import { DB } from './db';
import { safeResponseJson } from './safeApi';

/**
 * Attempt to repair truncated JSON from LLM output.
 * Handles common cases: unterminated strings, missing closing brackets.
 */
function repairTruncatedJson(raw: string): string {
  let s = raw.trim();

  // Strip trailing comma
  s = s.replace(/,\s*$/, '');

  // Close any unterminated string: count unescaped quotes
  const unescapedQuotes = s.match(/(?<!\\)"/g);
  if (unescapedQuotes && unescapedQuotes.length % 2 !== 0) {
    s += '"';
  }

  // If we're inside an object value that got cut, close the object/array chain
  // Count open vs close brackets
  let braces = 0;
  let brackets = 0;
  for (const ch of s) {
    if (ch === '{') braces++;
    else if (ch === '}') braces--;
    else if (ch === '[') brackets++;
    else if (ch === ']') brackets--;
  }

  // Strip trailing comma again after quote repair
  s = s.replace(/,\s*$/, '');

  // Close brackets/braces
  while (brackets > 0) { s += ']'; brackets--; }
  while (braces > 0) { s += '}'; braces--; }

  return s;
}

interface ApiConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
}

export async function generateDailyScheduleForChar(
    char: CharacterProfile,
    userProfile: UserProfile,
    apiConfig: ApiConfig,
    forceRegenerate: boolean = false
): Promise<DailySchedule | null> {
    const today = new Date().toISOString().split('T')[0];

    // Check if already exists
    if (!forceRegenerate) {
        const existing = await DB.getDailySchedule(char.id, today);
        if (existing) return existing;
    }

    // Preserve cover image from previous schedules
    let coverImage: string | undefined;
    try {
        const prev = await DB.getScheduleCoverImage(char.id);
        if (prev) coverImage = prev;
    } catch {}

    // Build context for generation
    const baseContext = ContextBuilder.buildCoreContext(char, userProfile, false);

    const now = new Date();
    const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];

    const prompt = `${baseContext}

## Task: 生成角色每日日程表

今天是 ${today} (星期${dayOfWeek})。

请为角色 "${char.name}" 生成一份符合其性格、身份和生活方式的今日日程表。

要求：
1. 生成 5-7 个时间段，从早到晚
2. 日程应体现角色的个性和日常习惯
3. 时间段要合理，不要重叠
4. 每个时间段包含：开始时间、活动名称、简短描述、一个匹配的emoji
5. 日程应该是角色"自己的生活"，不要围绕用户安排
6. **innerThought**: 每个时段写一句角色的内心独白/碎碎念——用角色自己的语气和口吻，描述此刻的感受、心情、在想什么。这句话会在该时段被直接注入角色意识，所以要像角色本人的内心OS，不要用第三人称，不要太长（15-30字）。

示例 innerThought:
- 宅男角色 10:00 打游戏: "这关打了三次了还没过，有点上头"
- 文静角色 15:00 看书: "这本小说结局好难猜...再看一章吧"
- 活泼角色 08:00 晨跑: "今天天气也太好了吧！跑起来超舒服的！"

请以JSON格式输出：
{
  "slots": [
    { "startTime": "08:00", "activity": "活动名称", "description": "简短描述", "emoji": "🏃", "innerThought": "角色此刻的内心OS" },
    ...
  ]
}

仅输出JSON，不要其他内容。`;

    try {
        const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.85,
                max_tokens: 3000
            })
        });

        if (!response.ok) {
            console.error('[Schedule] API error:', response.status);
            return null;
        }

        const data = await safeResponseJson(response);
        let content = data.choices?.[0]?.message?.content || '';
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();

        let parsed: any;
        try {
          parsed = JSON.parse(content);
        } catch {
          // LLM output may be truncated — attempt repair
          const repaired = repairTruncatedJson(content);
          parsed = JSON.parse(repaired);
        }
        const slots: ScheduleSlot[] = (parsed.slots || []).map((s: any) => ({
            startTime: s.startTime || '00:00',
            activity: s.activity || '',
            description: s.description,
            emoji: s.emoji,
            location: s.location,
            innerThought: s.innerThought,
        })).filter((s: ScheduleSlot) => s.activity);

        if (slots.length === 0) return null;

        // Sort by time
        slots.sort((a, b) => a.startTime.localeCompare(b.startTime));

        const schedule: DailySchedule = {
            id: `${char.id}_${today}`,
            charId: char.id,
            date: today,
            slots,
            generatedAt: Date.now(),
            coverImage,
        };

        await DB.saveDailySchedule(schedule);
        return schedule;
    } catch (e) {
        console.error('[Schedule] Generation failed:', e);
        return null;
    }
}
