
import React from 'react';
import { useOS } from '../context/OSContext';
import { Sparkle } from '@phosphor-icons/react';

const FAQ_DATA = [
    {
        q: "1. 进不去网页 / 白屏 / 点了没反应",
        reason: "网络有点小脾气，不够通畅。",
        solution: "需要一点点“魔法”才能连上外网。\n如果你不知道什么是“梯子/魔法”，请自行搜索一下~ \n这不是软件坏啦，是网路不通。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1fa84.png",
        color: "bg-blue-50 text-blue-700"
    },
    {
        q: "2. 发了消息，角色不回我？",
        reason: "为了帮大家省额度，角色不会自动秒回，他在等你戳他。",
        solution: "发完消息后，请注意观察顶部标题栏右边的 **闪电按钮**。\n点一下它，戳戳他，他就会思考并回复啦！",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4a4.png",
        color: "bg-yellow-50 text-yellow-700"
    },
    {
        q: "3. 为什么拉取不到模型列表？",
        reason: "很多时候是填写的地址（URL）差了一点点。",
        solution: "请仔细检查你的链接：\n1. 后面是不是漏掉了 `/v1` 这个小尾巴？\n2. 复制时是否多带了空格？\n3. 地址不对是敲不开门的哦。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f50d.png",
        color: "bg-red-50 text-red-700"
    },
    {
        q: "4. 出现红色弹窗 (API 报错)",
        reason: "情况A：如果你最近发了很多高清图，或者聊得太久了。\n情况B：没发图也报错？可能是提供接口的那边欠费或波动。",
        solution: "**情况A**：进【设置】，把“上下文条数”调低一点（例如 20-50）。\n**情况B**：请直接联系你购买/获取 API 的那个渠道哦，模拟器本身是无辜哒。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/26a0.png",
        color: "bg-orange-50 text-orange-700"
    },
    {
        q: "5. 关于聊天记录与记忆",
        reason: "怎么总结？旧记录删不删？",
        solution: "**怎么总结**：\n1. 聊天界面点击输入框左边的「+」号 -> “记忆归档”。\n2. 或者去「神经链接」App -> 选择角色 -> 记忆 -> “批量总结”。\n\n**在哪看**：\n总结生成的内容会保存在「神经链接」App 里（点进角色 -> 记忆页签）。\n\n**要删旧记录吗**：\n随便你。如果不删，为了防止 AI 读太多旧消息费钱，请去聊天界面右上角「设置」 -> “管理上下文 / 隐藏历史” -> 点击某一条消息折叠旧记录。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4dd.png",
        color: "bg-green-50 text-green-700"
    },
    {
        q: "6. 气泡主题 / 导入角色",
        reason: "想要个性化？想换角色？",
        solution: "**换气泡**：\n点顶部的名字 → 下滑找“气泡样式”。\n\n**导角色**：\n只支持导入本模拟器导出的 .json 文件（专属护照），不兼容酒馆图片卡和其他小手机角色卡。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3a8.png",
        color: "bg-purple-50 text-purple-700"
    },
    {
        q: "7. 碎碎念：关于 API（接口）",
        reason: "用公益/白嫖的不稳定？花钱买的报错？",
        solution: "公益的不稳定是常态。\n花钱买的请找卖家售后。\n作者和群友也是为爱发电，但是大家并不是专业的。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4ac.png",
        color: "bg-slate-50 text-slate-700"
    },
    {
        q: "8. 遇到奇怪的 Bug 怎么办？",
        reason: "可以在群里问，但严肃报修需要“病历本”。",
        solution: "请去桌面【设置】→【数据备份】导出 JSON 文件发给我。\n只有复现了问题，才能修好它。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f691.png",
        color: "bg-rose-50 text-rose-700"
    },
    {
        q: "9. 关于提问礼仪",
        reason: "拒绝低气压。",
        solution: "遇到问题深呼吸，直接发截图 + 描述发生了什么。\n欢迎大家积极讨论，但是避免通篇抱怨，散发负面情绪解决不了问题，还会劝退想帮你的人。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/2764.png",
        color: "bg-pink-50 text-pink-700"
    },
    {
        q: "10. 小屋里角色立绘怎么更换？",
        reason: "想给角色换个造型/衣服。",
        solution: "1. 进入小屋，点击顶部的「装修」按钮进入编辑模式。\n2. **直接点击**画面中央的角色小人。\n3. 选择一张透明背景的图片上传即可。\n(注意：这里更换的是小屋专属的 Q 版/Chibi 立绘，不是聊天头像哦)",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3e0.png",
        color: "bg-indigo-50 text-indigo-700"
    },
    {
        q: "11. 导入的表情包不显示 / 导入没反应？",
        reason: "通常是格式不对，或者链接无效。",
        solution: "1. **严格检查格式**：必须是 `名字--URL`，中间是**两个减号**！\n   错误：`滑稽 http://...`\n   正确：`滑稽--http://...`\n2. **检查链接**：必须是图片直链（.jpg/.png/.gif 结尾）。\n3. **一行一个**：不要把所有内容写在一行里。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f5bc.png",
        color: "bg-cyan-50 text-cyan-700"
    }
];

