/**
 * target_engine.js
 * 위라클랩 타겟관리 정밀 타겟팅 엔진
 * - 고객 계약(CRM UID 기반 보험관리, 가입내역, 보험1~20_만기일) 실시간 계산
 * - 생일: 오직 당일(D-0) 생일자만 100% 매칭
 * - 상령일: 상령일 7일 전(D-7) ~ 상령일 당일(D-0)만 100% 매칭
 * - 만기: 만기 7일 전(D-7) ~ 만기 당일(D-0)만 100% 매칭
 *   - 자동차보험 만기: 보험종류 === '자동차보험' (또는 자동차_만기일)
 *   - 장기보험 만기: 보험종류 === '장기보험' (또는 장기)
 *   - 일반/재물보험 만기: 현재 미세팅 (매칭 비활성)
 * - 이달의 추천상품: 터치인사이트 100% 엄격 매칭 (미설정 시 절대 노출 안 됨)
 */

const TargetEngine = (function() {

    // 1. 생년월일 정밀 파서 (주민번호 우선, 생일/생년월일 보완)
    function parseClientBirthday(client) {
        if (!client) return null;
        const target = client.crmData || client;
        const today = new Date();
        const curYear = today.getFullYear();

        let birthYear = null;
        let birthMonth = null;
        let birthDay = null;

        // A. 주민번호 우선 파싱
        const juminRaw = target['주민번호'] || target['주민등록번호'] || target['피보험자주민번호'] || '';
        const jumin = String(juminRaw).replace(/[^0-9]/g, '');
        if (jumin.length >= 6) {
            let yy = parseInt(jumin.substring(0, 2), 10);
            birthMonth = parseInt(jumin.substring(2, 4), 10);
            birthDay = parseInt(jumin.substring(4, 6), 10);
            if (jumin.length >= 7) {
                const g = parseInt(jumin.charAt(6), 10);
                if ([1, 2, 5, 6].includes(g)) birthYear = 1900 + yy;
                else if ([3, 4, 7, 8].includes(g)) birthYear = 2000 + yy;
            }
            if (!birthYear) {
                birthYear = yy >= 30 ? (1900 + yy) : (2000 + yy);
            }
        }

        // B. 생일 / 생년월일 필드 보완
        if (!birthMonth || !birthDay) {
            const birthStr = String(target['생일'] || target['생년월일'] || target['피보험자생년월일'] || '').trim();
            if (birthStr && birthStr !== '-') {
                const clean = birthStr.replace(/[^0-9]/g, '');
                if (clean.length === 8) {
                    birthYear = parseInt(clean.substring(0, 4), 10);
                    birthMonth = parseInt(clean.substring(4, 6), 10);
                    birthDay = parseInt(clean.substring(6, 8), 10);
                } else if (clean.length === 6) {
                    let yy = parseInt(clean.substring(0, 2), 10);
                    birthYear = yy >= 30 ? (1900 + yy) : (2000 + yy);
                    birthMonth = parseInt(clean.substring(2, 4), 10);
                    birthDay = parseInt(clean.substring(4, 6), 10);
                } else if (clean.length === 4) {
                    birthMonth = parseInt(clean.substring(0, 2), 10);
                    birthDay = parseInt(clean.substring(2, 4), 10);
                }
            }
        }

        if (birthMonth >= 1 && birthMonth <= 12 && birthDay >= 1 && birthDay <= 31) {
            const age = birthYear ? (curYear - birthYear) : null;
            return {
                year: birthYear,
                month: birthMonth,
                day: birthDay,
                age: age
            };
        }
        return null;
    }

    // 2. 만기일/날짜 파싱 헬퍼 (YYYY-MM-DD, YYYYMMDD, MMDD 등)
    function parseDateString(dateVal) {
        if (!dateVal) return null;
        const str = String(dateVal).trim();
        if (!str || str === '-' || str === 'null' || str === 'undefined') return null;

        const cleanNums = str.replace(/[^0-9]/g, '');
        let y = null, m = null, d = null;

        if (cleanNums.length >= 8) {
            y = parseInt(cleanNums.substring(0, 4), 10);
            m = parseInt(cleanNums.substring(4, 6), 10);
            d = parseInt(cleanNums.substring(6, 8), 10);
        } else if (cleanNums.length === 4) {
            m = parseInt(cleanNums.substring(0, 2), 10);
            d = parseInt(cleanNums.substring(2, 4), 10);
        } else {
            const match = str.match(/(\d{4})?[-\.\/\s월]?\s*(\d{1,2})[-\.\/\s일]?\s*(\d{1,2})?/);
            if (match) {
                if (match[1] && match[1].length === 4) y = parseInt(match[1], 10);
                if (match[2]) m = parseInt(match[2], 10);
                if (match[3]) d = parseInt(match[3], 10);
            }
        }

        if (m >= 1 && m <= 12) {
            return { year: y, month: m, day: (d >= 1 && d <= 31 ? d : 1) };
        }
        return null;
    }

    // 3. 고객의 전체 계약 전수 추출 (가입내역 JSON 배열, 보험1~20_만기일, 상품명, 자동차_만기일 등)
    function extractAllClientContracts(client) {
        if (!client) return [];
        const target = client.crmData || client;
        const contracts = [];

        // A. 루트 자동차 만기일
        if (target['자동차_만기일']) {
            const parsed = parseDateString(target['자동차_만기일']);
            if (parsed) {
                contracts.push({
                    prodName: String(target['차량번호'] || target['차종'] || target['자동차보험사'] || '자동차보험'),
                    compName: String(target['차_보험사'] || target['차_보험사명'] || target['자동차보험사'] || ''),
                    insType: '자동차보험',
                    expireParsed: parsed,
                    raw: target['자동차_만기일']
                });
            }
        }

        // B. 루트 일반 만기일 및 상품명
        const rootMat = target['만기일'] || target['갱신일'];
        if (rootMat) {
            const parsed = parseDateString(rootMat);
            if (parsed) {
                contracts.push({
                    prodName: String(target['상품명'] || target['대표상품'] || '보험계약'),
                    compName: String(target['보험사명'] || target['보험사'] || ''),
                    insType: String(target['보험종류'] || target['구분'] || '장기보험'),
                    expireParsed: parsed,
                    raw: rootMat
                });
            }
        }

        // C. 보험1 ~ 보험20 개별 컬럼 스캔
        for (let i = 1; i <= 20; i++) {
            const matKey = target[`보험${i}_만기일`] || target[`보험${i}_갱신일`];
            const prodKey = target[`보험${i}_상품명`];
            const compKey = target[`보험${i}_보험사명`] || target[`보험${i}_보험회사`] || target[`보험${i}_사명`];
            const typeKey = target[`보험${i}_보험종류`] || target[`보험${i}_종류`];
            const covKey = target[`보험${i}_가입내역`];

            if (matKey || prodKey || covKey) {
                const parsed = parseDateString(matKey);
                contracts.push({
                    prodName: String(prodKey || `계약 ${i}`),
                    compName: String(compKey || ''),
                    insType: String(typeKey || '장기보험'),
                    coverage: String(covKey || ''),
                    expireParsed: parsed,
                    raw: matKey
                });
            }
        }

        // D. '가입내역' 및 '보험가입리스트' JSON 또는 배열 스캔
        let rawList = target['가입내역'] || target['보험가입리스트'];
        if (rawList) {
            let parsedList = [];
            if (Array.isArray(rawList)) {
                parsedList = rawList;
            } else if (typeof rawList === 'string') {
                try {
                    parsedList = JSON.parse(rawList);
                } catch(e) {}
            }
            if (Array.isArray(parsedList)) {
                parsedList.forEach((c, idx) => {
                    if (c && typeof c === 'object') {
                        const matVal = c['만기일'] || c['expireDate'] || c['갱신일'] || c['renewalDate'] || c['만기'];
                        const parsed = parseDateString(matVal);
                        const insType = String(c['보험종류'] || c['종류'] || c['category'] || (c['차종'] || c['차량번호'] ? '자동차보험' : '장기보험'));
                        contracts.push({
                            prodName: String(c['상품명'] || c['product'] || c['증권명'] || c['차량번호'] || `계약 ${idx+1}`),
                            compName: String(c['보험사명'] || c['보험회사'] || c['company'] || c['차_보험사명'] || ''),
                            insType: insType,
                            coverage: typeof c['가입내역'] === 'string' ? c['가입내역'] : JSON.stringify(c['가입내역'] || {}),
                            expireParsed: parsed,
                            raw: matVal
                        });
                    }
                });
            }
        }

        return contracts;
    }

    // 4. 고객별 타겟 조건 정밀 판별 (CRM UID 매칭 보험종류 & 터치인사이트 100% 엄격 매칭)
    function getCustomerTargetStatus(client, menuTitle) {
        const target = client.crmData || client;
        if (!target) return { match: false };

        const today = new Date();
        const curYear = today.getFullYear();
        const curMonth = today.getMonth() + 1;
        const curDay = today.getDate();

        const bday = parseClientBirthday(target);
        const age = bday ? bday.age : null;
        const allContracts = extractAllClientContracts(target);

        // ==========================================
        // 1. 오늘의 추천 타겟 (Target)
        // ==========================================

        // A. 생일 고객 (오직 당일 생일자 D-0만 100% 한정, 지난 날짜 및 D-1 이상 제외)
        if (menuTitle.includes('생일')) {
            if (!bday) return { match: false };
            if (bday.month === curMonth && bday.day === curDay) {
                return { match: true, badge: '🎂 오늘 생일', badgeColor: '#e11d48', badgeBg: '#ffe4e6', priority: 1, sortOrder: 0 };
            }
            return { match: false };
        }

        // B. 상령일 안내 (생월 + 6개월: 상령일 7일 전(D-7)부터 당일(D-0)까지만 노출)
        if (menuTitle.includes('상령일')) {
            if (!bday) return { match: false };
            let sangMonth = bday.month + 6;
            if (sangMonth > 12) sangMonth -= 12;
            let sangDay = bday.day;

            if (sangMonth === curMonth) {
                const diff = sangDay - curDay;
                if (diff === 0) {
                    return { match: true, badge: '📈 오늘 상령일(+1세)', badgeColor: '#7c3aed', badgeBg: '#ede9fe', priority: 1, sortOrder: 0 };
                } else if (diff > 0 && diff <= 7) {
                    return { match: true, badge: `상령일 D-${diff} (${sangMonth}/${sangDay})`, badgeColor: '#7c3aed', badgeBg: '#ede9fe', priority: 2, sortOrder: diff };
                }
            }
            return { match: false };
        }

        // C. 만기 고객 (자동차보험 만기 vs 장기보험 만기 - CRM 보험관리 기준)
        if (menuTitle.includes('만기')) {
            // [일반/재물보험 만기는 현재 미세팅 처리]
            if (menuTitle.includes('재물') || menuTitle.includes('화재') || menuTitle.includes('일반')) {
                return { match: false };
            }

            let matchedContract = null;
            let minDiff = 999;

            for (let c of allContracts) {
                if (!c.expireParsed) continue;
                const p = c.expireParsed;
                
                // 만기 연도 검증 (과거 연도 제외, 당해 연도 또는 1년 이내)
                if (p.year && p.year < curYear) continue;
                if (p.year && p.year > curYear + 1) continue;

                // 당월 만기 도래 여부 검증 (만기 7일 전(D-7)부터 만기 당일(D-0)까지만)
                if (p.month === curMonth) {
                    const diff = p.day ? (p.day - curDay) : 0;
                    if (diff < 0 || diff > 7) continue; // 7일 초과 또는 이미 지난 만기일 제외

                    const insType = String(c.insType || '').trim();
                    let isTargetType = false;

                    // 1) 자동차보험 만기: 보험종류가 '자동차보험'(또는 '자동차')이거나 자동차_만기일
                    if (menuTitle.includes('자동차')) {
                        isTargetType = insType.includes('자동차') || c.prodName.includes('자동차') || (target['자동차_만기일'] != null);
                    } 
                    // 2) 장기보험 만기: 보험종류가 '장기보험'(또는 '장기')인 계약 (자동차가 아닌 계약)
                    else if (menuTitle.includes('장기')) {
                        isTargetType = insType.includes('장기') || (!insType.includes('자동차') && !c.prodName.includes('자동차'));
                    }

                    if (isTargetType && diff < minDiff) {
                        minDiff = diff;
                        matchedContract = { ...c, diff: diff, month: p.month, day: p.day };
                    }
                }
            }

            if (matchedContract) {
                const badgeText = matchedContract.diff === 0 
                    ? '오늘 만기' 
                    : `만기 D-${matchedContract.diff} (${matchedContract.month}/${matchedContract.day})`;
                return { match: true, badge: badgeText, badgeColor: '#d97706', badgeBg: '#fef3c7', priority: 1, sortOrder: matchedContract.diff };
            }
            return { match: false };
        }

        // ==========================================
        // 2. 이달의 추천 상품 (Product) - 터치인사이트 100% 엄격 매칭
        // 터치인사이트가 체크 안 된 고객은 절대 나오지 않음
        // ==========================================
        const insightStr = String(target['터치인사이트'] || target['관심사'] || '').trim();

        // D-1. 연금: 터치인사이트에 '연금'이 체크된 고객만!
        if (menuTitle.includes('연금')) {
            if (insightStr.includes('연금')) {
                return { match: true, badge: '🎯 터치인사이트: 연금', badgeColor: '#0284c7', badgeBg: '#e0f2fe', priority: 1, sortOrder: 0 };
            }
            return { match: false };
        }

        // D-2. 간병&입원: 터치인사이트에 '간병' 또는 '치매'가 체크된 고객만!
        if (menuTitle.includes('간병') || menuTitle.includes('입원')) {
            if (insightStr.includes('간병') || insightStr.includes('치매')) {
                return { match: true, badge: '🎯 터치인사이트: 간병/치매', badgeColor: '#059669', badgeBg: '#d1fae5', priority: 1, sortOrder: 0 };
            }
            return { match: false };
        }

        // D-3. 주요치료비&생활비: 터치인사이트에 '주요치료비' 또는 '생활비'가 체크된 고객만!
        if (menuTitle.includes('치료비') || menuTitle.includes('생활비') || menuTitle.includes('3대')) {
            if (insightStr.includes('주요치료비') || insightStr.includes('생활비') || insightStr.includes('진단비')) {
                return { match: true, badge: '🎯 터치인사이트: 치료비/생활비', badgeColor: '#ea580c', badgeBg: '#ffedd5', priority: 1, sortOrder: 0 };
            }
            return { match: false };
        }

        // D-4. 운전자: 터치인사이트에 '운전자'가 체크된 고객만!
        if (menuTitle.includes('운전자')) {
            if (insightStr.includes('운전자')) {
                return { match: true, badge: '🎯 터치인사이트: 운전자', badgeColor: '#4f46e5', badgeBg: '#e0e7ff', priority: 1, sortOrder: 0 };
            }
            return { match: false };
        }

        // ==========================================
        // 3. 라이프 인사이트 / 데일리뉴스 / 보장분석
        // ==========================================
        if (menuTitle.includes('보장분석')) {
            return { match: true, badge: '보장분석 제안', badgeColor: '#0284c7', badgeBg: '#f0f9ff', priority: 1 };
        }

        if (menuTitle.includes('보상청구')) {
            return { match: true, badge: '청구 점검 대상', badgeColor: '#059669', badgeBg: '#ecfdf5', priority: 1 };
        }

        return { match: true, badge: '고객관리', badgeColor: '#475569', badgeBg: '#f8fafc', priority: 1 };
    }

    function isTargetingMenu(menuTitle) {
        if (!menuTitle) return false;
        const nonTargeting = ['데일리뉴스', '보장분석', '안부', '라이프케어', '내 PC 콘텐츠 등록', '재물보험', '일반보험'];
        for (let nt of nonTargeting) {
            if (menuTitle.includes(nt)) return false;
        }
        const targetingKeywords = ['생일', '상령일', '자동차', '장기보험', '연금', '간병', '입원', '치료비', '생활비', '3대', '운전자'];
        return targetingKeywords.some(k => menuTitle.includes(k));
    }

    return {
        isTargetingMenu: isTargetingMenu,
        parseClientBirthday: parseClientBirthday,
        parseDateString: parseDateString,
        extractAllClientContracts: extractAllClientContracts,
        getCustomerTargetStatus: getCustomerTargetStatus
    };

})();

if (typeof window !== 'undefined') { window.TargetEngine = TargetEngine; }
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TargetEngine;
}
