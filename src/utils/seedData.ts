import { ActionType, PlatformType } from '@/types';

export const INITIAL_CATEGORIES = [
    { id: 'cafe', name: '카페/디저트' },
    { id: 'convenience', name: '편의점/마트' },
    { id: 'food', name: '외식/패스트푸드' },
    { id: 'delivery', name: '배달앱' },
    { id: 'life', name: '생활/잡화' },
    { id: 'shopping', name: '쇼핑/커머스' },
    { id: 'movie', name: '영화/엔터' },
    { id: 'subscription', name: '구독(OTT)' },
    { id: 'transport', name: '교통/통신' },
    { id: 'etc', name: '기타' },
];

export const INITIAL_BRANDS = [
    // Cafe
    { id: 'starbucks', name: '스타벅스', category_id: 'cafe', icon_name: 'Coffee' },
    { id: 'twosome', name: '투썸플레이스', category_id: 'cafe', icon_name: 'Coffee' },
    { id: 'mega', name: '메가커피', category_id: 'cafe', icon_name: 'Coffee' },
    { id: 'compose', name: '컴포즈커피', category_id: 'cafe', icon_name: 'Coffee' },
    { id: 'paiks', name: '빽다방', category_id: 'cafe', icon_name: 'Coffee' },
    { id: 'ediya', name: '이디야', category_id: 'cafe', icon_name: 'Coffee' },
    { id: 'coffeebean', name: '커피빈', category_id: 'cafe', icon_name: 'Coffee' },
    { id: 'paulbassett', name: '폴바셋', category_id: 'cafe', icon_name: 'Coffee' },
    { id: 'angelinus', name: '엔제리너스', category_id: 'cafe', icon_name: 'Coffee' },
    { id: 'mammoth', name: '매머드커피', category_id: 'cafe', icon_name: 'Coffee' },
    { id: 'baskin_robbins', name: '배스킨라빈스', category_id: 'cafe', icon_name: 'Coffee' },
    { id: 'krispy_kreme', name: '크리스피크림', category_id: 'cafe', icon_name: 'Coffee' },

    // Food
    { id: 'kfc', name: 'KFC', category_id: 'food', icon_name: 'Utensils' },
    { id: 'outback', name: '아웃백', category_id: 'food', icon_name: 'Utensils' },
    { id: 'vips', name: 'VIPS', category_id: 'food', icon_name: 'Utensils' },

    // Delivery
    { id: 'baemin', name: '배달의민족', category_id: 'delivery', icon_name: 'ShoppingBag' },
    { id: 'ddaenggyo', name: '땡겨요', category_id: 'delivery', icon_name: 'ShoppingBag' },
    { id: 'coupangeats', name: '쿠팡이츠', category_id: 'delivery', icon_name: 'ShoppingBag' },

    // Convenience
    { id: 'gs25', name: 'GS25', category_id: 'convenience', icon_name: 'Store' },
    { id: 'cu', name: 'CU', category_id: 'convenience', icon_name: 'Store' },
    { id: 'emart24', name: '이마트24', category_id: 'convenience', icon_name: 'Store' },
    { id: 'seveneleven', name: '세븐일레븐', category_id: 'convenience', icon_name: 'Store' },

    // Life/Shopping
    { id: 'oliveyoung', name: '올리브영', category_id: 'life', icon_name: 'Gift' },
    { id: 'daiso', name: '다이소', category_id: 'life', icon_name: 'Gift' },
    { id: 'coupang', name: '쿠팡', category_id: 'shopping', icon_name: 'ShoppingBag' },
    { id: 'musinsa', name: '무신사', category_id: 'shopping', icon_name: 'Shirt' },
    { id: 'zigzag', name: '지그재그', category_id: 'shopping', icon_name: 'Shirt' },
    { id: 'ably', name: '에이블리', category_id: 'shopping', icon_name: 'Shirt' },
    { id: 'kream', name: '크림(KREAM)', category_id: 'shopping', icon_name: 'Shirt' },
    { id: '29cm', name: '29CM', category_id: 'shopping', icon_name: 'Shirt' },

    // Book
    { id: 'kyobo', name: '교보문고', category_id: 'shopping', icon_name: 'BookOpen' },
    { id: 'yes24', name: 'YES24', category_id: 'shopping', icon_name: 'BookOpen' },
    { id: 'aladin', name: '알라딘', category_id: 'shopping', icon_name: 'BookOpen' },

    // Transport/Telecom
    { id: 'transport_public', name: '버스/지하철', category_id: 'transport', icon_name: 'Bus' },
    { id: 'kakaot', name: '카카오T', category_id: 'transport', icon_name: 'Bus' },
    { id: 'telecom', name: '통신3사', category_id: 'transport', icon_name: 'Smartphone' },

    // Movie/Enter
    { id: 'cgv', name: 'CGV', category_id: 'movie', icon_name: 'Film' },
    { id: 'lotte_world', name: '롯데월드', category_id: 'movie', icon_name: 'RollerCoaster' },
    { id: 'everland', name: '에버랜드', category_id: 'movie', icon_name: 'RollerCoaster' },
    { id: 'caribbean', name: '캐리비안베이', category_id: 'movie', icon_name: 'RollerCoaster' },

    // Subscription
    { id: 'youtube', name: '유튜브', category_id: 'subscription', icon_name: 'Tv' },
    { id: 'netflix', name: '넷플릭스', category_id: 'subscription', icon_name: 'Tv' },
    { id: 'tving', name: '티빙', category_id: 'subscription', icon_name: 'Tv' },
    { id: 'disney', name: '디즈니+', category_id: 'subscription', icon_name: 'Tv' },

    // Etc
    { id: 'etc_brand', name: '기타', category_id: 'etc', icon_name: 'MoreHorizontal' },
];

