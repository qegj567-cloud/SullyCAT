const dom = {
  fileInput: document.getElementById("fileInput"),
  contentType: document.getElementById("contentType"),
  roomType: document.getElementById("roomType"),
  slotType: document.getElementById("slotType"),
  assetMode: document.getElementById("assetMode"),
  backgroundMode: document.getElementById("backgroundMode"),
  pixelSize: document.getElementById("pixelSize"),
  paletteSize: document.getElementById("paletteSize"),
  namePrefix: document.getElementById("namePrefix"),
  minRegion: document.getElementById("minRegion"),
  outlineToggle: document.getElementById("outlineToggle"),
  smartSplitToggle: document.getElementById("smartSplitToggle"),
  processButton: document.getElementById("processButton"),
  downloadZipButton: document.getElementById("downloadZipButton"),
  downloadSheetButton: document.getElementById("downloadSheetButton"),
  statusText: document.getElementById("statusText"),
  metaList: document.getElementById("metaList"),
  sourceCanvas: document.getElementById("sourceCanvas"),
  roomCanvas: document.getElementById("roomCanvas"),
  roomTitle: document.getElementById("roomTitle"),
  roomSummary: document.getElementById("roomSummary"),
  roomSlotList: document.getElementById("roomSlotList"),
  sourceList: document.getElementById("sourceList"),
  paletteSwatches: document.getElementById("paletteSwatches"),
  assetGrid: document.getElementById("assetGrid"),
  gestureHint: document.getElementById("gestureHint"),
  zoomOutButton: document.getElementById("zoomOutButton"),
  zoomResetButton: document.getElementById("zoomResetButton"),
  zoomInButton: document.getElementById("zoomInButton"),
  settingsToggleButton: document.getElementById("settingsToggleButton"),
  settingsCloseButton: document.getElementById("settingsCloseButton"),
  settingsPanel: document.getElementById("settingsPanel"),
  settingsScrim: document.getElementById("settingsScrim")
};

const crcTable = buildCrcTable();

const state = {
  files: [],
  palette: [],
  assets: [],
  previewSourceId: null,
  roomHitRegions: [],
  contentType: "furniture",
  roomId: "living-room",
  slotId: "sofa",
  nextAssetId: 1,
  nextPlacementOrder: 1,
  homeSceneReady: false,
  settingsOpen: false,
  focusZoom: 1.4,
  focusViewport: null,
  pinchZoomStartDistance: null,
  pinchZoomStartValue: 1.4
};

const HOME_LAYOUT = {
  attic: { x: 10, y: 0 },
  study: { x: 40, y: 4 },
  "living-room": { x: 20, y: 22 },
  "companion-room": { x: 0, y: 24 },
  bedroom: { x: 46, y: 24 },
  terrace: { x: 4, y: 44 },
  "user-room": { x: 30, y: 42 }
};

const HOME_PASSAGES = [
  {
    id: "attic-gallery",
    x: 32,
    y: 8,
    width: 8,
    height: 4,
    colors: { floor: "#b08867", wall: "#e7d6bd", accent: "#7d5b46" },
    openings: [
      { side: "left", start: 0, size: 4 },
      { side: "right", start: 0, size: 4 }
    ]
  },
  {
    id: "attic-stair",
    x: 28,
    y: 14,
    width: 4,
    height: 8,
    colors: { floor: "#ac8363", wall: "#e4d0b5", accent: "#7d5b46" },
    openings: [
      { side: "top", start: 0, size: 4 },
      { side: "bottom", start: 0, size: 4 }
    ]
  },
  {
    id: "companion-hall",
    x: 18,
    y: 29,
    width: 2,
    height: 4,
    colors: { floor: "#a97f5f", wall: "#e9d8bc", accent: "#7d5b46" },
    openings: [
      { side: "left", start: 0, size: 4 },
      { side: "right", start: 0, size: 4 }
    ]
  },
  {
    id: "bedroom-hall",
    x: 44,
    y: 29,
    width: 2,
    height: 4,
    colors: { floor: "#a17757", wall: "#e4d0b5", accent: "#7d5b46" },
    openings: [
      { side: "left", start: 0, size: 4 },
      { side: "right", start: 0, size: 4 }
    ]
  },
  {
    id: "user-hall",
    x: 34,
    y: 38,
    width: 4,
    height: 4,
    colors: { floor: "#9c7152", wall: "#e4d0b5", accent: "#7d5b46" },
    openings: [
      { side: "top", start: 0, size: 4 },
      { side: "bottom", start: 0, size: 4 }
    ]
  },
  {
    id: "terrace-hall",
    x: 22,
    y: 38,
    width: 4,
    height: 6,
    colors: { floor: "#9a7050", wall: "#e7d5bb", accent: "#7d5b46" },
    openings: [
      { side: "top", start: 0, size: 4 },
      { side: "bottom", start: 0, size: 4 }
    ]
  }
];

const ROOM_OPENINGS = {
  attic: [
    { side: "bottom", start: 18, size: 4 },
    { side: "right", start: 8, size: 4 }
  ],
  study: [
    { side: "left", start: 4, size: 4 }
  ],
  "living-room": [
    { side: "top", start: 8, size: 4 },
    { side: "left", start: 7, size: 4 },
    { side: "right", start: 7, size: 4 },
    { side: "bottom", start: 2, size: 4 },
    { side: "bottom", start: 14, size: 4 }
  ],
  bedroom: [
    { side: "left", start: 5, size: 4 }
  ],
  "companion-room": [
    { side: "right", start: 5, size: 4 }
  ],
  "user-room": [
    { side: "top", start: 4, size: 4 }
  ],
  terrace: [
    { side: "top", start: 18, size: 4 }
  ]
};

/*
/*
const ROOM_TEMPLATES = {
  "living-room": {
    label: "客厅",
    summary: "家园中央的公共空间，适合摆主沙发、茶几和展示收纳。",
    grid: { width: 24, height: 16 },
    colors: { floor: "#c8a47e", wall: "#e9d8bc", accent: "#8c5f47" },
    slots: [
      { id: "sofa", label: "主沙发", width: 8, height: 4, x: 2, y: 9, note: "靠墙主位" },
      { id: "coffee-table", label: "茶几", width: 5, height: 3, x: 11, y: 10, note: "客厅中心矮桌" },
      { id: "rug", label: "地毯", width: 10, height: 5, x: 8, y: 8, note: "视觉中心区域" },
      { id: "cabinet", label: "矮柜", width: 6, height: 4, x: 17, y: 9, note: "影音或展示柜" },
      { id: "plant-stand", label: "植物架", width: 3, height: 4, x: 19, y: 4, note: "角落装饰位" }
    ]
  },
  bedroom: {
    label: "卧室",
    summary: "以床为主角的休息空间，床位固定为 8x8。",
    grid: { width: 20, height: 16 },
    colors: { floor: "#b7926f", wall: "#eadcc7", accent: "#9b6a59" },
    slots: [
      { id: "bed", label: "床", width: 8, height: 8, x: 2, y: 6, note: "主床位" },
      { id: "nightstand", label: "床头柜", width: 3, height: 4, x: 11, y: 9, note: "床边配套位" },
      { id: "wardrobe", label: "衣柜", width: 5, height: 8, x: 14, y: 5, note: "高柜收纳位" },
      { id: "dresser", label: "斗柜", width: 6, height: 5, x: 10, y: 3, note: "中型收纳位" },
      { id: "bedroom-rug", label: "床边地毯", width: 8, height: 4, x: 4, y: 12, note: "软装铺地位" }
    ]
  },
  study: {
    label: "书房",
    summary: "以书桌、书柜和阅读角为中心的安静空间。",
    grid: { width: 20, height: 16 },
    colors: { floor: "#b38762", wall: "#e7d4b5", accent: "#7b594a" },
    slots: [
      { id: "desk", label: "书桌", width: 8, height: 4, x: 3, y: 10, note: "主要工作位" },
      { id: "chair", label: "椅子", width: 4, height: 4, x: 11, y: 10, note: "书桌配套位" },
      { id: "bookshelf", label: "书柜", width: 5, height: 9, x: 15, y: 4, note: "高书柜位" },
      { id: "file-cabinet", label: "文件柜", width: 4, height: 5, x: 3, y: 4, note: "辅助收纳位" },
      { id: "reading-nook", label: "阅读角", width: 5, height: 4, x: 9, y: 4, note: "阅读小角落" }
    ]
  },
  "companion-room": {
    label: "小人的房间",
    summary: "给陪伴角色的小房间，家具尺度更轻巧，氛围更亲密。",
    grid: { width: 18, height: 14 },
    colors: { floor: "#c19a75", wall: "#f0dfc8", accent: "#946c6d" },
    slots: [
      { id: "companion-bed", label: "小床", width: 6, height: 7, x: 1, y: 6, note: "小床位" },
      { id: "companion-desk", label: "小书桌", width: 6, height: 4, x: 10, y: 8, note: "写字互动位" },
      { id: "keepsake-shelf", label: "纪念架", width: 4, height: 6, x: 12, y: 2, note: "收藏展示位" },
      { id: "plush-corner", label: "玩偶角", width: 4, height: 4, x: 4, y: 2, note: "软装治愈位" },
      { id: "companion-trunk", label: "小箱子", width: 4, height: 4, x: 8, y: 5, note: "轻收纳位" }
    ]
  },
  "user-room": {
    label: "用户的房间",
    summary: "用户自己的主卧空间，床、书桌和衣柜比例更均衡。",
    grid: { width: 22, height: 16 },
    colors: { floor: "#c39a76", wall: "#efe1cc", accent: "#8f6658" },
    slots: [
      { id: "user-bed", label: "用户床", width: 7, height: 7, x: 2, y: 7, note: "主床位" },
      { id: "user-desk", label: "用户书桌", width: 7, height: 4, x: 12, y: 10, note: "工作学习位" },
      { id: "user-wardrobe", label: "用户衣柜", width: 5, height: 8, x: 16, y: 5, note: "高衣柜位" },
      { id: "user-dresser", label: "用户斗柜", width: 6, height: 5, x: 10, y: 4, note: "中型收纳位" },
      { id: "hobby-rack", label: "兴趣架", width: 4, height: 6, x: 5, y: 3, note: "展示兴趣位" }
    ]
  },
  attic: {
    label: "阁楼",
    summary: "兼具收纳与手作气质的高处空间，适合箱子、书架和工作台。",
    grid: { width: 22, height: 14 },
    colors: { floor: "#a97f5f", wall: "#e1cdb0", accent: "#6d4d40" },
    slots: [
      { id: "workbench", label: "工作台", width: 8, height: 4, x: 3, y: 9, note: "手作修理位" },
      { id: "storage-trunk", label: "储物箱", width: 6, height: 4, x: 13, y: 9, note: "低位收纳箱" },
      { id: "tall-shelf", label: "高架柜", width: 5, height: 8, x: 17, y: 4, note: "纵向收纳位" },
      { id: "book-stack", label: "书堆", width: 4, height: 4, x: 3, y: 4, note: "地面堆放位" },
      { id: "window-seat", label: "窗边长凳", width: 6, height: 3, x: 9, y: 5, note: "靠窗休息位" }
    ]
  },
  terrace: {
    label: "露台",
    summary: "面向户外的放松区域，适合长椅、茶桌和花箱。",
    grid: { width: 24, height: 14 },
    colors: { floor: "#a77d5c", wall: "#d6e6ef", accent: "#678a6c" },
    slots: [
      { id: "terrace-bench", label: "露台长椅", width: 7, height: 4, x: 2, y: 8, note: "主要坐席位" },
      { id: "tea-table", label: "茶桌", width: 4, height: 4, x: 11, y: 8, note: "小桌位" },
      { id: "planter", label: "花箱", width: 4, height: 4, x: 18, y: 8, note: "绿植位" },
      { id: "lounge-chair", label: "躺椅", width: 5, height: 4, x: 9, y: 3, note: "放松角" },
      { id: "railing-shelf", label: "栏杆置物架", width: 6, height: 3, x: 2, y: 3, note: "边缘展示位" }
    ]
  }
};
*/

/*
const ROOM_TEMPLATES = {
  "living-room": {
    label: "客厅",
    summary: "家园中央的公共空间，适合摆主沙发、茶几和展示收纳。",
    grid: { width: 24, height: 16 },
    colors: { floor: "#c8a47e", wall: "#e9d8bc", accent: "#8c5f47" },
    slots: [
      { id: "sofa", label: "主沙发", width: 8, height: 4, x: 2, y: 9, note: "靠墙主位" },
      { id: "coffee-table", label: "茶几", width: 5, height: 3, x: 11, y: 10, note: "客厅中心矮桌" },
      { id: "rug", label: "地毯", width: 10, height: 5, x: 8, y: 8, note: "视觉中心区域" },
      { id: "cabinet", label: "矮柜", width: 6, height: 4, x: 17, y: 9, note: "影音或展示柜" },
      { id: "plant-stand", label: "植物架", width: 3, height: 4, x: 19, y: 4, note: "角落装饰位" }
    ]
  },
  bedroom: {
    label: "卧室",
    summary: "以床为主角的休息空间，床位固定为 8x8。",
    grid: { width: 20, height: 16 },
    colors: { floor: "#b7926f", wall: "#eadcc7", accent: "#9b6a59" },
    slots: [
      { id: "bed", label: "床", width: 8, height: 8, x: 2, y: 6, note: "主床位" },
      { id: "nightstand", label: "床头柜", width: 3, height: 4, x: 11, y: 9, note: "床边配套位" },
      { id: "wardrobe", label: "衣柜", width: 5, height: 8, x: 14, y: 5, note: "高柜收纳位" },
      { id: "dresser", label: "斗柜", width: 6, height: 5, x: 10, y: 3, note: "中型收纳位" },
      { id: "bedroom-rug", label: "床边地毯", width: 8, height: 4, x: 4, y: 12, note: "软装铺地位" }
    ]
  },
  study: {
    label: "书房",
    summary: "以书桌、书柜和阅读角为中心的安静空间。",
    grid: { width: 20, height: 16 },
    colors: { floor: "#b38762", wall: "#e7d4b5", accent: "#7b594a" },
    slots: [
      { id: "desk", label: "书桌", width: 8, height: 4, x: 3, y: 10, note: "主要工作位" },
      { id: "chair", label: "椅子", width: 4, height: 4, x: 11, y: 10, note: "书桌配套位" },
      { id: "bookshelf", label: "书柜", width: 5, height: 9, x: 15, y: 4, note: "高书柜位" },
      { id: "file-cabinet", label: "文件柜", width: 4, height: 5, x: 3, y: 4, note: "辅助收纳位" },
      { id: "reading-nook", label: "阅读角", width: 5, height: 4, x: 9, y: 4, note: "阅读小角落" }
    ]
  },
  "companion-room": {
    label: "小人的房间",
    summary: "给陪伴角色的小房间，家具尺度更轻巧，氛围更亲密。",
    grid: { width: 18, height: 14 },
    colors: { floor: "#c19a75", wall: "#f0dfc8", accent: "#946c6d" },
    slots: [
      { id: "companion-bed", label: "小床", width: 6, height: 7, x: 1, y: 6, note: "小床位" },
      { id: "companion-desk", label: "小书桌", width: 6, height: 4, x: 10, y: 8, note: "写字互动位" },
      { id: "keepsake-shelf", label: "纪念架", width: 4, height: 6, x: 12, y: 2, note: "收藏展示位" },
      { id: "plush-corner", label: "玩偶角", width: 4, height: 4, x: 4, y: 2, note: "软装治愈位" },
      { id: "companion-trunk", label: "小箱子", width: 4, height: 4, x: 8, y: 5, note: "轻收纳位" }
    ]
  },
  "user-room": {
    label: "用户的房间",
    summary: "用户自己的主卧空间，床、书桌和衣柜比例更均衡。",
    grid: { width: 22, height: 16 },
    colors: { floor: "#c39a76", wall: "#efe1cc", accent: "#8f6658" },
    slots: [
      { id: "user-bed", label: "用户床", width: 7, height: 7, x: 2, y: 7, note: "主床位" },
      { id: "user-desk", label: "用户书桌", width: 7, height: 4, x: 12, y: 10, note: "工作学习位" },
      { id: "user-wardrobe", label: "用户衣柜", width: 5, height: 8, x: 16, y: 5, note: "高衣柜位" },
      { id: "user-dresser", label: "用户斗柜", width: 6, height: 5, x: 10, y: 4, note: "中型收纳位" },
      { id: "hobby-rack", label: "兴趣架", width: 4, height: 6, x: 5, y: 3, note: "展示兴趣位" }
    ]
  },
  attic: {
    label: "阁楼",
    summary: "兼具收纳与手作气质的高处空间，适合箱子、书架和工作台。",
    grid: { width: 22, height: 14 },
    colors: { floor: "#a97f5f", wall: "#e1cdb0", accent: "#6d4d40" },
    slots: [
      { id: "workbench", label: "工作台", width: 8, height: 4, x: 3, y: 9, note: "手作修理位" },
      { id: "storage-trunk", label: "储物箱", width: 6, height: 4, x: 13, y: 9, note: "低位收纳箱" },
      { id: "tall-shelf", label: "高架柜", width: 5, height: 8, x: 17, y: 4, note: "纵向收纳位" },
      { id: "book-stack", label: "书堆", width: 4, height: 4, x: 3, y: 4, note: "地面堆放位" },
      { id: "window-seat", label: "窗边长凳", width: 6, height: 3, x: 9, y: 5, note: "靠窗休息位" }
    ]
  },
  terrace: {
    label: "露台",
    summary: "面向户外的放松区域，适合长椅、茶桌和花箱。",
    grid: { width: 24, height: 14 },
    colors: { floor: "#a77d5c", wall: "#d6e6ef", accent: "#678a6c" },
    slots: [
      { id: "terrace-bench", label: "露台长椅", width: 7, height: 4, x: 2, y: 8, note: "主要坐席位" },
      { id: "tea-table", label: "茶桌", width: 4, height: 4, x: 11, y: 8, note: "小桌位" },
      { id: "planter", label: "花箱", width: 4, height: 4, x: 18, y: 8, note: "绿植位" },
      { id: "lounge-chair", label: "躺椅", width: 5, height: 4, x: 9, y: 3, note: "放松角" },
      { id: "railing-shelf", label: "栏杆置物架", width: 6, height: 3, x: 2, y: 3, note: "边缘展示位" }
    ]
  }
};
*/

