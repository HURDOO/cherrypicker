/**
 * Minimal response-shaped excerpts preserved from official source documents collected on
 * 2026-08-23. Keep only fields and markup needed for parser regression tests; the complete
 * responses remain in the versioned promotion source document store.
 */
export const promotionOfficialFixtureMetadata = {
    collectedAt: '2026-08-23T05:46:36.808Z',
    compositeCollectedAt: '2026-09-02T15:15:10.952Z',
    sources: {
        skt: 'https://sktmembership.tworld.co.kr/mps/pc-bff/benefitbrand/list-tab1.do',
        lguplus: 'https://www.lguplus.com/uhdc/fo/prdv/mebfjnco/v1/jnco',
        naverpay: 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions',
        tUniverseBig: 'https://shop.tworld.co.kr/magazine/plan/twoojoo-benefits-guide.html',
        tUniverseDaily: 'https://news.sktelecom.com/226659',
        tUniverseOliveStarbucks: 'https://news.sktelecom.com/214562',
        parisKt: 'https://www.paris.co.kr/affiliate-card/kt-%EB%A9%A4%EB%B2%84%EC%8B%AD/',
        parisSkt: 'https://www.paris.co.kr/affiliate-card/t-%EB%A9%A4%EB%B2%84%EC%8B%AD/',
        tousLesJours: 'https://www.tlj.co.kr/membership/partner.asp',
    },
};

/**
 * Response-shaped excerpts from the official HTML documents collected on 2026-09-02.
 * The markup and wording intentionally mirror the source instead of simplifying it into
 * parser-friendly test prose.
 */
export const officialTUniverseBigGuideHtmlExcerpt = `
    <div style="overflow-x: auto; margin: 16px 0;">
        <table style="width: 100%; border-collapse: collapse;">
            <thead><tr><th>요금제</th><th>T 우주 상품</th><th>이용 금액</th><th>주요 제휴 혜택</th></tr></thead>
            <tbody>
                <tr>
                    <td>베스트 Max(T 우주)</td><td>T 우주 Big 6</td><td>무료<br/>최대 25,900원 할인</td>
                    <td>CU 1,000원당 200원 할인, 스타벅스 제조음료 20% 할인, 배스킨라빈스 7천 원 상당 교환권, 배달의민족 3천 원 쿠폰 3장, 올리브영 1만 원 상당 쿠폰, CGV 시그니처 팝콘 쿠폰</td>
                </tr>
                <tr>
                    <td>베스트 Pro(T 우주)</td><td>T 우주 Big 5</td><td>무료<br/>최대 20,900원 할인</td>
                    <td>CU 1,000원당 200원 할인, 스타벅스 제조음료 20% 할인, 배스킨라빈스 7천 원 상당 교환권, 배달의민족 3천 원 쿠폰 3장, 올리브영 1만 원 상당 쿠폰</td>
                </tr>
                <tr>
                    <td>베스트 109(T 우주)</td><td>T 우주 Big 4</td><td>무료<br/>최대 16,900원 할인</td>
                    <td>세븐일레븐 1,000원당 300원 할인, 투썸플레이스 30% 할인, 파리바게뜨 1,000원당 300원 할인, 배달의민족 3천 원 쿠폰 3장</td>
                </tr>
                <tr>
                    <td>베스트 99(T 우주)</td><td>T 우주 Big 3</td><td>무료<br/>최대 9,900원 할인</td>
                    <td>세븐일레븐 1,000원당 300원 할인, 투썸플레이스 30% 할인, 파리바게뜨 1,000원당 300원 할인</td>
                </tr>
                <tr>
                    <td>베스트 89(T 우주)</td><td>T 우주 Big 3</td><td>50% 할인<br/>최대 4,950원 할인</td>
                    <td>세븐일레븐 1,000원당 300원 할인, 투썸플레이스 30% 할인, 파리바게뜨 1,000원당 300원 할인</td>
                </tr>
            </tbody>
        </table>
    </div>
`;

