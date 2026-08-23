/**
 * Minimal response-shaped excerpts preserved from official source documents collected on
 * 2026-08-23. Keep only fields and markup needed for parser regression tests; the complete
 * responses remain in the versioned promotion source document store.
 */
export const promotionOfficialFixtureMetadata = {
    collectedAt: '2026-08-23T05:46:36.808Z',
    sources: {
        skt: 'https://sktmembership.tworld.co.kr/mps/pc-bff/benefitbrand/list-tab1.do',
        lguplus: 'https://www.lguplus.com/uhdc/fo/prdv/mebfjnco/v1/jnco',
        naverpay: 'https://pay.naver.com/web-api/pub/benefit/payment/accumulation-promotions',
    },
};

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