function decodeBase64Utf8(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const ROOM_TEMPLATES = JSON.parse(decodeBase64Utf8("ewogICJsaXZpbmctcm9vbSI6IHsKICAgICJsYWJlbCI6ICLlrqLljoUiLAogICAgInN1bW1hcnkiOiAi5a625Zut5Lit5aSu55qE5YWs5YWx56m66Ze077yM6YCC5ZCI5pGG5Li75rKZ5Y+R44CB6Iy25Yeg5ZKM5bGV56S65pS257qz44CCIiwKICAgICJncmlkIjogeyAid2lkdGgiOiAyNCwgImhlaWdodCI6IDE2IH0sCiAgICAiY29sb3JzIjogeyAiZmxvb3IiOiAiI2M4YTQ3ZSIsICJ3YWxsIjogIiNlOWQ4YmMiLCAiYWNjZW50IjogIiM4YzVmNDciIH0sCiAgICAic2xvdHMiOiBbCiAgICAgIHsgImlkIjogInNvZmEiLCAibGFiZWwiOiAi5Li75rKZ5Y+RIiwgIndpZHRoIjogOCwgImhlaWdodCI6IDQsICJ4IjogMiwgInkiOiA5LCAibm90ZSI6ICLpnaDlopnkuLvkvY0iIH0sCiAgICAgIHsgImlkIjogImNvZmZlZS10YWJsZSIsICJsYWJlbCI6ICLojLblh6AiLCAid2lkdGgiOiA1LCAiaGVpZ2h0IjogMywgIngiOiAxMSwgInkiOiAxMCwgIm5vdGUiOiAi5a6i5Y6F5Lit5b+D55+u5qGMIiB9LAogICAgICB7ICJpZCI6ICJydWciLCAibGFiZWwiOiAi5Zyw5q+vIiwgIndpZHRoIjogMTAsICJoZWlnaHQiOiA1LCAieCI6IDgsICJ5IjogOCwgIm5vdGUiOiAi6KeG6KeJ5Lit5b+D5Yy65Z+fIiB9LAogICAgICB7ICJpZCI6ICJjYWJpbmV0IiwgImxhYmVsIjogIuefruafnCIsICJ3aWR0aCI6IDYsICJoZWlnaHQiOiA0LCAieCI6IDE3LCAieSI6IDksICJub3RlIjogIuW9semfs+aIluWxleekuuafnCIgfSwKICAgICAgeyAiaWQiOiAicGxhbnQtc3RhbmQiLCAibGFiZWwiOiAi5qSN54mp5p62IiwgIndpZHRoIjogMywgImhlaWdodCI6IDQsICJ4IjogMTksICJ5IjogNCwgIm5vdGUiOiAi6KeS6JC96KOF6aWw5L2NIiB9CiAgICBdCiAgfSwKICAiYmVkcm9vbSI6IHsKICAgICJsYWJlbCI6ICLljaflrqQiLAogICAgInN1bW1hcnkiOiAi5Lul5bqK5Li65Li76KeS55qE5LyR5oGv56m66Ze077yM5bqK5L2N5Zu65a6a5Li6IDh4OOOAgiIsCiAgICAiZ3JpZCI6IHsgIndpZHRoIjogMjAsICJoZWlnaHQiOiAxNiB9LAogICAgImNvbG9ycyI6IHsgImZsb29yIjogIiNiNzkyNmYiLCAid2FsbCI6ICIjZWFkY2M3IiwgImFjY2VudCI6ICIjOWI2YTU5IiB9LAogICAgInNsb3RzIjogWwogICAgICB7ICJpZCI6ICJiZWQiLCAibGFiZWwiOiAi5bqKIiwgIndpZHRoIjogOCwgImhlaWdodCI6IDgsICJ4IjogMiwgInkiOiA2LCAibm90ZSI6ICLkuLvluorkvY0iIH0sCiAgICAgIHsgImlkIjogIm5pZ2h0c3RhbmQiLCAibGFiZWwiOiAi5bqK5aS05p+cIiwgIndpZHRoIjogMywgImhlaWdodCI6IDQsICJ4IjogMTEsICJ5IjogOSwgIm5vdGUiOiAi5bqK6L656YWN5aWX5L2NIiB9LAogICAgICB7ICJpZCI6ICJ3YXJkcm9iZSIsICJsYWJlbCI6ICLooaPmn5wiLCAid2lkdGgiOiA1LCAiaGVpZ2h0IjogOCwgIngiOiAxNCwgInkiOiA1LCAibm90ZSI6ICLpq5jmn5zmlLbnurPkvY0iIH0sCiAgICAgIHsgImlkIjogImRyZXNzZXIiLCAibGFiZWwiOiAi5paX5p+cIiwgIndpZHRoIjogNiwgImhlaWdodCI6IDUsICJ4IjogMTAsICJ5IjogMywgIm5vdGUiOiAi5Lit5Z6L5pS257qz5L2NIiB9LAogICAgICB7ICJpZCI6ICJiZWRyb29tLXJ1ZyIsICJsYWJlbCI6ICLluorovrnlnLDmr68iLCAid2lkdGgiOiA4LCAiaGVpZ2h0IjogNCwgIngiOiA0LCAieSI6IDEyLCAibm90ZSI6ICLova/oo4Xpk7rlnLDkvY0iIH0KICAgIF0KICB9LAogICJzdHVkeSI6IHsKICAgICJsYWJlbCI6ICLkuabmiL8iLAogICAgInN1bW1hcnkiOiAi5Lul5Lmm5qGM44CB5Lmm5p+c5ZKM6ZiF6K+76KeS5Li65Lit5b+D55qE5a6J6Z2Z56m66Ze044CCIiwKICAgICJncmlkIjogeyAid2lkdGgiOiAyMCwgImhlaWdodCI6IDE2IH0sCiAgICAiY29sb3JzIjogeyAiZmxvb3IiOiAiI2IzODc2MiIsICJ3YWxsIjogIiNlN2Q0YjUiLCAiYWNjZW50IjogIiM3YjU5NGEiIH0sCiAgICAic2xvdHMiOiBbCiAgICAgIHsgImlkIjogImRlc2siLCAibGFiZWwiOiAi5Lmm5qGMIiwgIndpZHRoIjogOCwgImhlaWdodCI6IDQsICJ4IjogMywgInkiOiAxMCwgIm5vdGUiOiAi5Li76KaB5bel5L2c5L2NIiB9LAogICAgICB7ICJpZCI6ICJjaGFpciIsICJsYWJlbCI6ICLmpIXlrZAiLCAid2lkdGgiOiA0LCAiaGVpZ2h0IjogNCwgIngiOiAxMSwgInkiOiAxMCwgIm5vdGUiOiAi5Lmm5qGM6YWN5aWX5L2NIiB9LAogICAgICB7ICJpZCI6ICJib29rc2hlbGYiLCAibGFiZWwiOiAi5Lmm5p+cIiwgIndpZHRoIjogNSwgImhlaWdodCI6IDksICJ4IjogMTUsICJ5IjogNCwgIm5vdGUiOiAi6auY5Lmm5p+c5L2NIiB9LAogICAgICB7ICJpZCI6ICJmaWxlLWNhYmluZXQiLCAibGFiZWwiOiAi5paH5Lu25p+cIiwgIndpZHRoIjogNCwgImhlaWdodCI6IDUsICJ4IjogMywgInkiOiA0LCAibm90ZSI6ICLovoXliqnmlLbnurPkvY0iIH0sCiAgICAgIHsgImlkIjogInJlYWRpbmctbm9vayIsICJsYWJlbCI6ICLpmIXor7vop5IiLCAid2lkdGgiOiA1LCAiaGVpZ2h0IjogNCwgIngiOiA5LCAieSI6IDQsICJub3RlIjogIumYheivu+Wwj+inkuiQvSIgfQogICAgXQogIH0sCiAgImNvbXBhbmlvbi1yb29tIjogewogICAgImxhYmVsIjogIuWwj+S6uueahOaIv+mXtCIsCiAgICAic3VtbWFyeSI6ICLnu5npmarkvLTop5LoibLnmoTlsI/miL/pl7TvvIzlrrblhbflsLrluqbmm7Tovbvlt6fvvIzmsJvlm7Tmm7TkurLlr4bjgIIiLAogICAgImdyaWQiOiB7ICJ3aWR0aCI6IDE4LCAiaGVpZ2h0IjogMTQgfSwKICAgICJjb2xvcnMiOiB7ICJmbG9vciI6ICIjYzE5YTc1IiwgIndhbGwiOiAiI2YwZGZjOCIsICJhY2NlbnQiOiAiIzk0NmM2ZCIgfSwKICAgICJzbG90cyI6IFsKICAgICAgeyAiaWQiOiAiY29tcGFuaW9uLWJlZCIsICJsYWJlbCI6ICLlsI/luooiLCAid2lkdGgiOiA2LCAiaGVpZ2h0IjogNywgIngiOiAxLCAieSI6IDYsICJub3RlIjogIuWwj+W6iuS9jSIgfSwKICAgICAgeyAiaWQiOiAiY29tcGFuaW9uLWRlc2siLCAibGFiZWwiOiAi5bCP5Lmm5qGMIiwgIndpZHRoIjogNiwgImhlaWdodCI6IDQsICJ4IjogMTAsICJ5IjogOCwgIm5vdGUiOiAi5YaZ5a2X5LqS5Yqo5L2NIiB9LAogICAgICB7ICJpZCI6ICJrZWVwc2FrZS1zaGVsZiIsICJsYWJlbCI6ICLnuqrlv7XmnrYiLCAid2lkdGgiOiA0LCAiaGVpZ2h0IjogNiwgIngiOiAxMiwgInkiOiAyLCAibm90ZSI6ICLmlLbol4/lsZXnpLrkvY0iIH0sCiAgICAgIHsgImlkIjogInBsdXNoLWNvcm5lciIsICJsYWJlbCI6ICLnjqnlgbbop5IiLCAid2lkdGgiOiA0LCAiaGVpZ2h0IjogNCwgIngiOiA0LCAieSI6IDIsICJub3RlIjogIui9r+ijheayu+aEiOS9jSIgfSwKICAgICAgeyAiaWQiOiAiY29tcGFuaW9uLXRydW5rIiwgImxhYmVsIjogIuWwj+euseWtkCIsICJ3aWR0aCI6IDQsICJoZWlnaHQiOiA0LCAieCI6IDgsICJ5IjogNSwgIm5vdGUiOiAi6L275pS257qz5L2NIiB9CiAgICBdCiAgfSwKICAidXNlci1yb29tIjogewogICAgImxhYmVsIjogIueUqOaIt+eahOaIv+mXtCIsCiAgICAic3VtbWFyeSI6ICLnlKjmiLfoh6rlt7HnmoTkuLvljafnqbrpl7TvvIzluorjgIHkuabmoYzlkozooaPmn5zmr5Tkvovmm7TlnYfooaHjgIIiLAogICAgImdyaWQiOiB7ICJ3aWR0aCI6IDIyLCAiaGVpZ2h0IjogMTYgfSwKICAgICJjb2xvcnMiOiB7ICJmbG9vciI6ICIjYzM5YTc2IiwgIndhbGwiOiAiI2VmZTFjYyIsICJhY2NlbnQiOiAiIzhmNjY1OCIgfSwKICAgICJzbG90cyI6IFsKICAgICAgeyAiaWQiOiAidXNlci1iZWQiLCAibGFiZWwiOiAi55So5oi35bqKIiwgIndpZHRoIjogNywgImhlaWdodCI6IDcsICJ4IjogMiwgInkiOiA3LCAibm90ZSI6ICLkuLvluorkvY0iIH0sCiAgICAgIHsgImlkIjogInVzZXItZGVzayIsICJsYWJlbCI6ICLnlKjmiLfkuabmoYwiLCAid2lkdGgiOiA3LCAiaGVpZ2h0IjogNCwgIngiOiAxMiwgInkiOiAxMCwgIm5vdGUiOiAi5bel5L2c5a2m5Lmg5L2NIiB9LAogICAgICB7ICJpZCI6ICJ1c2VyLXdhcmRyb2JlIiwgImxhYmVsIjogIueUqOaIt+iho+afnCIsICJ3aWR0aCI6IDUsICJoZWlnaHQiOiA4LCAieCI6IDE2LCAieSI6IDUsICJub3RlIjogIumrmOiho+afnOS9jSIgfSwKICAgICAgeyAiaWQiOiAidXNlci1kcmVzc2VyIiwgImxhYmVsIjogIueUqOaIt+aWl+afnCIsICJ3aWR0aCI6IDYsICJoZWlnaHQiOiA1LCAieCI6IDEwLCAieSI6IDQsICJub3RlIjogIuS4reWei+aUtue6s+S9jSIgfSwKICAgICAgeyAiaWQiOiAiaG9iYnktcmFjayIsICJsYWJlbCI6ICLlhbTotqPmnrYiLCAid2lkdGgiOiA0LCAiaGVpZ2h0IjogNiwgIngiOiA1LCAieSI6IDMsICJub3RlIjogIuWxleekuuWFtOi2o+S9jSIgfQogICAgXQogIH0sCiAgImF0dGljIjogewogICAgImxhYmVsIjogIumYgealvCIsCiAgICAic3VtbWFyeSI6ICLlhbzlhbfmlLbnurPkuI7miYvkvZzmsJTotKjnmoTpq5jlpITnqbrpl7TvvIzpgILlkIjnrrHlrZDjgIHkuabmnrblkozlt6XkvZzlj7DjgIIiLAogICAgImdyaWQiOiB7ICJ3aWR0aCI6IDIyLCAiaGVpZ2h0IjogMTQgfSwKICAgICJjb2xvcnMiOiB7ICJmbG9vciI6ICIjYTk3ZjVmIiwgIndhbGwiOiAiI2UxY2RiMCIsICJhY2NlbnQiOiAiIzZkNGQ0MCIgfSwKICAgICJzbG90cyI6IFsKICAgICAgeyAiaWQiOiAid29ya2JlbmNoIiwgImxhYmVsIjogIuW3peS9nOWPsCIsICJ3aWR0aCI6IDgsICJoZWlnaHQiOiA0LCAieCI6IDMsICJ5IjogOSwgIm5vdGUiOiAi5omL5L2c5L+u55CG5L2NIiB9LAogICAgICB7ICJpZCI6ICJzdG9yYWdlLXRydW5rIiwgImxhYmVsIjogIuWCqOeJqeeusSIsICJ3aWR0aCI6IDYsICJoZWlnaHQiOiA0LCAieCI6IDEzLCAieSI6IDksICJub3RlIjogIuS9juS9jeaUtue6s+eusSIgfSwKICAgICAgeyAiaWQiOiAidGFsbC1zaGVsZiIsICJsYWJlbCI6ICLpq5jmnrbmn5wiLCAid2lkdGgiOiA1LCAiaGVpZ2h0IjogOCwgIngiOiAxNywgInkiOiA0LCAibm90ZSI6ICLnurXlkJHmlLbnurPkvY0iIH0sCiAgICAgIHsgImlkIjogImJvb2stc3RhY2siLCAibGFiZWwiOiAi5Lmm5aCGIiwgIndpZHRoIjogNCwgImhlaWdodCI6IDQsICJ4IjogMywgInkiOiA0LCAibm90ZSI6ICLlnLDpnaLloIbmlL7kvY0iIH0sCiAgICAgIHsgImlkIjogIndpbmRvdy1zZWF0IiwgImxhYmVsIjogIueql+i+uemVv+WHsyIsICJ3aWR0aCI6IDYsICJoZWlnaHQiOiAzLCAieCI6IDksICJ5IjogNSwgIm5vdGUiOiAi6Z2g56qX5LyR5oGv5L2NIiB9CiAgICBdCiAgfSwKICAidGVycmFjZSI6IHsKICAgICJsYWJlbCI6ICLpnLLlj7AiLAogICAgInN1bW1hcnkiOiAi6Z2i5ZCR5oi35aSW55qE5pS+5p2+5Yy65Z+f77yM6YCC5ZCI6ZW/5qSF44CB6Iy25qGM5ZKM6Iqx566x44CCIiwKICAgICJncmlkIjogeyAid2lkdGgiOiAyNCwgImhlaWdodCI6IDE0IH0sCiAgICAiY29sb3JzIjogeyAiZmxvb3IiOiAiI2E3N2Q1YyIsICJ3YWxsIjogIiNkNmU2ZWYiLCAiYWNjZW50IjogIiM2NzhhNmMiIH0sCiAgICAic2xvdHMiOiBbCiAgICAgIHsgImlkIjogInRlcnJhY2UtYmVuY2giLCAibGFiZWwiOiAi6Zyy5Y+w6ZW/5qSFIiwgIndpZHRoIjogNywgImhlaWdodCI6IDQsICJ4IjogMiwgInkiOiA4LCAibm90ZSI6ICLkuLvopoHlnZDluK3kvY0iIH0sCiAgICAgIHsgImlkIjogInRlYS10YWJsZSIsICJsYWJlbCI6ICLojLbmoYwiLCAid2lkdGgiOiA0LCAiaGVpZ2h0IjogNCwgIngiOiAxMSwgInkiOiA4LCAibm90ZSI6ICLlsI/moYzkvY0iIH0sCiAgICAgIHsgImlkIjogInBsYW50ZXIiLCAibGFiZWwiOiAi6Iqx566xIiwgIndpZHRoIjogNCwgImhlaWdodCI6IDQsICJ4IjogMTgsICJ5IjogOCwgIm5vdGUiOiAi57u/5qSN5L2NIiB9LAogICAgICB7ICJpZCI6ICJsb3VuZ2UtY2hhaXIiLCAibGFiZWwiOiAi6Lq65qSFIiwgIndpZHRoIjogNSwgImhlaWdodCI6IDQsICJ4IjogOSwgInkiOiAzLCAibm90ZSI6ICLmlL7mnb7op5IiIH0sCiAgICAgIHsgImlkIjogInJhaWxpbmctc2hlbGYiLCAibGFiZWwiOiAi5qCP5p2G572u54mp5p62IiwgIndpZHRoIjogNiwgImhlaWdodCI6IDMsICJ4IjogMiwgInkiOiAzLCAibm90ZSI6ICLovrnnvJjlsZXnpLrkvY0iIH0KICAgIF0KICB9Cn0="));
const UI_TEXT = JSON.parse(decodeBase64Utf8("ewogICJzdGF0dXNDaGFyYWN0ZXJNb2RlIjogIuS6uueJqeaooeW8j+S8muaKiuavj+W8oOWbvuW9k+aIkOS4gOS4quinkuiJsu+8jOW5tue7n+S4gOWOi+WIsOWQjOS4gOWll+WDj+e0oOWwj+S6uuavlOS+i+mHjOOAgiIsCiAgInN0YXR1c0Z1cm5pdHVyZU1vZGUiOiAi5a625YW35qih5byP5Lya5oyJ6buY6K6k5oi/6Ze05ZKM5qe95L2N57uf5LiA5b2S5LiA5bC65a+477yM6K6p5ZCM57G75a625YW356iz5a6a6JC96L+b5ZCM5LiA5aWX5a625Zut57uT5p6E6YeM44CCIiwKICAic3RhdHVzTG9hZEZhaWxlZCI6ICLntKDmnZDovb3lhaXlpLHotKXvvIzor7fmo4Dmn6Xlm77niYfmoLzlvI/mmK/lkKbmraPnoa7jgIIiLAogICJzdGF0dXNOZWVkVXBsb2FkIjogIuivt+WFiOS4iuS8oOS4gOaJuee0oOadkO+8jOWGjeW8gOWni+e7n+S4gOeUn+aIkOOAgiIsCiAgInN0YXR1c05vT2JqZWN0cyI6ICLmsqHmnInor4bliKvlh7rmnInmlYjnianku7bvvIzor7flsJ3or5XliIfmjaLor4bliKvmqKHlvI/jgIHog4zmma/mqKHlvI/vvIzmiJbosIPlsI/mnIDlsI/nu4Tku7blg4/ntKDjgIIiLAogICJzb3VyY2VFbXB0eSI6ICLkuIrkvKDlkI7nmoTmupDntKDmnZDkvJrmmL7npLrlnKjov5nph4zjgIIiLAogICJzb3VyY2VQcmV2aWV3SGludCI6ICLngrnlh7vlj6/pooTop4jljp/lm74iLAogICJzb3VyY2VDYW52YXNIaW50IjogIuS4iuS8oOWQju+8jOi/memHjOS8muaYvuekuuW9k+WJjea6kOWbvuWSjOivhuWIq+ahhuOAgiIsCiAgInBhbGV0dGVFbXB0eSI6ICLlpITnkIblrozmiJDlkI7vvIzov5nph4zkvJrmmL7npLrnu5/kuIDoibLmnb/jgIIiLAogICJhc3NldEVtcHR5IjogIueUn+aIkOWQjueahOWutuWFt+WSjOS6uueJqeS8muayiea3gOWIsOi/memHjO+8jOS9nOS4uuWPr+WPjeWkjeaRhuaUvueahOWutuWbreW6k+OAgiIsCiAgInN0YXR1c05lZWRaaXAiOiAi6K+35YWI55Sf5oiQ6Iez5bCR5LiA5om55YaF5a6577yM5YaN5a+85Ye6IFpJUOOAgiIsCiAgInN0YXR1c05lZWRTaGVldCI6ICLor7flhYjnlJ/miJDoh7PlsJHkuIDmibnlhoXlrrnvvIzlho3lr7zlh7rlm77pm4bjgIIiCn0="));

initialize();

function initialize() {
  applyAppShellCopy();
  dom.fileInput.addEventListener("change", handleFileSelect);
  dom.contentType.addEventListener("change", handleContentTypeChange);
  dom.roomType.addEventListener("change", handleRoomChange);
  dom.slotType.addEventListener("change", handleSlotChange);
  dom.roomCanvas.addEventListener("click", handleRoomCanvasClick);
  dom.roomCanvas.addEventListener("wheel", handleRoomCanvasWheel, { passive: false });
  dom.roomCanvas.addEventListener("touchstart", handleRoomCanvasTouchStart, { passive: false });
  dom.roomCanvas.addEventListener("touchmove", handleRoomCanvasTouchMove, { passive: false });
  dom.roomCanvas.addEventListener("touchend", handleRoomCanvasTouchEnd, { passive: true });
  dom.roomCanvas.addEventListener("touchcancel", handleRoomCanvasTouchEnd, { passive: true });
  dom.processButton.addEventListener("click", processBatch);
  dom.downloadSheetButton.addEventListener("click", downloadSheet);
  dom.downloadZipButton.addEventListener("click", downloadZip);
  dom.zoomOutButton.addEventListener("click", () => adjustFocusZoom(-0.35));
  dom.zoomResetButton.addEventListener("click", resetFocusZoom);
  dom.zoomInButton.addEventListener("click", () => adjustFocusZoom(0.35));
  dom.settingsToggleButton.addEventListener("click", () => toggleSettingsPanel());
  dom.settingsCloseButton.addEventListener("click", () => toggleSettingsPanel(false));
  dom.settingsScrim.addEventListener("click", () => toggleSettingsPanel(false));
  window.addEventListener("resize", handleWindowResize);
  window.addEventListener("keydown", handleWindowKeydown);

  populateRoomOptions();
  syncSlotOptions();
  syncSettingsPanel();
  handleContentTypeChange();
  renderEmptyPreview();
  renderRoomTemplate();
  renderSourceList([]);
  renderPalette([]);
  renderAssets([]);
  updateMeta();
  updateZoomHud();
}

function applyAppShellCopy() {
  document.title = "\u50cf\u7d20\u5bb6\u56ed\u603b\u89c8";

  setNodeText(".scene-kicker", "\u624b\u673a\u5bb6\u56ed\u529f\u80fd\u9875");
  setNodeText(".scene-copy h1", "\u5bb6\u56ed\u603b\u89c8");
  setNodeText(
    ".scene-text",
    "\u8fd9\u4e2a\u9875\u9762\u4f1a\u4f5c\u4e3a\u6a21\u62df\u5c0f\u624b\u673a App \u91cc\u7684\u5bb6\u56ed\u529f\u80fd\u5165\u53e3\uff0c\u6240\u4ee5\u9996\u9875\u5148\u53ea\u805a\u7126\u5bb6\u56ed\u672c\u8eab\u3002\u4e0a\u4f20\u3001\u751f\u6210\u3001\u6e90\u56fe\u68c0\u67e5\u548c\u8d44\u4ea7\u6574\u7406\u90fd\u6536\u8fdb\u8bbe\u7f6e\u91cc\uff0c\u4e3b\u5c4f\u8d1f\u8d23\u770b\u6574\u5c4b\u7ed3\u6784\u3001\u5207\u6362\u623f\u95f4\u548c\u786e\u8ba4\u5f53\u524d\u6446\u653e\u72b6\u6001\u3002"
  );

  const statusbarSpans = document.querySelectorAll(".phone-statusbar span");
  if (statusbarSpans[1]) {
    statusbarSpans[1].textContent = "\u5bb6\u56ed";
  }
  if (statusbarSpans[2]) {
    statusbarSpans[2].textContent = "\u6ee1\u683c";
  }

  setNodeText(".app-kicker", "\u5bb6\u56ed\u529f\u80fd");
  setNodeText(".app-topbar h2", "\u5bb6\u56ed\u603b\u89c8");
  dom.settingsToggleButton.textContent = "\u8bbe\u7f6e";
  dom.settingsCloseButton.textContent = "\u6536\u8d77";
  dom.settingsScrim.setAttribute("aria-label", "\u5173\u95ed\u8bbe\u7f6e\u9762\u677f");
  dom.settingsPanel.setAttribute("aria-label", "\u8bbe\u7f6e\u9762\u677f");

  dom.roomCanvas.setAttribute("aria-label", "\u5bb6\u56ed\u603b\u89c8");
  dom.sourceCanvas.setAttribute("aria-label", "\u6e90\u56fe\u9884\u89c8");
  dom.roomTitle.textContent = "\u5ba2\u5385\uff08\u5f53\u524d\u7126\u70b9\uff09";
  dom.roomSummary.textContent = "\u8fd9\u91cc\u4f1a\u663e\u793a\u5f53\u524d\u7126\u70b9\u623f\u95f4\u7684\u8bf4\u660e\u3001\u9ed8\u8ba4\u6446\u653e\u69fd\u4f4d\uff0c\u4ee5\u53ca\u6574\u5c4b\u5207\u6362\u63d0\u793a\u3002";
  setNodeText(".home-map-card .section-head h3", "\u6574\u5c4b\u89c6\u56fe");
  setNodeText(
    ".home-map-card .section-head p",
    "\u4e0a\u65b9\u770b\u6574\u5c4b\uff0c\u4e0b\u65b9\u770b\u7126\u70b9\u623f\u95f4\u3002\u70b9\u6574\u5c4b\u7f29\u7565\u56fe\u91cc\u7684\u623f\u95f4\u53ef\u4ee5\u5feb\u901f\u5207\u6362\u3002"
  );

  const homeSectionHeads = document.querySelectorAll(".home-card .section-head");
  if (homeSectionHeads[2]) {
    const title = homeSectionHeads[2].querySelector("h3");
    const description = homeSectionHeads[2].querySelector("p");
    if (title) {
      title.textContent = "\u5f53\u524d\u72b6\u6001";
    }
    if (description && description !== dom.statusText) {
      description.textContent = "\u5148\u5728\u8bbe\u7f6e\u91cc\u4e0a\u4f20\u7d20\u6750\uff0c\u518d\u5f00\u59cb\u7edf\u4e00\u751f\u6210\u5e76\u52a0\u5165\u5bb6\u56ed\u5e93\u3002";
    }
  }
  if (homeSectionHeads[3]) {
    const title = homeSectionHeads[3].querySelector("h3");
    const description = homeSectionHeads[3].querySelector("p");
    if (title) {
      title.textContent = "\u7126\u70b9\u69fd\u4f4d";
    }
    if (description) {
      description.textContent = "\u8fd9\u91cc\u5c55\u793a\u5f53\u524d\u7126\u70b9\u623f\u95f4\u7684\u69fd\u4f4d\u4fe1\u606f\uff0c\u65b9\u4fbf\u4f60\u67e5\u770b\u6bcf\u4e2a\u4f4d\u7f6e\u662f\u5426\u5df2\u7ecf\u6446\u653e\u5b8c\u6210\u3002";
    }
  }

  setNodeText(".settings-kicker", "\u8bbe\u7f6e");
  setNodeText(".settings-header h2", "\u7d20\u6750\u4e0e\u751f\u6210");

  const settingsHeadings = document.querySelectorAll(".settings-scroll .section-head h3");
  const settingsDescriptions = document.querySelectorAll(".settings-scroll .section-head p");
  const settingsHeadingCopy = [
    "\u751f\u6210\u63a7\u5236",
    "\u6e90\u56fe\u9884\u89c8",
    "\u6e90\u7d20\u6750\u5217\u8868",
    "\u7edf\u4e00\u8272\u677f",
    "\u5bb6\u56ed\u5e93"
  ];
  const settingsDescriptionCopy = [
    "\u6240\u6709\u4e0a\u4f20\u548c\u751f\u6210\u76f8\u5173\u529f\u80fd\u90fd\u6536\u5728\u8fd9\u91cc\uff0c\u4e0d\u6253\u6270\u9996\u9875\u67e5\u770b\u5bb6\u56ed\u3002",
    "\u70b9\u51fb\u6e90\u7d20\u6750\u5361\u7247\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u539f\u56fe\u4e0e\u8bc6\u522b\u6846\u3002",
    "\u68c0\u67e5\u6bcf\u5f20\u56fe\u8bc6\u522b\u51fa\u4e86\u591a\u5c11\u7269\u4ef6\uff0c\u5e76\u5207\u6362\u5f53\u524d\u9884\u89c8\u76ee\u6807\u3002",
    "\u8fd9\u4e00\u6279\u7d20\u6750\u4f1a\u5171\u7528\u8fd9\u91cc\u7684\u8272\u677f\u98ce\u683c\u3002",
    "\u751f\u6210\u7ed3\u679c\u4f1a\u5728\u8fd9\u91cc\u6392\u961f\uff0c\u4ecd\u7136\u53ef\u4ee5\u5728\u5361\u7247\u91cc\u4fee\u6539\u623f\u95f4\u548c\u69fd\u4f4d\u3002"
  ];

  settingsHeadings.forEach((node, index) => {
    if (settingsHeadingCopy[index]) {
      node.textContent = settingsHeadingCopy[index];
    }
  });

  settingsDescriptions.forEach((node, index) => {
    if (settingsDescriptionCopy[index]) {
      node.textContent = settingsDescriptionCopy[index];
    }
  });

  const fieldCaptions = document.querySelectorAll(".settings-block .field > span");
  const fieldCopy = [
    "\u4e0a\u4f20\u7d20\u6750",
    "\u7d20\u6750\u7c7b\u578b",
    "\u9ed8\u8ba4\u623f\u95f4",
    "\u9ed8\u8ba4\u69fd\u4f4d",
    "\u8bc6\u522b\u6a21\u5f0f",
    "\u80cc\u666f\u6a21\u5f0f",
    "\u69fd\u4f4d\u957f\u8fb9\u50cf\u7d20",
    "\u7edf\u4e00\u8272\u677f\u6570\u91cf",
    "\u547d\u540d\u524d\u7f00",
    "\u6700\u5c0f\u7ec4\u4ef6\u50cf\u7d20"
  ];
  fieldCaptions.forEach((node, index) => {
    if (fieldCopy[index]) {
      node.textContent = fieldCopy[index];
    }
  });

  const checkboxCaptions = document.querySelectorAll(".settings-block .checkbox-row span");
  if (checkboxCaptions[0]) {
    checkboxCaptions[0].textContent = "\u7ed9\u751f\u6210\u7ed3\u679c\u8865\u7edf\u4e00\u63cf\u8fb9";
  }
  if (checkboxCaptions[1]) {
    checkboxCaptions[1].textContent = "\u5c1d\u8bd5\u62c6\u5f00\u7c98\u8fde\u7684\u5927\u7ec4\u4ef6";
  }

  if (dom.contentType.options[0]) {
    dom.contentType.options[0].textContent = "\u5bb6\u5177 / \u9053\u5177";
  }
  if (dom.contentType.options[1]) {
    dom.contentType.options[1].textContent = "\u4eba\u7269\u5c0f\u4eba";
  }

  if (dom.assetMode.options[0]) {
    dom.assetMode.options[0].textContent = "\u6bcf\u5f20\u56fe\u89c6\u4e3a\u5355\u4ef6";
  }
  if (dom.assetMode.options[1]) {
    dom.assetMode.options[1].textContent = "\u6bcf\u5f20\u56fe\u81ea\u52a8\u62c6\u5206";
  }

  if (dom.backgroundMode.options[0]) {
    dom.backgroundMode.options[0].textContent = "\u81ea\u52a8\u5224\u65ad";
  }
  if (dom.backgroundMode.options[1]) {
    dom.backgroundMode.options[1].textContent = "\u767d\u5e95";
  }
  if (dom.backgroundMode.options[2]) {
    dom.backgroundMode.options[2].textContent = "\u900f\u660e\u5e95";
  }

  Array.from(dom.paletteSize.options).forEach((option) => {
    option.textContent = `${option.value} \u8272`;
  });

  if (!dom.namePrefix.value || dom.namePrefix.value === "home-assets") {
    dom.namePrefix.value = "\u5bb6\u56ed\u5bb6\u5177";
  }
  dom.namePrefix.placeholder = "\u4f8b\u5982 \u5bb6\u56ed\u5bb6\u5177";

  dom.processButton.textContent = "\u7edf\u4e00\u751f\u6210";
  dom.downloadZipButton.textContent = "\u5bfc\u51fa ZIP";
  dom.downloadSheetButton.textContent = "\u5bfc\u51fa\u56fe\u96c6 PNG";
}

function setNodeText(selector, text) {
  const node = document.querySelector(selector);
  if (node) {
    node.textContent = text;
  }
}

function clampFocusZoom(value) {
  return Math.max(1, Math.min(5.8, Number(value) || 1.4));
}

function updateZoomHud() {
  if (!dom.zoomResetButton || !dom.gestureHint) {
    return;
  }
  dom.zoomResetButton.textContent = `${state.focusZoom.toFixed(1)}x`;
  dom.gestureHint.textContent = `\u53cc\u6307\u6216\u6eda\u8f6e\u653e\u5927\u5bb6\u56ed\u603b\u89c8\uff0c\u4f1a\u4ee5\u5f53\u524d\u623f\u95f4\u4e3a\u4e2d\u5fc3\u653e\u5927\u3002\u5f53\u524d ${state.focusZoom.toFixed(1)}x`;
}

function adjustFocusZoom(delta) {
  const nextZoom = clampFocusZoom(state.focusZoom + delta);
  if (Math.abs(nextZoom - state.focusZoom) < 0.001) {
    return;
  }
  state.focusZoom = nextZoom;
  updateZoomHud();
  renderRoomTemplate();
}

function resetFocusZoom() {
  state.focusZoom = 1.4;
  updateZoomHud();
  renderRoomTemplate();
}

function getCanvasPointFromClient(clientX, clientY) {
  const rect = dom.roomCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }
  return {
    x: (clientX - rect.left) * (dom.roomCanvas.width / rect.width),
    y: (clientY - rect.top) * (dom.roomCanvas.height / rect.height)
  };
}