export const officialTUniverseDailyPassHtmlExcerpt = `
    <p>편의점과 카페를 자주 찾는다면 월 9,900원의 ‘T 우주패스 편의점&amp;카페’ 상품을 활용할 수 있다. 세븐일레븐 매장 구매 1천 원당 300원 할인 혜택을 제공하며, 1일 1회 최대 9천 원, 월 최대 3만 원까지 할인받을 수 있다. 투썸플레이스에서는 모든 제품을 매일 30% 할인받을 수 있으며, 1일 1회 최대 9천 원, 월 최대 3만 원까지 적용된다.</p>
    <p>온라인 쇼핑이 많다면 ‘T 우주패스 쇼핑 11번가’를 추천한다. 월 9,900원으로 11번가 5천 원 쿠폰 2매, 11번가 배송비 3천 원 쿠폰 1매, 11pay 3,000 포인트, Google One 스토리지 용량 100GB을 함께 제공한다. 과제 자료와 발표용 이미지, 팀플 영상 파일처럼 용량이 큰 자료를 자주 저장하고 공유해야 하는 대학생에게 실용적인 선택지가 될 수 있다.</p>
    <p>월 구독료 부담을 낮추고 편의점 할인만 실속 있게 챙기고 싶다면 월 4,900원의 ‘CU 할인’ 구독을 선택할 수 있다. CU편의점에서 1천 원당 200원을 할인받을 수 있으며, 1일 1회 최대 6천 원, 월 최대 3만 원까지 할인이 적용된다.</p>
`;

export const officialTUniverseOliveStarbucksHtmlExcerpt = `
    <p>이번에 선보이는 ‘T 우주패스 올리브영&amp;스타벅스&amp;이마트24’ 상품은 월 9,900원의 구독료를 지불하면 세 가지 브랜드의 혜택을 모두 제공한다.</p>
    <p>올리브영은 최대 약 1만 원 상당의 혜택을 매월 제공한다. 올리브영 공식 온라인몰 및 오프라인 매장에서 사용 가능한 4,000원 모바일 상품권과 함께 2만원 이상 구매 시 사용 가능한 3,000원 할인 쿠폰을 준다. 2만원 이상 구매하면 최대 7,000원 혜택을 누릴 수 있다.</p>
    <p>또한, 올리브영 공식 온라인몰에서 사용 가능한 무료 배송 쿠폰(2,500원 상당)도 1장 더 제공한다. 온라인몰에서 품목 1개만 사도 결제금액이 3,000원 이상이면 적용 가능하다.</p>
    <p>스타벅스는 제조 음료 가격의 20%를 할인해준다. 할인 금액은 일 5,000원, 월 30,000원 한도로 전국 스타벅스 매장에서 모바일 주문인 사이렌오더를 통해 사용 가능하며, 상품 단위로 20% 할인이 적용된다.</p>
    <p>이마트 24는 매장에서 구매 시 최대 20% 할인을 제공한다. 할인 혜택은 일 4,000원, 월 2만원 한도로 구매 금액 1,000원당 200원씩 할인 받을 수 있다.</p>
`;

export const officialParisKtHtmlExcerpt = `
    <div class="elementor-widget-container"><h2 class="elementor-heading-title elementor-size-default">VVIP / VIP / GOLD</h2></div>
    <div class="elementor-widget-container"><h3 class="elementor-heading-title elementor-size-default">1,000원당 100원 할인</h3></div>
    <div class="elementor-widget-container"><h2 class="elementor-heading-title elementor-size-default">SILVER / WHITE 일반</h2></div>
    <div class="elementor-widget-container"><h3 class="elementor-heading-title elementor-size-default">1,000원당 50원 할인</h3></div>
    <div class="elementor-text-editor elementor-clearfix"><ul><li>포인트 차감 사용</li><li>1일1회 제한, 이용금액 최대 20만원 내에서 혜택 제공됩니다.</li></ul></div>
`;

