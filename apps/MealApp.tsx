import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Cpu } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { safeResponseJson } from '../utils/safeApi';
import { CharacterProfile } from '../types';
import { buildMealSystemPrompt, formatToolResultsForReplay } from './meal/prompt';
import { parseToolCalls, runToolCalls } from './meal/toolRunner';
import { EMPTY_MEAL_STATE, MealAppState, MealChatMessage } from './meal/types';
import { MealCartLine } from '../utils/mealClient';
import MealChat from './meal/MealChat';
import CartPanel from './meal/CartPanel';

const MAX_TOOL_LOOPS = 5;

const newId = () => `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const MealApp: React.FC = () => {
  const { closeApp, characters, activeCharacterId, apiConfig, userProfile, addToast } = useOS();

  const initialChar = useMemo<CharacterProfile | null>(() => {
    if (activeCharacterId) {
      const c = characters.find(x => x.id === activeCharacterId);
      if (c) return c;
    }
    return characters[0] || null;
  }, [characters, activeCharacterId]);

  const [charId, setCharId] = useState<string | null>(initialChar?.id || null);
  const char = useMemo(() => characters.find(c => c.id === charId) || initialChar, [characters, charId, initialChar]);

  const [state, setState] = useState<MealAppState>(EMPTY_MEAL_STATE);
  const [messages, setMessages] = useState<MealChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHint, setLoadingHint] = useState<string | undefined>(undefined);
  const stateRef = useRef(state);
  stateRef.current = state;

  const apiOk = !!apiConfig?.baseUrl && !!apiConfig?.apiKey && !!apiConfig?.model;

  const callLLM = useCallback(
    async (history: MealChatMessage[], systemPrompt: string): Promise<string> => {
      const payloadMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...history.map(m => {
          // assistant 消息送回时用原始 content（含 [[TOOL]] 块），让模型看见自己上一轮调了啥。
          // tool 消息送回时把工具结果格式化为 user 角色（兼容性最高，不依赖 OpenAI 原生 function calling）。
          if (m.role === 'tool') {
            return { role: 'user' as const, content: formatToolResultsForReplay(m.toolResults || []) };
          }
          return { role: m.role as 'user' | 'assistant', content: m.content };
        }),
      ];
      const resp = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: apiConfig.model,
          messages: payloadMessages,
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`LLM ${resp.status}: ${text.slice(0, 200)}`);
      }
      const data = await safeResponseJson(resp);
      const content: string = data?.choices?.[0]?.message?.content || '';
      return content;
    },
    [apiConfig]
  );

  const handleRemoveLine = (line: MealCartLine) => {
    setState(prev => ({
      ...prev,
      cart: prev.cart.filter(
        c => !(c.platform === line.platform && c.storeId === line.storeId && c.item.id === line.item.id)
      ),
      checkout: null,
    }));
  };

  const handleClearCart = () => {
    setState(prev => ({ ...prev, cart: [], checkout: null }));
  };

  const handleSend = async (userText: string) => {
    if (!char) {
      addToast('先去神经链接里选一个角色', 'info');
      return;
    }
    if (!apiOk) {
      addToast('API 还没填，去设置里填好 baseUrl / key / model', 'info');
      return;
    }

    const systemPrompt = buildMealSystemPrompt(char, userProfile);
    const userMsg: MealChatMessage = {
      id: newId(),
      role: 'user',
      content: userText,
      createdAt: Date.now(),
    };
    let history: MealChatMessage[] = [...messages, userMsg];
    setMessages(history);
    setLoading(true);

    try {
      for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
        setLoadingHint(loop === 0 ? `${char.name} 正在看菜单…` : `${char.name} 看完了，再想想…`);
        const raw = await callLLM(history, systemPrompt);
        const { stripped, calls } = parseToolCalls(raw);

        const assistantMsg: MealChatMessage = {
          id: newId(),
          role: 'assistant',
          content: raw,
          display: stripped,
          toolCalls: calls.length > 0 ? calls : undefined,
          createdAt: Date.now(),
        };
        history = [...history, assistantMsg];
        setMessages(history);

        if (calls.length === 0) break;

        // 工具一次性顺序执行，结束后再 commit state
        setLoadingHint(`${char.name} 正在加菜…`);
        const startState = stateRef.current;
        const { results, finalState } = await runToolCalls(calls, startState);
        setState(finalState);
        stateRef.current = finalState;

        const toolMsg: MealChatMessage = {
          id: newId(),
          role: 'tool',
          content: formatToolResultsForReplay(results),
          toolResults: results,
          createdAt: Date.now(),
        };
        history = [...history, toolMsg];
        setMessages(history);
      }
    } catch (e: any) {
      addToast(e?.message || '出错了', 'error' as any);
      const errMsg: MealChatMessage = {
        id: newId(),
        role: 'assistant',
        content: `（系统提示）调用 LLM 失败：${e?.message || e}`,
        display: `（系统提示）调用 LLM 失败：${e?.message || e}`,
        createdAt: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setLoadingHint(undefined);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-orange-100 via-pink-50 to-white text-slate-800">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-black/5 bg-white/70 backdrop-blur-md">
        <button onClick={closeApp} className="p-1.5 rounded-full hover:bg-black/5">
          <ArrowLeft size={18} weight="bold" />
        </button>
        <div className="text-center">
          <div className="text-sm font-bold tracking-wide">饭友 · 今天吃啥</div>
          <div className="text-[10px] text-slate-500">
            {char ? `${char.name} 帮你看 饿了么 / 美团 / 盒马` : '先选个角色'}
          </div>
        </div>
        <select
          className="text-xs bg-white/70 border border-black/10 rounded-full px-2 py-1 outline-none"
          value={charId || ''}
          onChange={e => setCharId(e.target.value || null)}
          title="换个角色帮你点"
        >
          {characters.length === 0 && <option value="">无</option>}
          {characters.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {!apiOk && (
        <div className="px-4 py-2 bg-amber-100/80 text-amber-800 text-xs flex items-center gap-2">
          <Cpu size={14} weight="bold" />
          API 还没配置好，去「设置」里填 baseUrl / key / model 后再回来。
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-[1fr_280px]">
        <div className="min-h-0 sm:border-r border-black/5">
          <MealChat
            char={char || null}
            messages={messages}
            loading={loading}
            loadingHint={loadingHint}
            onSend={handleSend}
          />
        </div>
        <div className="hidden sm:block min-h-0">
          <CartPanel
            cart={state.cart}
            checkout={state.checkout}
            onRemove={handleRemoveLine}
            onClear={handleClearCart}
          />
        </div>
      </div>

      {/* Mobile cart strip — 折叠版购物车，宽度<sm 时显示 */}
      <div className="sm:hidden border-t border-black/5 bg-white/80 backdrop-blur-md max-h-[50%] overflow-hidden">
        <CartPanel
          cart={state.cart}
          checkout={state.checkout}
          onRemove={handleRemoveLine}
          onClear={handleClearCart}
        />
      </div>
    </div>
  );
};

export default MealApp;