function isPointInsideRect(point, rect) {
  return Boolean(
    point &&
    rect &&
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function getTouchDistance(touchA, touchB) {
  return Math.hypot(touchA.clientX - touchB.clientX, touchA.clientY - touchB.clientY);
}

function handleRoomCanvasWheel(event) {
  if (!state.focusViewport) {
    return;
  }

  const point = getCanvasPointFromClient(event.clientX, event.clientY);
  if (!isPointInsideRect(point, state.focusViewport)) {
    return;
  }

  event.preventDefault();
  adjustFocusZoom(event.deltaY < 0 ? 0.28 : -0.28);
}

function handleRoomCanvasTouchStart(event) {
  if (event.touches.length !== 2) {
    state.pinchZoomStartDistance = null;
    return;
  }

  const firstPoint = getCanvasPointFromClient(event.touches[0].clientX, event.touches[0].clientY);
  const secondPoint = getCanvasPointFromClient(event.touches[1].clientX, event.touches[1].clientY);
  if (!isPointInsideRect(firstPoint, state.focusViewport) || !isPointInsideRect(secondPoint, state.focusViewport)) {
    state.pinchZoomStartDistance = null;
    return;
  }

  state.pinchZoomStartDistance = getTouchDistance(event.touches[0], event.touches[1]);
  state.pinchZoomStartValue = state.focusZoom;
}

function handleRoomCanvasTouchMove(event) {
  if (event.touches.length !== 2 || !state.pinchZoomStartDistance) {
    return;
  }

  event.preventDefault();
  const distance = getTouchDistance(event.touches[0], event.touches[1]);
  const nextZoom = clampFocusZoom(state.pinchZoomStartValue * (distance / state.pinchZoomStartDistance));
  if (Math.abs(nextZoom - state.focusZoom) < 0.01) {
    return;
  }
  state.focusZoom = nextZoom;
  updateZoomHud();
  renderRoomTemplate();
}

function handleRoomCanvasTouchEnd(event) {
  if (event.touches && event.touches.length >= 2) {
    return;
  }
  state.pinchZoomStartDistance = null;
  state.pinchZoomStartValue = state.focusZoom;
}

function handleWindowResize() {
  syncSettingsPanel();
  renderRoomTemplate();
}

function isDesktopShell() {
  return window.innerWidth >= 1180;
}

function syncSettingsPanel() {
  const desktopShell = isDesktopShell();
  const shouldShowPanel = state.settingsOpen;

  document.body.classList.toggle("desktop-shell", desktopShell);
  document.body.classList.toggle("settings-open", state.settingsOpen);

  dom.settingsPanel.hidden = !shouldShowPanel;
  dom.settingsPanel.setAttribute("aria-hidden", shouldShowPanel ? "false" : "true");

  dom.settingsScrim.hidden = !state.settingsOpen;
  dom.settingsToggleButton.setAttribute("aria-expanded", shouldShowPanel ? "true" : "false");
  dom.settingsCloseButton.hidden = false;
}

function toggleSettingsPanel(forceOpen) {
  state.settingsOpen = typeof forceOpen === "boolean" ? forceOpen : !state.settingsOpen;
  syncSettingsPanel();
}

function handleWindowKeydown(event) {
  if (event.key === "Escape" && state.settingsOpen) {
    toggleSettingsPanel(false);
  }
}

function handleContentTypeChange() {
  state.contentType = dom.contentType.value;
  if (dom.contentType.value === "character") {
    dom.assetMode.value = "single";
    dom.roomType.disabled = true;
    dom.slotType.disabled = true;
    renderRoomTemplate();
    updateMeta();
    updateStatus(UI_TEXT.statusCharacterMode);
    return;
  }

  dom.roomType.disabled = false;
  dom.slotType.disabled = false;
  renderRoomTemplate();
  updateMeta();
  updateStatus(UI_TEXT.statusFurnitureMode);
}

function handleRoomChange() {
  state.roomId = dom.roomType.value;
  syncSlotOptions();
  renderRoomTemplate();
  updateMeta();
}

function handleSlotChange() {
  state.slotId = dom.slotType.value;
  renderRoomTemplate();
  updateMeta();
}

function handleRoomCanvasClick(event) {
  if (!state.homeSceneReady || !state.roomHitRegions.length) {
    return;
  }

  const rect = dom.roomCanvas.getBoundingClientRect();
  const scaleX = dom.roomCanvas.width / rect.width;
  const scaleY = dom.roomCanvas.height / rect.height;
  const clickX = (event.clientX - rect.left) * scaleX;
  const clickY = (event.clientY - rect.top) * scaleY;

  const hit = state.roomHitRegions.find((region) => (
    clickX >= region.x &&
    clickX <= region.x + region.width &&
    clickY >= region.y &&
    clickY <= region.y + region.height
  ));

  if (!hit || hit.roomId === state.roomId) {
    return;
  }

  state.roomId = hit.roomId;
  dom.roomType.value = hit.roomId;
  syncSlotOptions();
  renderRoomTemplate();
  updateMeta();
}

function populateRoomOptions() {
  dom.roomType.innerHTML = "";
  Object.entries(ROOM_TEMPLATES).forEach(([id, room]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = room.label;
    dom.roomType.appendChild(option);
  });
  dom.roomType.value = state.roomId;
}

function syncSlotOptions() {
  const room = getCurrentRoom();
  dom.slotType.innerHTML = "";
  room.slots.forEach((slot) => {
    const option = document.createElement("option");
    option.value = slot.id;
    option.textContent = `${slot.label} (${slot.width}x${slot.height})`;
    dom.slotType.appendChild(option);
  });

  if (!room.slots.some((slot) => slot.id === state.slotId)) {
    state.slotId = room.slots[0].id;
  }
  dom.slotType.value = state.slotId;
}

function getRoomById(roomId) {
  return ROOM_TEMPLATES[roomId] || ROOM_TEMPLATES["living-room"];
}

function getSlotById(roomId, slotId) {
  const room = getRoomById(roomId);
  return room.slots.find((slot) => slot.id === slotId) || room.slots[0];
}

function populateRoomSelect(select, selectedRoomId) {
  select.innerHTML = "";
  Object.entries(ROOM_TEMPLATES).forEach(([roomId, room]) => {
    const option = document.createElement("option");
    option.value = roomId;
    option.textContent = room.label;
    select.appendChild(option);
  });
  select.value = ROOM_TEMPLATES[selectedRoomId] ? selectedRoomId : "living-room";
}

function populateAssetSlotOptions(select, roomId, selectedSlotId) {
  const room = getRoomById(roomId);
  const slot = getSlotById(roomId, selectedSlotId);
  select.innerHTML = "";
  room.slots.forEach((roomSlot) => {
    const option = document.createElement("option");
    option.value = roomSlot.id;
    option.textContent = `${roomSlot.label} (${roomSlot.width}x${roomSlot.height})`;
    select.appendChild(option);
  });
  select.value = slot.id;
}

function assignAssetPlacement(asset, roomId, slotId, keepOrder = false) {
  const room = getRoomById(roomId);
  const slot = getSlotById(roomId, slotId);
  asset.roomId = roomId;
  asset.roomLabel = room.label;
  asset.slotId = slot.id;
  asset.slotLabel = slot.label;
  asset.placementFootprint = {
    width: slot.width,
    height: slot.height
  };
  asset.placementOrder = keepOrder ? asset.placementOrder : state.nextPlacementOrder++;
  return asset;
}

function isPlacedFurniture(asset) {
  return asset.kind === "furniture" && Boolean(asset.roomId) && Boolean(asset.slotId);
}

function getPlacedAssetForSlot(roomId, slotId) {
  let placedAsset = null;
  state.assets.forEach((asset) => {
    if (!isPlacedFurniture(asset) || asset.roomId !== roomId || asset.slotId !== slotId) {
      return;
    }
    if (!placedAsset || (asset.placementOrder || 0) > (placedAsset.placementOrder || 0)) {
      placedAsset = asset;
    }
  });
  return placedAsset;
}

function getHomeBounds() {
  let width = 0;
  let height = 0;
  Object.entries(ROOM_TEMPLATES).forEach(([roomId, room]) => {
    const offset = HOME_LAYOUT[roomId] || { x: 0, y: 0 };
    width = Math.max(width, offset.x + room.grid.width);
    height = Math.max(height, offset.y + room.grid.height);
  });
  HOME_PASSAGES.forEach((passage) => {
    width = Math.max(width, passage.x + passage.width);
    height = Math.max(height, passage.y + passage.height);
  });
  return { width, height };
}

function drawGrid(ctx, x, y, width, height, tile) {
  ctx.strokeStyle = "rgba(89, 64, 46, 0.12)";
  ctx.lineWidth = 1;

  for (let gridX = 0; gridX <= width; gridX += 1) {
    ctx.beginPath();
    ctx.moveTo(x + gridX * tile + 0.5, y);
    ctx.lineTo(x + gridX * tile + 0.5, y + height * tile);
    ctx.stroke();
  }

  for (let gridY = 0; gridY <= height; gridY += 1) {
    ctx.beginPath();
    ctx.moveTo(x, y + gridY * tile + 0.5);
    ctx.lineTo(x + width * tile, y + gridY * tile + 0.5);
    ctx.stroke();
  }
}

function drawBorderWithOpenings(ctx, x, y, width, height, tile, openings, strokeStyle, lineWidth) {
  const horizontal = { top: [], bottom: [] };
  const vertical = { left: [], right: [] };

  openings.forEach((opening) => {
    const start = opening.start * tile;
    const end = (opening.start + opening.size) * tile;
    if (opening.side === "top" || opening.side === "bottom") {
      horizontal[opening.side].push([start, end]);
    } else {
      vertical[opening.side].push([start, end]);
    }
  });

  const drawHorizontalSegments = (side, lineY) => {
    const intervals = horizontal[side].sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    intervals.forEach(([start, end]) => {
      if (start > cursor) {
        ctx.beginPath();
        ctx.moveTo(x + cursor, lineY);
        ctx.lineTo(x + start, lineY);
        ctx.stroke();
      }
      cursor = Math.max(cursor, end);
    });
    if (cursor < width * tile) {
      ctx.beginPath();
      ctx.moveTo(x + cursor, lineY);
      ctx.lineTo(x + width * tile, lineY);
      ctx.stroke();
    }
  };

  const drawVerticalSegments = (side, lineX) => {
    const intervals = vertical[side].sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    intervals.forEach(([start, end]) => {
      if (start > cursor) {
        ctx.beginPath();
        ctx.moveTo(lineX, y + cursor);
        ctx.lineTo(lineX, y + start);
        ctx.stroke();
      }
      cursor = Math.max(cursor, end);
    });
    if (cursor < height * tile) {
      ctx.beginPath();
      ctx.moveTo(lineX, y + cursor);
      ctx.lineTo(lineX, y + height * tile);
      ctx.stroke();
    }
  };

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  drawHorizontalSegments("top", y + 1);
  drawHorizontalSegments("bottom", y + height * tile - 1);
  drawVerticalSegments("left", x + 1);
  drawVerticalSegments("right", x + width * tile - 1);
}

function drawFloorBlock(ctx, block, tile, padding) {
  const blockX = padding + block.x * tile;
  const blockY = padding + block.y * tile;
  const blockWidth = block.width * tile;
  const blockHeight = block.height * tile;
  const wallHeight = block.wallHeight ?? Math.max(tile * 2, Math.round(blockHeight * 0.24));

  if (block.sky) {
    ctx.fillStyle = block.sky;
    ctx.fillRect(blockX, blockY, blockWidth, wallHeight);
    ctx.fillStyle = block.colors.floor;
    ctx.fillRect(blockX, blockY + wallHeight, blockWidth, blockHeight - wallHeight);
    ctx.fillStyle = block.railing || "#8c6b56";
    ctx.fillRect(blockX, blockY + wallHeight, blockWidth, tile);
  } else {
    ctx.fillStyle = block.colors.wall;
    ctx.fillRect(blockX, blockY, blockWidth, wallHeight);
    ctx.fillStyle = block.colors.floor;
    ctx.fillRect(blockX, blockY + wallHeight, blockWidth, blockHeight - wallHeight);
  }

  drawGrid(ctx, blockX, blockY, block.width, block.height, tile);
  drawBorderWithOpenings(
    ctx,
    blockX,
    blockY,
    block.width,
    block.height,
    tile,
    block.openings || [],
    block.strokeStyle || block.colors.accent,
    block.lineWidth || 3
  );

  return {
    x: blockX,
    y: blockY,
    width: blockWidth,
    height: blockHeight
  };
}

function buildAssetDescription(asset) {
  if (asset.kind === "character") {
    return `${asset.sourceName} / 人物小人 / 统一比例归一化 / 包围盒 ${asset.width} x ${asset.height}`;
  }

  const roomId = asset.roomId || state.roomId;
  const slotId = asset.slotId || state.slotId;
  const room = getRoomById(roomId);
  const slot = getSlotById(roomId, slotId);
  return `${asset.sourceName} / ${room.label} / ${slot.label} ${slot.width}x${slot.height} / 包围盒 ${asset.width} x ${asset.height}`;
}

function countFilledSlots() {
  let filled = 0;
  Object.entries(ROOM_TEMPLATES).forEach(([roomId, room]) => {
    room.slots.forEach((slot) => {
      if (getPlacedAssetForSlot(roomId, slot.id)) {
        filled += 1;
      }
    });
  });
  return filled;
}

async function handleFileSelect(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    return;
  }

  updateStatus(`正在载入 ${files.length} 张素材...`);

  try {
    const loaded = await Promise.all(files.map((file, index) => loadFileEntry(file, index)));
    state.files = loaded;
    state.palette = [];
    state.previewSourceId = loaded[0].id;

    if (!dom.namePrefix.value.trim()) {
      dom.namePrefix.value = suggestPrefix(loaded);
    }

    drawSourcePreview(loaded[0]);
    renderSourceList(loaded);
    renderPalette([]);
    renderAssets(state.assets);
    updateMeta();
    renderRoomTemplate();
    updateStatus(`已载入 ${loaded.length} 张素材，点击“统一生成”把它们加入家园库。`);
  } catch (error) {
    updateStatus(UI_TEXT.statusLoadFailed);
    console.error(error);
  }
}

function processBatch() {
  if (!state.files.length) {
    updateStatus(UI_TEXT.statusNeedUpload);
    return;
  }

  const settings = {
    contentType: dom.contentType.value,
    roomId: dom.roomType.value,
    slotId: dom.slotType.value,
    assetMode: dom.assetMode.value,
    backgroundMode: dom.backgroundMode.value,
    paletteSize: Number(dom.paletteSize.value) || 8,
    outputSize: Number(dom.pixelSize.value) || 32,
    minRegion: Number(dom.minRegion.value) || 28,
    outline: dom.outlineToggle.checked,
    smartSplit: dom.smartSplitToggle.checked,
    prefix: sanitizePrefix(dom.namePrefix.value) || suggestPrefix(state.files)
  };

  dom.namePrefix.value = settings.prefix;
  state.contentType = settings.contentType;
  state.roomId = settings.roomId;
  state.slotId = settings.slotId;
  const selectedRoom = getRoomById(settings.roomId);
  const selectedSlot = getSlotById(settings.roomId, settings.slotId);

  const processedFiles = state.files.map((source) => analyzeSource(source, settings));
  const totalComponents = processedFiles.reduce(
    (sum, source) => sum + source.components.length,
    0
  );

  if (!totalComponents) {
    state.files = processedFiles.map(stripProcessingPayload);
    state.palette = [];
    renderSourceList(state.files);
    renderPalette([]);
    renderAssets(state.assets);
    if (state.files.length) {
      drawSourcePreview(getPreviewSource());
    } else {
      renderEmptyPreview();
    }
    renderRoomTemplate();
    updateMeta();
    updateStatus(UI_TEXT.statusNoObjects);
    return;
  }

  const palette = buildSharedPalette(processedFiles, settings.paletteSize);
  const digits = Math.max(3, String(state.nextAssetId + totalComponents - 1).length);
  const assets = [];
  let sequence = state.nextAssetId;

  processedFiles.forEach((source) => {
    source.components.forEach((component, componentIndex) => {
      assets.push(
        settings.contentType === "character"
          ? createCharacterAsset({
              source,
              component,
              outputSize: settings.outputSize,
              index: sequence,
              digits,
              prefix: settings.prefix,
              componentIndex,
              paletteSize: settings.paletteSize
            })
          : createAsset({
              source,
              component,
              palette,
              outputSize: settings.outputSize,
              outline: settings.outline,
              room: selectedRoom,
              slot: selectedSlot,
              index: sequence,
              digits,
              prefix: settings.prefix,
              componentIndex
            })
      );
      sequence += 1;
    });
  });

  state.files = processedFiles.map(stripProcessingPayload);
  state.palette = palette;
  state.assets = state.assets.concat(assets);
  state.nextAssetId = sequence;

  if (!state.previewSourceId && state.files.length) {
    state.previewSourceId = state.files[0].id;
  }

  renderSourceList(state.files);
  renderPalette(palette);
  renderAssets(state.assets);
  drawSourcePreview(getPreviewSource());
  renderRoomTemplate();
  updateMeta();
  updateStatus(`已处理 ${processedFiles.length} 张素材，并向家园库新增 ${assets.length} 件内容。`);
}

function analyzeSource(source, settings) {
  const canvas = document.createElement("canvas");
  canvas.width = source.image.width;
  canvas.height = source.image.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source.image, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const backgroundModel = buildBackgroundModel(imageData, settings.backgroundMode);
  const mask = buildForegroundMask(imageData, backgroundModel);
  const components =
    settings.assetMode === "single"
      ? buildSingleComponent(mask, imageData.width, imageData.height, settings.minRegion)
      : findComponents(
          mask,
          imageData.width,
          imageData.height,
          settings.minRegion,
          settings.smartSplit
        );

  return {
    ...source,
    detectedBackground: backgroundModel.label,
    imageData,
    mask,
    components
  };
}

function buildSharedPalette(processedFiles, paletteSize) {
  const colors = [];

  processedFiles.forEach((source) => {
    const { imageData, mask } = source;
    const step = Math.max(1, Math.floor(mask.length / 4000));
    for (let index = 0; index < mask.length; index += step) {
      if (!mask[index]) {
        continue;
      }
      const pixelIndex = index * 4;
      colors.push({
        r: imageData.data[pixelIndex],
        g: imageData.data[pixelIndex + 1],
        b: imageData.data[pixelIndex + 2]
      });
    }
  });

  if (!colors.length) {
    return ["#51392c", "#8d684b", "#c8aa84"];
  }

  const unique = dedupeColors(colors);
  if (unique.length <= paletteSize) {
    return unique.sort((a, b) => luminance(hexToRgb(a)) - luminance(hexToRgb(b)));
  }

  const centroids = runKMeans(colors, paletteSize);
  return dedupeColors(centroids.map((color) => rgbToHex(color)))
    .sort((a, b) => luminance(hexToRgb(a)) - luminance(hexToRgb(b)));
}

function createAsset({
  source,
  component,
  palette,
  outputSize,
  outline,
  room,
  slot,
  index,
  digits,
  prefix,
  componentIndex
}) {
  const footprint = slot ? { width: slot.width, height: slot.height } : { width: 1, height: 1 };
  const canvasSize = slot
    ? resolveFootprintCanvasSize(footprint, outputSize)
    : { width: outputSize, height: outputSize, pixelsPerTile: outputSize };
  const padding = 2;
  const cropX = Math.max(0, component.minX - padding);
  const cropY = Math.max(0, component.minY - padding);
  const cropMaxX = Math.min(source.imageData.width - 1, component.maxX + padding);
  const cropMaxY = Math.min(source.imageData.height - 1, component.maxY + padding);
  const cropWidth = cropMaxX - cropX + 1;
  const cropHeight = cropMaxY - cropY + 1;

  const innerLimitWidth = Math.max(2, canvasSize.width - 4);
  const innerLimitHeight = Math.max(2, canvasSize.height - 4);
  const scale = Math.min(innerLimitWidth / cropWidth, innerLimitHeight / cropHeight);
  const pixelWidth = Math.max(1, Math.round(cropWidth * scale));
  const pixelHeight = Math.max(1, Math.round(cropHeight * scale));
  const offsetX = Math.floor((canvasSize.width - pixelWidth) / 2);
  const offsetY = Math.max(1, canvasSize.height - pixelHeight - 1);

  const rgba = new Uint8ClampedArray(canvasSize.width * canvasSize.height * 4);
  const occupied = new Uint8Array(canvasSize.width * canvasSize.height);

  for (let y = 0; y < pixelHeight; y += 1) {
    for (let x = 0; x < pixelWidth; x += 1) {
      const srcX0 = cropX + (x / pixelWidth) * cropWidth;
      const srcX1 = cropX + ((x + 1) / pixelWidth) * cropWidth;
      const srcY0 = cropY + (y / pixelHeight) * cropHeight;
      const srcY1 = cropY + ((y + 1) / pixelHeight) * cropHeight;
      const sampled = sampleArea(source.imageData, source.mask, srcX0, srcY0, srcX1, srcY1);

      if (!sampled || sampled.alpha < 50) {
        continue;
      }

      const color = nearestPaletteColor(sampled, palette);
      const rgb = hexToRgb(color);
      const targetX = offsetX + x;
      const targetY = offsetY + y;
      const targetIndex = targetY * canvasSize.width + targetX;
      const pixelIndex = targetIndex * 4;

      rgba[pixelIndex] = rgb.r;
      rgba[pixelIndex + 1] = rgb.g;
      rgba[pixelIndex + 2] = rgb.b;
      rgba[pixelIndex + 3] = 255;
      occupied[targetIndex] = 1;
    }
  }

  if (outline && palette.length) {
    applyOutline(rgba, occupied, canvasSize.width, canvasSize.height, palette[0]);
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvasSize.width;
  canvas.height = canvasSize.height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.putImageData(new ImageData(rgba, canvasSize.width, canvasSize.height), 0, 0);

  const sequence = String(index).padStart(digits, "0");
  return {
    id: index,
    index,
    kind: "furniture",
    canvas,
    fileName: `${prefix}-${sequence}.png`,
    sourceId: source.id,
    sourceName: source.fileName,
    componentIndex: componentIndex + 1,
    width: component.width,
    height: component.height,
    pixels: component.pixels,
    roomId: state.roomId,
    roomLabel: room?.label || "",
    slotId: slot?.id || "",
    slotLabel: slot?.label || "",
    footprint,
    placementFootprint: footprint,
    placementOrder: state.nextPlacementOrder++,
    pixelsPerTile: canvasSize.pixelsPerTile
  };
}

function createCharacterAsset({
  source,
  component,
  outputSize,
  index,
  digits,
  prefix,
  componentIndex,
  paletteSize
}) {
  const palette = buildComponentPalette(source, component, Math.max(6, paletteSize));
  const outlineColor = "#2b1d1a";
  const rgba = new Uint8ClampedArray(outputSize * outputSize * 4);
  const occupied = new Uint8Array(outputSize * outputSize);
  const centerX = Math.floor(outputSize / 2);
  const topPadding = 2;
  const rowData = buildRowData(source.mask, source.imageData.width, component);
  const bands = estimateCharacterBands(rowData);
  const targetBands = buildTargetCharacterBands(outputSize, topPadding);

  targetBands.forEach((targetBand, bandIndex) => {
    const sourceBand = bands[bandIndex];
    const sourceMaxWidth = getBandMaxWidth(rowData, sourceBand.start, sourceBand.end);

    for (let targetY = targetBand.start; targetY <= targetBand.end; targetY += 1) {
      const relative = normalizeBandPosition(targetY, targetBand.start, targetBand.end);
      const sourceRowIndex = mapRelativeToRange(relative, sourceBand.start, sourceBand.end);
      const nearestRow = findNearestOccupiedRow(rowData, sourceRowIndex, sourceBand.start, sourceBand.end);
      if (!nearestRow) {
        continue;
      }

      const targetMaxWidth = Math.max(
        2,
        Math.round(targetBand.maxWidth * targetBand.profile(relative))
      );
      const widthRatio = nearestRow.width / Math.max(1, sourceMaxWidth);
      const targetRowWidth = clampInt(
        Math.round(targetMaxWidth * Math.max(0.58, widthRatio)),
        2,
        targetMaxWidth
      );
      const targetXStart = centerX - Math.floor(targetRowWidth / 2);
      const sourceHeight = source.imageData.height;

      for (let targetX = 0; targetX < targetRowWidth; targetX += 1) {
        const sourceX0 = nearestRow.minX + (targetX / targetRowWidth) * nearestRow.width;
        const sourceX1 = nearestRow.minX + ((targetX + 1) / targetRowWidth) * nearestRow.width;
        const sourceY0 = clampInt(nearestRow.y - 0.45, 0, sourceHeight - 1);
        const sourceY1 = clampInt(nearestRow.y + 0.45, 0, sourceHeight - 1);
        const sampled = sampleArea(
          source.imageData,
          source.mask,
          sourceX0,
          sourceY0,
          sourceX1,
          sourceY1
        );

        if (!sampled) {
          continue;
        }

        const color = nearestPaletteColor(sampled, palette);
        const rgb = hexToRgb(color);
        const writeX = targetXStart + targetX;
        const writeIndex = (targetY * outputSize + writeX) * 4;
        rgba[writeIndex] = rgb.r;
        rgba[writeIndex + 1] = rgb.g;
        rgba[writeIndex + 2] = rgb.b;
        rgba[writeIndex + 3] = 255;
        occupied[targetY * outputSize + writeX] = 1;
      }
    }
  });

  applyOutline(rgba, occupied, outputSize, outputSize, outlineColor);

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.putImageData(new ImageData(rgba, outputSize, outputSize), 0, 0);

  const sequence = String(index).padStart(digits, "0");
  return {
    id: index,
    index,
    kind: "character",
    canvas,
    fileName: `${prefix}-${sequence}.png`,
    sourceId: source.id,
    sourceName: source.fileName,
    componentIndex: componentIndex + 1,
    width: component.width,
    height: component.height,
    pixels: component.pixels
  };
}

function buildComponentPalette(source, component, paletteSize) {
  const colors = [];
  const stepX = Math.max(1, Math.floor(component.width / 24));
  const stepY = Math.max(1, Math.floor(component.height / 24));

  for (let y = component.minY; y <= component.maxY; y += stepY) {
    for (let x = component.minX; x <= component.maxX; x += stepX) {
      const index = y * source.imageData.width + x;
      if (!source.mask[index]) {
        continue;
      }
      const pixelIndex = index * 4;
      colors.push({
        r: source.imageData.data[pixelIndex],
        g: source.imageData.data[pixelIndex + 1],
        b: source.imageData.data[pixelIndex + 2]
      });
    }
  }

  if (!colors.length) {
    return ["#2b1d1a", "#7d5b48", "#d7b38a"];
  }

  const unique = dedupeColors(colors);
  if (unique.length <= paletteSize) {
    return unique.sort((a, b) => luminance(hexToRgb(a)) - luminance(hexToRgb(b)));
  }

  return dedupeColors(runKMeans(colors, paletteSize).map((color) => rgbToHex(color)))
    .sort((a, b) => luminance(hexToRgb(a)) - luminance(hexToRgb(b)));
}

function buildRowData(mask, width, component) {
  const rows = [];
  for (let y = component.minY; y <= component.maxY; y += 1) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    for (let x = component.minX; x <= component.maxX; x += 1) {
      if (!mask[y * width + x]) {
        continue;
      }
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }

    rows.push(
      Number.isFinite(minX)
        ? { y, minX, maxX, width: maxX - minX + 1 }
        : { y, minX: 0, maxX: 0, width: 0 }
    );
  }
  return rows;
}

function estimateCharacterBands(rowData) {
  if (rowData.length <= 6) {
    const lastIndex = rowData.length - 1;
    const firstBreak = Math.max(1, Math.floor(lastIndex * 0.4));
    const secondBreak = Math.max(firstBreak + 1, Math.floor(lastIndex * 0.72));
    return [
      { start: 0, end: firstBreak },
      { start: firstBreak + 1, end: secondBreak },
      { start: Math.min(secondBreak + 1, lastIndex), end: lastIndex }
    ];
  }

  const headEnd = findBandSplit(rowData, 0.22, 0.55, 0.4);
  const torsoEnd = findBandSplit(rowData, 0.55, 0.84, 0.72);
  const lastIndex = rowData.length - 1;
  const safeHeadEnd = clampInt(headEnd, 2, Math.max(2, lastIndex - 4));
  const safeTorsoEnd = clampInt(
    torsoEnd,
    safeHeadEnd + 1,
    Math.max(safeHeadEnd + 1, lastIndex - 1)
  );

  return [
    { start: 0, end: safeHeadEnd },
    { start: safeHeadEnd + 1, end: safeTorsoEnd },
    { start: safeTorsoEnd + 1, end: lastIndex }
  ];
}

function findBandSplit(rowData, startFraction, endFraction, fallbackFraction) {
  const start = Math.floor((rowData.length - 1) * startFraction);
  const end = Math.floor((rowData.length - 1) * endFraction);
  let bestIndex = clampInt(Math.floor((rowData.length - 1) * fallbackFraction), start, end);
  let bestWidth = Number.POSITIVE_INFINITY;

  for (let index = start; index <= end; index += 1) {
    const width = rowData[index].width;
    if (!width) {
      continue;
    }
    if (width < bestWidth) {
      bestWidth = width;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function buildTargetCharacterBands(outputSize, topPadding) {
  const bottom = outputSize - 2;
  const headStart = topPadding;
  const headEnd = Math.max(headStart + 6, Math.floor(outputSize * 0.44));
  const torsoStart = headEnd + 1;
  const torsoEnd = Math.max(torsoStart + 4, Math.floor(outputSize * 0.68));
  const legStart = torsoEnd + 1;
  return [
    {
      start: headStart,
      end: headEnd,
      maxWidth: Math.max(10, Math.floor(outputSize * 0.46)),
      profile: (t) => (t < 0.2 ? 0.78 : t < 0.72 ? 1 : 0.82)
    },
    {
      start: torsoStart,
      end: torsoEnd,
      maxWidth: Math.max(8, Math.floor(outputSize * 0.38)),
      profile: (t) => (t < 0.3 ? 1 : t < 0.7 ? 0.92 : 0.82)
    },
    {
      start: Math.min(legStart, bottom),
      end: bottom,
      maxWidth: Math.max(6, Math.floor(outputSize * 0.28)),
      profile: (t) => (t < 0.45 ? 1 : 0.72)
    }
  ];
}

function getBandMaxWidth(rowData, start, end) {
  let maxWidth = 0;
  for (let index = start; index <= end; index += 1) {
    maxWidth = Math.max(maxWidth, rowData[index]?.width || 0);
  }
  return maxWidth;
}

function findNearestOccupiedRow(rowData, index, start, end) {
  if (rowData[index] && rowData[index].width > 0) {
    return rowData[index];
  }

  for (let offset = 1; offset <= Math.max(index - start, end - index); offset += 1) {
    const before = index - offset;
    const after = index + offset;
    if (before >= start && rowData[before] && rowData[before].width > 0) {
      return rowData[before];
    }
    if (after <= end && rowData[after] && rowData[after].width > 0) {
      return rowData[after];
    }
  }

  return null;
}

function normalizeBandPosition(value, start, end) {
  if (end <= start) {
    return 0;
  }
  return (value - start) / (end - start);
}

function mapRelativeToRange(relative, start, end) {
  if (end <= start) {
    return start;
  }
  return Math.round(start + (end - start) * relative);
}

function buildBackgroundModel(imageData, requestedMode) {
  const autoMode = detectBackgroundMode(imageData);
  const mode = requestedMode === "auto" ? autoMode : requestedMode;
  const borderAverage = computeBorderAverage(imageData);

  return {
    mode,
    average: borderAverage,
    label: mode === "transparent" ? "Transparent" : "White"
  };
}

function detectBackgroundMode(imageData) {
  const { data, width, height } = imageData;
  const samples = sampleBorderPixels(width, height);
  let transparentCount = 0;
  let whiteCount = 0;

  samples.forEach((point) => {
    const index = (point.y * width + point.x) * 4;
    const alpha = data[index + 3];
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];

    if (alpha < 20) {
      transparentCount += 1;
      return;
    }

    const brightness = (r + g + b) / 3;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (brightness > 238 && spread < 18) {
      whiteCount += 1;
    }
  });

  if (transparentCount >= samples.length * 0.45) {
    return "transparent";
  }

  if (whiteCount >= samples.length * 0.35) {
    return "white";
  }

  return "white";
}

function buildForegroundMask(imageData, backgroundModel) {
  const { data, width, height } = imageData;
  const visited = new Uint8Array(width * height);
  const queue = [];
  let head = 0;

  seedBorderQueue(width, height, (x, y) => {
    const index = y * width + x;
    if (visited[index]) {
      return;
    }
    if (!isBackgroundCandidate(data, width, x, y, backgroundModel)) {
      return;
    }
    visited[index] = 1;
    queue.push(index);
  });

  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    const x = current % width;
    const y = Math.floor(current / width);

    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1]
    ];

    neighbors.forEach(([nx, ny]) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        return;
      }
      const nextIndex = ny * width + nx;
      if (visited[nextIndex]) {
        return;
      }
      if (!isBackgroundCandidate(data, width, nx, ny, backgroundModel)) {
        return;
      }
      visited[nextIndex] = 1;
      queue.push(nextIndex);
    });
  }

  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    const alpha = data[index * 4 + 3];
    mask[index] = visited[index] || alpha < 12 ? 0 : 1;
  }
  return mask;
}

