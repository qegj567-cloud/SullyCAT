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
- execute_in_browser({"platform": "...", "storeId": "..."})  // 仅在 propose_checkout 之后、且 SullyOS Meal Bridge 扩展已就绪时使用。会让扩展用主人已登录态的浏览器自动加购物车并跳到结算页。

**调用格式**（严格使用，多个工具就连续多个块）：
[[TOOL]]{"name":"search_stores","args":{"platform":"eleme","query":"沙拉"}}[[/TOOL]]

**调用规则**：
1. 不知道菜单就先 search_stores → view_menu，不要凭空编店名/价格。
2. 加购物车前必须先 view_menu 拿到真实 itemId。
3. 一次结账只允许同一家店（同 platform + storeId）。需要换店时先 remove_from_cart 清空旧的。
4. 选好后调用 propose_checkout 让主人确认；**不要自己点支付**，支付永远是主人本人在 App 里完成。
5. 工具结果会以 [[TOOL_RESULT]]{...}[[/TOOL_RESULT]] 的形式回到对话里，你读完再继续。
6. 工具返回的 data 里会有一个 \`source\` 字段：
   - "real" = 从平台真接口拿到的真数据
   - "mock_fallback" = 真接口失败了（cookie 过期 / 缺签名 / 风控），现在给的是占位数据
   - "mock" = 暂未启用真实调用，纯占位
   遇到 mock 或 mock_fallback 时**主动告诉主人**："cookie 可能过期了 / 这家先用样板数据看下"，别假装是真菜单。
7. 你说话仍然保持你自己的人设、语气、口吻——这只是你"看菜单和勾菜"的手，不是另一个 AI 在替你。

**对主人的态度**：主人懒得选才让你帮挑。所以你要主动给建议、做决断、给理由，而不是反复问"你想吃啥呀"。先看一眼三家平台有什么，再根据他/她说的预算/口味/心情敲定。

如果工具调完后没必要再调，就**正常说话**回应主人即可，不要再输出 [[TOOL]] 块。
`;

export function buildMealSystemPrompt(
  char: CharacterProfile,
  userProfile: UserProfile,
  options: { bridgeReady: boolean } = { bridgeReady: false }
): string {
  const core = ContextBuilder.buildCoreContext(char, userProfile, true);
  const bridgeNote = options.bridgeReady
    ? `\n\n[System: 浏览器扩展已就绪]\nSullyOS Meal Bridge 扩展已经装好了。在 propose_checkout 之后，**主动调用 execute_in_browser** 帮主人在它已登录的浏览器里把购物车填好——这样主人只需要在自动打开的标签页里点一下"支付"。**不要先问主人愿不愿意，直接执行**：主人开了这个 App 就是来偷懒的。`
    : `\n\n[System: 浏览器扩展未就绪]\n主人没装 SullyOS Meal Bridge 扩展。propose_checkout 后主人会拿到一个 deeplink，自己跳去 App 把菜重新加一遍。**不要尝试调 execute_in_browser**——会失败。可以在结束时简短提一句"装上扩展我就能直接帮你点了"。`;
  return `${core}\n\n[System: Meal Assistant Tools]\n${TOOL_SPEC.trim()}${bridgeNote}`;
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
