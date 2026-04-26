import React, { useEffect, useRef } from 'react';
import { CharacterProfile } from '../../types';
import { MealChatMessage, MealToolCall, MealToolResult } from './types';

const ToolCallChip: React.FC<{ call: MealToolCall; result?: MealToolResult }> = ({ call, result }) => {
  const okIcon = result?.ok === false ? '✗' : result ? '✓' : '⋯';
  const tone =
    result?.ok === false
      ? 'bg-red-50 text-red-600 border-red-200'
      : result
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-slate-50 text-slate-500 border-slate-200';
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${tone}`}
      title={JSON.stringify(call.args)}
    >
      <span>{okIcon}</span>
      <span>{call.name}</span>
    </span>
  );
};

interface Props {
  char: CharacterProfile | null;
  messages: MealChatMessage[];
  loading: boolean;
  loadingHint?: string;
  onSend: (text: string) => void;
}

const MealChat: React.FC<Props> = ({ char, messages, loading, loadingHint, onSend }) => {
  const [draft, setDraft] = React.useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  // 把 assistant 消息和它后面紧跟的 tool 消息绑成一组渲染，避免 tool 结果裸露给用户。
  const visible = messages.filter(m => m.role === 'user' || m.role === 'assistant');
  const toolResultsByAssistantId = new Map<string, MealToolResult[]>();
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'tool' && m.toolResults && i > 0) {
      // 找最近的上一条 assistant
      for (let j = i - 1; j >= 0; j--) {
        if (messages[j].role === 'assistant') {
          const acc = toolResultsByAssistantId.get(messages[j].id) || [];
          acc.push(...m.toolResults);
          toolResultsByAssistantId.set(messages[j].id, acc);
          break;
        }
      }
    }
  }

  const submit = () => {
    const text = draft.trim();
    if (!text || loading) return;
    onSend(text);
    setDraft('');
  };

  const quickPrompts = [
    '随便挑一家不太贵的，我现在饿了',
    '想吃辣的，三家比一下',
    '今天减脂，给我来轻食',
    '看看盒马有什么半成品菜，懒得做饭',
  ];

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-orange-50/40 to-white">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {visible.length === 0 && (
          <div className="text-center text-slate-400 text-sm mt-8 px-6">
            <div className="text-3xl mb-2">🍱</div>
            <div className="leading-relaxed">
              告诉 {char?.name || 'char'} 你想吃啥、预算多少、什么心情，<br />
              ta 会去三家平台看一圈，挑好端到你面前。
            </div>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {quickPrompts.map(p => (
                <button
                  key={p}
                  onClick={() => onSend(p)}
                  className="px-3 py-1.5 rounded-full bg-white border border-orange-200 text-xs text-slate-700 hover:bg-orange-100 transition"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {visible.map(m => {
          if (m.role === 'user') {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[78%] px-3 py-2 rounded-2xl rounded-br-md bg-orange-500 text-white text-sm shadow-sm whitespace-pre-wrap break-words">
                  {m.content}
                </div>
              </div>
            );
          }
          const text = (m.display ?? m.content ?? '').trim();
          const calls = m.toolCalls || [];
          const results = toolResultsByAssistantId.get(m.id) || [];
          const resultMap = new Map(results.map(r => [r.callId, r]));
          return (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[82%]">
                <div className="flex items-center gap-1.5 mb-1 ml-2">
                  {char?.avatar ? (
                    <img src={char.avatar} className="w-5 h-5 rounded-full object-cover" alt={char.name} />
                  ) : null}
                  <span className="text-[11px] text-slate-500">{char?.name || 'char'}</span>
                </div>
                {calls.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1 ml-2">
                    {calls.map(c => (
                      <ToolCallChip key={c.id} call={c} result={resultMap.get(c.id)} />
                    ))}
                  </div>
                )}
                {text && (
                  <div className="px-3 py-2 rounded-2xl rounded-bl-md bg-white border border-black/5 text-sm shadow-sm whitespace-pre-wrap break-words">
                    {text}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-2xl rounded-bl-md bg-white border border-black/5 text-sm text-slate-500 shadow-sm">
              <span className="inline-block animate-pulse">{loadingHint || `${char?.name || 'char'} 正在看菜单…`}</span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-black/5 px-3 py-2 bg-white/70 backdrop-blur">
        <div className="flex items-center gap-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={`跟 ${char?.name || 'char'} 说想吃啥…`}
            rows={1}
            className="flex-1 resize-none px-3 py-2 rounded-full bg-slate-100 border border-transparent focus:border-orange-300 focus:bg-white outline-none text-sm"
          />
          <button
            onClick={submit}
            disabled={loading || !draft.trim()}
            className="px-4 py-2 rounded-full bg-orange-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-600 active:scale-95 transition"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
};

export default MealChat;