function isBackgroundCandidate(data, width, x, y, backgroundModel) {
  const pixelIndex = (y * width + x) * 4;
  const r = data[pixelIndex];
  const g = data[pixelIndex + 1];
  const b = data[pixelIndex + 2];
  const a = data[pixelIndex + 3];

  if (a < 20) {
    return true;
  }

  if (backgroundModel.mode === "transparent") {
    return a < 36;
  }

  const brightness = (r + g + b) / 3;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  const avgDistance = colorDistanceSq({ r, g, b }, backgroundModel.average);

  if (brightness > 244 && spread < 22) {
    return true;
  }

  return avgDistance < 28 * 28;
}

function buildSingleComponent(mask, width, height, minPixels) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) {
      continue;
    }
    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    count += 1;
  }

  if (count < minPixels || maxX < 0 || maxY < 0) {
    return [];
  }

  return [{
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    pixels: count
  }];
}

function findComponents(mask, width, height, minPixels, smartSplit) {
  const raw = findConnectedComponents(mask, width, height, minPixels);
  const refined = smartSplit
    ? raw.flatMap((component) =>
        splitComponentRecursively(component, mask, width, height, minPixels, 0)
      )
    : raw;

  return sortComponents(refined);
}

function findConnectedComponents(mask, width, height, minPixels, bounds) {
  const minX = bounds ? bounds.minX : 0;
  const minY = bounds ? bounds.minY : 0;
  const maxX = bounds ? bounds.maxX : width - 1;
  const maxY = bounds ? bounds.maxY : height - 1;
  const localWidth = maxX - minX + 1;
  const localHeight = maxY - minY + 1;
  const visited = new Uint8Array(localWidth * localHeight);
  const components = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const index = y * width + x;
      const localIndex = (y - minY) * localWidth + (x - minX);
      if (!mask[index] || visited[localIndex]) {
        continue;
      }

      const queue = [index];
      visited[localIndex] = 1;
      let head = 0;
      let count = 0;
      let foundMinX = width;
      let foundMinY = height;
      let foundMaxX = 0;
      let foundMaxY = 0;

      while (head < queue.length) {
        const current = queue[head];
        head += 1;

        const currentX = current % width;
        const currentY = Math.floor(current / width);
        count += 1;
        foundMinX = Math.min(foundMinX, currentX);
        foundMinY = Math.min(foundMinY, currentY);
        foundMaxX = Math.max(foundMaxX, currentX);
        foundMaxY = Math.max(foundMaxY, currentY);

        const neighbors = [
          [currentX - 1, currentY],
          [currentX + 1, currentY],
          [currentX, currentY - 1],
          [currentX, currentY + 1]
        ];

        neighbors.forEach(([nx, ny]) => {
          if (nx < minX || ny < minY || nx > maxX || ny > maxY) {
            return;
          }
          const neighborIndex = ny * width + nx;
          const neighborLocalIndex = (ny - minY) * localWidth + (nx - minX);
          if (!mask[neighborIndex] || visited[neighborLocalIndex]) {
            return;
          }
          visited[neighborLocalIndex] = 1;
          queue.push(neighborIndex);
        });
      }

      if (count < minPixels) {
        continue;
      }

      components.push({
        minX: foundMinX,
        minY: foundMinY,
        maxX: foundMaxX,
        maxY: foundMaxY,
        width: foundMaxX - foundMinX + 1,
        height: foundMaxY - foundMinY + 1,
        pixels: count
      });
    }
  }

  return components;
}

