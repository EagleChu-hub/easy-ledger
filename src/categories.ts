// 預設分類與關鍵字表（繁中、台灣消費語境）
// 關鍵字比對時不分大小寫；同一輸入命中多個關鍵字時取「最長」的那個

export interface Category {
  key: string;
  label: string;
  emoji: string;
  keywords: string[];
}

export const INCOME_CATEGORY_KEY = 'income';
export const OTHER_CATEGORY_KEY = 'other';

export const DEFAULT_CATEGORIES: Category[] = [
  {
    key: 'food',
    label: '餐飲',
    emoji: '🍜',
    keywords: [
      '早餐', '午餐', '晚餐', '宵夜', '午飯', '晚飯', '便當', '飯', '麵', '餐',
      '咖啡', '飲料', '手搖', '珍奶', '奶茶', '茶',
      '外送', '熊貓', 'foodpanda', 'uber eats', 'ubereats',
      '麥當勞', '肯德基', '摩斯', '星巴克', '路易莎', '85度c', '鼎泰豐', '火鍋', '燒烤', '壽司', '拉麵', '滷味', '雞排', '鹹酥雞',
      '聚餐', '請客', '吃',
    ],
  },
  {
    key: 'transport',
    label: '交通',
    emoji: '🚌',
    keywords: [
      '捷運', '公車', '客運', '火車', '台鐵', '高鐵', '悠遊卡', '一卡通',
      'uber', '計程車', '小黃', '台灣大車隊', 'taxi',
      '加油', '油錢', '停車', '停車費', '過路費', 'etc', '機車', 'youbike', 'ubike', '共享', '租車', '機票',
    ],
  },
  {
    key: 'daily',
    label: '日用',
    emoji: '🧻',
    keywords: [
      '全聯', '家樂福', '大潤發', '愛買', 'costco', '好市多', '美廉社', '寶雅', '屈臣氏', '康是美', '小北',
      '小七', '7-11', '7-eleven', '統一超商', '全家', '萊爾富', 'ok超商', '超商', '便利商店',
      '日用品', '衛生紙', '洗衣精', '沐浴乳', '洗髮精', '牙膏', '菜', '買菜', '水果', '超市', '市場', '雜貨',
    ],
  },
  {
    key: 'subscription',
    label: '訂閱',
    emoji: '📱',
    keywords: [
      'netflix', 'spotify', 'youtube', 'disney', 'apple music', 'icloud', 'chatgpt', 'claude', 'gemini',
      '訂閱', '月費', '會員', '電話費', '手機費', '網路費', '電信', '中華電信', '台灣大哥大', '遠傳',
    ],
  },
  {
    key: 'housing',
    label: '居住',
    emoji: '🏠',
    keywords: ['房租', '租金', '水費', '電費', '水電', '瓦斯', '瓦斯費', '管理費', '房貸', '家具', '修繕'],
  },
  {
    key: 'medical',
    label: '醫療',
    emoji: '💊',
    keywords: ['診所', '醫院', '藥局', '藥', '看醫生', '看病', '掛號', '牙醫', '健保', '保險', '保費', '眼鏡', '按摩', '推拿'],
  },
  {
    key: 'entertainment',
    label: '娛樂',
    emoji: '🎬',
    keywords: ['電影', '遊戲', '課金', 'steam', 'switch', 'ps5', 'ktv', '唱歌', '演唱會', '門票', '展覽', '旅遊', '旅行', '住宿', '飯店', '民宿', '書', '漫畫', '健身', '運動'],
  },
  {
    key: 'shopping',
    label: '購物',
    emoji: '🛍️',
    keywords: ['衣服', '褲子', '鞋', '包包', '蝦皮', 'momo', 'pchome', '淘寶', '網購', '3c', '手機', '耳機', '充電', '禮物', '化妝品', '保養品', 'uniqlo', 'zara', 'ikea'],
  },
  {
    key: OTHER_CATEGORY_KEY,
    label: '其他',
    emoji: '📦',
    keywords: [],
  },
  {
    key: INCOME_CATEGORY_KEY,
    label: '收入',
    emoji: '💰',
    keywords: [],
  },
];

// 命中這些字就視為收入
export const INCOME_KEYWORDS = [
  '薪水', '薪資', '月薪', '收入', '獎金', '年終', '入帳', '退款', '退費', '紅包', '分紅', '利息', '股利', '股息', '中獎', '兼職', '外快', '零用錢', '賣掉', '售出',
];

export function findCategory(key: string, categories: Category[] = DEFAULT_CATEGORIES): Category | undefined {
  return categories.find((c) => c.key === key);
}

export function categoryLabel(key: string, categories: Category[] = DEFAULT_CATEGORIES): string {
  return findCategory(key, categories)?.label ?? key;
}
