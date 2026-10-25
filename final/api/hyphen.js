const https = require('https');

// 하이픈(HYPHEN) 인증 시크릿 키 설정 (서버 측 안전 보관)
const HYPHEN_USER_ID = process.env.HYPHEN_USER_ID || 'iart48';
const HYPHEN_HKEY = process.env.HYPHEN_HKEY || 'a56d73c4a99761d7';
const HYPHEN_EKEY = process.env.HYPHEN_EKEY || 'e33f3fa938aa545b';

// 엔드포인트: 국세청 홈택스(숨은보험금) & 건보공단(언더라이팅) & 한국신용정보원(기지급실손)
const EP_HOMETAX = '/in0076001151';     // 국세청 연말정산간소화 (G0001 보장성보험, G0003 의료비, anulAmt2 기수령액)
const EP_NHIS = '/in0165001213';        // 건보공단 진료/투약내역 (언더라이팅 질병심사 및 병원비 본인부담금)
const EP_KCIS_PAYOUT = '/in0017000052'; // 한국신용정보원 내보험다보여 실손형 보장 지급내역

function callHyphen(endpoint, payloadObj) {
    return new Promise((resolve) => {
        const payloadStr = JSON.stringify(payloadObj);
        const options = {
            hostname: 'api.hyphen.im',
            port: 443,
            path: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'user-id': HYPHEN_USER_ID,
                'Hkey': HYPHEN_HKEY,
                'hyphen-gustation': HYPHEN_EKEY,
                'Content-Length': Buffer.byteLength(payloadStr)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        success: res.statusCode >= 200 && res.statusCode < 300,
                        data: parsed
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        success: false,
                        raw: data,
                        error: '응답 데이터 JSON 파싱 실패'
                    });
                }
            });
        });

        req.on('error', (err) => {
            resolve({
                statusCode: 500,
                success: false,
                error: err.message
            });
        });

        req.write(payloadStr);
        req.end();
    });
}

// 생년월일 8자리(YYYYMMDD) 계산 헬퍼
function getBirthYear8(ssn1, ssn2) {
    const cleanSsn1 = String(ssn1 || '').replace(/[^0-9]/g, '');
    const cleanSsn2 = String(ssn2 || '').replace(/[^0-9]/g, '');
    if (cleanSsn1.length === 8) return cleanSsn1;
    if (cleanSsn1.length !== 6) return cleanSsn1;

    const firstChar = cleanSsn2.charAt(0);
    let prefix = '19';
    if (firstChar === '3' || firstChar === '4' || firstChar === '7' || firstChar === '8') {
        prefix = '20';
    } else if (firstChar === '9' || firstChar === '0') {
        prefix = '18';
    }
    return prefix + cleanSsn1;
}

