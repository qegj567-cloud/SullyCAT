import React from 'react';
import { AppConfig, AppID } from './types';
import {
  UserCircle,
  IdentificationCard,
  ChatTeardrop,
  UsersThree,
  GearSix,
  Images,
  PaintBrush,
  Palette,
  Heart,
  BookOpenText,
  SealCheck,
  House,
  DeviceMobileCamera,
  Fire,
  Books,
  Question,
  GameController,
  Globe,
  PenNib,
  PiggyBank,
  Compass,
  Camera,
  Sparkle,
  GlobeSimple,
  MusicNotes,
  PhoneCall,
  Crosshair,
  Smiley,
  Brain,
  Notebook,
  Plugs,
} from '@phosphor-icons/react';

// SVG 图标库 - Phosphor Icons
export const Icons: Record<string, React.FC<{ className?: string }>> = {
  Character: ({ className }) => <UserCircle className={className} weight="bold" />,
  User: ({ className }) => <IdentificationCard className={className} weight="bold" />,
  Chat: ({ className }) => <ChatTeardrop className={className} weight="bold" />,
  GroupChat: ({ className }) => <UsersThree className={className} weight="bold" />,
  Settings: ({ className }) => <GearSix className={className} weight="bold" />,
  Gallery: ({ className }) => <Images className={className} weight="bold" />,
  ThemeMaker: ({ className }) => <PaintBrush className={className} weight="bold" />,
  Appearance: ({ className }) => <Palette className={className} weight="bold" />,
  Date: ({ className }) => <Heart className={className} weight="bold" />,
  Journal: ({ className }) => <BookOpenText className={className} weight="bold" />,
  Schedule: ({ className }) => <SealCheck className={className} weight="bold" />,
  Room: ({ className }) => <House className={className} weight="bold" />,
  CheckPhone: ({ className }) => <DeviceMobileCamera className={className} weight="bold" />,
  Social: ({ className }) => <Fire className={className} weight="bold" />,
  Study: ({ className }) => <Books className={className} weight="bold" />,
  FAQ: ({ className }) => <Question className={className} weight="bold" />,
  Game: ({ className }) => <GameController className={className} weight="bold" />,
  Worldbook: ({ className }) => <Globe className={className} weight="bold" />,
  Novel: ({ className }) => <PenNib className={className} weight="bold" />,
  Bank: ({ className }) => <PiggyBank className={className} weight="bold" />,
  XhsFreeRoam: ({ className }) => <Compass className={className} weight="bold" />,
  XhsStock: ({ className }) => <Camera className={className} weight="bold" />,
  SpecialMoments: ({ className }) => <Sparkle className={className} weight="bold" />,
  Browser: ({ className }) => <GlobeSimple className={className} weight="bold" />,
  Songwriting: ({ className }) => <MusicNotes className={className} weight="bold" />,
  Music: ({ className }) => <MusicNotes className={className} weight="fill" />,
  Call: ({ className }) => <PhoneCall className={className} weight="bold" />,
  Guidebook: ({ className }) => <Crosshair className={className} weight="bold" />,
  LifeSim: ({ className }) => <Smiley className={className} weight="bold" />,
  MemoryPalace: ({ className }) => <Brain className={className} weight="bold" />,
  Handbook: ({ className }) => <Notebook className={className} weight="bold" />,
  QQBridge: ({ className }) => <Plugs className={className} weight="bold" />,
};

// Trial version: only the apps below are visible in the launcher / appearance editor.
// Other apps are kept in the codebase but hidden from the frontend.
export const INSTALLED_APPS: AppConfig[] = [
  { id: AppID.Character, name: '神经链接', icon: 'Character', color: 'indigo' },
  { id: AppID.Chat, name: 'Message', icon: 'Chat', color: 'green' },
  { id: AppID.Room, name: '小小窝', icon: 'Room', color: 'rose' },
  { id: AppID.Date, name: '见面', icon: 'Date', color: 'pink' },
  { id: AppID.User, name: '档案', icon: 'User', color: 'blue' },
  { id: AppID.Journal, name: '交换日记', icon: 'Journal', color: 'amber' },
  { id: AppID.Game, name: 'TRPG', icon: 'Game', color: 'orange' },
  { id: AppID.Worldbook, name: '世界书', icon: 'Worldbook', color: 'indigo' },
  { id: AppID.Gallery, name: '相册', icon: 'Gallery', color: 'orange' },
  { id: AppID.CheckPhone, name: '查手机', icon: 'CheckPhone', color: 'slate' },
  { id: AppID.Appearance, name: '外观', icon: 'Appearance', color: 'slate' },
  { id: AppID.Settings, name: '设置', icon: 'Settings', color: 'slate' },
];

export const DOCK_APPS = [AppID.Chat, AppID.Character, AppID.User, AppID.Settings];

// Trial-version default wallpaper and per-app icons.
// Files live in /public/trial/ and are served from the site root by Vite.
// We prefix paths with import.meta.env.BASE_URL so they work both at
// localhost root ("/") and on GitHub Pages where the site is hosted under
// a project sub-path with `base: './'` configured in vite.config.ts.
const TRIAL_BASE = `${import.meta.env.BASE_URL || ''}trial/`;
export const TRIAL_WALLPAPER = `${TRIAL_BASE}wallpaper.png`;
export const TRIAL_ICONS: Record<string, string> = {
  [AppID.Character]: `${TRIAL_BASE}icon-character.png`,
  [AppID.Chat]: `${TRIAL_BASE}icon-chat.png`,
  [AppID.Room]: `${TRIAL_BASE}icon-room.png`,
  [AppID.Date]: `${TRIAL_BASE}icon-date.png`,
  [AppID.User]: `${TRIAL_BASE}icon-user.png`,
  [AppID.Journal]: `${TRIAL_BASE}icon-journal.png`,
  [AppID.Game]: `${TRIAL_BASE}icon-game.png`,
  [AppID.Worldbook]: `${TRIAL_BASE}icon-worldbook.png`,
  [AppID.Gallery]: `${TRIAL_BASE}icon-gallery.png`,
  [AppID.CheckPhone]: `${TRIAL_BASE}icon-checkphone.png`,
  [AppID.Appearance]: `${TRIAL_BASE}icon-appearance.png`,
  [AppID.Settings]: `${TRIAL_BASE}icon-settings.png`,
};