function splitComponentRecursively(component, mask, width, height, minPixels, depth) {
  if (depth >= 3 || !shouldAttemptSplit(component, minPixels)) {
    return [component];
  }

  const split = findProjectionSplit(component, mask, width, height, minPixels);
  if (!split) {
    return [component];
  }

  const pieces = split.regions.flatMap((region) =>
    findConnectedComponents(mask, width, height, minPixels, region)
  );

  if (pieces.length < 2) {
    return [component];
  }

  return pieces.flatMap((piece) =>
    splitComponentRecursively(piece, mask, width, height, minPixels, depth + 1)
  );
}

function shouldAttemptSplit(component, minPixels) {
  return (
    component.pixels >= minPixels * 3 &&
    (component.width >= 18 || component.height >= 18) &&
    component.width >= 8 &&
    component.height >= 8
  );
}

function findProjectionSplit(component, mask, width, height, minPixels) {
  const vertical = evaluateProjectionSplit(component, mask, width, height, minPixels, "vertical");
  const horizontal = evaluateProjectionSplit(component, mask, width, height, minPixels, "horizontal");

  if (!vertical) {
    return horizontal;
  }
  if (!horizontal) {
    return vertical;
  }
  return vertical.score >= horizontal.score ? vertical : horizontal;
}

function evaluateProjectionSplit(component, mask, width, height, minPixels, axis) {
  const isVertical = axis === "vertical";
  const length = isVertical ? component.width : component.height;
  const thickness = isVertical ? component.height : component.width;

  if (length < 10 || thickness < 6) {
    return null;
  }

  const counts = [];
  for (let offset = 0; offset < length; offset += 1) {
    let count = 0;
    if (isVertical) {
      const x = component.minX + offset;
      for (let y = component.minY; y <= component.maxY; y += 1) {
        count += mask[y * width + x];
      }
    } else {
      const y = component.minY + offset;
      for (let x = component.minX; x <= component.maxX; x += 1) {
        count += mask[y * width + x];
      }
    }
    counts.push(count);
  }

  const maxCount = Math.max(...counts);
  const averageCount = counts.reduce((sum, value) => sum + value, 0) / counts.length;
  const threshold = Math.max(
    1,
    Math.min(
      Math.floor(maxCount * 0.18),
      Math.max(1, Math.floor(averageCount * 0.4))
    )
  );
  const margin = Math.max(2, Math.floor(length * 0.14));

  let best = null;
  let index = margin;

  while (index < length - margin) {
    if (counts[index] > threshold) {
      index += 1;
      continue;
    }

    const start = index;
    while (index < length - margin && counts[index] <= threshold) {
      index += 1;
    }
    const end = index - 1;

    const leftPixels = sumRange(counts, 0, start - 1);
    const rightPixels = sumRange(counts, end + 1, length - 1);
    const leftSpan = start;
    const rightSpan = length - end - 1;
    if (
      leftPixels < minPixels * 1.2 ||
      rightPixels < minPixels * 1.2 ||
      leftSpan < 4 ||
      rightSpan < 4
    ) {
      continue;
    }

    const valleyAverage = sumRange(counts, start, end) / (end - start + 1);
    const balance = Math.min(leftPixels, rightPixels) / Math.max(leftPixels, rightPixels);
    const score = (1 - valleyAverage / Math.max(1, maxCount)) + balance * 0.4 + ((end - start + 1) / length) * 0.2;
    const regions = isVertical
      ? [
          { minX: component.minX, minY: component.minY, maxX: component.minX + start - 1, maxY: component.maxY },
          { minX: component.minX + end + 1, minY: component.minY, maxX: component.maxX, maxY: component.maxY }
        ]
      : [
          { minX: component.minX, minY: component.minY, maxX: component.maxX, maxY: component.minY + start - 1 },
          { minX: component.minX, minY: component.minY + end + 1, maxX: component.maxX, maxY: component.maxY }
        ];

    if (!best || score > best.score) {
      best = { regions, score };
    }
  }

  if (best) {
    return best;
  }

  const valleyIndex = findBestValleyIndex(counts, margin);
  if (valleyIndex < 0 || counts[valleyIndex] > Math.max(1, maxCount * 0.1)) {
    return null;
  }

  const leftPixels = sumRange(counts, 0, valleyIndex - 1);
  const rightPixels = sumRange(counts, valleyIndex + 1, length - 1);
  if (
    leftPixels < minPixels * 1.2 ||
    rightPixels < minPixels * 1.2 ||
    valleyIndex < 4 ||
    length - valleyIndex - 1 < 4
  ) {
    return null;
  }

  return isVertical
    ? {
        score: 1 - counts[valleyIndex] / Math.max(1, maxCount),
        regions: [
          { minX: component.minX, minY: component.minY, maxX: component.minX + valleyIndex - 1, maxY: component.maxY },
          { minX: component.minX + valleyIndex + 1, minY: component.minY, maxX: component.maxX, maxY: component.maxY }
        ]
      }
    : {
        score: 1 - counts[valleyIndex] / Math.max(1, maxCount),
        regions: [
          { minX: component.minX, minY: component.minY, maxX: component.maxX, maxY: component.minY + valleyIndex - 1 },
          { minX: component.minX, minY: component.minY + valleyIndex + 1, maxX: component.maxX, maxY: component.maxY }
        ]
      };
}

function findBestValleyIndex(counts, margin) {
  let bestIndex = -1;
  let bestValue = Number.POSITIVE_INFINITY;
  for (let index = margin; index < counts.length - margin; index += 1) {
    if (counts[index] < bestValue) {
      bestValue = counts[index];
      bestIndex = index;
    }
  }
  return bestIndex;
}

function sumRange(values, start, end) {
  if (end < start) {
    return 0;
  }
  let sum = 0;
  for (let index = start; index <= end; index += 1) {
    sum += values[index];
  }
  return sum;
}

function sortComponents(components) {
  return components.sort((left, right) => {
    const rowThreshold = Math.max(left.height, right.height) * 0.45;
    if (Math.abs(left.minY - right.minY) < rowThreshold) {
      return left.minX - right.minX;
    }
    return left.minY - right.minY;
  });
}

function sampleArea(imageData, mask, startX, startY, endX, endY) {
  const { data, width, height } = imageData;
  const x0 = Math.max(0, Math.floor(startX));
  const y0 = Math.max(0, Math.floor(startY));
  const x1 = Math.min(width - 1, Math.ceil(endX));
  const y1 = Math.min(height - 1, Math.ceil(endY));

  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (!mask[y * width + x]) {
        continue;
      }
      const pixelIndex = (y * width + x) * 4;
      const alpha = data[pixelIndex + 3] / 255;
      if (alpha < 0.08) {
        continue;
      }
      r += data[pixelIndex] * alpha;
      g += data[pixelIndex + 1] * alpha;
      b += data[pixelIndex + 2] * alpha;
      weight += alpha;
    }
  }

  if (!weight) {
    return null;
  }

  return {
    r: r / weight,
    g: g / weight,
    b: b / weight,
    alpha: Math.min(255, weight * 32)
  };
}

function nearestPaletteColor(color, palette) {
  let best = palette[0];
  let distance = Number.POSITIVE_INFINITY;

  palette.forEach((hex) => {
    const rgb = hexToRgb(hex);
    const currentDistance = colorDistanceSq(color, rgb);
    if (currentDistance < distance) {
      distance = currentDistance;
      best = hex;
    }
  });

  return best;
}

function applyOutline(rgba, occupied, width, height, outlineHex) {
  const outlineColor = hexToRgb(outlineHex);
  const original = occupied.slice();

  for (let index = 0; index < occupied.length; index += 1) {
    if (original[index]) {
      continue;
    }

    const x = index % width;
    const y = Math.floor(index / width);
    let shouldOutline = false;

    for (let dy = -1; dy <= 1 && !shouldOutline; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) {
          continue;
        }
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        if (original[ny * width + nx]) {
          shouldOutline = true;
          break;
        }
      }
    }

    if (!shouldOutline) {
      continue;
    }

    const pixelIndex = index * 4;
    rgba[pixelIndex] = outlineColor.r;
    rgba[pixelIndex + 1] = outlineColor.g;
    rgba[pixelIndex + 2] = outlineColor.b;
    rgba[pixelIndex + 3] = 255;
  }
}

function renderSourceListLegacy() {
  /*

  if (!files.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = UI_TEXT.sourceEmpty;
    dom.sourceList.appendChild(empty);
    return;
  }

  files.forEach((source) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `source-card${source.id === state.previewSourceId ? " active" : ""}`;
    button.addEventListener("click", () => {
      state.previewSourceId = source.id;
      renderSourceList(state.files);
      drawSourcePreview(source);
    });

    const title = document.createElement("h3");
    title.textContent = source.fileName;

    const summary = document.createElement("p");
    if (source.components) {
      summary.textContent = `识别出 ${source.components.length} 个物件，背景 ${source.detectedBackground}。`;
    } else {
      summary.textContent = `原图尺寸 ${source.width} x ${source.height}，等待处理。`;
    }

    const meta = document.createElement("div");
    meta.className = "source-meta";
    meta.textContent = source.components
      ? `输出模式 ${dom.assetMode.value === "single" ? "单件" : "拆分"}`
      : "点击后可预览原图";

    button.append(title, summary, meta);
    dom.sourceList.appendChild(button);
  });
}

  */
}

function renderSourceListBroken() {
  /*
  dom.sourceList.innerHTML = "";

  if (!files.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Uploaded source images will appear here.";
    dom.sourceList.appendChild(empty);
    return;
  }

  files.forEach((source) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `source-card${source.id === state.previewSourceId ? " active" : ""}`;
    button.addEventListener("click", () => {
      state.previewSourceId = source.id;
      renderSourceList(state.files);
      drawSourcePreview(source);
    });

    const title = document.createElement("h3");
    title.textContent = source.fileName;

    const summary = document.createElement("p");
    if (source.components) {
      summary.textContent = `识别出 ${source.components.length} 个物件，背景模型为 ${source.detectedBackground}。`;
    } else {
      summary.textContent = `原图尺寸 ${source.width} x ${source.height}，等待处理。`;
    }

    const meta = document.createElement("div");
    meta.className = "source-meta";
    meta.textContent = source.components
      ? `模式：${dom.assetMode.value === "single" ? "单件" : "拆分"}`
      : UI_TEXT.sourcePreviewHint;

    button.append(title, summary, meta);
    dom.sourceList.appendChild(button);
  });
}

  */
}

function renderSourceListDeprecated() {
  /*
  dom.sourceList.innerHTML = "";

  if (!files.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "上传后的源素材会显示在这里。";
    dom.sourceList.appendChild(empty);
    return;
  }

  files.forEach((source) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `source-card${source.id === state.previewSourceId ? " active" : ""}`;
    button.addEventListener("click", () => {
      state.previewSourceId = source.id;
      renderSourceList(state.files);
      drawSourcePreview(source);
    });

    const title = document.createElement("h3");
    title.textContent = source.fileName;

    const summary = document.createElement("p");
    if (source.components) {
      summary.textContent = `识别出 ${source.components.length} 个物件，背景模型为 ${source.detectedBackground}。`;
    } else {
      summary.textContent = `原图尺寸 ${source.width} x ${source.height}，等待处理。`;
    }

    const meta = document.createElement("div");
    meta.className = "source-meta";
    meta.textContent = source.components
      ? `模式：${dom.assetMode.value === "single" ? "单件" : "拆分"}`
      : "点击可预览原图";

    button.append(title, summary, meta);
    dom.sourceList.appendChild(button);
  });
}

  */
}

