import React, { useState, useMemo } from 'react';
import { 
  CreditCard, Coffee, Bus, Film, ShoppingBag, Utensils, 
  Info, CheckCircle2, AlertCircle, Store, BookOpen, 
  Smartphone, Tv, RollerCoaster, Shirt, Gift, 
  RotateCcw, History, Trash2, Wallet, PieChart
} from 'lucide-react';

// --- 1. 카테고리 & 브랜드 데이터 (기존 유지) ---
const CATEGORY_GROUPS = [
  { id: 'cafe', name: '카페/디저트' },
  { id: 'convenience', name: '편의점/마트' },
  { id: 'food', name: '외식/패스트푸드' },
  { id: 'delivery', name: '배달앱' },
  { id: 'life', name: '생활/잡화' },
  { id: 'shopping', name: '쇼핑/커머스' },
  { id: 'movie', name: '영화/엔터' },
  { id: 'subscription', name: '구독(OTT)' },
  { id: 'transport', name: '교통/통신' },
];

const BRANDS = [
  // [Cafe]
  { id: 'starbucks', name: '스타벅스', category: 'cafe', icon: <Coffee className="w-5 h-5" /> },
  { id: 'twosome', name: '투썸플레이스', category: 'cafe', icon: <Coffee className="w-5 h-5" /> },
  { id: 'mega', name: '메가커피', category: 'cafe', icon: <Coffee className="w-5 h-5" /> },
  { id: 'compose', name: '컴포즈커피', category: 'cafe', icon: <Coffee className="w-5 h-5" /> },
  { id: 'mammoth', name: '매머드커피', category: 'cafe', icon: <Coffee className="w-5 h-5" /> },
  { id: 'paiks', name: '빽다방', category: 'cafe', icon: <Coffee className="w-5 h-5" /> },
  { id: 'ediya', name: '이디야', category: 'cafe', icon: <Coffee className="w-5 h-5" /> },
  { id: 'coffeebean', name: '커피빈', category: 'cafe', icon: <Coffee className="w-5 h-5" /> },
  { id: 'angelinus', name: '엔제리너스', category: 'cafe', icon: <Coffee className="w-5 h-5" /> },
  { id: 'paulbassett', name: '폴바셋', category: 'cafe', icon: <Coffee className="w-5 h-5" /> },
  { id: 'baskin', name: '배스킨라빈스', category: 'cafe', icon: <Coffee className="w-5 h-5" /> },
  { id: 'krispy', name: '크리스피도넛', category: 'cafe', icon: <Coffee className="w-5 h-5" /> },
  
  // [Food]
  { id: 'kfc', name: 'KFC', category: 'food', icon: <Utensils className="w-5 h-5" /> },
  { id: 'outback', name: '아웃백', category: 'food', icon: <Utensils className="w-5 h-5" /> },
  { id: 'vips', name: 'VIPS', category: 'food', icon: <Utensils className="w-5 h-5" /> },
  
  // [Delivery]
  { id: 'baemin', name: '배달의민족', category: 'delivery', icon: <ShoppingBag className="w-5 h-5" /> },
  { id: 'ddaenggyo', name: '땡겨요', category: 'delivery', icon: <ShoppingBag className="w-5 h-5" /> },
  { id: 'coupangeats', name: '쿠팡이츠', category: 'delivery', icon: <ShoppingBag className="w-5 h-5" /> },

  // [Convenience]
  { id: 'gs25', name: 'GS25', category: 'convenience', icon: <Store className="w-5 h-5" /> },
  { id: 'cu', name: 'CU', category: 'convenience', icon: <Store className="w-5 h-5" /> },
  { id: 'emart24', name: '이마트24', category: 'convenience', icon: <Store className="w-5 h-5" /> },
  
  // [Life/Shopping]
  { id: 'oliveyoung', name: '올리브영', category: 'life', icon: <Gift className="w-5 h-5" /> },
  { id: 'daiso', name: '다이소', category: 'life', icon: <Gift className="w-5 h-5" /> },
  { id: 'coupang', name: '쿠팡', category: 'shopping', icon: <ShoppingBag className="w-5 h-5" /> },
  { id: 'musinsa', name: '무신사', category: 'shopping', icon: <Shirt className="w-5 h-5" /> },
  { id: 'zigzag', name: '지그재그', category: 'shopping', icon: <Shirt className="w-5 h-5" /> },
  { id: 'ably', name: '에이블리', category: 'shopping', icon: <Shirt className="w-5 h-5" /> },
  { id: 'kream', name: '크림(KREAM)', category: 'shopping', icon: <Shirt className="w-5 h-5" /> },
  
  // [Book]
  { id: 'kyobo', name: '교보문고', category: 'shopping', icon: <BookOpen className="w-5 h-5" /> },
  { id: 'yes24', name: 'YES24', category: 'shopping', icon: <BookOpen className="w-5 h-5" /> },
  { id: 'aladin', name: '알라딘', category: 'shopping', icon: <BookOpen className="w-5 h-5" /> },

  // [Transport/Telecom]
  { id: 'transport', name: '버스/지하철', category: 'transport', icon: <Bus className="w-5 h-5" /> },
  { id: 'kakaot', name: '카카오T', category: 'transport', icon: <Bus className="w-5 h-5" /> },
  { id: 'telecom', name: '통신3사', category: 'telecom', icon: <Smartphone className="w-5 h-5" /> },
  
  // [Movie/Enter]
  { id: 'cgv', name: 'CGV', category: 'movie', icon: <Film className="w-5 h-5" /> },
  { id: 'lotte_world', name: '롯데월드', category: 'movie', icon: <RollerCoaster className="w-5 h-5" /> },
  { id: 'everland', name: '에버랜드', category: 'movie', icon: <RollerCoaster className="w-5 h-5" /> },
  
  // [Subscription]
  { id: 'youtube', name: '유튜브', category: 'subscription', icon: <Tv className="w-5 h-5" /> },
  { id: 'netflix', name: '넷플릭스', category: 'subscription', icon: <Tv className="w-5 h-5" /> },
  { id: 'tving', name: '티빙', category: 'subscription', icon: <Tv className="w-5 h-5" /> },
  { id: 'disney', name: '디즈니+', category: 'subscription', icon: <Tv className="w-5 h-5" /> },
];

