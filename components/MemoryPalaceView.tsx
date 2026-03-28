/**
 * MemoryPalaceView — 像素风记忆宫殿可视化
 *
 * 将角色的 7 个记忆房间渲染为星露谷风格的像素俯瞰图。
 * 每个房间显示记忆数量、最新记忆摘要、情绪色调。
 * 可嵌入 RoomApp 作为"记忆宫殿"视图。
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { MemoryNodeDB } from '../utils/memoryPalace/db';
import type { MemoryNode, MemoryRoom } from '../utils/memoryPalace/types';
import { ROOM_LABELS, ROOM_CONFIGS } from '../utils/memoryPalace/types';

// ─── Memory Room → Pixel Room ID 映射 ──────────────────
const MEMORY_TO_PIXEL: Record<MemoryRoom, string> = {
  living_room: 'living-room',
  bedroom: 'bedroom',
  study: 'study',
  user_room: 'user-room',
  self_room: 'companion-room',
  attic: 'attic',
  windowsill: 'terrace',
};

const PIXEL_TO_MEMORY: Record<string, MemoryRoom> = Object.fromEntries(
  Object.entries(MEMORY_TO_PIXEL).map(([k, v]) => [v, k as MemoryRoom])
) as Record<string, MemoryRoom>;

// ─── Room visual configs ──────────────────────────────
const ROOM_TEMPLATES: Record<string, {
  label: string; summary: string;
  grid: { width: number; height: number };
  colors: { floor: string; wall: string; accent: string };
  icon: string;
}> = {
  'living-room': {
    label: '客厅', summary: '日常闲聊、近期互动',
    grid: { width: 24, height: 16 },
    colors: { floor: '#c8a47e', wall: '#e9d8bc', accent: '#8c5f47' },
    icon: '🛋️',
  },
  bedroom: {
    label: '卧室', summary: '亲密情感、深层羁绊',
    grid: { width: 20, height: 16 },
    colors: { floor: '#b7926f', wall: '#eadcc7', accent: '#9b6a59' },
    icon: '🛏️',
  },
  study: {
    label: '书房', summary: '工作学习、技能成长',
    grid: { width: 20, height: 16 },
    colors: { floor: '#b38762', wall: '#e7d4b5', accent: '#7b594a' },
    icon: '📚',
  },
  'companion-room': {
    label: '自我房间', summary: '角色自我认同、演变',
    grid: { width: 18, height: 14 },
    colors: { floor: '#c19a75', wall: '#f0dfc8', accent: '#946c6d' },
    icon: '🪞',
  },
  'user-room': {
    label: '用户房间', summary: '用户个人信息、习惯',
    grid: { width: 22, height: 16 },
    colors: { floor: '#c39a76', wall: '#efe1cc', accent: '#8f6658' },
    icon: '👤',
  },
  attic: {
    label: '阁楼', summary: '未消化的困惑、潜意识',
    grid: { width: 22, height: 14 },
    colors: { floor: '#a97f5f', wall: '#e1cdb0', accent: '#6d4d40' },
    icon: '🧠',
  },
  terrace: {
    label: '窗台', summary: '期盼、目标、憧憬',
    grid: { width: 24, height: 14 },
    colors: { floor: '#a77d5c', wall: '#d6e6ef', accent: '#678a6c' },
    icon: '🌅',
  },
};

// ─── Selector grid sizes (portrait-friendly) ─────────
const SELECTOR_GRIDS: Record<string, { width: number; height: number }> = {
  attic: { width: 12, height: 15 },
  'living-room': { width: 15, height: 18 },
  'companion-room': { width: 13, height: 16 },
  study: { width: 13, height: 16 },
  'user-room': { width: 14, height: 18 },
  bedroom: { width: 14, height: 17 },
  terrace: { width: 14, height: 15 },
};

// ─── Layout positions ──────────────────────────────────
const HOME_LAYOUT: Record<string, { x: number; y: number }> = {
  attic: { x: 18, y: 0 },
  'living-room': { x: 17, y: 18 },
  'companion-room': { x: 1, y: 23 },
  study: { x: 35, y: 23 },
  'user-room': { x: 17, y: 42 },
  bedroom: { x: 35, y: 46 },
  terrace: { x: 17, y: 65 },
};

const HOME_PASSAGES = [
  { id: 'attic-stair', x: 22, y: 15, width: 4, height: 3, colors: { floor: '#ac8363', wall: '#e4d0b5', accent: '#7d5b46' } },
  { id: 'companion-hall', x: 14, y: 28, width: 3, height: 4, colors: { floor: '#a97f5f', wall: '#e9d8bc', accent: '#7d5b46' } },
  { id: 'study-hall', x: 32, y: 28, width: 3, height: 4, colors: { floor: '#a17757', wall: '#e4d0b5', accent: '#7d5b46' } },
  { id: 'user-hall', x: 22, y: 36, width: 4, height: 6, colors: { floor: '#9c7152', wall: '#e4d0b5', accent: '#7d5b46' } },
  { id: 'bedroom-hall', x: 38, y: 42, width: 4, height: 4, colors: { floor: '#a17757', wall: '#e4d0b5', accent: '#7d5b46' } },
  { id: 'terrace-hall', x: 22, y: 60, width: 4, height: 5, colors: { floor: '#9a7050', wall: '#e7d5bb', accent: '#7d5b46' } },
];

// ─── Mood to color mapping ─────────────────────────────
const MOOD_COLORS: Record<string, string> = {
  happy: '#f0c674', sad: '#7b9ec8', angry: '#d47272',
  anxious: '#c9a0dc', tender: '#f2b8c6', calm: '#93c5a4',
  excited: '#f5a623', confused: '#bfae8e', nostalgic: '#c2a878',
  grateful: '#a8d8a8', lonely: '#8b9dc3', hopeful: '#8ecfc0',
};

// ─── Data summary per room ─────────────────────────────
interface RoomSummary {
  room: MemoryRoom;
  pixelId: string;
  count: number;
  recentContent: string;
  dominantMood: string;
  avgImportance: number;
}

// ─── Helper: hex ↔ rgb ─────────────────────────────────
function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function rgbToHex(r: number, g: number, b: number) {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function adjustHex(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + amount, g + amount, b + amount);
}

// ─── Component ─────────────────────────────────────────

interface Props {
  charId: string;
  charName: string;
  userName?: string;
  onBack: () => void;
}

const MemoryPalaceView: React.FC<Props> = ({ charId, charName, userName, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [summaries, setSummaries] = useState<RoomSummary[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [selectedMemories, setSelectedMemories] = useState<MemoryNode[]>([]);
  const [zoom, setZoom] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const hitRegionsRef = useRef<{ roomId: string; x: number; y: number; w: number; h: number }[]>([]);

  // Load memory data
  useEffect(() => {
    if (!charId) return;
    setLoading(true);
    MemoryNodeDB.getByCharId(charId).then(nodes => {
      const rooms: MemoryRoom[] = ['living_room', 'bedroom', 'study', 'user_room', 'self_room', 'attic', 'windowsill'];
      const result: RoomSummary[] = rooms.map(room => {
        const roomNodes = nodes.filter(n => n.room === room);
        const moodCounts: Record<string, number> = {};
        let totalImportance = 0;
        roomNodes.forEach(n => {
          moodCounts[n.mood] = (moodCounts[n.mood] || 0) + 1;
          totalImportance += n.importance;
        });
        const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'calm';
        const recent = roomNodes.sort((a, b) => b.createdAt - a.createdAt)[0];
        return {
          room,
          pixelId: MEMORY_TO_PIXEL[room],
          count: roomNodes.length,
          recentContent: recent?.content?.slice(0, 60) || '',
          dominantMood,
          avgImportance: roomNodes.length ? totalImportance / roomNodes.length : 0,
        };
      });
      setSummaries(result);
      setLoading(false);
    });
  }, [charId]);

  // Load memories for selected room
  useEffect(() => {
    if (!selectedRoom || !charId) { setSelectedMemories([]); return; }
    const memRoom = PIXEL_TO_MEMORY[selectedRoom];
    if (!memRoom) return;
    MemoryNodeDB.getByRoom(charId, memRoom).then(nodes => {
      setSelectedMemories(nodes.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20));
    });
  }, [selectedRoom, charId]);

  // ─── Canvas rendering ──────────────────────────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const containerW = container.clientWidth;
    const canvasW = Math.max(340, containerW);
    const canvasH = Math.round(canvasW * 1.6);
    canvas.width = canvasW;
    canvas.height = canvasH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    // Compute world bounds
    let worldW = 0, worldH = 0;
    Object.keys(ROOM_TEMPLATES).forEach(id => {
      const off = HOME_LAYOUT[id] || { x: 0, y: 0 };
      const grid = SELECTOR_GRIDS[id] || ROOM_TEMPLATES[id].grid;
      worldW = Math.max(worldW, off.x + grid.width);
      worldH = Math.max(worldH, off.y + grid.height);
    });
    HOME_PASSAGES.forEach(p => {
      worldW = Math.max(worldW, p.x + p.width);
      worldH = Math.max(worldH, p.y + p.height);
    });

    const padding = 16;
    const baseTile = Math.min((canvasW - padding * 2) / worldW, (canvasH - 50) / worldH);
    const tile = baseTile * zoom;
    const totalW = worldW * tile;
    const totalH = worldH * tile;

    // Center on selected room or overall
    let offsetX: number, offsetY: number;
    if (selectedRoom && HOME_LAYOUT[selectedRoom]) {
      const sg = SELECTOR_GRIDS[selectedRoom] || ROOM_TEMPLATES[selectedRoom]?.grid || { width: 10, height: 10 };
      const so = HOME_LAYOUT[selectedRoom];
      const cx = (so.x + sg.width / 2) * tile;
      const cy = (so.y + sg.height / 2) * tile;
      offsetX = padding + (canvasW - padding * 2) / 2 - cx;
      offsetY = 40 + (canvasH - 50) / 2 - cy;
    } else {
      offsetX = totalW <= canvasW - padding * 2 ? padding + ((canvasW - padding * 2) - totalW) / 2 : padding;
      offsetY = totalH <= canvasH - 50 ? 40 + ((canvasH - 50) - totalH) / 2 : 40;
    }

    // Clamp offsets
    if (totalW > canvasW - padding * 2) {
      offsetX = Math.min(padding, Math.max(canvasW - padding - totalW, offsetX));
    }
    if (totalH > canvasH - 50) {
      offsetY = Math.min(40, Math.max(canvasH - 10 - totalH, offsetY));
    }

    // ── Background ──
    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvasH);
    bgGrad.addColorStop(0, '#1e1612');
    bgGrad.addColorStop(0.5, '#16100c');
    bgGrad.addColorStop(1, '#0e0906');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Subtle checker
    for (let cx = 0; cx < canvasW; cx += 10) {
      for (let cy = 0; cy < canvasH; cy += 10) {
        if (((cx / 10) + (cy / 10)) % 2 === 0) {
          ctx.fillStyle = 'rgba(255, 238, 214, 0.025)';
          ctx.fillRect(cx, cy, 10, 10);
        }
      }
    }

    // Title bar
    ctx.fillStyle = 'rgba(255, 248, 234, 0.1)';
    ctx.fillRect(14, 8, canvasW - 28, 24);
    ctx.fillStyle = '#f5dfc2';
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(`${charName} 的记忆宫殿`, 20, 13);
    const totalMemories = summaries.reduce((s, r) => s + r.count, 0);
    ctx.fillStyle = 'rgba(245, 223, 194, 0.5)';
    ctx.font = '10px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${totalMemories} memories`, canvasW - 20, 15);
    ctx.textAlign = 'left';

    // Build summary lookup
    const summaryMap: Record<string, RoomSummary> = {};
    summaries.forEach(s => { summaryMap[s.pixelId] = s; });

    // ── Draw passages ──
    HOME_PASSAGES.forEach(p => {
      const px = offsetX + p.x * tile;
      const py = offsetY + p.y * tile;
      const pw = p.width * tile;
      const ph = p.height * tile;
      const wallT = Math.max(4, tile * 0.6);

      ctx.fillStyle = 'rgba(16, 8, 4, 0.2)';
      ctx.fillRect(px + 4, py + 5, pw, ph);
      ctx.fillStyle = adjustHex(p.colors.accent, -18);
      ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = p.colors.floor;
      ctx.fillRect(px + wallT, py + wallT, Math.max(2, pw - wallT * 2), Math.max(2, ph - wallT * 2));
      ctx.strokeStyle = adjustHex(p.colors.accent, -30);
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
    });

    // ── Draw rooms ──
    const newHitRegions: typeof hitRegionsRef.current = [];

    Object.entries(ROOM_TEMPLATES).forEach(([roomId, tpl]) => {
      const off = HOME_LAYOUT[roomId] || { x: 0, y: 0 };
      const grid = SELECTOR_GRIDS[roomId] || tpl.grid;
      const summary = summaryMap[roomId];
      const isFocused = selectedRoom === roomId;
      const moodColor = summary ? (MOOD_COLORS[summary.dominantMood] || '#93c5a4') : '#93c5a4';

      const rx = offsetX + off.x * tile;
      const ry = offsetY + off.y * tile;
      const rw = grid.width * tile;
      const rh = grid.height * tile;
      const wallT = Math.max(6, tile * 1.1);

      // Shadow
      ctx.fillStyle = 'rgba(16, 8, 4, 0.3)';
      ctx.fillRect(rx + 6, ry + 8, rw + 2, rh + 2);

      // Shell
      const shell = adjustHex(tpl.colors.accent, -18);
      ctx.fillStyle = shell;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.fillStyle = adjustHex(shell, 8);
      ctx.fillRect(rx + 2, ry + 2, rw - 4, rh - 4);

      // Wall top
      if (wallT >= 8) {
        ctx.fillStyle = adjustHex(tpl.colors.wall, 6);
        ctx.fillRect(rx + 3, ry + 3, rw - 6, wallT - 3);
      }

      // Floor
      const floorX = rx + wallT;
      const floorY = ry + wallT;
      const floorW = Math.max(tile, rw - wallT * 2);
      const floorH = Math.max(tile, rh - wallT * 2);

      if (roomId === 'terrace') {
        const skyH = Math.max(tile * 2, floorH * 0.32);
        const skyGrad = ctx.createLinearGradient(floorX, floorY, floorX, floorY + skyH);
        skyGrad.addColorStop(0, '#c8ecf8');
        skyGrad.addColorStop(1, '#edf9fe');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(floorX, floorY, floorW, skyH);
        ctx.fillStyle = tpl.colors.floor;
        ctx.fillRect(floorX, floorY + skyH, floorW, floorH - skyH);
      } else {
        ctx.fillStyle = tpl.colors.floor;
        ctx.fillRect(floorX, floorY, floorW, floorH);
        // Floor pattern
        const tileCount = Math.max(1, Math.round(floorW / tile));
        const light = adjustHex(tpl.colors.floor, 10);
        for (let tx = 0; tx < tileCount; tx++) {
          for (let ty = 0; ty < Math.max(1, Math.round(floorH / tile)); ty++) {
            if ((tx + ty) % 2 === 0) {
              ctx.fillStyle = light;
              ctx.fillRect(floorX + tx * tile, floorY + ty * tile, Math.min(tile, floorW - tx * tile), Math.min(tile, floorH - ty * tile));
            }
          }
        }
      }

      // Vignette
      const vigGrad = ctx.createRadialGradient(
        floorX + floorW / 2, floorY + floorH / 2, Math.min(floorW, floorH) * 0.2,
        floorX + floorW / 2, floorY + floorH / 2, Math.max(floorW, floorH) * 0.7
      );
      vigGrad.addColorStop(0, 'rgba(255, 245, 225, 0.05)');
      vigGrad.addColorStop(1, 'rgba(30, 18, 10, 0.1)');
      ctx.fillStyle = vigGrad;
      ctx.fillRect(floorX, floorY, floorW, floorH);

      // Mood glow at center
      if (summary && summary.count > 0) {
        const moodRgb = hexToRgb(moodColor);
        const glowGrad = ctx.createRadialGradient(
          floorX + floorW / 2, floorY + floorH / 2, 0,
          floorX + floorW / 2, floorY + floorH / 2, Math.min(floorW, floorH) * 0.5
        );
        glowGrad.addColorStop(0, `rgba(${moodRgb.r}, ${moodRgb.g}, ${moodRgb.b}, 0.15)`);
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(floorX, floorY, floorW, floorH);

        // Memory count dots (like books on shelves)
        const dots = Math.min(summary.count, 30);
        const dotSize = Math.max(2, tile * 0.2);
        const cols = Math.max(1, Math.floor((floorW - 8) / (dotSize + 3)));
        for (let i = 0; i < dots; i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const dx = floorX + 6 + col * (dotSize + 3);
          const dy = floorY + floorH - 8 - row * (dotSize + 2);
          if (dy < floorY + 4) break;
          const alpha = 0.3 + (summary.avgImportance / 10) * 0.5;
          ctx.fillStyle = `rgba(${moodRgb.r}, ${moodRgb.g}, ${moodRgb.b}, ${alpha})`;
          ctx.fillRect(dx, dy, dotSize, dotSize);
        }
      }

      // Borders
      ctx.strokeStyle = adjustHex(shell, -24);
      ctx.lineWidth = isFocused ? 4 : 2;
      ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);

      if (isFocused) {
        ctx.strokeStyle = moodColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(rx + 3, ry + 3, rw - 6, rh - 6);
      }

      ctx.strokeStyle = adjustHex(tpl.colors.accent, -10);
      ctx.lineWidth = 1;
      ctx.strokeRect(floorX + 0.5, floorY + 0.5, floorW - 1, floorH - 1);

      // Room label badge
      const badgeW = Math.min(rw - 12, 140);
      const badgeH = 18;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(rx + 7, ry + 9, badgeW, badgeH);
      ctx.fillStyle = tpl.colors.accent;
      ctx.fillRect(rx + 6, ry + 8, badgeW, badgeH);
      ctx.fillStyle = '#fff8ed';
      ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(`${tpl.icon} ${tpl.label} (${summary?.count || 0})`, rx + 10, ry + 12);

      // Hit region
      newHitRegions.push({ roomId, x: rx, y: ry, w: rw, h: rh });
    });

    hitRegionsRef.current = newHitRegions;
  }, [summaries, selectedRoom, zoom, charName]);

  // Redraw on changes
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => drawCanvas());
    ro.observe(container);
    return () => ro.disconnect();
  }, [drawCanvas]);

  // Canvas click handler
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    for (const hr of hitRegionsRef.current) {
      if (mx >= hr.x && mx <= hr.x + hr.w && my >= hr.y && my <= hr.y + hr.h) {
        setSelectedRoom(prev => prev === hr.roomId ? null : hr.roomId);
        return;
      }
    }
    setSelectedRoom(null);
  }, []);

  // Zoom controls
  const adjustZoom = (delta: number) => setZoom(z => Math.max(0.6, Math.min(3.0, z + delta)));

  // Selected room info
  const selectedSummary = summaries.find(s => s.pixelId === selectedRoom);
  const selectedTemplate = selectedRoom ? ROOM_TEMPLATES[selectedRoom] : null;
  const selectedMemoryRoom = selectedRoom ? PIXEL_TO_MEMORY[selectedRoom] : null;

  return (
    <div className="h-full w-full bg-[#1a120e] flex flex-col relative overflow-hidden select-none">
      {/* Top bar */}
      <div className="absolute top-0 w-full pt-12 px-4 pb-2 flex justify-between z-30 pointer-events-none">
        <button
          onClick={onBack}
          className="bg-white/90 p-2 rounded-full shadow-md pointer-events-auto active:scale-90 transition-transform text-slate-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="flex gap-2 pointer-events-auto">
          <button onClick={() => adjustZoom(-0.3)} className="w-9 h-9 bg-amber-900/80 text-amber-100 rounded-full shadow-md font-bold text-lg flex items-center justify-center">−</button>
          <button onClick={() => setZoom(1.2)} className="px-3 h-9 bg-amber-900/80 text-amber-100 rounded-full shadow-md font-mono text-xs flex items-center justify-center">{zoom.toFixed(1)}x</button>
          <button onClick={() => adjustZoom(0.3)} className="w-9 h-9 bg-amber-900/80 text-amber-100 rounded-full shadow-md font-bold text-lg flex items-center justify-center">+</button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-amber-200/60 text-sm animate-pulse">加载记忆数据...</div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className="w-full h-full"
            style={{ imageRendering: 'pixelated' }}
          />
        )}
      </div>

      {/* Bottom detail panel */}
      {selectedRoom && selectedTemplate && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#1a120e] via-[#1a120e]/95 to-transparent pt-8 pb-6 px-5 z-20 animate-slide-up">
          <div className="bg-[#2a1e18] rounded-2xl border border-amber-900/40 p-4 shadow-2xl">
            {/* Room header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{selectedTemplate.icon}</span>
                <div>
                  <h3 className="text-amber-100 font-bold text-sm">{selectedTemplate.label}</h3>
                  <p className="text-amber-200/50 text-[10px]">{selectedTemplate.summary}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedSummary && selectedSummary.count > 0 && (
                  <span className="px-2 py-1 rounded-full text-[10px] font-bold" style={{
                    backgroundColor: `${MOOD_COLORS[selectedSummary.dominantMood] || '#93c5a4'}22`,
                    color: MOOD_COLORS[selectedSummary.dominantMood] || '#93c5a4',
                  }}>
                    {selectedSummary.dominantMood}
                  </span>
                )}
                <span className="text-amber-200/60 text-xs font-mono">{selectedSummary?.count || 0} 条记忆</span>
              </div>
            </div>

            {/* Recent memories */}
            {selectedMemories.length > 0 ? (
              <div className="space-y-2 max-h-40 overflow-y-auto no-scrollbar">
                {selectedMemories.slice(0, 8).map(m => (
                  <div key={m.id} className="flex gap-2 items-start">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: MOOD_COLORS[m.mood] || '#93c5a4' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-amber-100/80 text-xs leading-relaxed line-clamp-2">{m.content}</p>
                      <div className="flex gap-2 mt-0.5">
                        {m.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-[9px] text-amber-200/30">#{tag}</span>
                        ))}
                        <span className="text-[9px] text-amber-200/20 ml-auto">
                          {new Date(m.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-amber-200/30 text-xs text-center py-4">这个房间还没有记忆...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MemoryPalaceView;
