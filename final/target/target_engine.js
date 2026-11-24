/**
 * target_engine.js
 * 위라클랩 타겟관리 정밀 타겟팅 엔진
 * - 고객 계약(CRM UID 기반 보험관리, 가입내역, 보험1~20_만기일) 실시간 계산
 * - 생일: 오직 당일(D-0) 생일자만 100% 매칭
 * - 상령일: 상령일 7일 전(D-7) ~ 상령일 당일(D-0)만 100% 매칭
 * - 만기: 만기 30일 전(D-30) ~ 만기 당일(D-0)까지 월 경계 완벽 매칭
 *   - 자동차보험 만기: 보험종류 === '자동차보험' (또는 자동차_만기일, 차_만기일 등)
 *   - 장기보험 만기: 보험종류 === '장기보험' (또는 장기, 만기일자, 80세/100세만기)
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

    // 2. 만기일/날짜 파싱 헬퍼 (YYYY-MM-DD, YYYYMMDD, MMDD, 80세만기, 20년만기 등 지원)
    function parseDateString(dateVal, clientBirth, startDate) {
        if (!dateVal) return null;
        const str = String(dateVal).trim();
        if (!str || str === '-' || str === 'null' || str === 'undefined') return null;

        // 특수 텍스트 만기 처리 1: "80세만기", "100세만기", "90세만기" 등 (고객 생년월일 + N세)
        if (str.includes('세만기') && clientBirth && clientBirth.year) {
            const ageMatch = str.match(/(\d{1,3})\s*세만기/);
            if (ageMatch) {
                const targetAge = parseInt(ageMatch[1], 10);
                return {
                    year: clientBirth.year + targetAge,
                    month: clientBirth.month || 1,
                    day: clientBirth.day || 1
                };
            }
        }

        // 특수 텍스트 만기 처리 2: "10년만기", "20년만기", "1년만기" 등 (체결일 + N년)
        if (str.includes('년만기')) {
            const yearMatch = str.match(/(\d{1,2})\s*년만기/);
            if (yearMatch) {
                const addYears = parseInt(yearMatch[1], 10);
                let baseYear = null;
                let baseMonth = 1;
                let baseDay = 1;

                if (startDate) {
                    const sp = (typeof startDate === 'object' && startDate.year) ? startDate : parseDateString(startDate);
                    if (sp && sp.year) {
                        baseYear = sp.year;
                        baseMonth = sp.month || 1;
                        baseDay = sp.day || 1;
                    }
                }

                if (baseYear) {
                    return {
                        year: baseYear + addYears,
                        month: baseMonth,
                        day: baseDay
                    };
                }
            }
        }

        const cleanNums = str.replace(/[^0-9]/g, '');
        let y = null, m = null, d = null;

        if (cleanNums.length >= 8) {
            y = parseInt(cleanNums.substring(0, 4), 10);
            m = parseInt(cleanNums.substring(4, 6), 10);
            d = parseInt(cleanNums.substring(6, 8), 10);
        } else if (cleanNums.length === 6) {
            let yy = parseInt(cleanNums.substring(0, 2), 10);
            let firstYear = yy >= 30 ? (1900 + yy) : (2000 + yy);
            let mm = parseInt(cleanNums.substring(2, 4), 10);
            let dd = parseInt(cleanNums.substring(4, 6), 10);
            if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
                y = firstYear;
                m = mm;
                d = dd;
            } else {
                y = parseInt(cleanNums.substring(0, 4), 10);
                m = parseInt(cleanNums.substring(4, 6), 10);
                d = 1;
            }
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

    // 2-1. [핵심 엔진 개선] 계약 객체에서 실제 만기 날짜(갱신일 등)를 1순위로 탐색하는 지능형 해석기
    function resolveContractExpiry(contractObj, clientBirth, clientRoot) {
        if (!contractObj || typeof contractObj !== 'object') return { parsed: null, raw: '' };

        // 가능한 만기/갱신일 후보 필드 목록
        const candidates = [
            contractObj['갱신일'],
            contractObj['갱신일자'],
            contractObj['renewalDate'],
            contractObj['expireDate'],
            contractObj['만기일자'],
            contractObj['만기일'],
            contractObj['만기'],
            contractObj['종료일'],
            contractObj['책임종료일']
        ];

        // 체결일 후보 (년만기 자동 계산 기준점)
        const startDates = [
            contractObj['체결일'],
            contractObj['계약일'],
            contractObj['책임개시일'],
            contractObj['가입일'],
            contractObj['date'],
            clientRoot ? (clientRoot['체결일'] || clientRoot['계약일']) : null
        ];
        let validStart = null;
        for (let s of startDates) {
            if (s && String(s).trim()) {
                const p = parseDateString(s);
                if (p && p.year) { validStart = p; break; }
            }
        }

        // 1순위: '2026-11-28'과 같은 유효한 실제 날짜 우선 파싱 (20년만기 텍스트보다 갱신일 날짜 우선 인식)
        for (let val of candidates) {
            if (!val) continue;
            const s = String(val).trim();
            if (!s || s === '-' || s.includes('만기')) continue;
            const parsed = parseDateString(s, clientBirth, validStart);
            if (parsed && parsed.year) {
                return { parsed: parsed, raw: s };
            }
        }

        // 2순위: 1순위 실제 날짜가 없을 경우, '20년만기', '80세만기' 등 특수 텍스트 만기일 파싱
        for (let val of candidates) {
            if (!val) continue;
            const s = String(val).trim();
            if (!s || s === '-') continue;
            const parsed = parseDateString(s, clientBirth, validStart);
            if (parsed) {
                return { parsed: parsed, raw: s };
            }
        }

        return { parsed: null, raw: '' };
    }

    // 3. 고객의 전체 계약 전수 추출 (가입내역 JSON 배열, 보험1~20_만기일자, 자동차_만기일 등 전수 포괄)
    function extractAllClientContracts(client) {
        if (!client) return [];
        const target = client.crmData || client;
        const contracts = [];
        const clientBirth = parseClientBirthday(client);

        // A. 루트 자동차 만기일 (다양한 필드명 포괄 지원)
        const autoExpiry = resolveContractExpiry({
            '만기일': target['자동차_만기일'] || target['자동차만기일'] || target['차_만기일'] || target['차량_만기일'] || target['차량만기일'] || target['자동차_갱신일'] || target['책임종료일'],
            '갱신일': target['자동차_갱신일'] || target['차_갱신일']
        }, clientBirth, target);

        if (autoExpiry.parsed) {
            contracts.push({
                prodName: String(target['차량번호'] || target['차종'] || target['자동차보험사'] || '자동차보험'),
                compName: String(target['차_보험사'] || target['차_보험사명'] || target['자동차보험사'] || ''),
                insType: '자동차보험',
                expireParsed: autoExpiry.parsed,
                raw: autoExpiry.raw
            });
        }

        // B. 루트 일반 만기일 및 상품명 (실제 갱신일 우선 인식)
        const rootExpiry = resolveContractExpiry({
            '만기일': target['만기일'],
            '만기일자': target['만기일자'],
            '갱신일': target['갱신일'],
            '갱신일자': target['갱신일자'],
            'expireDate': target['expireDate'],
            'renewalDate': target['renewalDate'],
            '체결일': target['체결일'] || target['계약일']
        }, clientBirth, target);

        if (rootExpiry.parsed) {
            contracts.push({
                prodName: String(target['상품명'] || target['대표상품'] || '보험계약'),
                compName: String(target['보험사명'] || target['보험사'] || ''),
                insType: String(target['보험종류'] || target['구분'] || '장기보험'),
                expireParsed: rootExpiry.parsed,
                raw: rootExpiry.raw
            });
        }

        // C. 보험1 ~ 보험20 개별 컬럼 스캔
        for (let i = 1; i <= 20; i++) {
            const prodKey = target[`보험${i}_상품명`];
            const compKey = target[`보험${i}_보험사명`] || target[`보험${i}_보험회사`] || target[`보험${i}_사명`];
            const typeKey = target[`보험${i}_보험종류`] || target[`보험${i}_종류`];
            const covKey = target[`보험${i}_가입내역`];

            const colExpiry = resolveContractExpiry({
                '만기일': target[`보험${i}_만기일`],
                '만기일자': target[`보험${i}_만기일자`],
                '갱신일': target[`보험${i}_갱신일`],
                '갱신일자': target[`보험${i}_갱신일자`],
                '체결일': target[`보험${i}_체결일`],
                '계약일': target[`보험${i}_계약일`]
            }, clientBirth, target);

            if (colExpiry.parsed || prodKey || covKey) {
                contracts.push({
                    prodName: String(prodKey || `계약 ${i}`),
                    compName: String(compKey || ''),
                    insType: String(typeKey || '장기보험'),
                    coverage: String(covKey || ''),
                    expireParsed: colExpiry.parsed,
                    raw: colExpiry.raw
                });
            }
        }

        // D. '가입내역' 및 '보험가입리스트' JSON 또는 배열 스캔 (실제 갱신일 우선 및 년만기 연산 지원)
        let rawList = target['가입내역'] || target['보험가입리스트'] || target['계약목록'] || target['insuranceList'];
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
                        const insExpiry = resolveContractExpiry(c, clientBirth, target);
                        const insType = String(c['보험종류'] || c['종류'] || c['category'] || (c['차종'] || c['차량번호'] ? '자동차보험' : '장기보험'));
                        contracts.push({
                            prodName: String(c['상품명'] || c['product'] || c['증권명'] || c['차량번호'] || `계약 ${idx+1}`),
                            compName: String(c['보험사명'] || c['보험회사'] || c['company'] || c['차_보험사명'] || ''),
                            insType: insType,
                            coverage: typeof c['가입내역'] === 'string' ? c['가입내역'] : JSON.stringify(c['가입내역'] || {}),
                            expireParsed: insExpiry.parsed,
                            raw: insExpiry.raw
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

        const allContracts = extractAllClientContracts(client);

        // ==========================================
        // 1. 오늘의 추천 타겟 (Targeting)
        // ==========================================

        // A. 생일 고객 (오직 당일(D-0) 생일자만 100% 매칭)
        if (menuTitle.includes('생일')) {
            const bday = parseClientBirthday(client);
            if (!bday) return { match: false };
            if (bday.month === curMonth && bday.day === curDay) {
                return {
                    match: true,
                    badge: '🎂 오늘 생일',
                    badgeColor: '#ec4899',
                    badgeBg: '#fdf2f8',
                    priority: 0,
                    sortOrder: 0
                };
            }
            return { match: false };
        }

        // B. 상령일 고객 (오직 상령일 7일 전(D-7) ~ 상령일 당일(D-0)만 100% 매칭)
        if (menuTitle.includes('상령일')) {
            const bday = parseClientBirthday(client);
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

        // C. 만기 고객 (자동차보험 만기 vs 장기보험 만기 - D-30 및 월 경계 완벽 지원)
        if (menuTitle.includes('만기')) {
            // [일반/재물보험 만기는 현재 미세팅 처리]
            if (menuTitle.includes('재물') || menuTitle.includes('화재') || menuTitle.includes('일반')) {
                return { match: false };
            }

            let matchedContract = null;
            let minDiff = 999;
            const todayMidnight = new Date(curYear, today.getMonth(), curDay).getTime();
            const oneDayMs = 1000 * 60 * 60 * 24;

            for (let c of allContracts) {
                if (!c.expireParsed) continue;
                const p = c.expireParsed;
                
                // 만기 연도 확정 (만약 연도가 없으면 올해 또는 내년으로 간주)
                let expYear = p.year;
                if (!expYear) {
                    expYear = curYear;
                    const testDate = new Date(curYear, p.month - 1, p.day).getTime();
                    if (testDate < todayMidnight) expYear = curYear + 1;
                }

                const expDateObj = new Date(expYear, p.month - 1, p.day);
                const expMidnight = expDateObj.getTime();

                // 정확한 남은 일수 계산 (실제 Date 타임스탬프 차이)
                const diff = Math.round((expMidnight - todayMidnight) / oneDayMs);

                // 영업 타겟 범위: 만기 30일 전(D-30)부터 만기 당일(D-0)까지 완벽 포괄
                if (diff < 0 || diff > 30) continue;

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
                    matchedContract = { ...c, diff: diff, year: expYear, month: p.month, day: p.day };
                }
            }

            if (matchedContract) {
                let badgeText = '';
                let badgeColor = '#d97706';
                let badgeBg = '#fef3c7';

                if (matchedContract.diff === 0) {
                    badgeText = '🔥 오늘 만기';
                    badgeColor = '#dc2626';
                    badgeBg = '#fee2e2';
                } else if (matchedContract.diff <= 7) {
                    badgeText = `⏰ 만기 D-${matchedContract.diff} (${matchedContract.month}/${matchedContract.day})`;
                    badgeColor = '#ea580c';
                    badgeBg = '#ffedd5';
                } else {
                    badgeText = `만기 D-${matchedContract.diff} (${matchedContract.month}/${matchedContract.day})`;
                    badgeColor = '#d97706';
                    badgeBg = '#fef3c7';
                }

                return {
                    match: true,
                    badge: badgeText,
                    badgeColor: badgeColor,
                    badgeBg: badgeBg,
                    priority: matchedContract.diff === 0 ? 0 : (matchedContract.diff <= 7 ? 1 : 2),
                    sortOrder: matchedContract.diff
                };
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
            const records = client._claimRecords || (client.crmData && client.crmData._claimRecords) || [];
            if (!records || records.length === 0) {
                return { match: false };
            }

            const today = new Date();
            const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
            const oneDayMs = 24 * 60 * 60 * 1000;

            let latestValidClaim = null;
            let minDiffDays = 9999;

            for (let r of records) {
                const claimDateStr = r.claimDate || r.date || r['청구일시'] || r['접수일자'] || '';
                if (!claimDateStr) continue;

                const cDate = parseDateString(claimDateStr.substring(0, 10));
                if (!cDate) continue;
                const cMidnight = new Date(cDate.year || today.getFullYear(), (cDate.month || 1) - 1, cDate.day || 1).getTime();

                // 오늘 기준 과거 31일 이내 (당일 포함: 0 <= diffDays <= 31, 시간 오차 감안하여 -1도 당일 처리)
                const diffTime = todayMidnight - cMidnight;
                const diffDays = Math.round(diffTime / oneDayMs);

                if (diffDays >= -1 && diffDays <= 31) {
                    const normDiff = Math.max(0, diffDays);
                    if (normDiff < minDiffDays) {
                        minDiffDays = normDiff;
                        latestValidClaim = { ...r, diffDays: normDiff };
                    }
                }
            }

            if (latestValidClaim) {
                const dayText = minDiffDays === 0 ? '당일 청구' : `청구 ${minDiffDays}일차`;
                const company = latestValidClaim.companyName || latestValidClaim['접수보험사'] || latestValidClaim.company || '';
                const badgeText = company ? `📋 ${dayText} (${company})` : `📋 ${dayText}`;
                return {
                    match: true,
                    badge: badgeText,
                    badgeColor: '#059669',
                    badgeBg: '#ecfdf5',
                    priority: 1,
                    sortOrder: minDiffDays
                };
            }

            return { match: false };
        }

        return { match: true, badge: '고객관리', badgeColor: '#475569', badgeBg: '#f8fafc', priority: 1 };
    }

    function isTargetingMenu(menuTitle) {
        if (!menuTitle) return false;
        const nonTargeting = ['데일리뉴스', '보장분석', '안부', '라이프케어', '내 PC 콘텐츠 등록', '재물보험', '일반보험'];
        for (let nt of nonTargeting) {
            if (menuTitle.includes(nt)) return false;
        }
        const targetingKeywords = ['생일', '상령일', '자동차', '장기보험', '보상청구', '연금', '간병', '입원', '치료비', '생활비', '3대', '운전자'];
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