export const officialParisSktHtmlExcerpt = `
    <div class="elementor-widget-container"><h2 class="elementor-heading-title elementor-size-default">모바일카드 VIP / GOLD</h2></div>
    <div class="elementor-widget-container"><h3 class="elementor-heading-title elementor-size-default">1,000원당 100원 혜택</h3></div>
    <div class="elementor-widget-container"><h2 class="elementor-heading-title elementor-size-default">모바일카드 Silver 플라스틱카드 전 고객</h2></div>
    <div class="elementor-widget-container"><h3 class="elementor-heading-title elementor-size-default">1,000원당 50원 혜택</h3></div>
    <div class="elementor-text-editor elementor-clearfix"><ul><li>1일 1회 이용금액의 최대 20만원 내에서 혜택 제공</li><li>다른 해피포인트 행사와는 중복되지 않습니다.</li></ul></div>
`;

export const officialTousLesJoursHtmlExcerpt = `
    <ul class="card_list">
        <li>
            <dl class="card_detail"><dd>
                <span class="card_name">T 멤버십</span>
                <span class="card_txt">
                    (할인형) VIP/골드 1,000원당 150원 할인 <br />
                    <span class="card_txt_ml">실버 1,000원당 50원</span> <br />
                    (적립형) VIP/골드 1,000원당 150원 적립<br />
                    <span class="card_txt_ml">실버 1,000원당 50원 적립</span>
                </span>
            </dd></dl>
            <div class="card_info2">- 1일 1회 사용 가능<br />- 구매금액 최대 20만원 내 할인/적립<br />- T 플러스포인트 사용 가능</div>
        </li>
        <li class="last">
            <dl class="card_detail"><dd>
                <span class="card_name">KT멤버십</span>
                <span class="card_txt">VIP/골드: 구매금액 1,000원당 150원 할인<br />실버/화이트/일반: 구매금액 1,000원당 100원 할인</span>
            </dd></dl>
            <div class="card_info">- 1일 1회 사용가능 <br>- 1회 최대 20만원 한도 할인</div>
        </li>
        <li>
            <dl class="card_detail"><dd>
                <span class="card_name">LG U+ 멤버십</span>
                <span class="card_txt">VVIP 1,000원당 150원 할인 <br>VIP 1,000원당 100원 할인 <br>우수 1,000원당 50원 할인</span>
            </dd></dl>
            <div class="card_info2">- 1일 1회 사용가능<br>- 1회 구매금액 최대 2만원 할인 가능 <br>- 월 구매금액 최대 10만원 할인 가능</div>
            <!--
                <span class="card_name">KT멤버십 더블할인</span>
                <span class="card_txt">구매금액 1,000원당 300원 할인</span>
                <div class="card_info">2018.10.01~2019.1.31까지 운영됩니다</div>
            -->
        </li>
    </ul>
`;

export const officialSktCuHtmlExcerpt = `
    <li>
        <a href='javascript:;' class='benefit-box' data-id="146">
            <div class='bnf-top'>
                <span class='logo'><img src="https://cdn.sktmembership.co.kr/cu.png" alt="CU" /></span>
                <span class='brand'>CU</span>
            </div>
            <div class='bnf-info'>
                <dl>
                    <dt>할인형</dt>
                    <dd>
                        <div class='info'>
                            <span class='badge-list'>
                                <i class="badge-circle vip"><span class='blind'>V</span></i>
                                <i class="badge-circle gold"><span class='blind'>G</span></i>
                            </span>
                            1천 원당 100원 할인
                        </div>
                        <div class='info'>
                            <span class='badge-list'>
                                <i class="badge-circle silver"><span class='blind'>S</span></i>
                            </span>
                            1천 원당 50원 할인
                        </div>
                        <div class='info'>포인트 사용가능 (100%, 10P 단위)</div>
                    </dd>
                </dl>
                <dl>
                    <dt>적립형</dt>
                    <dd><div class='info'>1천 원당 100P 적립</div></dd>
                </dl>
            </div>
            <span class="btn-round gra">자세히 보기</span>
        </a>
    </li>
`;