const FAQApp: React.FC = () => {
    const { closeApp } = useOS();

    return (
        <div className="h-full w-full bg-slate-50 flex flex-col font-light">
            {/* Header */}
            <div className="h-20 bg-white/70 backdrop-blur-md flex items-end pb-3 px-4 border-b border-white/40 shrink-0 sticky top-0 z-10">
                <div className="flex items-center gap-2 w-full">
                    <button onClick={closeApp} className="p-2 -ml-2 rounded-full hover:bg-black/5 active:scale-90 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-600">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                    <h1 className="text-xl font-medium text-slate-700 tracking-wide">常见问题</h1>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 pb-20 no-scrollbar">
                {/* Intro Banner */}
                <div className="bg-gradient-to-r from-pink-100 to-indigo-100 p-5 rounded-3xl mb-6 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-700 mb-2 flex items-center gap-2">
                        <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f338.png" className="w-5 h-5 inline" alt="" /> 新手必读小贴士 <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f338.png" className="w-5 h-5 inline" alt="" />
                    </h2>
                    <p className="text-xs text-slate-600 leading-relaxed opacity-90">
                        欢迎来到这里！为了让你和角色的互动更顺畅，如果遇到问题，请先看看下面有没有答案哦~ 
                        <br/>
                        (如果不看公告直接提问，大家可能不知道怎么帮你，也会消耗群友的耐心呢)
                    </p>
                </div>

                {/* 记忆系统使用指南（三种模式） */}
                <div className="mb-6 rounded-3xl overflow-hidden border border-violet-200 shadow-sm">
                    <div className="bg-gradient-to-r from-violet-500 to-indigo-500 px-5 py-3 text-white">
                        <h2 className="text-base font-bold flex items-center gap-2">🧠 你的角色怎么"记事"的？</h2>
                        <p className="text-[11px] opacity-90 mt-0.5">先看每次聊天 AI 能看到什么 → 再挑一种模式</p>
                    </div>
                    <div className="bg-white p-4 space-y-3">

                        {/* 基础概念：AI 每次收到的上下文 */}
                        <div className="bg-slate-900 rounded-2xl p-4 text-white">
                            <h3 className="text-sm font-bold mb-2">📺 AI 每次回你，眼里看到什么</h3>
                            <div className="text-[11px] leading-relaxed space-y-2">
                                <p>假设你和 <b className="text-yellow-300">阿黎</b> 已经聊了 <b>3000 条</b>，现在发了新消息：<br/>
                                    <span className="text-yellow-200">"花花今天把我的鱼干叼到沙发上了"</span>
                                </p>
                                <div className="bg-slate-800 rounded-xl p-3 space-y-1.5">
                                    <p className="text-slate-300">AI 本次收到的 <b className="text-white">上下文</b> 由这四层拼起来：</p>
                                    <p>① <b className="text-green-300">最近聊天原文</b>——默认 <b>500 条</b>，在 <b>聊天顶部齿轮 → 聊天设置 → "上下文条数"</b> 滑块里可调（20 ~ 5000）</p>
                                    <p>② <b className="text-blue-300">日度总结</b>——传统的按天总结（char.memories），你已经熟悉的那种。本月的全部日度总结都会一起送给 AI</p>
                                    <p>③ <b className="text-purple-300">月度精炼</b>——把某个月的日度总结再精炼成一段，需要在 <b>神经链接 → 角色 → 记忆</b> 里手动点"激活"才会送</p>
                                    <p>④ <b className="text-pink-300">向量记忆召回</b>——只有开了记忆宫殿的角色才有。按当前对话语义搜最相关的 10 几条往事丢给 AI</p>
                                </div>
                                <p className="text-slate-300">
                                    花花如果出现在 <b>500 条原文</b> 内 → ① 直接看到原文<br/>
                                    在 500 条之外、但所在那天被日度总结过 → ② 看到当天总结<br/>
                                    在很老的月份、已被月度精炼 → ③ 看到精炼后的一小段<br/>
                                    做过向量化 → ④ 按"花花"这个关键词搜出相关事件<br/>
                                </p>
                                <p className="text-yellow-200 font-bold">四层是兜底关系，任一层命中 AI 就知道花花是你的猫。</p>
                            </div>
                        </div>

                        {/* Mode 1 */}
                        <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                            <h3 className="text-sm font-bold text-slate-700 mb-1">📋 模式 1：纯手动（默认）</h3>
                            <p className="text-[11px] text-slate-500 leading-relaxed mb-2">只有 ① 最近 500 条原文 + ② 日度总结（+ ③ 月度精炼，如果你手动激活）。④ 不开。</p>
                            <div className="bg-white rounded-xl p-2.5 border border-dashed border-slate-200 text-[11px] text-slate-600 leading-relaxed space-y-1">
                                <p><b className="text-slate-700">日常体验</b>：500 条对一般日常够用（大概几天到一两周的聊天量）。聊得多了才会漏事。</p>
                                <p><b className="text-slate-700">花花在 3000 条外，没归档过</b> → AI 完全看不到，可能会懵。解法：<b>聊天左下 +号 → 记忆归档</b>，它会按天生成日度总结。以后聊天 AI 都带着本月日度总结。</p>
                                <p><b className="text-slate-700">再老的月份</b>：神经链接 → 角色 → 记忆 → 选月份 → "生成"，把那个月的日度总结再精炼成月度总结。用的时候点"激活"才会送给 AI。</p>
                                <p className="text-green-700">✨ <b>新改动</b>：归档完会自动把已归档的消息从聊天 UI 隐藏（保留最近 max(100, 本次归档量 15%) 条可见）。下次再点归档不会把前面的重复总结。</p>
                            </div>
                        </div>

                        {/* Mode 2 */}
                        <div className="bg-blue-50 rounded-2xl p-3 border border-blue-100">
                            <h3 className="text-sm font-bold text-blue-700 mb-1">🏰 模式 2：开记忆宫殿，不开自动归档</h3>
                            <p className="text-[11px] text-slate-500 leading-relaxed mb-2">比模式 1 多了 ④ 向量记忆。聊天 UI 不变，日度/月度总结依旧靠你手动。</p>
                            <div className="bg-white rounded-xl p-2.5 border border-dashed border-blue-200 text-[11px] text-slate-600 leading-relaxed space-y-1">
                                <p><b className="text-blue-700">花花在 3000 条外、没做日度总结</b> → 模式 1 看不到，模式 2 <b>有可能</b>看到。因为宫殿会从原始聊天自动抽出事件记忆（"user 有一只叫花花的猫"）向量化存起来。你说"花花吃鱼干"时它按语义搜到这条记忆丢给 AI。</p>
                                <p><b className="text-blue-700">为什么不保证每次命中</b>：向量搜索每次取相关度 top 十几条。冷门话题可能被更热的话题挤掉。所以偶尔做一次日度总结做兜底更稳。</p>
                                <p><b className="text-blue-700">怎么开</b>：神经链接 → 角色 → 设定 → "记忆宫殿" 开关；然后进记忆宫殿 App 配 Embedding API 和副 LLM。</p>
                            </div>
                        </div>

                        {/* Mode 3 */}
                        <div className="bg-violet-50 rounded-2xl p-3 border border-violet-100">
                            <h3 className="text-sm font-bold text-violet-700 mb-1">⚡ 模式 3：全自动（宫殿 + 自动归档都开）</h3>
                            <p className="text-[11px] text-slate-500 leading-relaxed mb-2">① ② ④ 自动跑。月度精炼照旧你偶尔手动点。</p>
                            <div className="bg-white rounded-xl p-2.5 border border-dashed border-violet-200 text-[11px] text-slate-600 leading-relaxed space-y-1">
                                <p><b className="text-violet-700">发生的事</b>：每积累 100 条左右，角色会在后台"回味"一下——
                                    <br/>· 从原始聊天抽取事件，向量化入库（模式 2 的那部分）
                                    <br/>· 同时把这些事件按日期合并成日度总结，写进 char.memories
                                    <br/>· 已处理的旧消息从聊天 UI 隐藏（保留最近 100 条可见）
                                </p>
                                <p><b className="text-violet-700">你感知到什么</b>：聊天顶部有 "XX 正在回味…" 状态条，结束弹 "本次新增 N 条记忆" 的小卡片。聊天 UI 不会一下子塌空，有 100 条 hot zone 垫着。</p>
                                <p><b className="text-violet-700">怎么开</b>：先按模式 2 启用记忆宫殿 → 再去 <b>神经链接 → 角色 → 记忆宫殿开关下面的 "📚 自动归档"</b> 子开关。第一次开会问你"要不要立刻把已有 N 条消息追平"，推荐选是（不然要按常规节奏聊很久才追上）。</p>
                            </div>
                        </div>

                        {/* 进一步小知识 */}
                        <div className="bg-yellow-50 rounded-2xl p-3 border border-yellow-100">
                            <h3 className="text-sm font-bold text-yellow-700 mb-1">🤔 几个常见疑惑</h3>
                            <div className="text-[11px] text-slate-700 leading-relaxed space-y-1.5">
                                <p><b>Q：隐藏了的消息，AI 还能读到吗？</b><br/>
                                    A：读不到<b>原文</b>。但只要它出现在 ② 日度总结 / ③ 月度精炼 / ④ 向量记忆 任何一层，AI 就能从那一层读到 <b>LLM 改写过</b> 的版本。所以不会真的忘。</p>
                                <p><b>Q：原文 + 三种总结 = 同一件事被 AI 看到 4 次？</b><br/>
                                    A：<b>原文只送一次</b>（只有 ① 是真原文）。② ③ ④ 都是 LLM 改写过的不同粒度总结（日度 / 月度 / 事件），哪怕说的是同一件事，文字版本也不同，不算重复送原话。多层是<b>故意</b>的兜底——④ 向量召回偶尔会漏，② ③ 作为目录补位。</p>
                                <p><b>Q：500 条感觉不够看，能调吗？</b><br/>
                                    A：能。<b>聊天顶部齿轮 → 聊天设置 → "上下文条数"</b> 滑块 20 ~ 5000 自选。调高 AI 看得更远但 API 调用更贵，按需。</p>
                                <p><b>Q：点"管理上下文"看到灰色的消息是啥？</b><br/>
                                    A：被自动/手动归档时隐藏掉的。AI 看不到它们的原文，但能通过日度总结 / 向量记忆读到它们的内容。<b>你不用</b>再手动隐藏一次。</p>
                                <p><b>Q：宫殿的向量"水位线"和"隐藏起点"是一个东西吗？</b><br/>
                                    A：不是。宫殿有自己的进度（技术上叫 mp_lastMsgId_），和聊天显示的"隐藏起点"（hideBefore）分开走。<b>你不用管宫殿的那个</b>，它会自己处理。</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* FAQ Cards */}
                <div className="space-y-4">
                    {FAQ_DATA.map((item, index) => (
                        <div key={index} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 animate-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
                            <div className="flex items-start gap-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${item.color.split(' ')[0]}`}>
                                    <img src={item.icon} className="w-5 h-5 inline" alt="" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className={`text-sm font-bold mb-2 ${item.color.split(' ')[1]}`}>{item.q}</h3>
                                    
                                    <div className="space-y-2">
                                        <div className="flex gap-2 items-start">
                                            <span className="text-xs font-bold text-slate-400 shrink-0 mt-0.5">原因:</span>
                                            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{item.reason}</p>
                                        </div>
                                        <div className="flex gap-2 items-start bg-slate-50 p-2 rounded-lg">
                                            <span className="text-xs font-bold text-green-500 shrink-0 mt-0.5 flex items-center gap-0.5"><Sparkle size={12} weight="fill" /> 解决:</span>
                                            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">{item.solution}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-8 text-center text-[10px] text-slate-400">
                    SullyOS Help Center • v1.1
                </div>
            </div>
        </div>
    );
};

export default FAQApp;