export const INITIAL_CARDS = [
    {
        id: 'kb_nara',
        name: 'KB국민 나라사랑카드',
        company: 'KB국민카드',
        color: 'bg-yellow-500',
        limit_table: [
            { threshold: 500000, limit: 30000 },
            { threshold: 300000, limit: 20000 },
            { threshold: 200000, limit: 10000 },
            { threshold: 100000, limit: 5000 },
            { threshold: 0, limit: 0 },
        ],
    },
    {
        id: 'shinhan_nara',
        name: '신한 나라사랑카드',
        company: '신한카드',
        color: 'bg-blue-600',
        limit_table: [
            { threshold: 500000, limit: 30000 },
            { threshold: 200000, limit: 20000 },
            { threshold: 100000, limit: 5000 },
            { threshold: 0, limit: 0 },
        ],
    },
    {
        id: 'shinhan_sol',
        name: '신한 SOL트래블 체크카드',
        company: '신한카드',
        color: 'bg-blue-400',
        limit_table: [
            { threshold: 300000, limit: 999999 }, // 한도가 명시되지 않음 (30만원 이상시 제공)
            { threshold: 0, limit: 0 },
        ],
    },
    {
        id: 'shinhan_heyoung',
        name: '신한 헤이영 체크카드',
        company: '신한카드',
        color: 'bg-indigo-500',
        limit_table: [
            { threshold: 500000, limit: 10000 },
            { threshold: 200000, limit: 5000 },
            { threshold: 0, limit: 0 },
        ],
    }
];