export const officialLguplusRows = [{
    rowStatus: null,
    urcMbspDivsCd: '01',
    urcMbspCatgNm: '생활/편의',
    urcMbspBnftDivsCd: '02',
    urcMbspJncoNo: 265,
    urcMbspCatgNo: 72,
    urcMbspJncoNm: 'GS25',
    jncoBnftThumCntn: 'VVIP/VIP : 1천원당 100원 할인<BR/>우수 : 1천원당 50원 할인',
    jncoBnftDetlCntn: '일 1회',
    jncoItduCntn: '대한민국 국가대표 편의점 GS25',
    urcBnftTadvMthdCntn: [
        '- 결제 시 직원에게 [멤버십 바코드] 제시',
        '■ 유의 사항',
        '- 월 최대 10만원까지 혜택 이용 가능하며, VIP이상 일 최대 2만원, 우수 최대 1만원 할인 가능',
        '- GS25에서 지정하는 행사상품(1+1, 2+1, 할인, 덤증정 등)은 U+멤버십 할인 제외',
        '- 일부매장(휴게소 등) 제외',
        '- 술, 담배, 상품권, 쓰레기 봉투 등 일부 상품 제외',
    ].join('<br />\n'),
    jncoTadvGrdDetlDscr: 'VVIP/VIP/우수',
    delYn: 'N',
    exhiYn: 'Y',
}];

export const officialNaverPayRows = [{
    promotionSeq: 24270982164496,
    promotionName: '투썸플레이스',
    promotionDescription: '포인트·머니 1.5만원 이상 결제 시',
    autoAcmYn: false,
    acmRate: null,
    acmAmount: null,
    applyBasisAmount: null,
    payMethodType: null,
    limitAcmCount: null,
    limitAcmAmount: null,
    exposeTitle: '3천원 적립',
    linkUrl: 'https://blog.naver.com/nv_npay/224363680700',
    detailUrl: 'https://pay.naver.com/benefit/payment/detail/24270982164496',
    promotionStartDateTime: 1785078000000,
    promotionEndDateTime: 1788188399000,
    cautionText: [
        '네이버페이 포인트·머니로 1.5만원 이상 전액 결제 시, 포인트 3천원 즉시 적립됩니다.',
        '결제 취소 시 적립받은 포인트 즉시 회수됩니다.',
        '본 이벤트는 사정에 의해 변경 또는 조기 종료될 수 있습니다.',
    ].join('\n'),
    exceedBudgetYn: false,
    phase: 'ONGOING',
}, {
    promotionSeq: 22873912741488,
    promotionName: '전자랜드',
    promotionDescription: '결제금액 구간 별',
    autoAcmYn: false,
    acmRate: null,
    acmAmount: null,
    applyBasisAmount: null,
    payMethodType: null,
    limitAcmCount: null,
    limitAcmAmount: null,
    exposeTitle: '5만원 혜택',
    linkUrl: 'https://m.blog.naver.com/nv_npay/224363680700',
    detailUrl: 'https://pay.naver.com/benefit/payment/detail/22873912741488',
    promotionStartDateTime: 1785510000000,
    promotionEndDateTime: 1788188399000,
    cautionText: [
        '갤럭시 폴더블 행사모델 결제 시 혜택 적용 가능',
        '기간 내 1인 1회 참여 가능',
        '전자랜드 삼성제휴카드 QR 대상',
        '삼성페이 결제 시 혜택 적용 불가',
        '자세한 내용은 매장 안내 참조 바랍니다.',
    ].join('\n'),
    exceedBudgetYn: false,
    phase: 'ONGOING',
}];
