/**
 * target_engine.js
 * 위라클랩 타겟관리 정밀 타겟팅 엔진
 * - 고객 계약(가입내역, 보험1~20_만기일, 상품명) 전수 다중 파싱
 * - 생일 / 상령일 / 계약만기(자동차, 장기, 화재) 실시간 계산
 * - 가입/미가입 담보 기반 정밀 역타겟팅 (연금, 간병, 3대질병, 운전자)
 */

const TargetEngine = (function() {

    // 1. 날짜 및 나이 정밀 파서
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

    // 2. 만기일 파싱 헬퍼
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

    // 3. 고객의 전체 계약 전수 추출 (가입내역 JSON 배열, 보험1~20_만기일, 상품명 등)
    function extractAllClientContracts(client) {
        if (!client) return [];
        const target = client.crmData || client;
        const contracts = [];

        // A. 루트 만기일 및 상품명
        const rootMat = target['만기일'] || target['갱신일'] || target['자동차_만기일'];
        if (rootMat) {
            const parsed = parseDateString(rootMat);
            if (parsed) {
                contracts.push({
                    prodName: String(target['상품명'] || target['대표상품'] || '보험계약'),
                    compName: String(target['보험사명'] || target['보험사'] || ''),
                    insType: String(target['보험종류'] || target['구분'] || (target['자동차_만기일'] ? '자동차' : '')),
                    expireParsed: parsed,
                    raw: rootMat
                });
            }
        }

        // B. 보험1 ~ 보험20 개별 컬럼 스캔
        for (let i = 1; i <= 20; i++) {
            const matKey = target[`보험${i}_만기일`] || target[`보험${i}_갱신일`];
            const prodKey = target[`보험${i}_상품명`];
            const compKey = target[`보험${i}_보험사명`] || target[`보험${i}_보험회사`];
            const typeKey = target[`보험${i}_보험종류`] || target[`보험${i}_종류`];
            const covKey = target[`보험${i}_가입내역`];

            if (matKey || prodKey || covKey) {
                const parsed = parseDateString(matKey);
                contracts.push({
                    prodName: String(prodKey || `계약 ${i}`),
                    compName: String(compKey || ''),
                    insType: String(typeKey || ''),
                    coverage: String(covKey || ''),
                    expireParsed: parsed,
                    raw: matKey
                });
            }
        }

        // C. '가입내역' 및 '보험가입리스트' JSON 또는 배열 스캔
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
                        const matVal = c['만기일'] || c['expireDate'] || c['갱신일'] || c['만기'];
                        const parsed = parseDateString(matVal);
                        contracts.push({
                            prodName: String(c['상품명'] || c['prodName'] || c['증권명'] || `계약 ${idx+1}`),
                            compName: String(c['보험사명'] || c['보험회사'] || c['company'] || ''),
                            insType: String(c['보험종류'] || c['종류'] || c['category'] || ''),
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

    // 4. 고객별 타겟 조건 정밀 판별
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

        // 전체 계약 텍스트 (상품명 + 보험사 + 담보내역 통합)
        const combinedContractText = allContracts.map(c => `${c.prodName} ${c.compName} ${c.insType} ${c.coverage}`).join(' ') + ' ' + 
                                     String(target['터치인사이트'] || '') + ' ' + 
                                     String(target['가입내역요약'] || '') + ' ' +
                                     String(target['메모'] || '');

        // ==========================================
        // 1. 오늘의 추천 타겟 (Target)
        // ==========================================

        // A. 생일 고객
        if (menuTitle.includes('생일')) {
            if (!bday) return { match: false };
            if (bday.month === curMonth) {
                const diff = bday.day - curDay;
                if (diff === 0) {
                    return { match: true, badge: '🎂 오늘 생일', badgeColor: '#e11d48', badgeBg: '#ffe4e6', priority: 1, sortOrder: 0 };
                } else if (diff > 0 && diff <= 7) {
                    return { match: true, badge: `🎁 생일 D-${diff} (${bday.month}/${bday.day})`, badgeColor: '#e11d48', badgeBg: '#fff1f2', priority: 2, sortOrder: diff };
                } else if (diff > 7) {
                    return { match: true, badge: `생일 ${bday.month}/${bday.day}`, badgeColor: '#be123c', badgeBg: '#fff1f2', priority: 3, sortOrder: diff };
                } else {
                    // 이번달 이미 지난 생일
                    return { match: false };
                }
            }
            return { match: false };
        }

        // B. 상령일 안내 (생년월일 + 6개월: 보험나이 +1세 직전)
        if (menuTitle.includes('상령일')) {
            if (!bday) return { match: false };
            let sangMonth = bday.month + 6;
            if (sangMonth > 12) sangMonth -= 12;
            let sangDay = bday.day;

            if (sangMonth === curMonth) {
                const diff = sangDay - curDay;
                if (diff === 0) {
                    return { match: true, badge: '📈 오늘 상령일(+1세)', badgeColor: '#7c3aed', badgeBg: '#ede9fe', priority: 1, sortOrder: 0 };
                } else if (diff > 0) {
                    return { match: true, badge: `상령일 D-${diff} (${sangMonth}/${sangDay})`, badgeColor: '#7c3aed', badgeBg: '#ede9fe', priority: 2, sortOrder: diff };
                }
                return { match: false }; // 이미 지난 날짜 제외
            }
            return { match: false };
        }

        // C. 만기 고객 (자동차, 장기, 재물/화재, 일반)
        if (menuTitle.includes('만기')) {
            let matchedContract = null;
            let minDiff = 999;

            for (let c of allContracts) {
                if (!c.expireParsed) continue;
                const p = c.expireParsed;
                
                // 만기 연도 검증 (과거 연도 제외, 당해 연도 또는 1년 이내)
                if (p.year && p.year < curYear) continue;
                if (p.year && p.year > curYear + 1) continue;

                // 당월 만기 도래 여부 검증
                if (p.month === curMonth) {
                    const diff = p.day ? (p.day - curDay) : 0;
                    if (diff < 0) continue; // 이미 지난 만기일 제외

                    const text = `${c.prodName} ${c.compName} ${c.insType}`;
                    let isTargetType = false;

                    if (menuTitle.includes('자동차')) {
                        isTargetType = text.includes('자동차') || text.includes('다이렉트') || text.includes('차량') || text.includes('바이크') || (target['자동차_만기일'] != null);
                    } else if (menuTitle.includes('재물') || menuTitle.includes('화재')) {
                        isTargetType = text.includes('화재') || text.includes('재물') || text.includes('주택') || text.includes('사업장');
                    } else if (menuTitle.includes('장기')) {
                        isTargetType = (text.includes('장기') || text.includes('종합') || text.includes('건강') || text.includes('종신')) && !text.includes('자동차') && !text.includes('화재');
                    } else {
                        isTargetType = true;
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
        // 2. 이달의 추천 상품 (Product)
        // ==========================================

        // D-1. 연금 (노후 은퇴 준비)
        if (menuTitle.includes('연금')) {
            const hasPension = combinedContractText.includes('연금') || combinedContractText.includes('저축') || combinedContractText.includes('IRP') || combinedContractText.includes('퇴직');
            if (hasPension) {
                return { match: true, badge: '연금 리모델링/추가', badgeColor: '#0284c7', badgeBg: '#e0f2fe', priority: 2 };
            }
            // 미가입 고객 중 경제활동 연령층(35세~62세) 우선 추천
            if (age !== null && age >= 35 && age <= 62) {
                return { match: true, badge: `${age}세 노후준비(연금미보유)`, badgeColor: '#0369a1', badgeBg: '#e0f2fe', priority: 1 };
            }
            return { match: false };
        }

        // D-2. 간병&입원 (간병비/치매 플랜)
        if (menuTitle.includes('간병') || menuTitle.includes('입원')) {
            const hasCare = combinedContractText.includes('간병') || combinedContractText.includes('치매') || combinedContractText.includes('장기요양');
            if (hasCare) {
                return { match: true, badge: '간병비 보강/점검', badgeColor: '#059669', badgeBg: '#d1fae5', priority: 2 };
            }
            // 미가입 고객 중 45세 이상 우선 추천
            if (age !== null && age >= 45) {
                return { match: true, badge: `${age}세 간병플랜(미가입)`, badgeColor: '#047857', badgeBg: '#d1fae5', priority: 1 };
            }
            return { match: false };
        }

        // D-3. 주요치료비&생활비 (3대 질병: 암/뇌/심장)
        if (menuTitle.includes('치료비') || menuTitle.includes('생활비') || menuTitle.includes('3대')) {
            const hasMajor3 = combinedContractText.includes('암') || combinedContractText.includes('뇌혈관') || combinedContractText.includes('허혈성') || combinedContractText.includes('치료비');
            if (age !== null && age >= 25 && age <= 65) {
                const label = hasMajor3 ? `${age}세 3대치료비 한도보강` : `${age}세 3대진단비 신규준비`;
                return { match: true, badge: label, badgeColor: '#ea580c', badgeBg: '#ffedd5', priority: 1 };
            }
            return { match: false };
        }

        // D-4. 운전자 (형사합의금, 변호사선임비 등 최신개정)
        if (menuTitle.includes('운전자')) {
            const hasAuto = combinedContractText.includes('자동차') || combinedContractText.includes('차량') || combinedContractText.includes('다이렉트') || (target['자동차_만기일'] != null);
            const hasDriver = combinedContractText.includes('운전자');

            if (hasAuto && !hasDriver) {
                return { match: true, badge: '운전자 미보유 (차량보유)', badgeColor: '#4f46e5', badgeBg: '#e0e7ff', priority: 1 };
            } else if (hasDriver) {
                return { match: true, badge: '운전자 최신특약 리모델링', badgeColor: '#6366f1', badgeBg: '#e0e7ff', priority: 2 };
            } else if (age !== null && age >= 20 && age <= 70) {
                return { match: true, badge: `${age}세 필수 운전자보장`, badgeColor: '#4f46e5', badgeBg: '#e0e7ff', priority: 3 };
            }
            return { match: false };
        }

        // ==========================================
        // 3. 라이프 인사이트 / 데일리뉴스 / 보장분석
        // ==========================================
        if (menuTitle.includes('보장분석')) {
            const hasBoJang = combinedContractText.includes('종합') || combinedContractText.includes('건강') || allContracts.length > 0;
            const badge = hasBoJang ? `계약 ${allContracts.length}건 정밀분석` : '기본 보장분석 제안';
            return { match: true, badge: badge, badgeColor: '#0284c7', badgeBg: '#f0f9ff', priority: 1 };
        }

        if (menuTitle.includes('보상청구')) {
            return { match: true, badge: '청구 점검 대상', badgeColor: '#059669', badgeBg: '#ecfdf5', priority: 1 };
        }

        // 데일리뉴스, 안부인사말, 라이프케어: 전체 CRM 고객 대상 친절한 안부/정보
        return { match: true, badge: '추천 대상', badgeColor: '#475569', badgeBg: '#f8fafc', priority: 1 };
    }

    return {
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