// --- 3. 카드 데이터 ---
const MY_CARDS = [
  {
    id: 'kb_nara',
    name: 'KB국민 나라사랑',
    company: 'KB국민카드',
    color: 'bg-yellow-500',
    limitTable: [
      { threshold: 500000, limit: 30000 },
      { threshold: 300000, limit: 20000 },
      { threshold: 200000, limit: 10000 },
      { threshold: 100000, limit: 5000 },
      { threshold: 0, limit: 0 },
    ],
    rules: [
      { id: 'kb_tel', included_brands: ['telecom'], category: 'telecom', desc: '통신 2,500원', detail: '5만원 이상 결제', condition: { min_spend: 50000 }, action: { type: 'FLAT', value: 2500 } },
      { id: 'kb_trans', included_brands: ['transport'], category: 'transport', desc: '대중교통 20%', detail: '최대 1만원', condition: { min_spend: 0 }, action: { type: 'PERCENT', value: 20, max_discount: 10000 } },
      { id: 'kb_cgv', included_brands: ['cgv'], category: 'movie', desc: 'CGV 35%', detail: '건당 최대 7천원', condition: { min_spend: 10000 }, action: { type: 'PERCENT', value: 35, max_discount: 7000 } },
      { id: 'kb_star', included_brands: ['starbucks'], category: 'cafe', desc: '스타벅스 20%', detail: '건당 최대 4천원', condition: { min_spend: 10000 }, action: { type: 'PERCENT', value: 20, max_discount: 4000 } },
      { id: 'kb_book', included_brands: ['kyobo'], category: 'shopping', desc: '교보문고 5%', detail: '건당 최대 2,500원', condition: { min_spend: 20000 }, action: { type: 'PERCENT', value: 5, max_discount: 2500 } },
      { id: 'kb_food', included_brands: ['outback', 'vips'], category: 'food', desc: '패밀리레스토랑 20%', detail: '건당 최대 1만원', condition: { min_spend: 30000 }, action: { type: 'PERCENT', value: 20, max_discount: 10000 } },
      { id: 'kb_amuse', included_brands: ['everland', 'lotte_world'], category: 'movie', desc: '놀이공원 50%', detail: '건당 최대 2.5만원', condition: { min_spend: 30000 }, action: { type: 'PERCENT', value: 50, max_discount: 25000 } }
    ]
  },
  {
    id: 'shinhan_nara',
    name: '신한 나라사랑',
    company: '신한카드',
    color: 'bg-blue-600',
    limitTable: [
      { threshold: 500000, limit: 30000 },
      { threshold: 200000, limit: 20000 },
      { threshold: 100000, limit: 5000 },
      { threshold: 0, limit: 0 },
    ],
    rules: [
      { id: 'sh_tel', included_brands: ['telecom'], category: 'telecom', desc: '통신 5%', detail: '월 1회, 최대 5천원', condition: { min_spend: 0 }, limit: { monthly: 1 }, action: { type: 'PERCENT', value: 5, max_discount: 5000 } },
      { id: 'sh_trans', included_brands: ['transport'], category: 'transport', desc: '대중교통 20%', detail: '최대 5천원', condition: { min_spend: 0 }, action: { type: 'PERCENT', value: 20, max_discount: 5000 } },
      { id: 'sh_kakao', included_brands: ['kakaot'], category: 'transport', desc: '카카오T 10%', detail: '최대 2천원', condition: { min_spend: 0 }, action: { type: 'PERCENT', value: 10, max_discount: 2000 } },
      { id: 'sh_cvs', included_brands: ['gs25', 'cu'], category: 'convenience', desc: '편의점 20%', detail: '일 1회, 건당 최대 1천원', condition: { min_spend: 0 }, limit: { daily: 1 }, action: { type: 'PERCENT', value: 20, max_discount: 1000 } },
      { id: 'sh_cgv', included_brands: ['cgv'], category: 'movie', desc: 'CGV 6천원 예매', detail: '월 1회', condition: { min_spend: 0 }, limit: { monthly: 1 }, action: { type: 'FIXED_PRICE_DISCOUNT', value: 6000 } },
      { id: 'sh_cafe', included_brands: ['starbucks', 'mega', 'compose', 'mammoth', 'paiks', 'ediya', 'paulbassett'], category: 'cafe', desc: '주요 카페 5%', detail: '일 1회, 최대 2천원', condition: { min_spend: 0 }, limit: { daily: 1 }, action: { type: 'PERCENT', value: 5, max_discount: 2000 } },
      { id: 'sh_book', included_brands: ['aladin', 'yes24'], category: 'shopping', desc: '온라인서점 5%', detail: '최대 6천원', condition: { min_spend: 0 }, action: { type: 'PERCENT', value: 5, max_discount: 6000 } },
      { id: 'sh_bae', included_brands: ['baemin'], category: 'delivery', desc: '배달의민족 5%', detail: '월 5회 (최대 1천원)', condition: { min_spend: 0 }, limit: { monthly: 5 }, action: { type: 'PERCENT', value: 5, max_discount: 1000 } },
      { id: 'sh_ott', included_brands: ['youtube', 'netflix', 'tving'], category: 'subscription', desc: 'OTT 10%', detail: '월 최대 5천원', condition: { min_spend: 0 }, action: { type: 'PERCENT', value: 10, max_discount: 5000 } },
      { id: 'sh_shop', included_brands: ['musinsa', '29cm'], category: 'shopping', desc: '온라인패션 10%', detail: '월 최대 6천원', condition: { min_spend: 0 }, action: { type: 'PERCENT', value: 10, max_discount: 6000 } },
      { id: 'sh_amuse', included_brands: ['everland', 'lotte_world'], category: 'movie', desc: '놀이공원 50%', detail: '일 1회, 연 3회', condition: { min_spend: 0 }, limit: { daily: 1 }, action: { type: 'PERCENT', value: 50, max_discount: 25000 } }
    ]
  },
  {
    id: 'shinhan_heyoung',
    name: '신한 헤이영 체크',
    company: '신한카드',
    color: 'bg-indigo-500',
    limitTable: [
      { threshold: 500000, limit: 10000 },
      { threshold: 200000, limit: 5000 },
      { threshold: 0, limit: 0 },
    ],
    rules: [
      { 
        id: 'hy_cvs', included_brands: ['gs25', 'cu', 'emart24'], category: 'convenience', 
        desc: '편의점 1천원', detail: '일 1회, 월 5회 (1만원↑)', 
        condition: { min_spend: 10000 }, limit: { daily: 1, monthly: 5 }, action: { type: 'FLAT', value: 1000 } 
      },
      { 
        id: 'hy_cafe', included_brands: ['starbucks', 'twosome', 'mega', 'paiks', 'angelinus', 'ediya', 'coffeebean', 'paulbassett'], category: 'cafe', 
        desc: '카페 1천원', detail: '일 1회, 월 5회 (1만원↑)', 
        condition: { min_spend: 10000 }, limit: { daily: 1, monthly: 5 }, action: { type: 'FLAT', value: 1000 } 
      },
      { 
        id: 'hy_del', included_brands: ['ddaenggyo'], category: 'delivery', 
        desc: '땡겨요 1천원', detail: '일 1회, 월 5회 (1만원↑)', 
        condition: { min_spend: 10000 }, limit: { daily: 1, monthly: 5 }, action: { type: 'FLAT', value: 1000 } 
      },
      { 
        id: 'hy_food', included_brands: ['kfc', 'baskin', 'krispy'], category: 'food', 
        desc: 'KFC/베라/도넛 1천원', detail: '일 1회, 월 5회 (1만원↑)', 
        condition: { min_spend: 10000 }, limit: { daily: 1, monthly: 5 }, action: { type: 'FLAT', value: 1000 } 
      },
      { 
        id: 'hy_life', included_brands: ['oliveyoung', 'daiso'], category: 'life', 
        desc: '올영/다이소 1천원', detail: '일 1회, 월 5회 (1만원↑)', 
        condition: { min_spend: 10000 }, limit: { daily: 1, monthly: 5 }, action: { type: 'FLAT', value: 1000 } 
      },
      { 
        id: 'hy_ott', included_brands: ['netflix', 'disney', 'tving'], category: 'subscription', 
        desc: 'OTT 1천원', detail: '월 1회 (1만원↑)', 
        condition: { min_spend: 10000 }, limit: { monthly: 1 }, action: { type: 'FLAT', value: 1000 } 
      },
      { 
        id: 'hy_shop', included_brands: ['coupang', 'coupangeats', 'musinsa', 'zigzag', 'ably', 'kream'], category: 'shopping', 
        desc: '쇼핑/쿠팡 1천원', detail: '일 1회, 월 5회 (2만원↑)', 
        condition: { min_spend: 20000 }, limit: { daily: 1, monthly: 5 }, action: { type: 'FLAT', value: 1000 } 
      },
    ]
  },
  {
    id: 'kakao_pay',
    name: '카카오페이 머니',
    company: '선불충전',
    color: 'bg-yellow-400 text-gray-900',
    limitTable: null,
    rules: [
      { id: 'kp_all', category: 'all', desc: '기본 적립 0.3%', detail: '실적 조건 없음', condition: { min_spend: 0 }, action: { type: 'PERCENT', value: 0.3 } }
    ]
  }
];