module.exports = async (req, res) => {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST 메서드만 지원합니다.' });
    }

    try {
        const body = req.body || {};
        const { serviceType = 'hometax', action, name, mobileNo, ssn1, ssn2, step, stepData, cookieData, cookie, attrYr, loginOrgCd } = body;
        const isStep2 = step === '2' || step === 'sign';
        const isQuery = step === 'query' || step === 'data';

        const cleanPhone = mobileNo ? String(mobileNo).replace(/[^0-9]/g, '') : '';
        const cleanSsn1 = ssn1 ? String(ssn1).replace(/[^0-9]/g, '') : '';
        const cleanSsn2 = ssn2 ? String(ssn2).replace(/[^0-9]/g, '') : '';
        const birth8 = getBirthYear8(cleanSsn1, cleanSsn2);
        const fullSsn = cleanSsn1 + cleanSsn2;
        const selectedOrgCd = loginOrgCd || 'kakao';

        let endpoint = EP_HOMETAX;
        let hyphenPayload = {};

        if (serviceType === 'kcis_payout') {
            // [한국신용정보원 내보험다보여 실손형 보장 지급내역 엔드포인트 /in0017000052]
            endpoint = EP_KCIS_PAYOUT;
            hyphenPayload = {
                userId: String(body.userId || '').trim(),
                userPw: String(body.userPw || '').trim()
            };
        } else if (serviceType === 'nhis') {
            // [건보공단 진료내역 엔드포인트 /in0165001213]
            endpoint = EP_NHIS;
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');

            // 하이픈 건보공단 공식 규격: step에 간편인증사명(kakao, pass, naver, toss) 전달
            const targetOrg = String(loginOrgCd || 'kakao').toLowerCase();

            hyphenPayload = {
                loginMethod: 'EASY',
                step: targetOrg,
                name: name,
                mobileNo: cleanPhone,
                ssn1: cleanSsn1.substring(0, 6),
                ssn2: cleanSsn2,
                sdate: `${yyyy - 5}${mm}${dd}`,
                edate: `${yyyy}${mm}${dd}`,
                diseaseItemYn: 'Y',
                sensitiveCondYn: 'Y'
            };
        } else {
            // [국세청 홈택스 연말정산간소화 엔드포인트 /in0076001151]
            endpoint = EP_HOMETAX;

            // 국세청 귀속연도 설정 (국세청 공시 최신 완료 귀속년도 2024년 기준)
            const targetYear = (attrYr && String(attrYr).length === 4) ? String(attrYr) : '2024';

            hyphenPayload = {
                loginMethod: 'EASY',
                loginOrgCd: selectedOrgCd,
                resNm: name,
                resNo: fullSsn, // 국세청 간소화 필수: 13자리 주민등록번호
                mobileNo: cleanPhone,
                showCookie: 'Y',
                mateKndCd: 'G0001,G0003',
                attrYr: targetYear,
                nmemberLoginYn: 'Y',
                uoption: ''
            };

            if (isStep2) {
                const effectiveCookie = cookie || cookieData || body.cookie || body.cookieData || '';
                const effectiveStep = stepData || body.stepData || '';
                hyphenPayload.stepMode = 'step';
                hyphenPayload.step = 'sign';
                hyphenPayload.stepData = effectiveStep;
                hyphenPayload.cookie = effectiveCookie;
                hyphenPayload.cookieData = effectiveCookie;
                hyphenPayload.attrYr = targetYear;
                hyphenPayload.resNo = fullSsn;
            } else if (isQuery) {
                const effectiveCookie = cookie || cookieData || body.cookie || body.cookieData || '';
                hyphenPayload.stepMode = 'step';
                hyphenPayload.step = 'query';
                hyphenPayload.cookie = effectiveCookie;
                hyphenPayload.cookieData = effectiveCookie;
                hyphenPayload.attrYr = targetYear;
                hyphenPayload.resNo = fullSsn;
            } else {
                hyphenPayload.stepMode = 'step';
                hyphenPayload.step = 'init';
                hyphenPayload.attrYr = targetYear;
                hyphenPayload.resNo = fullSsn;
            }
        }

        console.log(`[Hyphen Call] Service: ${serviceType}, Endpoint: ${endpoint}, Step: ${hyphenPayload.step || 'query'}, Name: ${name}`);
        if (hyphenPayload.step === 'sign') {
            console.log(`[Hyphen Call] Step2 Data Check - StepData: ${!!hyphenPayload.stepData}, Cookie length: ${(hyphenPayload.cookie || '').length}`);
        }

        let result = await callHyphen(endpoint, hyphenPayload);

        // [국세청 홈택스 2단계 서명 완료 후 데이터 처리 및 3개년(2024, 2023, 2022) 통합 수집]
        if (serviceType === 'hometax' && isStep2 && result.success) {
            const resData = result.data?.data || {};
            const authCookie = resData.cookie || hyphenPayload.cookie || '';
            const isCommonOk = !result.data?.common?.errYn || result.data?.common?.errYn === 'N';

            // 1. 만약 2단계에서 info/G0003이 없고 쿠키가 발급된 경우 세션 쿠키로 2024년 데이터 직접 수신
            if (!resData.info && !resData.G0003 && authCookie && isCommonOk) {
                console.log('[Hyphen Call] Step 2 sign completed. Querying 2024 Hometax records with session cookie...');
                const queryPayload = {
                    loginMethod: 'EASY',
                    loginOrgCd: selectedOrgCd,
                    resNm: name,
                    resNo: fullSsn,
                    mobileNo: cleanPhone,
                    showCookie: 'Y',
                    mateKndCd: 'G0001,G0003',
                    attrYr: '2024',
                    nmemberLoginYn: 'Y',
                    stepMode: 'step',
                    step: 'query',
                    cookie: authCookie,
                    cookieData: authCookie
                };

                try {
                    const queryResult = await callHyphen(endpoint, queryPayload);
                    if (queryResult.data?.data?.info || queryResult.data?.data?.G0003 || queryResult.data?.G0003) {
                        result = queryResult;
                    }
                } catch (e) {
                    console.error('[Hyphen Call] 2024 Query error:', e.message);
                }
            }

            // 2. 2023년 및 2022년 데이터 추가 수집 (3개년 자동 병합)
            if (authCookie && isCommonOk && result.data?.data) {
                console.log('[Hyphen Call] Fetching 2023 and 2022 Hometax records to merge 3-year data...');
                const fetchYears = ['2023', '2022'];
                for (const yr of fetchYears) {
                    try {
                        const queryYr = {
                            loginMethod: 'EASY',
                            loginOrgCd: selectedOrgCd,
                            resNm: name,
                            resNo: fullSsn,
                            mobileNo: cleanPhone,
                            showCookie: 'Y',
                            mateKndCd: 'G0001,G0003',
                            attrYr: yr,
                            nmemberLoginYn: 'Y',
                            stepMode: 'step',
                            step: 'query',
                            cookie: authCookie,
                            cookieData: authCookie
                        };
                        const resYr = await Promise.race([
                            callHyphen(endpoint, queryYr),
                            new Promise((_, reject) => setTimeout(() => reject(new Error(`${yr} Timeout`)), 3500))
                        ]);

                        if (resYr?.data?.data) {
                            const dYr = resYr.data.data;
                            if (!result.data.data.yearList) result.data.data.yearList = [];
                            result.data.data.yearList.push(dYr);

                            // 의료비(G0003) 병합
                            if (dYr.G0003?.outB6001 && result.data.data.G0003?.outB6001) {
                                result.data.data.G0003.outB6001.push(...dYr.G0003.outB6001);
                            } else if (dYr.G0003?.outB6001 && !result.data.data.G0003) {
                                result.data.data.G0003 = dYr.G0003;
                            }

                            // 보험료(G0001) 병합
                            if (dYr.G0001?.outB6001 && result.data.data.G0001?.outB6001) {
                                result.data.data.G0001.outB6001.push(...dYr.G0001.outB6001);
                            } else if (dYr.G0001?.outB6001 && !result.data.data.G0001) {
                                result.data.data.G0001 = dYr.G0001;
                            }
                        }
                    } catch (e) {
                        console.log(`[Hyphen Call] ${yr} query skipped:`, e.message);
                    }
                }
            }
        }

        return res.status(result.statusCode || 200).json(result);
    } catch (err) {
        console.error('[Hyphen API Error]', err);
        return res.status(500).json({ error: '서버 내부 오류: ' + err.message });
    }
};