function renderSourceList(files) {
  dom.sourceList.innerHTML = "";

  if (!files.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = UI_TEXT.sourceEmpty;
    dom.sourceList.appendChild(empty);
    return;
  }

  files.forEach((source) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `source-card${source.id === state.previewSourceId ? " active" : ""}`;
    button.addEventListener("click", () => {
      state.previewSourceId = source.id;
      renderSourceList(state.files);
      drawSourcePreview(source);
    });

    const title = document.createElement("h3");
    title.textContent = source.fileName;

    const summary = document.createElement("p");
    if (source.components) {
      summary.textContent = `识别出 ${source.components.length} 个物件，背景模型为 ${source.detectedBackground}。`;
    } else {
      summary.textContent = `原图尺寸 ${source.width} x ${source.height}，等待处理。`;
    }

    const meta = document.createElement("div");
    meta.className = "source-meta";
    meta.textContent = source.components
      ? `模式：${dom.assetMode.value === "single" ? "单件" : "拆分"}`
      : UI_TEXT.sourcePreviewHint;

    button.append(title, summary, meta);
    dom.sourceList.appendChild(button);
  });
}

function drawSourcePreview(source) {
  if (!source) {
    renderEmptyPreview();
    return;
  }

  const canvas = dom.sourceCanvas;
  canvas.width = source.image.width;
  canvas.height = source.image.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source.image, 0, 0);

  if (!source.components || !source.components.length) {
    return;
  }

  const lineWidth = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) / 220));
  const fontSize = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) / 36));
  ctx.lineWidth = lineWidth;
  ctx.font = `bold ${fontSize}px "Trebuchet MS", sans-serif`;
  ctx.textBaseline = "top";

  source.components.forEach((component, index) => {
    ctx.strokeStyle = "rgba(93, 139, 80, 0.96)";
    ctx.strokeRect(
      component.minX - 1,
      component.minY - 1,
      component.width + 2,
      component.height + 2
    );

    const label = String(index + 1);
    const labelWidth = ctx.measureText(label).width + 12;
    const labelX = component.minX;
    const labelY = Math.max(0, component.minY - fontSize - 8);

    ctx.fillStyle = "rgba(93, 139, 80, 0.96)";
    ctx.fillRect(labelX, labelY, labelWidth, fontSize + 6);
    ctx.fillStyle = "#fff8ef";
    ctx.fillText(label, labelX + 6, labelY + 3);
  });
}

function renderEmptyPreviewDeprecated() {
  /*
  const canvas = dom.sourceCanvas;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f9f1df";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#9a7a63";
  ctx.font = "20px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(UI_TEXT.sourceCanvasHint, canvas.width / 2, canvas.height / 2);
  ctx.textAlign = "left";
}

function renderRoomTemplate() {
  if (!state.homeSceneReady) {
    return;
  }

  const room = getCurrentRoom();
  const slot = getCurrentSlot();
  const canvas = dom.roomCanvas;
  const tile = 14;
  const padding = 18;
  const bounds = getHomeBounds();

  canvas.width = bounds.width * tile + padding * 2;
  canvas.height = bounds.height * tile + padding * 2;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f4ead8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let x = 0; x < canvas.width; x += tile) {
    for (let y = 0; y < canvas.height; y += tile) {
      if (((x / tile) + (y / tile)) % 2 === 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
        ctx.fillRect(x, y, tile, tile);
      }
    }
  }

  Object.entries(ROOM_TEMPLATES).forEach(([roomId, template]) => {
    const offset = HOME_LAYOUT[roomId] || { x: 0, y: 0 };
    const roomX = padding + offset.x * tile;
    const roomY = padding + offset.y * tile;
    const roomWidth = template.grid.width * tile;
    const roomHeight = template.grid.height * tile;
    const wallHeight = roomId === "terrace" ? tile * 5 : tile * 3;
    const isFocusedRoom = roomId === state.roomId;

    if (roomId === "terrace") {
      ctx.fillStyle = "#c9e7f5";
      ctx.fillRect(roomX, roomY, roomWidth, wallHeight);
      ctx.fillStyle = template.colors.floor;
      ctx.fillRect(roomX, roomY + wallHeight, roomWidth, roomHeight - wallHeight);
      ctx.fillStyle = "#8c6b56";
      ctx.fillRect(roomX, roomY + wallHeight, roomWidth, tile);
    } else {
      ctx.fillStyle = template.colors.wall;
      ctx.fillRect(roomX, roomY, roomWidth, wallHeight);
      ctx.fillStyle = template.colors.floor;
      ctx.fillRect(roomX, roomY + wallHeight, roomWidth, roomHeight - wallHeight);
    }

    ctx.strokeStyle = isFocusedRoom ? template.colors.accent : "#6b5447";
    ctx.lineWidth = isFocusedRoom ? 4 : 3;
    ctx.strokeRect(roomX + 1, roomY + 1, roomWidth - 2, roomHeight - 2);

    ctx.strokeStyle = "rgba(89, 64, 46, 0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= template.grid.width; x += 1) {
      ctx.beginPath();
      ctx.moveTo(roomX + x * tile + 0.5, roomY);
      ctx.lineTo(roomX + x * tile + 0.5, roomY + roomHeight);
      ctx.stroke();
    }
    for (let y = 0; y <= template.grid.height; y += 1) {
      ctx.beginPath();
      ctx.moveTo(roomX, roomY + y * tile + 0.5);
      ctx.lineTo(roomX + roomWidth, roomY + y * tile + 0.5);
      ctx.stroke();
    }

    template.slots.forEach((item) => {
      const placedAsset = getPlacedAssetForSlot(roomId, item.id);
      const isActive = roomId === state.roomId && item.id === slot.id;
      const px = roomX + item.x * tile;
      const py = roomY + item.y * tile;
      const width = item.width * tile;
      const height = item.height * tile;

      ctx.fillStyle = placedAsset ? "rgba(109, 130, 88, 0.22)" : "rgba(109, 130, 88, 0.12)";
      ctx.fillRect(px, py, width, height);

      if (placedAsset) {
        ctx.drawImage(placedAsset.canvas, px + 2, py + 2, Math.max(2, width - 4), Math.max(2, height - 4));
      }

      ctx.strokeStyle = isActive ? "#a85b41" : placedAsset ? "#4f6c44" : "#6d8258";
      ctx.lineWidth = isActive ? 3 : 2;
      ctx.strokeRect(px + 1, py + 1, width - 2, height - 2);
    });

    const filledCount = template.slots.filter((item) => getPlacedAssetForSlot(roomId, item.id)).length;
    const labelWidth = Math.min(roomWidth - 12, 128);
    ctx.fillStyle = template.colors.accent;
    ctx.fillRect(roomX + 8, roomY + 8, labelWidth, 18);
    ctx.fillStyle = "#fff8ed";
    ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
    ctx.textBaseline = "top";
    ctx.fillText(`${template.label} ${filledCount}/${template.slots.length}`, roomX + 12, roomY + 12);
  });

  const filledSlots = room.slots.filter((item) => getPlacedAssetForSlot(state.roomId, item.id)).length;
  dom.roomTitle.textContent = `${room.label} Focus`;
  dom.roomSummary.textContent = `${room.summary} ${filledSlots}/${room.slots.length} slots are filled here. New furniture will default to ${slot.label} (${slot.width}x${slot.height}).`;
  renderRoomSlotList(room, slot);
}

}

  */
}

function renderEmptyPreview() {
  const canvas = dom.sourceCanvas;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f9f1df";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#9a7a63";
  ctx.font = "20px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(UI_TEXT.sourceCanvasHint, canvas.width / 2, canvas.height / 2);
  ctx.textAlign = "left";
}

function renderRoomTemplate() {
  if (!state.homeSceneReady) {
    return;
  }

  const room = getCurrentRoom();
  const slot = getCurrentSlot();
  const canvas = dom.roomCanvas;
  const tile = 12;
  const padding = 28;
  const bounds = getHomeBounds();

  canvas.width = bounds.width * tile + padding * 2;
  canvas.height = bounds.height * tile + padding * 2;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1a120d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let x = 0; x < canvas.width; x += tile) {
    for (let y = 0; y < canvas.height; y += tile) {
      if (((x / tile) + (y / tile)) % 2 === 0) {
        ctx.fillStyle = "rgba(255, 240, 220, 0.03)";
        ctx.fillRect(x, y, tile, tile);
      }
    }
  }

  ctx.fillStyle = "rgba(255, 214, 166, 0.06)";
  ctx.fillRect(padding - tile, padding - tile, bounds.width * tile + tile * 2, bounds.height * tile + tile * 2);

  HOME_PASSAGES.forEach((passage) => {
    drawStyledBlock(
      ctx,
      {
        ...passage,
        kind: "passage",
        wallThickness: tile * 0.65,
        lineWidth: 2,
        strokeStyle: "#765845"
      },
      tile,
      padding
    );
  });

  Object.entries(ROOM_TEMPLATES).forEach(([roomId, template]) => {
    const offset = HOME_LAYOUT[roomId] || { x: 0, y: 0 };
    const isFocusedRoom = roomId === state.roomId;
    const roomRect = drawStyledBlock(
      ctx,
      {
        id: roomId,
        x: offset.x,
        y: offset.y,
        width: template.grid.width,
        height: template.grid.height,
        kind: "room",
        colors: template.colors,
        openings: ROOM_OPENINGS[roomId] || [],
        shellColor: roomId === "terrace" ? "#678a6c" : adjustHex(template.colors.accent, -20),
        lineWidth: isFocusedRoom ? 4 : 3,
        strokeStyle: isFocusedRoom ? template.colors.accent : "#6b5447"
      },
      tile,
      padding
    );

    template.slots.forEach((item) => {
      const placedAsset = getPlacedAssetForSlot(roomId, item.id);
      const isActive = roomId === state.roomId && item.id === slot.id;
      const scaleX = roomRect.floorWidth / (template.grid.width * tile);
      const scaleY = roomRect.floorHeight / (template.grid.height * tile);
      const px = roomRect.floorX + item.x * tile * scaleX;
      const py = roomRect.floorY + item.y * tile * scaleY;
      const width = item.width * tile * scaleX;
      const height = item.height * tile * scaleY;

      ctx.fillStyle = placedAsset ? "rgba(109, 130, 88, 0.24)" : "rgba(109, 130, 88, 0.12)";
      ctx.fillRect(px, py, width, height);

      if (placedAsset) {
        ctx.drawImage(placedAsset.canvas, px + 2, py + 2, Math.max(2, width - 4), Math.max(2, height - 4));
      }

      ctx.strokeStyle = isActive ? "#a85b41" : placedAsset ? "#4f6c44" : "#6d8258";
      ctx.lineWidth = isActive ? 3 : 2;
      ctx.strokeRect(px + 1, py + 1, width - 2, height - 2);
    });

    const filledCount = template.slots.filter((item) => getPlacedAssetForSlot(roomId, item.id)).length;
    const labelWidth = Math.min(roomRect.width - 16, 154);
    ctx.fillStyle = template.colors.accent;
    ctx.fillRect(roomRect.x + 8, roomRect.y + 8, labelWidth, 20);
    ctx.fillStyle = "#fff8ed";
    ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
    ctx.textBaseline = "top";
    ctx.fillText(`${template.label} ${filledCount}/${template.slots.length}`, roomRect.x + 12, roomRect.y + 12);
  });

  const filledSlots = room.slots.filter((item) => getPlacedAssetForSlot(state.roomId, item.id)).length;
  dom.roomTitle.textContent = `${room.label}（当前焦点）`;
  dom.roomSummary.textContent = `${room.summary} 这个房间已放置 ${filledSlots}/${room.slots.length} 个槽位，新生成家具默认进入 ${slot.label}（${slot.width}x${slot.height}）。`;
  renderRoomSlotList(room, slot);
}

function renderRoomSlotList(room, activeSlot) {
  dom.roomSlotList.innerHTML = "";
  room.slots.forEach((slot) => {
    const li = document.createElement("li");
    const placedAsset = getPlacedAssetForSlot(state.roomId, slot.id);
    if (slot.id === activeSlot.id) {
      li.className = "active";
    }
    li.textContent = placedAsset
      ? `${slot.label} / ${slot.width}x${slot.height} / 已摆放：${placedAsset.fileName}`
      : `${slot.label} / ${slot.width}x${slot.height} / 空位 / ${slot.note}`;
    dom.roomSlotList.appendChild(li);
  });
}

function getCurrentRoom() {
  return getRoomById(state.roomId);
}

function getCurrentSlot() {
  return getSlotById(state.roomId, state.slotId);
}

function resolveFootprintCanvasSize(footprint, maxSide) {
  const longestSide = Math.max(footprint.width, footprint.height);
  const pixelsPerTile = Math.max(1, Math.floor(maxSide / longestSide));
  return {
    width: footprint.width * pixelsPerTile,
    height: footprint.height * pixelsPerTile,
    pixelsPerTile
  };
}

function renderPalette(palette) {
  dom.paletteSwatches.innerHTML = "";

  if (!palette.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = UI_TEXT.paletteEmpty;
    dom.paletteSwatches.appendChild(empty);
    return;
  }

  palette.forEach((color, index) => {
    const swatch = document.createElement("div");
    swatch.className = "swatch";

    const chip = document.createElement("div");
    chip.className = "swatch-chip";
    chip.style.background = color;

    const label = document.createElement("div");
    label.className = "swatch-label";
    label.textContent = `#${index + 1}`;

    swatch.append(chip, label);
    dom.paletteSwatches.appendChild(swatch);
  });
}

function renderAssets(assets) {
  dom.assetGrid.innerHTML = "";

  if (!assets.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = UI_TEXT.assetEmpty;
    dom.assetGrid.appendChild(empty);
    return;
  }

  assets.forEach((asset) => {
    const card = document.createElement("article");
    card.className = "asset-card";

    const preview = document.createElement("div");
    preview.className = "asset-preview";
    preview.appendChild(asset.canvas);

    const title = document.createElement("h3");
    title.textContent = asset.fileName;

    const description = document.createElement("p");
    description.textContent = buildAssetDescription(asset);

    let placement = null;
    if (asset.kind === "furniture") {
      placement = document.createElement("div");
      placement.className = "asset-placement";

      const roomField = document.createElement("label");
      roomField.className = "asset-field";
      const roomCaption = document.createElement("span");
      roomCaption.textContent = "房间";
      const roomSelect = document.createElement("select");
      populateRoomSelect(roomSelect, asset.roomId || state.roomId);

      const slotField = document.createElement("label");
      slotField.className = "asset-field";
      const slotCaption = document.createElement("span");
      slotCaption.textContent = "槽位";
      const slotSelect = document.createElement("select");
      populateAssetSlotOptions(slotSelect, roomSelect.value, asset.slotId || state.slotId);

      roomSelect.addEventListener("change", () => {
        const nextSlot = getSlotById(roomSelect.value, asset.slotId || state.slotId);
        assignAssetPlacement(asset, roomSelect.value, nextSlot.id);
        populateAssetSlotOptions(slotSelect, asset.roomId, asset.slotId);
        description.textContent = buildAssetDescription(asset);
        renderRoomTemplate();
        updateMeta();
      });

      slotSelect.addEventListener("change", () => {
        assignAssetPlacement(asset, roomSelect.value, slotSelect.value);
        populateAssetSlotOptions(slotSelect, asset.roomId, asset.slotId);
        description.textContent = buildAssetDescription(asset);
        renderRoomTemplate();
        updateMeta();
      });

      roomField.append(roomCaption, roomSelect);
      slotField.append(slotCaption, slotSelect);
      placement.append(roomField, slotField);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "下载 PNG";
    button.addEventListener("click", () => {
      downloadCanvas(asset.canvas, asset.fileName);
    });

    if (placement) {
      card.append(preview, title, description, placement, button);
    } else {
      card.append(preview, title, description, button);
    }
    dom.assetGrid.appendChild(card);
  });
}

function updateMeta() {
  dom.metaList.innerHTML = "";
  const room = getCurrentRoom();
  const slot = getCurrentSlot();
  const furnitureCount = state.assets.filter((asset) => asset.kind === "furniture").length;
  const characterCount = state.assets.filter((asset) => asset.kind === "character").length;
  const totalSlots = Object.values(ROOM_TEMPLATES).reduce((sum, roomTemplate) => sum + roomTemplate.slots.length, 0);
  const rows = [
    `当前批次：${state.files.length} 张素材`,
    `家园库：${state.assets.length} 件（家具 ${furnitureCount} / 人物 ${characterCount}）`,
    `已填充槽位：${countFilledSlots()} / ${totalSlots}`,
    `当前焦点房间：${room.label}`,
    `新家具默认槽位：${slot.label} ${slot.width}x${slot.height}`,
    `统一色板：${state.palette.length} 色`
  ];

  rows.forEach((row) => {
    const li = document.createElement("li");
    li.textContent = row;
    dom.metaList.appendChild(li);
  });
}

function updateStatus(text) {
  dom.statusText.textContent = text;
}

function getPreviewSource() {
  return state.files.find((source) => source.id === state.previewSourceId) || state.files[0] || null;
}

async function downloadZip() {
  if (!state.assets.length) {
    updateStatus(UI_TEXT.statusNeedZip);
    return;
  }

  updateStatus("正在打包家园库 ZIP...");
  const prefix = sanitizePrefix(dom.namePrefix.value) || "furniture-batch";

  const entries = await Promise.all(
    state.assets.map(async (asset) => ({
      name: asset.fileName,
      data: await canvasToPngBytes(asset.canvas)
    }))
  );

  const sheetCanvas = buildSheetCanvas();
  entries.push({
    name: `${prefix}-sheet.png`,
    data: await canvasToPngBytes(sheetCanvas)
  });
  entries.push({
    name: `${prefix}-manifest.json`,
    data: new TextEncoder().encode(JSON.stringify(buildBatchManifest(), null, 2))
  });

  const zipBlob = createZip(entries);
  downloadBlob(zipBlob, `${prefix}.zip`);
  updateStatus(`ZIP 已准备好，包含 ${state.assets.length} 张 PNG、一张图集和一份家园清单。`);
}

function downloadSheet() {
  if (!state.assets.length) {
    updateStatus(UI_TEXT.statusNeedSheet);
    return;
  }

  const prefix = sanitizePrefix(dom.namePrefix.value) || "furniture-batch";
  const sheetCanvas = buildSheetCanvas();
  downloadCanvas(sheetCanvas, `${prefix}-sheet.png`);
}

function buildSheetCanvas() {
  const cellWidth = Math.max(...state.assets.map((asset) => asset.canvas.width)) + 8;
  const cellHeight = Math.max(...state.assets.map((asset) => asset.canvas.height)) + 8;
  const columns = Math.ceil(Math.sqrt(state.assets.length));
  const rows = Math.ceil(state.assets.length / columns);
  const sheet = document.createElement("canvas");
  sheet.width = columns * cellWidth;
  sheet.height = rows * cellHeight;

  const ctx = sheet.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, sheet.width, sheet.height);

  state.assets.forEach((asset, index) => {
    const x = (index % columns) * cellWidth + Math.floor((cellWidth - asset.canvas.width) / 2);
    const y = Math.floor(index / columns) * cellHeight + Math.floor((cellHeight - asset.canvas.height) / 2);
    ctx.drawImage(asset.canvas, x, y);
  });

  return sheet;
}

function buildBatchManifest() {
  const focusRoom = getCurrentRoom();
  const focusSlot = getCurrentSlot();
  const totalSlots = Object.values(ROOM_TEMPLATES).reduce((sum, room) => sum + room.slots.length, 0);
  return {
    generatedAt: new Date().toISOString(),
    focus: {
      roomId: state.roomId,
      slotId: state.slotId,
      roomLabel: focusRoom.label,
      slotLabel: focusSlot.label
    },
    homeLayout: HOME_LAYOUT,
    librarySummary: {
      totalAssets: state.assets.length,
      furnitureAssets: state.assets.filter((asset) => asset.kind === "furniture").length,
      characterAssets: state.assets.filter((asset) => asset.kind === "character").length,
      filledSlots: countFilledSlots(),
      totalSlots
    },
    rooms: Object.entries(ROOM_TEMPLATES).map(([roomId, room]) => ({
      id: roomId,
      label: room.label,
      grid: room.grid,
      colors: room.colors,
      slots: room.slots.map((roomSlot) => {
        const placedAsset = getPlacedAssetForSlot(roomId, roomSlot.id);
        return {
          ...roomSlot,
          placedAssetId: placedAsset ? placedAsset.id : null,
          placedFileName: placedAsset ? placedAsset.fileName : null
        };
      })
    })),
    assets: state.assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      fileName: asset.fileName,
      sourceName: asset.sourceName,
      roomId: asset.roomId || null,
      roomLabel: asset.roomLabel || null,
      slotId: asset.slotId || null,
      slotLabel: asset.slotLabel || null,
      footprint: asset.footprint || null,
      placementFootprint: asset.placementFootprint || null,
      placementOrder: asset.placementOrder || null,
      pixelsPerTile: asset.pixelsPerTile || null,
      canvasSize: {
        width: asset.canvas.width,
        height: asset.canvas.height
      },
      sourceBounds: {
        width: asset.width,
        height: asset.height
      }
    }))
  };
}