export default function CherryPickerApp() {
  // UI 상태
  const [selectedBrandId, setSelectedBrandId] = useState('starbucks');
  const [amount, setAmount] = useState(12000);
  const [viewHistory, setViewHistory] = useState(false);
  
  // --- Data 상태 ---
  // 1. 전월 실적
  const [cardPerformances, setCardPerformances] = useState({
    kb_nara: 300000,
    shinhan_nara: 200000,
    shinhan_heyoung: 200000,
    kakao_pay: 0,
  });

  // 2. 소비 내역
  const [history, setHistory] = useState([]);

  // --- Actions ---
  const updateCardPerformance = (cardId, value) => {
    setCardPerformances(prev => ({ ...prev, [cardId]: Number(value) }));
  };

  const handlePayment = (card) => {
    const newTransaction = {
      id: Date.now(),
      date: new Date(),
      brandId: selectedBrandId,
      brandName: currentBrand.name,
      amount: amount,
      cardId: card.id,
      cardName: card.name,
      discount: card.calculatedDiscount,
      ruleId: card.matchedRule?.id || null,
    };
    
    setHistory(prev => [newTransaction, ...prev]);
    
    alert(`${card.name}으로 ${amount.toLocaleString()}원 결제 기록이 저장되었습니다.\n혜택: ${card.calculatedDiscount.toLocaleString()}원`);
  };

  const resetHistory = () => {
    if(window.confirm('모든 소비 기록을 초기화하시겠습니까?')) {
      setHistory([]);
    }
  };

  // --- Derived Data ---
  const currentBrand = BRANDS.find(b => b.id === selectedBrandId) || BRANDS[0];

  const brandsByCategory = useMemo(() => {
    const grouped = {};
    CATEGORY_GROUPS.forEach(group => {
      grouped[group.id] = BRANDS.filter(b => {
        if (group.id === 'shopping') return ['shopping'].includes(b.category);
        if (group.id === 'delivery') return ['delivery'].includes(b.category);
        return b.category === group.id;
      });
    });
    return grouped;
  }, []);

  // [Helper] 룰별 사용 횟수 (횟수 제한용)
  const getUsageForRule = (ruleId) => {
    if (!ruleId) return { usedToday: false, monthlyCount: 0 };
    const now = new Date();
    const ruleHistory = history.filter(t => t.ruleId === ruleId);
    
    const usedToday = ruleHistory.some(t => {
      const tDate = new Date(t.date);
      return tDate.toDateString() === now.toDateString();
    });

    const monthlyCount = ruleHistory.filter(t => {
      const tDate = new Date(t.date);
      return tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear();
    }).length;

    return { usedToday, monthlyCount };
  };

  // [Helper] 이번 달 이미 받은 할인 총액 (통합 한도 차감용)
  const getUsedMonthlyDiscount = (cardId) => {
    const now = new Date();
    return history
      .filter(tx => 
        tx.cardId === cardId && 
        new Date(tx.date).getMonth() === now.getMonth() &&
        new Date(tx.date).getFullYear() === now.getFullYear()
      )
      .reduce((sum, tx) => sum + (tx.discount || 0), 0);
  };

  // 핵심 계산 로직
  const calculatedCards = useMemo(() => {
    return MY_CARDS.map(card => {
      const myPerformance = cardPerformances[card.id] || 0;
      
      // 1. 이번 달 총 한도(Max Limit) 계산 (전월 실적 기반)
      let monthlyMaxLimit = 9999999;
      if (card.limitTable) {
        const tier = card.limitTable.find(t => myPerformance >= t.threshold);
        monthlyMaxLimit = tier ? tier.limit : 0;
      }

      // 2. [New] 잔여 한도(Remaining Limit) 계산
      // (총 한도 - 이번 달 이미 받은 혜택)
      const usedDiscount = getUsedMonthlyDiscount(card.id);
      const remainingLimit = card.limitTable ? Math.max(0, monthlyMaxLimit - usedDiscount) : 9999999;

      // 3. 룰 매칭
      let rule = card.rules.find(r => r.included_brands && r.included_brands.includes(currentBrand.id));
      if (!rule) rule = card.rules.find(r => !r.included_brands && r.category === currentBrand.category);
      if (!rule) rule = card.rules.find(r => r.category === 'all');

      let discount = 0;
      let reason = '';
      let isApplicable = false;

      const usage = getUsageForRule(rule?.id);

      if (rule) {
        if (amount < rule.condition.min_spend) {
          reason = `최소 결제금액(${rule.condition.min_spend.toLocaleString()}원) 부족`;
        } else if (remainingLimit === 0 && card.limitTable) {
          reason = '이번 달 통합 한도 모두 소진됨';
        } else if (rule.limit?.daily && usage.usedToday) {
          reason = '오늘 이미 사용함 (일 1회)';
        } else if (rule.limit?.monthly && usage.monthlyCount >= rule.limit.monthly) {
          reason = `이번 달 횟수 초과 (${usage.monthlyCount}/${rule.limit.monthly}회)`;
        } else {
          isApplicable = true;
          // 할인액 계산
          if (rule.action.type === 'PERCENT') {
            discount = amount * (rule.action.value / 100);
            if (rule.action.max_discount && discount > rule.action.max_discount) {
              discount = rule.action.max_discount;
              reason = '건당 한도 적용';
            }
          } else if (rule.action.type === 'FLAT') {
             discount = rule.action.value;
             reason = '캐시백/할인';
          } else if (rule.action.type === 'FIXED_PRICE_DISCOUNT') {
             discount = Math.max(0, amount - rule.action.value);
             reason = `정가제(${rule.action.value.toLocaleString()}원)`;
          }

          // 4. [Important] 잔여 한도 체크
          if (discount > remainingLimit) {
             discount = remainingLimit;
             reason = remainingLimit === 0 
               ? '월 통합 한도 소진' 
               : `한도 잔액 부족 (잔여: ${remainingLimit.toLocaleString()}원)`;
          }
        }
      } else {
        reason = '혜택 없음';
      }

      return {
        ...card,
        calculatedDiscount: Math.floor(discount),
        reason,
        matchedRule: rule,
        isApplicable,
        monthlyMaxLimit, // 원래 총 한도
        remainingLimit, // 남은 한도
        usedDiscount, // 사용한 금액
        myPerformance,
        usage 
      };
    }).sort((a, b) => b.calculatedDiscount - a.calculatedDiscount);
  }, [currentBrand, amount, cardPerformances, history]); 

  const bestCard = calculatedCards[0];

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen font-sans pb-20">
      {/* Header */}
      <header className="bg-white px-6 py-4 shadow-sm sticky top-0 z-20 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            🍒 Cherry Picker
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            현재 선택: <span className="font-bold text-blue-600">{currentBrand.name}</span>
          </p>
        </div>
        <button 
          onClick={() => setViewHistory(!viewHistory)}
          className={`p-2 rounded-full ${viewHistory ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}
        >
          <History className="w-5 h-5" />
        </button>
      </header>

      {viewHistory ? (
        // --- History View ---
        <main className="p-4 space-y-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-bold text-gray-800">이번 달 소비 내역</h2>
            <button onClick={resetHistory} className="text-xs text-red-500 flex items-center gap-1 bg-red-50 px-2 py-1 rounded">
              <Trash2 className="w-3 h-3" /> 초기화
            </button>
          </div>
          
          {history.length === 0 ? (
            <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
              기록된 소비 내역이 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((tx) => (
                <div key={tx.id} className="bg-white p-3 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-800">{tx.brandName}</span>
                      <span className="text-[10px] text-gray-400">{new Date(tx.date).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-gray-500">{tx.cardName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{tx.amount.toLocaleString()}원</p>
                    {tx.discount > 0 && (
                      <p className="text-xs text-blue-600 font-medium">-{tx.discount.toLocaleString()}원 혜택</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      ) : (
        // --- Main Calculator View ---
        <main className="p-4 space-y-6">
          
          {/* 1. 브랜드 선택 */}
          <section className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
            <div className="h-48 overflow-y-auto pr-2 space-y-6 custom-scrollbar">
              {CATEGORY_GROUPS.map(group => (
                brandsByCategory[group.id]?.length > 0 && (
                  <div key={group.id}>
                    <h3 className="text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-wider">{group.name}</h3>
                    <div className="grid grid-cols-4 gap-2">
                      {brandsByCategory[group.id].map(brand => (
                        <button
                          key={brand.id}
                          onClick={() => setSelectedBrandId(brand.id)}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-200 border min-h-[64px] ${
                            selectedBrandId === brand.id
                              ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm ring-1 ring-blue-500'
                              : 'bg-white border-gray-100 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                          }`}
                        >
                          <div className={`mb-1 p-1 rounded-full ${selectedBrandId === brand.id ? 'bg-blue-200' : 'bg-gray-100'}`}>
                            {brand.icon}
                          </div>
                          <span className="text-[9px] font-bold text-center leading-tight break-keep">{brand.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <label className="text-xs font-semibold text-gray-500 mb-2 block">결제 예상 금액</label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full text-2xl font-bold p-3 pl-4 pr-12 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">원</span>
              </div>
            </div>
          </section>

          {/* 2. 추천 결과 (Best Card) */}
          <section>
            <div className="flex items-center justify-between px-1 mb-2">
              <h2 className="text-sm font-bold text-gray-800">최고의 선택</h2>
            </div>
            
            {bestCard.calculatedDiscount > 0 ? (
              <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full ${bestCard.color} flex items-center justify-center text-white text-sm font-bold shadow-md ring-4 ring-white/10`}>
                        {bestCard.name.substring(0, 2)}
                    </div>
                    <div>
                        <h3 className="text-lg font-bold leading-tight">{bestCard.name}</h3>
                        <p className="text-gray-400 text-xs mt-0.5">{bestCard.company}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block text-3xl font-extrabold text-blue-300">
                      {bestCard.calculatedDiscount.toLocaleString()}원
                    </span>
                    <span className="text-xs text-gray-400">혜택 예상</span>
                  </div>
                </div>
                
                <div className="bg-white/10 rounded-xl p-3 mt-4 border border-white/5 relative z-10">
                  <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      <span className="font-bold text-sm text-green-100">{bestCard.matchedRule?.desc}</span>
                  </div>
                  <p className="text-xs text-gray-400 pl-6 mb-1">{bestCard.matchedRule?.detail}</p>
                  
                  {/* 통합 한도 잔액 표시 (New) */}
                  {bestCard.limitTable && (
                    <div className="pl-6 mb-1 flex items-center gap-1.5 text-[10px] text-gray-300">
                      <PieChart className="w-3 h-3" />
                      <span>
                        통합 한도 잔액: <span className="text-white font-bold">{bestCard.remainingLimit.toLocaleString()}원</span> 
                        <span className="text-gray-500"> / {bestCard.monthlyMaxLimit.toLocaleString()}원</span>
                      </span>
                    </div>
                  )}

                  {bestCard.reason && !['건당 한도 적용', '캐시백/할인', '정액 할인', '정가제'].some(r => bestCard.reason.includes(r)) && (
                      <p className="text-xs text-yellow-300 pl-6">⚠️ {bestCard.reason}</p>
                  )}
                  
                  {/* 사용 횟수 현황 표시 */}
                  {bestCard.matchedRule?.limit && (
                    <div className="pl-6 mt-1 flex gap-2 text-[10px] text-gray-300">
                      {bestCard.matchedRule.limit.daily && (
                        <span className={bestCard.usage.usedToday ? 'text-red-300' : 'text-green-300'}>
                          • 오늘 {bestCard.usage.usedToday ? '사용함' : '미사용'}
                        </span>
                      )}
                      {bestCard.matchedRule.limit.monthly && (
                        <span>
                           • 이번 달 {bestCard.usage.monthlyCount}/{bestCard.matchedRule.limit.monthly}회
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <button 
                  onClick={() => handlePayment(bestCard)}
                  className="mt-4 w-full bg-white text-gray-900 font-bold py-3 rounded-xl hover:bg-gray-100 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg"
                >
                  <Wallet className="w-4 h-4" />
                  이 카드로 결제 기록하기
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
                <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-gray-700">혜택 카드 없음</h3>
                <p className="text-sm text-gray-400 mt-1">
                  {bestCard.reason || "모든 카드의 혜택 조건을 만족하지 못했습니다."}
                </p>
                <button 
                  onClick={() => handlePayment(bestCard)}
                  className="mt-4 px-6 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-200"
                >
                  그냥 기록하기
                </button>
              </div>
            )}
          </section>

          {/* 3. 비교 리스트 */}
          <section className="space-y-4">
            <h2 className="text-sm font-bold text-gray-800 ml-1">다른 카드 비교</h2>
            
            {calculatedCards.slice(1).map((card) => (
              <div key={card.id} className="bg-white p-4 rounded-xl border border-gray-100 transition-all hover:border-blue-200">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-start gap-3 overflow-hidden">
                    <div className={`w-10 h-10 shrink-0 rounded-full ${card.color} flex items-center justify-center text-white text-xs font-bold shadow-sm opacity-90`}>
                      {card.name.substring(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-gray-800 text-sm truncate">{card.name}</h4>
                      {card.matchedRule ? (
                          <div className="mt-1">
                            <p className="text-xs font-medium text-blue-600 truncate">{card.matchedRule.desc}</p>
                            <p className="text-[10px] text-gray-400 truncate">{card.matchedRule.detail}</p>
                            {card.matchedRule.limit?.monthly && (
                              <p className="text-[9px] text-gray-400 mt-0.5">
                                사용: {card.usage.monthlyCount}/{card.matchedRule.limit.monthly}회
                              </p>
                            )}
                          </div>
                      ) : (
                          <p className="text-xs text-gray-400 mt-1">혜택 없음</p>
                      )}
                      {!card.isApplicable && card.reason && (
                        <p className={`text-[10px] mt-1 font-medium inline-block px-1.5 py-0.5 rounded ${card.reason.includes('횟수') || card.reason.includes('오늘') || card.reason.includes('한도') ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-400'}`}>
                          {card.reason}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-2">
                    <span className={`font-bold block ${card.calculatedDiscount > 0 ? 'text-gray-900' : 'text-gray-300 text-sm'}`}>
                      {card.calculatedDiscount > 0 ? `+${card.calculatedDiscount.toLocaleString()}원` : '-'}
                    </span>
                    {/* 잔여 한도 미니 표시 (리스트) */}
                    {card.limitTable && (
                       <span className="text-[9px] text-gray-400 block mt-0.5">
                          잔여: {card.remainingLimit > 900000 ? '∞' : (card.remainingLimit/10000).toFixed(1) + '만'}
                       </span>
                    )}
                    <button 
                      onClick={() => handlePayment(card)}
                      className="mt-2 text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded"
                    >
                      선택
                    </button>
                  </div>
                </div>

                {/* 카드별 실적 조절 */}
                {card.limitTable && (
                  <div className="bg-gray-50 rounded-lg p-2 mt-2">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[9px] font-bold text-gray-400">전월 실적 설정</span>
                      <span className="text-[9px] font-bold text-blue-600">
                        {card.myPerformance.toLocaleString()}원
                      </span>
                    </div>
                    <input 
                      type="range" min="0" max="600000" step="50000"
                      value={card.myPerformance}
                      onChange={(e) => updateCardPerformance(card.id, e.target.value)}
                      className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-400 block"
                    />
                    <div className="flex justify-between text-[8px] text-gray-400 mt-1">
                       <span>이번달 쓴 혜택: {card.usedDiscount.toLocaleString()}원</span>
                       <span>총 한도: {card.monthlyMaxLimit.toLocaleString()}원</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </section>
        </main>
      )}
    </div>
  );
}