export const INITIAL_RULES = [
    // ============================================
    // 1. KB 나라사랑카드
    // ============================================
    {
        id: 'kb_telecom', card_id: 'kb_nara', category: 'transport', included_brands: ['telecom'],
        description: '통신 2500원 할인', detail: '5만원 이상 결제시',
        condition: { min_spend: 50000 },
        action: { type: 'FLAT', value: 2500 },
        limit_config: {}
    },
    {
        id: 'kb_transport', card_id: 'kb_nara', category: 'transport', included_brands: ['transport_public'],
        description: '대중교통 20% 청구할인', detail: '월 최대 1만원 (광역교통 제외)',
        condition: { min_spend: 0 },
        action: { type: 'PERCENT', value: 20, max_discount: 10000 },
        limit_config: {}
    },
    {
        id: 'kb_movie', card_id: 'kb_nara', category: 'movie', included_brands: ['cgv'],
        description: 'CGV 35% 환급할인', detail: '1만원 이상 결제시, 최대 2만원 (7000원 할인), 공식 홈페이지',
        condition: { min_spend: 10000 },
        action: { type: 'PERCENT', value: 35, max_discount: 7000 },
        limit_config: {}
    },
    {
        id: 'kb_cafe', card_id: 'kb_nara', category: 'cafe', included_brands: ['starbucks'],
        description: '스타벅스 20% 환급할인', detail: '1만원 이상, 최대 2만원 (4000원 할인), 일부 매장 제외',
        condition: { min_spend: 10000 },
        action: { type: 'PERCENT', value: 20, max_discount: 4000 },
        limit_config: {}
    },
    {
        id: 'kb_book', card_id: 'kb_nara', category: 'shopping', included_brands: ['kyobo'],
        description: '교보문고 5% 환급할인', detail: '2만원 이상 결제시, 최대 5만원 (2500원 할인)',
        condition: { min_spend: 20000 },
        action: { type: 'PERCENT', value: 5, max_discount: 2500 },
        limit_config: {}
    },
    {
        id: 'kb_food', card_id: 'kb_nara', category: 'food', included_brands: ['outback', 'vips'],
        description: '아웃백, VIPS 20% 환급할인', detail: '3만원 이상, 최대 5만원 (1만원 할인)',
        condition: { min_spend: 30000 },
        action: { type: 'PERCENT', value: 20, max_discount: 10000 },
        limit_config: {}
    },
    {
        id: 'kb_amuse', card_id: 'kb_nara', category: 'movie', included_brands: ['everland', 'lotte_world'],
        description: '놀이공원 50% 현장할인', detail: '3만원 이상 현장예매, 최대 5만원 (25000원 할인)',
        condition: { min_spend: 30000 },
        action: { type: 'PERCENT', value: 50, max_discount: 25000 },
        limit_config: {}
    },


    // ============================================
    // 2. 신한 나라사랑카드
    // ============================================
    {
        id: 'sh_nara_telecom', card_id: 'shinhan_nara', category: 'transport', included_brands: ['telecom'],
        description: '통신 5% 할인', detail: '월 1회, 최대 5천원',
        condition: { min_spend: 0 },
        action: { type: 'PERCENT', value: 5, max_discount: 5000 },
        limit_config: { monthly_count: 1 }
    },
    {
        id: 'sh_nara_transport', card_id: 'shinhan_nara', category: 'transport', included_brands: ['transport_public'],
        description: '대중교통 20% 할인', detail: '최대 5천원 (광역교통 10% 3천원)',
        condition: { min_spend: 0 },
        action: { type: 'PERCENT', value: 20, max_discount: 5000 },
        limit_config: {}
    },
    // *Transport note: KakaoT separated for better matching
    {
        id: 'sh_nara_kakaot', card_id: 'shinhan_nara', category: 'transport', included_brands: ['kakaot'],
        description: '카카오T 10% 할인', detail: '최대 2천원',
        condition: { min_spend: 0 },
        action: { type: 'PERCENT', value: 10, max_discount: 2000 },
        limit_config: {}
    },
    {
        id: 'sh_nara_conv', card_id: 'shinhan_nara', category: 'convenience', included_brands: ['gs25', 'cu', 'seveneleven'],
        description: '편의점 20% 할인', detail: '일 1회 1천원, 월 5회 5천원 (CU, GS25, 세븐일레븐)',
        condition: { min_spend: 0 },
        action: { type: 'PERCENT', value: 20, max_discount: 1000 },
        limit_config: { daily_count: 1, monthly_count: 5 }
    },
    {
        id: 'sh_nara_movie', card_id: 'shinhan_nara', category: 'movie', included_brands: ['cgv'],
        description: 'CGV 6천원에 제공', detail: '월 1회, 동반 1인까지 (특이사항: 결제금액 6천원 고정)',
        condition: { min_spend: 0 },
        action: { type: 'FLAT', value: 5000 }, // Approximation
        limit_config: { monthly_count: 1 }
    },
    {
        id: 'sh_nara_cafe', card_id: 'shinhan_nara', category: 'cafe',
        included_brands: ['starbucks', 'mega', 'compose', 'mammoth', 'paiks', 'ediya', 'paulbassett'],
        description: '카페 5% 할인', detail: '일 1회 2천원, 월 3회 6천원 (스타벅스, 메가, 컴포즈, 매머드, 빽다방, 이디야, 폴바셋)',
        condition: { min_spend: 0 },
        action: { type: 'PERCENT', value: 5, max_discount: 2000 },
        limit_config: { daily_count: 1, monthly_count: 3 }
    },
    {
        id: 'sh_nara_book', card_id: 'shinhan_nara', category: 'shopping', included_brands: ['aladin', 'yes24'],
        description: '서점 5% 할인', detail: '월 최대 6천원 (알라딘, YES24) - 온라인 전용',
        condition: { min_spend: 0 },
        action: { type: 'PERCENT', value: 5, max_discount: 6000 },
        limit_config: {}
    },
    {
        id: 'sh_nara_delivery', card_id: 'shinhan_nara', category: 'delivery', included_brands: ['baemin'],
        description: '배달의민족 5% 할인', detail: '일 1회 1천원, 월 5회 5천원 (최대 2만원 결제시 1000원)',
        condition: { min_spend: 0 },
        action: { type: 'PERCENT', value: 5, max_discount: 1000 },
        limit_config: { daily_count: 1, monthly_count: 5 }
    },


    // ============================================
    // 3. 신한 SOL트래블
    // ============================================
    {
        id: 'sol_conv', card_id: 'shinhan_sol', category: 'convenience', included_brands: ['cu', 'gs25', 'seveneleven', 'emart24'],
        description: '편의점 5% 할인', detail: '일 1회, 월 3회 3천원 (CU, GS25, 세븐일레븐, 이마트24)',
        condition: { min_spend: 0 },
        action: { type: 'PERCENT', value: 5, max_discount: 3000 }, // Max 3000 per transaction or month? Assuming per txn based on detail text flow, but text says "Limit: Max 3000 won (Month 3 times)". So total limit 3000 or per time? "일 1회, 월 3회 3천원" could mean 1000 per time * 3.
        limit_config: { daily_count: 1, monthly_count: 3 }
    },
    {
        id: 'sol_conv_cu', card_id: 'shinhan_sol', category: 'convenience', included_brands: ['cu'],
        description: 'CU 즉석식품 5% 할인', detail: '1회 최대 2000원 (실적x, 카카오페이x) - 삼각김밥, 샌드위치 등',
        condition: { min_spend: 0 },
        action: { type: 'PERCENT', value: 5, max_discount: 2000 },
        limit_config: {}
    },
    {
        id: 'sol_tv', card_id: 'shinhan_sol', category: 'subscription', included_brands: ['youtube', 'tving', 'netflix'],
        description: 'OTT 10% 할인', detail: '월 최대 5000원 (공식 홈페이지)',
        condition: { min_spend: 0 },
        action: { type: 'PERCENT', value: 10, max_discount: 5000 },
        limit_config: {}
    },
    {
        id: 'sol_shop', card_id: 'shinhan_sol', category: 'shopping', included_brands: ['musinsa', '29cm'],
        description: '무신사/29CM 10% 할인', detail: '월 최대 6000원 (온라인)',
        condition: { min_spend: 0 },
        action: { type: 'PERCENT', value: 10, max_discount: 6000 },
        limit_config: {}
    },
    {
        id: 'sol_amuse', card_id: 'shinhan_sol', category: 'movie', included_brands: ['everland', 'lotte_world', 'caribbean'],
        description: '놀이공원 50% 할인', detail: '일 1회, 연 3회 (에버랜드, 롯데월드 50% / 캐리비안베이 30%) - 실적 30만원',
        condition: { min_spend: 0 },
        action: { type: 'PERCENT', value: 50 },
        limit_config: { daily_count: 1 }
    },


    // ============================================
    // 4. 신한 헤이영 체크
    // ============================================
    // *Hey Young: Most are 1000 Cashback over 10000 spent
    {
        id: 'hy_conv', card_id: 'shinhan_heyoung', category: 'convenience', included_brands: ['gs25', 'cu', 'emart24'],
        description: '편의점 1천원 캐시백', detail: '1만원 이상 결제시, 일 1회/월 5회 (GS25, CU, 이마트24)',
        condition: { min_spend: 10000 },
        action: { type: 'FLAT', value: 1000 },
        limit_config: { daily_count: 1, monthly_count: 5 }
    },
    {
        id: 'hy_cafe', card_id: 'shinhan_heyoung', category: 'cafe',
        included_brands: ['starbucks', 'twosome', 'mega', 'paiks', 'angelinus', 'ediya', 'coffeebean', 'paulbassett'],
        description: '카페 1천원 캐시백', detail: '1만원 이상 결제시, 일 1회/월 5회',
        condition: { min_spend: 10000 },
        action: { type: 'FLAT', value: 1000 },
        limit_config: { daily_count: 1, monthly_count: 5 }
    },
    {
        id: 'hy_delivery', card_id: 'shinhan_heyoung', category: 'delivery', included_brands: ['ddaenggyo'],
        description: '땡겨요 1천원 캐시백', detail: '1만원 이상 결제시, 일 1회/월 5회',
        condition: { min_spend: 10000 },
        action: { type: 'FLAT', value: 1000 },
        limit_config: { daily_count: 1, monthly_count: 5 }
    },
    {
        id: 'hy_food', card_id: 'shinhan_heyoung', category: 'food', included_brands: ['kfc', 'baskin_robbins', 'krispy_kreme'],
        description: 'KFC/베라/크리스피 1천원 캐시백', detail: '1만원 이상 결제시, 일 1회/월 5회',
        condition: { min_spend: 10000 },
        action: { type: 'FLAT', value: 1000 },
        limit_config: { daily_count: 1, monthly_count: 5 }
    },
    {
        id: 'hy_life', card_id: 'shinhan_heyoung', category: 'life', included_brands: ['oliveyoung', 'daiso'],
        description: '올영/다이소 1천원 캐시백', detail: '1만원 이상 결제시, 일 1회/월 5회',
        condition: { min_spend: 10000 },
        action: { type: 'FLAT', value: 1000 },
        limit_config: { daily_count: 1, monthly_count: 5 }
    },
    {
        id: 'hy_sub', card_id: 'shinhan_heyoung', category: 'subscription', included_brands: ['netflix', 'disney', 'tving'],
        description: 'OTT 1천원 캐시백', detail: '1만원 이상 결제시, 일 1회/월 5회',
        condition: { min_spend: 10000 },
        action: { type: 'FLAT', value: 1000 },
        limit_config: { daily_count: 1, monthly_count: 5 }
    },
    {
        id: 'hy_shop_cp', card_id: 'shinhan_heyoung', category: 'shopping', included_brands: ['coupang', 'coupangeats'],
        description: '쿠팡 1천원 캐시백', detail: '2만원 이상 결제시, 일 1회/월 5회 (쿠팡, 쿠팡이츠)',
        condition: { min_spend: 20000 },
        action: { type: 'FLAT', value: 1000 },
        limit_config: { daily_count: 1, monthly_count: 5 }
    },
    {
        id: 'hy_fashion', card_id: 'shinhan_heyoung', category: 'shopping', included_brands: ['musinsa', 'zigzag', 'ably', 'kream'],
        description: '무신사/지그재그/에이블리/크림 1천원 캐시백', detail: '2만원 이상 결제시, 일 1회/월 5회',
        condition: { min_spend: 20000 },
        action: { type: 'FLAT', value: 1000 },
        limit_config: { daily_count: 1, monthly_count: 5 }
    },
    {
        id: 'hy_pay', card_id: 'shinhan_heyoung', category: 'shopping', included_brands: [],
        description: '간편결제 1% 캐시백', detail: '2만원 이상 결제시, 월 최대 5천원 (특이사항: 결제수단 확인 필요)',
        condition: { min_spend: 20000 },
        action: { type: 'PERCENT', value: 1, max_discount: 5000 },
        limit_config: {}
    }
];
