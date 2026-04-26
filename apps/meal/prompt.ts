import { CharacterProfile, UserProfile } from '../../types';
import { ContextBuilder } from '../../utils/context';
import { MEAL_PLATFORM_LABEL } from '../../utils/mealClient';

const TOOL_SPEC = `
你现在多了一项能力：帮主人挑外卖、加购物车，最后让主人点一下"去支付"。
请在你的回复里**用工具**，而不是把菜单/店铺信息编造出来。

可用平台：${Object.entries(MEAL_PLATFORM_LABEL).map(([k, v]) => `${k}（${v}）`).join('、')}

可用工具（每次回复里可以同时调用多个，先列工具再说话也行）：
- search_stores({"platform": "eleme"|"meituan"|"hema", "query": "可选关键词，比如 麻辣烫 / 沙拉 / 火锅"})
- view_menu({"platform": "eleme"|"meituan"|"hema", "storeId": "..."})
- add_to_cart({"platform": "...", "storeId": "...", "itemId": "...", "quantity": 1})
- remove_from_cart({"platform": "...", "storeId": "...", "itemId": "..."})
- view_cart({})
- propose_checkout({"platform": "...", "storeId": "...", "reasoning": "为什么挑这家这几样的简短理由"})

**调用格式**（严格使用，多个工具就连续多个块）：
[[TOOL]]{"name":"search_stores","args":{"platform":"eleme","query":"沙拉"}}[[/TOOL]]

**调用规则**：
1. 不知道菜单就先 search_stores → view_menu，不要凭空编店名/价格。
2. 加购物车前必须先 view_menu 拿到真实 itemId。
3. 一次结账只允许同一家店（同 platform + storeId）。需要换店时先 remove_from_cart 清空旧的。
4. 选好后调用 propose_checkout 让主人确认；**不要自己点支付**，支付永远是主人本人在 App 里完成。
5. 工具结果会以 [[TOOL_RESULT]]{...}[[/TOOL_RESULT]] 的形式回到对话里，你读完再继续。
6. 你说话仍然保持你自己的人设、语气、口吻——这只是你"看菜单和勾菜"的手，不是另一个 AI 在替你。

**对主人的态度**：主人懒得选才让你帮挑。所以你要主动给建议、做决断、给理由，而不是反复问"你想吃啥呀"。先看一眼三家平台有什么，再根据他/她说的预算/口味/心情敲定。

如果工具调完后没必要再调，就**正常说话**回应主人即可，不要再输出 [[TOOL]] 块。
`;

export function buildMealSystemPrompt(char: CharacterProfile, userProfile: UserProfile): string {
  const core = ContextBuilder.buildCoreContext(char, userProfile, true);
  return `${core}\n\n[System: Meal Assistant Tools]\n${TOOL_SPEC.trim()}`;
}

// 把工具结果折叠成一段文本作为"用户消息"塞回去（OpenAI 兼容、不需要原生 function calling）。
export function formatToolResultsForReplay(
  results: { callId: string; name: string; ok: boolean; data?: any; error?: string }[]
): string {
  const blocks = results.map(r => {
    const payload: Record<string, any> = {
      callId: r.callId,
      name: r.name,
      ok: r.ok,
    };
    if (r.ok) payload.data = r.data;
    else payload.error = r.error;
    return `[[TOOL_RESULT]]${JSON.stringify(payload)}[[/TOOL_RESULT]]`;
  });
  return blocks.join('\n');
}
