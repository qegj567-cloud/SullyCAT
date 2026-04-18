
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
                        <p className="text-[11px] opacity-90 mt-0.5">三种模式，想明白它们的差别 → 按你的习惯选一种就好</p>
                    </div>
                    <div className="bg-white p-4 space-y-3">
                        {/* Mode 1 */}
                        <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                            <h3 className="text-sm font-bold text-slate-700 mb-1">📋 模式 1：纯手动（默认）</h3>
                            <p className="text-[11px] text-slate-500 leading-relaxed mb-2">什么都没开。角色只读最近几十条聊天，聊久了看不见早前的事。</p>
                            <div className="bg-white rounded-xl p-2.5 border border-dashed border-slate-200 text-[11px] text-slate-600 leading-relaxed">
                                <b className="text-slate-700">举例</b>：你和角色聊了 1000 条，什么都没开。再聊下去，他会忘记最早 900 条的细节。<br/>
                                <b className="text-slate-700">怎么办</b>：聊天左下「+」→「记忆归档」，他就会把这 1000 条按天总结写进小本本（神经链接→角色→记忆里能看到），以后每轮都带着这个总结。<br/>
                                <b className="text-green-700">✨ 省心小改动</b>：归档完自动把旧消息藏起来（保留最近 100～15% 条可见），下次再归档不会重复总结前面的。
                            </div>
                        </div>

                        {/* Mode 2 */}
                        <div className="bg-blue-50 rounded-2xl p-3 border border-blue-100">
                            <h3 className="text-sm font-bold text-blue-700 mb-1">🏰 模式 2：开记忆宫殿，不开自动归档</h3>
                            <p className="text-[11px] text-slate-500 leading-relaxed mb-2">角色除了"小本本总结"，还会在背后悄悄建一个"记忆图书馆"——按话题随时查阅。</p>
                            <div className="bg-white rounded-xl p-2.5 border border-dashed border-blue-200 text-[11px] text-slate-600 leading-relaxed">
                                <b className="text-blue-700">举例</b>：你半年前说过一次"我养了一只叫花花的猫"。聊了几千条以后突然说"花花今天吃了鱼"。<br/>
                                <b className="text-blue-700">模式 1</b> 的角色：忘记花花是谁，只能按字面回。<br/>
                                <b className="text-blue-700">模式 2</b> 的角色：检索到"花花是你的猫"那条记忆，知道你在说猫。<br/>
                                <b className="text-blue-700">特点</b>：聊天 UI 不变，他照常能看到全部最近消息，手动归档仍然可以用（但不是必须）。
                            </div>
                        </div>

                        {/* Mode 3 */}
                        <div className="bg-violet-50 rounded-2xl p-3 border border-violet-100">
                            <h3 className="text-sm font-bold text-violet-700 mb-1">⚡ 模式 3：全自动（宫殿 + 自动归档都开）</h3>
                            <p className="text-[11px] text-slate-500 leading-relaxed mb-2">图书馆自动建，小本本自动写，旧消息自动藏。你只管聊，啥都不用点。</p>
                            <div className="bg-white rounded-xl p-2.5 border border-dashed border-violet-200 text-[11px] text-slate-600 leading-relaxed">
                                <b className="text-violet-700">举例</b>：聊到 100 条之后，角色会在你不注意的时候"回味"一下：
                                <br/>- 把最近聊的事按话题建好图书馆词条
                                <br/>- 按日期写进小本本
                                <br/>- 把已总结的旧消息藏起来（保留最近 100 条不藏）
                                <br/>你再聊新的，只要走到 100 条又会自动跑一次。完全不用你出手。
                                <br/><b className="text-violet-700">怎么开</b>：神经链接 → 选角色 → 记忆宫殿开关下面那个"📚 自动归档"子开关。第一次打开会问你要不要把已有的 N 条消息也追平（推荐选是）。
                            </div>
                        </div>

                        {/* 进一步小知识 */}
                        <div className="bg-yellow-50 rounded-2xl p-3 border border-yellow-100">
                            <h3 className="text-sm font-bold text-yellow-700 mb-1">🤔 几个常见疑惑</h3>
                            <div className="text-[11px] text-slate-700 leading-relaxed space-y-1.5">
                                <p><b>Q：隐藏了的消息，角色还能读到吗？</b><br/>A：读不到"原文"，但能读到"总结"（小本本上有）和"图书馆词条"（如果开了宫殿）。所以不会真的忘记。</p>
                                <p><b>Q：消息会被送给 AI 两次吗？（聊天 + 总结 + 宫殿）</b><br/>A：原始消息只会送一次。总结和宫殿词条的内容是<b>LLM 改写过的</b>（不是原文），所以算不同版本，不是重复送原话。这样做是故意的，宫殿偶尔会漏检索到，小本本作为目录兜底。</p>
                                <p><b>Q：手动归档后点"管理上下文"，看到灰色的消息是怎么回事？</b><br/>A：灰色 = 已经被自动/手动归档隐藏的，AI 看不到它们的原文但能看到总结。你<b>不用</b>再手动隐藏一次。</p>
                                <p><b>Q：记忆宫殿的向量水位线和我这个"隐藏起点"是一个东西吗？</b><br/>A：不是。宫殿有自己的进度，和"隐藏起点"分开走。<b>你不用去管宫殿的</b>，它自己处理。</p>
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