async function canvasToPngBytes(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

function createZip(entries) {
  const encoder = new TextEncoder();
  const records = [];
  const centralDirectory = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const dos = toDosDateTime(new Date());
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dos.time, true);
    localView.setUint16(12, dos.date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    records.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dos.time, true);
    centralView.setUint16(14, dos.date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralDirectory.push(centralHeader);
    offset += localHeader.length + entry.data.length;
  });

  const centralSize = centralDirectory.reduce((sum, item) => sum + item.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...records, ...centralDirectory, endRecord], {
    type: "application/zip"
  });
}

function toDosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  };
}

function downloadCanvas(canvas, fileName) {
  canvas.toBlob((blob) => {
    downloadBlob(blob, fileName);
  }, "image/png");
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadFileEntry(file, index) {
  const objectUrl = URL.createObjectURL(file);
  const image = await loadImage(objectUrl);
  URL.revokeObjectURL(objectUrl);

  return {
    id: `source-${Date.now()}-${index}`,
    fileName: file.name,
    baseName: stripExtension(file.name),
    width: image.width,
    height: image.height,
    image
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function stripProcessingPayload(source) {
  return {
    id: source.id,
    fileName: source.fileName,
    baseName: source.baseName,
    width: source.width,
    height: source.height,
    image: source.image,
    detectedBackground: source.detectedBackground,
    components: source.components
  };
}

function suggestPrefix(files) {
  if (!files.length) {
    return "farm-furniture";
  }
  if (files.length === 1) {
    return sanitizePrefix(files[0].baseName) || "farm-furniture";
  }
  return "farm-furniture";
}

function sanitizePrefix(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function stripExtension(name) {
  return name.replace(/\.[^.]+$/, "");
}

function sampleBorderPixels(width, height) {
  const points = [];
  const stepX = Math.max(1, Math.floor(width / 10));
  const stepY = Math.max(1, Math.floor(height / 10));

  for (let x = 0; x < width; x += stepX) {
    points.push({ x, y: 0 }, { x, y: height - 1 });
  }

  for (let y = 0; y < height; y += stepY) {
    points.push({ x: 0, y }, { x: width - 1, y });
  }

  return points;
}

function seedBorderQueue(width, height, callback) {
  for (let x = 0; x < width; x += 1) {
    callback(x, 0);
    callback(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    callback(0, y);
    callback(width - 1, y);
  }
}

function computeBorderAverage(imageData) {
  const { data, width } = imageData;
  const samples = sampleBorderPixels(imageData.width, imageData.height);
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  samples.forEach((point) => {
    const index = (point.y * width + point.x) * 4;
    const alpha = data[index + 3];
    if (alpha < 16) {
      return;
    }
    r += data[index];
    g += data[index + 1];
    b += data[index + 2];
    count += 1;
  });

  if (!count) {
    return { r: 255, g: 255, b: 255 };
  }

  return {
    r: r / count,
    g: g / count,
    b: b / count
  };
}

function runKMeans(samples, targetCount) {
  const centroids = [];
  const stride = Math.max(1, Math.floor(samples.length / targetCount));

  for (let index = 0; index < targetCount; index += 1) {
    centroids.push({
      ...samples[Math.min(index * stride, samples.length - 1)]
    });
  }

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const buckets = centroids.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));

    samples.forEach((sample) => {
      let nearest = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      centroids.forEach((centroid, index) => {
        const distance = colorDistanceSq(sample, centroid);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = index;
        }
      });

      buckets[nearest].r += sample.r;
      buckets[nearest].g += sample.g;
      buckets[nearest].b += sample.b;
      buckets[nearest].count += 1;
    });

    centroids.forEach((centroid, index) => {
      const bucket = buckets[index];
      if (!bucket.count) {
        return;
      }
      centroid.r = bucket.r / bucket.count;
      centroid.g = bucket.g / bucket.count;
      centroid.b = bucket.b / bucket.count;
    });
  }

  return centroids;
}

function dedupeColors(colors) {
  const seen = new Set();
  const deduped = [];

  colors.forEach((color) => {
    const hex = typeof color === "string" ? color.toLowerCase() : rgbToHex(color);
    if (seen.has(hex)) {
      return;
    }
    seen.add(hex);
    deduped.push(hex);
  });

  return deduped;
}

function colorDistanceSq(left, right) {
  return (
    (left.r - right.r) * (left.r - right.r) +
    (left.g - right.g) * (left.g - right.g) +
    (left.b - right.b) * (left.b - right.b)
  );
}

function rgbToHex(color) {
  return `#${[color.r, color.g, color.b]
    .map((value) => clamp(value).toString(16).padStart(2, "0"))
    .join("")}`;
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function luminance(color) {
  return color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[index] = crc >>> 0;
  }
  return table;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

Object.assign(UI_TEXT, {
  roomFocusSuffix: "\uff08\u5f53\u524d\u7126\u70b9\uff09",
  roomSummaryFilledPrefix: "\u8fd9\u4e2a\u623f\u95f4\u5df2\u653e\u7f6e ",
  roomSummaryFilledMiddle: " \u4e2a\u69fd\u4f4d\uff0c\u65b0\u751f\u6210\u5bb6\u5177\u9ed8\u8ba4\u8fdb\u5165 ",
  roomSummaryFilledEnd: "\u3002",
  slotPlacedPrefix: "\u5df2\u6446\u653e\uff1a",
  slotEmptyLabel: "\u7a7a\u4f4d",
  fieldRoom: "\u623f\u95f4",
  fieldSlot: "\u69fd\u4f4d",
  actionDownloadPng: "\u4e0b\u8f7d PNG",
  metaBatch: "\u5f53\u524d\u6279\u6b21\uff1a",
  metaLibrary: "\u5bb6\u56ed\u5e93\uff1a",
  metaFurniture: "\u5bb6\u5177 ",
  metaCharacter: "\u4eba\u7269 ",
  metaFilledSlots: "\u5df2\u586b\u5145\u69fd\u4f4d\uff1a",
  metaFocusRoom: "\u5f53\u524d\u7126\u70b9\u623f\u95f4\uff1a",
  metaDefaultSlot: "\u65b0\u5bb6\u5177\u9ed8\u8ba4\u69fd\u4f4d\uff1a",
  metaPalette: "\u7edf\u4e00\u8272\u677f\uff1a",
  statusPackingZip: "\u6b63\u5728\u6253\u5305\u5bb6\u56ed\u5e93 ZIP...",
  statusZipReadyPrefix: "ZIP \u5df2\u51c6\u5907\u597d\uff0c\u5305\u542b ",
  statusZipReadySuffix: " \u5f20 PNG\u3001\u4e00\u5f20\u56fe\u96c6\u548c\u4e00\u4efd\u5bb6\u56ed\u6e05\u5355\u3002",
  prefixDefault: "\u5bb6\u56ed\u5bb6\u5177",
  sourceCountPrefix: "\u8bc6\u522b\u51fa ",
  sourceCountSuffix: " \u4e2a\u7269\u4ef6",
  sourceBackgroundPrefix: "\u80cc\u666f\uff1a",
  sourceSizePrefix: "\u5c3a\u5bf8 ",
  assetModeSingle: "\u5355\u4ef6",
  assetModeSplit: "\u62c6\u5206"
});

function translateBackgroundMode(mode) {
  const labels = {
    auto: "\u81ea\u52a8\u5224\u65ad",
    white: "\u767d\u5e95",
    transparent: "\u900f\u660e\u5e95"
  };
  return labels[mode] || mode || "\u672a\u77e5";
}

function translateAssetMode(mode) {
  return mode === "split" ? UI_TEXT.assetModeSplit : UI_TEXT.assetModeSingle;
}

function adjustHex(hex, amount) {
  const color = hexToRgb(hex);
  return rgbToHex({
    r: clamp(color.r + amount),
    g: clamp(color.g + amount),
    b: clamp(color.b + amount)
  });
}

function getBlockPattern(blockId) {
  if (!blockId) {
    return "planks";
  }
  if (blockId === "terrace") {
    return "deck";
  }
  if (blockId === "study" || blockId === "attic-gallery") {
    return "tile";
  }
  if (blockId === "companion-room" || blockId === "bedroom") {
    return "woven";
  }
  if (blockId.includes("hall") || blockId.includes("stair")) {
    return "runner";
  }
  return "planks";
}

function paintPatternedFloor(ctx, area, tile, block) {
  const pattern = getBlockPattern(block.id || "");
  const base = block.colors.floor;
  const light = adjustHex(base, 12);
  const dark = adjustHex(base, -12);

  ctx.fillStyle = base;
  ctx.fillRect(area.x, area.y, area.width, area.height);

  const tilesX = Math.max(1, Math.round(area.width / tile));
  const tilesY = Math.max(1, Math.round(area.height / tile));

  for (let y = 0; y < tilesY; y += 1) {
    for (let x = 0; x < tilesX; x += 1) {
      const px = area.x + x * tile;
      const py = area.y + y * tile;
      const w = Math.min(tile, area.x + area.width - px);
      const h = Math.min(tile, area.y + area.height - py);

      if (pattern === "tile") {
        ctx.fillStyle = (x + y) % 2 === 0 ? light : base;
        ctx.fillRect(px, py, w, h);
      } else if (pattern === "woven") {
        ctx.fillStyle = (x % 2 === 0) === (y % 2 === 0) ? light : dark;
        ctx.fillRect(px, py, w, h);
      } else if (pattern === "deck") {
        ctx.fillStyle = x % 2 === 0 ? light : base;
        ctx.fillRect(px, py, w, h);
      } else if (pattern === "runner") {
        ctx.fillStyle = y % 2 === 0 ? dark : base;
        ctx.fillRect(px, py, w, h);
      } else {
        ctx.fillStyle = y % 2 === 0 ? light : base;
        ctx.fillRect(px, py, w, h);
      }
    }
  }

  ctx.strokeStyle = "rgba(63, 42, 28, 0.12)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= tilesX; x += 1) {
    ctx.beginPath();
    ctx.moveTo(area.x + x * tile + 0.5, area.y);
    ctx.lineTo(area.x + x * tile + 0.5, area.y + area.height);
    ctx.stroke();
  }
  for (let y = 0; y <= tilesY; y += 1) {
    ctx.beginPath();
    ctx.moveTo(area.x, area.y + y * tile + 0.5);
    ctx.lineTo(area.x + area.width, area.y + y * tile + 0.5);
    ctx.stroke();
  }
}

function drawStyledBlock(ctx, block, tile, paddingX, paddingY = paddingX) {
  const x = paddingX + block.x * tile;
  const y = paddingY + block.y * tile;
  const width = block.width * tile;
  const height = block.height * tile;
  const isTerrace = block.id === "terrace";
  const shell = block.shellColor || adjustHex(block.colors.accent, -18);
  const shellEdge = adjustHex(shell, -24);
  const wallThickness = clampInt(
    block.wallThickness || (block.kind === "passage" ? tile * 0.65 : tile * 1.2),
    6,
    Math.max(8, Math.floor(Math.min(width, height) / 3))
  );

  const floorArea = {
    x: x + wallThickness,
    y: y + wallThickness,
    width: Math.max(tile, width - wallThickness * 2),
    height: Math.max(tile, height - wallThickness * 2)
  };

  ctx.fillStyle = "rgba(21, 11, 7, 0.28)";
  ctx.fillRect(x + 8, y + 10, width, height);

  ctx.fillStyle = shell;
  ctx.fillRect(x, y, width, height);

  ctx.fillStyle = adjustHex(shell, 10);
  ctx.fillRect(x + 3, y + 3, width - 6, height - 6);

  if (isTerrace) {
    const skyHeight = Math.max(tile * 2, Math.round(floorArea.height * 0.32));
    ctx.fillStyle = "#bde8f4";
    ctx.fillRect(floorArea.x, floorArea.y, floorArea.width, floorArea.height);
    ctx.fillStyle = "#d7f2fb";
    ctx.fillRect(floorArea.x, floorArea.y, floorArea.width, skyHeight);
    ctx.fillStyle = block.colors.floor;
    ctx.fillRect(floorArea.x, floorArea.y + skyHeight, floorArea.width, floorArea.height - skyHeight);
    ctx.fillStyle = adjustHex(block.colors.accent, -8);
    ctx.fillRect(floorArea.x, floorArea.y + skyHeight, floorArea.width, Math.max(4, Math.floor(tile / 2)));
    paintPatternedFloor(
      ctx,
      {
        x: floorArea.x,
        y: floorArea.y + skyHeight + Math.max(4, Math.floor(tile / 2)),
        width: floorArea.width,
        height: Math.max(tile, floorArea.height - skyHeight - Math.max(4, Math.floor(tile / 2)))
      },
      tile,
      block
    );
  } else {
    paintPatternedFloor(ctx, floorArea, tile, block);
  }

  (block.openings || []).forEach((opening) => {
    let cutX = x;
    let cutY = y;
    let cutWidth = wallThickness;
    let cutHeight = wallThickness;

    if (opening.side === "top" || opening.side === "bottom") {
      cutX = x + opening.start * tile;
      cutWidth = opening.size * tile;
      cutY = opening.side === "top" ? y : y + height - wallThickness;
      cutHeight = wallThickness;
    } else {
      cutY = y + opening.start * tile;
      cutHeight = opening.size * tile;
      cutX = opening.side === "left" ? x : x + width - wallThickness;
      cutWidth = wallThickness;
    }

    ctx.fillStyle = isTerrace ? block.colors.floor : adjustHex(block.colors.floor, 6);
    ctx.fillRect(cutX, cutY, cutWidth, cutHeight);

    ctx.fillStyle = "rgba(64, 42, 29, 0.4)";
    if (opening.side === "top") {
      ctx.fillRect(cutX, cutY + cutHeight - 3, cutWidth, 3);
    } else if (opening.side === "bottom") {
      ctx.fillRect(cutX, cutY, cutWidth, 3);
    } else if (opening.side === "left") {
      ctx.fillRect(cutX + cutWidth - 3, cutY, 3, cutHeight);
    } else {
      ctx.fillRect(cutX, cutY, 3, cutHeight);
    }
  });

  ctx.strokeStyle = shellEdge;
  ctx.lineWidth = block.lineWidth || 3;
  ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);

  ctx.strokeStyle = block.strokeStyle || adjustHex(block.colors.accent, -10);
  ctx.lineWidth = 2;
  ctx.strokeRect(floorArea.x + 0.5, floorArea.y + 0.5, floorArea.width - 1, floorArea.height - 1);

  return {
    x,
    y,
    width,
    height,
    floorX: floorArea.x,
    floorY: floorArea.y,
    floorWidth: floorArea.width,
    floorHeight: floorArea.height,
    wallThickness
  };
}

const SELECTOR_ROOM_GRIDS = {
  attic: { width: 12, height: 15 },
  "living-room": { width: 15, height: 18 },
  "companion-room": { width: 13, height: 16 },
  study: { width: 13, height: 16 },
  "user-room": { width: 14, height: 18 },
  bedroom: { width: 14, height: 17 },
  terrace: { width: 14, height: 15 }
};

const FOCUS_ROOM_GRIDS = {
  attic: { width: 18, height: 24 },
  "living-room": { width: 20, height: 24 },
  "companion-room": { width: 18, height: 24 },
  study: { width: 18, height: 24 },
  "user-room": { width: 20, height: 28 },
  bedroom: { width: 19, height: 26 },
  terrace: { width: 20, height: 22 }
};

const COMPACT_HOME_LAYOUT = {
  attic: { x: 18, y: 0 },
  "living-room": { x: 17, y: 18 },
  "companion-room": { x: 1, y: 23 },
  study: { x: 35, y: 23 },
  "user-room": { x: 17, y: 42 },
  bedroom: { x: 35, y: 46 },
  terrace: { x: 17, y: 65 }
};

const COMPACT_HOME_PASSAGES = [
  {
    id: "attic-stair",
    x: 22,
    y: 15,
    width: 4,
    height: 3,
    colors: { floor: "#ac8363", wall: "#e4d0b5", accent: "#7d5b46" },
    openings: [
      { side: "top", start: 0, size: 4 },
      { side: "bottom", start: 0, size: 4 }
    ]
  },
  {
    id: "companion-link",
    x: 14,
    y: 27,
    width: 3,
    height: 4,
    colors: { floor: "#ac8363", wall: "#e4d0b5", accent: "#7d5b46" },
    openings: [
      { side: "left", start: 0, size: 4 },
      { side: "right", start: 0, size: 4 }
    ]
  },
  {
    id: "study-link",
    x: 32,
    y: 27,
    width: 3,
    height: 4,
    colors: { floor: "#ac8363", wall: "#e4d0b5", accent: "#7d5b46" },
    openings: [
      { side: "left", start: 0, size: 4 },
      { side: "right", start: 0, size: 4 }
    ]
  },
  {
    id: "living-user-link",
    x: 22,
    y: 36,
    width: 4,
    height: 6,
    colors: { floor: "#a77d5c", wall: "#e5d2b5", accent: "#7d5b46" },
    openings: [
      { side: "top", start: 0, size: 4 },
      { side: "bottom", start: 0, size: 4 }
    ]
  },
  {
    id: "user-bedroom-link",
    x: 31,
    y: 50,
    width: 4,
    height: 4,
    colors: { floor: "#a77d5c", wall: "#e5d2b5", accent: "#7d5b46" },
    openings: [
      { side: "left", start: 0, size: 4 },
      { side: "right", start: 0, size: 4 }
    ]
  },
  {
    id: "user-terrace-link",
    x: 22,
    y: 60,
    width: 4,
    height: 5,
    colors: { floor: "#a77d5c", wall: "#e5d2b5", accent: "#7d5b46" },
    openings: [
      { side: "top", start: 0, size: 4 },
      { side: "bottom", start: 0, size: 4 }
    ]
  }
];

const ROOM_OPENING_RATIOS = {
  attic: [
    { side: "bottom", start: 0.34, size: 0.32 }
  ],
  "living-room": [
    { side: "top", start: 0.34, size: 0.28 },
    { side: "left", start: 0.44, size: 0.24 },
    { side: "right", start: 0.44, size: 0.24 },
    { side: "bottom", start: 0.34, size: 0.26 }
  ],
  "companion-room": [
    { side: "right", start: 0.28, size: 0.26 }
  ],
  study: [
    { side: "left", start: 0.28, size: 0.26 }
  ],
  "user-room": [
    { side: "top", start: 0.34, size: 0.28 },
    { side: "right", start: 0.42, size: 0.24 },
    { side: "bottom", start: 0.34, size: 0.28 }
  ],
  bedroom: [
    { side: "left", start: 0.22, size: 0.26 }
  ],
  terrace: [
    { side: "top", start: 0.34, size: 0.28 }
  ]
};

function getRoomDisplayGrid(roomId, mode) {
  if (mode === "focus") {
    return FOCUS_ROOM_GRIDS[roomId] || getRoomById(roomId).grid;
  }
  return SELECTOR_ROOM_GRIDS[roomId] || getRoomById(roomId).grid;
}

function buildScaledOpenings(roomId, displayGrid) {
  return (ROOM_OPENING_RATIOS[roomId] || []).map((opening) => {
    const axisLength =
      opening.side === "top" || opening.side === "bottom"
        ? displayGrid.width
        : displayGrid.height;
    const size = clampInt(axisLength * opening.size, 3, Math.max(3, axisLength - 1));
    const maxStart = Math.max(0, axisLength - size);
    const start = clampInt(axisLength * opening.start, 0, maxStart);
    return {
      side: opening.side,
      start,
      size
    };
  });
}

function getCompactHomeBounds() {
  let width = 0;
  let height = 0;

  Object.keys(ROOM_TEMPLATES).forEach((roomId) => {
    const offset = COMPACT_HOME_LAYOUT[roomId] || { x: 0, y: 0 };
    const displayGrid = getRoomDisplayGrid(roomId, "selector");
    width = Math.max(width, offset.x + displayGrid.width);
    height = Math.max(height, offset.y + displayGrid.height);
  });

  COMPACT_HOME_PASSAGES.forEach((passage) => {
    width = Math.max(width, passage.x + passage.width);
    height = Math.max(height, passage.y + passage.height);
  });

  return { width, height };
}

