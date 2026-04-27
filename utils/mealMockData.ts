// 饭友离线 mock 数据 — 跟 worker/index.js 里的 MEAL_MOCK_* 保持一致。
//
// 用途：用户没装扩展或 Worker 不通时，前端直接用这份占位数据，
// 不再因为网络问题让整个 App 跑不动。**永远会被打成 source: 'static_mock'**，
// char prompt 已经禁止把 mock 当真菜单了，所以不会误导用户。

import { MealItem, MealPlatform, MealStore } from './mealClient';

export const STATIC_MEAL_STORES: Record<MealPlatform, MealStore[]> = {
  eleme: [
    { id: 'e_1001', name: '麦当劳麦麦送（人民广场店）', rating: 4.8, deliveryTime: 28, deliveryFee: 3, minOrder: 20, distance: 0.6, monthlySales: 9999, tags: ['汉堡', '炸鸡', '24小时'], promo: '新客立减 10 元' },
    { id: 'e_1002', name: '兰州牛肉面（南京东路店）', rating: 4.6, deliveryTime: 32, deliveryFee: 2, minOrder: 15, distance: 0.9, monthlySales: 4521, tags: ['面食', '清真'], promo: '满 20 减 4' },
    { id: 'e_1003', name: 'Wagas 沃歌斯（IFC 店）', rating: 4.7, deliveryTime: 35, deliveryFee: 5, minOrder: 30, distance: 1.2, monthlySales: 1832, tags: ['轻食', '沙拉'], promo: '买二送一饮料' },
  ],
  meituan: [
    { id: 'm_2001', name: '海底捞外送', rating: 4.9, deliveryTime: 50, deliveryFee: 8, minOrder: 80, distance: 1.8, monthlySales: 2103, tags: ['火锅'], promo: '满 100 减 15' },
    { id: 'm_2002', name: '塔斯汀中国汉堡（来福士店）', rating: 4.7, deliveryTime: 25, deliveryFee: 3, minOrder: 20, distance: 0.4, monthlySales: 12456, tags: ['汉堡', '国潮'], promo: '新客 0.1 元尝鲜' },
    { id: 'm_2003', name: '杨国福麻辣烫', rating: 4.5, deliveryTime: 30, deliveryFee: 2, minOrder: 18, distance: 0.7, monthlySales: 7890, tags: ['麻辣烫'], promo: '满 30 减 6' },
  ],
  hema: [
    { id: 'h_3001', name: '盒马鲜生（陆家嘴店）', rating: 4.8, deliveryTime: 30, deliveryFee: 0, minOrder: 0, distance: 1.1, monthlySales: 0, tags: ['生鲜', '日日鲜', '半成品菜'], promo: '满 49 包邮' },
  ],
};

export const STATIC_MEAL_MENUS: Record<string, MealItem[]> = {
  e_1001: [
    { id: 'i_e1001_1', name: '巨无霸套餐', price: 39, originalPrice: 45, sales: 8421, tags: ['招牌'], img: null, desc: '巨无霸 + 中薯 + 中可乐' },
    { id: 'i_e1001_2', name: '麦辣鸡腿堡套餐', price: 35, originalPrice: 39, sales: 6210, tags: ['热销'], img: null, desc: '麦辣鸡腿堡 + 中薯 + 可乐' },
    { id: 'i_e1001_3', name: '麦麦脆汁鸡（2 块）', price: 22, originalPrice: 24, sales: 3105, tags: [], img: null, desc: '原味/辣味可选' },
    { id: 'i_e1001_4', name: '麦旋风（OREO）', price: 13, originalPrice: 13, sales: 4302, tags: ['甜品'], img: null, desc: '' },
  ],
  e_1002: [
    { id: 'i_e1002_1', name: '牛肉拉面（细）', price: 22, originalPrice: 22, sales: 2103, tags: ['招牌'], img: null, desc: '现做现拉，汤头清亮' },
    { id: 'i_e1002_2', name: '牛肉拉面（宽）', price: 22, originalPrice: 22, sales: 1844, tags: [], img: null, desc: '' },
    { id: 'i_e1002_3', name: '卤蛋', price: 4, originalPrice: 4, sales: 1320, tags: [], img: null, desc: '' },
    { id: 'i_e1002_4', name: '凉拌黄瓜', price: 8, originalPrice: 8, sales: 998, tags: ['小菜'], img: null, desc: '' },
  ],
  e_1003: [
    { id: 'i_e1003_1', name: '三文鱼牛油果碗', price: 68, originalPrice: 78, sales: 412, tags: ['招牌', '高蛋白'], img: null, desc: '藜麦底 + 烟熏三文鱼 + 牛油果' },
    { id: 'i_e1003_2', name: '鸡胸肉凯撒沙拉', price: 48, originalPrice: 52, sales: 689, tags: ['低卡'], img: null, desc: '' },
  ],
  m_2001: [
    { id: 'i_m2001_1', name: '番茄锅底（小）', price: 38, originalPrice: 38, sales: 521, tags: ['锅底'], img: null, desc: '' },
    { id: 'i_m2001_2', name: '肥牛拼盘', price: 58, originalPrice: 68, sales: 412, tags: ['招牌'], img: null, desc: '200g' },
    { id: 'i_m2001_3', name: '虾滑', price: 38, originalPrice: 38, sales: 388, tags: [], img: null, desc: '' },
  ],
  m_2002: [
    { id: 'i_m2002_1', name: '原味鸡腿堡', price: 16, originalPrice: 18, sales: 6021, tags: ['新客 0.1 元'], img: null, desc: '' },
    { id: 'i_m2002_2', name: '辣翅 4 只', price: 18, originalPrice: 22, sales: 4210, tags: [], img: null, desc: '' },
    { id: 'i_m2002_3', name: '可乐（中）', price: 6, originalPrice: 8, sales: 8210, tags: [], img: null, desc: '' },
  ],
  m_2003: [
    { id: 'i_m2003_1', name: '麻辣烫（按斤称）', price: 28, originalPrice: 28, sales: 2103, tags: ['招牌'], img: null, desc: '约 250g 起' },
    { id: 'i_m2003_2', name: '藤椒鸡片', price: 12, originalPrice: 12, sales: 1024, tags: [], img: null, desc: '' },
  ],
  h_3001: [
    { id: 'i_h3001_1', name: '日日鲜・牛奶 950ml', price: 18, originalPrice: 22, sales: 0, tags: ['日日鲜'], img: null, desc: '当日生产' },
    { id: 'i_h3001_2', name: '半成品菜・宫保鸡丁套餐', price: 32, originalPrice: 38, sales: 0, tags: ['10 分钟出餐'], img: null, desc: '鸡丁 + 调料包 + 配菜' },
    { id: 'i_h3001_3', name: '智利车厘子 J 级 500g', price: 49, originalPrice: 69, sales: 0, tags: ['生鲜'], img: null, desc: '' },
  ],
};

export function staticSearch(platform: MealPlatform, query: string): MealStore[] {
  let stores = STATIC_MEAL_STORES[platform] || [];
  if (query) {
    const q = query.toLowerCase();
    const matched = stores.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.tags || []).some(t => t.toLowerCase().includes(q))
    );
    if (matched.length) stores = matched;
  }
  return stores;
}

export function staticMenu(platform: MealPlatform, storeId: string): {
  store: MealStore | null;
  items: MealItem[];
} {
  const items = STATIC_MEAL_MENUS[storeId] || [];
  const store = (STATIC_MEAL_STORES[platform] || []).find(s => s.id === storeId) || null;
  return { store, items };
}
