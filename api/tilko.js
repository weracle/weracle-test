const crypto = require('crypto');

const DEFAULT_API_KEY = process.env.TILKO_API_KEY || '78d670ee885446c494f672c05334bdf2';
const TILKO_HOST = 'https://api.tilko.net';

let cachedPublicKeyPem = null;
let cachedApiKey = null;

// RSA 공개키 조회 (GetPublicKey API)
async function getPublicKey(apiKey = DEFAULT_API_KEY) {
    if (cachedPublicKeyPem && cachedApiKey === apiKey) {
        return cachedPublicKeyPem;
    }
    const url = `${TILKO_HOST}/api/Auth/GetPublicKey?APIkey=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`공개키 조회 실패: HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data.PublicKey) throw new Error('공개키가 응답에 없습니다.');

    const base64Key = data.PublicKey.replace(/\s+/g, '');
    const pem = '-----BEGIN PUBLIC KEY-----\n' + 
                (base64Key.match(/.{1,64}/g) || [base64Key]).join('\n') + 
                '\n-----END PUBLIC KEY-----';

    cachedPublicKeyPem = pem;
    cachedApiKey = apiKey;
    return pem;
}

// 16바이트 AES-128 키 생성
function generateAesKey() {
    return crypto.randomBytes(16);
}