function drawRoomWithContents(ctx, options) {
  const {
    roomId,
    template,
    offset,
    tile,
    paddingX,
    paddingY,
    isFocused,
    activeSlotId,
    labelWidth = 150,
    compactLabel = false,
    displayGrid = template.grid
  } = options;

  const roomRect = drawStyledBlock(
    ctx,
    {
      id: roomId,
      x: offset.x,
      y: offset.y,
      width: displayGrid.width,
      height: displayGrid.height,
      kind: "room",
      colors: template.colors,
      openings: buildScaledOpenings(roomId, displayGrid),
      shellColor: roomId === "terrace" ? "#678a6c" : adjustHex(template.colors.accent, -20),
      lineWidth: isFocused ? 4 : 3,
      strokeStyle: isFocused ? template.colors.accent : "#6b5447"
    },
    tile,
    paddingX,
    paddingY
  );

  const logicalUnitX = roomRect.floorWidth / template.grid.width;
  const logicalUnitY = roomRect.floorHeight / template.grid.height;

  template.slots.forEach((item) => {
    const placedAsset = getPlacedAssetForSlot(roomId, item.id);
    const isActive = roomId === state.roomId && item.id === activeSlotId;
    const px = roomRect.floorX + item.x * logicalUnitX;
    const py = roomRect.floorY + item.y * logicalUnitY;
    const width = item.width * logicalUnitX;
    const height = item.height * logicalUnitY;

    ctx.fillStyle = placedAsset ? "rgba(109, 130, 88, 0.24)" : "rgba(109, 130, 88, 0.12)";
    ctx.fillRect(px, py, width, height);

    if (placedAsset) {
      ctx.drawImage(placedAsset.canvas, px + 2, py + 2, Math.max(2, width - 4), Math.max(2, height - 4));
    }

    ctx.strokeStyle = isActive ? "#a85b41" : placedAsset ? "#4f6c44" : "#6d8258";
    ctx.lineWidth = isActive ? Math.max(2, tile * 0.22) : Math.max(1, tile * 0.16);
    ctx.strokeRect(px + 1, py + 1, width - 2, height - 2);
  });

  const filledCount = template.slots.filter((item) => getPlacedAssetForSlot(roomId, item.id)).length;
  const badgeWidth = Math.min(roomRect.width - 16, labelWidth);
  ctx.fillStyle = template.colors.accent;
  ctx.fillRect(roomRect.x + 8, roomRect.y + 8, badgeWidth, compactLabel ? 16 : 22);
  ctx.fillStyle = "#fff8ed";
  ctx.font = compactLabel ? 'bold 9px "Trebuchet MS", sans-serif' : 'bold 12px "Trebuchet MS", sans-serif';
  ctx.textBaseline = "top";
  ctx.fillText(`${template.label} ${filledCount}/${template.slots.length}`, roomRect.x + 12, roomRect.y + (compactLabel ? 11 : 12));

  return roomRect;
}

function drawDualScreenFrame(ctx, rect, options = {}) {
  const shell = options.shell || "#6e4d3d";
  const shellDark = adjustHex(shell, -24);
  const shellLight = adjustHex(shell, 18);
  const bezel = options.bezel || 12;
  const inner = {
    x: rect.x + bezel,
    y: rect.y + bezel,
    width: rect.width - bezel * 2,
    height: rect.height - bezel * 2
  };

  ctx.fillStyle = shellDark;
  ctx.fillRect(rect.x + 4, rect.y + 6, rect.width, rect.height);

  ctx.fillStyle = shell;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  ctx.fillStyle = shellLight;
  ctx.fillRect(rect.x + 4, rect.y + 4, rect.width - 8, rect.height - 8);

  ctx.fillStyle = options.glass || "#d4aa80";
  ctx.fillRect(inner.x, inner.y, inner.width, inner.height);

  ctx.strokeStyle = "rgba(50, 30, 22, 0.7)";
  ctx.lineWidth = 4;
  ctx.strokeRect(rect.x + 1.5, rect.y + 1.5, rect.width - 3, rect.height - 3);

  ctx.strokeStyle = "rgba(255, 241, 224, 0.28)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(inner.x + 0.5, inner.y + 0.5, inner.width - 1, inner.height - 1);

  return inner;
}

function drawFocusStageFrame(ctx, rect, options = {}) {
  const shell = options.shell || "#704b3d";
  const shellDark = adjustHex(shell, -26);
  const shellLight = adjustHex(shell, 18);
  const bezel = options.bezel || 18;
  const inner = {
    x: rect.x + bezel,
    y: rect.y + bezel,
    width: rect.width - bezel * 2,
    height: rect.height - bezel * 2
  };

  ctx.fillStyle = "rgba(12, 7, 5, 0.26)";
  ctx.fillRect(rect.x + 10, rect.y + 12, rect.width, rect.height);

  ctx.fillStyle = shellDark;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  ctx.fillStyle = shell;
  ctx.fillRect(rect.x + 4, rect.y + 4, rect.width - 8, rect.height - 8);

  ctx.fillStyle = shellLight;
  ctx.fillRect(rect.x + 8, rect.y + 8, rect.width - 16, rect.height - 16);

  ctx.fillStyle = options.glass || "#d6ad86";
  ctx.fillRect(inner.x, inner.y, inner.width, inner.height);

  ctx.strokeStyle = "rgba(54, 33, 24, 0.84)";
  ctx.lineWidth = 4;
  ctx.strokeRect(rect.x + 1.5, rect.y + 1.5, rect.width - 3, rect.height - 3);

  ctx.strokeStyle = "rgba(255, 241, 224, 0.24)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(inner.x + 0.5, inner.y + 0.5, inner.width - 1, inner.height - 1);

  return inner;
}

function paintScreenBackdrop(ctx, rect) {
  ctx.fillStyle = "#cda077";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  ctx.fillStyle = "rgba(255, 239, 214, 0.08)";
  for (let x = rect.x; x < rect.x + rect.width; x += 18) {
    for (let y = rect.y; y < rect.y + rect.height; y += 18) {
      if ((((x - rect.x) / 18) + ((y - rect.y) / 18)) % 2 === 0) {
        ctx.fillRect(x, y, 18, 18);
      }
    }
  }
}

function renderSourceList(files) {
  dom.sourceList.innerHTML = "";

  if (!files.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = UI_TEXT.sourceEmpty;
    dom.sourceList.appendChild(empty);
    return;
  }

  files.forEach((source) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `source-card${source.id === state.previewSourceId ? " active" : ""}`;
    button.addEventListener("click", () => {
      state.previewSourceId = source.id;
      renderSourceList(state.files);
      drawSourcePreview(source);
    });

    const title = document.createElement("h3");
    title.textContent = source.fileName;

    const summary = document.createElement("p");
    if (source.components) {
      summary.textContent = `${UI_TEXT.sourceCountPrefix}${source.components.length}${UI_TEXT.sourceCountSuffix} / ${UI_TEXT.sourceBackgroundPrefix}${translateBackgroundMode(source.detectedBackground)}`;
    } else {
      summary.textContent = `${UI_TEXT.sourceSizePrefix}${source.width} x ${source.height}`;
    }

    const meta = document.createElement("div");
    meta.className = "source-meta";
    meta.textContent = source.components
      ? `${translateAssetMode(dom.assetMode.value)} / ${UI_TEXT.sourcePreviewHint}`
      : UI_TEXT.sourcePreviewHint;

    button.append(title, summary, meta);
    dom.sourceList.appendChild(button);
  });
}

function renderRoomTemplate() {
  if (!state.homeSceneReady) {
    return;
  }

  const room = getCurrentRoom();
  const slot = getCurrentSlot();
  const canvas = dom.roomCanvas;
  const bounds = getCompactHomeBounds();
  const containerWidth = dom.roomCanvas.parentElement?.clientWidth || 360;
  const isPhone = window.innerWidth <= 720 || containerWidth <= 560;
  const framePadding = isPhone ? 14 : 18;
  const canvasWidth = Math.round(Math.max(containerWidth - 4, isPhone ? 340 : 420));
  const canvasHeight = Math.round(canvasWidth * (isPhone ? 1.64 : 1.32));
  const worldFitTile = Math.min(
    (canvasWidth - framePadding * 2) / bounds.width,
    (canvasHeight - 72) / bounds.height
  );
  const worldTile = worldFitTile * state.focusZoom;
  const worldWidth = bounds.width * worldTile;
  const worldHeight = bounds.height * worldTile;
  const stageFrame = {
    x: framePadding,
    y: 34,
    width: canvasWidth - framePadding * 2,
    height: canvasHeight - 48
  };

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1b130f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let x = 0; x < canvas.width; x += 10) {
    for (let y = 0; y < canvas.height; y += 10) {
      if (((x / 10) + (y / 10)) % 2 === 0) {
        ctx.fillStyle = "rgba(255, 238, 214, 0.035)";
        ctx.fillRect(x, y, 10, 10);
      }
    }
  }

  ctx.fillStyle = "rgba(255, 248, 234, 0.08)";
  ctx.fillRect(14, 10, canvas.width - 28, 18);
  ctx.fillStyle = "#f5dfc2";
  ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
  ctx.textBaseline = "top";
  ctx.fillText(`\u5bb6\u56ed\u603b\u89c8 ${state.focusZoom.toFixed(1)}x`, 20, 13);

  const stageViewport = drawFocusStageFrame(ctx, stageFrame, {
    shell: state.roomId === "terrace" ? "#5d7664" : "#704b3d",
    glass: "#d7b08a",
    bezel: isPhone ? 14 : 16
  });

  paintScreenBackdrop(ctx, stageViewport);

  const selectedDisplayGrid = getRoomDisplayGrid(state.roomId, "selector");
  const selectedOffset = COMPACT_HOME_LAYOUT[state.roomId] || { x: 0, y: 0 };
  const selectedCenterX = (selectedOffset.x + selectedDisplayGrid.width / 2) * worldTile;
  const selectedCenterY = (selectedOffset.y + selectedDisplayGrid.height / 2) * worldTile;

  let worldOffsetX = stageViewport.x + stageViewport.width / 2 - selectedCenterX;
  let worldOffsetY = stageViewport.y + stageViewport.height / 2 - selectedCenterY;

  if (worldWidth <= stageViewport.width) {
    worldOffsetX = stageViewport.x + (stageViewport.width - worldWidth) / 2;
  } else {
    const minWorldX = stageViewport.x + stageViewport.width - worldWidth;
    worldOffsetX = Math.min(stageViewport.x, Math.max(minWorldX, worldOffsetX));
  }

  if (worldHeight <= stageViewport.height) {
    worldOffsetY = stageViewport.y + (stageViewport.height - worldHeight) / 2;
  } else {
    const minWorldY = stageViewport.y + stageViewport.height - worldHeight;
    worldOffsetY = Math.min(stageViewport.y, Math.max(minWorldY, worldOffsetY));
  }

  state.roomHitRegions = [];
  state.focusViewport = { ...stageViewport };

  ctx.save();
  ctx.beginPath();
  ctx.rect(stageViewport.x, stageViewport.y, stageViewport.width, stageViewport.height);
  ctx.clip();
  COMPACT_HOME_PASSAGES.forEach((passage) => {
    drawStyledBlock(
      ctx,
      {
        ...passage,
        kind: "passage",
        wallThickness: worldTile * 0.52,
        lineWidth: 2,
        strokeStyle: "#765845"
      },
      worldTile,
      worldOffsetX,
      worldOffsetY
    );
  });

  Object.entries(ROOM_TEMPLATES).forEach(([roomId, template]) => {
    const offset = COMPACT_HOME_LAYOUT[roomId] || { x: 0, y: 0 };
    const isFocusedRoom = roomId === state.roomId;
    const roomRect = drawRoomWithContents(ctx, {
      roomId,
      template,
      offset,
      tile: worldTile,
      paddingX: worldOffsetX,
      paddingY: worldOffsetY,
      isFocused: isFocusedRoom,
      activeSlotId: slot.id,
      labelWidth: Math.min(170, stageViewport.width - 24),
      compactLabel: true,
      displayGrid: getRoomDisplayGrid(roomId, "selector")
    });

    state.roomHitRegions.push({
      roomId,
      x: roomRect.x,
      y: roomRect.y,
      width: roomRect.width,
      height: roomRect.height
    });
  });
  ctx.restore();

  const filledSlots = room.slots.filter((item) => getPlacedAssetForSlot(state.roomId, item.id)).length;
  dom.roomTitle.textContent = `${room.label}${UI_TEXT.roomFocusSuffix}`;
  dom.roomSummary.textContent = `${room.summary} ${UI_TEXT.roomSummaryFilledPrefix}${filledSlots}/${room.slots.length}${UI_TEXT.roomSummaryFilledMiddle}${slot.label} (${slot.width}x${slot.height})${UI_TEXT.roomSummaryFilledEnd} \u7f29\u653e\u7684\u662f\u6574\u5f20\u5bb6\u56ed\u603b\u89c8\uff0c\u4f1a\u4ee5\u5f53\u524d\u623f\u95f4\u4e3a\u4e2d\u5fc3\u653e\u5927\u3002`;
  renderRoomSlotList(room, slot);
  updateZoomHud();
}

function renderRoomSlotList(room, activeSlot) {
  dom.roomSlotList.innerHTML = "";
  room.slots.forEach((slot) => {
    const li = document.createElement("li");
    const placedAsset = getPlacedAssetForSlot(state.roomId, slot.id);
    if (slot.id === activeSlot.id) {
      li.className = "active";
    }
    li.textContent = placedAsset
      ? `${slot.label} / ${slot.width}x${slot.height} / ${UI_TEXT.slotPlacedPrefix}${placedAsset.fileName}`
      : `${slot.label} / ${slot.width}x${slot.height} / ${UI_TEXT.slotEmptyLabel} / ${slot.note}`;
    dom.roomSlotList.appendChild(li);
  });
}

function renderAssets(assets) {
  dom.assetGrid.innerHTML = "";

  if (!assets.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = UI_TEXT.assetEmpty;
    dom.assetGrid.appendChild(empty);
    return;
  }

  assets.forEach((asset) => {
    const card = document.createElement("article");
    card.className = "asset-card";

    const preview = document.createElement("div");
    preview.className = "asset-preview";
    preview.appendChild(asset.canvas);

    const title = document.createElement("h3");
    title.textContent = asset.fileName;

    const description = document.createElement("p");
    description.textContent = buildAssetDescription(asset);

    let placement = null;
    if (asset.kind === "furniture") {
      placement = document.createElement("div");
      placement.className = "asset-placement";

      const roomField = document.createElement("label");
      roomField.className = "asset-field";
      const roomCaption = document.createElement("span");
      roomCaption.textContent = UI_TEXT.fieldRoom;
      const roomSelect = document.createElement("select");
      populateRoomSelect(roomSelect, asset.roomId || state.roomId);

      const slotField = document.createElement("label");
      slotField.className = "asset-field";
      const slotCaption = document.createElement("span");
      slotCaption.textContent = UI_TEXT.fieldSlot;
      const slotSelect = document.createElement("select");
      populateAssetSlotOptions(slotSelect, roomSelect.value, asset.slotId || state.slotId);

      roomSelect.addEventListener("change", () => {
        const nextSlot = getSlotById(roomSelect.value, asset.slotId || state.slotId);
        assignAssetPlacement(asset, roomSelect.value, nextSlot.id);
        populateAssetSlotOptions(slotSelect, asset.roomId, asset.slotId);
        description.textContent = buildAssetDescription(asset);
        renderRoomTemplate();
        updateMeta();
      });

      slotSelect.addEventListener("change", () => {
        assignAssetPlacement(asset, roomSelect.value, slotSelect.value);
        populateAssetSlotOptions(slotSelect, asset.roomId, asset.slotId);
        description.textContent = buildAssetDescription(asset);
        renderRoomTemplate();
        updateMeta();
      });

      roomField.append(roomCaption, roomSelect);
      slotField.append(slotCaption, slotSelect);
      placement.append(roomField, slotField);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = UI_TEXT.actionDownloadPng;
    button.addEventListener("click", () => {
      downloadCanvas(asset.canvas, asset.fileName);
    });

    if (placement) {
      card.append(preview, title, description, placement, button);
    } else {
      card.append(preview, title, description, button);
    }
    dom.assetGrid.appendChild(card);
  });
}

function updateMeta() {
  dom.metaList.innerHTML = "";
  const room = getCurrentRoom();
  const slot = getCurrentSlot();
  const furnitureCount = state.assets.filter((asset) => asset.kind === "furniture").length;
  const characterCount = state.assets.filter((asset) => asset.kind === "character").length;
  const totalSlots = Object.values(ROOM_TEMPLATES).reduce((sum, roomTemplate) => sum + roomTemplate.slots.length, 0);
  const rows = [
    `${UI_TEXT.metaBatch}${state.files.length} \u5f20\u7d20\u6750`,
    `${UI_TEXT.metaLibrary}${state.assets.length} \u4ef6\uff08${UI_TEXT.metaFurniture}${furnitureCount} / ${UI_TEXT.metaCharacter}${characterCount}\uff09`,
    `${UI_TEXT.metaFilledSlots}${countFilledSlots()} / ${totalSlots}`,
    `${UI_TEXT.metaFocusRoom}${room.label}`,
    `${UI_TEXT.metaDefaultSlot}${slot.label} ${slot.width}x${slot.height}`,
    `${UI_TEXT.metaPalette}${state.palette.length} \u8272`
  ];

  rows.forEach((row) => {
    const li = document.createElement("li");
    li.textContent = row;
    dom.metaList.appendChild(li);
  });
}

async function downloadZip() {
  if (!state.assets.length) {
    updateStatus(UI_TEXT.statusNeedZip);
    return;
  }

  updateStatus(UI_TEXT.statusPackingZip);
  const prefix = sanitizePrefix(dom.namePrefix.value) || UI_TEXT.prefixDefault;

  const entries = await Promise.all(
    state.assets.map(async (asset) => ({
      name: asset.fileName,
      data: await canvasToPngBytes(asset.canvas)
    }))
  );

  const sheetCanvas = buildSheetCanvas();
  entries.push({
    name: `${prefix}-sheet.png`,
    data: await canvasToPngBytes(sheetCanvas)
  });
  entries.push({
    name: `${prefix}-manifest.json`,
    data: new TextEncoder().encode(JSON.stringify(buildBatchManifest(), null, 2))
  });

  const zipBlob = createZip(entries);
  downloadBlob(zipBlob, `${prefix}.zip`);
  updateStatus(`${UI_TEXT.statusZipReadyPrefix}${state.assets.length}${UI_TEXT.statusZipReadySuffix}`);
}

function downloadSheet() {
  if (!state.assets.length) {
    updateStatus(UI_TEXT.statusNeedSheet);
    return;
  }

  const prefix = sanitizePrefix(dom.namePrefix.value) || UI_TEXT.prefixDefault;
  const sheetCanvas = buildSheetCanvas();
  downloadCanvas(sheetCanvas, `${prefix}-sheet.png`);
}

function suggestPrefix(files) {
  if (!files.length) {
    return UI_TEXT.prefixDefault;
  }
  if (files.length === 1) {
    return sanitizePrefix(files[0].baseName) || UI_TEXT.prefixDefault;
  }
  return UI_TEXT.prefixDefault;
}

state.homeSceneReady = true;
renderSourceList(state.files);
renderPalette(state.palette);
renderAssets(state.assets);
updateMeta();
renderRoomTemplate();
if (getPreviewSource()) {
  drawSourcePreview(getPreviewSource());
} else {
  renderEmptyPreview();
}
if (!dom.namePrefix.value || dom.namePrefix.value === "farm-furniture") {
  dom.namePrefix.value = UI_TEXT.prefixDefault;
}
dom.namePrefix.placeholder = `\u4f8b\u5982 ${UI_TEXT.prefixDefault}`;

const resultsCopy = document.querySelector(".results .section-head p");
if (resultsCopy) {
  resultsCopy.innerHTML = `\u6bcf\u4ef6\u751f\u6210\u7ed3\u679c\u90fd\u4f1a\u6309\u987a\u5e8f\u547d\u540d\uff0c\u4f8b\u5982 <code>${UI_TEXT.prefixDefault}-001.png</code>\uff0c\u5e76\u4e14\u53ef\u4ee5\u76f4\u63a5\u5728\u5361\u7247\u91cc\u6539\u6446\u653e\u623f\u95f4\u548c\u69fd\u4f4d\u3002`;
}
