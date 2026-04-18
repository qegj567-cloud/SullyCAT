
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
                        <p className="text-[11px] opacity-90 mt-0.5">没耐心看完整的？直接跳到底部"我该选哪个？"</p>
                    </div>
                    <div className="bg-white p-4 space-y-3">

                        {/* 基础概念：AI 每次收到的上下文 */}
                        <div className="bg-slate-900 rounded-2xl p-4 text-white">
                            <h3 className="text-sm font-bold mb-2">📺 AI 每次回你，眼里看到什么</h3>
                            <div className="text-[11px] leading-relaxed space-y-2">
                                <p>AI 的"上下文"是由四层拼起来的，任何一层命中你想让它记得的事它就记得：</p>
                                <div className="bg-slate-800 rounded-xl p-3 space-y-1.5">
                                    <p className="text-slate-300">四层分别是：</p>
                                    <p>① <b className="text-green-300">最近聊天原文</b>——默认 <b>500 条</b>，在 <b>聊天顶部齿轮 → 聊天设置 → "上下文条数"</b> 滑块里可调（20 ~ 5000）</p>
                                    <p>② <b className="text-purple-300">月度精炼</b>——<b>生成一次就自动送</b>，不用激活。在 <b>神经链接 → 角色 → 记忆 → 点某月 → "生成"</b>。适合处理老月份。</p>
                                    <p>③ <b className="text-blue-300">日度总结（激活的月份）</b>——<b>默认不送</b>。传统的按天总结（char.memories），要在月份卡片上点亮 <b>👁 小眼睛</b> 图标才会送那个月的详细日度；不点亮的月份只靠 ② 月度精炼顶。</p>
                                    <p>④ <b className="text-pink-300">向量记忆召回</b>——只有开了记忆宫殿的角色才有。按当前对话语义搜 <b>top 15 条</b> 最相关的往事丢给 AI。</p>
                                </div>
                                <p className="text-yellow-200">四层兜底：原文 → 月度 → 日度 → 向量。任一层命中就不会懵。下面用花花的例子看它们具体长什么样。</p>
                            </div>
                        </div>

                        {/* 花花在四层里长什么样 */}
                        <div className="bg-orange-50 rounded-2xl p-3 border border-orange-200">
                            <h3 className="text-sm font-bold text-orange-700 mb-2">🐱 花花的例子：同一件事在四层里长什么样</h3>
                            <div className="text-[11px] leading-relaxed space-y-2">
                                <p className="text-slate-600">你半年前 3 月某天和阿黎的聊天。<b>现在已经聊了几千条</b>，那天的消息早划出 500 条之外了。同一件事，不同层看到的是：</p>

                                <div className="bg-white rounded-xl p-2.5 border border-dashed border-green-300">
                                    <p className="text-[10px] font-bold text-green-700 mb-1">① 原文（如果还在最近 500 条）</p>
                                    <pre className="whitespace-pre-wrap font-sans text-slate-700 text-[11px]">[你] 花花今天又把我的鱼干叼到沙发上吃<br/>[你] 她真的是什么都敢偷<br/>[阿黎] 哈哈哈她是觉得自己是主子吧<br/>[你] 我都懒得骂了 太可爱</pre>
                                </div>

                                <div className="bg-white rounded-xl p-2.5 border border-dashed border-blue-300">
                                    <p className="text-[10px] font-bold text-blue-700 mb-1">③ 日度总结（激活这个月 👁 后 AI 看到的）</p>
                                    <pre className="whitespace-pre-wrap font-sans text-slate-700 text-[11px]">[3月15日] (neutral): 用户抱怨家里的猫"花花"偷偷把鱼干叼到沙发吃，语气里又气又宠。用户对这只猫表现出明显的宠爱。</pre>
                                </div>

                                <div className="bg-white rounded-xl p-2.5 border border-dashed border-purple-300">
                                    <p className="text-[10px] font-bold text-purple-700 mb-1">② 月度精炼（生成过就自动送）</p>
                                    <pre className="whitespace-pre-wrap font-sans text-slate-700 text-[11px]">[2024-03]: 用户这个月经常和我聊她养的猫"花花"——偷鱼干、把拖鞋当猫砂、半夜撞倒玩具箱。她嘴上嫌弃，实则非常宠溺这只猫。</pre>
                                </div>

                                <div className="bg-white rounded-xl p-2.5 border border-dashed border-pink-300">
                                    <p className="text-[10px] font-bold text-pink-700 mb-1">④ 向量召回（你说到"花花"时被语义检索命中）</p>
                                    <pre className="whitespace-pre-wrap font-sans text-slate-700 text-[11px]">[客厅 · 2024-03-15, 重要性 5] 花花（用户家的猫）偷偷把鱼干叼到沙发上吃，她嘴上嫌弃心里宠着。</pre>
                                </div>

                                <p className="text-slate-500 italic">原文最具体但只留 500 条；日度总结压到一两行保留情绪；月度精炼是整月的鸟瞰；向量召回按相关度精准命中话题。</p>
                            </div>
                        </div>

                        {/* Mode 1 */}
                        <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                            <h3 className="text-sm font-bold text-slate-700 mb-1">📋 模式 1：纯手动（默认）</h3>
                            <p className="text-[11px] text-slate-500 leading-relaxed mb-2">用 ① 最近 500 条 + ② 月度精炼 + ③ 激活月份的日度。④ 关闭。</p>
                            <div className="bg-white rounded-xl p-2.5 border border-dashed border-slate-200 text-[11px] text-slate-600 leading-relaxed space-y-1">
                                <p><b className="text-slate-700">日常体验</b>：500 条够一般日常用（大概几天到一两周）。</p>
                                <p><b className="text-slate-700">做日度总结</b>：<b>聊天左下 +号 → 记忆归档</b>，按天生成日度总结存进 char.memories。想让 AI 读到某个月的详细内容，要在 <b>神经链接 → 角色 → 记忆 → 点亮那个月的 👁 小眼睛</b>。不点亮的月份，AI 读不到日度。</p>
                                <p><b className="text-slate-700">做月度精炼</b>：神经链接 → 角色 → 记忆 → 点某月 → <b>"生成"</b> 一次即可。之后每次聊天自动送（不用激活，不用再点什么）。适合压缩老月份。</p>
                                <p className="text-green-700">✨ <b>这次更新的改动</b>：点"记忆归档"成功后自动把已归档的消息从聊天 UI 隐藏（保留最近 max(100, 本次归档量 15%) 条可见）。下次再点归档不会把前面的重复总结。灰色的消息 AI 仍能从日度总结里读到。</p>
                            </div>
                        </div>

                        {/* Mode 2 */}
                        <div className="bg-blue-50 rounded-2xl p-3 border border-blue-100">
                            <h3 className="text-sm font-bold text-blue-700 mb-1">🏰 模式 2：开记忆宫殿，不开自动归档</h3>
                            <p className="text-[11px] text-slate-500 leading-relaxed mb-2">比模式 1 多了 ④ 向量记忆。聊天 UI 不变，日度/月度是否总结照样看你手动。</p>
                            <div className="bg-white rounded-xl p-2.5 border border-dashed border-blue-200 text-[11px] text-slate-600 leading-relaxed space-y-1">
                                <p><b className="text-blue-700">多的是什么</b>：宫殿会从原始聊天自动抽事件（"花花是用户的猫"这种）向量化存起来。你再提"花花"时按语义搜出来送给 AI。</p>
                                <p><b className="text-blue-700">要不要还做日度总结</b>：建议偶尔做。向量召回每次取 top 15，冷门话题可能被挤掉，日度/月度作为目录补位更稳。</p>
                                <p><b className="text-blue-700">怎么开</b>：神经链接 → 角色 → 设定 → "记忆宫殿" 开关；之后进记忆宫殿 App 配 Embedding + 副 LLM API。</p>
                            </div>
                        </div>

                        {/* Mode 3 */}
                        <div className="bg-violet-50 rounded-2xl p-3 border border-violet-100">
                            <h3 className="text-sm font-bold text-violet-700 mb-1">⚡ 模式 3：全自动（宫殿 + 自动归档都开）</h3>
                            <p className="text-[11px] text-slate-500 leading-relaxed mb-2">①③④ 自动跑。② 月度精炼仍然只需要偶尔点一次"生成"（老月份才用）。</p>
                            <div className="bg-white rounded-xl p-2.5 border border-dashed border-violet-200 text-[11px] text-slate-600 leading-relaxed space-y-1">
                                <p><b className="text-violet-700">自动发生什么</b>：每积累 100 条左右，角色在后台"回味"一下——
                                    <br/>· 从原始聊天抽事件向量化入库（④）
                                    <br/>· 同步按日期写日度总结（③）进 char.memories，<b>并自动点亮当月 👁 小眼睛</b>（所以 AI 立刻就能读到）
                                    <br/>· 已处理的旧消息从聊天 UI 隐藏（保留最近 100 条可见）
                                </p>
                                <p><b className="text-violet-700">你感知到什么</b>：聊天顶部有 "XX 正在回味…" 状态条，结束弹 "本次新增 N 条记忆" 的卡片。聊天不会塌空，有 100 条垫着。</p>
                                <p><b className="text-violet-700">怎么开</b>：先按模式 2 启用记忆宫殿 → 去 <b>神经链接 → 角色 → 记忆宫殿开关下面的 "📚 自动归档"</b>。第一次开会问你"要不要立刻把已有 N 条追平"，<b>推荐选是</b>（不然要按常规 100 条/批的速度慢慢追）。</p>
                            </div>
                        </div>

                        {/* 我该选哪个 */}
                        <div className="bg-gradient-to-br from-rose-50 to-orange-50 rounded-2xl p-3 border border-rose-200">
                            <h3 className="text-sm font-bold text-rose-700 mb-2">🎯 我该选哪个？（看这条就够）</h3>
                            <div className="text-[11px] leading-relaxed space-y-2">
                                <div className="bg-white rounded-xl p-2.5 border border-rose-100">
                                    <p className="font-bold text-slate-700 mb-0.5">👶 我是全新用户！我一个字都看不懂</p>
                                    <p className="text-slate-600">→ 用 <b>模式 1（默认）</b>，<b>什么都不用管</b>。角色靠最近 500 条记住近期的事，一般日常聊天够用。真聊到"他怎么忘事了"的程度再回来看这页。</p>
                                </div>
                                <div className="bg-white rounded-xl p-2.5 border border-rose-100">
                                    <p className="font-bold text-slate-700 mb-0.5">🆕 我是全新用户！但我大概懂传统记忆总结，想试试向量</p>
                                    <p className="text-slate-600">→ 直接 <b>模式 3</b>。配 Embedding + 副 LLM 一次，之后啥都自动。</p>
                                </div>
                                <div className="bg-white rounded-xl p-2.5 border border-rose-100">
                                    <p className="font-bold text-slate-700 mb-0.5">🧑 我是老用户！这次更新我一个字也看不懂</p>
                                    <p className="text-slate-600">→ 你原来就是 <b>模式 1</b>，<b>继续</b>就好。唯一变化：以后点"记忆归档"后，已总结的旧消息会自动隐藏（保留最近一部分可见）；下次归档也不会重复总结前面的。其它一切照旧。</p>
                                </div>
                                <div className="bg-white rounded-xl p-2.5 border border-rose-100">
                                    <p className="font-bold text-slate-700 mb-0.5">🎲 我是老用户！我想用向量！但我的角色一般不总结记忆，聊着玩的，以前的聊天他记不记得无所谓</p>
                                    <p className="text-slate-600">→ <b>模式 2</b>。开记忆宫殿但不开自动归档。聊天 UI 完全不变，你啥都不用点，角色后台偷偷把事件向量化，下次你随口提它就能想起来。旧聊天不做日度总结也没事。</p>
                                </div>
                                <div className="bg-white rounded-xl p-2.5 border border-rose-100">
                                    <p className="font-bold text-slate-700 mb-0.5">🚀 我是老用户！我积极追寻全新的全自动化</p>
                                    <p className="text-slate-600">→ <b>模式 3</b>，加油我的朋友。第一次打开记得选"立即追平历史"，不然几千条老聊天要很久才能按常规速度消化完。</p>
                                </div>
                                <div className="bg-amber-50 rounded-xl p-2.5 border-2 border-amber-300">
                                    <p className="font-bold text-amber-800 mb-0.5">🆘 我完全混乱了！想只总结某一天然后删光重来</p>
                                    <p className="text-slate-700">
                                        → 去 <b>神经链接 → 选角色 → 记忆</b>，找到那个日期 →
                                        点右侧的 <b>🔁 重总结</b> 按钮。<br/>
                                        这个入口 <b>忽略所有设置</b>（不管你有没有开宫殿、有没有开自动归档、那天的消息有没有被隐藏），
                                        直接从原始 DB 里读那天的全部消息，用你当前选中的提示词模板跑一遍，
                                        结果写进日度总结。<br/>
                                        这是系统里唯一一个"无视一切状态"的兜底入口，搞乱了就来这里。
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* 进一步小知识 */}
                        <div className="bg-yellow-50 rounded-2xl p-3 border border-yellow-100">
                            <h3 className="text-sm font-bold text-yellow-700 mb-1">🤔 几个常见疑惑</h3>
                            <div className="text-[11px] text-slate-700 leading-relaxed space-y-1.5">
                                <p><b>Q：隐藏了的消息，AI 还能读到吗？</b><br/>
                                    A：读不到<b>原文</b>。但只要它进了 ② 月度精炼 / ③ 激活月份的日度 / ④ 向量记忆 任何一层，AI 就能读到 <b>LLM 改写过</b> 的版本。</p>
                                <p><b>Q：原文 + 三种总结 = 同一件事被 AI 看到 4 次？</b><br/>
                                    A：<b>原文只送一次</b>（只有 ① 是真原文）。②③④ 都是 LLM 改写过的不同粒度版本（精炼 / 日度 / 事件），哪怕说的是同一件事文字也不同，不算重复送原话。多层是<b>故意</b>的兜底——④ 向量召回偶尔会漏，②③ 作为目录补位。</p>
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