// AES-128-CBC 데이터 암호화 (PKCS7 Padding, IV: 16-zero)
function encryptAes(plainText, aesKey) {
    if (plainText === undefined || plainText === null || plainText === '') return '';
    const str = String(plainText);
    const iv = Buffer.alloc(16, 0);
    const cipher = crypto.createCipheriv('aes-128-cbc', aesKey, iv);
    let encrypted = cipher.update(str, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}

// RSA 공개키로 AES Key 암호화 -> ENC-KEY 헤더 생성
function generateEncKey(publicKeyPem, aesKey) {
    const encrypted = crypto.publicEncrypt(
        {
            key: publicKeyPem,
            padding: crypto.constants.RSA_PKCS1_PADDING
        },
        aesKey
    );
    return encrypted.toString('base64');
}

// 틸코 API 호출 프록시 헬퍼 (중첩 객체 및 점 표기법 지원)
async function callTilkoApi(endpoint, body = {}, encryptFieldNames = [], apiKey = DEFAULT_API_KEY) {
    const publicKeyPem = await getPublicKey(apiKey);
    const aesKey = generateAesKey();
    const encKey = generateEncKey(publicKeyPem, aesKey);

    const processedBody = JSON.parse(JSON.stringify(body));
    const encryptedFieldsSummary = [];

    function getNestedValue(obj, path) {
        const parts = path.split('.');
        let curr = obj;
        for (let i = 0; i < parts.length; i++) {
            if (curr === undefined || curr === null) return undefined;
            curr = curr[parts[i]];
        }
        return curr;
    }

    function setNestedValue(obj, path, val) {
        const parts = path.split('.');
        let curr = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!curr[parts[i]]) curr[parts[i]] = {};
            curr = curr[parts[i]];
        }
        curr[parts[parts.length - 1]] = val;
    }

    encryptFieldNames.forEach(fieldName => {
        const rawVal = getNestedValue(processedBody, fieldName);
        if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
            setNestedValue(processedBody, fieldName, encryptAes(rawVal, aesKey));
            encryptedFieldsSummary.push(fieldName);
        }
    });

    const url = endpoint.startsWith('http') ? endpoint : `${TILKO_HOST}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        'API-KEY': apiKey,
        'ENC-KEY': encKey
    };

    const startTime = Date.now();
    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(processedBody)
        });

        const duration = Date.now() - startTime;
        const resText = await resp.text();
        let resJson = null;
        try {
            resJson = JSON.parse(resText);
        } catch(e) {
            resJson = { raw: resText };
        }

        return {
            success: resp.ok,
            status: resp.status,
            duration: `${duration}ms`,
            url: url,
            encryptedFields: encryptedFieldsSummary,
            sentBody: processedBody,
            headers: {
                'API-KEY': apiKey.substring(0, 8) + '...',
                'ENC-KEY': encKey.substring(0, 30) + '...'
            },
            data: resJson
        };
    } catch(err) {
        return {
            success: false,
            error: err.message,
            duration: `${Date.now() - startTime}ms`,
            url: url
        };
    }
}

// Vercel Serverless Function Handler
module.exports = async function handler(req, res) {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, API-KEY'
    );

    if (req.method === 'OPTIONS') {
        return res.status ? res.status(200).end() : (res.writeHead(200), res.end());
    }

    // Helper for safe JSON response in all environments
    function sendJson(statusCode, data) {
        if (typeof res.status === 'function' && typeof res.json === 'function') {
            return res.status(statusCode).json(data);
        }
        res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
    }

    // Safe Body & Action extraction
    let bodyData = req.body || {};
    if (typeof bodyData === 'string') {
        try { bodyData = JSON.parse(bodyData); } catch(e) {}
    }

    let action = bodyData.action || 'request';
    try {
        if (req.query && req.query.action) {
            action = req.query.action;
        } else if (req.url) {
            const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            if (parsedUrl.searchParams.get('action')) {
                action = parsedUrl.searchParams.get('action');
            } else if (parsedUrl.pathname.includes('full-report')) {
                action = 'full-report';
            }
        }
    } catch (e) {}

    // 1. 상태 확인 (GET 요청 또는 action=status)
    if (req.method === 'GET' || action === 'status') {
        try {
            const pem = await getPublicKey();
            return sendJson(200, {
                status: 'OK',
                message: '틸코 API 백엔드 서버(Serverless Function)가 정상 작동 중입니다.',
                activeKey: DEFAULT_API_KEY.substring(0, 8) + '...',
                publicKeyReady: !!pem,
                timestamp: new Date().toISOString()
            });
        } catch (err) {
            return sendJson(200, {
                status: 'OK',
                message: '틸코 API 서버리스 함수가 배포되었으나 공개키 통신 확인 필요',
                error: err.message
            });
        }
    }

    // 2. 전체 실데이터 일괄 수신 (action=full-report)
    if (action === 'full-report') {
        try {
            const {
                CxId, ReqTxId, Token, TxId, PrivateAuthType,
                UserName, BirthDate, UserCellphoneNumber,
                IdentityNumber,
                targets
            } = bodyData;

            if (!Token || !TxId) {
                return sendJson(400, { error: 'Token과 TxId가 필요합니다.' });
            }

            const baseBody = {
                CxId: CxId || '',
                ReqTxId: ReqTxId || TxId,
                Token: Token,
                TxId: TxId,
                PrivateAuthType: PrivateAuthType || '0',
                UserName: UserName,
                BirthDate: BirthDate,
                UserCellphoneNumber: UserCellphoneNumber
            };
            const encryptFields = ['UserName', 'BirthDate', 'UserCellphoneNumber'];

            if (IdentityNumber && String(IdentityNumber).replace(/[^0-9]/g, '').length === 13) {
                baseBody.IdentityNumber = String(IdentityNumber).replace(/[^0-9]/g, '');
                encryptFields.push('IdentityNumber');
            }

            const agency = bodyData.agency || 'nhis';

            // 건강보험심사평가원 (HIRA) 간편인증 데이터 수신 (설계이지 투약/처방 원본)
            if (agency === 'hira' || action === 'hira-full-report') {
                const bodyHira = {
                    CxId: CxId || '',
                    ReqTxId: ReqTxId || TxId,
                    Token: Token,
                    TxId: TxId,
                    PrivateAuthType: PrivateAuthType || '0',
                    UserName: UserName,
                    BirthDate: BirthDate,
                    UserCellphoneNumber: UserCellphoneNumber,
                    IdentityNumber: String(IdentityNumber).replace(/[^0-9]/g, '')
                };

                const resHira = await callTilkoApi(
                    '/api/v1.0/HiraSimpleAuth/HIRAA050300000100',
                    bodyHira,
                    ['UserName', 'BirthDate', 'UserCellphoneNumber', 'IdentityNumber']
                );

                if (!resHira.success || (resHira.data && resHira.data.Status !== 'OK' && !resHira.data.ResultList)) {
                    const errMsg = resHira.data?.ErrorLog || resHira.data?.TargetMessage || resHira.data?.Message || resHira.error || '건강보험심사평가원 처방약/투약내역 조회에 실패했습니다.';
                    return sendJson(400, {
                        error: errMsg,
                        tilkoStatus: resHira.data?.Status || 'ERROR',
                        tilkoCode: resHira.data?.ErrorCode || resHira.data?.TargetCode,
                        tilkoMessage: errMsg,
                        errorLog: resHira.data?.ErrorLog || null,
                        rawDetail: resHira.data || null
                    });
                }

                const medicineList = resHira.data?.ResultList || [];

                return sendJson(200, {
                    success: true,
                    agency: 'hira',
                    timestamp: new Date().toISOString(),
                    customer: {
                        userName: UserName,
                        birthDate: BirthDate,
                        phone: UserCellphoneNumber
                    },
                    medicineList: medicineList,
                    pointBalance: resHira.data?.PointBalance || null,
                    tilkoStatus: resHira.data?.Status || 'OK',
                    tilkoMessage: resHira.data?.Message || '성공',
                    rawHiraResponse: resHira.data || null
                });
            }

            // 국민건강보험공단 (NHIS) 진료정보열람
            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            // 건강보험공단 진료정보열람(retrievecaredesclist) 일자 규격:
            // 1. 종료일: 오늘 기준 정확히 2개월보다 이후일 수 없음 -> 2개월 + 이틀 전으로 안전 설정
            const endDateObj = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate() - 2);
            const endDateStr = `${endDateObj.getFullYear()}${pad(endDateObj.getMonth() + 1)}${pad(endDateObj.getDate())}`;
            // 2. 시작일: 오늘 기준 14개월보다 이전일 수 없음 -> 13개월 전으로 안전 설정
            const startDateObj = new Date(now.getFullYear(), now.getMonth() - 13, now.getDate());
            const startDateStr = `${startDateObj.getFullYear()}${pad(startDateObj.getMonth() + 1)}${pad(startDateObj.getDate())}`;

            const bodyCare = { ...baseBody, StartDate: startDateStr, EndDate: endDateStr };

            // 진료정보열람 단일 호출 (설계이지 동일 데이터, 비용 50% 절감)
            const resCare = await callTilkoApi('/api/v1.0/nhissimpleauth/retrievecaredesclist', bodyCare, encryptFields);

            if (!resCare.success || (resCare.data && resCare.data.Status !== 'OK' && !resCare.data.ResultList)) {
                const errMsg = resCare.data?.ErrorLog || resCare.data?.TargetMessage || resCare.data?.Message || resCare.error || '건강보험공단 진료정보열람 조회에 실패했습니다.';
                return sendJson(400, {
                    error: errMsg,
                    tilkoStatus: resCare.data?.Status || 'ERROR',
                    tilkoCode: resCare.data?.ErrorCode || resCare.data?.TargetCode,
                    tilkoMessage: errMsg,
                    errorLog: resCare.data?.ErrorLog || null,
                    rawDetail: resCare.data || null
                });
            }

            const careList = resCare.data?.ResultList || [];

            return sendJson(200, {
                success: true,
                agency: 'nhis',
                timestamp: new Date().toISOString(),
                customer: {
                    userName: UserName,
                    birthDate: BirthDate,
                    phone: UserCellphoneNumber
                },
                careList: careList,
                pointBalance: resCare.data?.PointBalance || null,
                tilkoStatus: resCare.data?.Status || 'OK',
                tilkoMessage: resCare.data?.Message || '성공',
                rawCareResponse: resCare.data || null
            });
        } catch(err) {
            console.error('Full Report Handler Error:', err);
            return sendJson(500, { error: err.message });
        }
    }

    // 3. 단일 프록시 요청 (POST action=request)
    if (req.method === 'POST') {
        try {
            const { endpoint, body, encryptFields, apiKey } = bodyData;
            if (!endpoint) {
                return sendJson(400, { error: 'endpoint 파라미터가 필요합니다.' });
            }

            const result = await callTilkoApi(endpoint, body, encryptFields || [], apiKey || DEFAULT_API_KEY);
            return sendJson(200, result);
        } catch (err) {
            console.error('Proxy Handler Error:', err);
            return sendJson(500, { error: err.message });
        }
    }

    return sendJson(405, { error: 'Method Not Allowed' });
};
