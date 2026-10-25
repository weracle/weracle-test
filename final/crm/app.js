const GOOGLE_CLIENT_ID = "281609603311-j6ie378elv518odovep2rjemeaffb40b.apps.googleusercontent.com"; 
const GOOGLE_API_KEY = "AIzaSyD9XOJBgaaUh6XVAx_az6Ka0IlUUsc2pSw"; // Replace with real if needed
const SPREADSHEET_ID = "15UcwX8QpXbA-aL1n2qJ9z5dO2y94hQo-7YJ7H1mYwDk"; 
const isHeadless = new URLSearchParams(window.location.search).get('mode') === 'headless';

(function() {
    const style = document.createElement("style");
    style.innerHTML = `
        #crmTable td.ins-pool-cell {
            vertical-align: top !important;
        }
    `;
    document.head.appendChild(style);
})();

function calcRenewalDate(el, targetArg) {
    if (typeof targetArg === "string" && targetArg.startsWith("renewal-")) {
        // Auto Insurance
        const startVal = el.value;
        const target = document.getElementById(targetArg);
        if (target && startVal) {
            const date = new Date(startVal);
            if (!isNaN(date)) {
                date.setFullYear(date.getFullYear() + 1);
                target.value = date.toISOString().split("T")[0];
            }
        }
    } else {
        // Long Term Insurance
        const val = el.value;
        const insCount = targetArg;
        const target = document.getElementById("renewal-date-" + insCount);
        // Find 체결일
        let startDateInput = el.closest(".input-field").parentElement.parentElement.querySelector("input[name='체결일']");
        if (!startDateInput) startDateInput = el.closest(".print-section") ? el.closest(".print-section").querySelector("input[name='체결일']") : null;
        if (!startDateInput) startDateInput = document.getElementById("ins-date-" + insCount);
        const startVal = startDateInput ? startDateInput.value : "";
        if (!target || !startVal) return;
        
        const date = new Date(startVal);
        if (isNaN(date)) return;

        if (val.includes("년만기")) {
            const years = parseInt(val.replace(/[^0-9]/g, ""));
            if (!isNaN(years)) {
                date.setFullYear(date.getFullYear() + years);
                target.value = date.toISOString().split("T")[0];
            }
        } else if (val.includes("세만기")) {
            const age = parseInt(val.replace(/[^0-9]/g, ""));
            let juminInput = el.closest(".print-section") ? el.closest(".print-section").querySelector("input[name='피보험자생년월일']") : null;
            if (!juminInput) juminInput = document.querySelector("input[name='피보험자생년월일']");
            let jumin = juminInput ? juminInput.value : "";
            if (!jumin) {
                const mainJumin = document.querySelector("input[name='주민번호']");
                jumin = mainJumin ? mainJumin.value : "";
            }
            if (jumin && jumin.length >= 6) {
                let yearPrefix = (parseInt(jumin.substring(0, 2)) < 30) ? 2000 : 1900;
                // Basic heuristic: if first digit of second part is 3,4 it's 2000s
                if (jumin.includes("-") && (jumin.split("-")[1].startsWith("3") || jumin.split("-")[1].startsWith("4"))) yearPrefix = 2000;
                let birthYear = yearPrefix + parseInt(jumin.substring(0, 2));
                let targetYear = birthYear + age;
                date.setFullYear(targetYear);
                target.value = date.toISOString().split("T")[0];
            }
        }
    }
}
function cleanTouchInsight(str) {
    if (!str || str === "-") return "-";
    let cleaned = String(str).replace(/["\\']/g, '');
    let arr = cleaned.split(',').map(s => s.trim()).filter(s => s);
    let finalStr = [...new Set(arr)].join(', ');
    return finalStr.replace(/\/$/, ""); // Keep the trailing slash cleanup just in case
}
function getGlobalInsuranceList(client, includeInsured = false) {
    let list = [];
    let globalInsArray = [];
    try {
        if (Array.isArray(client['가입내역'])) globalInsArray = client['가입내역'];
        else if (typeof client['가입내역'] === 'string') globalInsArray = JSON.parse(client['가입내역'] || '[]');
        else if (Array.isArray(client["보험가입리스트"])) globalInsArray = client["보험가입리스트"];
        if (!globalInsArray || globalInsArray.length === 0) { if (Array.isArray(client["보험가입리스트"])) globalInsArray = client["보험가입리스트"]; }
        if (!Array.isArray(globalInsArray)) globalInsArray = [];
    } catch (e) {}

    let maxLen = Math.max(10, globalInsArray.length);
    for (let i = 1; i <= maxLen; i++) {
        let slotData = globalInsArray[i - 1] || {};
        let d = {};
        try {
            let p = client['보험' + i + '_가입내역'];
            if (typeof p === 'object' && p !== null) d = p;
            else if (typeof p === 'string') {
                if (p.trim().startsWith('{') || p.trim().startsWith('[')) {
                    let parsed = JSON.parse(p);
                    if (typeof parsed === 'object' && parsed !== null) d = parsed;
                } else {
                    d['가입내역'] = p.replace(/^"|"$/g, '');
                }
            }
        } catch (e) {}
        d = { ...slotData, ...d };

        if (client['보험' + i + '_사명'] || client['보험' + i + '_상품명'] || client['차_보험사'] || client['차_상품명'] || d['보험사명'] || d['상품명'] || d['차_보험사명'] || d['차_상품명'] || d['company'] || d['product']) {
            let pVal = '자동이체';
            if (client['보험' + i + '_결제방식'] === '신용카드' || client['보험' + i + '_결제방식'] === '카드' || d['결제방식'] === '신용카드' || d['결제방식'] === '카드') pVal = '카드';
            
            let rawCov = client['보험' + i + '_가입내역'] || '';
            let parsedCov = typeof rawCov === 'string' ? rawCov.replace(/^"|"$/g, '') : rawCov;
            
            let finalObj = {
                ...d,
                피보험자: client['보험' + i + '_피보험자'] || client['피보험자'] || d['피보험자'] || d['차_피보험자'] || d['기본피보험자'] || d['차_기본피보험자'] || '',
                계약자: client['보험' + i + '_계약자'] || client['계약자'] || d['계약자'] || '',
                company: client['보험' + i + '_사명'] || client['차_보험사'] || d['보험사명'] || d['차_보험사명'] || d['company'] || '',
                product: client['보험' + i + '_상품명'] || client['차_상품명'] || d['상품명'] || d['차_상품명'] || d['product'] || '',
                details: d,
                date: client['보험' + i + '_체결일'] || d['체결일'] || '',
                premium: client['보험' + i + '_보험료'] || d['보험료'] || '',
                payDate: client['보험' + i + '_결제일'] || d['결제일'] || '',
                payPeriod: client['보험' + i + '_납입기간'] || d['납입기간'] || '',
                expireDate: client['보험' + i + '_만기일'] || d['만기일'] || '',
                renewalDate: client['보험' + i + '_갱신일'] || d['갱신일'] || '',
                payment: pVal,
                paymentInfo: client['보험' + i + '_결제정보'] || d['결제정보'] || '',
                보험사명: client['보험' + i + '_사명'] || client['차_보험사'] || d['보험사명'] || d['차_보험사명'] || d['company'] || '',
                상품명: client['보험' + i + '_상품명'] || client['차_상품명'] || d['상품명'] || d['차_상품명'] || d['product'] || '',
                가입내역: parsedCov || d['가입내역'] || '',
                _가입내역: d,
                체결일: client['보험' + i + '_체결일'] || d['체결일'] || '',
                보험료: client['보험' + i + '_보험료'] || d['보험료'] || '',
                결제일: client['보험' + i + '_결제일'] || d['결제일'] || '',
                납입기간: client['보험' + i + '_납입기간'] || d['납입기간'] || '',
                만기일: client['보험' + i + '_만기일'] || d['만기일'] || '',
                갱신일: client['보험' + i + '_갱신일'] || d['갱신일'] || '',
                결제방식: pVal,
                결제정보: client['보험' + i + '_결제정보'] || d['결제정보'] || ''
            };
            list.push(finalObj);
        }
    }

    if (includeInsured) {
        try {
            if (typeof globalCustomerData !== 'undefined' && Array.isArray(globalCustomerData)) {
                const myName = String(client['이름'] || client['고객명'] || client['대표자명'] || '').trim();
                const myIdStr = String(client['고객번호'] || client['ID'] || '');
                const myRootId = myIdStr.split('-')[0];
                
                if (myRootId && myName) {
                    const otherCustomers = globalCustomerData.filter(c => {
                        const cid = String(c['고객번호'] || c['ID'] || '');
                        return cid !== myIdStr && cid.split('-')[0] === myRootId;
                    });
                    
                    otherCustomers.forEach(fm => {
                        let fmInsArray = [];
                        try {
                            if (Array.isArray(fm['가입내역'])) fmInsArray = fm['가입내역'];
                            else if (typeof fm['가입내역'] === 'string') fmInsArray = JSON.parse(fm['가입내역'] || '[]');
                        } catch(e){}
                        if (!fmInsArray || fmInsArray.length === 0) { if (Array.isArray(fm['보험가입리스트'])) fmInsArray = fm['보험가입리스트']; } if (!Array.isArray(fmInsArray)) fmInsArray = [];
                        
                        let fmMaxLen = Math.max(10, fmInsArray.length);
                        for (let i = 1; i <= fmMaxLen; i++) {
                            let slotData = fmInsArray[i - 1] || {};
                            let d = {};
                            try {
                                let p = fm['보험' + i + '_가입내역'];
                                if (typeof p === 'object' && p !== null) d = p;
                                else if (typeof p === 'string' && (p.trim().startsWith('{') || p.trim().startsWith('['))) {
                                    d = JSON.parse(p);
                                } else if (typeof p === 'string') {
                                    d['가입내역'] = p.replace(/^"|"$/g, '');
                                }
                            } catch(e){}
                            d = { ...slotData, ...d };
                            
                            if (fm['보험' + i + '_사명'] || fm['보험' + i + '_상품명'] || fm['차_보험사'] || fm['차_상품명'] || d['보험사명'] || d['상품명'] || d['차_보험사명'] || d['차_상품명'] || d['company'] || d['product']) {
                                const fmContractor = String(d['계약자'] || d['차_계약자'] || '').trim();
                                const fmInsured = String(d['피보험자'] || d['차_피보험자'] || d['기본피보험자'] || d['차_기본피보험자'] || d['insured'] || d['insuredName'] || '').trim();
                                
                                let fmContractorDisplay = fmContractor;
                                if (fmContractor === "본인" || fmContractor === "") fmContractorDisplay = fm['고객명'] || fm['이름'] || fm['대표자명'] || "본인";
                                
                                const extractPureName = (str) => {
                                    if (!str) return "";
                                    let s = String(str).replace(/\s*\(.*?\)/g, '');
                                    s = s.replace(/\s+/g, '');
                                    const suffixes = ["본인", "배우자", "자녀", "부", "모", "동생", "형제", "자매", "형님", "대표", "대표자"];
                                    for (let suf of suffixes) {
                                        if (s.endsWith(suf) && s !== suf) {
                                            s = s.slice(0, -suf.length);
                                            break;
                                        }
                                    }
                                    return s;
                                };

                                const cleanMyName = extractPureName(myName);
                                const cleanFmInsured = extractPureName(fmInsured);
                                const cleanFmContractor = extractPureName(fmContractorDisplay);
                                
                                if (cleanFmInsured === cleanMyName || cleanFmContractor === cleanMyName) {
                                    let pVal = '자동이체';
                                    if (fm['보험' + i + '_결제방식'] === '신용카드' || fm['보험' + i + '_결제방식'] === '카드' || d['결제방식'] === '신용카드' || d['결제방식'] === '카드') pVal = '카드';
                                    let rawCov = fm['보험' + i + '_가입내역'] || '';
                                    let parsedCov = typeof rawCov === 'string' ? rawCov.replace(/^"|"$/g, '') : rawCov;
                                    
                                    let finalObj = {
                                        ...d,
                                        피보험자: fmInsured,
                                        계약자: fmContractorDisplay,
                                        company: fm['보험' + i + '_사명'] || fm['차_보험사'] || d['보험사명'] || d['차_보험사명'] || d['company'] || '',
                                        product: fm['보험' + i + '_상품명'] || fm['차_상품명'] || d['상품명'] || d['차_상품명'] || d['product'] || '',
                                        details: d,
                                        date: fm['보험' + i + '_체결일'] || d['체결일'] || '',
                                        premium: fm['보험' + i + '_보험료'] || d['보험료'] || '',
                                        payDate: fm['보험' + i + '_결제일'] || d['결제일'] || '',
                                        payPeriod: fm['보험' + i + '_납입기간'] || d['납입기간'] || '',
                                        expireDate: fm['보험' + i + '_만기일'] || d['만기일'] || '',
                                        renewalDate: fm['보험' + i + '_갱신일'] || d['갱신일'] || '',
                                        payment: pVal,
                                        paymentInfo: fm['보험' + i + '_결제정보'] || d['결제정보'] || '',
                                        보험사명: fm['보험' + i + '_사명'] || fm['차_보험사'] || d['보험사명'] || d['차_보험사명'] || d['company'] || '',
                                        상품명: fm['보험' + i + '_상품명'] || fm['차_상품명'] || d['상품명'] || d['차_상품명'] || d['product'] || '',
                                        가입내역: parsedCov || d['가입내역'] || '',
                                        _가입내역: d,
                                        체결일: fm['보험' + i + '_체결일'] || d['체결일'] || '',
                                        보험료: fm['보험' + i + '_보험료'] || d['보험료'] || '',
                                        결제일: fm['보험' + i + '_결제일'] || d['결제일'] || '',
                                        납입기간: fm['보험' + i + '_납입기간'] || d['납입기간'] || '',
                                        만기일: fm['보험' + i + '_만기일'] || d['만기일'] || '',
                                        갱신일: fm['보험' + i + '_갱신일'] || d['갱신일'] || '',
                                        결제방식: pVal,
                                        결제정보: fm['보험' + i + '_결제정보'] || d['결제정보'] || ''
                                    };
                                    
                                    const isDup = list.some(ex => ex.company === finalObj.company && ex.product === finalObj.product && ex.보험료 === finalObj.보험료 && ex.피보험자 === finalObj.피보험자);
                                    if (!isDup) list.push(finalObj);
                                }
                            }
                        }
                    });
                }
            }
        } catch(err) {
            console.error("Error finding family insured data:", err);
        }
    }
    return list;
}
function calculateJuminData(juminStr) {
    let val = juminStr.replace(/[^0-9]/g, "");
    if (val.length < 7) return null;
    
    const birthPart = val.substring(0, 6);
    const genderDigit = val.charAt(6);
    
    let century = "19";
    if (["3","4","7","8"].includes(genderDigit)) century = "20";
    else if (["0","9"].includes(genderDigit)) century = "18";
    
    const year = parseInt(century + birthPart.substring(0, 2));
    const month = parseInt(birthPart.substring(2, 4));
    const day = parseInt(birthPart.substring(4, 6));
    
    const today = new Date();
    const birthDate = new Date(year, month - 1, day);
    
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    const isMale = ["1","3","5","9"].includes(genderDigit);
    
    let sangMonth = month + 6;
    let sangYear = year;
    if (sangMonth > 12) {
        sangMonth -= 12;
        sangYear++;
    }
    
    return { 
        age: age, 
        gender: isMale ? "남" : "여", 
        birth: String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0"), 
        sang: String(sangMonth).padStart(2, "0") + "-" + String(day).padStart(2, "0") 
    };
}
/**
* WERACLE CRM - Google Sheets & Client Logic Core
* Supported by Antigravity (Google DeepMind)
*/
// ==========================================
// 1. 설정 및 전역 변수
// ==========================================
//  구글 클라우드 콘솔에서 발급받은 정보를 아래에 입력하세요.
 // 예: "123456789-abc.apps.googleusercontent.com"
    // 예: "AIzaSy..."
// Google Sheets API 설정
const DISCOVERY_DOC = "https://sheets.googleapis.com/$discovery/rest?version=v4";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events";
// --- Google Token Listener from Parent (index_test.html) ---
window.addEventListener('message', function(event) {
if (event.data && event.data.type === 'GOOGLE_TOKEN') {
const token = event.data.token;
memoryAccessToken = token;
try { localStorage.setItem("g_access_token", token); } catch(e) {}
if (typeof gapi !== 'undefined' && gapi.client) {
gapi.client.setToken({ access_token: token });
}
if (typeof gapi === 'undefined' || !gapi.client || !gapi.client.sheets) { loadGoogleLibraries(); } else { loadCRMData(); }
}
});
// -----------------------------------------------------------
let tokenClient;
let gapiInited = false;
let gisInited = false;
let isDemoMode = false; try { localStorage.removeItem('demo_crm_data'); } catch(e) {}
// 로컬 캐시 데이터
let globalCustomerData = [];
let globalTargetData = [];
let filteredCustomerData = [];
let currentInsights = [];
let currentStep = 1;
let isEditMode = false; window.isEditMode = false;
let editTargetId = null; // 수정 중인 고객의 고유번호
let insCount = 0;
let confirmActionCallback = null;
let spreadsheetId = ""; // 연동된 구글 시트 ID
let agentPhone = "";    // 로그인한 설계사의 휴대폰 번호
let sheetName = "weraclecrm"; // 동적 활성 시트 이름 (weraclecrm으로 통일)
let sheetIdVal = 0;      // 동적 활성 시트의 고유 ID (delete용)
let googleLoadRetryCount = 0;
let isSilentAuthAttempted = false;
let memoryAccessToken = ""; //  메모리 기반 토큰 캐시 (브라우저 Tracking Prevention으로 localStorage 차단 시 대비용)
let lastTokenValidationTime = 0;
const TOKEN_VALIDATION_CACHE_MS = 30000; // 30초 캐시
// ==========================================
// 2. 초기화 및 라이브러리 로드
// ==========================================
// Supabase에 구글 인증정보 및 시트 ID 동기화 백업
async function syncCredentialsToSupabase(accessToken, sheetId) {
if (!window.sb || !window.currentUser) {
console.log("Supabase not logged in. Skipping DB token sync.");
return;
}

const updateData = {};
if (accessToken) updateData.google_access_token = accessToken;
if (sheetId) updateData.google_sheet_id = sheetId;

if (Object.keys(updateData).length === 0) return;

try {
const { error } = await window.sb
.from('profiles')
.update(updateData)
.eq('id', window.currentUser.id);

if (error) throw error;
console.log(" Successfully backed up Google credentials to Supabase profiles!");
} catch (err) {
console.error(" Failed to back up Google credentials to Supabase:", err);
}
}
// ==========================================
// 1.5. 화면 표시 제어 헬퍼 함수
// ==========================================
function toggleScreen(showMain) {
const phoneScreen = document.getElementById("phone-login-screen");
const mainScreen = document.getElementById("crm-main-screen");

// 대표님 요청으로 전체화면 로그인 창 기능 제거, 무조건 메인 화면을 보여줌
if (phoneScreen) phoneScreen.style.display = "none";
if (mainScreen) mainScreen.style.display = "block";
}
function showLoginRequiredMessage() {
const targetDiv = document.getElementById("session-sync-status") || document.getElementById("portal-sync-status-wrap");
if (targetDiv) {
// 모바일/PC/아이프레임 여부와 상관없이 무조건 PC 홈페이지와 완전히 동일한 프리미엄 로그인 카드 렌더링
targetDiv.innerHTML = `
         <div style="text-align: center; margin-bottom: 28px;">
             <span style="font-family:'Outfit'; font-size: 28px; font-weight:900; color:#113f67; letter-spacing:-1.2px;">WERACLE <span style="color:#1e5c94;">LAB</span></span>
             <p style="color:#64748b; font-size: 14px; margin-top: 6px; font-weight: 500; letter-spacing: -0.3px;">스마트한 영업인을 위한 커리어 플랫폼</p>
         </div>
         <div style="display:flex; flex-direction:column; gap:12px; text-align: left; width: 100%; max-width: 300px; margin: 0 auto;">
             <div>
                 <input type="email" id="userEmailInput" style="width:100%; height:42px; background:#f8fafc; border:1px solid rgba(17, 63, 103, 0.08); border-radius:6px; padding:0 12px; font-size:14px; color:#2c3a4b; box-sizing: border-box;" placeholder="이메일을 입력해 주세요" />
             </div>
             <div>
                 <input type="password" id="userPasswordInput" style="width:100%; height:42px; background:#f8fafc; border:1px solid rgba(17, 63, 103, 0.08); border-radius:6px; padding:0 12px; font-size:14px; color:#2c3a4b; box-sizing: border-box;" placeholder="비밀번호를 입력해 주세요" />
             </div>
             <button onclick="loginWithSupabaseEmail()" style="background: linear-gradient(135deg, #113f67, #1e5c94); color: white; height:42px; border-radius:6px; font-weight:800; font-size:14px; border:none; cursor:pointer; width:100%; margin-top:4px; box-shadow: 0 4px 12px rgba(17, 63, 103, 0.1);">이메일로 시작하기</button>
             
             <div style="display:flex; align-items:center; text-align:center; color:#8b95a1; font-size:13px; margin:20px 0;">
                 <div style="flex:1; border-bottom:1px solid #e1e2e3;"></div>
                 <span style="padding:0 16px; font-weight: 500;">또는</span>
                 <div style="flex:1; border-bottom:1px solid #e1e2e3;"></div>
             </div>

             <button onclick="loginWithKakao()" style="width:100%; height:42px; border-radius:6px; border:1px solid rgba(0, 0, 0, 0.03); font-size:13.5px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px; background-color:#FEE500; color:#191919; box-sizing: border-box;">
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right:2px;"><path d="M12 3c-5.523 0-10 3.73-10 8.33 0 2.973 1.867 5.58 4.67 7.02l-1.18 4.33c-.114.417.368.747.72.508l5.12-3.48c.22.015.443.022.67.022 5.523 0 10-3.73 10-8.33S17.523 3 12 3z"/></svg>
                 카카오톡으로 시작하기
             </button>
         </div>
     `;
}
}
function triggerParentLogin() {
    if (typeof tokenClient !== 'undefined' && tokenClient) {
        tokenClient.requestAccessToken();
    } else {
        const isIframe = (window.parent && window.parent !== window);
        if (isIframe) {
            window.parent.postMessage({ type: "REQUEST_GOOGLE_LOGIN" }, "*");
        }
    }
}
function showNoPermissionMessage() {
const targetDiv = document.getElementById("session-sync-status") || document.getElementById("portal-sync-status-wrap");
if (targetDiv) {
targetDiv.innerHTML = `
         <span style="font-size: 48px; display: block; margin-bottom: 15px;"></span>
         <p class="login-subtitle" style="font-weight: 700; color: #e11d48; font-size: 15px; line-height: 1.6; word-break: keep-all; margin: 0 0 10px 0;">
             이용 권한이 없습니다.
         </p>
         <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0 0 15px 0; word-break: keep-all;">
             고객관리(CRM) 프로그램은 [우수설계사(VIP)] 등급 이상만 이용하실 수 있습니다.<br>등급 신청 및 변경은 관리자에게 문의해 주세요.
         </p>
     `;
}
}
document.addEventListener("DOMContentLoaded", () => {
// 로딩 폴백 화면 숨기기
const fallback = document.getElementById("loading-fallback");
if (fallback) fallback.style.display = "none";

// 부모 창(iframe) 여부에 따른 로그인 UI 제어
const isIframe = (window.parent && window.parent !== window);

const tabsWrap = document.getElementById("portal-login-tabs-wrap");
const phoneForm = document.getElementById("login-form-phone");
const emailForm = document.getElementById("login-form-email");
const socialWrap = document.getElementById("portal-social-login-wrap");
const syncWrap = document.getElementById("portal-sync-status-wrap");

if (isIframe) {
if (tabsWrap) tabsWrap.style.display = "none";
if (phoneForm) phoneForm.classList.remove("active"); setTimeout(() => { if(phoneForm) phoneForm.style.display = "none"; if(emailForm) emailForm.style.display = "none"; }, 300);
if (emailForm) emailForm.classList.remove("active"); setTimeout(() => { if(phoneForm) phoneForm.style.display = "none"; if(emailForm) emailForm.style.display = "none"; }, 300);
if (socialWrap) socialWrap.style.display = "none";
if (syncWrap) syncWrap.style.display = "block";
} else {
if (tabsWrap) tabsWrap.style.display = "flex";
if (phoneForm) phoneForm.style.display = "block";
if (emailForm) emailForm.classList.remove("active"); setTimeout(() => { if(phoneForm) phoneForm.style.display = "none"; if(emailForm) emailForm.style.display = "none"; }, 300);
if (socialWrap) socialWrap.style.display = "block";
if (syncWrap) syncWrap.style.display = "none";
}

// 드롭다운 클릭 대응 (모바일/터치/PC 공통)
const dropdownBtns = document.querySelectorAll(".outline-dropdown-btn");
dropdownBtns.forEach(btn => {
btn.addEventListener("click", (e) => {
e.stopPropagation();
const parent = btn.closest(".header-dropdown");
const isShown = parent.classList.contains("show");

// 모든 드롭다운 닫기
document.querySelectorAll(".header-dropdown").forEach(el => {
el.classList.remove("show");
});

if (!isShown) {
parent.classList.add("show");
}
});
});
document.addEventListener("click", () => {
document.querySelectorAll(".header-dropdown").forEach(el => {
el.classList.remove("show");
});
});

// Demo Mode 판별
const isApiKeyInvalid = !GOOGLE_API_KEY || !GOOGLE_API_KEY.startsWith("AIzaSy");
const isClientIdInvalid = !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_ID.endsWith(".apps.googleusercontent.com");

if (isApiKeyInvalid || isClientIdInvalid || GOOGLE_CLIENT_ID.includes("YOUR") || GOOGLE_API_KEY.includes("YOUR") || GOOGLE_CLIENT_ID === "" || GOOGLE_API_KEY === "") {
isDemoMode = false; // Forced false for Supabase OAuth
console.warn(" API Key/Client ID가 올바르지 않거나 누락되었습니다. 데모 모드(localStorage 기반)로 작동합니다.");
// showDemoBanner()
}
// 1. 부모 창(아임웹)으로부터 Supabase 세션 수신을 위한 postMessage 리스너
window.addEventListener("message", async (e) => {
if (e.data && e.data.type === 'DASHBOARD_READY') {
if (typeof renderTable === 'function' && window.globalCustomerData) {
renderTable();
}
}
if (e.data && e.data.type === 'SAVE_TARGET') {

const payload = e.data.data;
const currentMonthStr = payload['기준월'];

if (typeof gapi !== 'undefined' && gapi.client && spreadsheetId) {
try {
const targetSheetName = "월별_실적_목표";
const resp = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: spreadsheetId, range: `${targetSheetName}!A:E` });
const rows = resp.result.values || [];
let rowIndex = -1;
for (let i = 1; i < rows.length; i++) {
if (rows[i][0] === currentMonthStr) {
rowIndex = i + 1;
break;
}
}

const rowData = [
currentMonthStr,
payload['손보_목표'],
payload['생보_목표'],
payload['이번달_다짐']
];

if (rowIndex !== -1) {
await gapi.client.sheets.spreadsheets.values.update({
spreadsheetId: spreadsheetId,
range: `${targetSheetName}!A${rowIndex}:D${rowIndex}`,
valueInputOption: "RAW",
resource: { values: [rowData] }
});
} else {
const nLife = window.currentMetrics ? window.currentMetrics.nonLifePremium : 0;
const cLife = window.currentMetrics ? window.currentMetrics.lifePremium : 0;
const tClients = window.currentMetrics ? window.currentMetrics.totalClientsCurrent : 0;
const fullRowData = [...rowData, nLife, cLife, tClients];
await gapi.client.sheets.spreadsheets.values.append({
spreadsheetId: spreadsheetId,
range: `${targetSheetName}!A:G`,
valueInputOption: "RAW",
resource: { values: [fullRowData] }
});
}
console.log('Target saved to Google Sheets successfully.');
lastLoadCRMDataTime = 0; // Reset debounce
loadCRMData(); // Reload data
} catch (error) {
console.error("Failed to save target to Google Sheets:", error);
}
}
}

if (e.data && e.data.type === "SB_SESSION_SYNC") {
console.log(" Supabase Session synced via postMessage Bridge!");
const { user, profile } = e.data;
if (user && profile) {
// 등급 권한 체크: 임시 해제 (모든 사용자 허용)
const isAuthorized = true; // (profile.user_grade === 'VIP' || profile.user_grade === 'manager');
if (!isAuthorized) {
window.currentUser = user;
window.currentProfile = profile;
toggleScreen(false);
showNoPermissionMessage();
return;
}

window.currentUser = user;
window.currentProfile = profile;

// 휴대폰 번호 매핑 및 자동 세션 우회
agentPhone = profile.phone || user.phone || "";
try { localStorage.setItem("crm_agent_phone", agentPhone); } catch(e) {}

// DB 에러를 우회하기 위해 무조건 로컬 캐시(localStorage)를 최우선으로 신뢰합니다.
const localToken = (function() { try { return localStorage.getItem("g_access_token"); } catch(e) { return null; } })();
if (localToken && localToken !== "undefined" && localToken !== "null") {
    memoryAccessToken = localToken;
} else if (profile.google_access_token) {
    memoryAccessToken = profile.google_access_token;
    try { localStorage.setItem("g_access_token", profile.google_access_token); } catch(e) {}
}

if (memoryAccessToken) {
    syncCredentialsToSupabase(memoryAccessToken, null);
}
if (false && profile.google_sheet_id) {
try { localStorage.setItem("g_sheet_id", profile.google_sheet_id); } catch(e) {}
spreadsheetId = profile.google_sheet_id;
console.log("Sync: Google Sheet ID loaded from Supabase profile.");
} else {
const localSheetId = spreadsheetId || (function() { try { return localStorage.getItem("g_sheet_id"); } catch(e) { return null; } })();
if (localSheetId) {
spreadsheetId = localSheetId;
console.log("Sync: Fallback to cached Google Sheet ID:", spreadsheetId);
syncCredentialsToSupabase(null, spreadsheetId);
}
}

// 화면 전환 및 로드
toggleScreen(true);

if (!isDemoMode) {
    if (!isHeadless && isIframe) {
        showLoading(true);
        window.parent.postMessage({ type: 'requestSyncData' }, '*');
        window.googleLibTimeout = setTimeout(() => {
            if (typeof loadGoogleLibraries === "function") loadGoogleLibraries();
        }, 1500);
    } else {
        loadGoogleLibraries();
    }
} else {
    loadCRMData();
}
} else {
// 세션이 유효하지 않은 경우 (로그아웃 등)
window.currentUser = null;
window.currentProfile = null;
toggleScreen(false);
showLoginRequiredMessage();
        globalCustomerData = [];
        renderTable();
}
}
});
// 2. 단독(Standalone) 구동 시 Supabase 세션 자동 로드 및 로컬 복구
setTimeout(async () => {
// 만약 postMessage로 이미 로드되었다면 중복 로드 방지
if (window.currentUser) return;

const isIframe = (window.parent && window.parent !== window);


// URL 쿼리 파라미터에서 agent_phone 또는 phone 확인하여 자동 로그인 처리
const urlParams = new URLSearchParams(window.location.search);
const paramPhone = urlParams.get("agent_phone") || urlParams.get("phone");
if (paramPhone) {
agentPhone = paramPhone.trim();
try { localStorage.setItem("crm_agent_phone", agentPhone); } catch(e) {}
toggleScreen(false);
if (!isDemoMode) {
loadGoogleLibraries();
} else {
loadCRMData();
}
return;
}

if (window.sb) {
try {
const { data: { session } } = await window.sb.auth.getSession();
if (session && session.user) {
await updateSessionState(session);
if (window.currentProfile) {
console.log(" Standalone Supabase Session Initialized!");
const profile = window.currentProfile;

// 등급 권한 체크: 임시 해제 (모든 사용자 허용)
const isAuthorized = true; // (profile.user_grade === 'VIP' || profile.user_grade === 'manager');
if (!isAuthorized) {
toggleScreen(false);
showNoPermissionMessage();
return;
}

agentPhone = profile.phone || session.user.phone || "";
try { localStorage.setItem("crm_agent_phone", agentPhone); } catch(e) {}

// DB 에러를 우회하기 위해 무조건 로컬 캐시(localStorage)를 최우선으로 신뢰합니다.
const localToken = (function() { try { return localStorage.getItem("g_access_token"); } catch(e) { return null; } })();
if (localToken && localToken !== "undefined" && localToken !== "null") {
    memoryAccessToken = localToken;
} else if (profile.google_access_token) {
    memoryAccessToken = profile.google_access_token;
    try { localStorage.setItem("g_access_token", profile.google_access_token); } catch(e) {}
}

if (memoryAccessToken) {
    syncCredentialsToSupabase(memoryAccessToken, null);
}
if (false && profile.google_sheet_id) {
try { localStorage.setItem("g_sheet_id", profile.google_sheet_id); } catch(e) {}
spreadsheetId = profile.google_sheet_id;
} else {
const localSheetId = spreadsheetId || (function() { try { return localStorage.getItem("g_sheet_id"); } catch(e) { return null; } })();
if (localSheetId) {
spreadsheetId = localSheetId;
syncCredentialsToSupabase(null, spreadsheetId);
}
}

// 구글 연동 여부 체크하여 강제 전환
// 항상 로그인 대문 화면을 띄워서 명시적 로그인을 유도
toggleScreen(false);

if (!isDemoMode) {
loadGoogleLibraries();
} else {
loadCRMData();
}
return; // 아래의 일반 로컬스토리지 복구 로직 패스
}
}
} catch (authErr) {
console.warn("Supabase auth check failed, falling back to local storage:", authErr);
}
}

// 아이프레임 내부가 아닐 때만 기존 로컬 스토리지 기반 자동 로그인 유지
if (!isIframe) {
const savedPhone = (function() { try { return localStorage.getItem("crm_agent_phone"); } catch(e) { return null; } })();
if (savedPhone) {
agentPhone = savedPhone;
const localSheetId = (function() { try { return localStorage.getItem("g_sheet_id"); } catch(e) { return null; } })();
// 항상 로그인 대문 화면을 띄워서 명시적 로그인을 유도
toggleScreen(false);

if (!isDemoMode) {
loadGoogleLibraries();
} else {
loadCRMData();
}
return;
}
}

// 세션 동기화 실패 시 처리 (로그인 안내 화면 노출)
toggleScreen(false);
showLoginRequiredMessage();
        globalCustomerData = [];
        renderTable();
// 부모 창에 세션 동기화 요청 (로딩 타이밍 대비 역방향 요청)
if (isIframe) {
window.parent.postMessage({ type: "CRM_REQUEST_SESSION" }, "*");
console.log(" Requested session from parent window...");
}
}, 2000);
});
// 데모 모드 알림 배너 표시
function showDemoBanner(isApiKeyInvalid, isClientIdInvalid) {
const banner = document.createElement("div");
banner.style.cssText = "background: #f59e0b; color: white; text-align: center; padding: 10px; font-weight: 700; font-size: 14px; position: fixed; top: 0; left: 0; width: 100%; z-index: 10000; box-shadow: 0 2px 10px rgba(0,0,0,0.1);";

let message = " 데모 모드로 실행 중입니다 (로컬 웹스토리지 저장).";
if (isApiKeyInvalid && GOOGLE_API_KEY && GOOGLE_API_KEY.startsWith("GOCSPX")) {
message += " (오류: API Key 자리에 OAuth Client Secret(GOCSPX-...)이 오기입되었습니다. 구글 클라우드에서 AIzaSy로 시작하는 API 키를 발급받아 대입하세요.)";
} else {
message += " 구글 시트 실시간 연동을 위해선 app.js 상단에 Client ID와 API Key를 입력해 주세요.";
}

banner.innerHTML = message;
document.body.prepend(banner);
document.body.style.paddingTop = "40px";
}
// 구글 API 및 GIS SDK 동적 로드
function loadGoogleLibraries() {
if (typeof gapi === "undefined" || typeof google === "undefined") {
if (googleLoadRetryCount < 10) {
googleLoadRetryCount++;
console.warn(`Google libraries (gapi/google) not loaded yet. Retrying (${googleLoadRetryCount}/10)...`);
setTimeout(loadGoogleLibraries, 500);
} else {
console.error("Google libraries failed to load after 5 seconds. Adblocker or network issue suspected.");
showLoading(false);
const body = document.getElementById("crmBody") || document.getElementById("listTableBody");
if (body) {
body.innerHTML = `
                 <tr>
                     <td colspan="5" style="text-align:center; padding: 60px 0; color:var(--text-muted);">
                         <span style="font-size: 28px; display: block; margin-bottom: 15px;"></span>
                         <strong style="color: var(--primary); font-size: 15.5px;">구글 라이브러리를 로드할 수 없습니다.</strong><br>
                         <p style="margin: 6px 0 16px 0; font-size: 13.5px; line-height: 1.5;">광고 차단 프로그램(AdBlock)이 활성화되어 있거나 네트워크 연결이 원활하지 않을 수 있습니다.<br>광고 차단기를 비활성화한 후 다시 시도해 주세요.</p>
                     </td>
                 </tr>
             `;
}
}
return;
}

gapi.load("client", async () => {
try {
await gapi.client.init({
apiKey: GOOGLE_API_KEY,
discoveryDocs: [DISCOVERY_DOC],
});
gapiInited = true;
checkAuthInited();
} catch (err) {
console.error("GAPI init error:", err);
}
});
try {
 
     tokenClient = google.accounts.oauth2.initTokenClient({
         client_id: GOOGLE_CLIENT_ID,
         scope: SCOPES,
         callback: (resp) => {
             if (resp.error !== undefined) {
                 console.warn("Google token client callback error:", resp.error);
                 showExpiredAuthUI(resp.error_description || resp.error);
                 return;
             }
             handleTokenResponse(resp);
         },
     });
     
gisInited = true;
checkAuthInited();
} catch (err) {
console.error("GIS init error:", err);
}
}
/**
* 구글 Sheets API를 호출하기 전에 유효한 OAuth2 토큰이 설정되어 있는지 확인하고 보장합니다.
* 토큰이 없거나 만료된 경우 무효화하고 구글 로그인 창을 띄웁니다.
* @returns {Promise<string|null>} 유효한 access_token 또는 null
*/
async function ensureValidToken() {
    if (isDemoMode) return "demo_token";
    let token = memoryAccessToken || (function() { try { return localStorage.getItem("g_access_token"); } catch(e) { return null; } })();
    
    const savedTime = parseInt(localStorage.getItem("g_token_time") || "0", 10);
    if (savedTime > 0 && Date.now() > savedTime + 3540000) { // 59 minutes just to be safe
        invalidateCurrentToken();
        if (typeof window !== "undefined" && !window.isHeadless) {
            alert(" 구글 연동 시간이 만료되었습니다!\n\n창을 닫거나 새로고침하지 마시고, 화면 우측 상단의 [재연동] 버튼을 눌러 먼저 연동을 갱신해주세요.\n(입력하신 데이터는 날아가지 않습니다.)");
        }
        return null;
    }
    if (!token) {
        invalidateCurrentToken();
        if (!isHeadless) {
            alert("구글 연동 권한이 없거나 만료되었습니다. 안전한 저장을 위해 우측 상단 메뉴에서 로그아웃하신 후 다시 로그인해 주세요.");
        } else if (window.parent) {
            window.parent.postMessage({ type: 'workerAuthFailed' }, '*');
        }
        return null;
    }
    if (typeof gapi !== 'undefined' && gapi.client) {
        gapi.client.setToken({ access_token: token });
    }
    return token;
}
async function checkAuthInited() {
if (gapiInited && gisInited) {
console.log("Google Libraries Successfully Initialized.");
const savedToken = memoryAccessToken || (function() { try { return localStorage.getItem("g_access_token"); } catch(e) { return null; } })();
const savedSheetId = spreadsheetId || (function() { try { return localStorage.getItem("g_sheet_id"); } catch(e) { return null; } })();
if (savedToken) {
memoryAccessToken = savedToken;
gapi.client.setToken({ access_token: savedToken });
spreadsheetId = savedSheetId || "";

// 토큰 유효성 검사 후 데이터 로딩 진행
const token = await ensureValidToken();
if (token) {
    if (isHeadless) {
        loadCRMData(); // workerFrame always fetches
    } else if (!(window.parent && window.parent !== window)) {
        loadCRMData(); // Standalone always fetches
    } else {
        console.log("Skipping loadCRMData in mainFrame to prevent 429 API rate limits. Waiting for workerFrame's syncData event.");
    }
}
} else {
updateAgentHeaderUI();
showExpiredAuthUI("구글 연동 정보가 없습니다.");
}
}
}
// ==========================================
// 3. 설계사 로그인 및 구글 연동 처리
// ==========================================
// 원래 소스의 phone 로그인 트리거 구현
function lookupMasterKey() {
const phoneInput = document.getElementById("userPhoneInput");
const val = phoneInput ? phoneInput.value.trim() : "";
if (!val) {
alert("휴대폰 번호를 입력해주세요.");
return;
}

agentPhone = val;
localStorage.setItem("crm_agent_phone", agentPhone);

toggleScreen(true);
if (!isDemoMode) {
loadGoogleLibraries();
} else {
loadCRMData();
}
}
// 구글 연동 팝업 명시적 호출
let forceConsentOnNextAuth = false; // 토큰 무효화 후에만 강제 재동의
function handleAuthClick() {
if (isDemoMode) {
localStorage.setItem("demo_auth", "true");
loadCRMData();
return;
}
isSilentAuthAttempted = false;

    if (!memoryAccessToken || (typeof gapi !== 'undefined' && gapi.client && gapi.client.getToken() === null)) {
        if (!isSilentAuthAttempted && typeof tokenClient !== 'undefined' && tokenClient) {
            console.log("Attempting silent Google Auth refresh...");
            isSilentAuthAttempted = true;
            tokenClient.requestAccessToken({ prompt: '' });
        } else {
            showExpiredAuthUI();
        }
    } else {
loadCRMData();
}
}
function showExpiredAuthUI(errorMessage = "") {
memoryAccessToken = "";
try { localStorage.removeItem("g_access_token"); } catch(e) {}
if (typeof gapi !== 'undefined' && gapi.client) {
gapi.client.setToken(null);
}
updateAgentHeaderUI();
showLoading(false);
    
    // 대표님 요청으로 자동 팝업 괴롭힘 제거 (우측 상단 배너 버튼 클릭 유도)
}

async function handleTokenResponse(tokenResponse) {
if (tokenResponse && tokenResponse.access_token) {
isSilentAuthAttempted = false;
console.log(' Token received. Scope:', tokenResponse.scope || 'N/A');

memoryAccessToken = tokenResponse.access_token;
try { localStorage.setItem('g_access_token', tokenResponse.access_token); } catch(e) {}

//  GAPI 클라이언트에 토큰 설정
if (typeof gapi !== 'undefined' && gapi.client) {
gapi.client.setToken({ access_token: tokenResponse.access_token });
console.log(" GAPI client token successfully set in handleTokenResponse.");
}

await syncCredentialsToSupabase(tokenResponse.access_token, null);
await loadAgentProfile(tokenResponse.access_token);

// 부모 창으로 업데이트된 토큰/프로필 정보 전송
const isIframe = (window.parent && window.parent !== window);

if (isIframe) {
window.parent.postMessage({
type: 'CRM_TOKEN_UPDATED',
google_access_token: tokenResponse.access_token,
google_sheet_id: spreadsheetId
}, '*');
}

await loadCRMData();
}
}
async function loadAgentProfile(accessToken) {
try {
const resp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
headers: { Authorization: `Bearer ${accessToken}` }
});
const profile = await resp.json();
if (profile && profile.name) {
localStorage.setItem("g_agent_name", profile.name);
}
} catch (err) {
console.warn("Failed to fetch Google profile info:", err);
}
}
// 설계사 정보 영역 UI 동적 업데이트 (구글 연동 여부에 따라 분기)

function updateAgentHeaderUI(errorMessage = "") {
    let bannerContainer = document.getElementById("google-auth-banner-container");
    if (!bannerContainer) {
        bannerContainer = document.createElement("div");
        bannerContainer.id = "google-auth-banner-container";
        bannerContainer.style.position = "fixed";
        bannerContainer.style.top = "16px";
        bannerContainer.style.right = "20px";
        bannerContainer.style.zIndex = "999999";
        document.body.appendChild(bannerContainer);
    }
    
    const _t = (typeof memoryAccessToken !== "undefined" && memoryAccessToken) ? memoryAccessToken : (function(){ try { return localStorage.getItem("g_access_token"); } catch(e){ return null; } })();
    const hasGoogleAuth = !!_t;
    
    if (hasGoogleAuth) {
        bannerContainer.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; background: white; padding: 6px 14px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="display: flex; align-items: center; gap: 6px; padding-right: 8px; border-right: 1px solid #e2e8f0;">
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" width="14" height="14">
                    <span style="font-size: 12.5px; color: #10b981; font-weight: 800;">연동됨</span>
                </div>
                
            </div>
        `;
    } else {
        bannerContainer.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; background: #fff1f2; padding: 6px 14px; border-radius: 12px; border: 1px solid #fecdd3; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 13.5px; margin-bottom: 2px;"></span>
                    <span style="font-size: 12.5px; color: #e11d48; font-weight: 800;">연동 안됨</span>
                </div>
                <button onclick="triggerParentLogin()" style="background: #e11d48; border: none; font-size: 11.5px; color: white; cursor: pointer; padding: 4px 10px; border-radius: 6px; font-weight: 600; margin-left: 4px;">
                    연동하기
                </button>
            </div>
        `;
    }
    
    if (errorMessage) {
        const errDiv = document.createElement("div");
        errDiv.style.marginTop = "4px";
        errDiv.style.fontSize = "11px";
        errDiv.style.color = "#e11d48";
        errDiv.style.textAlign = "right";
        errDiv.textContent = errorMessage;
        bannerContainer.appendChild(errDiv);
    }
}

// ==========================================
// 4. 구글 시트 연동 (조회/생성/저장/삭제)
// ==========================================
// 4-0. 구글 시트 폰번호/주민번호 열 자동 TEXT(일반 텍스트) 서식 설정 헬퍼
// ==========================================
let formattedSheetTabsSet = new Set();
async function formatSheetColumnsAsText(spreadsheetId, sheetName, headers) {
    if (!window.gapi || !window.gapi.client || !window.gapi.client.sheets) return;
    if (!headers || headers.length === 0) return;
    const cacheKey = `${spreadsheetId}_${sheetName}`;
    if (formattedSheetTabsSet.has(cacheKey)) return;
    try {
        const metaResp = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: spreadsheetId });
        const sheetObj = (metaResp.result.sheets || []).find(s => s.properties.title === sheetName);
        if (!sheetObj) return;
        const sheetId = sheetObj.properties.sheetId;

        const targetColumnNames = [
            "폰번호", "대표자폰번호", "대표자핸드폰", "대표핸드폰", "사업자전화번호", "사업장전화번호", "회사전화번호", "전화번호",
            "주민번호", "대표자주민번호",
            "고객번호", "ID", "사업자번호", "법인번호"
        ];

        const requests = [];
        headers.forEach((h, colIdx) => {
            const head = String(h).trim();
            if (targetColumnNames.includes(head)) {
                requests.push({
                    repeatCell: {
                        range: {
                            sheetId: sheetId,
                            startRowIndex: 1, // 1행(헤더) 제외, 2행부터 전체 데이터 행 적용
                            startColumnIndex: colIdx,
                            endColumnIndex: colIdx + 1
                        },
                        cell: {
                            userEnteredFormat: {
                                numberFormat: {
                                    type: "TEXT"
                                }
                            }
                        },
                        fields: "userEnteredFormat.numberFormat"
                    }
                });
            }
        });

        if (requests.length > 0) {
            await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: spreadsheetId,
                resource: { requests: requests }
            });
            formattedSheetTabsSet.add(cacheKey);
            console.log(` [${sheetName}] 폰번호/주민번호/고객번호 열 ${requests.length}개 일반 텍스트(TEXT) 서식 자동 지정 완료`);
        }
    } catch(err) {
        console.warn(`자동 텍스트 서식 설정 중 건너뜀 (${sheetName}):`, err);
    }
}

// 첫 번째 시트의 실제 이름과 ID를 동적으로 로드하여 세팅하는 함수 (기존 시트의 이름은 강제로 바꾸지 않고 보존합니다)
async function initSheetMetadata(id) {
try {
const response = await gapi.client.sheets.spreadsheets.get({
spreadsheetId: id
});
const sheets = response.result.sheets;
if (sheets && sheets.length > 0) {
let targetSheet = sheets[0];

const findSheet = (enName, koName) => sheets.find(s => s.properties.title === enName || s.properties.title === koName);
const genSheet = findSheet("weraclecrm", "일반고객");
window.resolvedGeneralSheetName = "weraclecrm";
const corpSheet = findSheet("corporatecrm", "사업자고객");
window.resolvedCorporateSheetName = "corporatecrm";

if (window.targetSheetName) {
let targetEn = window.targetSheetName;
if (targetEn === "일반고객") targetEn = "weraclecrm";
if (targetEn === "사업자고객") targetEn = "corporatecrm";

let foundSheet = null;
if (targetEn === "weraclecrm") foundSheet = genSheet;
else if (targetEn === "corporatecrm") foundSheet = corpSheet;
else foundSheet = sheets.find(s => s.properties.title === window.targetSheetName);

if (foundSheet) {
targetSheet = foundSheet;
window.targetSheetName = foundSheet.properties.title;
try {
    const checkResp = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: spreadsheetId, range: `${window.targetSheetName}!A1:B1` });
    if (!checkResp.result.values || checkResp.result.values.length === 0 || !checkResp.result.values[0][0]) {
        console.log('Target sheet exists but missing headers, adding them now.');
        const headers = getCrmHeaders(window.targetSheetName);
        const endColStr = getCrmEndCol(window.targetSheetName);
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: id,
            range: `${window.targetSheetName}!A1:${endColStr}1`,
            valueInputOption: "USER_ENTERED",
            resource: { values: [headers] }
        });
    }
} catch(e) { console.warn("Failed to check or add missing headers", e); }
} else {
console.log(`Creating new sheet tab: ${window.targetSheetName}`);
const addSheetResp = await gapi.client.sheets.spreadsheets.batchUpdate({
spreadsheetId: id,
resource: {
requests: [{
addSheet: {
properties: { title: window.targetSheetName }
}
}]
}
});

targetSheet = addSheetResp.result.replies[0].addSheet;

// Format the header row for the new sheet (using standard CRM headers for now, but B2B fields will be mapped if needed)
const headers = getCrmHeaders(window.targetSheetName);
    const endColStr = getCrmEndCol(window.targetSheetName);
    await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${window.targetSheetName}!A1:${endColStr}1`,
    valueInputOption: "USER_ENTERED",
    resource: { values: [headers] }
    });
}
}

// 대상 시트 탭들의 폰번호/주민번호 열을 자동으로 '일반 텍스트(TEXT)'로 서식 지정
try {
    if (window.targetSheetName) {
        const h = getCrmHeaders(window.targetSheetName);
        formatSheetColumnsAsText(id, window.targetSheetName, h);
    }
    if (corpSheet) {
        const ch = getCrmHeaders(corpSheet.properties.title);
        formatSheetColumnsAsText(id, corpSheet.properties.title, ch);
    }
    if (genSheet) {
        const gh = getCrmHeaders(genSheet.properties.title);
        formatSheetColumnsAsText(id, genSheet.properties.title, gh);
    }
} catch(e) {}

// Check and auto-recover '보험관리' headers if the tab exists but is completely empty
const insSheetCheck = sheets.find(s => s.properties.title === "보험관리");
if (insSheetCheck) {
    try {
        const insCheckResp = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: id, range: `보험관리!A1:B1` });
        if (!insCheckResp.result.values || insCheckResp.result.values.length === 0 || !insCheckResp.result.values[0][0]) {
            console.log('보험관리 sheet exists but missing headers, recovering them now.');
            const insHeadersToRecover = getInsuranceHeaders();
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: id,
                range: `보험관리!A1`,
                valueInputOption: "USER_ENTERED",
                resource: { values: [insHeadersToRecover] }
            });
        }
    } catch(e) { console.warn('Failed to check/add 보험관리 headers', e); }
}

// Check and create '월별_실적_목표' if not exists
const targetSheetName2 = "월별_실적_목표";
const foundTargetSheet = sheets.find(s => s.properties.title === targetSheetName2);
if (foundTargetSheet) {
try {
const checkResp = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: spreadsheetId, range: `${targetSheetName2}!A1:G1` });
if (!checkResp.result.values || checkResp.result.values.length === 0 || checkResp.result.values[0][0] !== '기준월') {
console.log('Target sheet missing headers, adding them now.');
const targetHeaders = ['기준월', '손보_목표', '생보_목표', '이번달_다짐', '손보_현재실적', '생보_현재실적', '관리고객_총수'];
await gapi.client.sheets.spreadsheets.values.update({
spreadsheetId: id,
range: `${targetSheetName2}!A1:G1`,
valueInputOption: 'USER_ENTERED',
resource: { values: [targetHeaders] }
});
}
} catch(e) { console.warn('Failed to check/add headers', e); }
}
if (!foundTargetSheet) {
console.log(`Creating new sheet tab: ${targetSheetName2}`);
try {
await gapi.client.sheets.spreadsheets.batchUpdate({
spreadsheetId: id,
resource: {
requests: [{ addSheet: { properties: { title: targetSheetName2 } } }]
}
});

const targetHeaders = ["기준월", "손보_목표", "생보_목표", "이번달_다짐", "손보_현재실적", "생보_현재실적", "관리고객_총수"];
const now = new Date();
const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}`;

await gapi.client.sheets.spreadsheets.values.update({
spreadsheetId: id,
range: `${targetSheetName2}!A1:G2`,
valueInputOption: "USER_ENTERED",
resource: { values: [
targetHeaders,
[currentMonthStr, 1000000, 1000000, "이번 달도 화이팅!", 0, 0, 0]
] }
});
console.log("New target sheet formatted with headers.");
} catch (targetErr) {
console.error("Failed to create target sheet:", targetErr);
alert(" '월별_실적_목표' 탭을 생성하는 데 실패했습니다. 시트 권한을 확인하거나 수동으로 생성해주세요.\n에러: " + (targetErr.message || (targetErr.result && targetErr.result.error && targetErr.result.error.message) || "알 수 없는 오류"));
}
}



sheetName = targetSheet.properties.title;
sheetIdVal = targetSheet.properties.sheetId;
console.log(`?뱤 Active Sheet Name: ${sheetName}, Sheet ID: ${sheetIdVal}`);
}
} catch (e) {
console.warn("Failed to get spreadsheet metadata, falling back to defaults", e);
sheetName = window.targetSheetName || "weraclecrm";
sheetIdVal = 0;
}
}
let isLoadingCRMData = false;
let lastLoadCRMDataTime = 0;
async function loadCRMData() { if (isLoadingCRMData) { console.log('loadCRMData already in progress, skipping.'); return; } const now = Date.now(); if (now - lastLoadCRMDataTime < 5000) { console.log('loadCRMData called too soon, skipping.'); return; } isLoadingCRMData = true; lastLoadCRMDataTime = now; const isInitialLoad = !window.globalCustomerData || window.globalCustomerData.length === 0; try { await _doLoadCRMData(!isInitialLoad); } finally { isLoadingCRMData = false; } } async function _doLoadCRMData(silent = false) { let retryCount = 0; while ((typeof gapi === 'undefined' || !gapi.client || !gapi.client.sheets) && retryCount < 10) { await new Promise(r => setTimeout(r, 500)); retryCount++; } if (!silent) showLoading(true);
try {
if (isDemoMode) {
const localData = localStorage.getItem("demo_crm_data");
if (localData) {
globalCustomerData = JSON.parse(localData);
} else {
globalCustomerData = getInitialMockData();
localStorage.setItem("demo_crm_data", JSON.stringify(globalCustomerData));
}
window.targetSheetName = "weraclecrm"; //  강제로 일반고객 모드로 초기화
updateAgentHeaderUI();
initYearFilterOptions();
initClientDatalist();
updateQuickFilterCounts();
renderTable();
return;
}

// 구글 토큰 유효성 사전 검증
const token = await ensureValidToken();
if (!token) { window.isSubmittingCrm = false; return; }
// [HOTFIX] 강제 초기화 트리거: 이전 버그로 인해 텅 빈 구형 시트 ID가 로컬 스토리지에 캐싱되어 꼬인 현상을 영구 해결.
if (!window.forceClearedV5) {
    console.log(" [HOTFIX] 강제로 로컬스토리지의 잘못된 시트 ID를 삭제합니다. (프레임 단위 완전 소독)");
    localStorage.removeItem('g_sheet_id');
    window.forceClearedV5 = true;
    spreadsheetId = null;
}
// 0. 시트ID 복원 시도 (localStorage → Supabase 순서)
  if (!spreadsheetId) {
      const cachedSheetId = (function() { try { return localStorage.getItem('g_sheet_id'); } catch(e) { return null; } })();
      if (cachedSheetId) {
          spreadsheetId = cachedSheetId;
          console.log(" 시트ID 로컬캐시에서 복원:", spreadsheetId);
      }
  }
  if (false) {
      spreadsheetId = window.currentProfile.google_sheet_id;
      try { localStorage.setItem("g_sheet_id", spreadsheetId); } catch(e) {}
      console.log(" 시트ID Supabase에서 복원:", spreadsheetId);
  }

  // 0.5. 검증: 시트가 유효한지 (휴지통에 있거나 삭제되지 않았는지) 확인
  if (spreadsheetId) {
      try {
          const verifyResp = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: spreadsheetId });
          // 시트가 휴지통에 있으면 수정이 불가능하므로 무조건 버림
          const dResp = await fetch("https://www.googleapis.com/drive/v3/files/" + spreadsheetId + "?fields=trashed", {
              headers: { Authorization: "Bearer " + token }
          });
          if (dResp.ok) {
              const dJson = await dResp.json();
              if (dJson.trashed) throw new Error("Trashed sheet");
          }
      } catch (verifyErr) {
          console.warn(" 저장된 시트가 유효하지 않거나 휴지통에 있습니다. 초기화합니다.", verifyErr);
          spreadsheetId = null;
          try { localStorage.removeItem("g_sheet_id"); } catch(e) {}
      }
  }

  // 1. 시트ID가 여전히 없으면 드라이브에서 탐색/생성
if (!spreadsheetId) {
spreadsheetId = await findOrCreateClientSheet();
try { localStorage.setItem("g_sheet_id", spreadsheetId); } catch(e) {}
await syncCredentialsToSupabase(null, spreadsheetId);

// 부모 창으로 업데이트된 시트 ID 전송
const isIframe = (window.parent && window.parent !== window);

if (isIframe) {
window.parent.postMessage({
type: 'CRM_TOKEN_UPDATED',
google_access_token: memoryAccessToken || (function() { try { return localStorage.getItem("g_access_token"); } catch(e) { return null; } })(),
google_sheet_id: spreadsheetId
}, '*');
}
}
// 동적으로 첫 번째 시트의 메타데이터(이름, ID) 초기화
await initSheetMetadata(spreadsheetId);

// 2. 시트 데이터 파싱
// AGGRESSIVE TAB CREATION CHECK



globalTargetData = await fetchMonthlyTargetsFromSheet();

// 3. 대시보드 메트릭스 통합 계산 (일반+사업자 모두 병합)
const currentMonthStr = new Date().toISOString().substring(0, 7);
let allClients = [];
try {
const general = await fetchClientsFromSheet("weraclecrm");
          try { window.crmContactsData = await fetchClientsFromSheet("CRM_Contacts"); } catch(e) { console.error("CRM_Contacts fetch error:", e); window.crmContactsData = []; }
const corp = await fetchClientsFromSheet("corporatecrm");
try {
    const insRows = await fetchClientsFromSheet("보험관리");
    const insMap = {};
    insRows.forEach(r => {
        const cid = r["고객번호"];
        if(cid) { if(!insMap[cid]) insMap[cid] = []; insMap[cid].push(r); }
    });
    general.forEach(c => c["보험가입리스트"] = insMap[c["고객번호"]] || []);
    corp.forEach(c => c["보험가입리스트"] = insMap[c["고객번호"]] || []);
} catch(e) { console.warn("보험관리 패치 실패", e); }
allClients = [...general, ...corp];
globalCustomerData = allClients;
} catch(e) {
console.warn("Failed to fetch all clients for metrics", e);
allClients = globalCustomerData; // fallback
}

let nonLifePremium = 0;
let lifePremium = 0;
let achievedCountThisMonth = 0;
let prospectCount = 0;
let contractedCount = 0;

const isSameMonth = (dStr, tStr) => {
if(!dStr) return false;
try {
let d = dStr.replace(/\./g, '-').replace(/\s/g, '');
if(d.endsWith('-')) d = d.slice(0, -1);
const p = new Date(d);
if(!isNaN(p.getTime())) {
const y = p.getFullYear();
const m = String(p.getMonth() + 1).padStart(2, '0');
return `${y}-${m}` === tStr;
}
} catch(e) {}
return dStr.startsWith(tStr);
};

allClients.forEach(client => {
const regDate = client["등록일"] || client["등록일시"] || "";
if (isSameMonth(regDate, currentMonthStr)) {
achievedCountThisMonth++;
}

const status = client["상태"] || "";
if (status === "관심" || status === "관심고객") {
prospectCount++;
} else if (status === "체결" || status === "체결고객") {
contractedCount++;
}

let insList = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(client, true) : [];

insList.forEach(ins => {
const insDate = ins.체결일 || regDate; // fallback to regDate if missing
if (isSameMonth(insDate, currentMonthStr)) {
const prem = parseInt(String(ins.보험료 || "0").replace(/[^0-9]/g, ''), 10) || 0;
if (ins.보험분류 === "생명보험") lifePremium += prem;
else if (ins.보험분류 === "손해보험") nonLifePremium += prem;
}
});
});

const totalClientsCurrent = allClients.length;
const totalClientsLast = Math.max(0, totalClientsCurrent - achievedCountThisMonth);

window.currentMetrics = {
nonLifePremium,
lifePremium,
totalClientsCurrent,
totalClientsLast,
achievedCountThisMonth,
prospectCount,
contractedCount
};

// --- 이번 달 실적 자동 백그라운드 저장 로직 ---
if (typeof gapi !== 'undefined' && gapi.client && spreadsheetId && globalTargetData) {
const currentMonthRow = globalTargetData.find(t => t['기준월'] === currentMonthStr);
if (currentMonthRow) {
if (currentMonthRow['손보_현재실적'] !== nonLifePremium || 
currentMonthRow['생보_현재실적'] !== lifePremium || 
currentMonthRow['관리고객_총수'] !== totalClientsCurrent) {

const rowIndex = globalTargetData.indexOf(currentMonthRow) + 2;
gapi.client.sheets.spreadsheets.values.update({
spreadsheetId: spreadsheetId,
range: `월별_실적_목표!E${rowIndex}:G${rowIndex}`,
valueInputOption: "RAW",
resource: { values: [[nonLifePremium, lifePremium, totalClientsCurrent]] }
}).then(() => console.log("Background synced actuals to sheet"))
.catch(e => console.warn("Failed to sync actuals to sheet", e));

currentMonthRow['손보_현재실적'] = nonLifePremium;
currentMonthRow['생보_현재실적'] = lifePremium;
currentMonthRow['관리고객_총수'] = totalClientsCurrent;
}
} else {
const newRow = [
currentMonthStr, 1000000, 1000000, "이번 달도 화이팅!", 
nonLifePremium, lifePremium, totalClientsCurrent
];

gapi.client.sheets.spreadsheets.values.append({
spreadsheetId: spreadsheetId,
range: `월별_실적_목표!A:G`,
valueInputOption: "RAW",
resource: { values: [newRow] }
}).then(() => {
console.log("Auto-created new target row for current month.");
globalTargetData.push({
'기준월': currentMonthStr,
'손보_목표': 1000000,
'생보_목표': 1000000,
'이번달_다짐': "이번 달도 화이팅!",
'손보_현재실적': nonLifePremium,
'생보_현재실적': lifePremium,
'관리고객_총수': totalClientsCurrent
});
renderTable();
}).catch(e => console.warn("Failed to create new target row", e));
}
}
// UI 헤더 정보 업데이트
updateAgentHeaderUI();
initYearFilterOptions();
initClientDatalist();
updateQuickFilterCounts();
renderTable();
} catch (err) {
console.error("CRM Data load error:", err);
if (err.status === 401) {
    if (!isSilentAuthAttempted && typeof tokenClient !== 'undefined' && tokenClient) {
        console.log("401 detected. Attempting silent auth...");
        isSilentAuthAttempted = true;
        tokenClient.requestAccessToken({ prompt: '' });
    } else {
        showExpiredAuthUI(err.message || "401 Unauthorized");
    }
} else if (err.status === 404 || (err.result && err.result.error && err.result.error.code === 404)) {
// 시트ID가 유효하지 않은 경우 (삭제된 시트 등) → 캐시 클리어 후 재검색
console.warn(" 시트가 존재하지 않습니다. 재검색합니다...");
spreadsheetId = "";
try { localStorage.removeItem("g_sheet_id"); } catch(e) {}
try {
spreadsheetId = await findOrCreateClientSheet();
try { localStorage.setItem("g_sheet_id", spreadsheetId); } catch(e) {}
await syncCredentialsToSupabase(null, spreadsheetId);
await initSheetMetadata(spreadsheetId);
// AGGRESSIVE TAB CREATION CHECK



globalTargetData = await fetchMonthlyTargetsFromSheet();

// 3. 대시보드 메트릭스 통합 계산 (일반+사업자 모두 병합)
const currentMonthStr = new Date().toISOString().substring(0, 7);
let allClients = [];
try {
const general = await fetchClientsFromSheet("weraclecrm");
          try { window.crmContactsData = await fetchClientsFromSheet("CRM_Contacts"); } catch(e) { console.error("CRM_Contacts fetch error:", e); window.crmContactsData = []; }
const corp = await fetchClientsFromSheet("corporatecrm");
try {
    const insRows = await fetchClientsFromSheet("보험관리");
    const insMap = {};
    insRows.forEach(r => {
        const cid = r["고객번호"];
        if(cid) { if(!insMap[cid]) insMap[cid] = []; insMap[cid].push(r); }
    });
    general.forEach(c => c["보험가입리스트"] = insMap[c["고객번호"]] || []);
    corp.forEach(c => c["보험가입리스트"] = insMap[c["고객번호"]] || []);
} catch(e) { console.warn("보험관리 패치 실패", e); }
allClients = [...general, ...corp];
globalCustomerData = allClients;
} catch(e) {
console.warn("Failed to fetch all clients for metrics", e);
allClients = globalCustomerData; // fallback
}

let nonLifePremium = 0;
let lifePremium = 0;
let achievedCountThisMonth = 0;
let prospectCount = 0;
let contractedCount = 0;

const isSameMonthLocal = (dStr, tStr) => {
if(!dStr) return false;
try {
let d = dStr.replace(/\./g, '-').replace(/\s/g, '');
if(d.endsWith('-')) d = d.slice(0, -1);
const p = new Date(d);
if(!isNaN(p.getTime())) {
const y = p.getFullYear();
const m = String(p.getMonth() + 1).padStart(2, '0');
return `${y}-${m}` === tStr;
}
} catch(e) {}
return dStr.startsWith(tStr);
};

allClients.forEach(client => {
const regDate = client["등록일"] || client["등록일시"] || "";
if (isSameMonthLocal(regDate, currentMonthStr)) {
achievedCountThisMonth++;
}

const status = client["상태"] || "";
if (status === "관심" || status === "관심고객") {
prospectCount++;
} else if (status === "체결" || status === "체결고객") {
contractedCount++;
}

let insList = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(client, true) : [];

insList.forEach(ins => {
const insDate = ins.체결일 || regDate; // fallback to regDate if missing
if (insDate.startsWith(currentMonthStr)) {
const prem = parseInt(String(ins.보험료 || "0").replace(/[^0-9]/g, ''), 10) || 0;
if (ins.보험분류 === "생명보험") lifePremium += prem;
else if (ins.보험분류 === "손해보험") nonLifePremium += prem;
}
});
});

const totalClientsCurrent = allClients.length;
const totalClientsLast = Math.max(0, totalClientsCurrent - achievedCountThisMonth);

window.currentMetrics = {
nonLifePremium,
lifePremium,
totalClientsCurrent,
totalClientsLast,
achievedCountThisMonth,
prospectCount,
contractedCount
};

window.targetSheetName = "weraclecrm"; //  강제로 일반고객 모드로 초기화

updateAgentHeaderUI();
updateQuickFilterCounts();
renderTable();
} catch (retryErr) {
console.error("시트 재검색 실패:", retryErr);
const body = document.getElementById("crmBody") || document.getElementById("listTableBody");
if (body) {
body.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 60px 0; color:#ef4444; font-weight:700;"> 시트를 찾을 수 없습니다: ${retryErr.message || 'Unknown error'}</td></tr>`;
}
updateAgentHeaderUI(); // 에러 발생 시에도 헤더 UI 업데이트 보장
}
} else {
const body = document.getElementById("crmBody") || document.getElementById("listTableBody");
if (body) {
body.innerHTML = `
                 <tr>
                     <td colspan="5" style="text-align:center; padding: 60px 0; color:#ef4444;">
                         <span style="font-size: 28px; display: block; margin-bottom: 15px;">?</span>
                         <strong style="color: var(--primary); font-size: 15.5px;">데이터를 가져오는 중 오류가 발생했습니다.</strong><br>
                         <p style="margin: 6px 0 16px 0; font-size: 13px; line-height: 1.5; color: var(--text-muted);">
                             선택하신 구글 계정이 해당 구글 시트에 접근할 권한이 없거나 네트워크 오류일 수 있습니다.<br>
                             (오류 내용: ${err.message || (err.result && err.result.error ? err.result.error.message : 'Unknown error')})
                         </p>
                         <p style="font-size: 12px; color: #b91c1c;">※ 권한 문제가 지속될 경우, 우측 상단의 [연동 해제] 버튼을 눌러 다시 로그인해주세요.</p>
                     </td>
                 </tr>
             `;
}
updateAgentHeaderUI(); // 권한 없음 등 에러 시에도 헤더 연동 해제 버튼 렌더링 보장
}
} finally {
if (!silent) showLoading(false);
if(window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'syncData', data: globalCustomerData || [], crmContacts: window.crmContactsData || [] }, '*');
}
}
}

function getInsuranceHeaders() {
    return [
        "고객번호", "고객명", "주민번호",
        "계약자", "피보험자",
        "보험종류", "보험분류", "보험사명", "상품명", "가입내역",
        "차종", "차량번호", "차량용도", "운전자특약", "연령특약", "다이렉트여부",
        "체결일", "만기일", "갱신일", "보험료", "결제일", "납입기간",
        "결제방식", "카드번호", "유효기간", "은행명", "계좌번호",
        "알릴의무사항", "UID"
];
}

function getCrmHeaders(sheetType) {
    if (sheetType === "corporatecrm" || sheetType === "사업자고객") {
        return [
            "고객번호", "상호명", "사업자번호", "업종코드", "상태", "대표자명", "주민번호", "나이", "성별", "생일", "상령일", 
            "폰번호", "상세업무", "주소", "운전여부", "차량용도", "반려동물", "동물이름", "가족사항", "코드", "터치인사이트", 
            "특이사항", "가입내역", "등록일", "사업여부", "UID"
        ];
    }
    // 일반고객 기본 헤더
    return [
        "고객번호", "고객명", "상태", "주민번호", "나이", "성별", "생일", "상령일", "폰번호", "직업", "상세업무", "주소", 
        "운전여부", "차량용도", "반려동물", "동물이름", "가족사항", "코드", "터치인사이트", "특이사항", "가입내역", "등록일", "사업여부", "UID"
    ];
}

function getCrmEndCol(sheetType) {
    if (sheetType === "corporatecrm" || sheetType === "사업자고객") return "Z";
    return "X"; // 24 columns total
}

// 구글 드라이브 내 전용 시트 검색 및 생성
async function findOrCreateClientSheet() {
const token = memoryAccessToken || (function() { try { return localStorage.getItem("g_access_token"); } catch(e) { return null; } })();

// 1단계: Drive API로 기존 시트 검색
try {
const listUrl = "https://www.googleapis.com/drive/v3/files?q=name%3D'위라클_고객관리'+and+mimeType%3D'application%2Fvnd.google-apps.spreadsheet'+and+trashed%3Dfalse&fields=files(id,name,createdTime)&orderBy=createdTime desc";
console.log(" 기존 시트 검색 중...");
const resp = await fetch(listUrl, {
headers: { Authorization: `Bearer ${token}` }
});

if (resp.ok) {
const result = await resp.json();
if (result.files && result.files.length > 0) {
    const existingId = result.files[0].id;
    console.log(" 기존 시트 발견:", existingId, result.files[0].name);
    try {
        const sheetMeta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: existingId });
        const existingTabs = sheetMeta.result.sheets.map(s => s.properties.title);
        const genSheetName = "weraclecrm";
        const corpSheetName = "corporatecrm";
        const requiredTabs = [genSheetName, corpSheetName, "schedule", "dashboard_stats", "보험관리"];
        const missingTabs = requiredTabs.filter(t => !existingTabs.includes(t) && !existingTabs.includes("일반고객") && !existingTabs.includes("법인고객") && !existingTabs.includes("CRM_Contacts"));
          
          if (missingTabs.length > 0) {
              console.log(" 누락된 탭 추가 생성 중...", missingTabs);
              const requests = missingTabs.map(t => ({ addSheet: { properties: { title: t } } }));
              const batchResp = await gapi.client.sheets.spreadsheets.batchUpdate({
                  spreadsheetId: existingId,
                  resource: { requests }
              });
              
              if(batchResp.status !== 200) throw new Error("Batch update failed");

              for (const sName of missingTabs) {
                  const headers = sName === "보험관리" ? getInsuranceHeaders() : getCrmHeaders(sName);
                  await gapi.client.sheets.spreadsheets.values.update({
                      spreadsheetId: existingId,
                      range: sName + "!A1",
                      valueInputOption: "USER_ENTERED",
                      resource: { values: [headers] }
                  });
              }
              console.log(" 누락된 탭 및 헤더 생성 완료.");
          }

    } catch (e) {
        console.warn(" 기존 시트 탭 검증 중 오류:", e);
    }
    return existingId;
}
console.log(" 기존 시트 없음. 새로 생성합니다...");
} else {
const errText = await resp.text();
console.warn(` 시트 검색 API 에러 (status ${resp.status}):`, errText);
// Drive 검색이 실패해도 시트 생성은 Sheets API로 시도
console.log(" Drive 검색 실패. Sheets API로 직접 시트 생성을 시도합니다...");
}
} catch (searchErr) {
console.warn(" 시트 검색 중 네트워크 오류:", searchErr);
}

// 2단계: 새 시트 생성 (Sheets API 사용 - spreadsheets scope로 가능)
console.log(" '위라클_고객관리' 통합 시트 생성 중...");
const createResp = await gapi.client.sheets.spreadsheets.create({
resource: {
properties: { title: "위라클_고객관리" },
sheets: [
  { properties: { title: "weraclecrm" } },
  { properties: { title: "corporatecrm" } },
  { properties: { title: "schedule" } },
  { properties: { title: "dashboard_stats" } },
  { properties: { title: "보험관리" } }
  ]
}
});
const newSheetId = createResp.result.spreadsheetId;
console.log(" 새 시트 생성 완료:", newSheetId);

// 새로 생성된 시트의 첫 번째 탭 이름을 알아와 세팅
await initSheetMetadata(newSheetId);

// 4개 시트 모두에 헤더 초기화
const sheetsToInit = ['weraclecrm', 'corporatecrm', 'schedule', 'dashboard_stats', '보험관리'];
for (const sName of sheetsToInit) {
    const headers = sName === "보험관리" ? getInsuranceHeaders() : getCrmHeaders(sName);
    const range = sName + "!A1";
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: newSheetId,
      range: range,
      valueInputOption: "USER_ENTERED",
      resource: { values: [headers] }
    });
    await formatSheetColumnsAsText(newSheetId, sName, headers);
  }
console.log(" 모든 탭 헤더 초기화 및 폰번호/주민번호 열 텍스트 서식 지정 완료.");
return newSheetId;
}
async function fetchMonthlyTargetsFromSheet() {
try {
const resp = await gapi.client.sheets.spreadsheets.values.get({
spreadsheetId: spreadsheetId,
range: `월별_실적_목표!A2:G`,
});
const rows = resp.result.values;
if (!rows || rows.length === 0) return [];
return rows.map(row => {
return {
"기준월": row[0] || "",
"손보_목표": parseInt((row[1] || "0").toString().replace(/[^0-9]/g, ''), 10) || 0,
"생보_목표": parseInt((row[2] || "0").toString().replace(/[^0-9]/g, ''), 10) || 0,
"이번달_다짐": row[3] || (row[4] || ""),
"손보_현재실적": parseInt((row[4] || "0").toString().replace(/[^0-9]/g, ''), 10) || 0,
"생보_현재실적": parseInt((row[5] || "0").toString().replace(/[^0-9]/g, ''), 10) || 0,
"관리고객_총수": parseInt((row[6] || "0").toString().replace(/[^0-9]/g, ''), 10) || 0
};
});
} catch(e) {
console.warn("월별_실적_목표 탭을 불러오지 못했습니다.", e);
return [];
}
}


// 시트 전체 행 데이터 파싱
async function fetchClientsFromSheet(targetSheetParam) {
  let sName = targetSheetParam || window.targetSheetName || sheetName;
  let endCol = getCrmEndCol(sName);
  let resp;
  let rows = [];
  try {
      // First, get ALL sheet names so we can be smart
      let metaResp;
      try {
          metaResp = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: spreadsheetId });
      } catch(e) {
          console.error("Failed to get sheet metadata", e);
          return [];
      }
      const existingTitles = metaResp.result.sheets.map(s => s.properties.title);
      
      // Try to find the BEST sheet that actually contains data!
      let sheetCandidates = [];
      const isCorpTarget = (sName === "corporatecrm" || sName === "법인고객" || sName === "corporatecrm");
      
      if (isCorpTarget) {
          sheetCandidates = [sName, "corporatecrm", "법인고객", "법인", "법인 고객"];
          sheetCandidates = [...new Set(sheetCandidates)].filter(title => existingTitles.includes(title));
      } else {
          sheetCandidates = [sName, "weraclecrm", "일반고객", "고객관리", "일반", "일반 고객", "CRM_Contacts"];
          // 법인 시트들을 제외한 모든 시트들을 폴백으로 추가 (사용자가 임의로 이름을 바꾼 경우 대비)
          const excludeForGen = ["corporatecrm", "법인고객", "법인", "법인 고객", "보험관리", "dashboard_stats", "schedule", "corporatecrm"];
          const otherTitles = existingTitles.filter(t => !excludeForGen.includes(t));
          sheetCandidates = [...sheetCandidates, ...otherTitles];
          sheetCandidates = [...new Set(sheetCandidates)].filter(title => existingTitles.includes(title));
      }
      
      let bestCandidate = null;
      let bestResp = null;
      let bestRows = null;
      
      // HOTFIX: Do not loop over all candidates (causes 429 Too Many Requests). Just pick the first matched one.
      if (existingTitles.includes(sName)) {
          bestCandidate = sName;
      } else if (sheetCandidates.length > 0) {
          bestCandidate = sheetCandidates[0];
      }

      if (bestCandidate) {
          try {
              const endColStr = getCrmEndCol(bestCandidate);
              bestResp = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: spreadsheetId, range: `${bestCandidate}!A1:${endColStr}` });
              bestRows = bestResp.result.values;
          } catch(e) {
              console.warn("Failed to fetch best candidate", e);
          }
      }
      
      if (bestCandidate) {
          resp = bestResp;
          rows = bestRows;
          sName = bestCandidate;
          // window.targetSheetName = sName; // 방어 코드: fetch가 전역 변수를 오염시키지 못하게 차단
          if (targetSheetParam === "weraclecrm" || targetSheetParam === "weraclecrm") {
              window.resolvedGeneralSheetName = "weraclecrm";
          } else if (targetSheetParam === "corporatecrm" || targetSheetParam === "corporatecrm") {
              window.resolvedCorporateSheetName = "corporatecrm";
          }
          console.log(" Auto-discovered valid CRM data in sheet:", sName, "with", bestRows ? bestRows.length : 0, "rows");
      }
      
      if (!rows || rows.length === 0) return [];
let headers = getCrmHeaders(sName);
let dataRows = rows;
const headerJoin = rows.length > 0 ? rows[0].map(h => String(h||"").trim()).join(" ") : "";
if (rows.length > 0 && (headerJoin.includes("고객명") || headerJoin.includes("이름") || headerJoin.includes("고객번호") || headerJoin.includes("상태"))) {
    headers = rows[0].map(h => String(h || '').trim());
    dataRows = rows.slice(1);
}
return dataRows.map((row, idx) => {
const client = { rowNumber: idx + 2, sheetName: sName };
headers.forEach((header, colIdx) => {
let val = row[colIdx] || "";
if (header === "가입내역" || header.includes("가입내역") || header === "터치인사이트" || header === "알릴의무사항") {
try {
client[header] = val && (val.startsWith("[") || val.startsWith("{")) ? JSON.parse(val) : val;
} catch (e) {
client[header] = (header === "터치인사이트" ? [] : val);
}
} else {
client[header] = val;
}
});
if (client["주민등록번호"] && client["주민등록번호"].length >= 6) {
    if (!client["생일"] || !client["상령일"] || !client["나이"] || !client["성별"]) {
        if (typeof calculateJuminData === 'function') {
            const jd = calculateJuminData(client["주민등록번호"]);
            if (jd) {
                client["나이"] = client["나이"] || jd.age;
                client["성별"] = client["성별"] || jd.gender;
                client["생일"] = client["생일"] || jd.birth;
                client["상령일"] = client["상령일"] || jd.sang;
            }
        }
    }
}
return client;
});
} catch (err) {
console.warn(`Failed to fetch from sheet: ${sName}`, err);
return [];
}
}
// ==========================================
// 5. CRM 고객 CRUD 핵심 연동 구현
// ==========================================

async function saveClientToServer(clientObj, insRows) {
    window._routedMap = {};
    let routedMap = window._routedMap;
    if (insRows && insRows.length > 0) {
        const extractPureName = (str) => {
            if (!str) return "";
            let s = String(str).replace(/\s*\([^)]*\)/g, '');
            s = s.replace(/\s+/g, '');
            const suffixes = ["본인", "배우자", "자녀", "부", "모", "동생", "형제", "자매", "형님", "대표", "대표자"];
            for (let suf of suffixes) {
                if (s.endsWith(suf) && s !== suf) {
                    s = s.slice(0, -suf.length);
                    break;
                }
            }
            return s;
        };

        let myName = extractPureName(clientObj['고객명']);
        let myRootId = String(clientObj['고객번호'] || '').split('-')[0];
        let currentTabInsRows = [];
        
        insRows.forEach(ins => {
            let rawContractor = ins['계약자'] || ins['차_계약자'] || "";
            let cleanContractor = extractPureName(rawContractor);
            
            if (!cleanContractor || cleanContractor === myName || cleanContractor === "본인") {
                currentTabInsRows.push(ins);
            } else {
                const targetIdx = globalCustomerData.findIndex(c => {
                    const cid = String(c['고객번호'] || '');
                    return cid.split('-')[0] === myRootId && extractPureName(c['고객명']) === cleanContractor;
                });
                
                if (targetIdx !== -1) {
                    if (!routedMap[targetIdx]) routedMap[targetIdx] = [];
                    let rawInsured = ins['피보험자'] || ins['차_피보험자'] || "";
                    if (!rawInsured || extractPureName(rawInsured) === "본인") {
                        if ('피보험자' in ins || !('차_피보험자' in ins)) ins['피보험자'] = myName;
                        if ('차_피보험자' in ins) ins['차_피보험자'] = myName;
                    }
                    routedMap[targetIdx].push(ins);
                } else {
                    currentTabInsRows.push(ins);
                }
            }
        });
        
        insRows = currentTabInsRows; 
        clientObj["가입내역"] = JSON.stringify(currentTabInsRows);
        clientObj["보험가입리스트"] = currentTabInsRows;
        
        for (let tIdx in routedMap) {
            let tClient = globalCustomerData[tIdx];
            let tInsRows = routedMap[tIdx];
            
            let existingIns = [];
            if (typeof tClient["가입내역"] === "string") {
                try { existingIns = JSON.parse(tClient["가입내역"]); } catch(e){}
            } else if (Array.isArray(tClient["가입내역"])) {
                existingIns = tClient["가입내역"];
            }
            
            tInsRows.forEach(ins => existingIns.push(ins));
            tClient["가입내역"] = JSON.stringify(existingIns);
            tClient["보험가입리스트"] = existingIns;
            
            let sName = tClient.sheetName || "weraclecrm";
            let headers = window.getCrmHeaders(sName);
            let rowData = headers.map(h => tClient[h] !== undefined ? tClient[h] : "");
            
            let rNum = tClient.rowNumber;
            if (rNum) {
                try {
                    await gapi.client.sheets.spreadsheets.values.update({
                        spreadsheetId: (window.spreadsheetId || localStorage.getItem("g_sheet_id")),
                        range: sName + "!A" + rNum,
                        valueInputOption: "USER_ENTERED",
                        resource: { values: [rowData] }
                    });
                } catch (e) {
                    console.error("Routed save failed", e);
                }
            }
        }
    }
    const actualSheetId = localStorage.getItem('g_sheet_id') || spreadsheetId;
    if (actualSheetId && actualSheetId !== spreadsheetId) spreadsheetId = actualSheetId;
    if (!isDemoMode) {
        const token = await ensureValidToken();
        if (!token) { window.isSubmittingCrm = false;
  return false;
  } 
  }
    showLoading(true);
    try {
        let targetIdx = -1;
        if (window.isEditMode && window.editTargetId) {
            if (clientObj["UID"]) targetIdx = globalCustomerData.findIndex(c => c["UID"] === clientObj["UID"]);
            if (targetIdx === -1) targetIdx = globalCustomerData.findIndex(c => String(c["고객번호"] || c["사업자번호"]) === window.editTargetId);
        }
        const sName = (targetIdx !== -1 && globalCustomerData[targetIdx].sheetName) ? globalCustomerData[targetIdx].sheetName : (window.targetSheetName || "weraclecrm");
        const insSheetName = "보험관리";
        
        let custHeaders = getCrmHeaders(sName);
        let custValues = custHeaders.map(h => clientObj[h] !== undefined ? clientObj[h] : "");
        let insHeaders = getInsuranceHeaders();

        if (isDemoMode) {
            if (window.isEditMode && window.editTargetId) {
                if (targetIdx !== -1) {
                    clientObj.rowNumber = globalCustomerData[targetIdx].rowNumber;
                    globalCustomerData[targetIdx] = clientObj;
                }
            } else {
                clientObj.rowNumber = globalCustomerData.length > 0 ? Math.max(...globalCustomerData.map(c => c.rowNumber)) + 1 : 2;
                globalCustomerData.push(clientObj);
            }
            localStorage.setItem("demo_crm_data", JSON.stringify(globalCustomerData));
            if (!window.isFamilySubmit) { showCustomAlert("저장 완료", "데모 환경에서 정보가 임시 저장되었습니다."); }
            const modal = document.getElementById("regModal");
            
            window.isSubmittingCrm = false;
            checkPendingFamilyRegistration();
            if (typeof renderTable === "function") { updateQuickFilterCounts(); renderTable(); }
            return;
        }

        try {
            const sheetMeta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
            const existingSheets = sheetMeta.result.sheets.map(s => s.properties.title);
            if (!existingSheets.includes(insSheetName)) {
                await gapi.client.sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    resource: { requests: [{ addSheet: { properties: { title: insSheetName } } }] }
                });
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: insSheetName + "!A1",
                    valueInputOption: "USER_ENTERED",
                    resource: { values: [insHeaders] }
                });
            }

        } catch (e) { console.warn("시트 동기화 오류:", e); }

        if (window.isEditMode && window.editTargetId) {
            if (targetIdx !== -1) {
                const rNum = globalCustomerData[targetIdx].rowNumber;
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: sName + "!A" + rNum,
                    valueInputOption: "USER_ENTERED",
                    resource: { values: [custValues] }
                });
                globalCustomerData[targetIdx] = clientObj;
                clientObj.rowNumber = rNum;
            }
        } else {
            const appendResp = await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId,
                range: sName + "!A1",
                valueInputOption: "USER_ENTERED",
                resource: { values: [custValues] }
            });
            const updatedRange = appendResp.result.updates.updatedRange;
            const match = updatedRange.match(/!A(\d+)/);
            if (match) clientObj.rowNumber = parseInt(match[1], 10);
            globalCustomerData.push(clientObj);
        }

        try {
            let allInsRows = [];
            if (window.isFamilySubmitInProgress && window.familyInsRowsCache) {
                allInsRows = window.familyInsRowsCache;
            } else {
                const insResp = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId, range: insSheetName + "!A2:Z" });
                allInsRows = insResp.result.values || [];
            }
            allInsRows = allInsRows.filter(row => {
                const rowId = String(row[0] || "").trim();
                const clientId = String(clientObj["고객번호"] || clientObj["사업자번호"] || clientObj["ID"] || "").trim();
                if (clientId && rowId === clientId) return false;
                if (window.isEditMode && window.editTargetId && rowId === String(window.editTargetId).trim()) return false;
                return true;
            });
            
            // 항시 보험관리 탭용 배열로 매핑
            if (insRows && insRows.length > 0) {
                let formattedInsRows = insRows.map(insObj => {
                    return insHeaders.map(h => {
                        if (h === "고객번호") return clientObj["고객번호"];
                        if (h === "UID") return clientObj["UID"] || "";
                        if (h === "고객명" || h === "이름") return clientObj["고객명"] || clientObj["이름"] || clientObj["대표자명"] || "";
                        if (h === "주민번호") return clientObj["주민번호"] || clientObj["대표자 생일"] || "";
                        let val = "";
                        if (h === "계약자") val = insObj["계약자"] || insObj["차_계약자"] || "";
                        else if (h === "피보험자") val = insObj["피보험자"] || insObj["차_피보험자"] || "";
                        else if (h === "보험사명") val = insObj["보험사명"] || insObj["차_보험사명"] || "";
                        else if (h === "상품명") val = insObj["상품명"] || insObj["차_상품명"] || "";
                        else if (h === "결제방식") val = insObj["결제방식"] || insObj["차_결제방식"] || "";
                        else if (h === "체결일") val = insObj["체결일"] || insObj["책임개시일"] || "";
                        else if (h === "결제일") val = insObj["결제일"] || insObj["차_결제일"] || "";
                        else if (h === "결제정보") val = insObj["결제정보"] || insObj["차_결제정보"] || "";
                        else val = insObj[h] !== undefined ? insObj[h] : "";
                        return typeof val === 'object' ? JSON.stringify(val) : val;
                    });
                });
                allInsRows.push(...formattedInsRows);
            }
            if (window._routedMap && Object.keys(window._routedMap).length > 0) {
                for (let tIdx in window._routedMap) {
                    let tClient = globalCustomerData[tIdx];
                    let tInsRows = window._routedMap[tIdx];
                    let formattedTarget = tInsRows.map(insObj => {
                        return insHeaders.map(h => {
                            if (h === "고객번호") return tClient["고객번호"];
                            if (h === "UID") return tClient["UID"] || "";
                            if (h === "고객명" || h === "이름") return tClient["고객명"] || tClient["이름"] || tClient["대표자명"] || "";
                            if (h === "주민번호") return tClient["주민번호"] || tClient["대표자 생일"] || "";
                            let val = "";
                            if (h === "계약자") val = insObj["계약자"] || insObj["차_계약자"] || "";
                            else if (h === "피보험자") val = insObj["피보험자"] || insObj["차_피보험자"] || "";
                            else if (h === "보험사명") val = insObj["보험사명"] || insObj["차_보험사명"] || "";
                            else if (h === "상품명") val = insObj["상품명"] || insObj["차_상품명"] || "";
                            else if (h === "결제방식") val = insObj["결제방식"] || insObj["차_결제방식"] || "";
                            else if (h === "체결일") val = insObj["체결일"] || insObj["책임개시일"] || "";
                            else if (h === "결제일") val = insObj["결제일"] || insObj["차_결제일"] || "";
                            else if (h === "결제정보") val = insObj["결제정보"] || insObj["차_결제정보"] || "";
                            else val = insObj[h] !== undefined ? insObj[h] : "";
                            return typeof val === 'object' ? JSON.stringify(val) : val;
                        });
                    });
                    allInsRows.push(...formattedTarget);
                }
            }
            if (window.isFamilySubmitInProgress) { window.familyInsRowsCache = allInsRows; }
            await gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId, range: insSheetName + "!A2:Z" });
            if (allInsRows.length > 0) {
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: insSheetName + "!A2",
                    valueInputOption: "USER_ENTERED",
                    resource: { values: allInsRows }
                });
            }
        } catch (e) { console.error("보험 탭 저장 실패:", e); }

        // 시트 자동 정렬(sortSheetByColumnA) 및 전체 새로고침(_doLoadCRMData)을 제거하여
        // 저장 시 API 호출량을 13회 -> 2회로 대폭 줄이고 429 에러(모든 데이터 0명 표시)를 원천 차단합니다.
        if(window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'syncData', data: globalCustomerData, crmContacts: window.crmContactsData || [] }, '*');
        }

        if (!window.isFamilySubmit) { 
            showCustomAlert("저장 완료", "데이터가 엑셀에 깔끔하게 저장되고 정렬되었습니다."); 
            if (typeof closeRegModal === "function") closeRegModal();
        }
        window.isSubmittingCrm = false;
        
        checkPendingFamilyRegistration();
        
        if (typeof renderTable === "function") {
            updateQuickFilterCounts();
            renderTable();
        }
        
        // 저장 후 리스트 창 자동으로 다시 열기 (사용자가 헷갈리지 않게 함)
        if (!window.isFamilySubmit) {
            if (typeof window.openTotalCustomers === "function") {
                window.openTotalCustomers();
            }
        }

        return clientObj;
    } catch (err) {
        console.error("Save Client Error:", err);
        let msg = err.message || err.result?.error?.message || "";
        if (msg === "Failed to fetch" || msg.includes("A network error occurred")) {
            showCustomAlert("구글 로그인 만료", "구글 로그인 세션(1시간)이 만료되어 연결이 끊겼습니다.<br><br>우측 상단의 <b>[연동 해제]</b> 버튼을 누른 후, 다시 Google 로그인을 진행해 주시면 즉시 정상 저장됩니다.");
        } else {
            showCustomAlert("저장 실패", "오류: " + msg);
        }
        window.isSubmittingCrm = false;
    } finally { if (!window.isFamilySubmit) { showLoading(false); } }
}

async function executeDelete(rowNumber, name) {
if (!isDemoMode) {
const token = await ensureValidToken();
if (!token) { window.isSubmittingCrm = false;
  return false;
  } 
  }
showLoading(true);
try {
if (isDemoMode) {
globalCustomerData = globalCustomerData.filter(c => c.rowNumber !== rowNumber);
globalCustomerData.forEach((c, idx) => {
c.rowNumber = idx + 2;
});
localStorage.setItem("demo_crm_data", JSON.stringify(globalCustomerData));
showCustomAlert(" 삭제 완료", `고객 [${name}] 님의 정보가 안전하게 삭제되었습니다.`);
renderTable();
return;
}
const rowIndex = rowNumber - 1;
await gapi.client.sheets.spreadsheets.batchUpdate({
spreadsheetId: spreadsheetId,
resource: {
requests: [
{
deleteDimension: {
range: {
sheetId: sheetIdVal,
dimension: "ROWS",
startIndex: rowIndex,
endIndex: rowIndex + 1
}
}
}
]
}
});
showCustomAlert(" 삭제 완료", `고객 [${name}] 님의 정보가 구글 시트에서 안전하게 영구 삭제되었습니다.`);
await loadCRMData();
} catch (err) {
console.error("Delete Error:", err);
alert("고객 삭제 실패: " + (err.message || err.result?.error?.message));
} finally { if (!window.isFamilySubmit) { showLoading(false); } }
}
async function executeChangeId() {
const oldId = document.getElementById("oldIdInput").value.trim();
const newId = document.getElementById("newIdInput").value.trim();
if (!oldId || !newId) {
showCustomAlert(" 입력 누락", "현재 번호와 변경할 새 번호를 모두 입력해주세요.");
return;
}
const targetClient = globalCustomerData.find(c => c["고객번호"] === oldId);
if (!targetClient) {
showCustomAlert(" 조회 실패", `현재 등록된 고객 번호 [${oldId}] 가 존재하지 않습니다.`);
return;
}
const duplicate = globalCustomerData.find(c => c["고객번호"] === newId);
if (duplicate) {
showCustomAlert(" 번호 중복", `변경하려는 새 번호 [${newId}] 는 이미 등록되어 있습니다.`);
return;
}
if (!isDemoMode) {
const token = await ensureValidToken();
if (!token) { window.isSubmittingCrm = false;
  return false;
  } 
  }
showLoading(true);
try {
if (isDemoMode) {
const client = globalCustomerData.find(c => c["고객번호"] === oldId);
if (client) {
client["고객번호"] = newId;
}
localStorage.setItem("demo_crm_data", JSON.stringify(globalCustomerData));
showCustomAlert(" 변경 완료", `고객번호가 [${oldId}] 에서 [${newId}] 로 일괄 변경되었습니다.`);
document.getElementById("changeIdModal").style.display = "none";
renderTable();
return;
}
await gapi.client.sheets.spreadsheets.values.update({
spreadsheetId: spreadsheetId,
range: `${sheetName}!A${targetClient.rowNumber}`,
valueInputOption: "RAW",
resource: { values: [[newId]] }
});
document.getElementById("changeIdModal").style.display = "none";
showCustomAlert(" 변경 완료", `고객번호가 [${oldId}] 에서 [${newId}] 로 일괄 변경되었습니다.`);
await loadCRMData();
} catch (err) {
console.error("ID Change Error:", err);
alert("고객번호 변경 실패: " + (err.message || err.result?.error?.message));
} finally { if (!window.isFamilySubmit) { showLoading(false); } }
}
// ==========================================
// 6. 데이터 필터링 & 화면 렌더링
// ==========================================
let activeFilters = {
search: "",
quick: null,
month: ""
};
window.buildFullAccRow = function(mData) {
    const member = mData.member;
    const mId = mData.mId;
    const isCorp = false;
const safeName = String(mData.mName).replace(/'/g, "\\'");
const safePhone = String(formatPhone(member["폰번호"] || member["대표자폰번호"] || member["대표자핸드폰"] || member["대표핸드폰"]) || "-").replace(/'/g, "\\'");
const safeAddr = String(member["주소"] || member["대표주소"] || "-").replace(/'/g, "\\'");
const safeJob = String(member["직업"] || member["업태"] || "-").replace(/'/g, "\\'");
const safeJumin = String(formatJumin(member["주민번호"] || member["사업자번호"]) || "-").replace(/'/g, "\\'");
    
    let info1Html = "";
    let info2Html = "";
    if (isCorp) {
        info1Html = `<div class="detail-grid">
            <div class="detail-item"><strong>사업자번호 / 설립일</strong><span>${member["사업자번호"] || "-"} / ${member["설립일"] || "-"}</span></div>
            <div class="detail-item"><strong>법인번호 / 법인명</strong><span>${member["법인번호"] || "-"} / ${member["법인명"] || "-"}</span></div>
            <div class="detail-item"><strong>대표업종 / 상태</strong><span>${member["대표업종"] || member["대표업태"] || "-"} / ${member["상태"] || "-"}</span></div>
            <div class="detail-item"><strong>대표자명 / 주민번호</strong><span>${member["대표자명"] || "-"} / ${formatJumin(member["대표자주민번호"]) || "-"}</span></div>
            <div class="detail-item" style="grid-column: 1 / -1;"><strong>사업장주소(대표주소)</strong><span>${member["사업장주소"] || member["대표주소"] || member["주소"] || "-"}</span></div>
            <div class="detail-item"><strong>폰번호 / 회사전화번호</strong><span>${formatPhone(member["대표자폰번호"] || member["대표자핸드폰"] || member["대표핸드폰"]) || "-"} / ${formatPhone(member["사업자전화번호"] || member["사업장전화번호"] || member["회사전화번호"]) || "-"}</span></div>
            <div class="detail-item" style="grid-column: 1 / -1;"><strong>터치인사이트</strong><span>${cleanTouchInsight(member["터치인사이트"] || "-")}</span></div>
        </div>`;
        info2Html = `<div style="padding:15px; color:#64748b;">법인 고객은 2차 정보가 없습니다.</div>`;
    } else {
        info1Html = `<div class="detail-grid">
            <div class="detail-item"><strong>폰번호 / 상태</strong><span>${formatPhone(member["폰번호"] || "")} / ${member["상태"] || "-"}</span></div>
            <div class="detail-item"><strong>나이/성별/직업(상세)</strong><span>${member["나이"] ? member["나이"] + "세" : "-"} / ${member["성별"] || "-"} / ${member["직업"] || member["업태"] || "-"} (${member["상세업무"] || "-"})</span></div>
            <div class="detail-item"><strong>주민번호</strong><span>${formatJumin(member["주민번호"] || member["사업자번호"]) || "-"} <span class="copy-badge" style="background: #f1f5f9; color: #4f46e5; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer; margin-left: 6px; border: 1px solid #c7d2fe; display: inline-block;" onclick="copyJumin('${member["주민번호"] || member["사업자번호"]}', false)" title="주민번호 전체 복사">복사</span> <span class="copy-badge" style="background: #f8fafc; color: #64748b; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer; margin-left: 3px; border: 1px solid #cbd5e1; display: inline-block;" onclick="copyJumin('${member["주민번호"] || member["사업자번호"]}', true)" title="뒷자리 마스킹(*) 복사">마스킹(*)</span></span></div>
            <div class="detail-item"><strong>생일 / 상령일</strong><span>${member["생일"] || "-"} / ${member["상령일"] || "-"}</span></div>
            <div class="detail-item" style="grid-column: 1 / -1;"><strong>상세 주소</strong><span>${member["주소"] || member["대표주소"] || "-"}</span></div>
        </div>`;
        info2Html = `<div class="detail-grid">
            <div class="detail-item"><strong>가족사항</strong><span>${member["가족사항"] || "-"}</span></div>
            <div class="detail-item"><strong>반려동물(종/이름/코드)</strong><span>${member["반려동물"] || "-"} / ${member["동물이름"] || "-"} / ${member["코드"] || "-"}</span></div>
            <div class="detail-item"><strong>운전여부 / 차량용도</strong><span>${member["운전여부"] || "-"} / ${member["차량용도"] || member["차종류"] || "-"}</span></div>
            <div class="detail-item" style="grid-column: 1 / -1;"><strong>터치인사이트</strong><span>${cleanTouchInsight(member["터치인사이트"] || "-")}</span></div>
        </div>`;
    }
    
    let memberMemoHtml = `<div class="detail-grid">
        <div class="detail-item" style="grid-column: 1 / -1;"><strong>특이사항(상담메모)</strong><span>${member["특이사항"] || member["상담메모"] || "-"}</span></div>
    </div>`;
    
    let mInsTableHtml = `<div style="width:100%; overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left; border:2px solid #cbd5e1; background:white; min-width:600px;">
        <thead style="background:#f1f5f9;">
            <tr>
                <th style="border:1px solid #cbd5e1; padding:8px; font-weight:700; color:#334155; width:15%;">보험사명</th>
                <th style="border:1px solid #cbd5e1; padding:8px; font-weight:700; color:#334155; width:20%;">상품/차종</th>
                <th style="border:1px solid #cbd5e1; padding:8px; font-weight:700; color:#334155; width:15%;">계약/피보험자</th>
                <th style="border:1px solid #cbd5e1; padding:8px; font-weight:700; color:#334155; width:10%;">보험료</th>
                <th style="border:1px solid #cbd5e1; padding:8px; font-weight:700; color:#334155; width:20%;">체결/납기/만기</th>
                <th style="border:1px solid #cbd5e1; padding:8px; font-weight:700; color:#334155; width:20%;">특약/용도</th>
            </tr>
        </thead>
        <tbody>
    `;
    
    if (mData.insList.length === 0) {
        mInsTableHtml += `<tr><td colspan="6" style="border:1px solid #e2e8f0; padding:15px; text-align:center; color:#94a3b8;">가입내역이 없습니다.</td></tr>`;
    } else {
        mData.insList.forEach(ins => {
            let price = ins["보험료"] || ins["차_보험료"] || ins.premium || "-";
            if (price !== "-" && !isNaN(price.replace(/,/g, ''))) price = Number(price.replace(/,/g, '')).toLocaleString() + "원";
            mInsTableHtml += `
                <tr>
                    <td style="border:1px solid #e2e8f0; padding:8px;">${ins["보험종류"]==='자동차보험' ? '(자동차)<br>'+(ins["차_보험사명"]||ins["보험사명"]||"-") : (ins["보험사명"]||ins.company||"-")}</td>
                    <td style="border:1px solid #e2e8f0; padding:8px;">${ins["상품명"]||ins.product||(ins["차종"]||"-")}</td>
                    <td style="border:1px solid #e2e8f0; padding:8px;">계: ${ins["계약자"]||ins["차_계약자"]||"-"} / 피: ${ins["보험종류"]==='자동차보험' ? (ins["차_피보험자"]||"-") : (ins["피보험자"]||ins.insured||"-")}</td>
                    <td style="border:1px solid #e2e8f0; padding:8px; text-align:right; font-weight:600;">${price}</td>
                    <td style="border:1px solid #e2e8f0; padding:8px; font-size:11px; color:#64748b;">${ins["보험종류"]==='자동차보험' ? (ins["책임개시일"]||ins["체결일"]||"-") : (ins["체결일"]||ins.date||"-")}<br>${ins["납입기간"]||ins.payPeriod||"-"} / ${ins["만기일"]||ins.expireDate||"-"}</td>
                    <td style="border:1px solid #e2e8f0; padding:8px; font-size:11px;">${ins["보험종류"]==='자동차보험' ? (ins["운전자특약"]||"-")+'/'+(ins["연령특약"]||"-") : (ins["가입내역"]||ins.type||"-")}</td>
                </tr>
            `;
        });
    }
    mInsTableHtml += `</tbody></table></div>`;
    
    const accRow = document.createElement("tr");
    accRow.id = `detail-row-${mId}`;
    accRow.className = "accordion-row";
    accRow.style.display = "none";
    accRow.innerHTML = `
        <td colspan="20" style="padding:0; border:none; background:#f8fafc;">
            <div class="accordion-content" style="padding:20px; box-shadow:inset 0 4px 6px -4px rgba(0,0,0,0.1);">
                <div id="cont-${mId}-all" class="acc-pane" style="display:none;">
                                          <div style="margin-bottom:15px; font-size:16px; font-weight:800; color:#1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; display:flex; justify-content:space-between; align-items:center;">
                          <span> 전체 정보 상세 (${mData.mName})</span>
                          <button style="background:#10b981; color:white; border:none; font-weight:800; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px;" onclick="printCustomerReport('${mId}')">PDF 요약 리포트</button>
                      </div>
                    ${info1Html}
                    ${info2Html}
                    ${memberMemoHtml}
                    ${mInsTableHtml}
                </div>
                <div id="cont-${mId}-info1" class="acc-pane" style="display:none;">
                                          <div style="margin-bottom:15px; font-size:16px; font-weight:800; color:#1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; display:flex; justify-content:space-between; align-items:center;">
                          <span> 1차 정보 상세 (${mData.mName})</span>
                          <div style="display:flex; gap:6px;">
                              <button style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-weight:800; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:12px;" onclick="copyCustomerInfo(this, '${safeName}', '${safeJumin}', '${safePhone}', '${safeAddr}', '${safeJob}', false)">전달용 전체 </button>
                              <button style="background:#f8fafc; color:#64748b; border:1px solid #cbd5e1; font-weight:800; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:12px;" onclick="copyCustomerInfo(this, '${safeName}', '${safeJumin}', '${safePhone}', '${safeAddr}', '${safeJob}', true)">전달용 마스킹(*) </button>
                          </div>
                      </div>
                    ${info1Html}
                </div>
                <div id="cont-${mId}-info2" class="acc-pane" style="display:none;">
                    <div style="margin-bottom:15px; font-size:16px; font-weight:800; color:#1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;"> 터치인사이트 (${mData.mName})</div>
                    ${info2Html}
                </div>
                <div id="cont-${mId}-memo" class="acc-pane" style="display:none;">
                    <div style="margin-bottom:15px; font-size:16px; font-weight:800; color:#1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;"> 상담 메모 (${mData.mName})</div>
                    ${memberMemoHtml}
                </div>
                <div id="cont-${mId}-gaip" class="acc-pane" style="display:none;">
                    <div style="margin-bottom:15px; font-size:16px; font-weight:800; color:#1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; display:flex; justify-content:space-between; align-items:center;">
                        <span> 보험 가입내역 상세 (${mData.mName})</span>
                        <button style="background:#10b981; color:white; border:none; font-weight:800; padding:6px 12px; border-radius:6px; cursor:pointer;" onclick="printCustomerReport('${mId}')">PDF 리포트 다운로드</button>
                    </div>
                    ${mInsTableHtml}
                </div>
            </div>
        </td>
    `;
    return accRow;
};

function renderTable() {

  console.log(' NEW RENDER TABLE IS RUNNING!!! ');
window.globalCustomerData = globalCustomerData;
window.globalTargetData = globalTargetData;
const targetIframe = document.getElementById('targetIframe');
if (targetIframe && targetIframe.contentWindow) {
targetIframe.contentWindow.postMessage({ 
type: 'syncData', 
data: globalCustomerData, 
targetData: globalTargetData,
crmContacts: window.crmContactsData || [],
metrics: window.currentMetrics || null
}, '*');
}
if (window.parent && window.parent !== window) {
window.parent.postMessage({ type: 'syncData', 
data: globalCustomerData, 
targetData: globalTargetData,
crmContacts: window.crmContactsData || [],
metrics: window.currentMetrics || null
}, '*');
}
updateQuickFilterCounts();
const body = document.getElementById("crmBody") || document.getElementById("listTableBody");
    const thead = document.querySelector("#crmTable thead");
    if(thead) thead.style.display = "table-header-group";
body.innerHTML = "";

let filtered = globalCustomerData.filter(client => {
if (activeFilters.search) {
const query = activeFilters.search.toLowerCase();
const isMatch = Object.keys(client).some(key => {
const val = client[key];
if (val === undefined || val === null) return false;
if (typeof val === 'object') {
return JSON.stringify(val).toLowerCase().includes(query);
}
return String(val).toLowerCase().includes(query);
});
if (!isMatch) return false;
}
  // --- New Dashboard Filters ---
  // 1. Pipeline Filter
  if (window.currentPipeline) {
      let cStatus = client['\uC0C1\uD0DC'] || '';
      let pipe = window.currentPipeline;
      let isMatch = false;
      if (pipe === '\uAD00\uC2EC' && cStatus.includes('\uAD00\uC2EC')) isMatch = true;
      else if (pipe === '\uC0C1\uB2F4' && cStatus.includes('\uC0C1\uB2F4')) isMatch = true;
      else if (pipe === '\uACC4\uC57D' && (cStatus.includes('\uACC4\uC57D') || cStatus.includes('\uCCB4\uACB0') || cStatus.includes('\uC720\uC9C0'))) isMatch = true;
      else if (pipe === '\uC9D1\uC911' && (cStatus.includes('\uC9D1\uC911') || cStatus.includes('VIP') || cStatus.includes('\uC990\uACA8\uCC3E\uAE30'))) isMatch = true;
      if (!isMatch) return false;
  }

  // 2. Insight Themes & Quick Insights
  let insightText = ""; 
  if (Array.isArray(client["터치인사이트"])) { insightText = client["터치인사이트"].join(" "); } 
  else if (client["터치인사이트"]) { insightText = String(client["터치인사이트"]); } 
  const note = (insightText + " " + (client["특이사항"] || "")).toLowerCase();
  
  if (window.currentInsightQuick) {
      if (!note.includes(window.currentInsightQuick.toLowerCase())) return false;
  }
  
  const tHealth = document.getElementById("themeHealth");
  const tLife = document.getElementById("themeLife");
  const tAsset = document.getElementById("themeAsset");
  
  if (tHealth && tHealth.value && !note.includes(tHealth.value.toLowerCase())) return false;
  if (tLife && tLife.value && !note.includes(tLife.value.toLowerCase())) return false;
  if (tAsset && tAsset.value && !note.includes(tAsset.value.toLowerCase())) return false;
  // -----------------------------
  
  const paymentSelect = document.getElementById("paymentFilter");
if (paymentSelect && paymentSelect.value) {
    const val = paymentSelect.value;
    let pm = (client["결제방식"] || client["보험1_결제정보"] || client["보험2_결제정보"] || client["보험3_결제정보"] || "").toLowerCase();
    if (client["가입내역"]) {
        let arr = [];
        if (typeof getGlobalInsuranceList === 'function') arr = getGlobalInsuranceList(client, true);
        if (Array.isArray(arr)) {
            arr.forEach(ins => {
                if (ins.결제방식) pm += " " + ins.결제방식.toLowerCase();
                if (ins.차_결제방식) pm += " " + ins.차_결제방식.toLowerCase();
            });
        }
    }
    if (!pm.includes(val.toLowerCase()) && !pm.includes(val === '카드' ? '카드' : '자동이체')) return false;
}
const insCatSelect = document.getElementById("insCategorySelect");
const insCompSelect = document.getElementById("insCompanySelect");
if (insCatSelect && insCatSelect.value && insCompSelect && insCompSelect.value) {
    const comp = insCompSelect.value.toLowerCase();
    let hasMatch = false;
    let arr = [];
    if (typeof getGlobalInsuranceList === 'function') arr = getGlobalInsuranceList(client, true);
    
    if (Array.isArray(arr) && arr.length > 0) {
        arr.forEach(ins => {
            let cName = String(ins.보험사명 || ins.차_보험사명 || ins.차_보험사 || "").toLowerCase();
            let pName = String(ins.상품명 || ins.차_상품명 || "").toLowerCase();
            if (cName === comp || cName.includes(comp) || pName.includes(comp)) hasMatch = true;
        });
    } else {
        if (String(client["가입내역"]||"").toLowerCase().includes(comp)) hasMatch = true;
    }
    
    let basicComp = String(client["보험사명"] || client["보험1_보험사"] || client["보험2_보험사"] || client["보험3_보험사"] || "").toLowerCase();
    if (basicComp === comp || basicComp.includes(comp)) hasMatch = true;
    
    if (!hasMatch) return false;
}
const corpInsTypeSelect = document.getElementById("corpInsTypeSelect");
if (corpInsTypeSelect && corpInsTypeSelect.value) {
    const typeVal = corpInsTypeSelect.value;
    const ins1 = (client["보험1_종류"] || "").toLowerCase();
    const ins2 = (client["보험2_종류"] || "").toLowerCase();
    const ins3 = (client["보험3_종류"] || "").toLowerCase();
    if (!ins1.includes(typeVal.toLowerCase()) && !ins2.includes(typeVal.toLowerCase()) && !ins3.includes(typeVal.toLowerCase())) return false;
}
if (activeFilters.quick) {
const now = new Date();
const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
if (activeFilters.quick === "interest") {
if (client["상태"] !== "관심" && client["고객상태"] !== "관심") return false;
}
else if (activeFilters.quick === "contract") {
if (client["상태"] !== "체결" && client["고객상태"] !== "체결") return false;
}
else if (activeFilters.quick === "birth") {
      const todayD = new Date();
      const currentMD = String(todayD.getMonth() + 1).padStart(2, "0") + String(todayD.getDate()).padStart(2, "0");
      let b = String(client["생일"] || "").replace(/\D/g, '');
      let bMD = "";
      if (b.length >= 8) bMD = b.substring(4, 8);
      else if (b.length >= 6) bMD = b.substring(2, 6);
      else if (b.length >= 4) bMD = b.substring(0, 4);
      if (bMD !== currentMD) return false;
  }
else if (activeFilters.quick === "sang") {
      const todayD = new Date();
      const currentMD = String(todayD.getMonth() + 1).padStart(2, "0") + String(todayD.getDate()).padStart(2, "0");
      let s = String(client["상령일"] || "").replace(/\D/g, '');
      let sMD = "";
      if (s.length >= 8) sMD = s.substring(4, 8);
      else if (s.length >= 6) sMD = s.substring(2, 6);
      else if (s.length >= 4) sMD = s.substring(0, 4);
      if (sMD !== currentMD) return false;
}
else if (activeFilters.quick === "card") {
if (client["결제방식"] !== "카드") return false;
}
else if (activeFilters.quick === 'transfer') {
  if (client['\uACB0\uC81C\uBC29\uC2DD'] !== '\uC790\uB3D9\uC774\uCCB4') return false;
  }
  else if (activeFilters.quick === 'expiry') {
      let isExpiring = false;
      try {
          let gArr = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(client, true) : [];
          gArr.forEach(i => {
              let ed = i['갱신일자'] || i['만기일자'] || i['갱신일'] || i['만기일'] || '';
              if(ed) {
                  let dStr = String(ed).replace(/\D/g, '');
                  if (dStr.length >= 6) {
                      let y = parseInt(dStr.substring(0,4));
                      let m = dStr.substring(4,6);
                      let cy = new Date().getFullYear();
                      const currentMonthStr = String(new Date().getMonth() + 1).padStart(2, '0');
                      if (y === cy && m === currentMonthStr) isExpiring = true;
                  }
              }
          });
      } catch(e) {}
      if (!isExpiring) return false;
  }
}
if (activeFilters.month) {
if (!client["체결일"] || !client["체결일"].startsWith(activeFilters.month)) return false;
}
return true;
});

// 카드결제 및 자동이체 대상자 선택 시 결제일(일별) 기준으로 오름차순 정렬, 그 외 기본 정렬은 고객번호 오름차순 (1, 1-1, 1-2, 3...)
if (activeFilters.quick === "card" || activeFilters.quick === "transfer") {
filtered.sort((a, b) => {
const getDayNum = (val) => {
if (!val) return 999;
const match = String(val).match(/\d+/);
return match ? parseInt(match[0], 10) : 999;
};
const dayA = getDayNum(a["결제일"]);
const dayB = getDayNum(b["결제일"]);
if (dayA === dayB) {
return String(a["고객명"]).localeCompare(String(b["고객명"]));
}
return dayA - dayB;
});
} else {
filtered.sort((a, b) => {
const parseIdParts = (idStr) => {
if (!idStr) return [999999, 0];
const parts = String(idStr).split('-');
const p1 = parseInt(parts[0], 10);
const p2 = parts[1] ? parseInt(parts[1], 10) : 0;
return [isNaN(p1) ? 999999 : p1, isNaN(p2) ? 0 : p2];
};
const [a1, a2] = parseIdParts(a["고객번호"]);
const [b1, b2] = parseIdParts(b["고객번호"]);
if (a1 !== b1) {
return a1 - b1;
}
return a2 - b2;
});
}

const mc = document.getElementById("memberCount");
if (mc) mc.innerText = filtered.length;
if (filtered.length === 0) {
body.innerHTML = `<tr><td colspan="12" style="text-align:center; padding: 40px 0; color:var(--text-muted);">검색 조건에 맞는 고객이 없습니다. ‍</td></tr>`;
return;
}
const isCorpMode = false;
if (isCorpMode) {
filtered.forEach((client, index) => {
console.log(Object.keys(client));
const custNameVal = client["고객명"] || client["대표자명"] || "";
const safeName = custNameVal.replace(/'/g, "\\'");
const custPhoneVal = formatPhone(client["폰번호"] || client["대표자폰번호"] || client["대표자핸드폰"] || client["전화번호"] || "");
const safePhone = custPhoneVal.replace(/'/g, "\\'");
const safeAddr = (client["주소"] || client["대표주소"] || "").replace(/'/g, "\\'");
const safeJob = (client["직업"] || client["업태"] || "").replace(/'/g, "\\'");

const rowId = client["사업자번호"] || client["고객번호"] || "unknown"; const isFamily = false;
const rowClass = isFamily ? "main-row family-member-row" : "main-row";
const mainRow = document.createElement("tr");
mainRow.className = rowClass;
mainRow.id = `row-${rowId}`;
mainRow.onclick = (e) => {
if (e.target.tagName === "BUTTON" || e.target.closest("button") || e.target.tagName === "A") return;
// toggleAcc(rowId, 'info1');
};

const statusVal = client["상태"] || "-";
const statusStyle = statusVal.includes('관심') ? 'background: #ffe4e6; color: #e11d48; border-color: #fecdd3;' : '';

// Determine tags
let tagsHtml = "";
let insightsArray = [];
if (Array.isArray(client["터치인사이트"])) {
insightsArray = client["터치인사이트"];
} else if (typeof client["터치인사이트"] === "string") {
const rawInsight = client["터치인사이트"].trim();
if (rawInsight !== "") {
if (rawInsight.startsWith("[") && rawInsight.endsWith("]")) {
try {
insightsArray = JSON.parse(rawInsight);
} catch (e) {
insightsArray = rawInsight.split(",").map(t => t.trim()).filter(Boolean);
}
} else {
insightsArray = rawInsight.split(",").map(t => t.trim()).filter(Boolean);
}
}
}

    if (Array.isArray(insightsArray) && insightsArray.length > 0) {
        tagsHtml = insightsArray.map(tag => {
            let cleanTag = tag;
            if (tag.startsWith("ins:")) cleanTag = tag.substring(4);
            
            if (tag.startsWith("health:")) {
                cleanTag = tag.substring(7);
                return `<span class="insight-tag" style="background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; font-size:10px; padding:2px 6px; border-radius:4px; margin-right:4px; display:inline-block; margin-bottom:2px;">#${cleanTag}</span>`;
            } else {
                return `<span class="insight-tag" style="background:#e0f2fe; color:#0284c7; border:1px solid #bae6fd; font-size:10px; padding:2px 6px; border-radius:4px; margin-right:4px; display:inline-block; margin-bottom:2px;">#${cleanTag}</span>`;
            }
        }).join("");
    }

let insList = getGlobalInsuranceList(client, true);

// insSummary and insListHtml
let insSummary = "";
let insListHtml = "";
if (insList.length > 0) {
insSummary = insList.map(ins => `<div><strong>${ins.보험종류 === '자동차보험' ? '(자동차)' : (ins.보험사명 || ins.company || "-")}</strong> <span style="font-size:11.5px; color:var(--text-muted);">${ins.보험종류 === '자동차보험' ? (ins.보험사명 || "") + " " + (ins.차종 || "") : (ins.상품명 || ins.product || "-")}</span></div>`).join("");
insListHtml = insList.map(ins => {
let comp = ins.보험종류 === '자동차보험' ? (ins.보험사명 || "") + " " + (ins.차종 || "") : (ins.보험사명 || ins.company || "");
let prod = ins.보험종류 === '자동차보험' ? (ins.차량번호 || "") : (ins.상품명 || ins.product || "");
const combined = (comp + " " + prod).trim();
return combined ? `
                 <div style="font-size:12px; color:#4e5968; margin-top:4px; display:flex; align-items:center; justify-content:center; gap:6px; text-align:center; line-height:1.4;">
                     <span style="font-size:10px; color:#cbd5e0; margin-top:2px;">■</span>
                     <span style="white-space:normal; word-break:keep-all;">${combined}</span>
                 </div>
             ` : "";
}).join("");
} else {
insSummary = `<span style="color:var(--text-muted); font-size:12px;">가입내역 없음</span>`;
insListHtml = `<span style="color:var(--text-muted); font-size:12px;">가입내역 없음</span>`;
}

    const insSummaryHtml = insList.length > 0 ? insList.map(ins => {
        let price = ins.보험료 || ins.premium || "-";
        if (price !== "-" && !isNaN(price.replace(/,/g, ''))) {
            price = Number(price.replace(/,/g, '')).toLocaleString() + "원";
        }
        const extraInfo = [];
        if (ins.납입기간 || ins.payPeriod) extraInfo.push(ins.납입기간 || ins.payPeriod);
        if (ins.만기일 || ins.expireDate) extraInfo.push(ins.만기일 || ins.expireDate);
        if (ins.갱신일 || ins.renewalDate) extraInfo.push(ins.갱신일 || ins.renewalDate);
        if (ins.보험종류 === '자동차보험' && ins.차량번호) extraInfo.push(ins.차량번호);
        const extraStr = extraInfo.length > 0 ? `<div style="font-size:10.5px; color:#64748b; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;" title="${extraInfo.join(' / ')}">${extraInfo.join(' / ')}</div>` : '';
        const cov = ins.보험종류 === '자동차보험' ? ((ins.운전자특약 || "미지정") + " / " + (ins.연령특약 || "연령미지정")) : (ins.가입내역 || ins.type || "");
        const covStr = cov ? `<div style="font-size:11.5px; color:#475569; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:2px; max-width:150px;" title="${cov}">${cov}</div>` : '';
        
        let insuredBadge = "";
        const profileOwner = String(client["이름"] || client["대표자명"] || client["고객명"] || "").trim();
        const insContractor = String(ins.계약자 || ins.차_계약자 || "").trim();
        const insInsured = String(ins.피보험자 || ins.차_피보험자 || ins.insuredName || ins.insured || "").trim();
        
        if (insContractor && insContractor !== profileOwner && insContractor !== "무명고객") {
            insuredBadge = `<span style="color:#16a34a; font-size:11px; font-weight:bold;">계약자: ${insContractor}</span>`;
        } else if (insInsured && insInsured !== profileOwner && insInsured !== "무명고객") {
            insuredBadge = `<span style="color:#16a34a; font-size:11px; font-weight:bold;">피보험자: ${insInsured}</span>`;
        }
        
        return `<div style="padding:6px 0; height:75px; box-sizing:border-box; border-bottom:1px dashed #e2e8f0; color:#0f172a; font-weight:600; display:flex; flex-direction:column; justify-content:center; align-items:flex-end; width:100%;">
            ${covStr}
            <div style="display:flex; justify-content:${insuredBadge ? 'space-between' : 'flex-end'}; width:100%; align-items:center;">
                ${insuredBadge}
                <div>${price}</div>
            </div>
            ${extraStr}
        </div>`;
    }).join("") : "-";

    
const isCorp = false;
    const rs = insList.length > 0 ? insList.length : 1;
    let ins0 = insList.length > 0 ? insList[0] : null;
    
    const getPersonalGeneralTds = (ins, client, profileOwner) => {
        let c = ins.보험사명 || ins.company || "-";
        let p = ins.상품명 || ins.product || "-";
        let pay = (ins.결제방식 || ins.paymentMethod || ins.payment || "-").replace("자동이체", "자동<br>이체").replace("신용카드", "신용<br>카드").replace("계좌이체", "계좌<br>이체").replace("카드결제", "카드<br>결제");
        let price = ins.보험료 || ins.premium || "-";
        if (price !== "-" && !isNaN(price.replace(/,/g, ''))) price = Number(price.replace(/,/g, '')).toLocaleString() + "원";
        const extraInfo = [];
        if (ins.납입기간 || ins.payPeriod) extraInfo.push(ins.납입기간 || ins.payPeriod);
        if (ins.만기일 || ins.expireDate) extraInfo.push(ins.만기일 || ins.expireDate);
        if (ins.갱신일 || ins.renewalDate) extraInfo.push(ins.갱신일 || ins.renewalDate);
        const extraStr = extraInfo.length > 0 ? `<div style="font-size:10.5px; color:#64748b; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;" title="${extraInfo.join(' / ')}">${extraInfo.join(' / ')}</div>` : '';
        const cov = ins.가입내역 || ins.type || "";
        const covStr = cov ? `<div style="font-size:11.5px; color:#475569; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:2px; max-width:150px;" title="${cov}">${cov}</div>` : '';
        let insuredBadge = "";
        const insContractor = String(ins.계약자 || "").trim();
        const insInsured = String(ins.피보험자 || ins.insuredName || ins.insured || "").trim();
        if (insContractor && insContractor !== profileOwner && insContractor !== "무명고객") insuredBadge = `<span style="color:#16a34a; font-size:11px; font-weight:bold;">계약자: ${insContractor}</span>`;
        else if (insInsured && insInsured !== profileOwner && insInsured !== "무명고객") insuredBadge = `<span style="color:#16a34a; font-size:11px; font-weight:bold;">피보험자: ${insInsured}</span>`;
        const summaryHtml = `
            <div style="padding:6px 0; box-sizing:border-box; color:#0f172a; font-weight:600; display:flex; flex-direction:column; justify-content:center; align-items:flex-end; width:100%;">
                ${covStr}
                <div style="display:flex; justify-content:${insuredBadge ? 'space-between' : 'flex-end'}; width:100%; align-items:center;">
                    ${insuredBadge}
                    <div>${price}</div>
                </div>
                ${extraStr}
            </div>
        `;
        return `
            <td style="padding: 12px 8px; font-size: 12px; font-weight: 600; color: #475569; text-align: center; border-bottom: 1px solid #f1f5f9; line-height:1.6; background:#fff;">${c}</td>
            <td style="padding: 12px 8px; font-size: 12px; font-weight: 600; color: #475569; text-align: left; border-bottom: 1px solid #f1f5f9; line-height:1.6; max-width: 150px; white-space:normal; word-break:keep-all; background:#fff;">${p}</td>
            <td style="padding: 12px 8px; font-size: 12px; font-weight: 600; color: #475569; text-align: center; border-bottom: 1px solid #f1f5f9; line-height:1.6; background:#fff;">${pay}</td>
            <td style="padding: 12px 8px; text-align: right; border-bottom: 1px solid #f1f5f9; line-height:1.6; background:#fff;">${summaryHtml}</td>
        `;
    };

    const getPersonalCarTds = (ins, client, profileOwner) => {
        let c = `(자동차)<br>${ins.보험사명 || ins.차_보험사명 || "-"}${ins.다이렉트여부 === '다이렉트' ? '<br>다이렉트' : ''}`;
        let p = `차종: ` + (ins.차종 || "-") + (ins.차량번호 ? ` (${ins.차량번호})` : "");
        let pay = (ins.결제방식 || ins.paymentMethod || ins.payment || "-").replace("자동이체", "자동<br>이체").replace("신용카드", "신용<br>카드").replace("계좌이체", "계좌<br>이체").replace("카드결제", "카드<br>결제");
        let price = ins.보험료 || ins.premium || "-";
        if (price !== "-" && !isNaN(price.replace(/,/g, ''))) price = Number(price.replace(/,/g, '')).toLocaleString() + "원";
        const extraInfo = [];
        if (ins.납입기간 || ins.payPeriod) extraInfo.push(ins.납입기간 || ins.payPeriod);
        if (ins.만기일 || ins.expireDate) extraInfo.push(ins.만기일 || ins.expireDate);
        if (ins.갱신일 || ins.renewalDate) extraInfo.push(ins.갱신일 || ins.renewalDate);
        if (ins.차량번호) extraInfo.push(ins.차량번호);
        const extraStr = extraInfo.length > 0 ? `<div style="font-size:10.5px; color:#64748b; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;" title="${extraInfo.join(' / ')}">${extraInfo.join(' / ')}</div>` : '';
        const cov = (ins.운전자특약 || "미지정") + " / " + (ins.연령특약 || "연령미지정");
        const covStr = cov ? `<div style="font-size:11.5px; color:#475569; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:2px; max-width:150px;" title="${cov}">${cov}</div>` : '';
        let insuredBadge = "";
        const insContractor = String(ins.차_계약자 || ins.계약자 || "").trim();
        const insInsured = String(ins.차_피보험자 || ins.피보험자 || "").trim();
        if (insContractor && insContractor !== profileOwner && insContractor !== "무명고객") insuredBadge = `<span style="color:#16a34a; font-size:11px; font-weight:bold;">계약자: ${insContractor}</span>`;
        else if (insInsured && insInsured !== profileOwner && insInsured !== "무명고객") insuredBadge = `<span style="color:#16a34a; font-size:11px; font-weight:bold;">피보험자: ${insInsured}</span>`;
        const summaryHtml = `
            <div style="padding:6px 0; box-sizing:border-box; color:#0f172a; font-weight:600; display:flex; flex-direction:column; justify-content:center; align-items:flex-end; width:100%;">
                ${covStr}
                <div style="display:flex; justify-content:${insuredBadge ? 'space-between' : 'flex-end'}; width:100%; align-items:center;">
                    ${insuredBadge}
                    <div>${price}</div>
                </div>
                ${extraStr}
            </div>
        `;
        return `
            <td style="padding: 12px 8px; font-size: 12px; font-weight: 600; color: #475569; text-align: center; border-bottom: 1px solid #f1f5f9; line-height:1.6; background:#fff;">${c}</td>
            <td style="padding: 12px 8px; font-size: 12px; font-weight: 600; color: #475569; text-align: left; border-bottom: 1px solid #f1f5f9; line-height:1.6; max-width: 150px; white-space:normal; word-break:keep-all; background:#fff;">${p}</td>
            <td style="padding: 12px 8px; font-size: 12px; font-weight: 600; color: #475569; text-align: center; border-bottom: 1px solid #f1f5f9; line-height:1.6; background:#fff;">${pay}</td>
            <td style="padding: 12px 8px; text-align: right; border-bottom: 1px solid #f1f5f9; line-height:1.6; background:#fff;">${summaryHtml}</td>
        `;
    };

    const getCorporateGeneralTds = getPersonalGeneralTds; // TODO: Custom Corporate Fields
    const getCorporateCarTds = getPersonalCarTds; // TODO: Custom Corporate Fields

    const getInsTds = (ins) => {
        if (!ins) {
            return `
                <td style="padding: 12px 8px; font-size: 12px; font-weight: 600; color: #475569; text-align: center; border-bottom: 1px solid #f1f5f9; line-height:1.6; background:#fff;">-</td>
                <td style="padding: 12px 8px; font-size: 12px; font-weight: 600; color: #475569; text-align: left; border-bottom: 1px solid #f1f5f9; line-height:1.6; max-width: 150px; background:#fff;">-</td>
                <td style="padding: 12px 8px; font-size: 12px; font-weight: 600; color: #475569; text-align: center; border-bottom: 1px solid #f1f5f9; line-height:1.6; background:#fff;">-</td>
                <td style="padding: 12px 8px; text-align: right; border-bottom: 1px solid #f1f5f9; line-height:1.6; background:#fff;">-</td>
            `;
        }
        const profileOwner = String(client["이름"] || client["대표자명"] || client["고객명"] || "").trim();
        const isCorp = false;
        
        if (isCorp) {
            if (ins.보험종류 === '자동차보험') return getCorporateCarTds(ins, client, profileOwner);
            else return getCorporateGeneralTds(ins, client, profileOwner);
        } else {
            if (ins.보험종류 === '자동차보험') return getPersonalCarTds(ins, client, profileOwner);
            else return getPersonalGeneralTds(ins, client, profileOwner);
        }
    };

    mainRow.innerHTML = `
        <td rowspan="${rs}" style="padding: 12px 8px; border-bottom: 1px solid #f1f5f9; background:#fff;">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;">
                <span style="font-size: 11px; font-weight: 600; color: #94a3b8;">${rowId}</span>
                <button class="detail-btn" style="padding: 2px 6px; font-size: 10px; min-width: 36px; border-color:#3b82f6; color:#3b82f6; margin-top: 0; transform: scale(0.9);" onclick="renderProfileModal('${rowId}'); event.stopPropagation();">프로필</button><button class="edit-btn" style="padding: 2px 6px; font-size: 10px; min-width: 36px; border-color:#10b981; color:#10b981; margin-top: 0; transform: scale(0.9); margin-left: 2px;" onclick="openEditMode('${rowId}', 'edit'); event.stopPropagation();">수정</button>
            </div>
        </td>
        <td rowspan="${rs}" style="padding: 12px 8px; font-size: 13px; font-weight: 700; color: #1e293b; text-align: center; border-bottom: 1px solid #f1f5f9; background:#fff;">
            ${custNameVal || "-"}
        </td>
        <td rowspan="${rs}" style="padding: 12px 8px; font-size: 12px; font-weight: 600; color: #475569; text-align: center; border-bottom: 1px solid #f1f5f9; background:#fff;">${client["생일"] || client["대표자생일"] || (client["대표자 주민번호"] ? client["대표자 주민번호"].substring(0, 6) : "-")}</td>
        <td rowspan="${rs}" style="padding: 12px 8px; font-size: 12px; font-weight: 600; color: #475569; text-align: center; border-bottom: 1px solid #f1f5f9; word-break: keep-all; line-height: 1.4; background:#fff;">${client["상령일"] || client["상령월"] || client["상호명(법인명)"] || client["법인명"] || client["사업자명"] || "-"}</td>
        <td rowspan="${rs}" style="padding: 12px 8px; text-align: center; border-bottom: 1px solid #f1f5f9; background:#fff;">
            ${statusVal !== "-" ? `<span style="font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 12px; ${statusStyle ? statusStyle : 'background:#f8fafc; color:#64748b; border: 1px solid #e2e8f0;'}">${statusVal}</span>` : "-"}
        </td>
        <td rowspan="${rs}" style="padding: 12px 8px; font-size: 12px; font-weight: 600; color: #475569; text-align: center; border-bottom: 1px solid #f1f5f9; background:#fff;">${custPhoneVal || "-"}</td>
        <td rowspan="${rs}" style="padding: 12px 8px; text-align: left; border-bottom: 1px solid #f1f5f9; background:#fff;">
            <div style="display:flex; flex-wrap:wrap; gap:4px;">${tagsHtml}</div>
        </td>
        ${getInsTds(ins0)}
        <td rowspan="${rs}" style="padding: 12px 8px; text-align: center; border-bottom: 1px solid #f1f5f9; background:#fff;">
            <div class="btn-group-horizontal">
                <button class="detail-btn detail-all-btn" onclick="toggleAcc('${rowId}','all'); event.stopPropagation();">전체보기 </button>
                <button class="detail-btn detail-info1-btn" onclick="toggleAcc('${rowId}','info1'); event.stopPropagation();">1차정보</button>
                ${isCorp ? '' : `<button class="detail-btn detail-info2-btn" onclick="toggleAcc('${rowId}','info2'); event.stopPropagation();">터치인사이트</button>`}
                <button class="detail-btn detail-ins-btn" onclick="toggleAcc('${rowId}','gaip'); event.stopPropagation();">가입내역 (${insList.length})</button>
                <button class="detail-btn detail-memo-btn" onclick="toggleAcc('${rowId}','teugi'); event.stopPropagation();">상담메모</button>
                <button class="detail-btn detail-file-btn" onclick="openDriveFolder('${rowId}', '${safeName}'); event.stopPropagation();">서류함 </button>
            </div>
        </td>
    `;
        const subRows = [];
    if (insList.length > 1) {
        for (let i = 1; i < insList.length; i++) {
            let subTr = document.createElement("tr");
            subTr.style.background = "#fff";
            subTr.innerHTML = getInsTds(insList[i]);
            subRows.push(subTr);
        }
    }

// Render insDetailCards inside accordion
let insC = "";
insList.forEach((ins, idx) => {
let payMethod = ins.결제방식 || ins.차_결제방식 || ins.paymentMethod || ins.payment || "-";
let payInfo = ins.결제정보 || ins.차_결제정보 || ins.payInfo || "";
if (!payInfo && payMethod) {
if (payMethod === "카드" && (ins.카드번호 || ins.차_카드번호)) {
payInfo = `${ins.카드번호 || ins.차_카드번호 || ""} / ${ins.유효기간 || ins.차_유효기간 || ""}`;
} else if ((payMethod === "자동이체" || payMethod === "가상계좌") && (ins.은행명 || ins.차_은행명)) {
payInfo = `${ins.은행명 || ins.차_은행명 || ""} / ${ins.계좌번호 || ins.차_계좌번호 || ""}`;
}
}

// Render alril details
let alrilHtml = "";
let alrilRows = ins.알릴의무사항 || ins.alril || [];
if (typeof alrilRows === "string") {
alrilHtml = (alrilRows || "-").split('\n').filter(line => line.trim()).map(line => `<div style="font-size:12px; margin-bottom:4px;">${line}</div>`).join('');
} else if (Array.isArray(alrilRows) && alrilRows.length > 0) {
alrilHtml = `
                 <div class="alril-table-wrapper" style="overflow-x: auto; margin-top: 10px;">
                     <table class="alril-table" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
                         <thead>
                             <tr>
                                 <th>병명</th>
                                 <th style="width: 150px;">치료기간</th>
                                 <th>치료병원</th>
                                 <th>치료내용</th>
                                 <th style="width: 50px; text-align: center;">재발</th>
                                 <th style="width: 50px; text-align: center;">완치</th>
                             </tr>
                         </thead>
                         <tbody>
                             ${alrilRows.map(row => {
                                 let checks = [];
                                 if (row.treatment) checks.push("치료");
                                 if (row.medication) checks.push("투약");
                                 if (row.admission) checks.push("입원");
                                 if (row.surgery) checks.push("수술");
                                 if (row.biopsy) checks.push("정밀");
                                 return `
                                     <tr>
                                         <td>${row.disease || "-"}</td>
                                         <td>${row.startDate || "-"} ~ ${row.endDate || "-"}</td>
                                         <td>${row.hospital || "-"}</td>
                                         <td>${checks.join(", ") || "-"}</td>
                                         <td style="text-align: center;">${row.relapse || "-"}</td>
                                         <td style="text-align: center;">${row.cured || "-"}</td>
                                     </tr>
                                 `;
                             }).join("")}
                         </tbody>
                     </table>
                 </div>
             `;
} else {
alrilHtml = `<span style="color:var(--text-muted); font-size:12px;">알릴의무사항 기록이 없습니다.</span>`;
}

insC += `
             <div class="ins-card">
                 <div class="ins-header">
                     <span> 보험 #${idx + 1}: ${ins.보험종류 === '자동차보험' ? '(자동차) ' + (ins.차_보험사명 || ins.보험사명 || "-") + ' / ' + (ins.차종 || "-") : (ins.보험사명 || ins.company || "-") + ' / ' + (ins.상품명 || ins.product || "-")}</span>
                 </div>
                 <div class="detail-grid">
                     <div class="detail-item"><strong>${ins.보험종류 === '자동차보험' ? '운전자/연령 특약' : '특약/용도'}</strong><span>${ins.보험종류 === '자동차보험' ? (ins.운전자특약 || "-") + ' / ' + (ins.연령특약 || "-") : (ins.가입내역 || ins.type || "-")} ${ins.이륜차용도 ? '<br><span style="color:#4f46e5;font-size:12px;font-weight:bold">(' + ins.이륜차용도 + ')</span>' : ''}</span></div>
                     <div class="detail-item"><strong>고객명(계약자)</strong><span>${ins.계약자 || ins.차_계약자 || client["이름"] || client["대표자명"] || client["고객명"] || "-"}</span></div>
                     <div class="detail-item"><strong>피보험자(생년월일)</strong><span>${ins.보험종류 === '자동차보험' ? (ins.차_피보험자 || "-") : (ins.피보험자 || ins.insuredName || ins.insured || "-")} ${(ins.피보험자생년월일 || ins.차_피보험자생년월일) ? '<br><small>(' + (ins.피보험자생년월일 || ins.차_피보험자생년월일) + ')</small>' : ''}</span></div>
                     <div class="detail-item"><strong>보험료(다이렉트)</strong><span>${ins.보험료 || ins.차_보험료 || ins.premium ? Number(String(ins.보험료 || ins.차_보험료 || ins.premium).replace(/,/g, '')).toLocaleString() + " 원" : "-"} ${ins.다이렉트여부 === '다이렉트' || ins.다이렉트여부 === 'on' || ins.차_다이렉트여부 === '다이렉트' || ins.차_다이렉트여부 === 'on' ? '<br><span style="color:#e11d48;font-size:11px;font-weight:bold">[다이렉트]</span>' : ''}</span></div>
                     <div class="detail-item"><strong>체결일${ins.보험종류 === '자동차보험' ? '(책임개시일)' : ''}</strong><span>${ins.보험종류 === '자동차보험' ? (ins.책임개시일 || ins.체결일 || "-") : (ins.체결일 || ins.date || "-")}</span></div>
                     <div class="detail-item"><strong>납기/만기/갱신일</strong><span>${ins.납입기간 || ins.payPeriod || "-"} / ${ins.만기일 || ins.expireDate || "-"} / ${ins.갱신일 || ins.renewalDate || "-"} ${ins.보험종류 === '자동차보험' && ins.차량번호 ? '<br><strong>차량번호:</strong> ' + ins.차량번호 : ""}</span></div>
                     <div class="detail-item"><strong>결제정보</strong><span>${payMethod}${payInfo && payInfo !== "-" ? "<br><span style='font-size:11px;color:#64748b;font-weight:normal;'>" + payInfo + "</span>" : ""}</span></div>
                     <div class="detail-item" style="grid-column: 1 / -1; display:${ins.보험종류 === '자동차보험' ? 'none' : 'block'};">
                         <strong> 알릴의무사항 상세</strong>
                         <div class="text-content-box" style="background:transparent; border:none; padding:0; margin-top:8px;">${alrilHtml}</div>
                     </div>
                 </div>
             </div>
         `;
});

const accordionRow = document.createElement("tr");
accordionRow.className = "accordion-row";
accordionRow.id = `detail-row-${rowId}`;
accordionRow.className = 'accordion-row';
accordionRow.style.display = "none";



let info1Html = "";
let info2Html = "";

if (isCorp) {
info1Html = `
             <div class="detail-grid">
                 <div class="detail-item"><strong>사업자번호 / 설립일</strong><span>${client["사업자번호"] || "-"} / ${client["설립일"] || "-"}</span></div>
                 <div class="detail-item"><strong>법인번호 / 법인명</strong><span>${client["법인번호"] || "-"} / ${client["법인명"] || "-"}</span></div>
                 <div class="detail-item"><strong>대표업종 / 상태</strong><span>${client["대표업종"] || client["대표업태"] || "-"} / ${client["상태"] || "-"}</span></div>
                 <div class="detail-item"><strong>대표자명 / 주민번호</strong><span>${client["대표자명"] || "-"} / ${formatJumin(client["대표자주민번호"]) || "-"}</span></div>
                 <div class="detail-item" style="grid-column: 1 / -1;"><strong>사업장주소(대표주소)</strong><span>${client["사업장주소"] || client["대표주소"] || client["주소"] || "-"}</span></div>
                 <div class="detail-item"><strong>폰번호 / 회사전화번호</strong><span>${formatPhone(client["대표자폰번호"] || client["대표자핸드폰"] || client["대표핸드폰"]) || "-"} / ${formatPhone(client["사업자전화번호"] || client["사업장전화번호"] || client["회사전화번호"]) || "-"}</span></div>
                 <div class="detail-item" style="grid-column: 1 / -1;"><strong>터치인사이트</strong><span><div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:2px;">${tagsHtml || "-"}</div></span></div>
             </div>
         `;
info2Html = ``;
} else {
info1Html = `
             <div class="detail-grid">
                 <div class="detail-item"><strong>폰번호 / 상태</strong><span>${formatPhone(client["폰번호"] || "")} / ${client["상태"] || "-"}</span></div>
                 <div class="detail-item"><strong>나이/성별/직업(상세)</strong><span>${client["나이"] ? client["나이"] + "세" : "-"} / ${client["성별"] || "-"} / ${client["직업"] || client["업태"] || "-"} (${client["상세업무"] || "-"})</span></div>
                 <div class="detail-item"><strong>주민번호</strong><span>${formatJumin(client["주민번호"] || client["사업자번호"]) || "-"} <span class="copy-badge" style="background: #f1f5f9; color: #4f46e5; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer; margin-left: 6px; border: 1px solid #c7d2fe; display: inline-block;" onclick="copyJumin('${client["주민번호"] || client["사업자번호"]}', false)" title="주민번호 전체 복사">복사</span> <span class="copy-badge" style="background: #f8fafc; color: #64748b; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer; margin-left: 3px; border: 1px solid #cbd5e1; display: inline-block;" onclick="copyJumin('${client["주민번호"] || client["사업자번호"]}', true)" title="뒷자리 마스킹(*) 복사">마스킹(*)</span></span></div>
                 <div class="detail-item"><strong>생일 / 상령일</strong><span>${client["생일"] || "-"} / ${client["상령일"] || "-"}</span></div>
                 <div class="detail-item" style="grid-column: 1 / -1;"><strong>상세 주소</strong><span>${client["주소"] || client["대표주소"] || "-"}</span></div>
             </div>
         `;
info2Html = `
             <div class="detail-grid">
                 <div class="detail-item"><strong>가족사항</strong><span>${client["가족사항"] || "-"}</span></div>
                 <div class="detail-item"><strong>반려동물(종/이름/코드)</strong><span>${client["반려동물"] || "-"} / ${client["동물이름"] || "-"} / ${client["코드"] || "-"}</span></div>
                 <div class="detail-item"><strong>운전여부 / 차량용도</strong><span>${client["운전여부"] || "-"} / ${client["차량용도"] || client["차종류"] || "-"}</span></div>
                 <div class="detail-item" style="grid-column: 1 / -1;"><strong>터치인사이트</strong><span><div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:2px;">${tagsHtml || "-"}</div></span></div>
             </div>
         `;
}

accordionRow.innerHTML = `
         <td colspan="20">
             <div class="accordion-content">
                 <!-- 고객 전체 정보 Pane -->
                 <div id="cont-${rowId}-all" class="acc-pane" style="display:none;">
                     <div class="ins-card-header" style="margin-bottom:15px; padding-bottom:10px; display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid var(--border);">
                         <h5>고객 전체 정보</h5>
                         <div style="display:flex; gap:10px;">
                             <button class="detail-btn" style="background:#10b981; color:white; border:none; font-weight:800; padding:6px 12px; margin:0;" onclick="printCustomerReport('${rowId}')">PDF 다운로드</button>
                         </div>
                     </div>
                     
                     <div style="display: flex; flex-direction: column; gap: 20px;">
                         <div><h6 style="margin: 0 0 8px 0; color: var(--primary); font-size: 14px; font-weight: 800;"> 1차 기본 정보</h6>${info1Html}</div>${!isCorp ? `<div><h6 style="margin: 0 0 8px 0; color: var(--primary); font-size: 14px; font-weight: 800;"> 터치인사이트</h6>${info2Html}</div>` : ""}
                         
                         <div>
                             <h6 style="margin: 0 0 8px 0; color: var(--primary); font-size: 14px; font-weight: 800;"> 보험 가입내역</h6>
                             ${insC ? insC : `<span style="color:var(--text-muted); font-size:12px;">가입내역이 비어 있습니다.</span>`}
                         </div>
                         
                         <div>
                             <h6 style="margin: 0 0 8px 0; color: var(--primary); font-size: 14px; font-weight: 800;"> 상담 메모 요약</h6>
                             <div class="text-content-box" style="font-size: 14px; line-height: 1.6; white-space: pre-wrap; padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #dde2e8;">${client["특이사항"] ? client["특이사항"] : "<span style='color:var(--text-muted);'>상담 기록이 비어 있습니다.</span>"}</div>
                         </div>
                     </div>
                 </div>
                 
                 <!-- 고객 1차 정보 Pane -->
                 <div id="cont-${rowId}-info1" class="acc-pane" style="display:none;">
                     <div class="ins-card-header" style="margin-bottom:10px; padding-bottom:10px; display:flex; justify-content:flex-start; align-items:center; gap:10px;">
                         <h5>고객 1차 정보</h5>
                         <div style="display:flex; gap:6px;">
                             <button class="detail-btn" style="background:#f1f5f9; color:var(--primary); border:1px solid #dde2e8; font-weight:800; padding:4px 10px; margin:0;" onclick="copyCustomerInfo(this, '${safeName}', '${client["주민번호"] || client["사업자번호"] || "-"}', '${safePhone}', '${safeAddr}', '${safeJob}', false)">전달용 전체 복사 </button>
                             <button class="detail-btn" style="background:#f8fafc; color:#64748b; border:1px solid #cbd5e1; font-weight:800; padding:4px 10px; margin:0;" onclick="copyCustomerInfo(this, '${safeName}', '${client["주민번호"] || client["사업자번호"] || "-"}', '${safePhone}', '${safeAddr}', '${safeJob}', true)">전달용 마스킹(*) </button>
                         </div>
                     </div>
                     ${info1Html}
                 </div>
                 
                 <!-- 고객 2차 정보 Pane -->
                 ${isCorp ? "" : `
                 <div id="cont-${rowId}-info2" class="acc-pane" style="display:none;">
                     <div class="ins-card-header" style="margin-bottom:10px; padding-bottom:10px;">
                         <h5>터치인사이트</h5>
                     </div>
                     ${info2Html}
                 </div>
                 `}
                 
                 <!-- 가입내역 Pane -->
                 <div id="cont-${rowId}-gaip" class="acc-pane" style="display:none;">
                     <div class="ins-card-header" style="margin-bottom:10px; padding-bottom:10px;">
                         <h5>보험 가입내역</h5>
                     </div>
                     ${insC ? insC : `<span style="color:var(--text-muted); font-size:12px;">가입내역이 비어 있습니다.</span>`}
                 </div>
                 
                 <!-- 상담메모 Pane -->
                 <div id="cont-${rowId}-teugi" class="acc-pane" style="display:none;">
                     <div class="ins-card-header" style="margin-bottom:10px; padding-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                         <h5>상담 메모 요약</h5>
                         <button type="button" class="del-ins-btn" style="background:#fee2e2; color:#e11d48; border:1px solid #fecdd3; padding:6px 12px; border-radius:6px; font-weight:800; cursor:pointer;" onclick="deleteCustomerMemo('${rowId}')">메모 삭제</button>
                     </div>
                     <div class="text-content-box" style="font-size: 14px; line-height: 1.6; white-space: pre-wrap; padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #dde2e8;">${client["특이사항"] ? client["특이사항"] : "<span style='color:var(--text-muted);'>상담 기록이 비어 있습니다.</span>"}</div>
                 </div>
             </div>
         </td>
     `;
body.appendChild(mainRow);
    if (typeof subRows !== 'undefined') subRows.forEach(r => body.appendChild(r));
    body.appendChild(accordionRow);
});

} else {
const displayedRoots = new Set();
filtered.forEach((filteredClient, index) => {
    const idStr = String(filteredClient["고객번호"] || filteredClient["사업자번호"] || "").trim();
    if (!idStr) return;
    const rootId = idStr.split('-')[0];
    if (displayedRoots.has(rootId)) return;
        displayedRoots.add(rootId);
    
        const familyBarColors = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#14b8a6", "#64748b"];
    const familyBarColor = familyBarColors[(displayedRoots.size - 1) % familyBarColors.length];
    const familyBgColor = "#fff"; // Revert background to white
    
    const household = globalCustomerData.filter(c => {
        const cid = String(c["고객번호"] || c["사업자번호"] || "").trim();
        return cid === rootId || cid.startsWith(rootId + '-');
    });
    
    household.sort((a,b) => {
        const aId = String(a["고객번호"]||a["사업자번호"]||"").trim();
        const bId = String(b["고객번호"]||b["사업자번호"]||"").trim();
        if (aId === rootId) return -1;
        if (bId === rootId) return 1;
        return aId.localeCompare(bId);
    });
    
    const rootClient = household[0];
    const rowId = rootClient["고객번호"] || rootClient["사업자번호"];
    const isCorp = window.targetSheetName === 'corporatecrm' || !!rootClient["법인명"] || !!rootClient["사업자번호"];
    
    let totalFamilyRows = 0;
        const membersData = [];
    
    household.forEach(member => {
        let insList = getGlobalInsuranceList(member, true);
        membersData.push({
            member: member,
            mId: String(member["고객번호"] || member["사업자번호"] || "-").trim(),
            mName: String(member["이름"] || member["고객명"] || member["대표자명"] || "-").trim(),
            isRoot: String(member["고객번호"] || member["사업자번호"] || "").indexOf('-') === -1,
            insList: insList
        });
    });
    
    // Collect all insurances and group by insuredName
    let allInsurances = [];
      const rootNameGlobal = membersData.find(m => m.isRoot)?.mName || "본인";
      membersData.forEach(mData => {
          mData.insList.forEach(ins => {
              let isAuto = ins.구분 === '자동차';
              let insInsured = String(ins.피보험자 || ins.차_피보험자 || ins.insuredName || ins.insured || "-").trim();
              if (insInsured === "본인" || insInsured === "-" || insInsured === "" || insInsured.includes("본인") || insInsured.includes("미정")) insInsured = mData.mName;
              let insContractor = String(ins.계약자 || ins.차_계약자 || "-").trim();
              if (insContractor === "본인" || insContractor === "-" || insContractor === "" || insContractor.includes("본인") || insContractor.includes("미정")) insContractor = mData.mName;
              allInsurances.push({
                  ins: ins,
                  insuredName: insInsured,
                  contractor: insContractor,
                comp: isAuto ? ((ins.보험사 || ins.차_보험사 || "-") + (ins.다이렉트여부 === '다이렉트' ? ' (다이렉트)' : '')) : (ins.보험사 || ins.company || "-"),
                prod: isAuto ? (`차량: ` + (ins.차량명 || "-") + (ins.차량번호 ? ` (${ins.차량번호})` : "")) : (ins.상품명 || ins.product || "-"),
                price: ins.보험료 || ins.premium || "-",
                isAuto: isAuto
            });
        });
    });
    
    // Deduplicate allInsurances
    const uniqueIns = new Map();
    allInsurances.forEach(item => {
        const key = JSON.stringify(item.ins);
        if (!uniqueIns.has(key)) uniqueIns.set(key, item);
    });
    allInsurances = Array.from(uniqueIns.values());

      /* Removed mergedInsHtml generation here */

    const rootMId = membersData[0].mId;
      const generatedRows = [];
    membersData.forEach((mData, mIndex) => {
        const { member, mId, mName, isRoot } = mData;
        mData.rootMId = rootMId;
        
        let isLastRowOfFamily = (mIndex === membersData.length - 1);
                let rowBorderBottom = isLastRowOfFamily ? "1px solid #cbd5e1 !important" : "1px solid #f8fafc !important";
        let rowBorderTop = "none !important";
        let rowBorderLeft = "none !important";
        
        const birth = member["생일"] || member["대표자생일"] || (member["대표자 주민번호"] ? member["대표자 주민번호"].substring(0, 6) : "-");
        const sang = member["상령일"] || member["상령월"] || member["상호명(법인명)"] || member["법인명"] || member["업체명"] || "-";
        const phone = formatPhone(member["폰번호"] || member["대표자폰번호"] || member["대표자핸드폰"] || member["전화번호"] || "-");
        
        const statusVal = member["상태"] || (isRoot ? "-" : "");
        let statusHtml = "";
        if (statusVal) {
            let bg = "#f1f5f9", text = "#475569", border = "#e2e8f0";
            if (statusVal.includes('체결')) {
                bg = "#fee2e2"; text = "#b91c1c"; border = "#fecaca"; // 체결 (Light Red)
            } else if (statusVal.includes('관심')) {
                bg = "#dcfce7"; text = "#15803d"; border = "#bbf7d0"; // 관심 (Light Green)
            }
            statusHtml = `<span style="font-size:11.5px; font-weight:800; color:${text}; background:${bg}; border:1px solid ${border}; padding:3px 10px; border-radius:6px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">${statusVal}</span>`;
        }
        
        let tagsHtml = "";
        let insightsArray = [];
        if (Array.isArray(member["터치인사이트"])) {
            insightsArray = member["터치인사이트"];
        } else if (typeof member["터치인사이트"] === 'string') {
            const rawInsight = member["터치인사이트"].trim();
            if (rawInsight !== "") {
                if (rawInsight.startsWith("[") && rawInsight.endsWith("]")) {
                    try {
                        insightsArray = JSON.parse(rawInsight);
                    } catch (e) {
                        insightsArray = rawInsight.split(',').map(s => s.trim()).filter(s => s);
                    }
                } else {
                    insightsArray = rawInsight.split(',').map(s => s.trim()).filter(s => s);
                }
            }
        }
        if (insightsArray.length > 0) {
            tagsHtml = insightsArray.map(tag => {
                let cleanTag = tag;
                if (tag.startsWith("ins:")) cleanTag = tag.substring(4);
                
                if (tag.startsWith("health:")) {
                    cleanTag = tag.substring(7);
                    return `<span class="insight-tag" style="background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; font-size:11px; font-weight:700; padding:3px 8px; border-radius:6px; margin:2px; display:inline-block; box-shadow:0 1px 1px rgba(0,0,0,0.05);">#${cleanTag}</span>`;
                } else {
                    return `<span class="insight-tag" style="background:#e0f2fe; color:#0284c7; border:1px solid #bae6fd; font-size:11px; font-weight:700; padding:3px 8px; border-radius:6px; margin:2px; display:inline-block; box-shadow:0 1px 1px rgba(0,0,0,0.05);">#${cleanTag}</span>`;
                }
            }).join('');
        }
        
        const nameColor = isRoot ? "#1e293b" : "#475569";
        // Build Relationship String
        let relStr = "";
        if (isRoot) {
            let relArr = membersData.map(m => {
                if (m.isRoot) return m.mName;
                let relText = m.member["관계"] || "가족";
                return `${m.mName}(${relText})`;
            });
            relStr = `<span style="font-size:12px; font-weight:700; color:#64748b; margin-left:8px;">[${relArr.join(` · `)}]</span>`;
        } else {
            let rootM = membersData.find(m => m.isRoot);
            if (rootM) {
                let relText = member["관계"] || "가족";
                relStr = `<span style="font-size:12px; font-weight:700; color:#64748b; margin-left:8px;">[${rootM.mName}님의 ${relText}]</span>`;
            }
        }
        let idBadgeHtml = `<div style="display:flex; align-items:center;"><span style="font-size:10.5px; font-weight:800; color:white; background:#3b82f6; padding:4px 8px; border-radius:4px; box-shadow:0 1px 2px rgba(0,0,0,0.1); display:flex; align-items:center; justify-content:center; text-align:center; min-width: 50px;"><i class="fa fa-id-card-o" style="margin-right:4px;"></i>${mId}</span>${relStr}</div>`;
        
        const tr = document.createElement("tr");
        tr.className = isRoot ? "main-row" : "sub-row";
        tr.id = `row-${mId}`;
        tr.setAttribute("data-id", mId);
      tr.setAttribute("data-root-id", rootMId);
        tr.style.background = "#f0f9ff";
        tr.style.transition = "background 0.2s";
        // Row click removed by user request
        
        const safeName = String(mName || "-").replace(/'/g, "\\\\'");
        const safeJumin = String(formatJumin(member["주민번호"] || member["사업자번호"]) || "-").replace(/'/g, "\\\\'");
        const safePhone = String(phone || "-").replace(/'/g, "\\\\'");
        const safeAddr = String(member["주소"] || member["대표주소"] || "-").replace(/'/g, "\\\\'");
        const safeJob = String(member["직업"] || member["업태"] || "-").replace(/'/g, "\\\\'");

        let trHtml = `
            <td style="background:#ffffff !important; padding: 10px 12px !important; border-bottom: ${rowBorder}; text-align: center; vertical-align: middle;">${member['고객번호'] || '-'}</td>
            <td style="background:#ffffff !important; padding: 10px 12px !important; border-bottom: ${rowBorder}; vertical-align: middle;">${safeName}</td>
            <td style="background:#ffffff !important; padding: 10px 12px !important; border-bottom: ${rowBorder}; text-align: center; vertical-align: middle;"><span class="status-badge status-${(member['상태'] || '').includes('체결') ? 'active' : 'pending'}">${member['상태'] || '-'}</span></td>
            <td style="background:#ffffff !important; padding: 10px 12px !important; border-bottom: ${rowBorder}; vertical-align: middle;">${safeJumin}</td>
            <td style="background:#ffffff !important; padding: 10px 12px !important; border-bottom: ${rowBorder}; text-align: center; vertical-align: middle;">${member['나이'] || '-'}</td>
            <td style="background:#ffffff !important; padding: 10px 12px !important; border-bottom: ${rowBorder}; text-align: center; vertical-align: middle;">${member['성별'] || '-'}</td>
            <td style="background:#ffffff !important; padding: 10px 12px !important; border-bottom: ${rowBorder}; text-align: center; vertical-align: middle;">${safePhone}</td>
            <td style="background:#ffffff !important; padding: 10px 12px !important; border-bottom: ${rowBorder}; vertical-align: middle;">${safeJob}</td>
            <td style="background:#ffffff !important; padding: 10px 12px !important; border-bottom: ${rowBorder}; vertical-align: middle;">${member['상세업무'] || '-'}</td>
            <td style="background:#ffffff !important; padding: 10px 12px !important; border-bottom: ${rowBorder}; vertical-align: middle;">${safeAddr}</td>
            <td style="background:#ffffff !important; padding: 10px 12px !important; border-bottom: ${rowBorder}; text-align: center; vertical-align: middle;">
                <button class="action-btn btn-view" onclick="openProfile('${mId}')" style="padding: 6px 12px; font-size:13px;">상세보기</button>
            </td>
        `;
        tr.innerHTML = trHtml;
        generatedRows.push(tr);
          generatedRows.push(window.buildFullAccRow(mData));
    });

    
    
      
      generatedRows.forEach(r => body.appendChild(r));
        const spacerRow = document.createElement("tr");
      spacerRow.innerHTML = `<td colspan="3" style="padding:0; border:none; background:#fff;"><div style="width:100%; height:4px; background:#e2e8f0;"></div></td>`;
      body.appendChild(spacerRow);
});

}
}
function toggleAccordion(custId) {
const detailRow = document.getElementById(`detail-row-${custId}`);
const mainRow = document.getElementById(`row-${custId}`);
const detailBtn = mainRow.querySelector(".detail-btn");
if (detailRow.style.display === "table-row") {
detailRow.style.display = "none";
detailBtn.classList.remove("active");
} else {
detailRow.style.display = "table-row";
detailBtn.classList.add("active");
}
}
function filterCrmTable() {
activeFilters.search = document.getElementById("crmSearchInput").value;
renderTable();
}
window.handleInsCategoryChange = function() {
const cat = document.getElementById("insCategorySelect").value;
const compSelect = document.getElementById("insCompanySelect");
if (!compSelect) return;
compSelect.innerHTML = '<option value="">회사명</option>';
if (cat === "life") {
const lifeComps = ["한화생명","교보생명","농협생명","메트라이프","KDB생명","DB생명","흥국생명","동양생명","미래에셋생명","라이나생명","푸폰현대생명","신한라이프","ABL생명","IM라이프","KB라이프","IBK연금보험","처브라이프","카디프생명","하나생명","AIA생명"];
lifeComps.forEach(c => compSelect.innerHTML += `<option value="${c}">${c}</option>`);
} else if (cat === "nonlife") {
const nonlifeComps = ["삼성화재","메리츠화재","DB손해보험","KB손해보험","현대해상","한화손해보험","롯데손해보험","흥국화재","하나손해보험","NH농협손해보험","라이나손보","AIG손보","MG손해보험"];
nonlifeComps.forEach(c => compSelect.innerHTML += `<option value="${c}">${c}</option>`);
}
filterCrmTable();
};
window.handleInsCompanyChange = function() {
filterCrmTable();
};
function applyQuickFilter(filterType, element) {
const isActive = element.classList.contains("active");
document.querySelectorAll("button[id^='btn-']").forEach(btn => {
btn.classList.remove("active");


});
if (isActive) {
activeFilters.quick = null;
} else {
activeFilters.quick = filterType;
element.classList.add("active");


}
renderTable();
}
window.filterBirthdayThisMonth = function(btn) { applyQuickFilter('birth', btn); };
window.filterAgeUpNextMonth = function(btn) { applyQuickFilter('sang', btn); };
function updateQuickFilterCounts() {
if (!Array.isArray(globalCustomerData)) return;

const now = new Date();
const currentMonth = String(now.getMonth() + 1).padStart(2, "0");

let countInterest = 0;
let countContract = 0;
let countBirth = 0;
let countSang = 0;
let countCard = 0;
let countTransfer = 0;

globalCustomerData.forEach(client => {
if (client["상태"] === "관심" || client["고객상태"] === "관심") countInterest++;
if (client["상태"] === "체결" || client["고객상태"] === "체결") countContract++;
if (client["생일"] && String(client["생일"]).startsWith(currentMonth)) countBirth++;
if (client["상령일"] && String(client["상령일"]).startsWith(currentMonth)) countSang++;
if (client["결제방식"] === "카드") countCard++;
if (client["결제방식"] === "자동이체") countTransfer++;
});

const elAll = document.getElementById("qf-count-all");
if (elAll) elAll.innerText = globalCustomerData.length;

const elInterest = document.getElementById("qf-count-interest");
const elContract = document.getElementById("qf-count-contract");
const elBirth = document.getElementById("qf-count-birth");
const elSang = document.getElementById("qf-count-sang");
const elCard = document.getElementById("qf-count-card");
const elTransfer = document.getElementById("qf-count-transfer");

if (elInterest) elInterest.innerText = countInterest;
if (elContract) elContract.innerText = countContract;
if (elBirth) elBirth.innerText = countBirth;
if (elSang) elSang.innerText = countSang;
if (elCard) elCard.innerText = countCard;
if (elTransfer) elTransfer.innerText = countTransfer;
}
function populateYearFilter() {
const yEl = document.getElementById("yearSearchFilter");
if (!yEl) return;
const currentYear = new Date().getFullYear();
for (let y = currentYear + 1; y >= 2020; y--) {
const opt = document.createElement("option");
opt.value = y;
opt.textContent = y + "년";
yEl.appendChild(opt);
}
}
document.addEventListener("DOMContentLoaded", () => {
populateYearFilter();
});

function filterByMonth() {
const yVal = document.getElementById("yearSearchFilter").value;
const mEl = document.getElementById("monthSearchFilter");

if (!yVal) {
mEl.value = "";
mEl.disabled = true;
mEl.style.opacity = "0.6";
mEl.style.cursor = "not-allowed";
activeFilters.month = "";
} else {
mEl.disabled = false;
mEl.style.opacity = "1";
mEl.style.cursor = "pointer";
const mVal = mEl.value;
if (mVal) {
activeFilters.month = `${yVal}-${mVal}`;
} else {
activeFilters.month = `${yVal}-`;
}
}
renderTable();
}
function initYearFilterOptions() {
const yearSelect = document.getElementById("yearSearchFilter");
if (!yearSelect) return;

const currentYear = new Date().getFullYear();
const yearsSet = new Set();

// Scan all years from globalCustomerData
if (Array.isArray(globalCustomerData)) {
globalCustomerData.forEach(client => {
const dateVal = client["체결일"];
if (dateVal && typeof dateVal === "string") {
const match = dateVal.match(/^(\d{4})/);
if (match) {
const year = parseInt(match[1], 10);
// Only include if it is less than or equal to currentYear
if (year <= currentYear) {
yearsSet.add(year);
}
}
}
});
}

// Add default range: current year down to current year - 20
for (let y = currentYear; y >= currentYear - 20; y--) {
yearsSet.add(y);
}

const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
const prevSelected = yearSelect.value;

yearSelect.innerHTML = '<option value="">년도선택</option>';
sortedYears.forEach(year => {
const option = document.createElement("option");
option.value = String(year);
option.textContent = `${year}년`;
yearSelect.appendChild(option);
});

if (prevSelected && sortedYears.includes(parseInt(prevSelected, 10))) {
yearSelect.value = prevSelected;
} else {
yearSelect.value = "";
const mEl = document.getElementById("monthSearchFilter");
if (mEl) {
mEl.value = "";
mEl.disabled = true;
mEl.style.opacity = "0.6";
mEl.style.cursor = "not-allowed";
}
}
}
function resetMonthFilter() {
const yEl = document.getElementById("yearSearchFilter");
const mEl = document.getElementById("monthSearchFilter");
if (yEl) yEl.value = "";
if (mEl) {
mEl.value = "";
mEl.disabled = true;
mEl.style.opacity = "0.6";
mEl.style.cursor = "not-allowed";
}
activeFilters.month = "";
renderTable();
}
// ==========================================
// 7. 등록 및 수정 모달 및 멀티스텝 핸들러
function removeDynamicSaveButtons() {
    document.querySelectorAll('.dynamic-edit-save-btn').forEach(el => el.remove());
}
function injectDynamicSaveButtons() {
    // Disabled: We already have a static save/cancel button at the bottom of the form in crm_test.html
    // This prevents having 2 duplicate save buttons and fixes the scroll clipping issue.
}
function openRegModal(mode, specificId) {
      const modal = document.getElementById("regModal");
      const form = document.getElementById("crmRegForm");
    const wiz = document.getElementById("regSetupWizard"); if(wiz) wiz.style.display = "none";
    if(form) form.style.display = "flex";
    const mw = document.querySelector(".sian-main-wrapper"); if(mw) mw.style.display = "flex";
      const wizard = document.getElementById("regSetupWizard");
      if(!modal) return;
      
      // 시안 8-5 통합 폼을 위한 초기화
      form.reset();
      
      const modalHeader = document.getElementById("regModalHeader");
      const modalTitle = document.getElementById("regModalTitle");
      if (mode === 'new') {
    let maxId = 0;
    globalCustomerData.forEach(c => {
        let idVal = c["고객번호"] || c["사업자번호"];
        if(idVal) {
            let numStr = String(idVal).split('-')[0].replace(/\D/g, '');
            if(numStr) {
                let n = parseInt(numStr, 10);
                if(n > maxId) maxId = n;
            }
        }
    });
    setTimeout(() => {
        const idInput = document.getElementById("base-cust-id");
        if(idInput) {
            idInput.value = String(maxId + 1);
            idInput.readOnly = true;
        }
        const familyBtn = document.getElementById("familyToggleBtn");
        if(familyBtn) { familyBtn.style.display = "none"; }
        const delBtn = document.getElementById("deleteCrmBtn");
        if(delBtn) delBtn.style.display = "none";
    }, 100);
          if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-user-plus" style="color:#2563eb;"></i> 신규 고객 등록';
          if (modalHeader) {
              modalHeader.style.background = '#eff6ff';
              modalHeader.style.borderBottom = '1px solid #bfdbfe';
          }
      } else {
          if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square" style="color:#64748b;"></i> 고객 정보 조회/수정';
          if (modalHeader) {
              modalHeader.style.background = '#ffffff';
              modalHeader.style.borderBottom = '1px solid #e2e8f0';
          }
      }
      
      

    
    const insArea = document.getElementById("insurance-area");
    if (insArea) insArea.innerHTML = "";
    window.insCount = 0;
    window.currentInsights = [];
    window.familyState = null;
    document.querySelectorAll('.insight-btn').forEach(b => b.classList.remove('active'));
    const tiHidden = document.getElementById('touch-insights-hidden');
    if(tiHidden) tiHidden.value = '';
    
    // 알릴의무 초기화
    const setVal = (name, val) => {
        const el = form.querySelector("[name='" + name + "']");
        if (el) el.value = val;
    };
    setVal('alril_3m', '아니오'); setVal('alril_3m_detail', '');
    setVal('alril_1y', '아니오'); setVal('alril_1y_detail', '');
    setVal('alril_5y', '아니오'); setVal('alril_5y_detail', '');
    setVal('alril_disease', '아니오'); setVal('alril_disease_detail', '');

    if (mode === 'family') {
        openCustomPrompt("family", "고객가족 등록", "가족으로 묶을 기준 고객의 고유번호를 입력해주세요.");
        return;
    } else if (mode === 'edit') {
        if(specificId) {
            openEditMode(specificId, 'detail');
        } else {
            openCustomPrompt("edit", "고객정보 조회/수정", "조회/수정할 고객의 고유번호를 입력해주세요.");
        }
        return;
    } else if (mode === 'delete') {
        openCustomPrompt("delete", "고객정보 삭제", "삭제할 고객의 고유번호를 입력해주세요.");
        return;
    }
    
    // 신규 모드
    window.currentFormMode = 'new';
      if (typeof removeDynamicSaveButtons === 'function') removeDynamicSaveButtons();
      document.body.classList.add('mode-new');
    window.isEditMode = false;
    window.activeFamilyId = null;
    
    let nextId = 1;
    if (globalCustomerData && globalCustomerData.length > 0) {
        const ids = globalCustomerData.map(c => { 
            const rawVal = c["고객번호"] || c["번호"] || c["연번"] || c["고유번호"] || c["고객 번호"] || c["ID"] || c["No"] || c["id"] || ""; const val = String(rawVal).split('-')[0].replace(/[^0-9]/g, ""); 
            return parseInt(val); 
        }).filter(id => !isNaN(id));
        if (ids.length > 0) nextId = Math.max(...ids) + 1;
    }
    const baseCustIdEl = document.getElementById("base-cust-id");
    if (baseCustIdEl) {
        baseCustIdEl.value = nextId;
        baseCustIdEl.readOnly = true;
        baseCustIdEl.style.backgroundColor = "#e2e8f0";
        baseCustIdEl.style.cursor = "not-allowed";
        baseCustIdEl.title = "신규 등록 시 고객번호는 자동으로 순차 배정됩니다.";
    }
    
          if (typeof addInsuranceFields === 'function') {
          addInsuranceFields(null);
      }
      
      // 강제로 1번 탭(기본 인적사항) 선택
      if (typeof window.switchCategoryTab === 'function') window.switchCategoryTab(1);
      
      // 가족 탭 초기화 및 재렌더링
      if (typeof initFamilyTabs === 'function') {
          initFamilyTabs(nextId, '신규 고객');
      }
      if (typeof window.renderActionButtons === 'function') {
          window.renderActionButtons();
      }
              if (typeof window.toggleReadonlyState === 'function') {
            window.toggleReadonlyState();
        }
        
        if (mode === 'new' && wizard && form) {
            wizard.style.display = 'flex'; wizard.style.justifyContent = 'center'; wizard.style.minHeight = '500px';
            form.style.display = 'none';
            const mw = document.querySelector('.sian-main-wrapper'); if(mw) mw.style.display = 'none';
            if (typeof window.setWizardMode === 'function') {
                window.setWizardMode('single');
                document.getElementById('wizard-main-name').value = '';
                document.getElementById('wizard-family-list').innerHTML = `
                    <div class="wizard-row" style="display: flex; gap: 10px; align-items: center; margin-bottom: 12px;" id="wrow-1">
                        <select class="w-rel" onchange="handleWizardRelChange(this)" style="padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; flex: 0.5; outline: none;">
                            <option value="">관계 선택</option>
                            <option value="배우자">배우자</option>
                            <option value="자녀">자녀</option>
                            <option value="부모">부모 (부/모)</option>
                            <option value="조부모">조부모 (조부/조모)</option>
                            <option value="형제/자매">형제/자매</option>
                            <option value="손자녀">손자녀 (손자/손녀)</option>
                            <option value="며느리/사위">며느리/사위</option>
                            <option value="친척">친척</option>
                            <option value="직원">직원</option>
                            <option value="기타">기타 (직접입력)</option>
                        </select>
                        <input type="text" class="w-rel-custom" placeholder="직접입력" style="display:none; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; flex: 0.5; outline: none;">
                        <input type="text" class="w-name" placeholder="성함 입력" style="padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; flex: 1; outline: none;">
                        <button type="button" onclick="document.getElementById('wrow-1').remove()" style="background: transparent; color: #ef4444; border: 1px solid #ef4444; padding: 9px 12px; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: bold;"><i class="fa-solid fa-minus"></i> 삭제</button>
                    </div>
                `;
                window.wizardRowCount = 1;
            }
        } else if (wizard && form) {
            wizard.style.display = 'none';
            form.style.display = 'flex';
        }
        
        modal.style.display = 'flex'; setTimeout(() => modal.classList.add('active'), 10);
  
  }
  function checkPendingFamilyRegistration() {
    if (window.pendingFamilyQueues && window.pendingFamilyQueues.length > 0) {
        const task = window.pendingFamilyQueues.shift();
        const baseId = task.baseId;
        setTimeout(() => {
            showCustomAlertCallback("[" + (task.insData['피보험자'] || task.insData['차_피보험자'] || '가족') + "]님을 관리고객(가족)으로 등록 진행하겠습니다.", () => {
                loadCustomerForFamily(task);
            });
        }, 500);
    }
}

function loadCustomerForFamily(task) {
    const baseIdInput = (typeof task === "object") ? task.baseId : task;
    const targetRows = globalCustomerData.filter(item => {
        const id = (item['고객번호'] || '').toString().trim();
        return id === baseIdInput || id.startsWith(baseIdInput + '-');
    });
    if (targetRows.length === 0) {
        showCustomAlert(" 오류", "입력하신 번호에 해당하는 기준 고객 정보가 없습니다.");
        return;
    }

    let maxSub = Math.max(0, ...targetRows
        .filter(r => (r['고객번호']||'').toString().startsWith(baseIdInput + '-'))
        .map(r => parseInt((r['고객번호']||'').toString().substring(baseIdInput.length + 1).split('-')[0], 10) || 0)
    );

    isEditMode = false; window.isEditMode = false;
    editTargetId = null;
    
    const modal = document.getElementById("regModal");
    const form = document.getElementById("crmRegForm");
    const wiz = document.getElementById("regSetupWizard"); if(wiz) wiz.style.display = "none";
    if(form) form.style.display = "flex";
    const mw = document.querySelector(".sian-main-wrapper"); if(mw) mw.style.display = "flex";
    form.reset();
    
    document.getElementById("base-cust-id").value = baseIdInput + "-" + (maxSub + 1);
    
    const baseRow = targetRows[0];
    
    const fieldsToCopy = ['주소', '상세주소', '직업', '가족사항', '반려동물', '동물이름'];
    fieldsToCopy.forEach(f => {
        const input = form.querySelector("[name='" + f + "']");
        if (input) input.value = baseRow[f] || "";
    });

        if (typeof task === "object" && task.insData) {
        const nameInput = form.querySelector('input[name="고객명"]');
        if (nameInput) nameInput.value = task.insData["피보험자"] || task.insData["차_피보험자"] || task.insData["이름"] || "";
        
        const juminInput = form.querySelector('input[name="주민번호"]');
        if (juminInput) {
            juminInput.value = task.insData["피보험자주민번호"] || task.insData["피보험자_주민번호"] || task.insData["차_피보험자주민번호"] || "";
            if (typeof parseJumin === "function") parseJumin(juminInput, "base-sangryung");
        }
    }

    document.getElementById("insurance-area").innerHTML = "";
    insCount = 0;
    
    showStep(1);
    
      modal.style.display = "flex"; setTimeout(() => modal.classList.add("active"), 10);

    
    if (task.insDataList && task.insDataList.length > 0) {
        task.insDataList.forEach((ins, idx) => {
            addInsuranceFields(ins);
            setTimeout(() => {
                const entries = document.querySelectorAll('.insurance-entry');
                if (entries.length > 0) {
                    const entry = entries[entries.length - 1];
                    const diffCb = entry.querySelector('.diff-cb');
                    if (diffCb) {
                        diffCb.checked = true;
                        if (typeof toggleInsuredFields === "function") toggleInsuredFields(diffCb, true);
                        const contractorInput = entry.querySelector('input[name="계약자"], input[name="차_계약자"]');
                        if (contractorInput && task.originalName) contractorInput.value = task.originalName;
                        const insuredInput = entry.querySelector('input[name="피보험자"], input[name="차_피보험자"]');
                        if (insuredInput) {
                            insuredInput.value = ins["피보험자"] || ins["차_피보험자"] || "";
                        }
                    }
                }
            }, 300);
        });
    }
}function openEditMode(custId, initialMode = 'edit') {
    window.disableInitFamilyTabs = false;
const client = globalCustomerData.find(c => String(c["고객번호"] || c["사업자번호"]) === String(custId));
    if (!client) {
        showCustomAlert(" 오류", "고객 정보를 찾을 수 없습니다.");
        return;
    }
    isEditMode = true; window.isEditMode = true;
    setTimeout(() => {
        const familyBtn = document.getElementById("familyToggleBtn");
        if(familyBtn) { 
            familyBtn.style.display = "inline-block"; 
            const curId = document.getElementById("base-cust-id").value;
            if(curId.includes("-")) familyBtn.innerText = "가족에서 분리(독립) ";
            else familyBtn.innerText = "가족으로 묶기 ";
        }
        const delBtn = document.getElementById("deleteCrmBtn");
        if(delBtn) delBtn.style.display = "inline-block";
    }, 100);
      if (typeof injectDynamicSaveButtons === 'function') injectDynamicSaveButtons();
      document.body.classList.remove('mode-new');
    editTargetId = String(custId);
    if (typeof initFamilyTabs === 'function') initFamilyTabs(custId, client["고객명"] || "본인");
    const modal = document.getElementById("regModal");
    const form = document.getElementById("crmRegForm");
    const wiz = document.getElementById("regSetupWizard"); if(wiz) wiz.style.display = "none";
    if(form) form.style.display = "flex";
    const mw = document.querySelector(".sian-main-wrapper"); if(mw) mw.style.display = "flex";
    form.reset(); const noPhoneCb = document.getElementById("no-phone-cb"); if (noPhoneCb) { noPhoneCb.checked = false; const bp = document.getElementById("base-phone"); if (bp) { bp.disabled = false; bp.required = true; } }
    const insArea = document.getElementById("insurance-area");
    if (insArea) insArea.innerHTML = "";
    insCount = 0;

    // 안전한 폼 바인딩 헬퍼
    const setFormVal = (name, val) => {
        const el = form.querySelector(`[name='${name}']`);
        if (el) el.value = val || "";
    };

    const baseCustIdEl = document.getElementById("base-cust-id");
    if (baseCustIdEl) {
        baseCustIdEl.value = client["고객번호"] || client["사업자번호"] || "";
        baseCustIdEl.readOnly = false;
        baseCustIdEl.style.backgroundColor = "#ffffff";
        baseCustIdEl.style.cursor = "text";
        baseCustIdEl.title = "가족으로 편입하려면 기준 고객의 번호 뒤에 '-번호'를 붙여주세요. (예: 1-1)";
    }

    // 일반 고객 매핑
    setFormVal("고객명", client["고객명"] || client["대표자명"] || "");
      
      setFormVal("상태", client["상태"] || "체결");
    setFormVal("주민번호", formatJumin(client["주민번호"] || ""));
    setFormVal("나이", client["나이"] || "");
    setFormVal("성별", client["성별"] || "");
    setFormVal("직업", client["직업"] || "");
    setFormVal("상세업무", client["상세업무"] || "");
    setFormVal("폰번호", formatPhone(client["폰번호"] || ""));
    setFormVal("생일", client["생일"] || "");
    setFormVal("상령일", client["상령일"] || client["상령월"] || "");
      setFormVal("주소", client["주소"] || "");
      if (document.getElementById("base-address")) document.getElementById("base-address").value = client["주소"] || client["대표주소"] || "";
      if (document.getElementById("detail-address")) document.getElementById("detail-address").value = "";
    setFormVal(client[""] || "");
    setFormVal("특이사항", client["특이사항"] || client["상담메모"] || "");
    setFormVal("가족사항", client["가족사항"] || "");
    setFormVal("반려동물", client["반려동물"] || "");
    setFormVal("동물이름", client["동물이름"] || "");
    setFormVal("코드", client["코드"] || "");
    setFormVal("사업여부", client["사업여부"] || "");
    setFormVal("운전여부", client["운전여부"] || "아니오");

    // 자동차 체크박스 복원

    // 다중 보험 내역 복원 로직
let list = getGlobalInsuranceList(client, false);
// Parse legacy alril if first item doesn't have it
let legacyAlril = null;
if (client["알릴의무사항"]) {
try {
legacyAlril = typeof client["알릴의무사항"] === 'string' ? JSON.parse(client["알릴의무사항"]) : client["알릴의무사항"];
} catch (e) {}
}
if (legacyAlril && list.length > 0 && (!list[0].알릴의무사항 || list[0].알릴의무사항.length === 0)) {
const converted = [];
if (legacyAlril.m3 === "예" || legacyAlril.m3_detail) {
converted.push({ "병명": legacyAlril.m3_detail || "3개월 알릴의무", "시작일": "", "종료일": "", "병원": "", "치료": true, "재발": "X", "완치": "O" });
}
if (legacyAlril.y1 === "예" || legacyAlril.y1_detail) {
converted.push({ "병명": legacyAlril.y1_detail || "1년 알릴의무", "시작일": "", "종료일": "", "병원": "", "치료": true, "재발": "X", "완치": "O" });
}
if (legacyAlril.y5 === "예" || legacyAlril.y5_detail) {
converted.push({ "병명": legacyAlril.y5_detail || "5년 알릴의무", "시작일": "", "종료일": "", "병원": "", "치료": true, "재발": "X", "완치": "O" });
}
if (legacyAlril.disease === "예" || legacyAlril.disease_detail) {
converted.push({ "병명": legacyAlril.disease_detail || "5대질병 알릴의무", "시작일": "", "종료일": "", "병원": "", "치료": true, "재발": "X", "완치": "O" });
}
if (converted.length > 0) {
list[0].알릴의무사항 = converted;
}
}

// 동적으로 보험 입력 카드 생성
list.forEach(item => {
addInsuranceFields(item);
});

setFormVal("가족사항", client["가족사항"]);
      const petCb = document.getElementById("has-pet-cb");
      if (petCb) {
          petCb.checked = !!(client["반려동물"] || client["동물이름"] || client["코드"]);
          const petFields = document.getElementById("pet-fields");
          if (petFields) petFields.style.display = petCb.checked ? "flex" : "none";
      }

      const driveCb = document.getElementById("is-driving-cb");
      if (driveCb) {
          driveCb.checked = (client["운전여부"] === "예");
          const driveFields = document.getElementById("driving-fields");
          if (driveFields) driveFields.style.display = driveCb.checked ? "block" : "none";
      }

      setFormVal("반려동물", client["반려동물"]);
      setFormVal("동물이름", client["동물이름"]);
      setFormVal("코드", client["코드"]);
      setFormVal("사업여부", client["사업여부"]);
      setFormVal("운전여부", client["운전여부"] || "아니오");

const carTypes = (client["차량용도"] || client["차종류"] || "").split(",").map(s => s.trim()).filter(Boolean);
    const mappedCarTypes = carTypes.map(c => c === '개인' ? '개인용' : (c === '업무' ? '업무용' : c));
    form.querySelectorAll("input[type='checkbox'][name^='차량용도_']").forEach(chk => {
        chk.checked = mappedCarTypes.includes(chk.value);
    });
setFormVal(client[""]);
setFormVal("특이사항", client["특이사항"]);

          const insightData = client["터치인사이트"];
      let insights = [];
      if (Array.isArray(insightData)) {
          insights = insightData;
      } else if (typeof insightData === "string") {
          insights = insightData.split(",").map(s => s.trim()).filter(Boolean);
      }
      document.querySelectorAll('.insight-pill input[type="checkbox"]').forEach(cb => {
          cb.checked = insights.includes(cb.value);
      });
      if (typeof window.syncInsights === 'function') {
          window.syncInsights();
      } else {
          const hiddenInsight = document.getElementById("form-insight-data");
          if(hiddenInsight) hiddenInsight.value = insights.join(", ");
      }
      currentStep = 1;
showStep(1);
window.currentFormMode = initialMode;
if(typeof toggleReadonlyState === 'function') toggleReadonlyState();

      modal.style.display = "flex"; setTimeout(() => modal.classList.add("active"), 10);

}
function closeRegModal() { const m = document.getElementById("regModal"); if(m) m.classList.remove("active"); setTimeout(() => { if(m) m.style.display = "none"; }, 300); }
function showStep(step) {
document.querySelectorAll(".step-content").forEach(el => el.classList.remove("active"));
document.querySelectorAll(".step-item").forEach(el => el.classList.remove("active"));

document.getElementById(`step-${step}`).classList.add("active");

for (let i = 1; i <= step; i++) {
const item = document.getElementById(`indicator-${i}`);
if (item) item.classList.add("active");
}
const progressLine = document.querySelector(".progress-line");
if (progressLine) {
progressLine.style.width = `${(step - 1) * 50}%`;
}
}
function nextStep(step) { if (step === 1) { const phone = document.getElementById("base-phone").value.trim(); const noPhoneCb = document.getElementById("no-phone-cb"); if (!phone && (!noPhoneCb || !noPhoneCb.checked)) {
showCustomAlert(" 입력 누락", "폰번호는 필수 입력 사항입니다.");
return;
}
}
currentStep = step + 1;
showStep(currentStep);
}
function prevStep(step) {
currentStep = step - 1;
showStep(currentStep);
}
// ==========================================
// 8. 보험 및 2차 정보 가입 동적 컴포넌트
// ==========================================
function removeInsuranceFields(id) {
    const card = document.getElementById("ins-card-" + id);
    if (card) card.remove();
    
    // 재정렬 로직
    const cards = document.querySelectorAll('.insurance-entry');
    cards.forEach((entry, index) => {
        const titleEl = entry.querySelector('h5');
        if (titleEl) {
            titleEl.innerHTML = '보험 정보 #' + (index + 1);
        }
    });

    if (typeof updateAddButtonsVisibility === 'function') updateAddButtonsVisibility();
}
async function submitCrmData(event) {
  event.preventDefault();
  if (window.isSubmittingCrm) return false;
window.isSubmittingCrm = true;
const form = document.getElementById("crmRegForm");
    const wiz = document.getElementById("regSetupWizard"); if(wiz) wiz.style.display = "none";
    if(form) form.style.display = "flex";
    const mw = document.querySelector(".sian-main-wrapper"); if(mw) mw.style.display = "flex";
    const juminInput = form.querySelector('[name="주민번호"]');
    const juminStr = juminInput ? juminInput.value.replace(/-/g, "") : "";
    const ageField = form.querySelector('[name="나이"]');
    const genderField = form.querySelector('[name="성별"]');
    const birthField = form.querySelector('[name="생일"]');
    const sangField = form.querySelector('[name="상령일"]');
    if (juminStr && juminStr.length >= 6) {
        const jd = calculateJuminData(juminStr);
        if (jd) {
            if (ageField && !ageField.value) ageField.value = jd.age;
            if (genderField && !genderField.value) genderField.value = jd.gender;
            if (birthField && !birthField.value) birthField.value = jd.birth;
            if (sangField && !sangField.value) sangField.value = jd.sang;
        }
    }
        const disabledInputs = form.querySelectorAll(':disabled');
    disabledInputs.forEach(el => el.disabled = false);
    const formData = new FormData(form);
    disabledInputs.forEach(el => el.disabled = true);

const requiredFields = form.querySelectorAll('input[required]');
  const isSubFamily = window.isFamilySubmit && document.getElementById("base-cust-id").value.includes("-");
  if (!isSubFamily) {
      for (let el of requiredFields) { 
          if (!el.value.trim()) { 
              showCustomAlert(" 입력 누락", "필수 입력 항목을 확인해주세요.");
              currentStep = el.closest('#step-2') ? 2 : 1;
              showStep(currentStep);
              setTimeout(() => el.focus(), 100);
              window.isSubmittingCrm = false;
              return false;
          } 
      }
  }

if (true) {
    const rawPhone = formData.get("폰번호") || formData.get("대표자폰번호") || "";
    const rawJumin = formData.get("주민번호") || formData.get("대표자 생일") || "";
    const inputPhone = rawPhone.replace(/[^0-9]/g, '');
    const inputJumin = rawJumin.replace(/[^0-9]/g, '');
    
    const checkPhone = inputPhone.length > 5;
    const checkJumin = inputJumin.length > 5;

    if (checkPhone || checkJumin) {
        const dup = globalCustomerData.find(c => {
            const currentId = document.getElementById("base-cust-id").value.trim();
            const isSelf = window.isEditMode && window.editTargetId && (c["고객번호"] === window.editTargetId || c["사업자번호"] === window.editTargetId);
            
            // 1. 타인이 이미 사용 중인 ID(고객번호)를 입력한 경우 즉시 차단
            if (!isSelf && ((c["고객번호"] && c["고객번호"] === currentId) || (c["사업자번호"] && c["사업자번호"] === currentId))) return true;
            
            // 2. 본인의 원본 데이터는 폰번호/주민번호 중복 검사에서 제외 (가족 편입을 위해 ID를 바꿨더라도 본인 데이터이므로 통과)
            if (isSelf) return false;

            const cPhone = (c["폰번호"] || c["대표자폰번호"] || c["대표자핸드폰"] || "").replace(/[^0-9]/g, '');
            const cJumin = (c["주민번호"] || c["대표자 생일"] || "").replace(/[^0-9]/g, '');
            if (checkPhone && cPhone === inputPhone) return true;
            if (checkJumin && cJumin === inputJumin) return true;
            return false;
        });
        
        if (dup) {
            window.isSubmittingCrm = false;
            const dupId = dup["고객번호"] || dup["사업자번호"] || "번호없음";
            const dupName = dup["고객명"] || dup["상호명(법인명)"] || dup["대표자명"] || "이름없음";
            showCustomAlert(" 등록 차단", "이미 등록된 고객입니다.\n(고객번호: " + dupId + " / 이름: " + dupName + ")");
            return;
        }
    }
}
const carTypes = [];
if (formData.get("차량용도_개인용")) carTypes.push("개인용");
if (formData.get("차량용도_업무용")) carTypes.push("업무용");
    if (formData.get("차량용도_영업용")) carTypes.push("영업용");
    if (formData.get("차량용도_바이크")) carTypes.push("바이크");

const insList = [];
let abortSubmit = false; 
const insEntries = form.querySelectorAll('.insurance-entry');

insEntries.forEach((entry, idx) => {
if(abortSubmit) return; 
const insData = {};

// Gather standard input fields in the card
const activeTypeSel = entry.querySelector('input[name="보험종류"]');
const activeType = activeTypeSel ? activeTypeSel.value : '장기보험';
const activePanel = activeType === '자동차보험' ? entry.querySelector('[id^="ins-car-"]') : entry.querySelector('[id^="ins-longterm-"]');

entry.querySelectorAll('input, select, textarea').forEach(el => { 
    const inLongterm = el.closest('[id^="ins-longterm-"]');
    const inCar = el.closest('[id^="ins-car-"]');
    if (inLongterm && activeType !== '장기보험') return;
    if (inCar && activeType !== '자동차보험') return;
    
    if (!el.closest('.alril-section') && el.name && !el.classList.contains('diff-cb')) {
    if (el.type === 'checkbox') {
        if (el.checked) {
            if (insData[el.name]) {
                insData[el.name] = insData[el.name] + ", " + el.value.trim();
            } else {
                insData[el.name] = el.value.trim();
            }
        }
    } else if (el.type === 'radio') {
        if (el.checked) insData[el.name] = el.value.trim();
    } else {
        insData[el.name] = el.value.trim(); 
    }
}
    });
    insData['보험종류'] = activeType;

// Determine insured person
const diffCb = activePanel ? activePanel.querySelector('.diff-cb') : entry.querySelector('.diff-cb');
insData['differentInsured'] = diffCb ? diffCb.checked : false;
if (insData['differentInsured']) {
    const insNameInput = activeType === '자동차보험' ? activePanel.querySelector('input[name="차_피보험자"]') : activePanel.querySelector('input[name="피보험자"]');
    
    let finalInsName = insNameInput ? insNameInput.value.trim() : "";
    if (!finalInsName) {
        const smartGroup = activePanel.querySelector('.smart-ins-group[data-target$="피보험자"]');
        if (smartGroup) {
            const activePill = smartGroup.querySelector('.ins-pill-btn.active');
            if (activePill && !activePill.classList.contains('outsider-btn')) {
                finalInsName = formData.get("고객명") || formData.get("대표자명") || "";
                if (insNameInput) insNameInput.value = finalInsName;
            }
        }
    }

    if(!finalInsName) { 
        abortSubmit = true; 
        showCustomAlert(" 입력 누락", "피보험자 성함을 확인해 주세요."); 
        currentStep = 2; 
        showStep(2);
        if(insNameInput) setTimeout(() => insNameInput.focus(), 100);
        return; 
    }
    if (activeType === '자동차보험') {
        insData['차_피보험자'] = insNameInput.value.trim();
        insData['차_기본피보험자'] = "";
    } else {
        insData['피보험자'] = insNameInput.value.trim();
        insData['기본피보험자'] = "";
    }
} else {
    const basicInsNameInput = activeType === '자동차보험' ? activePanel.querySelector('input[name="차_기본피보험자"]') : activePanel.querySelector('input[name="기본피보험자"]');
    const basicInsName = basicInsNameInput ? basicInsNameInput.value.trim() : "";
    if (activeType === '자동차보험') {
        insData['차_기본피보험자'] = basicInsName;
        insData['차_피보험자'] = basicInsName || formData.get("고객명") || "무명고객"; 
    } else {
        insData['기본피보험자'] = basicInsName;
          insData['피보험자'] = basicInsName || formData.get("고객명") || "무명고객"; 
      }
  } // End of if (insData["differentInsured"]) else ...
  
  if (activeType === '자동차보험') {
      if (!insData['차_계약자']) insData['차_계약자'] = formData.get("고객명");
  } else {
      if (!insData['계약자']) insData['계약자'] = formData.get("고객명");
  }

// Payment details
const payMethodInput = activeType === '자동차보험' ? activePanel.querySelector('[name="차_결제방식"]') : activePanel.querySelector('[name="결제방식"]');
const payMethod = payMethodInput ? payMethodInput.value : "";
if (activeType === '자동차보험') {
    insData['차_결제방식'] = payMethod;
    const cardNo = activePanel.querySelector('[name="차_카드번호"]').value.trim();
    const cardValid = activePanel.querySelector('[name="차_유효기간"]').value.trim();
    const bankName = activePanel.querySelector('[name="차_은행명"]').value.trim();
    const accountNo = activePanel.querySelector('[name="차_계좌번호"]').value.trim();
    
    insData['차_결제정보'] = payMethod === '카드' ? `${cardNo} / ${cardValid}` : (payMethod === '자동이체' || payMethod === '가상계좌' ? `${bankName} / ${accountNo}` : '');
    insData['차_카드번호'] = cardNo;
    insData['차_유효기간'] = cardValid;
    insData['차_은행명'] = bankName;
    insData['차_계좌번호'] = accountNo;
    
    // Also map to standard for saveCrmData mapping
    // Map other critical fields to standard names to prevent any possible omissions
      if (insData['차_보험료']) insData['보험료'] = insData['차_보험료'];
      if (insData['차_결제일']) insData['결제일'] = insData['차_결제일'];
      if (insData['갱신일']) insData['만기일'] = insData['갱신일'];
      if (insData['차_계약자']) insData['계약자'] = insData['차_계약자'];
      if (insData['차_피보험자']) insData['피보험자'] = insData['차_피보험자'];
      if (insData['차_보험사명']) insData['보험사명'] = insData['차_보험사명'];
      
      // Also map to standard for saveCrmData mapping
      insData['결제방식'] = payMethod;
      insData['결제정보'] = insData['차_결제정보'];
    insData['카드번호'] = cardNo;
    insData['유효기간'] = cardValid;
    insData['은행명'] = bankName;
    insData['계좌번호'] = accountNo;
} else {
    insData['결제방식'] = payMethod;
    const cardNo = activePanel.querySelector('[name="카드번호"]').value.trim();
    const cardValid = activePanel.querySelector('[name="유효기간"]').value.trim();
    const bankName = activePanel.querySelector('[name="은행명"]').value.trim();
    const accountNo = activePanel.querySelector('[name="계좌번호"]').value.trim();
    
    insData['결제정보'] = payMethod === '카드' ? `${cardNo} / ${cardValid}` : (payMethod === '자동이체' ? `${bankName} / ${accountNo}` : '');
    insData['카드번호'] = cardNo;
    insData['유효기간'] = cardValid;
    insData['은행명'] = bankName;
    insData['계좌번호'] = accountNo;
}

const directCb = activePanel ? activePanel.querySelector('input[name="다이렉트여부"]') : entry.querySelector('input[name="다이렉트여부"]');
if (directCb) {
    insData["다이렉트여부"] = directCb.checked ? "다이렉트" : "";
}
// Gather alril table rows
const alrilRows = [];
const targetAlrilTbody = activePanel ? activePanel.querySelector('.alril-tbody') : entry.querySelector('.alril-tbody');
if (targetAlrilTbody) {
    targetAlrilTbody.querySelectorAll('.alril-card').forEach((r, rowIdx) => {
        const dName = r.querySelector('[name="알릴_병명"]').value.trim();
        const hasAnyValue = dName || r.querySelector('[name="알릴_치료"]').checked || r.querySelector('[name="알릴_투약"]').checked || r.querySelector('[name="알릴_입원"]').checked || r.querySelector('[name="알릴_수술"]').checked || r.querySelector('[name="알릴_정밀검사"]').checked || r.querySelector('[name="알릴_시작일"]').value.trim() || r.querySelector('[name="알릴_병원"]').value.trim();
        if(!hasAnyValue) return; 

        alrilRows.push({
            "병명": dName,
            "시작일": r.querySelector('[name="알릴_시작일"]').value.trim(),
            "종료일": r.querySelector('[name="알릴_종료일"]').value.trim(),
            "병원": r.querySelector('[name="알릴_병원"]').value.trim(),
            "치료": r.querySelector('[name="알릴_치료"]').checked,
            "투약": r.querySelector('[name="알릴_투약"]').checked,
            "입원": r.querySelector('[name="알릴_입원"]').checked,
            "수술": r.querySelector('[name="알릴_수술"]').checked,
            "정밀검사": r.querySelector('[name="알릴_정밀검사"]').checked,
            "재발": r.querySelector('[name="알릴_재발"]').value,
            "완치": r.querySelector('[name="알릴_완치"]').value
        });
    });
}
insData['알릴의무사항'] = alrilRows;

insList.push(insData);

if (entry.dataset.queueFamily === "true") {
    if (!window.pendingFamilyQueues) window.pendingFamilyQueues = [];
    const jumin = insData['피보험자주민번호'] || insData['피보험자생년월일'];
    let existingTask = window.pendingFamilyQueues.find(q => q.insData['피보험자주민번호'] === jumin && jumin);
    if (!existingTask) {
        existingTask = window.pendingFamilyQueues.find(q => q.insData['피보험자'] === insData['피보험자'] && !jumin);
    }
    
    if (existingTask) {
        if (!existingTask.insDataList) existingTask.insDataList = [existingTask.insData];
        existingTask.insDataList.push(insData);
    } else {
        window.pendingFamilyQueues.push({
            insData: insData,
            insDataList: [insData],
            baseId: document.getElementById("base-cust-id").value,
            originalName: document.querySelector('input[name="고객명"]').value.trim()
        });
    }
}
});

if (abortSubmit) {
window.isSubmittingCrm = false;
return;
}

// 시트 대표 보험 정보 호환용 (첫 번째 보험 상품 추출)
const firstIns = insList[0] || {};
const existingClient = window.isEditMode ? globalCustomerData.find(c => c["고객번호"] === window.editTargetId) : null;

// Format first insurance alril details as readable string for backward compatibility
let firstInsAlrilText = " ";
if (firstIns.알릴의무사항 && firstIns.알릴의무사항.length > 0) {
    firstInsAlrilText = "";
    firstIns.알릴의무사항.forEach((row, rowIdx) => {
    const checks = [];
    if (row.treatment || row["치료"]) checks.push("치료");
    if (row.medication || row["투약"]) checks.push("투약");
    if (row.admission || row["입원"]) checks.push("입원");
    if (row.surgery || row["수술"]) checks.push("수술");
    if (row.biopsy || row["정밀검사"]) checks.push("정밀검사");
    
    const dName = row.disease || row["병명"] || "";
    const sDate = row.startDate || row["시작일"] || "";
    const eDate = row.endDate || row["종료일"] || "";
    const hosp = row.hospital || row["병원"] || "";
    const rel = row.relapse || row["재발"] || "";
    const cur = row.cured || row["완치"] || "";
    
    firstInsAlrilText += `[${rowIdx+1}] 병명:${dName} | 기간:${sDate}~${eDate} | 병원:${hosp} | 내용:${checks.join(',')} | 재발:${rel} | 완치:${cur}\n`;
  });
}

const baseAddr = formData.get("기본주소") || "";
const detailAddr = formData.get("상세주소입력") || "";
const fullAddress = baseAddr ? (baseAddr + (detailAddr ? " " + detailAddr : "")) : (formData.get("주소") || "");

const clientObj = {
    "고객번호": document.getElementById("base-cust-id").value,
    "등록일": existingClient ? (existingClient["등록일"] || new Date().toISOString().substring(0, 10)) : new Date().toISOString().substring(0, 10),
    "UID": existingClient && existingClient["UID"] ? existingClient["UID"] : "UID_" + new Date().getTime() + "_" + Math.floor(Math.random()*1000),
    "사업여부": formData.get("사업여부") || "",
    "고객명": formData.get("고객명") || "무명고객",
    "상태": formData.get("상태"),
    "주민번호": formatJumin(formData.get("주민번호") || ""),
    "나이": formData.get("나이"),
    "성별": formData.get("성별"),
    "직업": formData.get("직업"),
    "폰번호": formatPhone(formData.get("폰번호") || ""),

    "생일": formData.get("생일"),
    "상령일": formData.get("상령일"),
    "주소": fullAddress,

// 대표 보험 정보 컬럼 세팅 (가독성 보장)
  "피보험자": firstIns.피보험자 || firstIns.차_피보험자 || (existingClient ? existingClient["피보험자"] : ""),
  "계약자": firstIns.계약자 || firstIns.차_계약자 || (existingClient ? existingClient["계약자"] : ""),
  "보험사명": firstIns.보험사명 || firstIns.차_보험사명 || firstIns.company || "",
  "상품명": (firstIns.보험종류 === "자동차보험" ? (firstIns.차종 || firstIns.차량번호 || "자동차보험") : (firstIns.상품명 || firstIns.product || "")),
  "가입내역": (insList.length > 0 && (insList[0].보험사명 || insList[0].차_보험사명 || insList[0].상품명 || insList[0].차종 || (insList[0].알릴의무사항 && insList[0].알릴의무사항.length > 0) || insList.length > 1)) ? JSON.stringify(insList) : (formData.get("가입내역") || ""), 
  "체결일": firstIns.체결일 || firstIns.책임개시일 || firstIns.갱신일자 || firstIns.date || "",
  "보험료": firstIns.보험료 || firstIns.차_보험료 || firstIns.premium || "",
  "결제일": firstIns.결제일 || firstIns.payDate || (existingClient ? existingClient["결제일"] : ""),
  "납입기간": firstIns.납입기간 || firstIns.payPeriod || (existingClient ? existingClient["납입기간"] : ""),
  "갱신일": firstIns.갱신일 || firstIns.갱신일자 || firstIns.expireDate || (existingClient ? existingClient["갱신일"] : ""),
  "결제방식": firstIns.결제방식 || firstIns.차_결제방식 || (firstIns.payment === "카드" || firstIns.payment === "신용카드" ? "카드" : "자동이체"),
  "결제정보": firstIns.결제정보 || firstIns.차_결제정보 || (existingClient ? existingClient["결제정보"] : ""),
  "보험1_종류": insList[0] ? (insList[0].보험분류 || insList[0].type || insList[0].보험종류 || "") : "",
  "보험1_사명": insList[0] ? (insList[0].보험사명 || insList[0].차_보험사명 || insList[0].company || "") : "",
  "보험1_상품명": insList[0] ? (insList[0].보험종류 === "자동차보험" ? (insList[0].차종 || insList[0].차량번호 || "자동차보험") : (insList[0].상품명 || insList[0].product || "")) : "",
"보험1_가입내역": insList[0] ? JSON.stringify(insList[0].가입내역 || insList[0].details || "") : "",
"보험1_체결일": insList[0] ? (insList[0].체결일 || insList[0].책임개시일 || insList[0].date || "") : "",
"보험1_만기일": insList[0] ? (insList[0].만기일 || "") : "",
"보험1_보험료": insList[0] ? (insList[0].보험료 || insList[0].차_보험료 || insList[0].premium || "") : "",
"보험1_결제일": insList[0] ? (insList[0].결제일 || insList[0].payDate || "") : "",
"보험1_납입기간": insList[0] ? (insList[0].납입기간 || insList[0].payPeriod || "") : "",
"보험1_갱신일": insList[0] ? (insList[0].갱신일 || insList[0].expireDate || "") : "",
"보험1_결제방식": insList[0] ? (insList[0].결제방식 || (insList[0].payment === "카드" || insList[0].payment === "신용카드" ? "카드" : "자동이체")) : "",
"보험1_결제정보": insList[0] ? (insList[0].결제정보 || "") : "",
"보험1_차종": insList[0] ? (insList[0].차종 || "") : "",
"보험1_차량번호": insList[0] ? (insList[0].차량번호 || "") : "",
"보험1_차량용도": insList[0] ? (insList[0].차량용도 || "") : "",
"보험1_운전자특약": insList[0] ? (insList[0].운전자특약 || "") : "",
"보험1_연령특약": insList[0] ? (insList[0].연령특약 || "") : "",
"보험1_다이렉트여부": insList[0] ? (insList[0].다이렉트여부 || "") : "",
"보험2_종류": insList[1] ? (insList[1].보험분류 || insList[1].type || insList[1].보험종류 || "") : "",
"보험2_사명": insList[1] ? (insList[1].보험사명 || insList[1].차_보험사명 || insList[1].company || "") : "",
"보험2_상품명": insList[1] ? (insList[1].상품명 || insList[1].product || "") : "",
"보험2_가입내역": insList[1] ? JSON.stringify(insList[1].가입내역 || insList[1].details || "") : "",
"보험2_체결일": insList[1] ? (insList[1].체결일 || insList[1].책임개시일 || insList[1].date || "") : "",
"보험2_만기일": insList[1] ? (insList[1].만기일 || "") : "",
"보험2_보험료": insList[1] ? (insList[1].보험료 || insList[1].차_보험료 || insList[1].premium || "") : "",
"보험2_결제일": insList[1] ? (insList[1].결제일 || insList[1].payDate || "") : "",
"보험2_납입기간": insList[1] ? (insList[1].납입기간 || insList[1].payPeriod || "") : "",
"보험2_갱신일": insList[1] ? (insList[1].갱신일 || insList[1].expireDate || "") : "",
"보험2_결제방식": insList[1] ? (insList[1].결제방식 || (insList[1].payment === "카드" || insList[1].payment === "신용카드" ? "카드" : "자동이체")) : "",
"보험2_결제정보": insList[1] ? (insList[1].결제정보 || "") : "",
"보험2_차종": insList[1] ? (insList[1].차종 || "") : "",
"보험2_차량번호": insList[1] ? (insList[1].차량번호 || "") : "",
"보험2_차량용도": insList[1] ? (insList[1].차량용도 || "") : "",
"보험2_운전자특약": insList[1] ? (insList[1].운전자특약 || "") : "",
"보험2_연령특약": insList[1] ? (insList[1].연령특약 || "") : "",
"보험2_다이렉트여부": insList[1] ? (insList[1].다이렉트여부 || "") : "",
"보험3_종류": insList[2] ? (insList[2].보험분류 || insList[2].type || insList[2].보험종류 || "") : "",
"보험3_사명": insList[2] ? (insList[2].보험사명 || insList[2].차_보험사명 || insList[2].company || "") : "",
"보험3_상품명": insList[2] ? (insList[2].상품명 || insList[2].product || "") : "",
"보험3_가입내역": insList[2] ? JSON.stringify(insList[2].가입내역 || insList[2].details || "") : "",
"보험3_체결일": insList[2] ? (insList[2].체결일 || insList[2].책임개시일 || insList[2].date || "") : "",
"보험3_만기일": insList[2] ? (insList[2].만기일 || "") : "",
"보험3_보험료": insList[2] ? (insList[2].보험료 || insList[2].차_보험료 || insList[2].premium || "") : "",
"보험3_결제일": insList[2] ? (insList[2].결제일 || insList[2].payDate || "") : "",
"보험3_납입기간": insList[2] ? (insList[2].납입기간 || insList[2].payPeriod || "") : "",
"보험3_갱신일": insList[2] ? (insList[2].갱신일 || insList[2].expireDate || "") : "",
"보험3_결제방식": insList[2] ? (insList[2].결제방식 || (insList[2].payment === "카드" || insList[2].payment === "신용카드" ? "카드" : "자동이체")) : "",
"보험3_결제정보": insList[2] ? (insList[2].결제정보 || "") : "",
"보험3_차종": insList[2] ? (insList[2].차종 || "") : "",
"보험3_차량번호": insList[2] ? (insList[2].차량번호 || "") : "",
"보험3_차량용도": insList[2] ? (insList[2].차량용도 || "") : "",
"보험3_운전자특약": insList[2] ? (insList[2].운전자특약 || "") : "",
"보험3_연령특약": insList[2] ? (insList[2].연령특약 || "") : "",
"보험3_다이렉트여부": insList[2] ? (insList[2].다이렉트여부 || "") : "",
"보험4_종류": insList[3] ? (insList[3].보험분류 || insList[3].type || insList[3].보험종류 || "") : "",
"보험4_사명": insList[3] ? (insList[3].보험사명 || insList[3].차_보험사명 || insList[3].company || "") : "",
"보험4_상품명": insList[3] ? (insList[3].상품명 || insList[3].product || "") : "",
"보험4_가입내역": insList[3] ? JSON.stringify(insList[3].가입내역 || insList[3].details || "") : "",
"보험4_체결일": insList[3] ? (insList[3].체결일 || insList[3].책임개시일 || insList[3].date || "") : "",
"보험4_만기일": insList[3] ? (insList[3].만기일 || "") : "",
"보험4_보험료": insList[3] ? (insList[3].보험료 || insList[3].차_보험료 || insList[3].premium || "") : "",
"보험4_결제일": insList[3] ? (insList[3].결제일 || insList[3].payDate || "") : "",
"보험4_납입기간": insList[3] ? (insList[3].납입기간 || insList[3].payPeriod || "") : "",
"보험4_갱신일": insList[3] ? (insList[3].갱신일 || insList[3].expireDate || "") : "",
"보험4_결제방식": insList[3] ? (insList[3].결제방식 || (insList[3].payment === "카드" || insList[3].payment === "신용카드" ? "카드" : "자동이체")) : "",
"보험4_결제정보": insList[3] ? (insList[3].결제정보 || "") : "",
"보험4_차종": insList[3] ? (insList[3].차종 || "") : "",
"보험4_차량번호": insList[3] ? (insList[3].차량번호 || "") : "",
"보험4_차량용도": insList[3] ? (insList[3].차량용도 || "") : "",
"보험4_운전자특약": insList[3] ? (insList[3].운전자특약 || "") : "",
"보험4_연령특약": insList[3] ? (insList[3].연령특약 || "") : "",
"보험4_다이렉트여부": insList[3] ? (insList[3].다이렉트여부 || "") : "",
"보험5_종류": insList[4] ? (insList[4].보험분류 || insList[4].type || insList[4].보험종류 || "") : "",
"보험5_사명": insList[4] ? (insList[4].보험사명 || insList[4].차_보험사명 || insList[4].company || "") : "",
"보험5_상품명": insList[4] ? (insList[4].상품명 || insList[4].product || "") : "",
"보험5_가입내역": insList[4] ? JSON.stringify(insList[4].가입내역 || insList[4].details || "") : "",
"보험5_체결일": insList[4] ? (insList[4].체결일 || insList[4].책임개시일 || insList[4].date || "") : "",
"보험5_만기일": insList[4] ? (insList[4].만기일 || "") : "",
"보험5_보험료": insList[4] ? (insList[4].보험료 || insList[4].차_보험료 || insList[4].premium || "") : "",
"보험5_결제일": insList[4] ? (insList[4].결제일 || insList[4].payDate || "") : "",
"보험5_납입기간": insList[4] ? (insList[4].납입기간 || insList[4].payPeriod || "") : "",
"보험5_갱신일": insList[4] ? (insList[4].갱신일 || insList[4].expireDate || "") : "",
"보험5_결제방식": insList[4] ? (insList[4].결제방식 || (insList[4].payment === "카드" || insList[4].payment === "신용카드" ? "카드" : "자동이체")) : "",
"보험5_결제정보": insList[4] ? (insList[4].결제정보 || "") : "",

"알릴의무사항": firstInsAlrilText,
"가족사항": formData.get("가족사항"),
"반려동물": formData.get("반려동물"),
"동물이름": formData.get("동물이름"),
"알릴의무사항": firstInsAlrilText,
"가족사항": formData.get("가족사항"),
"반려동물": formData.get("반려동물"),
"동물이름": formData.get("동물이름"),
"코드": formData.get("코드"),
"운전여부": formData.get("운전여부"),
"차량용도": carTypes.join(","),
"": formData.get(""),
"상세업무": formData.get("상세업무") || "",
"특이사항": formData.get("특이사항") || " ",

"터치인사이트": formData.get("터치인사이트") || ""
};
return await saveClientToServer(clientObj, typeof insList !== 'undefined' ? insList : []);
}
// ==========================================
// 9. 타 서비스(보험금 청구 등) 연동 지원
// ==========================================
function openClaimWithData(custId) {
const client = globalCustomerData.find(c => c["고객번호"] === String(custId));
if (!client) return;
let insComp = "";
let insName = "";
if (Array.isArray(client["가입내역"]) && client["가입내역"].length > 0) {
insComp = client["가입내역"][0].company || "";
insName = client["가입내역"][0].product || "";
} else {
insComp = client["보험사명"] || "";
insName = client["상품명"] || "";
}
const params = new URLSearchParams({
client_name: client["고객명"],
client_phone: client["폰번호"],
client_jumin: client["주민번호"],
insurance_company: insComp,
insurance_name: insName
});
const targetUrl = `claim.html?${params.toString()}`;

if (window.parent && window.parent !== window) {
window.parent.location.href = `/claim?${params.toString()}`;
} else {
window.open(targetUrl, "_blank");
}
}
// ==========================================
// 10. 유틸리티 헬퍼 (주민번호 해독, 오토하이픈 등)
// ==========================================
function formatPhone(val) {
    if (val === '폰없음') return '폰없음';
    if(!val) return "";
    val = val.toString().replace(/[^0-9]/g, '');
    if(val.length === 10 && val.startsWith('10')) val = '0' + val;
    if(val.length === 8) val = '010' + val;
    if(val.length === 11) return val.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    if(val.length === 10) return val.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    if(val.length === 9 && val.startsWith('02')) return val.replace(/(\d{2})(\d{3})(\d{4})/, '$1-$2-$3');
    return val;
}
function formatJumin(val, mask = false) {
    if(!val) return "";
    val = val.toString().replace(/[^0-9]/g, '');
    if(val.length === 13) {
        if(mask) return val.replace(/(\d{6})(\d{1})(\d{6})/, '$1-$2******');
        return val.replace(/(\d{6})(\d{7})/, '$1-$2');
    }
    return val;
}
window.copyJumin = function(val, mask = false) {
    if(!val) return;
    let text = formatJumin(val, mask) || val;
    copyT(text);
};
function formatBizNum(val) {
    if(!val) return "";
    val = val.toString().replace(/[^0-9]/g, '');
    if(val.length === 10) return val.replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3');
    return val;
}
window.autoHyphenPhone = function(el) { el.value = formatPhone(el.value); };
window.autoHyphenJumin = function(el) { 
    let cursor = el.selectionStart;
    let oldVal = el.value;
    let newVal = formatJumin(oldVal);
    if (oldVal !== newVal) {
        el.value = newVal;
        let adj = newVal.length - oldVal.length;
        el.setSelectionRange(cursor + adj, cursor + adj);
    }
};
window.autoHyphenBizNum = function(el) { el.value = formatBizNum(el.value); };
// ==========================================
function parseJumin(target, outputId) {
let val = target.value.replace(/[^0-9]/g, '');

if (val.length >= 7) {
const birthPart = val.substring(0, 6);
const genderDigit = val.charAt(6);
let century = "19";
if (genderDigit === "3" || genderDigit === "4" || genderDigit === "7" || genderDigit === "8") {
century = "20";
} else if (genderDigit === "0" || genderDigit === "9") {
century = "18";
}
const year = century + birthPart.substring(0, 2);
const month = birthPart.substring(2, 4);
const day = birthPart.substring(4, 6);
const now = new Date();
const currentYear = now.getFullYear();
const age = currentYear - parseInt(year) + 1;
document.querySelector("[name='나이']").value = age;
const isMale = (genderDigit === "1" || genderDigit === "3" || genderDigit === "5" || genderDigit === "9");
document.querySelector("[name='성별']").value = isMale ? "남" : "여";
document.querySelector("[name='생일']").value = `${month}-${day}`;
let birthMonth = parseInt(month);
let sangMonth = birthMonth + 6;
if (sangMonth > 12) {
sangMonth -= 12;
}
const sangMonthStr = String(sangMonth).padStart(2, "0");
document.getElementById(outputId).value = `${sangMonthStr}-${day}`;
}
}
function autoHyphen(target) {
let val = target.value.replace(/[^0-9]/g, '');
if(val.length < 4) target.value = val;
else if(val.length < 8) target.value = val.substring(0,3) + '-' + val.substring(3);
else target.value = val.substring(0,3) + '-' + val.substring(3,7) + '-' + val.substring(7,11);
}
function autoHyphenMonth(target) {
let val = target.value.replace(/[^0-9]/g, '');
if(val.length < 5) target.value = val;
else target.value = val.substring(0,4) + '-' + val.substring(4,6);
}
function autoHyphenDate(target) {
let val = target.value.replace(/[^0-9]/g, '');
if (val.length < 5) target.value = val;
else if (val.length < 7) target.value = val.substring(0, 4) + '-' + val.substring(4);
else target.value = val.substring(0, 4) + '-' + val.substring(4, 6) + '-' + val.substring(6, 8);
}
function updateAddButtonsVisibility() {
    let anyChecked = false;
    const entries = document.querySelectorAll('.insurance-entry');
    entries.forEach(entry => {
        const activeTypeSel = entry.querySelector('input[name="보험종류"]');
        const activeType = activeTypeSel ? activeTypeSel.value : '장기보험';
        const activePanel = activeType === '자동차보험' ? entry.querySelector('[id^="ins-car-"]') : entry.querySelector('[id^="ins-longterm-"]');
        const cb = activePanel ? activePanel.querySelector('.diff-cb') : entry.querySelector('.diff-cb');
        
        const specialBtns = entry.querySelector('.special-add-buttons');
        if (cb && cb.checked) {
            anyChecked = true;
            if (specialBtns) specialBtns.style.display = 'flex';
        } else {
            if (specialBtns) specialBtns.style.display = 'none';
        }
    });
    const defaultBtn = document.getElementById('default-add-button');
    if (defaultBtn) defaultBtn.style.display = anyChecked ? 'none' : 'block';
}
function toggleInsuredFields(cb, skipPrompt = false) {
    const box = cb.closest('.insured-person-card');
    box.querySelector('.insured-extra-panel').style.display = cb.checked ? 'block' : 'none';
    box.querySelector('.insured-basic-panel').style.display = cb.checked ? 'none' : 'block';
    
    if (cb.checked) {
        const contractorInput = box.querySelector('input[name="계약자"], input[name="차_계약자"]');
        const insuredInput = box.querySelector('input[name="피보험자"], input[name="차_피보험자"]');
        const customerNameInput = document.querySelector('input[name="고객명"]');
        if (contractorInput && customerNameInput && (!contractorInput.value || contractorInput.dataset.autoSynced === "true")) {
              contractorInput.value = customerNameInput.value.trim();
              contractorInput.dataset.autoSynced = "true";
          }
        if (insuredInput && customerNameInput && insuredInput.value === customerNameInput.value.trim()) {
            insuredInput.value = "";
        }
    }
    
    const entry = cb.closest('.insurance-entry');
    if (cb.checked) {
        if (!skipPrompt) { showCustomConfirm("피보험자를 새로운 관리고객(가족)으로 등록하시겠습니까?\n\n(※ 계약자 등록 이후 피보험자 등록폼이 뜹니다.)", () => { if (entry) entry.dataset.queueFamily = "true"; }, () => { if (entry) entry.dataset.queueFamily = "false"; }); } else { if (entry) entry.dataset.queueFamily = "false"; } } else {
        if (entry) entry.dataset.queueFamily = "false";
    }
    if (typeof updateAddButtonsVisibility === 'function') updateAddButtonsVisibility();
}
function togglePayFields(selectElem) {
    const entry = selectElem.closest(".insurance-entry") || selectElem.parentElement.parentElement.parentElement;
    const cardFields = entry.querySelector(".pay-card-fields");
    const bankFields = entry.querySelector(".pay-bank-fields");
    
    if (cardFields) cardFields.style.display = selectElem.value === "카드" ? "flex" : "none";
    if (bankFields) bankFields.style.display = (selectElem.value === "자동이체" || selectElem.value === "계좌이체" || selectElem.value === "가상계좌") ? "flex" : "none";
}
window.toggleCarPayFields = function(selectElem, insCount) {
    const cardFields = document.getElementById("car-pay-card-" + insCount);
    const bankFields = document.getElementById("car-pay-bank-" + insCount);
    if (cardFields) cardFields.style.display = selectElem.value === "카드" ? "flex" : "none";
    if (bankFields) bankFields.style.display = (selectElem.value === "자동이체" || selectElem.value === "계좌이체" || selectElem.value === "가상계좌") ? "flex" : "none";
};

window.updateCompanyList = function(selectEl, targetId) {
    const val = selectEl.value;
    const target = document.getElementById(targetId);
    if (!target) return;
    target.innerHTML = "<option value=\"\">선택</option>";
    let arr = [];
    if (val === "생명보험") arr = ["삼성생명","한화생명","교보생명","농협생명","메트라이프","KDB생명","DB생명","흥국생명","동양생명","미래에셋생명","라이나생명","푸폰현대생명","신한라이프","ABL생명","IM라이프","KB라이프","IBK연금보험","처브라이프","카디프생명","하나생명","AIA생명"];
    else if (val === "손해보험") arr = ["삼성화재","메리츠화재","DB손해보험","KB손해보험","현대해상","한화손해보험","롯데손해보험","흥국화재","하나손해보험","NH농협손해보험","라이나손보","AIG손보","MG손해보험"];
    arr.forEach(c => {
        target.innerHTML += "<option value=\"" + c + "\">" + c + "</option>";
    });
};

function addAlrilRow(btn) {
    const tbody = btn.closest('.alril-section').querySelector('.alril-tbody');
    const tr = document.createElement('div');
    tr.className = "alril-card";
    tr.style.cssText = "border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; background: #fff; position: relative;";
    tr.innerHTML = `
        <button type="button" onclick="this.closest('.alril-card').remove()" style="position: absolute; right: 8px; top: 8px; background: #fee2e2; color: #ef4444; border: none; border-radius: 4px; font-size: 11px; padding: 4px 8px; font-weight: 700; cursor: pointer;">삭제</button>
        <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
            <div class="input-field" style="margin:0;">
                <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">병명</label>
                <input type="text" name="알릴_병명" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;" placeholder="예: 고혈압">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="input-field" style="margin:0;">
                    <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">치료 시작일</label>
                    <input type="date" name="알릴_시작일" max="9999-12-31" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;">
                </div>
                <div class="input-field" style="margin:0;">
                    <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">치료 종료일</label>
                    <input type="date" name="알릴_종료일" max="9999-12-31" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;">
                </div>
            </div>
            <div class="input-field" style="margin:0;">
                <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">치료 병원</label>
                <input type="text" name="알릴_병원" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;" placeholder="병원명 입력">
            </div>
            <div>
                <label style="font-size:12px; margin-bottom:8px; font-weight:700; display:block;">치료 내용</label>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;"><input type="checkbox" name="알릴_치료">치료</label>
                    <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;"><input type="checkbox" name="알릴_투약">투약</label>
                    <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;"><input type="checkbox" name="알릴_입원">입원</label>
                    <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;"><input type="checkbox" name="알릴_수술">수술</label>
                    <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;"><input type="checkbox" name="알릴_정밀검사">정밀검사</label>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="input-field" style="margin:0;">
                    <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">재발 경험</label>
                    <select name="알릴_재발" style="padding:8px; font-size:13px; width:100%; border:1px solid #cbd5e1; border-radius:4px;">
                        <option value=""></option><option value="O">있음(O)</option><option value="X">없음(X)</option>
                    </select>
                </div>
                <div class="input-field" style="margin:0;">
                    <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">완치 여부</label>
                    <select name="알릴_완치" style="padding:8px; font-size:13px; width:100%; border:1px solid #cbd5e1; border-radius:4px;">
                        <option value=""></option><option value="O">완치(O)</option><option value="X">미완치(X)</option>
                    </select>
                </div>
            </div>
        </div>
    `;
    tbody.appendChild(tr);
}

function removeLastAlrilRow(btn) {
    const tbody = btn.closest('.alril-section').querySelector('.alril-tbody');
    if (tbody.children.length > 0) {
        tbody.lastElementChild.remove();
    }
}

function setInsuranceColumnState(isCollapsed) {
    // TH widths remain completely FIXED to prevent the table from shifting horizontally.
    
    const insContents = document.querySelectorAll('.ins-pool-content');
    insContents.forEach(el => {
        el.style.display = isCollapsed ? 'none' : 'flex';
    });
    
    const collapsedLabels = document.querySelectorAll('.ins-pool-collapsed-label');
    collapsedLabels.forEach(el => {
        el.style.display = isCollapsed ? 'block' : 'none';
    });
}

function checkAnyAccordionOpen() {
    const accs = document.querySelectorAll('.accordion-row');
    for(let i=0; i<accs.length; i++) {
        if(accs[i].style.display !== 'none' && accs[i].style.display !== '') return true;
    }
    return false;
}

function toggleAcc(id, type) {
  const row = document.getElementById(`detail-row-${id}`);
  const main = document.getElementById(`row-${id}`);
  const panes = row.querySelectorAll('.acc-pane');
  const btns = main.querySelectorAll('.detail-btn');
  const target = document.getElementById(`cont-${id}-${type}`);
  
  if (row.style.display !== 'none' && row.style.display !== '' && target.style.display === 'block') { 
      row.style.display = 'none'; 
      btns.forEach(b => b.classList.remove('active')); 
      if (main) main.classList.remove('active-row');
      row.classList.remove('active-row');
  } else { 
      row.style.display = window.innerWidth <= 768 ? 'block' : 'table-row'; 
      panes.forEach(p => p.style.display = 'none'); 
      target.style.display = 'block'; 
      btns.forEach(b => b.classList.remove('active'));
      if (main) main.classList.add('active-row');
      row.classList.add('active-row');
  
  const info1Btn = main.querySelector('.detail-info1-btn');
const info2Btn = main.querySelector('.detail-info2-btn');
const insBtn = main.querySelector('.detail-ins-btn');
const memoBtn = main.querySelector('.detail-memo-btn');
const allBtn = main.querySelector('.detail-all-btn');

if(type === 'info1' && info1Btn) info1Btn.classList.add('active');
else if(type === 'info2' && info2Btn) info2Btn.classList.add('active');
else if(type === 'gaip' && insBtn) insBtn.classList.add('active'); 
else if(type === 'teugi' && memoBtn) memoBtn.classList.add('active'); 
else if(type === 'all' && allBtn) allBtn.classList.add('active');
}
}
function printCustomerReport(rowId) {
const client = globalCustomerData.find(c => String(c["고객번호"]) === String(rowId));
if (!client) {
showCustomAlert(" 오류", "고객 정보를 찾을 수 없습니다.");
return;
}

const getVal = (col) => client[col] || "-";
const jRaw = getVal('주민번호');
let jMask = jRaw;

let insList = getGlobalInsuranceList(client, true);

let insRowsHtml = '';
insList.forEach((ins, idx) => {
let payMethod = ins.결제방식 || ins.차_결제방식 || ins.paymentMethod || ins.payment || "-";
let payInfo = ins.결제정보 || ins.차_결제정보 || ins.payInfo || "";
if (!payInfo && payMethod) {
if (payMethod === "카드" && (ins.카드번호 || ins.차_카드번호)) {
payInfo = `${ins.카드번호 || ins.차_카드번호 || ""} / ${ins.유효기간 || ins.차_유효기간 || ""}`;
} else if ((payMethod === "자동이체" || payMethod === "가상계좌") && (ins.은행명 || ins.차_은행명)) {
payInfo = `${ins.은행명 || ins.차_은행명 || ""} / ${ins.계좌번호 || ins.차_계좌번호 || ""}`;
}
}

let alrilHtml = "";
let alrilRows = ins.알릴의무사항 || ins.alril || [];
if (typeof alrilRows === "string") {
alrilHtml = `<div style="white-space: pre-line; color: #4e5968; font-size:12px;">${alrilRows}</div>`;
} else if (Array.isArray(alrilRows) && alrilRows.length > 0) {
alrilHtml = `
             <table class="print-table" style="margin-top: 5px; font-size: 11px;">
                 <thead>
                     <tr>
                         <th>병명</th>
                         <th>치료기간</th>
                         <th>치료병원</th>
                         <th>치료내용</th>
                         <th style="width: 40px; text-align: center;">재발</th>
                         <th style="width: 40px; text-align: center;">완치</th>
                     </tr>
                 </thead>
                 <tbody>
                     ${alrilRows.map(row => {
                         let checks = [];
                         if (row.treatment) checks.push("치료");
                         if (row.medication) checks.push("투약");
                         if (row.admission) checks.push("입원");
                         if (row.surgery) checks.push("수술");
                         if (row.biopsy) checks.push("정밀");
                         return `
                             <tr>
                                 <td>${row.disease || "-"}</td>
                                 <td>${row.startDate || "-"} ~ ${row.endDate || "-"}</td>
                                 <td>${row.hospital || "-"}</td>
                                 <td>${checks.join(", ") || "-"}</td>
                                 <td style="text-align: center;">${row.relapse || "-"}</td>
                                 <td style="text-align: center;">${row.cured || "-"}</td>
                             </tr>
                         `;
                     }).join("")}
                 </tbody>
             </table>
         `;
} else {
alrilHtml = `<span style="color:#666; font-size:12px;">기록 없음</span>`;
}

insRowsHtml += `
         <div class="print-section" style="margin-top: 15px; border-top: 1px dashed #ccc; padding-top: 15px;">
             <h4 style="margin: 0 0 10px 0; color: #113f67;"> 가입 보험 #${idx + 1}: ${ins.보험사명 || ins.company || ""} / ${ins.상품명 || ins.product || ""}</h4>
             <table class="print-table">
                 <tr>
                     <th width="15%">보장내용</th>
                     <td width="35%">${ins.가입내역 || ins.type || "-"}</td>
                     <th width="15%">피보험자</th>
                     <td width="35%">${ins.피보험자 || ins.insuredName || ins.insured || "-"}</td>
                 </tr>
                 <tr>
                     <th>납기/만기</th>
                     <td>${ins.납입기간 || ins.payPeriod || "-"} / ${ins.갱신일 || ins.expireDate || "-"}</td>
                     <th>보험료</th>
                     <td>${ins.보험료 || ins.premium ? Number(ins.보험료 || ins.premium).toLocaleString() + " 원" : "-"}</td>
                 </tr>
                 <tr>
                     <th>결제정보</th>
                     <td>${payMethod} ${payInfo ? `/ ${payInfo}` : ""}</td>
                     <th>체결일/결제일</th>
                     <td>${ins.체결일 || ins.date || "-"} ${(() => { let isC = ins["보험종류"] === "자동차보험" || ins["보험종류"] === "자동차" || ins["보험분류"] === "자동차" || ins["보험분류"] === "이륜차"; return isC ? "" : " / " + (ins.결제일 || ins.payDate || "-"); })()}</td>
                 </tr>
                 <tr>
                     <th>알릴의무사항</th>
                     <td colspan="3">${alrilHtml}</td>
                 </tr>
             </table>
         </div>
     `;
});

const agentName = sessionStorage.getItem('W_AGENT_NAME') || '';
const printWindow = window.open('', '_blank', 'width=850,height=900');

const htmlContent = `
 <!DOCTYPE html>
 <html>
 <head>
     <meta charset="UTF-8">
     <title>고객 정보 보고서 - ${getVal('고객명')}</title>
     <style>
         body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; color: #333; line-height: 1.5; padding: 20px; }
         .print-header { text-align: center; margin-bottom: 25px; border-bottom: 2px solid #113f67; padding-bottom: 15px; }
         .print-header h1 { margin: 0; color: #113f67; font-size: 26px; }
         .print-header p { margin: 5px 0 0 0; color: #666; font-size: 13px; }
         .print-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
         .print-table th, .print-table td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; font-size: 12px; }
         .print-table th { background-color: #f2f5f8; font-weight: bold; color: #113f67; }
         .section-title { font-size: 15px; font-weight: bold; color: #113f67; margin: 20px 0 8px 0; border-left: 4px solid #113f67; padding-left: 8px; }
         .memo-box { border: 1px solid #ccc; background-color: #fafafa; padding: 12px; font-size: 12px; white-space: pre-wrap; min-height: 60px; }
         @media print {
             body { padding: 0; }
             .no-print { display: none; }
         }
     </style>
 </head>
 <body>
     <div class="print-header">
         <h1>고객 정보 종합 보고서</h1>
         <p>WERACLE CRM | 담당 설계사: ${agentName} | 출력일시: ${new Date().toLocaleString()}</p>
     </div>

     <div class="no-print" style="text-align: right; margin-bottom: 20px;">
         <button onclick="window.print();" style="background:#113f67; color:#fff; border:none; padding:8px 16px; font-size:13px; font-weight:bold; cursor:pointer; border-radius:4px;">프린트 실행</button>
         <button onclick="window.close();" style="background:#f1f5f9; color:#333; border:1px solid #ccc; padding:8px 16px; font-size:13px; font-weight:bold; cursor:pointer; border-radius:4px; margin-left:10px;">창 닫기</button>
     </div>

     <div class="section-title"> 1차 기본 정보</div>
     <table class="print-table">
         <tr>
             <th width="15%">고객번호</th>
             <td width="35%"><strong>${getVal('고객번호')}번</strong></td>
             <th width="15%">고객명</th>
             <td width="35%">${getVal('고객명')} (${getVal('상태')})</td>
         </tr>
         <tr>
             <th>폰번호</th>
             <td>${formatPhone(getVal('폰번호'))}</td>
             <th>주민번호</th>
             <td>${jMask}</td>
         </tr>
         <tr>
             <th>나이/성별</th>
             <td>${client["나이"] ? client["나이"] + "세" : "-"} / ${getVal('성별')}</td>
             <th>직업(상세업무)</th>
             <td>${getVal('직업')} ${getVal('상세업무') !== '-' ? '(' + getVal('상세업무') + ')' : ''}</td>
         </tr>
         <tr>
             <th>생일/상령일</th>
             <td>${getVal('생일')} / ${getVal('상령일')}</td>
             <th>사업여부</th>
             <td>${getVal('사업여부') === 'Y' || getVal('사업여부') === 'on' || getVal('사업여부') === '사업자' ? '사업자' : (getVal('사업여부') || '비사업자(개인)')}</td>
         </tr>
         <tr>
             <th>상세주소</th>
             <td colspan="3">${getVal('주소')}</td>
         </tr>
     </table>

     <div class="section-title"> 터치인사이트</div>
     <table class="print-table">
         <tr>
             <th width="15%">가족사항</th>
             <td width="35%">${getVal('가족사항')}</td>
             <th width="15%">운전여부</th>
             <td width="35%">${getVal('운전여부')} / ${getVal('차량용도') || getVal('차종류')}</td>
         </tr>
         <tr>
             <th>반려동물</th>
             <td>${getVal('반려동물')} ${getVal('동물이름') && getVal('동물이름') !== '-' ? '(' + getVal('동물이름') + ')' : ''}</td>
             <th>동물등록번호</th>
             <td>${getVal('코드')}</td>
         </tr>
         <tr>
             <th>터치인사이트</th>
             <td colspan="3">${getVal('터치인사이트')}</td>
         </tr>
     </table>

     <div class="section-title"> 보험 계약 및 알릴의무 내역 (${insList.length}건)</div>
     ${insRowsHtml}

     <div class="section-title"> 상담 특이사항 / 메모</div>
     <div class="memo-box">${getVal('특이사항') || '기록된 내용이 없습니다.'}</div>

     <script>
         window.onload = function() {
    alert(' 캐시가 정상적으로 지워졌습니다! 이제 버튼들을 눌러보세요.');
             setTimeout(function() {
                 window.print();
             }, 300);
         }
     <\/script>
 </body>
 </html>
 `;

printWindow.document.write(htmlContent);
printWindow.document.close();
}
function fallbackCopyTextToClipboard(text) {
var textArea = document.createElement("textarea");
textArea.value = text;
textArea.style.top = "0";
textArea.style.left = "0";
textArea.style.position = "fixed";
document.body.appendChild(textArea);
textArea.focus();
textArea.select();
try {
document.execCommand('copy');
showCustomAlert("복사 완료", "클립보드에 복사되었습니다.");
} catch (err) {
console.error('Fallback: Oops, unable to copy', err);
}
document.body.removeChild(textArea);
}
function copyCustomerInfo(btn, name, jumin, phone, address, job, mask = false) {
const formattedJumin = formatJumin(jumin, mask) || jumin;
const text = `고객명: ${name}\n주민번호: ${formattedJumin}\n연락처: ${phone}\n주소: ${address}\n직업: ${job}`;
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(() => {
showCustomAlert("복사 완료", mask ? "전달용 정보(마스킹)가 복사되었습니다." : "전달용 정보가 복사되었습니다.");
}).catch(() => {
fallbackCopyTextToClipboard(text);
});
} else {
fallbackCopyTextToClipboard(text);
}
}
function copyT(t) { 
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(t).then(() => {
showCustomAlert("복사 완료", "클립보드에 복사되었습니다.");
}).catch(() => {
fallbackCopyTextToClipboard(t);
});
} else {
fallbackCopyTextToClipboard(t);
}
}
// ==========================================
// 11. 모달 팝업 및 알림 헬퍼 구현
// ==========================================
function showLoading(visible) {
let loader = document.getElementById("crm-loader");
if (!loader && visible) {
loader = document.createElement("div");
loader.id = "crm-loader";
loader.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.7); display:flex; justify-content:center; align-items:center; z-index:11000; font-size:18px; font-weight:800; color:var(--primary);";
loader.innerHTML = `<div><span style="display:inline-block; animation:spin 1s linear infinite; margin-right:10px;">?</span> 동기화 중...</div>`;
loader.innerHTML = `<div><span style="display:inline-block; width: 24px; text-align: center; margin-right:10px;"><span style="display:inline-block; animation:spin 1s linear infinite;"></span></span> 동기화 중...</div>`;
document.body.appendChild(loader);
const style = document.createElement("style");
style.innerHTML = "@keyframes spin { 100% { transform:rotate(360deg); } }";
document.head.appendChild(style);
}
if (loader) {
loader.style.display = visible ? "flex" : "none";
}
}
function openCustomPrompt(mode, title, desc) {
const modal = document.getElementById("customPromptModal");
modal.setAttribute("data-mode", mode);
document.getElementById("promptTitle").innerText = title;
document.getElementById("promptDesc").innerText = desc;
document.getElementById("promptCustIdInput").value = "";

const searchInput = document.getElementById("promptSearchNameInput");
if (searchInput) searchInput.value = "";
const searchResult = document.getElementById("promptSearchResult");
if (searchResult) {
searchResult.innerHTML = "";
searchResult.style.display = "none";
}


      modal.style.display = "flex"; setTimeout(() => modal.classList.add("active"), 10);

}
function closeCustomPrompt() {
document.getElementById("customPromptModal").style.display = "none";
}
function openChangeIdModal() {
document.getElementById("oldIdInput").value = "";
document.getElementById("newIdInput").value = "";
document.getElementById("changeIdModal").style.display = "flex";
}
function openClaimModal() {
showCustomAlert(" 정보", "보험금 청구 기능은 준비 중입니다.");
}
function submitCustomPrompt() {
const modal = document.getElementById("customPromptModal");
const mode = modal.getAttribute("data-mode");
const custId = document.getElementById("promptCustIdInput").value.trim();
if (!custId) {
showCustomAlert(" 경고", "고객 번호를 입력해 주세요.");
return;
}
const client = globalCustomerData.find(c => String(c["고객번호"]) === String(custId));
if (!client) {
showCustomAlert(" 조회 실패", `입력한 고객 번호 [${custId}] 에 해당하는 고객이 없습니다.`);
return;
}
closeCustomPrompt();
if (mode === "edit") {
openEditMode(custId);
} else if (mode === "family") {
loadCustomerForFamily(custId);
} else if (mode === "delete") {
confirmDeleteClient(custId, client["고객명"], client.rowNumber);
}
}
async function deleteCustomerMemo(rowId) {
if (!confirm("정말 이 상담 메모를 삭제하시겠습니까?")) return;

if (!isDemoMode) {
const token = await ensureValidToken();
if (!token) { window.isSubmittingCrm = false;
  return false;
  } 
  }

showLoading(true);
try {
const client = globalCustomerData.find(c => String(c["고객번호"]) === String(rowId));
if (!client) {
throw new Error("고객 정보를 찾을 수 없습니다.");
}

client["특이사항"] = "";

if (isDemoMode) {
const targetIdx = globalCustomerData.findIndex(c => String(c["고객번호"]) === String(rowId));
if (targetIdx !== -1) {
globalCustomerData[targetIdx]["특이사항"] = "";
}
localStorage.setItem("demo_crm_data", JSON.stringify(globalCustomerData));
showCustomAlert(" 메모 삭제", "상담 메모가 삭제되었습니다.");
renderTable();
} else {
if (!client.rowNumber) {
throw new Error("고객의 행 번호를 찾을 수 없습니다.");
}
const rangeStr = `${sheetName}!AE${client.rowNumber}`;
await gapi.client.sheets.spreadsheets.values.update({
spreadsheetId: spreadsheetId,
range: rangeStr,
valueInputOption: "RAW",
resource: { values: [[""]] }
});
showCustomAlert(" 메모 삭제", "상담 메모가 삭제되었습니다.");
await loadCRMData();
}
} catch (err) {
console.error("Memo delete error:", err);
showCustomAlert(" 오류", "메모 삭제 중 오류가 발생했습니다: " + err.message);
} finally { if (!window.isFamilySubmit) { showLoading(false); } }
}
function initClientDatalist() {
let datalist = document.getElementById("client-id-list");
if (!datalist) {
datalist = document.createElement("datalist");
datalist.id = "client-id-list";
document.body.appendChild(datalist);
}

if (!Array.isArray(globalCustomerData)) {
datalist.innerHTML = "";
return;
}

let html = "";
globalCustomerData.forEach(client => {
const id = client["고객번호"];
const name = client["고객명"] || "";
const phone = client["폰번호"] || "";
if (id) {
html += `<option value="${id}">${name} (${phone})</option>`;
}
});
datalist.innerHTML = html;
}
function searchClientIdByName(query, resultContainerId) {
const container = document.getElementById(resultContainerId);
if (!container) return;

if (!query || query.trim() === "") {
container.innerHTML = "";
container.style.display = "none";
return;
}

const results = globalCustomerData.filter(client => {
const name = client["고객명"] || "";
return name.toLowerCase().includes(query.toLowerCase().trim());
});

if (results.length === 0) {
container.innerHTML = "<div style='padding:6px; text-align:center;'>검색 결과가 없습니다.</div>";
container.style.display = "block";
return;
}

let html = "<div style='display:flex; flex-direction:column; gap:4px; max-height: 150px;'>";
results.forEach(client => {
const id = client["고객번호"];
const name = client["고객명"] || "";
const phone = client["폰번호"] || "";
const targetInputId = resultContainerId === "promptSearchResult" ? "promptCustIdInput" : "uploadClientId";

html += `
         <div style="padding: 6px 10px; cursor: pointer; background: #f1f5f9; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;" 
              onmouseover="this.style.background='#e2e8f0'" 
              onmouseout="this.style.background='#f1f5f9'"
              onclick="selectSearchClient('${targetInputId}', '${id}', '${resultContainerId}')">
             <span style="font-weight: 700; color: var(--primary);">${name}</span>
             <span style="font-size: 11px; color: #64748b;">번호: <strong style="color:#4f46e5; font-size:12px;">${id}</strong> (${phone})</span>
         </div>
     `;
});
html += "</div>";

container.innerHTML = html;
container.style.display = "block";
}

function selectSearchClient(targetInputId, id, resultContainerId) {
const input = document.getElementById(targetInputId);
if (input) {
input.value = id;
if (targetInputId === "uploadClientId" && typeof lookupClientForUpload === "function") {
lookupClientForUpload();
}
}

const searchInputId = targetInputId === "promptCustIdInput" ? "promptSearchNameInput" : "uploadSearchNameInput";
const searchInput = document.getElementById(searchInputId);
if (searchInput) searchInput.value = "";

const container = document.getElementById(resultContainerId);
if (container) {
container.innerHTML = "";
container.style.display = "none";
}
}
function confirmDeleteClient(custId, name, rowNumber) {
const modal = document.getElementById("customConfirmModal");
document.getElementById("confirmMessage").innerText = `정말 [${name}] (고객번호: ${custId}) 고객의 모든 정보를 시트에서 완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`;

const okBtn = document.getElementById("confirmOkBtn");
okBtn.onclick = () => {
closeConfirmModal();
executeDelete(rowNumber, name);
};

      modal.style.display = "flex"; setTimeout(() => modal.classList.add("active"), 10);

}
function closeConfirmModal() {
document.getElementById("customConfirmModal").style.display = "none";
}
function showCustomAlert(title, message) {
const modal = document.getElementById("customAlertModal");
document.getElementById("alertTitle").innerText = title;
document.getElementById("alertMessage").innerHTML = message;

      modal.style.display = "flex"; setTimeout(() => modal.classList.add("active"), 10);

}
function closeCustomAlert() {
document.getElementById("customAlertModal").style.display = "none";
}
// ==========================================
// 12. 고객 인사이트 태그 핸들러
// ==========================================
function openInsightModal() {
document.getElementById("insightModal").style.display = "flex";
document.getElementById("insightInsInput").value = "";
document.getElementById("insightHealthInput").value = "";
}
function closeInsightModal() {
document.getElementById("insightModal").style.display = "none";
}
function addInsightTag(inputId) {
const input = document.getElementById(inputId);
let tag = input.value.trim();
if (!tag) return;

if (tag.startsWith("#")) {
tag = tag.substring(1).trim();
}
if (!tag) return;

const category = inputId === "insightInsInput" ? "ins" : "health";
const prefixedTag = `${category}:${tag}`;

if (currentInsights.includes(prefixedTag)) {
alert("이미 등록된 관심 태그입니다.");
return;
}
currentInsights.push(prefixedTag);
input.value = "";
}
function removeInsightTag(tag) {
currentInsights = currentInsights.filter(t => t !== tag);
}
function renderInsightTags() {
const container = document.getElementById("insightTagContainer");
container.innerHTML = "";

if (currentInsights.length === 0) {
container.innerHTML = `<span style="color:var(--text-muted); font-size:12px; padding: 10px 0;">등록된 관심 인사이트 해시태그가 없습니다.</span>`;
return;
}
currentInsights.forEach(tag => {
const span = document.createElement("span");
span.className = "insight-tag";
span.style.cursor = "pointer";

let displayTag = tag;
if (tag.startsWith("ins:")) {
displayTag = tag.substring(4);
span.style.background = "#e0f2fe";
span.style.color = "#0284c7";
span.style.borderColor = "#bae6fd";
} else if (tag.startsWith("health:")) {
displayTag = tag.substring(7);
span.style.background = "#f0fdf4";
span.style.color = "#16a34a";
span.style.borderColor = "#bbf7d0";
}

span.innerHTML = `#${displayTag} <span style="font-size:10px; margin-left:4px;">?</span>`;
span.onclick = () => removeInsightTag(tag);
container.appendChild(span);
});
}
function handleTagInput(e, inputId, category) {
const input = document.getElementById(inputId);
let value = input.value;

// If user typed space
if (value.includes(" ")) {
const parts = value.split(" ");
let remaining = [];
let addedAny = false;

parts.forEach((part, idx) => {
// If it's the last part and doesn't end with space, keep it in input for editing
if (idx === parts.length - 1 && value[value.length - 1] !== " ") {
remaining.push(part);
return;
}

let tag = part.trim();
if (tag.startsWith("#") && tag.length > 1) {
tag = tag.substring(1).trim();
if (tag) {
const prefixedTag = `${category}:${tag}`;
if (!currentInsights.includes(prefixedTag)) {
currentInsights.push(prefixedTag);
addedAny = true;
}
}
} else if (tag) {
remaining.push(part);
}
});

input.value = remaining.join(" ");
if (addedAny) {
}
}
}
function handleTagKeydown(e, inputId, category) {
const input = document.getElementById(inputId);
const value = input.value.trim();

if (e.key === "Enter") {
e.preventDefault(); // Prevent default modal or form submit
if (value) {
let tag = value;
if (tag.startsWith("#")) {
tag = tag.substring(1);
}
tag = tag.trim();
if (tag) {
const prefixedTag = `${category}:${tag}`;
if (!currentInsights.includes(prefixedTag)) {
currentInsights.push(prefixedTag);
} else {
alert("이미 등록된 관심 태그입니다.");
}
}
input.value = "";
}
} else if (e.key === "Backspace" && input.value === "") {
// Remove the last tag of this category
const categoryTags = currentInsights.filter(t => t.startsWith(`${category}:`));
if (categoryTags.length > 0) {
const lastTag = categoryTags[categoryTags.length - 1];
currentInsights = currentInsights.filter(t => t !== lastTag);
}
}
}
// ==========================================
// 13. 서류 업로드 모달 핸들러
// ==========================================
function openUploadModal() {
const idInput = document.getElementById("uploadClientId");
idInput.value = "";
idInput.readOnly = false;
idInput.style.background = "";

const nameInput = document.getElementById("uploadName");
nameInput.value = "";
nameInput.readOnly = false;
nameInput.style.background = "";

const resultDiv = document.getElementById("uploadClientCheckResult");
if (resultDiv) resultDiv.innerHTML = "";
document.getElementById("uploadFile").value = "";

const searchInput = document.getElementById("uploadSearchNameInput");
if (searchInput) searchInput.value = "";
const searchResult = document.getElementById("uploadSearchResult");
if (searchResult) {
searchResult.innerHTML = "";
searchResult.style.display = "none";
}

// 고객번호 찾기 영역 보이기 (일반 업로드)
const searchContainer = document.getElementById("uploadSearchContainer");
if (searchContainer) searchContainer.style.display = "block";

document.getElementById("uploadModal").style.display = "flex";
}
function openUploadModalForClient(custId, name) {
openUploadModal();

// 특정 고객 업로드 버튼으로 들어왔을 때 검색 숨김 및 읽기전용화
const searchContainer = document.getElementById("uploadSearchContainer");
if (searchContainer) searchContainer.style.display = "none";

const idInput = document.getElementById("uploadClientId");
idInput.value = custId;
idInput.readOnly = true;
idInput.style.background = "#f1f5f9";

const nameInput = document.getElementById("uploadName");
nameInput.value = name;
nameInput.readOnly = true;
nameInput.style.background = "#f1f5f9";

lookupClientForUpload();
}
function openUploadModalFromReg() {
const custId = document.getElementById("base-cust-id").value;
const name = document.querySelector("[name='고객명']").value;

if (!name.trim()) {
    alert("고객명을 먼저 입력하신 후 서류 업로드를 진행해주세요.");
    return;
}

openUploadModal();

const searchContainer = document.getElementById("uploadSearchContainer");
if (searchContainer) searchContainer.style.display = "none";

const idInput = document.getElementById("uploadClientId");
idInput.value = custId;
idInput.readOnly = true;
idInput.style.background = "#f1f5f9";

const nameInput = document.getElementById("uploadName");
nameInput.value = name;
nameInput.readOnly = true;
nameInput.style.background = "#f1f5f9";

const resultDiv = document.getElementById("uploadClientCheckResult");
if (resultDiv) {
    resultDiv.innerHTML = `<span style="color:#10b981; font-weight:800;"> 등록 화면의 고객 정보를 가져왔습니다.</span>`;
}
}
function closeUploadModal() {
document.getElementById("uploadModal").style.display = "none";
}
function lookupClientForUpload() {
const custId = document.getElementById("uploadClientId").value.trim();
const nameInput = document.getElementById("uploadName");
const resultDiv = document.getElementById("uploadClientCheckResult");

if (!resultDiv) return;

if (!custId) {
nameInput.value = "";
nameInput.readOnly = false;
nameInput.style.background = "";
resultDiv.innerHTML = "";
return;
}

const client = globalCustomerData.find(c => String(c["고객번호"]).trim() === String(custId));
if (client) {
nameInput.value = client["고객명"] || "";
nameInput.readOnly = true;
nameInput.style.background = "#f1f5f9";
resultDiv.innerHTML = `<span style="color:#10b981; font-weight:800;"> ${client["고객명"]} 고객 정보가 확인되었습니다.</span>`;
} else {
nameInput.value = "";
nameInput.readOnly = false;
nameInput.style.background = "";
resultDiv.innerHTML = `<span style="color:#f59e0b; font-weight:800;"> 미등록 고객번호입니다. 이름을 직접 입력하세요.</span>`;
}
}
async function executeUpload() {
if (window.isUploading) return;
window.isUploading = true;
const custId = document.getElementById("uploadClientId").value.trim();
const name = document.getElementById("uploadName").value.trim();
const files = document.getElementById("uploadFile").files;
if (!custId || !name) {
showCustomAlert(" 입력 누락", "고객번호와 고객명을 입력해주세요.");
window.isUploading = false;
return;
}
if (files.length === 0) {
showCustomAlert(" 파일 누락", "전송할 파일을 1개 이상 선택해주세요.");
window.isUploading = false;
return;
}
showLoading(true);
try {
if (isDemoMode) {
setTimeout(() => {
showLoading(false);
closeUploadModal();
showCustomAlert(" 업로드 완료 (데모)", `데모 모드: 실제 구글 드라이브 업로드는 생략됩니다.`);
}, 1200);
return;
}

// 토큰 유효성 사전 검증
const token = await ensureDriveToken();
if (!token) { window.isSubmittingCrm = false; return; } // 재인증 팝업이 뜬 상태

// 1. '보험서류' 폴더 조회 또는 생성
const rootFolderId = await getOrCreateFolder("보험서류", null, token);

// 2. 그 하위에 '{고객번호}_{고객명}' 폴더 조회 또는 생성
const clientFolderName = `${custId}_${name}`;
const clientFolderId = await getOrCreateFolder(clientFolderName, rootFolderId, token);

// 3. 다중 파일 업로드 루프
for (let i = 0; i < files.length; i++) {
const file = files[i];
const metadata = {
name: file.name,
parents: [clientFolderId]
};

const boundary = '314159265358979323846';
const delimiter = `\r\n--${boundary}\r\n`;
const closeDelimiter = `\r\n--${boundary}--`;

const reader = new FileReader();
const uploadPromise = new Promise((resolve, reject) => {
reader.onload = async function(e) {
const contentType = file.type || 'application/octet-stream';
const base64Data = e.target.result.split(',')[1];
const multipartRequestBody =
delimiter +
'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
JSON.stringify(metadata) +
delimiter +
'Content-Type: ' + contentType + '\r\n' +
'Content-Transfer-Encoding: base64\r\n\r\n' +
base64Data +
closeDelimiter;

try {
const uploadResp = await fetch(
'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
{
method: 'POST',
headers: {
Authorization: `Bearer ${token}`,
'Content-Type': `multipart/related; boundary=${boundary}`
},
body: multipartRequestBody
}
);
if (uploadResp.ok) {
console.log(` 파일 [${file.name}] 업로드 성공`);
resolve(await uploadResp.json());
} else {
const errText = await uploadResp.text();
console.error(` 파일 업로드 실패 [${file.name}] status=${uploadResp.status}`, errText);
if (uploadResp.status === 401 || uploadResp.status === 403) {
reject(new Error(`AUTH_ERROR:${uploadResp.status}:${errText}`));
} else {
reject(new Error(`Upload status ${uploadResp.status}: ${errText}`));
}
}
} catch (err) {
reject(err);
}
};
reader.onerror = (err) => reject(err);
reader.readAsDataURL(file);
});

await uploadPromise;
}

showCustomAlert(" 업로드 완료", `고객 [${name}] 님의 서류 ${files.length}개가 구글 드라이브 '보험서류 > ${clientFolderName}' 폴더에 정상 업로드되었습니다.`);
closeUploadModal();
} catch (err) {
console.error("File upload error:", err);
if (err.message && err.message.startsWith('AUTH_ERROR:')) {
// 권한 에러 → Drive API 활성화 필요 안내
showCustomAlert(" 드라이브 권한 오류", 
"구글 드라이브 업로드 권한이 없습니다.<br><br>" +
"<strong>해결 방법:</strong><br>" +
"① <a href='https://console.cloud.google.com/apis/library/drive.googleapis.com' target='_blank' style='color:#3b82f6;text-decoration:underline;'>Google Cloud Console</a>에서 <strong>Drive API</strong>를 활성화하세요.<br>" +
"② 상단 '구글 시트 연동하기' 버튼으로 재로그인하세요.<br>" +
"③ 다시 업로드해 주세요."
);
invalidateCurrentToken();
} else {
showCustomAlert(" 업로드 실패", `구글 드라이브 업로드 중 오류가 발생했습니다.<br><br><small style='color:#94a3b8;word-break:break-all;'>${err.message || err}</small>`);
}
} finally { window.isUploading = false; if (!window.isFamilySubmit) { showLoading(false); } }
}
// ==========================================
// 14. 데모 모드 초기 목업 데이터 (최초 1회 실행)
// ==========================================
function getInitialMockData() { return []; }
async function ensureDriveToken() {
let token = memoryAccessToken || (function() { try { return localStorage.getItem("g_access_token"); } catch(e) { return null; } })();

if (!token) {
// 토큰 없음 → 구글 연동 안내
if (typeof gapi !== 'undefined' && gapi.client && tokenClient) {
showCustomAlert(" 구글 연동 필요", 
"서류함 기능을 사용하려면 구글 연동이 필요합니다.<br>" +
"잠시 후 구글 로그인 창이 열립니다."
);
setTimeout(() => handleAuthClick(), 1500);
showLoading(false);
return null;
}
showCustomAlert(" 로그인 필요", "구글 시트를 먼저 연동해주세요.");
showLoading(false);
return null;
}

// 토큰 만료만 간단히 체크 (scope는 검증하지 않음 - 실제 API 호출로 판단)
try {
const infoResp = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`);
if (!infoResp.ok) {
console.warn(" Token expired, status:", infoResp.status);
invalidateCurrentToken();
showCustomAlert(" 인증 만료", 
"구글 인증이 만료되었습니다.<br>" +
"상단의 <strong>'구글 시트 연동하기'</strong> 버튼을 클릭해주세요."
);
showLoading(false);
return null;
}
const info = await infoResp.json();
console.log("? Token valid. Scope:", info.scope);
if (typeof gapi !== 'undefined' && gapi.client) {
gapi.client.setToken({ access_token: token });
}
return token;
} catch (e) {
console.error("Token check network error:", e);
if (typeof gapi !== 'undefined' && gapi.client) {
gapi.client.setToken({ access_token: token });
}
return token; // 네트워크 오류시에도 일단 시도
}
}

/**
* 현재 토큰을 무효화하여 다음 인증 시 새 scope로 재동의를 유도합니다.
* 주의: spreadsheetId는 보존하여 기존 시트 연동이 끊기지 않도록 합니다.
*/
function invalidateCurrentToken() {
memoryAccessToken = "";
try { localStorage.removeItem("g_access_token"); } catch(e) {}
if (typeof gapi !== 'undefined' && gapi.client) {
gapi.client.setToken(null);
}
forceConsentOnNextAuth = true;
// UI 업데이트하여 '구글 시트 연동하기' 버튼 표시
try { updateAgentHeaderUI(); } catch(e) {}
console.log(" Token invalidated. 다음 인증 시 drive scope 포함 재동의 예정.");

// Supabase에 저장된 만료된 토큰도 지워줍니다.
if (window.sb && window.currentUser) {
window.sb.from('profiles')
.update({ google_access_token: null })
.eq('id', window.currentUser.id)
.then(() => console.log(" Cleared expired google_access_token in Supabase."))
.catch(e => console.warn("Failed to clear expired token in Supabase:", e));
}
}

async function getOrCreateFolder(folderName, parentId = null, token = null) {
if (!token) {
token = memoryAccessToken || (function() { try { return localStorage.getItem("g_access_token"); } catch(e) { return null; } })();
}
if (!token) {
throw new Error('AUTH_ERROR:NO_TOKEN:구글 로그인이 필요합니다.');
}

let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
if (parentId) {
query += ` and '${parentId}' in parents`;
}

// 1. 기존 폴더 탐색
const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
console.log(` 폴더 검색: "${folderName}" (parent: ${parentId || 'root'})`);
const searchResp = await fetch(searchUrl, {
headers: { Authorization: `Bearer ${token}` }
});
if (!searchResp.ok) {
const errBody = await searchResp.text();
console.error(`? 폴더 검색 실패 [${folderName}] status=${searchResp.status}`, errBody);
if (searchResp.status === 401 || searchResp.status === 403) {
throw new Error(`AUTH_ERROR:${searchResp.status}:${errBody}`);
}
throw new Error(`Folder search failed: status ${searchResp.status} - ${errBody}`);
}
const searchResult = await searchResp.json();
if (searchResult.files && searchResult.files.length > 0) {
console.log(`? 폴더 발견: "${folderName}" → ${searchResult.files[0].id}`);
return searchResult.files[0].id;
}

// 2. 존재하지 않는 경우 폴더 생성
console.log(` 폴더 생성: "${folderName}"`);
const metadata = {
name: folderName,
mimeType: "application/vnd.google-apps.folder"
};
if (parentId) {
metadata.parents = [parentId];
}

const createResp = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
method: 'POST',
headers: {
Authorization: `Bearer ${token}`,
'Content-Type': 'application/json'
},
body: JSON.stringify(metadata)
});
if (!createResp.ok) {
const errBody = await createResp.text();
console.error(`? 폴더 생성 실패 [${folderName}] status=${createResp.status}`, errBody);
if (createResp.status === 401 || createResp.status === 403) {
throw new Error(`AUTH_ERROR:${createResp.status}:${errBody}`);
}
throw new Error(`Folder creation failed: status ${createResp.status} - ${errBody}`);
}
const createResult = await createResp.json();
console.log(`? 폴더 생성 완료: "${folderName}" → ${createResult.id}`);
return createResult.id;
}
async function openDriveFolder(custId, name) {
if (isDemoMode) {
window.open("https://drive.google.com/", "_blank");
return;
}

showLoading(true);
try {
// 토큰 유효성 사전 검증
const token = await ensureDriveToken();
if (!token) { window.isSubmittingCrm = false; return; }

// 1. '보험서류' 폴더 확보
const rootFolderId = await getOrCreateFolder("보험서류", null, token);

// 2. 그 하위에 '{고객번호}_{고객명}' 폴더 확보
const clientFolderName = `${custId}_${name}`;
const clientFolderId = await getOrCreateFolder(clientFolderName, rootFolderId, token);

// 3. 고객 폴더 새 창 열기
window.open(`https://drive.google.com/drive/folders/${clientFolderId}`, "_blank");
} catch (e) {
console.error("Google Drive folder operation failed", e);
if (e.message && e.message.startsWith('AUTH_ERROR:')) {
showCustomAlert(" 드라이브 권한 오류", 
"구글 드라이브 접근 권한이 없습니다.<br><br>" +
"<strong>해결 방법:</strong><br>" +
"① <a href='https://console.cloud.google.com/apis/library/drive.googleapis.com' target='_blank' style='color:#3b82f6;text-decoration:underline;'>Google Cloud Console</a>에서 <strong>Drive API</strong>를 활성화하세요.<br>" +
"② 상단 '구글 시트 연동하기' 버튼으로 재로그인하세요.<br>" +
"③ 다시 시도해 주세요."
);
invalidateCurrentToken();
} else {
showCustomAlert(" 드라이브 오류", `구글 드라이브 폴더 조회/생성에 실패했습니다.<br><br><small style='color:#94a3b8;word-break:break-all;'>${e.message || e}</small>`);
}
} finally { if (!window.isFamilySubmit) { showLoading(false); } }
}

// ==========================================
// PWA Installation Handler
// ==========================================
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
// Prevent Chrome 67 and earlier from automatically showing the prompt
e.preventDefault();
// Stash the event so it can be triggered later.
deferredPrompt = e;
// Update UI to show the install button
const installBtn = document.getElementById('pwaInstallBtn');
if (installBtn) {
installBtn.style.display = 'inline-block';
}
});

// Add click listener to the install button
document.addEventListener('DOMContentLoaded', () => {
const installBtn = document.getElementById('pwaInstallBtn');
if (installBtn) {
installBtn.addEventListener('click', async () => {
if (!deferredPrompt) return;
// Show the install prompt
deferredPrompt.prompt();
// Wait for the user to respond to the prompt
const { outcome } = await deferredPrompt.userChoice;
console.log(`User response to the install prompt: ${outcome}`);
// We've used the prompt, and can't use it again, discard it
deferredPrompt = null;
// Hide the install button
installBtn.style.display = 'none';
});
}
});

window.addEventListener('appinstalled', (evt) => {
console.log('CRM App was successfully installed.');
const installBtn = document.getElementById('pwaInstallBtn');
if (installBtn) {
installBtn.style.display = 'none';
}
});

// ==========================================
// 로그인 화면 연동 (전화번호/이메일/소셜 로그인 지원)
// ==========================================
function switchLoginTab(tab) {
const tabPhone = document.getElementById("tab-phone");
const tabEmail = document.getElementById("tab-email");
const formPhone = document.getElementById("login-form-phone");
const formEmail = document.getElementById("login-form-email");

if (tab === 'phone') {
if (tabPhone) tabPhone.classList.add("active");
if (tabEmail) tabEmail.classList.remove("active");
if (formPhone) formPhone.style.display = "block";
if (formEmail) formEmail.style.display = "none";
} else {
if (tabEmail) tabEmail.classList.add("active");
if (tabPhone) tabPhone.classList.remove("active");
if (formEmail) formEmail.style.display = "block";
if (formPhone) formPhone.style.display = "none";
}
}

async function loginWithSupabaseEmail() {
const emailInput = document.getElementById("userEmailInput");
const passwordInput = document.getElementById("userPasswordInput");
const email = emailInput ? emailInput.value.trim() : "";
const password = passwordInput ? passwordInput.value : "";

if (!email || !password) {
alert("이메일과 비밀번호를 입력해주세요.");
return;
}

showLoading(true);
try {
const { data, error } = await window.sb.auth.signInWithPassword({
email: email,
password: password
});
if (error) throw error;

console.log(" Supabase Email Sign-in successful:", data);
await updateSessionState(data.session);
toggleScreen(true);
if (!isDemoMode) {
loadGoogleLibraries();
} else {
loadCRMData();
}
} catch (err) {
console.error("Supabase Email sign-in failed:", err);
alert("로그인 실패: " + err.message);
} finally { if (!window.isFamilySubmit) { showLoading(false); } }
}

function loginWithKakao() {
window.sb.auth.signInWithOAuth({
provider: 'kakao',
options: {
redirectTo: window.location.origin + window.location.pathname
}
});
}












// --- Task 7, 8: Google Sheet Setup Function ---
window.setupGoogleSheetTab = async function(sheetType) {
if (!window.gapi || !window.gapi.client || !window.gapi.client.sheets) {
if(typeof openCustomAlert === 'function') openCustomAlert('구글 연동이 끊어졌습니다. 안전을 위해 우측 상단 메뉴에서 로그아웃 후 다시 로그인해 주세요.');
else alert('구글 연동이 끊어졌습니다. 안전을 위해 우측 상단 메뉴에서 로그아웃 후 다시 로그인해 주세요.');
return;
}
const tokenStr = (window.memoryAccessToken || localStorage.getItem('g_access_token'));
if (!tokenStr) {
if(typeof openCustomAlert === 'function') openCustomAlert('구글 연동이 끊어졌습니다. 안전을 위해 우측 상단 메뉴에서 로그아웃 후 다시 로그인해 주세요.');
else alert('구글 연동이 끊어졌습니다. 안전을 위해 우측 상단 메뉴에서 로그아웃 후 다시 로그인해 주세요.');
return;
}
const spreadsheetId = (window.spreadsheetId || localStorage.getItem('g_sheet_id'));
if (!spreadsheetId) {
if(typeof openCustomAlert === 'function') openCustomAlert('연동된 구글 시트 ID가 없습니다. 연동을 다시 확인해주세요.');
else alert('연동된 구글 시트 ID가 없습니다. 연동을 다시 확인해주세요.');
return;
}
try {
const response = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: spreadsheetId });
const sheets = response.result.sheets;
const foundSheet = sheets.find(s => s.properties.title === sheetType);

if (foundSheet) {
if(typeof openCustomAlert === 'function') openCustomAlert('세팅이 되있습니다.');
else alert('세팅이 되있습니다.');
return;
}

await gapi.client.sheets.spreadsheets.batchUpdate({
spreadsheetId: spreadsheetId,
resource: { requests: [{ addSheet: { properties: { title: sheetType } } }] }
});

const headers = getCrmHeaders(sheetType);
const endCol = getCrmEndCol(sheetType);
const rangeStr = `${sheetType}!A1:${endCol}1`;

if(headers.length > 0) {
await gapi.client.sheets.spreadsheets.values.update({
spreadsheetId: spreadsheetId,
range: rangeStr,
valueInputOption: 'USER_ENTERED',
resource: { values: [headers] }
});
if(typeof openCustomAlert === 'function') openCustomAlert(sheetType + ' 탭 세팅이 완료되었습니다.');
else alert(sheetType + ' 탭 세팅이 완료되었습니다.');
}
} catch (e) {
console.error(e);
if(typeof openCustomAlert === 'function') openCustomAlert('오류가 발생했습니다: ' + e.message);
else alert('오류가 발생했습니다: ' + e.message);
}
};

window.manualSync = async function() {
showLoading(true);
try {
await loadCRMData();
if (typeof showCustomAlert === 'function') {
showCustomAlert('동기화 완료', '최신 시트 정보를 성공적으로 불러왔습니다.');
} else {
alert('최신 시트 정보를 성공적으로 불러왔습니다.');
}
} catch (e) {
alert('동기화 실패: ' + e.message);
} finally { if (!window.isFamilySubmit) { showLoading(false); } }
};



// ==========================================
// [OVERRIDE] 보험상품 등록 필드 (장기보험/자동차보험 분기 적용)
// ==========================================
function addInsuranceFields(data = null, mode = 'new') {
try {
if (!data && (mode === 'copyPerson' || mode === 'copyProduct' || mode === 'sameProd')) {
    const entries = document.querySelectorAll('.insurance-entry');
    if (entries.length > 0) {
        const lastEntry = entries[entries.length - 1];
        let lastData = {};
        const activeTypeSel = lastEntry.querySelector('input[name="보험종류"]');
        const activeType = activeTypeSel ? activeTypeSel.value : '장기보험';
        lastEntry.querySelectorAll('input, select').forEach(el => {
            if (!el.name) return;
            const inLongterm = el.closest('[id^="ins-longterm-"]');
            const inCar = el.closest('[id^="ins-car-"]');
            if (inLongterm && activeType !== '장기보험') return;
            if (inCar && activeType !== '자동차보험') return;
            lastData[el.name] = el.value;
        });
        const diffCb = lastEntry.querySelector('.diff-cb');
        lastData.differentInsured = diffCb ? diffCb.checked : false;
        const alrilRows = [];
        lastEntry.querySelectorAll('.alril-tbody .alril-card').forEach(tr => {
            const diseaseInput = tr.querySelector('input[name="알릴_병명"]');
            if (diseaseInput && diseaseInput.value.trim() !== "") {
                alrilRows.push({
                    "병명": diseaseInput.value.trim(),
                    "시작일": tr.querySelector('input[name="알릴_시작일"]') ? tr.querySelector('input[name="알릴_시작일"]').value : "",
                    "종료일": tr.querySelector('input[name="알릴_종료일"]') ? tr.querySelector('input[name="알릴_종료일"]').value : "",
                    "병원": tr.querySelector('input[name="알릴_병원"]') ? tr.querySelector('input[name="알릴_병원"]').value : "",
                    "치료": tr.querySelector('input[name="알릴_치료"]') ? tr.querySelector('input[name="알릴_치료"]').checked : false,
                    "투약": tr.querySelector('input[name="알릴_투약"]') ? tr.querySelector('input[name="알릴_투약"]').checked : false,
                    "입원": tr.querySelector('input[name="알릴_입원"]') ? tr.querySelector('input[name="알릴_입원"]').checked : false,
                    "수술": tr.querySelector('input[name="알릴_수술"]') ? tr.querySelector('input[name="알릴_수술"]').checked : false,
                    "정밀검사": tr.querySelector('input[name="알릴_정밀검사"]') ? tr.querySelector('input[name="알릴_정밀검사"]').checked : false,
                    "재발": tr.querySelector('select[name="알릴_재발"]') ? tr.querySelector('select[name="알릴_재발"]').value : "",
                    "완치": tr.querySelector('select[name="알릴_완치"]') ? tr.querySelector('select[name="알릴_완치"]').value : ""
                });
            }
        });
        if (alrilRows.length > 0) { lastData['알릴의무사항'] = alrilRows; }
        
        if (mode === 'copyPerson') {
            lastData['보험분류'] = "";
            lastData['보험사명'] = "";
            lastData['상품명'] = "";
            lastData['가입내역'] = "";
            lastData['증권번호'] = "";
            lastData['보험료'] = "";
            lastData['결제방식'] = "";
            lastData['결제일'] = "";
            lastData['카드번호'] = "";
            lastData['유효기간'] = "";
            lastData['할부개월수'] = "";
            lastData['은행명'] = "";
            lastData['계좌번호'] = "";
            lastData['예금주'] = "";
            lastData['이체일'] = "";
            lastData['체결일'] = "";
            lastData['납입기간'] = "";
            lastData['만기일'] = "";
            lastData['갱신일'] = "";
            lastData['차_보험사명'] = "";
            lastData['차_보험사'] = "";
            lastData['차_상품명'] = "";
            lastData['차_증권번호'] = "";
            lastData['차_보험료'] = "";
            lastData['차_차량번호'] = "";
            lastData['차_결제방식'] = "";
            lastData['차_카드번호'] = "";
            lastData['차_할부개월수'] = "";
            lastData['차_은행명'] = "";
            lastData['차_계좌번호'] = "";
        } else if (mode === 'copyProduct' || mode === 'sameProd') {
            lastData['피보험자'] = "";
            lastData['피보험자생년월일'] = "";
            lastData['피보험자주민번호'] = "";
            lastData['기본피보험자'] = "";
            lastData['계약자'] = "";
        }
        data = lastData;
    }
}
if (data) {
    const isAutoEdit = data.isAuto === true || data.isAuto === 'true' || data['보험종류'] === '자동차보험' || String(data['보험종류'] || '').includes('자동차') || String(data['보험분류'] || '').includes('자동차') || String(data['보험분류'] || '').includes('이륜차');
    if (isAutoEdit) {
        data['보험종류'] = '자동차보험';
    } else if (!data['보험종류']) {
        data['보험종류'] = '장기보험';
    }
}
insCount++;
const area = document.getElementById("insurance-area");
const div = document.createElement("div");
div.className = "form-section-card insurance-entry";
div.id = `ins-card-${insCount}`;

// Determine differentInsured checked state and values
const diffChecked = data && data.differentInsured ? "checked" : "";
const extraDisplay = data && data.differentInsured ? "block" : "none";
const basicDisplay = data && data.differentInsured ? "none" : "block";
const insuredVal = data ? (data.피보험자 || "") : "";
const basicInsuredVal = data ? (data.기본피보험자 || "") : "";
const contractorVal = data ? (data.계약자 || "") : "";

const companyVal = data ? (data.보험사명 || data.company || "") : "";
const productVal = data ? (data.상품명 || data.product || "") : "";
const typeVal = data ? (data.가입내역 || data.type || "") : "";
const dateVal = data ? (data.체결일 || data.date || "") : "";
const premiumVal = data ? (data.보험료 || data.premium || "") : "";
const payDateVal = data ? (data.결제일 || data.payDate || "") : "";
const payPeriodVal = data ? (data.납입기간 || data.payPeriod || "") : "";
const expireDateVal = data ? (data.만기일 || data.expireDate || "") : "";
const renewalDateVal = data ? (data['갱신일'] || data.renewalDate || "") : "";
const paymentMethodVal = data ? (data.결제방식 || data.paymentMethod || data.payment || "") : "";

// Payment details
let cardNoVal = "";
let cardValidVal = "";
let bankNameVal = "";
let accountNoVal = "";
if (data) {
cardNoVal = data.카드번호 || "";
cardValidVal = data.유효기간 || "";
bankNameVal = data.은행명 || "";
accountNoVal = data.계좌번호 || "";
// If paymentInfo was stored as string "Card / Valid" or "Bank / Acc", parse it
const payInfo = data.결제정보 || "";
if (payInfo && payInfo.includes("/")) {
const parts = payInfo.split("/").map(p => p.trim());
if (paymentMethodVal === "카드") {
cardNoVal = cardNoVal || parts[0];
cardValidVal = cardValidVal || parts[1];
} else if (paymentMethodVal === "자동이체") {
bankNameVal = bankNameVal || parts[0];
accountNoVal = accountNoVal || parts[1];
}
}
}

const cardDisplay = paymentMethodVal === "카드" ? "flex" : "none";
const bankDisplay = paymentMethodVal === "자동이체" ? "flex" : "none";

div.innerHTML = `
        <div class="ins-card-header" style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
                <span class="shield-icon" style="font-size:18px;"></span>
                <h5 style="margin:0; font-size:16px; color:#1e293b; white-space:nowrap;">보험 정보 #${insCount}</h5>
                
                <div class="modern-ins-toggle" style="display:inline-flex; background:#f2f4f6; border-radius:4px; padding:4px; margin-left:8px;">
                    <button type="button" onclick="setModernInsType(this, ${insCount}, '장기보험')" style="border:none; border-radius:3px; padding:4px 14px; font-size:12px; font-weight:800; cursor:pointer; transition:all 0.2s; ${data && (data.보험종류 === '자동차보험' || data.보험종류 === '자동차' || data.보험분류 === '자동차' || data.보험분류 === '이륜차') ? 'background:transparent; color:#8b95a1;' : 'background:#ffffff; color:#3b82f6; box-shadow:0 1px 3px rgba(0,0,0,0.1);'}">장기보험</button>
                    <button type="button" onclick="setModernInsType(this, ${insCount}, '자동차보험')" style="border:none; border-radius:3px; padding:4px 14px; font-size:12px; font-weight:800; cursor:pointer; transition:all 0.2s; ${data && (data.보험종류 === '자동차보험' || data.보험종류 === '자동차' || data.보험분류 === '자동차' || data.보험분류 === '이륜차') ? 'background:#ffffff; color:#3b82f6; box-shadow:0 1px 3px rgba(0,0,0,0.1);' : 'background:transparent; color:#8b95a1;'}">자동차보험</button>
                </div>
                <input type="hidden" name="보험종류" id="ins-type-input-${insCount}" value="${data && (data.보험종류 === '자동차보험' || data.보험종류 === '자동차' || data.보험분류 === '자동차' || data.보험분류 === '이륜차') ? '자동차보험' : '장기보험'}">
            </div>
            <button type="button" class="del-ins-btn" onclick="removeInsuranceFields(${insCount})" style="padding:6px 12px; font-size:12px; background:#fee2e2; color:#ef4444; border:none; border-radius:4px; font-weight:700; cursor:pointer; white-space:nowrap;">삭제</button>
        </div>

        <div id="ins-longterm-${insCount}" style="display:${data && (data.보험종류 === '자동차보험' || data.보험종류 === '자동차' || data.보험분류 === '자동차' || data.보험분류 === '이륜차') ? 'none' : 'block'};">
            <div style="display:flex; gap:0; border-bottom: 2px solid #3b82f6; margin-bottom: 15px; margin-top: 5px;">
                <button type="button" class="ins-tab-btn active" onclick="switchInsTab(this, 'basic')" style="padding: 10px 20px; font-size: 13px; font-weight: 700; background: #3b82f6; color: white; border: 1px solid #3b82f6; border-bottom: none; border-radius: 4px 4px 0 0; cursor: pointer;">기본 정보</button>
                <button type="button" class="ins-tab-btn" onclick="switchInsTab(this, 'detail')" style="padding: 10px 20px; font-size: 13px; font-weight: 700; background: #f8fafc; color: #475569; border: 1px solid #cbd5e1; border-bottom: none; border-radius: 4px 4px 0 0; cursor: pointer; margin-left: 2px;">계약 및 납부 상세</button>
                <button type="button" class="ins-tab-btn" onclick="switchInsTab(this, 'alril')" style="padding: 10px 20px; font-size: 13px; font-weight: 700; background: #f8fafc; color: #475569; border: 1px solid #cbd5e1; border-bottom: none; border-radius: 4px 4px 0 0; cursor: pointer; margin-left: 2px;">알릴의무</button>
            </div>

            <div class="ins-tab-content basic-content" style="display:block;">
                
                <div class="insured-person-card" style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px dashed #cbd5e1;">
                    <label class="insured-toggle" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                        <input type="checkbox" class="diff-cb" onchange="toggleInsuredFields(this)" ${diffChecked}>
                        <span class="label-text" style="font-size:13px; font-weight:800; color:#475569;">계약자와 피보험자가 다릅니다.</span>
                    </label>
                    <div class="insured-extra-panel" style="display:${extraDisplay}; margin-top:10px;">
                        <div style="display:flex; gap:10px;">
                            <div class="input-field single" style="flex:1; margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">계약자 성함</label><input type="text" name="계약자" value="${contractorVal}" placeholder="고객명과 다를경우" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                            <div class="input-field single" style="flex:1; margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">피보험자 성함</label><input type="text" name="피보험자" value="${insuredVal}" placeholder="고객명과 다를경우" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                        </div>
                        <div class="input-field single full-width" style="margin-top: 10px;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">피보험자 생년월일/주민번호</label><input type="text" name="피보험자생년월일" value="${data && data.피보험자생년월일 ? data.피보험자생년월일 : ''}" oninput="autoHyphenJumin(this)" maxlength="14" placeholder="예: 880101-1234567" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                    </div>
                    <div class="insured-basic-panel" style="display:${basicDisplay}; margin-top:10px;">
                        <div class="input-field single" style="margin:0; width:200px;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">피보험자 성함</label><input type="text" name="기본피보험자" value="${basicInsuredVal}" placeholder="계약자와 동일시 생략" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; align-items: end; margin-bottom: 10px;">
                    <div class="input-field" style="margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">생/손보 분류</label>
                        <select name="보험분류" onchange="if(typeof updateCompanyList==='function') updateCompanyList(this, 'general-company-'+${insCount});" style="width:100%; padding:8px; border-radius:4px; border:1px solid #cbd5e1; font-size:13px;">
                            <option value="" ${(!data || !data.보험분류) ? "selected" : ""}>선택</option>
                            <option value="생명보험" ${(data && data.보험분류 === "생명보험") ? "selected" : ""}>생명보험</option>
                            <option value="손해보험" ${(data && data.보험분류 === "손해보험") ? "selected" : ""}>손해보험</option>
                        </select>
                    </div>
                    <div class="input-field" style="margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">보험사명</label>
                        <select name="보험사명" id="general-company-${insCount}" style="width:100%; padding:8px; border-radius:4px; border:1px solid #cbd5e1; font-size:13px;">
                            <option value="">선택</option>
                            ${companyVal ? '<option value="' + companyVal + '" selected>' + companyVal + '</option>' : ''}
                        </select>
                    </div>
                    <div class="input-field" style="grid-column: span 2; margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">상품명</label><input type="text" name="상품명" value="${productVal}" placeholder="전체 상품명" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; align-items: end;">
                    <div class="input-field" style="grid-column: span 4; margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">가입내역(특약)</label>
<div class="insurance-pill-container" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:5px;">
    ${['운전자','자동차','바이크','펫보험','주택화재','재물보험','연금','종신','정기','진단비','주요치료비&생활비','수술비','간병&입원','치매장기요양','후유장해','치아','질병상해통합치료비','실손의료보험','종합보험','종합간편'].map(opt => {
        const isChecked = typeVal.includes(opt);
        const bg = isChecked ? '#eff6ff' : '#f1f5f9';
        const bd = isChecked ? '#3b82f6' : '#e2e8f0';
        const col = isChecked ? '#1d4ed8' : '#475569';
        return `<label style="display:flex; align-items:center; gap:4px; font-size:13px; font-weight:700; background:${bg}; padding:6px 12px; border-radius:20px; cursor:pointer; border:1px solid ${bd}; color:${col}; transition:0.2s;"><input type="checkbox" name="가입내역" value="${opt}" ${isChecked ? 'checked' : ''} style="display:none;" onchange="this.parentElement.style.background=this.checked?'#eff6ff':'#f1f5f9'; this.parentElement.style.borderColor=this.checked?'#3b82f6':'#e2e8f0'; this.parentElement.style.color=this.checked?'#1d4ed8':'#475569';"> ${opt}</label>`;
    }).join('')}
</div></div>
                    <div class="input-field" style="grid-column: span 4; margin-top:10px;">
                        <label style="font-size:12px; font-weight: 800; color: var(--primary); margin-bottom:4px; display:block;"> 서류 업로드</label>
                        <button type="button" onclick="openUploadModalFromReg()" style="background: #e2e8f0; color: #1e293b; padding: 8px 12px; border: none; border-radius: 4px; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                             파일 선택 및 업로드
                        </button>
                    </div>
                </div>
            </div>

            <div class="ins-tab-content detail-content" style="display:none;">
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; align-items: end; margin-bottom:15px;">
                    <div class="input-field" style="margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">체결일</label><input type="date" name="체결일" max="9999-12-31" value="${dateVal}" onchange="if(window.calcRenewalDate) calcRenewalDate(this, ${insCount});" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                    <div class="input-field" style="margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">납입기간</label>
                        <select name="납입기간" style="width:100%; padding:8px; border-radius:4px; border:1px solid #cbd5e1; font-size:13px;">
                            <option value="">선택</option>
                            ${['1년납','3년납','5년납','7년납','10년납','15년납','20년납','25년납','30년납'].map(d => '<option value="' + d + '" ' + (payPeriodVal === d ? "selected" : "") + '>' + d + '</option>').join('')}
                        </select>
                    </div>
                    <div class="input-field" style="margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">만기일</label>
                        <select name="만기일" onchange="if(window.calcRenewalDate) calcRenewalDate(this, ${insCount});" style="width:100%; padding:8px; border-radius:4px; border:1px solid #cbd5e1; font-size:13px;">
                            <option value="">선택</option>
                            ${['1년만기','3년만기','5년만기','7년만기','10년만기','15년만기','20년만기','25년만기','30년만기','80세만기','90세만기','100세만기'].map(d => '<option value="' + d + '" ' + (expireDateVal === d ? "selected" : "") + '>' + d + '</option>').join('')}
                        </select>
                    </div>
                    <div class="input-field" style="margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">갱신일</label><input type="date" name="갱신일" max="9999-12-31" id="renewal-date-${insCount}" value="${renewalDateVal}" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                </div>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-top: 5px;">
                    <h6 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 800; color: #1e293b;"> 결제 정보</h6>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; align-items: end;">
                        <div class="input-field" style="margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">보험료(월)</label><input type="text" name="보험료" value="${premiumVal}" placeholder="숫자만" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                        <div class="input-field" style="margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">결제방식</label>
                            <select name="결제방식" class="pay-method-select" onchange="togglePayFields(this)" style="width:100%; padding:8px; border-radius:4px; border:1px solid #cbd5e1; font-size:13px;">
                                <option value="">선택</option>
                                <option value="카드" ${paymentMethodVal === "카드" ? "selected" : ""}>카드</option>
                                <option value="자동이체" ${paymentMethodVal === "자동이체" ? "selected" : ""}>자동이체</option>
                            </select>
                        </div>
                        <div class="input-field" style="margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">결제일</label>
                            <select name="결제일" style="width:100%; padding:8px; border-radius:4px; border:1px solid #cbd5e1; font-size:13px;">
                                <option value="">선택</option>
                                ${['5일','10일','15일','20일','25일'].map(d => '<option value="' + d + '" ' + (payDateVal === d ? "selected" : "") + '>' + d + '</option>').join('')}
                            </select>
                        </div>
                    </div>

                    <div class="input-field dynamic-pay-container" style="margin:10px 0 0 0;">
                        <div class="pay-card-fields" style="display:${cardDisplay}; gap:10px;">
                            <div style="flex:2;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">카드번호</label><input type="text" name="카드번호" value="${cardNoVal}" oninput="formatCardNum(this)" maxlength="19" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                            <div style="flex:1;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">유효기간</label><input type="text" name="유효기간" value="${cardValidVal}" placeholder="MM/YY" maxlength="5" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                        </div>
                        <div class="pay-bank-fields" style="display:${bankDisplay}; gap:10px;">
                            <div style="flex:1;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">은행명</label><input type="text" name="은행명" value="${bankNameVal}" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                            <div style="flex:2;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">계좌번호</label><input type="text" name="계좌번호" value="${accountNoVal}" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="ins-tab-content alril-content" style="display:none;">
                <div class="alril-section">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <span style="font-size: 14px; font-weight: 800; color: #1e293b;"> 알릴의무사항 입력</span>
                        <div style="display:flex; gap: 6px;">
                            <button type="button" class="alril-btn" onclick="addAlrilRow(this)" style="display:block; background: #3b82f6; color: white; border: none; padding:6px 16px; border-radius: 4px; font-size: 12px; cursor: pointer; font-weight: 700; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">+ 행 추가</button>
                        </div>
                    </div>
                    <div class="alril-tbody" style="display: flex; flex-direction: column; gap: 10px;">
                    </div>
                </div>
            </div>
        </div>

        <div id="ins-car-${insCount}" style="display:${data && (data.보험종류 === '자동차보험' || data.보험종류 === '자동차' || data.보험분류 === '자동차' || data.보험분류 === '이륜차') ? 'block' : 'none'};">
            
            <div style="display:flex; gap:0; border-bottom: 2px solid #3b82f6; margin-bottom: 15px; margin-top: 5px;">
                <button type="button" class="ins-tab-btn active" onclick="switchInsTab(this, 'basic')" style="padding: 10px 20px; font-size: 13px; font-weight: 700; background: #3b82f6; color: white; border: 1px solid #3b82f6; border-bottom: none; border-radius: 4px 4px 0 0; cursor: pointer;">기본 정보</button>
                <button type="button" class="ins-tab-btn" onclick="switchInsTab(this, 'detail')" style="padding: 10px 20px; font-size: 13px; font-weight: 700; background: #f8fafc; color: #475569; border: 1px solid #cbd5e1; border-bottom: none; border-radius: 4px 4px 0 0; cursor: pointer; margin-left: 2px;">계약 및 납부 상세</button>
            </div>

            <div class="ins-tab-content basic-content" style="display:block;">
                
                <div class="insured-person-card" style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px dashed #cbd5e1;">
                    <label class="insured-toggle" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                        <input type="checkbox" class="diff-cb" onchange="toggleInsuredFields(this)" ${diffChecked}>
                        <span class="label-text" style="font-size:13px; font-weight:800; color:#475569;">계약자와 피보험자가 다릅니다.</span>
                    </label>
                    <div class="insured-extra-panel" style="display:${extraDisplay}; margin-top:10px;">
                        <div style="display:flex; gap:10px;">
                            <div class="input-field single" style="flex:1; margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">계약자 성함</label><input type="text" name="차_계약자" value="${contractorVal}" placeholder="고객명과 다를경우" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                            <div class="input-field single" style="flex:1; margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">피보험자 성함</label><input type="text" name="차_피보험자" value="${insuredVal}" placeholder="고객명과 다를경우" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                        </div>
                        <div class="input-field single full-width" style="margin-top: 10px;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">피보험자 생년월일/주민번호</label><input type="text" name="차_피보험자생년월일" value="${data && data.차_피보험자생년월일 ? data.차_피보험자생년월일 : ''}" oninput="autoHyphenJumin(this)" maxlength="14" placeholder="예: 880101-1234567" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                    </div>
                    <div class="insured-basic-panel" style="display:${basicDisplay}; margin-top:10px;">
                        <div class="input-field single" style="margin:0; width:200px;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">피보험자 성함</label><input type="text" name="차_기본피보험자" value="${basicInsuredVal}" placeholder="계약자와 동일시 생략" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; align-items: end; margin-bottom: 10px;">
                    <div class="input-field" style="margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">차량용도</label>
                        <select name="차량용도" style="width:100%; padding:8px; border-radius:4px; border:1px solid #cbd5e1; font-size:13px;" onchange="if(window.handleCarUsageChange) window.handleCarUsageChange(this, ${insCount})">
                            <option value="">선택</option>
                            <option value="개인용" ${data && data.차량용도 === "개인용" ? "selected" : ""}>개인용</option>
                            <option value="업무용" ${data && data.차량용도 === "업무용" ? "selected" : ""}>업무용</option>
                            <option value="영업용" ${data && data.차량용도 === "영업용" ? "selected" : ""}>영업용</option>
                            <option value="이륜차" ${data && data.차량용도 === "이륜차" ? "selected" : ""}>이륜차</option>
                        </select>
                    </div>
                    <div class="input-field" style="margin:0;">
                          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                              <label style="font-size:12px; font-weight:700;">보험사명</label>
                              <label id="direct-wrapper-${insCount}" style="display:${data && data.차량용도 === '이륜차' ? 'none' : 'flex'}; align-items:center; gap:4px; font-size:11px; cursor:pointer;">
                                  <input type="checkbox" name="다이렉트여부" value="다이렉트" ${data && (data.차_다이렉트여부 === '다이렉트' || data.차_다이렉트여부 === 'on' || data.다이렉트여부 === '다이렉트' || data.다이렉트여부 === 'on') ? 'checked' : ''}> 다이렉트
                              </label>
                          </div>
                          <select name="차_보험사명" style="width:100%; padding:8px; border-radius:4px; border:1px solid #cbd5e1; font-size:13px;">
                            <option value="">선택</option>
                            <option value="삼성화재" ${data && (data.차_보험사명 === "삼성화재" || data.보험사명 === "삼성화재") ? "selected" : ""}>삼성화재</option>
                            <option value="현대해상" ${data && (data.차_보험사명 === "현대해상" || data.보험사명 === "현대해상") ? "selected" : ""}>현대해상</option>
                            <option value="DB손해보험" ${data && (data.차_보험사명 === "DB손해보험" || data.보험사명 === "DB손해보험") ? "selected" : ""}>DB손해보험</option>
                            <option value="KB손해보험" ${data && (data.차_보험사명 === "KB손해보험" || data.보험사명 === "KB손해보험") ? "selected" : ""}>KB손해보험</option>
                            <option value="메리츠화재" ${data && (data.차_보험사명 === "메리츠화재" || data.보험사명 === "메리츠화재") ? "selected" : ""}>메리츠화재</option>
                        </select>
                    </div>
                    <div class="input-field" style="margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">차량번호</label><input type="text" name="차량번호" value="${data && data.차량번호 ? data.차량번호 : ''}" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                    <div class="input-field" style="margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">차종</label><input type="text" name="차종" value="${data && data.차종 ? data.차종 : ''}" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                </div>
                  <div id="bike-usage-wrapper-${insCount}" style="display:${data && data.차량용도 === '이륜차' ? 'block' : 'none'}; margin-bottom: 10px;">
                      <div class="input-field single full-width" style="margin:0;">
                          <label style="font-size:12px; margin-bottom:6px; font-weight:700; display:block;">이륜차 용도</label>
                          <div style="display:flex; gap:15px; font-size:13px; align-items:center; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc;">
                              <label style="display:flex; align-items:center; gap:4px; cursor:pointer;"><input type="checkbox" name="이륜차용도" value="유상운송 배달용" onclick="if(window.checkOnlyOneBikeUsage) window.checkOnlyOneBikeUsage(this, ${insCount})" ${data && data.이륜차용도 === '유상운송 배달용' ? 'checked' : ''}> 유상운송 배달용</label>
                              <label style="display:flex; align-items:center; gap:4px; cursor:pointer;"><input type="checkbox" name="이륜차용도" value="비유상운송 배달용" onclick="if(window.checkOnlyOneBikeUsage) window.checkOnlyOneBikeUsage(this, ${insCount})" ${data && data.이륜차용도 === '비유상운송 배달용' ? 'checked' : ''}> 비유상운송 배달용</label>
                              <label style="display:flex; align-items:center; gap:4px; cursor:pointer;"><input type="checkbox" name="이륜차용도" value="출퇴근용" onclick="if(window.checkOnlyOneBikeUsage) window.checkOnlyOneBikeUsage(this, ${insCount})" ${data && data.이륜차용도 === '출퇴근용' ? 'checked' : ''}> 출퇴근용</label>
                          </div>
                      </div>
                  </div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; align-items: start;">
                      <div class="input-field" style="margin:0;">
    <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">운전자특약</label>
    ${(() => {
        const savedVal = data && data.운전자특약 ? data.운전자특약 : "";
        const match = savedVal.match(/^(.*?)(?:\s*\[(.*?)\])?$/);
        const selVal = match ? match[1].trim() : "";
        const memoVal = match && match[2] ? match[2].trim() : "";
        const needsMemo = ['기명피보험자 및 지정 1인 한정', '가족 및 형제·자매 한정', '가족 및 지정 1인 한정', '누구나 운전 (기본 / 제한 없음)'].includes(selVal);
        return `
            <input type="hidden" name="운전자특약" id="driver-hidden-${insCount}" value="${savedVal}">
            <select name="운전자특약_선택" onchange="window.handleDriverMemo(this, ${insCount})" style="width:100%; padding:8px; border-radius:4px; border:1px solid #cbd5e1; font-size:13px;">
                <option value="">선택</option>
                <option value="본인(기명피보험자) 1인 한정" ${selVal === "본인(기명피보험자) 1인 한정" ? "selected" : ""}>본인(기명피보험자) 1인 한정</option>
                <option value="기명피보험자 및 지정 1인 한정" ${selVal === "기명피보험자 및 지정 1인 한정" ? "selected" : ""}>기명피보험자 및 지정 1인 한정</option>
                <option value="부부 한정" ${selVal === "부부 한정" ? "selected" : ""}>부부 한정</option>
                <option value="가족 한정" ${selVal === "가족 한정" ? "selected" : ""}>가족 한정</option>
                <option value="가족 및 형제·자매 한정" ${selVal === "가족 및 형제·자매 한정" ? "selected" : ""}>가족 및 형제·자매 한정</option>
                <option value="가족 및 지정 1인 한정" ${selVal === "가족 및 지정 1인 한정" ? "selected" : ""}>가족 및 지정 1인 한정</option>
                <option value="누구나 운전 (기본 / 제한 없음)" ${selVal === "누구나 운전 (기본 / 제한 없음)" ? "selected" : ""}>누구나 운전 (기본 / 제한 없음)</option>
            </select>
            <textarea id="driver-memo-${insCount}" placeholder="등록 고객 외 고객정보 입력 (이름, 주민/연락처 등)" oninput="window.updateDriverHidden(${insCount})" style="margin-top:8px; width:100%; padding:8px; border-radius:4px; border:1px solid #cbd5e1; font-size:12px; resize:vertical; min-height:50px; display:${needsMemo ? 'block' : 'none'};">${memoVal}</textarea>
        `;
    })()}
</div>
                    <div class="input-field" style="margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">연령특약</label>
                        <select name="연령특약" style="width:100%; padding:8px; border-radius:4px; border:1px solid #cbd5e1; font-size:13px;">
                              <option value="">선택</option>
                              <option value="전연령" ${data && data.연령특약 === "전연령" ? "selected" : ""}>전연령</option>
                              <option value="만21세이상" ${data && data.연령특약 === "만21세이상" ? "selected" : ""}>만21세이상</option>
                              <option value="만22세이상" ${data && data.연령특약 === "만22세이상" ? "selected" : ""}>만22세이상</option>
                              <option value="만24세이상" ${data && data.연령특약 === "만24세이상" ? "selected" : ""}>만24세이상</option>
                              <option value="만26세이상" ${data && data.연령특약 === "만26세이상" ? "selected" : ""}>만26세이상</option>
                              <option value="만28세이상" ${data && data.연령특약 === "만28세이상" ? "selected" : ""}>만28세이상</option>
                              <option value="만30세이상" ${data && data.연령특약 === "만30세이상" ? "selected" : ""}>만30세이상</option>
                              <option value="만35세이상" ${data && data.연령특약 === "만35세이상" ? "selected" : ""}>만35세이상</option>
                              <option value="만43세이상" ${data && data.연령특약 === "만43세이상" ? "selected" : ""}>만43세이상</option>
                              <option value="만48세이상" ${data && data.연령특약 === "만48세이상" ? "selected" : ""}>만48세이상</option>
                          </select>
                    </div>
                </div>
            </div>

            <div class="ins-tab-content detail-content" style="display:none;">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; align-items: end; margin-bottom:15px;">
                    <div class="input-field" style="margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">책임개시일</label><input type="date" name="책임개시일" max="9999-12-31" value="${data && data.책임개시일 ? data.책임개시일 : (data && data.체결일 ? data.체결일 : '')}" onchange="calcRenewalDate(this, 'renewal-${insCount}')" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                    <div class="input-field" style="margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">갱신일</label><input type="date" name="갱신일" max="9999-12-31" id="renewal-${insCount}" value="${data && data.갱신일 ? data.갱신일 : ''}" readonly style="padding:8px; font-size:13px; background:#f8fafc; color:#64748b; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                </div>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-top: 5px; margin-bottom: 15px;">
                    <h6 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 800; color: #1e293b;"> 결제 정보</h6>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; align-items: end;">
                          <div class="input-field" style="margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">보험료</label><input type="text" name="차_보험료" value="${data && data.차_보험료 ? data.차_보험료 : (data && data.보험료 ? data.보험료 : '')}" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                          <div class="input-field" style="margin:0;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">결제방식</label>
                              <select name="차_결제방식" class="pay-method-select" onchange="toggleCarPayFields(this, ${insCount})" style="width:100%; padding:8px; border-radius:4px; border:1px solid #cbd5e1; font-size:13px;">
                                  <option value="">선택</option>
                                  <option value="카드" ${data && data.차_결제방식 === "카드" ? "selected" : ""}>카드</option>
                                  <option value="가상계좌" ${data && data.차_결제방식 === "가상계좌" ? "selected" : ""}>가상계좌</option>
                              </select>
                          </div>
                      </div>
                    
                    <div class="input-field dynamic-pay-container" style="margin:10px 0 0 0;">
                        <div class="pay-card-fields" id="car-pay-card-${insCount}" style="display:${data && data.차_결제방식 === '카드' ? 'flex' : 'none'}; gap:10px;">
                            <div style="flex:2;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">카드번호</label><input type="text" name="차_카드번호" value="${data && data.차_카드번호 ? data.차_카드번호 : ''}" oninput="autoHyphenCard(this)" maxlength="19" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                            <div style="flex:1;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">유효기간</label><input type="text" name="차_유효기간" value="${data && data.차_유효기간 ? data.차_유효기간 : ''}" oninput="autoFormatCardValid(this)" placeholder="YY.MM" maxlength="5" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                        </div>
                        <div class="pay-bank-fields" id="car-pay-bank-${insCount}" style="display:${data && data.차_결제방식 === '가상계좌' ? 'flex' : 'none'}; gap:10px;">
                            <div style="flex:1;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">은행명</label><input type="text" name="차_은행명" value="${data && data.차_은행명 ? data.차_은행명 : ''}" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                            <div style="flex:2;"><label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">계좌번호</label><input type="text" name="차_계좌번호" value="${data && data.차_계좌번호 ? data.차_계좌번호 : ''}" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;"></div>
                        </div>
                    </div>
                </div>
                
                <div class="input-field" style="margin-top:10px;">
                    <label style="font-size:12px; font-weight: 800; color: var(--primary); margin-bottom:4px; display:block;"> 서류 업로드</label>
                    <button type="button" onclick="openUploadModalFromReg()" style="background: #e2e8f0; color: #1e293b; padding: 8px 12px; border: none; border-radius: 4px; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                         파일 선택 및 업로드
                    </button>
                </div>
            </div>
        </div>

`;
area.appendChild(div);
    const cards = document.querySelectorAll('.insurance-entry');
    cards.forEach((entry, index) => {
        const titleEl = entry.querySelector('h5');
        if (titleEl) {
            titleEl.innerHTML = '보험 정보 #' + (index + 1);
        }
    });

// Add alril rows
    const tbody = div.querySelector(".alril-tbody");
    if (data && Array.isArray(data.알릴의무사항) && data.알릴의무사항.length > 0) {
        data.알릴의무사항.forEach(row => {
            const tr = document.createElement("div");
            tr.className = "alril-card";
            tr.style.cssText = "border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; background: #fff; position: relative;";
            
            let diseaseVal = row.disease || row["병명"] || "";
              let startDateVal = row.startDate || row["시작일"] || "";
              let endDateVal = row.endDate || row["종료일"] || "";
              let hospitalVal = row.hospital || row["병원"] || "";
              let treatChecked = (row.treatment || row["치료"]) ? "checked" : "";
              let medChecked = (row.medication || row["투약"]) ? "checked" : "";
              let admChecked = (row.admission || row["입원"]) ? "checked" : "";
              let surgChecked = (row.surgery || row["수술"]) ? "checked" : "";
              let biopsyChecked = (row.biopsy || row["정밀검사"]) ? "checked" : "";
              let recur = row.recurrence || row.relapse || row["재발"] || "";
              let recurCheckedO = recur === "O" ? "selected" : "";
              let recurCheckedX = recur === "X" ? "selected" : "";
              let curedVal = row.cured || row["완치"] || "";
              let curedCheckedO = curedVal === "O" ? "selected" : "";
              let curedCheckedX = curedVal === "X" ? "selected" : "";
            
            tr.innerHTML = `
        <button type="button" onclick="this.closest('.alril-card').remove()" style="position: absolute; right: 8px; top: 8px; background: #fee2e2; color: #ef4444; border: none; border-radius: 4px; font-size: 11px; padding: 4px 8px; font-weight: 700; cursor: pointer;">삭제</button>
        <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
            <div class="input-field" style="margin:0;">
                <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">병명</label>
                <input type="text" name="알릴_병명" value="${diseaseVal}" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;" placeholder="예: 고혈압">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="input-field" style="margin:0;">
                    <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">치료 시작일</label>
                    <input type="date" name="알릴_시작일" max="9999-12-31" value="${startDateVal}" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;">
                </div>
                <div class="input-field" style="margin:0;">
                    <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">치료 종료일</label>
                    <input type="date" name="알릴_종료일" max="9999-12-31" value="${endDateVal}" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;">
                </div>
            </div>
            <div class="input-field" style="margin:0;">
                <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">치료 병원</label>
                <input type="text" name="알릴_병원" value="${hospitalVal}" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;" placeholder="병원명 입력">
            </div>
            <div>
                <label style="font-size:12px; margin-bottom:8px; font-weight:700; display:block;">치료 내용</label>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;"><input type="checkbox" name="알릴_치료" ${treatChecked}>치료</label>
                    <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;"><input type="checkbox" name="알릴_투약" ${medChecked}>투약</label>
                    <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;"><input type="checkbox" name="알릴_입원" ${admChecked}>입원</label>
                    <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;"><input type="checkbox" name="알릴_수술" ${surgChecked}>수술</label>
                    <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;"><input type="checkbox" name="알릴_정밀검사" ${biopsyChecked}>정밀검사</label>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="input-field" style="margin:0;">
                    <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">재발 경험</label>
                    <select name="알릴_재발" style="padding:8px; font-size:13px; width:100%; border:1px solid #cbd5e1; border-radius:4px;">
                        <option value=""></option><option value="O" ${recurCheckedO}>있음(O)</option><option value="X" ${recurCheckedX}>없음(X)</option>
                    </select>
                </div>
                <div class="input-field" style="margin:0;">
                    <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">완치 여부</label>
                    <select name="알릴_완치" style="padding:8px; font-size:13px; width:100%; border:1px solid #cbd5e1; border-radius:4px;">
                        <option value=""></option><option value="O" ${curedCheckedO}>완치(O)</option><option value="X" ${curedCheckedX}>미완치(X)</option>
                    </select>
                </div>
            </div>
        </div>
`;
            tbody.appendChild(tr);
        });
    } else {
        const tr = document.createElement("div");
        tr.className = "alril-card";
        tr.style.cssText = "border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; background: #fff; position: relative;";
        tr.innerHTML = `
        <button type="button" onclick="this.closest('.alril-card').remove()" style="position: absolute; right: 8px; top: 8px; background: #fee2e2; color: #ef4444; border: none; border-radius: 4px; font-size: 11px; padding: 4px 8px; font-weight: 700; cursor: pointer;">삭제</button>
        <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
            <div class="input-field" style="margin:0;">
                <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">병명</label>
                <input type="text" name="알릴_병명" value="" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;" placeholder="예: 고혈압">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="input-field" style="margin:0;">
                    <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">치료 시작일</label>
                    <input type="date" name="알릴_시작일" max="9999-12-31" value="" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;">
                </div>
                <div class="input-field" style="margin:0;">
                    <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">치료 종료일</label>
                    <input type="date" name="알릴_종료일" max="9999-12-31" value="" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;">
                </div>
            </div>
            <div class="input-field" style="margin:0;">
                <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">치료 병원</label>
                <input type="text" name="알릴_병원" value="" style="padding:8px; font-size:13px; width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:4px;" placeholder="병원명 입력">
            </div>
            <div>
                <label style="font-size:12px; margin-bottom:8px; font-weight:700; display:block;">치료 내용</label>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;"><input type="checkbox" name="알릴_치료">치료</label>
                    <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;"><input type="checkbox" name="알릴_투약">투약</label>
                    <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;"><input type="checkbox" name="알릴_입원">입원</label>
                    <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;"><input type="checkbox" name="알릴_수술">수술</label>
                    <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;"><input type="checkbox" name="알릴_정밀검사">정밀검사</label>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="input-field" style="margin:0;">
                    <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">재발 경험</label>
                    <select name="알릴_재발" style="padding:8px; font-size:13px; width:100%; border:1px solid #cbd5e1; border-radius:4px;">
                        <option value=""></option><option value="O">있음(O)</option><option value="X">없음(X)</option>
                    </select>
                </div>
                <div class="input-field" style="margin:0;">
                    <label style="font-size:12px; margin-bottom:4px; font-weight:700; display:block;">완치 여부</label>
                    <select name="알릴_완치" style="padding:8px; font-size:13px; width:100%; border:1px solid #cbd5e1; border-radius:4px;">
                        <option value=""></option><option value="O">완치(O)</option><option value="X">미완치(X)</option>
                    </select>
                </div>
            </div>
        </div>
`;
        tbody.appendChild(tr);
    }

    setTimeout(() => {
        const typeSelect = document.querySelector(`#ins-card-${insCount} select[name="보험분류"]`);
        if (typeSelect && typeSelect.value) {
            if (window.handleGeneralLifeNonLifeChange) {
                window.handleGeneralLifeNonLifeChange(typeSelect, insCount, companyVal);
            }
        }
    }, 10);

} catch (e) {
console.error("addInsuranceFields error:", e);
alert("보험 상품 추가 중 오류 발생: " + e.message);
}
}

// ===== CRM_TEST Insurance UI Toggle Helpers =====


function togglePhone(cb) {
    const input = document.getElementById('base-phone');
    if (cb.checked) {
        input.value = '폰 없음';
        input.readOnly = true;
        input.style.background = '#f1f5f9';
    } else {
        input.value = '';
        input.readOnly = false;
        input.style.background = '#ffffff';
    }
}
function toggleAddress(cb) {
    const input = document.getElementById('base-address');
    if (cb.checked) {
        input.value = '';
        input.focus();
    }
}
function formatCardNum(target) {
    let val = target.value.replace(/[^0-9]/g, '');
    let res = '';
    for(let i=0; i<val.length; i++) {
        if(i>0 && i%4===0) res += '-';
        res += val[i];
    }
    target.value = res;
}
function formatExpiry(target) {
    let val = target.value.replace(/[^0-9]/g, '');
    if(val.length >= 3) {
        target.value = val.substring(0,2) + '/' + val.substring(2,4);
    } else {
        target.value = val;
    }
}
function showCustomConfirm(message, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0'; overlay.style.left = '0'; overlay.style.width = '100%'; overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.display = 'flex'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '99999';
    
    const box = document.createElement('div');
    box.style.background = '#fff';
    box.style.padding = '24px';
    box.style.borderRadius = '12px';
    box.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
    box.style.maxWidth = '360px';
    box.style.width = '90%';
    box.style.textAlign = 'center';
    
    const text = document.createElement('div');
    text.style.fontSize = '16px';
    text.style.color = '#1e293b';
    text.style.marginBottom = '20px';
    text.style.lineHeight = '1.5';
    text.innerHTML = message.replace(/\n/g, '<br>');
    
    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '10px';
    btnContainer.style.justifyContent = 'center';
    
    const btnCancel = document.createElement('button');
    btnCancel.innerText = '아니오';
    btnCancel.style.padding = '10px 20px';
    btnCancel.style.border = '1px solid #cbd5e1';
    btnCancel.style.background = '#f8fafc';
    btnCancel.style.borderRadius = '6px';
    btnCancel.style.cursor = 'pointer';
    btnCancel.style.flex = '1';
    btnCancel.onclick = () => { document.body.removeChild(overlay); if(onCancel) onCancel(); };
    
    const btnConfirm = document.createElement('button');
    btnConfirm.innerText = '네';
    btnConfirm.style.padding = '10px 20px';
    btnConfirm.style.border = 'none';
    btnConfirm.style.background = 'var(--primary)';
    btnConfirm.style.color = '#fff';
    btnConfirm.style.borderRadius = '6px';
    btnConfirm.style.cursor = 'pointer';
    btnConfirm.style.flex = '1';
    btnConfirm.onclick = () => { document.body.removeChild(overlay); if(onConfirm) onConfirm(); };
    
    btnContainer.appendChild(btnCancel);
    btnContainer.appendChild(btnConfirm);
    box.appendChild(text);
    box.appendChild(btnContainer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}
function showCustomAlertCallback(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0'; overlay.style.left = '0'; overlay.style.width = '100%'; overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.display = 'flex'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '99999';
    
    const box = document.createElement('div');
    box.style.background = '#fff';
    box.style.padding = '24px';
    box.style.borderRadius = '12px';
    box.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
    box.style.maxWidth = '360px';
    box.style.width = '90%';
    box.style.textAlign = 'center';
    
    const text = document.createElement('div');
    text.style.fontSize = '16px';
    text.style.color = '#1e293b';
    text.style.marginBottom = '20px';
    text.style.lineHeight = '1.5';
    text.innerHTML = message.replace(/\n/g, '<br>');
    
    const btnConfirm = document.createElement('button');
    btnConfirm.innerText = '확인';
    btnConfirm.style.padding = '10px 30px';
    btnConfirm.style.border = 'none';
    btnConfirm.style.background = 'var(--primary)';
    btnConfirm.style.color = '#fff';
    btnConfirm.style.borderRadius = '6px';
    btnConfirm.style.cursor = 'pointer';
    btnConfirm.onclick = () => { document.body.removeChild(overlay); if(onConfirm) onConfirm(); };
    
    box.appendChild(text);
    box.appendChild(btnConfirm);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

window.updateSangryungFromBirth = function(el) {
    const val = el.value.replace(/[^0-9-]/g, '');
    const parts = val.split('-');
    if (parts.length >= 2) {
        let month = parseInt(parts[0], 10);
        let day = parts[1].substring(0,2);
        if (!isNaN(month)) {
            let sangMonth = month + 6;
            if (sangMonth > 12) sangMonth -= 12;
            const sangMonthStr = String(sangMonth).padStart(2, "0");
            const sangInput = document.getElementById('base-sangryung');
            if (sangInput) {
                sangInput.value = sangMonthStr + "-" + day;
            }
        }
    }
};

















// Safely inject +피보험자추가(동일상품) button
function injectSameProdBtn() {
    const btns = document.querySelectorAll('button');
    btns.forEach(btn => {
        if (btn.innerText && btn.innerText.trim() === "+ 상품추가") {
            if (btn.nextElementSibling && btn.nextElementSibling.innerText && btn.nextElementSibling.innerText.includes("동일상품")) return;
            const newBtn = document.createElement("button");
            newBtn.type = "button";
            newBtn.className = btn.className;
            newBtn.innerText = "+ 피보험자추가(동일상품)";
            newBtn.style.cssText = btn.style.cssText;
            newBtn.style.marginLeft = "8px";
            newBtn.style.background = "#3b82f6";
            newBtn.style.color = "#fff";
            newBtn.style.border = "none";
            newBtn.style.padding = "6px 12px";
            newBtn.style.borderRadius = "4px";
            newBtn.style.cursor = "pointer";
            newBtn.style.fontSize = "13px";
            newBtn.onclick = () => {
                if (typeof addInsuranceFields === 'function') {
                    addInsuranceFields(null, 'sameProd');
                }
            };
            btn.parentNode.insertBefore(newBtn, btn.nextSibling);
        }
    });
}
document.addEventListener("DOMContentLoaded", injectSameProdBtn);
const sameProdObserver = new MutationObserver((mutations) => {
    for (let mut of mutations) {
        if (mut.addedNodes.length > 0) {
            let shouldInject = false;
            for (let node of mut.addedNodes) {
                if (node.nodeType === 1 && (node.tagName === 'BUTTON' || node.querySelector('button'))) {
                    shouldInject = true;
                    break;
                }
            }
            if (shouldInject) injectSameProdBtn();
        }
    }
});
sameProdObserver.observe(document.body, { childList: true, subtree: true });
window.checkDuplicate = function(inputEl, type) {
    if (typeof window.isEditMode !== 'undefined' && window.isEditMode) return;
    if (!inputEl.value) return;
    const val = inputEl.value.replace(/[^0-9]/g, '');
    if (val.length < 6) return;

    const dup = globalCustomerData.find(c => {
        if (type === 'phone') {
            const cPhone = (c["폰번호"] || c["대표자폰번호"] || c["대표자핸드폰"] || "").replace(/[^0-9]/g, '');
            return cPhone === val;
        } else if (type === 'jumin') {
            const cJumin = (c["주민번호"] || c["대표자 생일"] || "").replace(/[^0-9]/g, '');
            return cJumin === val;
        }
        return false;
    });

    if (dup) {
        const dupId = dup["고객번호"] || dup["사업자번호"] || "번호없음";
        const dupName = dup["고객명"] || dup["상호명(법인명)"] || dup["대표자명"] || "이름없음";
        showCustomAlert(" 중복 알림", "이미 등록된 고객입니다.\n(고객번호: " + dupId + " / 이름: " + dupName + ")");
        inputEl.value = "";
    }
};

// --- Added for Card format ---
function autoHyphenCard(target) {
    let cursor = target.selectionStart;
    let oldVal = target.value;
    let val = oldVal.replace(/[^0-9]/g, '');
    let newVal = val;
    if (val.length < 5) newVal = val;
    else if (val.length < 9) newVal = val.substring(0, 4) + '-' + val.substring(4);
    else if (val.length < 13) newVal = val.substring(0, 4) + '-' + val.substring(4, 8) + '-' + val.substring(8);
    else newVal = val.substring(0, 4) + '-' + val.substring(4, 8) + '-' + val.substring(8, 12) + '-' + val.substring(12, 16);
    
    if (oldVal !== newVal) {
        target.value = newVal;
        let adj = newVal.length - oldVal.length;
        target.setSelectionRange(cursor + adj, cursor + adj);
    }
}
function autoFormatCardValid(target) {
    let cursor = target.selectionStart;
    let oldVal = target.value;
    let val = oldVal.replace(/[^0-9]/g, '');
    let newVal = val;
    if (val.length >= 3) newVal = val.substring(0,2) + '.' + val.substring(2,4);
    
    if (oldVal !== newVal) {
        target.value = newVal;
        let adj = newVal.length - oldVal.length;
        target.setSelectionRange(cursor + adj, cursor + adj);
    }
}
function autoHyphenExpiry(target) {
    let val = target.value.replace(/[^0-9]/g, '');
    if (val.length < 3) target.value = val;
    else target.value = val.substring(0, 2) + '/' + val.substring(2, 4);
}
window.copyInsuranceFromEntry = function(targetInsCount, mode) {
    const entry = document.getElementById("ins-card-" + targetInsCount);
    if (!entry) return;
    
    let lastData = {};
    const activeTypeSel = entry.querySelector('input[name="보험종류"]');
    const activeType = activeTypeSel ? activeTypeSel.value : '장기보험';
    entry.querySelectorAll('input, select, textarea').forEach(el => {
        if (!el.name) return;
        const inLongterm = el.closest('[id^="ins-longterm-"]');
        const inCar = el.closest('[id^="ins-car-"]');
        if (inLongterm && activeType !== '장기보험') return;
        if (inCar && activeType !== '자동차보험') return;
        if (el.type === 'checkbox') {
            if (el.checked) {
                if (lastData[el.name]) lastData[el.name] = lastData[el.name] + ", " + el.value;
                else lastData[el.name] = el.value;
            }
        } else if (el.type === 'radio') {
            if (el.checked) lastData[el.name] = el.value;
        } else {
            lastData[el.name] = el.value;
        }
    });
    const diffCb = entry.querySelector('.diff-cb');
    lastData.differentInsured = diffCb ? diffCb.checked : false;
    
    const alrilRows = [];
    entry.querySelectorAll('.alril-tbody .alril-card').forEach(tr => {
        const diseaseInput = tr.querySelector('input[name="알릴_병명"]');
        if (diseaseInput && diseaseInput.value.trim() !== "") {
            alrilRows.push({
                "병명": diseaseInput.value.trim(),
                "시작일": tr.querySelector('input[name="알릴_시작일"]') ? tr.querySelector('input[name="알릴_시작일"]').value : "",
                "종료일": tr.querySelector('input[name="알릴_종료일"]') ? tr.querySelector('input[name="알릴_종료일"]').value : "",
                "병원": tr.querySelector('input[name="알릴_병원"]') ? tr.querySelector('input[name="알릴_병원"]').value : "",
                "치료": tr.querySelector('input[name="알릴_치료"]') ? tr.querySelector('input[name="알릴_치료"]').checked : false,
                "투약": tr.querySelector('input[name="알릴_투약"]') ? tr.querySelector('input[name="알릴_투약"]').checked : false,
                "입원": tr.querySelector('input[name="알릴_입원"]') ? tr.querySelector('input[name="알릴_입원"]').checked : false,
                "수술": tr.querySelector('input[name="알릴_수술"]') ? tr.querySelector('input[name="알릴_수술"]').checked : false,
                "정밀검사": tr.querySelector('input[name="알릴_정밀검사"]') ? tr.querySelector('input[name="알릴_정밀검사"]').checked : false,
                "재발": tr.querySelector('select[name="알릴_재발"]') ? tr.querySelector('select[name="알릴_재발"]').value : "",
                "완치": tr.querySelector('select[name="알릴_완치"]') ? tr.querySelector('select[name="알릴_완치"]').value : ""
            });
        }
    });
    if (alrilRows.length > 0) { lastData['알릴의무사항'] = alrilRows; }
    
    if (mode === 'copyPerson') {
        lastData['보험분류'] = "";
        lastData['보험사명'] = "";
        lastData['상품명'] = "";
        lastData['가입내역'] = "";
        lastData['증권번호'] = "";
        lastData['보험료'] = "";
        lastData['결제방식'] = "";
        lastData['결제일'] = "";
        lastData['카드번호'] = "";
        lastData['유효기간'] = "";
        lastData['은행명'] = "";
        lastData['계좌번호'] = "";
        lastData['예금주'] = "";
        lastData['이체일'] = "";
        lastData['체결일'] = "";
        lastData['납입기간'] = "";
        lastData['만기일'] = "";
        lastData['갱신일'] = "";
        lastData['차_보험사명'] = "";
        lastData['차_보험사'] = "";
        lastData['차_상품명'] = "";
        lastData['차_증권번호'] = "";
        lastData['차_보험료'] = "";
        lastData['차_결제방식'] = "";
        lastData['차_카드번호'] = "";
        lastData['차_은행명'] = "";
        lastData['차_계좌번호'] = "";
        lastData['차종'] = "";
        lastData['차량번호'] = "";
        lastData['차량용도'] = "";
        lastData['책임개시일'] = "";
        lastData['차_유효기간'] = "";
        lastData['운전자특약'] = "";
        lastData['연령특약'] = "";
        lastData['다이렉트여부'] = "";
    } else if (mode === 'copyProduct') {
        lastData['피보험자'] = "";
        lastData['피보험자생년월일'] = "";
        lastData['피보험자주민번호'] = "";
        lastData['기본피보험자'] = "";
        lastData['차_피보험자'] = "";
        lastData['차_피보험자생년월일'] = "";
        lastData['차_기본피보험자'] = "";
    }
    
    addInsuranceFields(lastData, mode);
};
function toggleInCellAcc(mId, section) {
    const paneIds = ['info1', 'info2', 'memo'];
    paneIds.forEach(p => {
        const el = document.getElementById(`incell-${mId}-${p}`);
        if (el) {
            if (p === section) {
                el.style.display = el.style.display === 'none' ? 'block' : 'none';
            } else {
                el.style.display = 'none';
            }
        }
    });
}
window.toggleInCellAcc = toggleInCellAcc;


































// --- New Dashboard JS Logic ---
window.currentPipeline = '';
window.currentInsightQuick = '';

window.setPipelineFilter = function(val, btn) {
    document.querySelectorAll('.db-pipeline-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    window.currentPipeline = val;
    if(typeof filterCrmTable === 'function') filterCrmTable();
};

window.toggleInsightQuick = function(val, btn) {
    const isActive = btn.classList.contains('active');
    // Remove active from all quick buttons except birth/sang
    document.querySelectorAll('.db-sq-btn').forEach(b => {
        if(b.id !== 'btn-birth' && b.id !== 'btn-sang') {
            b.classList.remove('active');
            b.style.background = '';
            b.style.color = '';
            b.style.borderColor = '';
        }
    });
    
    if (isActive) {
        window.currentInsightQuick = '';
    } else {
        btn.classList.add('active');
        btn.classList.add('active'); // CSS handles active state
        
        
        window.currentInsightQuick = val;
    }
    if(typeof filterCrmTable === 'function') filterCrmTable();
};

window.resetAllFilters = function() {
    window.currentPipeline = '';
    window.currentInsightQuick = '';
    activeFilters.search = '';
    activeFilters.quick = null;
    
    document.querySelectorAll('.db-filter-select').forEach(s => s.value = '');
    document.querySelectorAll('.db-pipeline-btn').forEach(b => b.classList.remove('active'));
    const pAll = document.getElementById('pipe-all'); if(pAll) pAll.classList.add('active');
    
    document.querySelectorAll('.db-sq-btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = '';
        b.style.color = '';
        b.style.borderColor = '';
    });
    
    if(typeof filterCrmTable === 'function') filterCrmTable();
};

window.setPipelineDropdown = function(val) {
    window.currentPipeline = val;
    if(typeof filterCrmTable === 'function') filterCrmTable();
};



window.setPipelineBtn = function(val, btn) {
    document.querySelectorAll('.db-pipe-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    window.currentPipeline = val;
    if(typeof filterCrmTable === 'function') filterCrmTable();
};




















window.switchInsTab = function(btn, tabName) {
    const wrapper = btn.closest('div[id^="ins-longterm-"], div[id^="ins-car-"]');
    if (!wrapper) return;
    
    // Update tabs
    const tabs = wrapper.querySelectorAll('.ins-tab-btn');
    tabs.forEach(t => {
        t.classList.remove('active');
        t.style.background = '#e2e8f0';
        t.style.color = '#475569';
    });
    btn.classList.add('active');
    btn.style.background = '#3b82f6';
    btn.style.color = 'white';
    
    // Update content
    wrapper.querySelectorAll('.ins-tab-content').forEach(c => {
        c.style.display = 'none';
    });
    const targetContent = wrapper.querySelector('.' + tabName + '-content');
    if (targetContent) {
        targetContent.style.display = 'block';
    }
};

window.setModernInsType = function(btn, insCount, type) {
    const wrapper = btn.closest('.modern-ins-toggle');
    wrapper.querySelectorAll('button').forEach(b => {
        b.style.background = 'transparent';
        b.style.color = '#8b95a1';
        b.style.boxShadow = 'none';
    });
    btn.style.background = 'white';
    btn.style.color = '#3b82f6';
    btn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    
    const input = document.getElementById('ins-type-input-' + insCount);
    if (input) input.value = type;
    
        const longtermDiv = document.getElementById('ins-longterm-' + insCount);
    const carDiv = document.getElementById('ins-car-' + insCount);
    
    if (type === '장기보험') {
        if (longtermDiv) longtermDiv.style.display = 'block';
        if (carDiv) carDiv.style.display = 'none';
    } else {
        if (longtermDiv) longtermDiv.style.display = 'none';
        if (carDiv) carDiv.style.display = 'block';
    }
};

window.openDynamicList = function(type, param) {
    if (typeof window.resetAllFilters === 'function') {
        window.resetAllFilters();
    } else {
        window.currentPipeline = '';
        window.currentInsightQuick = '';
        if(typeof activeFilters !== 'undefined') {
            activeFilters.search = '';
            activeFilters.quick = null;
        }
    }
    
    let title = '\uC804\uCCB4 \uACE0\uAC1D \uB9AC\uC2A4\uD2B8';
    if (type === 'pipeline') {
        window.currentPipeline = param;
        title = param + ' \uACE0\uAC1D \uB9AC\uC2A4\uD2B8';
    } else if (type === 'birthday') {
        activeFilters.quick = 'birth';
        title = '\uD83C\uDF82 \uB2F9\uC6D4 \uC0DD\uC77C \uACE0\uAC1D';
    } else if (type === 'sangryung') {
        activeFilters.quick = 'sang';
        title = '\uD83D\uDEE1\uFE0F \uC0C1\uB839\uC77C \uB3C4\uB798 \uACE0\uAC1D (1\uAC1C\uC6D4 \uB0B4)';
    } else if (type === 'expiry') {
        activeFilters.quick = 'expiry';
        title = '\uD83D\uDCCB \uBCF4\uD5D8 \uB9CC\uAE30 \uB3C4\uB798 \uACE0\uAC1D (1\uAC1C\uC6D4 \uB0B4)';
    } else if (type === 'insight') {
        window.currentInsightQuick = param;
        title = '#' + param + ' \uD130\uCE58\uC778\uC0AC\uC774\uD2B8 \uACE0\uAC1D';
    }
    
    if (typeof renderTable === 'function') renderTable();
    
    if (typeof openMasterModal === 'function') {
        openMasterModal();
    } else {
        const masterModal = document.getElementById('masterModal');
        if (masterModal) masterModal.classList.add('active');
    }
    
    const mTitle = document.querySelector('#masterModal .modal-title');
    if (mTitle) {
        const memCountEl = document.getElementById('memberCount');
        const count = memCountEl ? memCountEl.innerText : '0';
        mTitle.innerHTML = '<i class="fa-solid fa-users" style="color:var(--primary);"></i> ' + title + ' <span id="memberCount" style="font-size:16px; margin-left:10px; color:#64748b;">' + count + '</span>';
    }
};

window.updateDashboardStats = function() {
    if (!window.globalCustomerData || window.globalCustomerData.length === 0) return;
    
    let cntGwan = 0, cntSang = 0, cntChe = 0, cntJip = 0;
    const now = new Date();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    let cntBirth = 0, cntSangryung = 0;
    
    window.globalCustomerData.forEach(client => {
        const cStatus = client['\uC0C1\uD0DC'] || '';
        if (cStatus.includes('\uAD00\uC2EC')) cntGwan++;
        else if (cStatus.includes('\uC0C1\uB2F4')) cntSang++;
        else if (cStatus.includes('\uACC4\uC57D') || cStatus.includes('\uCCB4\uACB0') || cStatus.includes('\uC720\uC9C0')) cntChe++;
        else if (cStatus.includes('\uC9D1\uC911')) cntJip++;
        
        const birth = String(client['\uC0DD\uC77C'] || '');
        if (birth.includes('-' + currentMonth + '-') || birth.substring(2,4) === currentMonth || birth.substring(4,6) === currentMonth || birth.startsWith(currentMonth)) cntBirth++;
        
        const sang = String(client['\uC0C1\uB839\uC77C'] || '');
        if (sang.includes('-' + currentMonth + '-') || sang.substring(2,4) === currentMonth || sang.substring(4,6) === currentMonth || sang.startsWith(currentMonth)) cntSangryung++;
    });
    
    const pCards = document.querySelectorAll('.pipeline-card .pipe-count');
    if (pCards.length >= 4) {
        pCards[0].innerText = cntGwan;
        pCards[1].innerText = cntSang;
        pCards[2].innerText = cntChe;
        pCards[3].innerText = cntJip;
    }
    
    const birthBtn = document.querySelector('div[onclick="openDynamicList(\'birthday\')"]');
    if (birthBtn) {
        const countSpan = birthBtn.querySelector('.badge');
        if (countSpan) countSpan.innerText = cntBirth + '\uBA85';
    }
    
    const sangBtn = document.querySelector('div[onclick="openDynamicList(\'sangryung\')"]');
    if (sangBtn) {
        const countSpan = sangBtn.querySelector('.badge');
        if (countSpan) countSpan.innerText = cntSangryung + '\uBA85';
    }
};

const oldReload = window.reloadGlobalData;
if (typeof oldReload === 'function' && !window.dashboardHooked) {
    window.dashboardHooked = true;
    window.reloadGlobalData = async function() {
        await oldReload();
        window.updateDashboardStats();
    };
}
window.renderProfileModal = function(mId) {
    if (!window.globalCustomerData) return;
    const client = globalCustomerData.find(c => (c['\uACE0\uAC1D\uBC88\uD638'] || c['\uC0AC\uC5C5\uC790\uBC88\uD638']) === String(mId));
    if (!client) return;

    const idStr = String(mId);
    const rootId = idStr.split('-')[0];
    const household = window.globalCustomerData.filter(c => {
        const cid = String(c['\uACE0\uAC1D\uBC88\uD638'] || c['\uC0AC\uC5C5\uC790\uBC88\uD638'] || '').trim();
        return cid === rootId || cid.startsWith(rootId + '-');
    }).sort((a,b) => {
        const aId = String(a['\uACE0\uAC1D\uBC88\uD638']||a['\uC0AC\uC5C5\uC790\uBC88\uD638']||'').trim();
        const bId = String(b['\uACE0\uAC1D\uBC88\uD638']||b['\uC0AC\uC5C5\uC790\uBC88\uD638']||'').trim();
        if (aId === rootId) return -1;
        if (bId === rootId) return 1;
        return aId.localeCompare(bId);
    });

    const navEl = document.getElementById('pfFamilyNav');
    if (navEl) {
        let navHtml = '<div style="color: #64748b; font-size: 13px; font-weight: 800; margin-right: 12px;"><i class="fa-solid fa-people-roof" style="margin-right:6px;"></i>\uAC00\uC871 \uD504\uB85C\uD544</div>';
        household.forEach((fam) => {
            const famId = String(fam['\uACE0\uAC1D\uBC88\uD638'] || fam['\uC0AC\uC5C5\uC790\uBC88\uD638']);
            const famName = fam['\uACE0\uAC1D\uBA85'] || fam['\uB300\uD45C\uC790\uBA85'] || '\uC774\uB984\uC5C6\uC74C';
            const isRoot = (famId === rootId);
            const relation = isRoot ? '\uBCF8\uC778' : (fam['\uAC00\uC871\uAD00\uACC4'] || '\uAC00\uC871');
            const label = isRoot ? '\uBCF8\uC778 (' + famName + ')' : relation + ' (' + famName + ')';
            
            const isActive = (famId === idStr);
            if (isActive) {
                navHtml += '<button class="family-tab active" style="background:var(--primary); color:white; border:none; padding:10px 20px; border-radius:8px; font-weight:700; cursor:default; font-size: 14px; box-shadow: 0 2px 4px rgba(59,130,246,0.2);">' +
                    (isRoot ? '<i class="fa-solid fa-star" style="color:#fcd34d; margin-right:6px;"></i> ' : '') + label +
                '</button>';
            } else {
                navHtml += '<button class="family-tab" style="background:white; color:#475569; border:1px solid #cbd5e1; padding:10px 20px; border-radius:8px; font-weight:700; cursor:pointer; font-size: 14px; transition: 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.02);" ' +
                    'onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'white\'" ' +
                    'onclick="renderProfileModal(\'' + famId + '\')">' +
                    (isRoot ? '<i class="fa-solid fa-star" style="color:#fcd34d; margin-right:6px;"></i> ' : '') + label +
                '</button>';
            }
        });
        navEl.innerHTML = navHtml;
    }

    const name = client['\uACE0\uAC1D\uBA85'] || client['\uB300\uD45C\uC790\uBA85'] || '\uC774\uB984\uC5C6\uC74C';
    const status = client['\uC0C1\uD0DC'] || '-';
    const isVip = status.includes('VIP');
    document.getElementById('pfAvatar').innerText = name.charAt(0);
    
    let nameHtml = name;
    if (isVip) nameHtml += ' <span class="pill vip" style="background: #dbeafe; color: #1d4ed8; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 800;">VIP</span>';
    document.getElementById('pfName').innerHTML = nameHtml;

    const age = client['\uB098\uC774'] ? '(' + client['\uB098\uC774'] + '\uC138)' : '';
    const birth = client['\uC0DD\uC77C'] || '-';
    const gender = client['\uC131\uBCC4'] || '-';
    const genderIcon = gender.includes('\uC5EC') ? 'fa-venus' : (gender.includes('\uB0A8') ? 'fa-mars' : 'fa-user');
    let phone = client['\uD3F0\uBC88\uD638'] || '-';
    if (typeof window.formatPhone === 'function' && phone !== '-') {
        phone = window.formatPhone(phone);
    }
    
    document.getElementById('pfMeta').innerHTML = 
        '<span><i class="fa-solid fa-cake-candles"></i> ' + birth + ' ' + age + '</span>' +
        '<span><i class="fa-solid ' + genderIcon + '"></i> ' + gender + '</span>' +
        '<span><i class="fa-solid fa-phone"></i> ' + phone + '</span>';

    document.getElementById('pfSummary').innerHTML = 
        '<div class="summary-item" style="display: flex; flex-direction: column; gap: 6px;">' +
            '<span class="summary-label" style="font-size: 13px; color: #94a3b8; font-weight: 700;">\uC9C1\uC5C5</span>' +
            '<span class="summary-value" style="font-size: 15px; font-weight: 800; color: #1e293b;">' + (client['\uC9C1\uC5C5'] || '-') + '</span>' +
        '</div>' +
        '<div class="summary-item" style="display: flex; flex-direction: column; gap: 6px;">' +
            '<span class="summary-label" style="font-size: 13px; color: #94a3b8; font-weight: 700;">\uAC70\uC8FC\uC9C0</span>' +
            '<span class="summary-value" style="font-size: 15px; font-weight: 800; color: #1e293b;">' + (client['\uC8FC\uC18C'] || '-') + '</span>' +
        '</div>' +
        '<div class="summary-item" style="display: flex; flex-direction: column; gap: 6px;">' +
            '<span class="summary-label" style="font-size: 13px; color: #94a3b8; font-weight: 700;">\uAC00\uC871\uAD00\uACC4</span>' +
            '<span class="summary-value" style="font-size: 15px; font-weight: 800; color: #1e293b;">' + (household.length > 1 ? household.length + '\uBA85 \uB4F1\uB85D\uB428' : '\uBCF8\uC778') + '</span>' +
        '</div>' +
        '<div class="summary-item" style="display: flex; flex-direction: column; gap: 6px;">' +
            '<span class="summary-label" style="font-size: 13px; color: #94a3b8; font-weight: 700;">\uC0C1\uD0DC</span>' +
            '<span class="summary-value" style="font-size: 15px; font-weight: 800; color: #1e293b;">' + status + '</span>' +
        '</div>';

    document.getElementById('pfEditBtn').setAttribute('onclick', 'closeProfile(); if(typeof openEditMode === \'function\') openEditMode(\'' + idStr + '\', \'edit\');');

    let insightHtml = '';
    if (Array.isArray(client['\uD130\uCE58\uC778\uC0AC\uC774\uD2B8'])) {
        client['\uD130\uCE58\uC778\uC0AC\uC774\uD2B8'].forEach(tag => {
            const t = tag.trim();
            if (t) insightHtml += '<span style="background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 700;">#' + t + '</span>';
        });
    } else if (typeof client['\uD130\uCE58\uC778\uC0AC\uC774\uD2B8'] === 'string' && client['\uD130\uCE58\uC778\uC0AC\uC774\uD2B8']) {
        const raw = client['\uD130\uCE58\uC778\uC0AC\uC774\uD2B8'].trim();
        if (raw.startsWith('[') && raw.endsWith(']')) {
            try {
                const arr = JSON.parse(raw);
                arr.forEach(t => {
                    insightHtml += '<span style="background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 700;">#' + t + '</span>';
                });
            } catch(e) {}
        } else {
            insightHtml += '<span style="background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 700;">#' + raw + '</span>';
        }
    }
    if (!insightHtml) insightHtml = '<span style="color:#94a3b8; font-size:13px;">\uB4F1\uB85D\uB41C \uC778\uC0AC\uC774\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</span>';
    document.getElementById('pfTouchList').innerHTML = insightHtml;

    document.getElementById('pfMemo').innerText = client['\uD2B9\uC774\uC0AC\uD56D'] || '\uB4F1\uB85D\uB41C \uC8FC\uC694 \uBA54\uBAA8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.';

    let insHtml = '<h3 style="margin-top: 0; font-size: 18px; font-weight: 800; display: flex; align-items: center; gap: 10px;"><i class="fa-solid fa-file-contract" style="color:var(--primary);"></i> \uAC00\uC785\uB41C \uBCF4\uD5D8 \uBAA9\uB85D</h3>';
    const insList = client['\uBCF4\uD5D8\uAC00\uC785\uB9AC\uC2A4\uD2B8'] || [];
    if (insList.length === 0) {
        insHtml += '<div style="margin-top:16px; padding:20px; text-align:center; color:#94a3b8; border:1px dashed #cbd5e1; border-radius:12px;">\uB4F1\uB85D\uB41C \uBCF4\uD5D8 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>';
    } else {
        insList.forEach(ins => {
            const comp = ins['\uBCF4\uD5D8\uC0AC\uBA85'] || ins['\uCC28_\uBCF4\uD5D8\uC0AC\uBA85'] || '-';
            let pName = ins['\uC0C1\uD488\uBA85'] || ins['\uCC28_\uC0C1\uD488\uBA85'] || '\uBCF4\uD5D8\uBA85 \uC5C6\uC74C';
              if (ins['\uBCF4\uD5D8\uC885\uB958'] === '\uC790\uB3D9\uCC28\uBCF4\uD5D8') {
                  pName = (ins['\uCC28\uB7C9\uC6A9\uB3C4'] === '\uC774\uB95C\uCC28') ? '\uC774\uB95C\uCC28' : '\uC790\uB3D9\uCC28';
              }
            const premium = ins['\uBCF4\uD5D8\uB8CC'] || ins['premium'] ? Number(ins['\uBCF4\uD5D8\uB8CC'] || ins['premium']).toLocaleString() + '\uC6D0' : '-';
            
            let pMethod = ins['결제방식'] || ins['차_결제방식'] || ins['\uACB0\uC81C\uBCF9\uC2DD'] || "-";
            let payMethod = ins['\uACB0\uC81C\uC815\uBCF4'] || ins['결제정보'] || ins['차_결제정보'] || ins['payMethod'] || '-';
            
            if (pMethod === "카드") {
                const cardNo = ins['카드번호'] || ins['차_카드번호'] || "";
                const cardValid = ins['유효기간'] || ins['차_유효기간'] || "";
                if (cardNo || cardValid) {
                    payMethod = `${cardNo} / ${cardValid}`;
                } else if (payMethod && !payMethod.includes('/')) {
                    if (ins['유효기간']) payMethod += ` / ${ins['유효기간']}`;
                }
            } else if (pMethod === "자동이체" || pMethod === "가상계좌") {
                const bankName = ins['은행명'] || ins['차_은행명'] || "";
                const accountNo = ins['계좌번호'] || ins['차_계좌번호'] || "";
                if (bankName || accountNo) {
                    payMethod = `${bankName} / ${accountNo}`;
                }
            }

            const dateStr = ins['\uB9CC\uAE30\uC77C\uC790'] || ins['\uB9CC\uAE30\uC77C'] || ins['\uAC31\uC2E0\uC77C\uC790'] || ins['\uAC31\uC2E0\uC77C'] || '\uB0A0\uC9DC\uC5C6\uC74C';
            const badgeStr = ins['\uBCF4\uD5D8\uC885\uB958'] === '\uC790\uB3D9\uCC28' ? dateStr + ' \uAC31\uC2E0' : (ins['\uCCB4\uACB0\uC77C'] || '-') + ' \uAC00\uC785';

            const detailFields = [];
              if (ins['\uBCF4\uD5D8\uC885\uB958'] === '\uC790\uB3D9\uCC28' || ins['\uBCF4\uD5D8\uC885\uB958'] === '\uC790\uB3D9\uCC28\uBCF4\uD5D8') {
                  detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">\uCC28\uB7C9\uBC88\uD638:</strong> ' + (ins['\uCC28\uB7C9\uBC88\uD638'] || '-') + '</div>');
                  detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">차량용도:</strong> ' + (ins['\uCC28\uB7C9\uC6A9\uB3C4'] || '-') + '</div>');
                  if (ins['\uCC28\uB7C9\uC6A9\uB3C4'] === '\uC774\uB95C\uCC28') {
                      detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">상세용도:</strong> ' + (ins['\uC774\uB95C\uCC28\uC6A9\uB3C4'] || '-') + '</div>');
                  }
                  detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">\uD53C\uBCF4\uD5D8\uC790:</strong> ' + (ins['\uD53C\uBCF4\uD5D8\uC790'] || '-') + '</div>');
                detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">\uAC31\uC2E0\uC77C\uC790:</strong> ' + (ins['\uAC31\uC2E0\uC77C\uC790'] || '-') + '</div>');
                detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">\uCD1D \uBCF4\uD5D8\uB8CC:</strong> ' + premium + '</div>');
                detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">\uACB0\uC81C\uC815\uBCF4:</strong> ' + payMethod + '</div>');
            } else {
                detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">\uACC4\uC57D\uC790:</strong> ' + (ins['\uACC4\uC57D\uC790'] || '-') + '</div>');
                detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">\uD53C\uBCF4\uD5D8\uC790:</strong> ' + (ins['\uD53C\uBCF4\uD5D8\uC790'] || '-') + '</div>');
                detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">\uAC00\uC785\uC77C\uC790:</strong> ' + (ins['\uCCB4\uACB0\uC77C'] || '-') + '</div>');
                detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">\uB9CC\uAE30\uC77C\uC790:</strong> ' + (ins['\uB9CC\uAE30\uC77C\uC790'] || '-') + '</div>');
                detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">\uB0A9\uC785\uAE30\uAC04:</strong> ' + (ins['\uB0A9\uC785\uAE30\uAC04'] || '-') + '</div>');
                detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">\uACB0\uC81C\uC815\uBCF4:</strong> ' + payMethod + '</div>');
            }

            insHtml += 
                '<div style="margin-top: 16px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">' +
                    '<div style="padding: 20px; display:flex; justify-content:space-between; align-items:center; gap: 16px; cursor: pointer; background: white; transition: 0.2s;" ' +
                        'onmouseover="this.style.background=\'#f8fafc\'; this.querySelector(\'.chevron-icon\').style.color=\'#3b82f6\'" ' +
                        'onmouseout="this.style.background=\'white\'; this.querySelector(\'.chevron-icon\').style.color=\'#94a3b8\'" ' +
                        'onclick="var d = this.nextElementSibling; var i = this.querySelector(\'.chevron-icon\'); if(d.style.display===\'none\'){d.style.display=\'block\'; i.style.transform=\'rotate(180deg)\';}else{d.style.display=\'none\'; i.style.transform=\'rotate(0deg)\';}">' +
                        '<div style="flex: 1; word-break: keep-all;">' +
                            '<div style="font-weight: 800; font-size: 16px; color:#0f172a; line-height: 1.4;">' + pName + '</div>' +
                            '<div style="color: #64748b; font-size: 14px; margin-top: 8px; font-weight: 600;">' + comp + ' / ' + premium + ' / ' + payMethod + '</div>' +
                        '</div>' +
                        '<div style="display: flex; align-items: center; gap: 16px;">' +
                            '<span style="background:#f1f5f9; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700; color:#475569; border:1px solid #e2e8f0; flex-shrink: 0; white-space: nowrap;">' + badgeStr + '</span>' +
                            '<i class="fa-solid fa-chevron-down chevron-icon" style="color:#94a3b8; transition:0.3s;"></i>' +
                        '</div>' +
                    '</div>' +
                    '<div style="display: none; padding: 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 14.5px; color: #475569; line-height: 1.6;">' +
                        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">' +
                            detailFields.join('') +
                        '</div>' +
                        '<div style="margin-top: 20px; border-top: 1px dashed #cbd5e1; padding-top: 20px;">' +
                            '<strong style="color:#1e293b; display:block; margin-bottom:10px;">\uC8FC\uC694 \uB2F4\uBCF4 \uBC0F \uD2B9\uC57D (\uAC00\uC785\uB0B4\uC5ED):</strong>' +
                            (ins['\uAC00\uC785\uB0B4\uC5ED'] || ins['\uD2B9\uC774\uC0AC\uD56D'] || '\uB4F1\uB85D\uB41C \uC0C1\uC138 \uD2B9\uC57D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.').replace(/\n/g, '<br>') +
                        '</div>' +
                    '</div>' +
                '</div>';
        });
    }
    document.getElementById('pfInsList').innerHTML = insHtml;
    const setEl = (id, val) => { const e = document.getElementById(id); if(e) e.innerHTML = val || '-'; };
    setEl('pfTouch', (client['터치인사이트'] || '-').replace(/\n/g, '<br>'));
    
    let taskSpec = '';
    if(client['상세업무']) taskSpec += '<strong>[상세업무]</strong><br>' + client['상세업무'].replace(/\n/g, '<br>') + '<br><br>';
    if(client['특이사항']) taskSpec += '<strong>[특이사항]</strong><br>' + client['특이사항'].replace(/\n/g, '<br>');
    setEl('pfTask', taskSpec || '-');
    
    setEl('pfJoinInfo', (client['가입내역'] || '-').replace(/\n/g, '<br>'));
    
    setEl('pfRouteAndDrive', '운전: ' + (client['운전여부'] || '-') + ' / 차량: ' + (client['차량용도'] || '-'));
    
    let notifyText = client['알릴의무사항'] || '-';
    let petText = (client['반려동물'] && client['반려동물'] !== '해당없음') ? ('[반려동물: ' + client['반려동물'] + ' ' + (client['동물이름'] || '') + ']') : '';
      if (client['코드']) { petText += (petText ? ' ' : '') + '[동물등록번호(코드): ' + client['코드'] + ']'; }
    setEl('pfNotify', (petText ? petText + '<br>' : '') + notifyText.replace(/\n/g, '<br>'));

    


    if (typeof openProfile === 'function') {
        openProfile();
    } else {
        const pm = document.getElementById('profileModal');
        if (pm) pm.classList.add('active');
    }
};

window.searchInsurance = function() {
    const comp = document.getElementById('ins-comp-select').value;
    if(!comp) return;
    
    let filtered = [...globalCustomerData];
    filtered = filtered.filter(c => {
        try {
            if (Array.isArray(c['가입내역'])) {
                return c['가입내역'].some(i => String(i.상품명 || "").includes(comp) || String(i.회사명 || "").includes(comp));
            }
        } catch(e) {}
        return String(c['가입내역']).includes(comp) || String(c['상품명']).includes(comp) || String(c['회사명']).includes(comp);
    });
    
    if (typeof window.renderListModal === 'function') {
        window.renderListModal(filtered, 'insurance', comp);
    }
};









// 
// ===== ANTIGRAVITY PATCH: OVERRIDE FUNCTIONS ===== //
window.getCrmHeaders = function(sheetType) {
    return [
        "고객번호", "고객명", "상태", "주민번호", "나이", "성별", "생일", "상령일", "폰번호",
        "직업", "상세업무", "주소", "운전여부", "차량용도", "반려동물", "동물이름", "가족사항", 
        "코드", "터치인사이트", "특이사항", "가입내역", "등록일", "사업여부", "UID"
    ];
};
function getCrmHeaders(sheetType) { return window.getCrmHeaders(sheetType); }

window.renderTable = function(data = globalCustomerData) {
    window.globalCustomerData = globalCustomerData;
    const listArea = document.getElementById("masterListArea");
    if (!listArea) return;
    listArea.innerHTML = "";
    
    let filtered = data;
    const filterState = window.currentQuickFilter || "all";
    const today = new Date();
    const currentMonthStr = String(today.getMonth() + 1).padStart(2, "0");
    const nextMonthStr = String((today.getMonth() + 1) % 12 + 1).padStart(2, "0");
    if (filterState === "interest") { filtered = data.filter(c => c["상태"] === "가망" || c["상태"] === "관심"); }
    else if (filterState === "contract") { filtered = data.filter(c => c["상태"] === "체결" || c["상태"] === "계약"); }
    else if (filterState === "birth") { filtered = data.filter(c => { const b = String(c["생일"] || ""); return b.includes(currentMonthStr) || b.includes(nextMonthStr); }); }
    else if (filterState === "sangryung") { filtered = data.filter(c => { const s = String(c["상령일"] || ""); return s.includes(currentMonthStr) || s.includes(nextMonthStr); }); }
    
    let html = "";
    filtered.forEach(client => {
        const idStr = String(client["고객번호"] || client["ID"] || "");
        const status = client["상태"] || "-";
        const name = client["고객명"] || client["대표자명"] || "-";
        const phone = client["폰번호"] || client["연락처"] || "-";
        
        let badgeBg = "#f1f5f9";
        let badgeColor = "#64748b";
        if(status==="체결" || status==="계약"){ badgeBg="#eff6ff"; badgeColor="#2563eb"; }
        else if(status==="가망" || status==="관심"){ badgeBg="#fefce8"; badgeColor="#ca8a04"; }
        
        html += `
            <div class="master-list-card" onclick="showMasterDetail('${idStr}', this)" style="padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: white; cursor: pointer; transition: 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.02);" onmouseover="this.style.borderColor='#3b82f6'; this.style.transform='translateY(-1px)';" onmouseout="if(!this.classList.contains('active-card')){this.style.borderColor='#e2e8f0'; this.style.transform='none';}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div style="font-weight: 800; color: #0f172a; font-size: 15px;">${name}</div>
                    <span style="background: ${badgeBg}; color: ${badgeColor}; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700;">${status}</span>
                </div>
                <div style="color: #64748b; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-phone" style="font-size:11px;"></i> ${phone}
                </div>
            </div>
        `;
    });
    listArea.innerHTML = html;
};

window.filterMasterList = function() {
    try {
        const q = document.getElementById("masterSearch").value.toLowerCase().replace(/[\s-]/g, "");
        const filtered = window.globalCustomerData.filter(c => {
            const name = String(c["고객명"] || c["이름"] || c["대표자명"] || "").toLowerCase().replace(/\s+/g, "");
            const phone = String(c["폰번호"] || c["대표자폰번호"] || "").toLowerCase().replace(/[\s-]/g, "");
            const num = String(c["고객번호"] || c["ID"] || "").replace(/\s+/g, "");
            return name.includes(q) || phone.includes(q) || num.includes(q);
        });
        window.renderTable(filtered);
    } catch(e) {
        alert("Master Search Error: " + e.message);
    }
}

window.closeAllAndEdit = function(custId) {
    console.log("Edit button clicked for ID:", custId);
    
    // Force hide profile modal perfectly
    const p = document.getElementById('profileModal');
    if (p) { 
        p.classList.remove('show'); 
        p.classList.remove('active'); 
        p.style.display = 'none'; 
    }
    
    // Force hide master modal perfectly
    const m = document.getElementById('masterModal');
    if (m) {
        m.classList.remove('show');
        m.classList.remove('active');
        m.style.display = 'none';
    }
    
    if (typeof openEditMode === 'function') {
        try {
            console.log("Calling openEditMode...");
            openEditMode(custId, 'edit');
            
            // Force regModal to the absolute front just in case
            const reg = document.getElementById('regModal');
            if (reg) {
                reg.style.display = 'flex';
                reg.classList.add('active');
                reg.style.zIndex = '9999';
            } else {
                alert("현재 화면에는 수정 창(regModal)이 존재하지 않습니다. 고객 등록 페이지(crm_test.html 등)에서 실행해주세요.");
            }
        } catch (err) {
            console.error(err);
            alert("수정 모드 실행 중 내부 오류가 발생했습니다: " + err.message);
        }
    } else {
        alert('openEditMode 함수를 찾을 수 없습니다.');
    }
};
window.switchProfileTab = function(btn, tabId) {
    const container = btn.closest('.profile-detail-container');
    if (!container) return;
    
    container.querySelectorAll('.profile-tab-btn').forEach(b => {
        b.style.borderBottom = '3px solid transparent';
        b.style.color = '#64748b';
        b.style.fontWeight = '600';
    });
    
    btn.style.borderBottom = '3px solid #3b82f6';
    btn.style.color = '#3b82f6';
    btn.style.fontWeight = '800';
    
    container.querySelectorAll('.profile-tab-content').forEach(c => {
        c.style.display = 'none';
    });
    
    const target = container.querySelector('#' + tabId);
    if (target) {
        target.style.display = 'block';
    }
};

window.generateInsListHtml = function(client) {
    let insHtml = "-";
    const rawIns = client["가입내역"] || "-";
    try {
        const insArr = getGlobalInsuranceList(client, true);
        if (insArr && insArr.length > 0) {
            insHtml = insArr.map((ins, i) => {
                    const comp = ins['보험사명'] || ins['차_보험사명'] || ins['\uBCF4\uD5D8\uC0AC\uBA85'] || '-';
                    let pName = ins['상품명'] || ins['차_상품명'] || ins['\uC0C1\uD488\uBA85'] || '보험명 없음';
                    const isAuto = (ins['보험종류'] === '자동차보험' || ins['보험종류'] === '자동차' || ins['\uBCF4\uD5D8\uC885\uB958'] === '\uC790\uB3D9\uCC28' || ins['\uBCF4\uD5D8\uC885\uB958'] === '\uC790\uB3D9\uCC28\uBCF4\uD5D8');
                    
                    const carUsage = ins['차량용도'] || ins['차_차량용도'] || ins['\uCC28\uB7C9\uC6A9\uB3C4'] || '-';
                    if (isAuto) {
                        pName = (carUsage === '이륜차' || ins['\uCC28\uB7C9\uC6A9\uB3C4'] === '\uC774\uB95C\uCC28') ? '이륜차' : '자동차';
                    }
                    
                    const rawPremium = ins['보험료'] || ins['차_보험료'] || ins['premium'] || ins['\uBCF4\uD5D8\uB8CC'];
                    const premium = rawPremium ? Number(rawPremium.toString().replace(/[^0-9]/g, '')).toLocaleString() + '원' : '-';
                    
                    const manGi = ins['만기일자'] || ins['만기일'] || ins['\uB9CC\uAE30\uC77C\uC790'] || ins['\uB9CC\uAE30\uC77C'] || '-';
                    const gaengSin = ins['갱신일자'] || ins['갱신일'] || '-';
                    const dateStr = manGi !== '-' ? manGi : (gaengSin !== '-' ? gaengSin : '날짜없음');
                    const badgeStr = isAuto ? dateStr + ' 갱신' : (ins['체결일'] || ins['\uCCB4\uACB0\uC77C'] || '-') + ' 가입';
                    
                    let payMethod = ins.결제방식 || ins['차_결제방식'] || ins.paymentMethod || ins.payment || ins['\uACB0\uC81C\uBCF9\uC2DD'] || "-";
                    let payInfo = ins.결제정보 || ins['차_결제정보'] || ins.payInfo || ins['\uACB0\uC81C\uC815\uBCF4'] || "";
                    
                    if (payMethod === "카드") {
                        const cardNo = ins['카드번호'] || ins['차_카드번호'] || "";
                        const cardValid = ins['유효기간'] || ins['차_유효기간'] || "";
                        if (cardNo || cardValid) {
                            payInfo = `${cardNo} / ${cardValid}`;
                        } else if (payInfo && !payInfo.includes('/')) {
                            if (ins['유효기간']) payInfo += ` / ${ins['유효기간']}`;
                        }
                    } else if (payMethod === "자동이체") {
                        const bankName = ins['은행명'] || ins['차_은행명'] || "";
                        const accountNo = ins['계좌번호'] || ins['차_계좌번호'] || "";
                        if (bankName || accountNo) {
                            payInfo = `${bankName} / ${accountNo}`;
                        }
                    }

                    const contractor = ins['계약자'] || ins['차_계약자'] || '-';
                    const insured = ins['피보험자'] || ins['차_피보험자'] || ins['기본피보험자'] || ins['차_기본피보험자'] || '-';
                    const carNo = ins['차량번호'] || ins['차_차량번호'] || ins['\uCC28\uB7C9\uBC88\uD638'] || '-';
                    const detailUsage = ins['상세용도'] || ins['이륜차용도'] || ins['차_상세용도'] || '-';
                    const respDate = ins['책임개시일'] || ins['\uCC45\uC784\uAC1C\uC2DC\uC77C'] || ins['체결일'] || '-';
                    const insType = ins['보험분류'] || ins['보험종류'] || '-';

                    let detailFields = [];
                    if (isAuto) {
                        detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">책임개시일:</strong> ' + respDate + '</div>');
                        detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">차량용도:</strong> ' + carUsage + '</div>');
                        detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">상세용도:</strong> ' + detailUsage + '</div>');
                        detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">운전자특약:</strong> ' + (ins['운전자특약'] || '-') + '</div>');
                        detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">연령특약:</strong> ' + (ins['연령특약'] || '-') + '</div>');
                        detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">결제정보:</strong> ' + payInfo + '</div>');
                    } else {
                        detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">보험분류:</strong> ' + insType + '</div>');
                        detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">가입일자:</strong> ' + (ins['체결일'] || ins['\uCCB4\uACB0\uC77C'] || '-') + '</div>');
                        detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">납입기간:</strong> ' + (ins['납입기간'] || ins['\uB0A9\uC785\uAE30\uAC04'] || '-') + '</div>');
                        detailFields.push('<div><strong style="color:#1e293b; width: 80px; display:inline-block;">결제정보:</strong> ' + payInfo + '</div>');
                    }

                    let coverageText = String(ins['가입내역'] || ins['\uAC00\uC785\uB0B4\uC5ED'] || ins['특이사항'] || ins['\uD2B9\uC774\uC0AC\uD56D'] || '-').replace(/\n/g, '<br>');
                    if (isAuto) coverageText = '의무보험';

                    let alrilHtml = "";
                    let alrilRows = ins.알릴의무사항 || ins.alril || ins['\uC54C\uB9B4\uC758\uBB34\uC0AC\uD56D'] || [];
                    if (typeof alrilRows === "string") {
                        alrilHtml = `<div style="white-space: pre-line; color: #4e5968; font-size:12px; margin-top:20px; border-top:1px dashed #cbd5e1; padding-top:20px;"><strong style="color:#1e293b; display:block; margin-bottom:10px;">알릴의무사항:</strong>${alrilRows}</div>`;
                    } else if (Array.isArray(alrilRows) && alrilRows.length > 0) {
                        alrilHtml = '<div style="margin-top:20px; padding-top:20px; border-top:1px dashed #cbd5e1;"><strong style="color:#1e293b; display:block; margin-bottom:10px;">알릴의무사항:</strong>' + 
                        alrilRows.map(a => {
                            const checks = [];
                            if (a.treatment || a["치료"]) checks.push("치료");
                            if (a.medication || a["투약"]) checks.push("투약");
                            if (a.admission || a["입원"]) checks.push("입원");
                            if (a.surgery || a["수술"]) checks.push("수술");
                            if (a.biopsy || a["정밀검사"]) checks.push("정밀검사");
                            const checksStr = checks.length > 0 ? checks.join(', ') : "없음";
                            
                            return '<div style="margin-top:4px; padding:12px; background:white; border:1px solid #e2e8f0; border-radius:8px; font-size:13.5px; color:#475569;"><strong>병명:</strong> '+(a.disease||a['병명']||'')+' | <strong>기간:</strong> '+(a.startDate||a['시작일']||'')+'~'+(a.endDate||a['종료일']||'')+'<br><div style="margin-top:4px;"><strong>병원:</strong> '+(a.hospital||a['병원']||'')+' | <strong>내용:</strong> '+checksStr+' | <strong>재발:</strong> '+(a.relapse||a['재발']||'')+' | <strong>완치:</strong> '+(a.cured||a['완치']||'')+'</div></div>';
                        }).join('') + '</div>';
                    }
                    
                    let gridHtml = '';
                    if (isAuto) {
                        gridHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; font-size: 13px; color: #475569;">' +
                                    '<div><strong>보험사:</strong> ' + comp + '</div>' +
                                    '<div><strong>계약자:</strong> ' + contractor + '</div>' +
                                    '<div><strong>피보험자:</strong> ' + insured + '</div>' +
                                    '<div><strong>차량번호:</strong> ' + carNo + '</div>' +
                                    '<div><strong>만기(갱신):</strong> ' + dateStr + '</div>' +
                                    '<div><strong>보험료:</strong> ' + premium + '</div>' +
                                '</div>';
                    } else {
                        gridHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; font-size: 13px; color: #475569;">' +
                                    '<div><strong>보험사:</strong> ' + comp + '</div>' +
                                    '<div><strong>계약자:</strong> ' + contractor + '</div>' +
                                    '<div><strong>피보험자:</strong> ' + insured + '</div>' +
                                    '<div><strong>만기일:</strong> ' + manGi + '</div>' +
                                    '<div><strong>갱신일:</strong> ' + gaengSin + '</div>' +
                                    '<div><strong>보험료:</strong> ' + premium + '</div>' +
                                '</div>';
                    }

                    return '<div style="margin-top: 16px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">' +
                        '<div style="padding: 20px; display:flex; justify-content:space-between; align-items:start; gap: 16px; cursor: pointer; background: white; transition: 0.2s;" ' +
                            'onmouseover="this.style.background=\'#f8fafc\'; this.querySelector(\'.chevron-icon\').style.color=\'#3b82f6\'" ' +
                            'onmouseout="this.style.background=\'white\'; this.querySelector(\'.chevron-icon\').style.color=\'#94a3b8\'" ' +
                            'onclick="var d = this.nextElementSibling; var i = this.querySelector(\'.chevron-icon\'); if(d.style.display===\'none\'){d.style.display=\'block\'; i.style.transform=\'rotate(180deg)\';}else{d.style.display=\'none\'; i.style.transform=\'rotate(0deg)\';}">' +
                            '<div style="flex: 1; word-break: keep-all;">' +
                                '<div style="font-weight: 800; font-size: 16px; color:#0f172a; line-height: 1.4; margin-bottom: 12px;">' + pName + '</div>' +
                                gridHtml +
                                '<div style="margin-top: 12px; font-size: 13px; color: #475569; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">' +
                                    '<strong style="color: #1e293b; margin-bottom: 4px; display: inline-block;">주요 담보 및 특약:</strong><br>' + coverageText +
                                '</div>' +
                            '</div>' +
                            '<div style="display: flex; align-items: center; gap: 16px;">' +
                                '<span style="background:#f1f5f9; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700; color:#475569; border:1px solid #e2e8f0; flex-shrink: 0; white-space: nowrap;">' + badgeStr + '</span>' +
                                '<i class="fa-solid fa-chevron-down chevron-icon" style="color:#94a3b8; transition:0.3s;"></i>' +
                            '</div>' +
                        '</div>' +
                        '<div style="display: none; padding: 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 14.5px; color: #475569; line-height: 1.6;">' +
                            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">' +
                                detailFields.join('') +
                            '</div>' +
                            alrilHtml +
                        '</div>' +
                    '</div>';
                }).join('');
            } else {
                insHtml = String(rawIns).replace(/\n/g, '<br>');
            }
        } catch (e) {
            insHtml = String(rawIns).replace(/\n/g, '<br>');
        }
    return insHtml;
}

window.generateProfileHtml = function(client) {
    let familyPillsHtml = "";
    const rootId = String(client["고객번호"] || client["ID"] || "").split("-")[0];
    if (rootId && typeof globalCustomerData !== "undefined") {
        const familyMembers = globalCustomerData.filter(c => {
            const cId = String(c["고객번호"] || c["ID"] || "");
            return cId === rootId || cId.startsWith(rootId + "-");
        });
        
        if (familyMembers.length > 0) {
            familyPillsHtml = "<div style=\"display:flex; flex-wrap:wrap; gap:8px;\">";
            familyMembers.forEach(fm => {
                const fmId = String(fm["고객번호"] || fm["ID"] || "");
                const isCurrent = (fmId === String(client["고객번호"] || client["ID"] || ""));
                const fmName = fm["고객명"] || "이름없음";
                let fmRel = fm["가족사항"] || fm["가족_관계"] || "가족";
                if (fmId === rootId) fmRel = "계약자";
                else if (fmRel.includes("(")) fmRel = fmRel.split("(")[0];
                
                if (isCurrent) {
                    familyPillsHtml += `<span style="padding: 6px 14px; border-radius: 20px; background: #3b82f6; color: white; font-size: 13px; font-weight: 700; border: 1px solid #2563eb; box-shadow: 0 2px 4px rgba(59,130,246,0.3); display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-user-check"></i> ${fmRel} - ${fmName}</span>`;
                } else {
                    familyPillsHtml += `<button onclick="window.openProfile('${fmId}')" style="padding: 6px 14px; border-radius: 20px; background: #f8fafc; color: #475569; border: 1px solid #cbd5e1; font-size: 13px; font-weight: 700; cursor: pointer; transition: 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); display: flex; align-items: center; gap: 6px;" onmouseover="this.style.background='#f1f5f9'; this.style.borderColor='#94a3b8'; this.style.color='#0f172a';" onmouseout="this.style.background='#f8fafc'; this.style.borderColor='#cbd5e1'; this.style.color='#475569';"><i class="fa-solid fa-user"></i> ${fmRel} - ${fmName}</button>`;
                }
            });
            familyPillsHtml += "</div>";
        } else {
            familyPillsHtml = `<div style="color: #475569; font-size: 15px; font-weight:600;">등록된 가족이 없습니다.</div>`;
        }
    } else {
        familyPillsHtml = `<div style="color: #475569; font-size: 15px; font-weight:600;">` + (client["가족사항"] || "-") + `</div>`;
    }

    let insHtml = (typeof window.generateInsListHtml === 'function') ? window.generateInsListHtml(client) : '-';

    const touchTags = ((client["터치인사이트"]||"").split(",").filter(x=>x.trim()).map(t => `<span style="background:#f1f5f9; color:#3b82f6; padding:10px 20px; border-radius:24px; font-size:16px; font-weight:800; border:1px solid #bfdbfe; box-shadow:0 1px 2px rgba(0,0,0,0.05);">#` + t.trim() + `</span>`).join("") || "<div style='color:#94a3b8;'>등록된 터치인사이트가 없습니다.</div>");

    return `
    <div class="profile-detail-container" style="display:flex; flex-direction:column; height:100%;">
        <div style="margin-bottom: 12px; display: flex; justify-content: flex-start;">
            <button onclick="window.deleteCustomerFromProfile('${client['고객번호'] || client['사업자번호'] || client['ID']}', '${client['고객명'] || client['대표자명'] || '고객'}')" style="background:#fef2f2; color:#ef4444; border:1px solid #fca5a5; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; transition:0.2s; box-shadow:0 1px 2px rgba(239,68,68,0.1); opacity: 0.8;" onmouseover="this.style.opacity='1'; this.style.background='#fee2e2';" onmouseout="this.style.opacity='0.8'; this.style.background='#fef2f2';">
                <i class="fa-solid fa-trash-can"></i> 프로필 삭제
            </button>
        </div>
        <!-- Header Profile Summary -->
        <div style="display: flex; justify-content: space-between; align-items: stretch; margin-bottom: 24px; padding-bottom: 24px;">
            <!-- Left: Avatar & Info -->
            <div style="display: flex; align-items: center; gap: 24px;">
                <div style="width: 80px; height: 80px; background: white; border: 1px solid #e2e8f0; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #3b82f6; font-size: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); flex-shrink: 0;">
                    <i class="fa-solid fa-user"></i>
                </div>
                                    <div style="display: flex; flex-direction: column;">
                      <div style="display: flex; align-items: center; margin-bottom: 12px;">
                          <h2 style="margin: 0; font-size: 32px; color: #0f172a; font-weight: 900;">` + (client["고객명"] || "-") + `</h2>
                          <span style="background: #eff6ff; color: #2563eb; padding: 6px 16px; border-radius: 20px; font-size: 15px; font-weight: 800; border: 1px solid #bfdbfe; margin-left: 16px;">` + (client["상태"] || "-") + `</span>
                          
                          <!-- Stacked Buttons -->
                          <div style="display: flex; flex-direction: column; gap: 6px; margin-left: 24px; min-width: 220px;">
                              <div style="display: flex; gap: 6px;">
                                  <button onclick="openDriveFolder('${client['고객번호'] || client['사업자번호'] || client['ID'] || '-'}', '${client['고객명'] || client['대표자명'] || '-'}')" style="background:#f8fafc; color:#0f172a; border:1px solid #cbd5e1; padding:8px 12px; border-radius:8px; font-weight:800; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; gap:6px; flex:1; transition:0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
                                      <i class="fa-solid fa-folder-open" style="color:#f59e0b;"></i> 서류함
                                  </button>
                                  <button onclick="printCustomerReport('${client['고객번호'] || client['사업자번호'] || client['ID'] || '-'}')" style="background:#f8fafc; color:#0f172a; border:1px solid #cbd5e1; padding:8px 12px; border-radius:8px; font-weight:800; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; gap:6px; flex:1; transition:0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
                                      <i class="fa-solid fa-file-pdf" style="color:#ef4444;"></i> PDF
                                  </button>
                              </div>
                              <button onclick="openUploadModalForClient('${client['고객번호'] || client['사업자번호'] || client['ID'] || '-'}', '${client['고객명'] || client['대표자명'] || '-'}')" style="background:#f8fafc; color:#0f172a; border:1px solid #cbd5e1; padding:8px 12px; border-radius:8px; font-weight:800; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; gap:6px; width:100%; transition:0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
                                  <i class="fa-solid fa-cloud-arrow-up" style="color:#3b82f6;"></i> 서류 업로드
                              </button>
                              <button onclick="window.closeAllAndEdit('` + (client["고객번호"] || client["사업자번호"] || client["ID"]) + `')" style="background:#10b981; color:white; border:none; padding:8px 16px; border-radius:8px; font-weight:800; cursor:pointer; display:flex; justify-content:center; align-items:center; gap:8px; font-size:14px; width: 100%; box-shadow:0 2px 4px rgba(16,185,129,0.2); transition:0.2s;" onmouseover="this.style.background='#059669'" onmouseout="this.style.background='#10b981'">
                                  <i class="fa-solid fa-pen-to-square"></i> 수정
                              </button>
                          </div>
                      </div>
                      <div style="display: flex; gap: 24px; color: #64748b; font-size: 16px; font-weight: 600;">
                        <span><i class="fa-solid fa-cake-candles" style="margin-right:6px; color:#f59e0b;"></i> ` + (client["생일"] || "-") + ` (` + (client["나이"] || "-") + `세)</span>
                        <span><i class="fa-solid fa-phone" style="margin-right:6px; color:#10b981;"></i> ` + (client["폰번호"] || "-") + `</span>
                    </div>
                </div>
            </div>
            
            <!-- Right: Memo -->
            <div style="flex: 1; min-width: 450px; max-width: 750px; margin-left: 60px; padding: 20px; background: #fffbeb; border-radius: 12px; border: 1px solid #fde68a; box-shadow: 0 2px 4px rgba(0,0,0,0.02); min-height: 120px; display: flex; flex-direction: column;">
                <div style="color:#ca8a04; font-weight:800; font-size:15px; margin-bottom:12px; display:flex; align-items:center;">
                    <i class="fa-solid fa-pen-to-square" style="margin-right:8px;"></i> 특이사항 메모
                </div>
                <div style="color: #1e293b; font-size: 15px; line-height: 1.6; max-height: 120px; overflow-y: auto; font-weight: 500; word-break: keep-all; flex: 1;">
                    ` + String(client["특이사항"] || "등록된 메모가 없습니다.").replace(/\n/g, "<br>") + `
                </div>
            </div>
        </div>            
        <!-- Tab Navigation -->
        <div style="display:flex; gap:32px; border-bottom: 1px solid #e2e8f0; margin-bottom: 32px; padding: 0 8px;">
            <button onclick="switchProfileTab(this, 'tab-basic')" class="profile-tab-btn" style="background:none; border:none; border-bottom:3px solid #3b82f6; color:#3b82f6; font-weight:800; font-size:16px; padding:12px 4px; cursor:pointer; transition:0.2s;">기본정보(1차정보)</button>
            <button onclick="switchProfileTab(this, 'tab-touch')" class="profile-tab-btn" style="background:none; border:none; border-bottom:3px solid transparent; color:#64748b; font-weight:600; font-size:16px; padding:12px 4px; cursor:pointer; transition:0.2s;">터치인사이트</button>
            <button onclick="switchProfileTab(this, 'tab-ins')" class="profile-tab-btn" style="background:none; border:none; border-bottom:3px solid transparent; color:#64748b; font-weight:600; font-size:16px; padding:12px 4px; cursor:pointer; transition:0.2s;">보험가입내역</button>
        </div>

        <!-- Tab Content: Basic Info -->
        <div id="tab-basic" class="profile-tab-content" style="display:block; animation: fadeIn 0.3s ease;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                <!-- Left: Core Info & Memo -->
                <div style="display: flex; flex-direction: column; gap: 24px;">
                    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin: 0 0 24px 0;">
                            <h3 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0; display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-address-card" style="color: #3b82f6;"></i> 1차 기본 정보</h3>
                            <div style="display:flex; gap:6px;">
                                <button style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-weight:800; padding:6px 12px; border-radius:8px; cursor:pointer; font-size:13px; transition:0.2s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'" onclick="copyCustomerInfo(this, '${(client['고객명'] || client['대표자명'] || '-').replace(/'/g, "\\'")}', '${(client['주민번호'] || client['사업자번호'] || '-').replace(/'/g, "\\'")}', '${(client['폰번호'] || client['대표자폰번호'] || '-').replace(/'/g, "\\'")}', '${String(client['주소'] || client['대표주소'] || '-').replace(/\n/g, " ").replace(/'/g, "\\'")}', '${(client['직업'] || client['업태'] || '-').replace(/'/g, "\\'")}', false)">전달용 전체 </button>
                                <button style="background:#f8fafc; color:#64748b; border:1px solid #cbd5e1; font-weight:800; padding:6px 12px; border-radius:8px; cursor:pointer; font-size:13px; transition:0.2s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f8fafc'" onclick="copyCustomerInfo(this, '${(client['고객명'] || client['대표자명'] || '-').replace(/'/g, "\\'")}', '${(client['주민번호'] || client['사업자번호'] || '-').replace(/'/g, "\\'")}', '${(client['폰번호'] || client['대표자폰번호'] || '-').replace(/'/g, "\\'")}', '${String(client['주소'] || client['대표주소'] || '-').replace(/\n/g, " ").replace(/'/g, "\\'")}', '${(client['직업'] || client['업태'] || '-').replace(/'/g, "\\'")}', true)">전달용 마스킹(*) </button>
                            </div>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9; margin-bottom: 16px;">
                            <span style="color: #64748b; font-size: 15px;">성별</span><span style="font-weight: 700; color: #1e293b; font-size: 15px;">` + (client["성별"] || "-") + `</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items:center; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9; margin-bottom: 16px;">
                            <span style="color: #64748b; font-size: 15px;">주민번호</span>
                            <span style="font-weight: 700; color: #1e293b; font-size: 15px; display:flex; align-items:center;">
                                ` + (formatJumin(client["주민번호"] || client["사업자번호"]) || "-") + `
                                ` + ((client["주민번호"] || client["사업자번호"]) ? `
                                <span class="copy-badge" style="background: #f1f5f9; color: #4f46e5; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer; margin-left: 8px; border: 1px solid #c7d2fe; display: inline-block;" onclick="copyJumin('${(client["주민번호"] || client["사업자번호"]).replace(/'/g, "\\'")}', false)" title="주민번호 전체 복사">복사</span>
                                <span class="copy-badge" style="background: #f8fafc; color: #64748b; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer; margin-left: 4px; border: 1px solid #cbd5e1; display: inline-block;" onclick="copyJumin('${(client["주민번호"] || client["사업자번호"]).replace(/'/g, "\\'")}', true)" title="뒷자리 마스킹(*) 복사">마스킹(*)</span>
                                ` : "") + `
                            </span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9; margin-bottom: 16px;">
                            <span style="color: #64748b; font-size: 15px;">상령일</span><span style="font-weight: 700; color: #1e293b; font-size: 15px;">` + (client["상령일"] || "-") + `</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9; margin-bottom: 16px;">
                            <span style="color: #64748b; font-size: 15px;">직업 / 업무</span><span style="font-weight: 700; color: #1e293b; font-size: 15px; text-align:right;">` + (client["직업"] || "-") + `<br><span style="font-size:13px; color:#94a3b8; font-weight:500;">` + (client["상세업무"] || "-") + `</span></span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <span style="color: #64748b; font-size: 15px;">주소</span><span style="font-weight: 600; color: #1e293b; font-size: 15px; line-height: 1.6; background:#f8fafc; padding:16px; border-radius:10px;">` + String(client["주소"] || "-").replace(/\n/g, "<br>") + `</span>
                        </div>
                    </div>
                </div>
                <!-- Right: Additional Info -->
                <div style="display: flex; flex-direction: column; gap: 24px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                                <h4 style="font-size: 15px; font-weight: 800; color: #0f172a; margin: 0;"><i class="fa-solid fa-house-chimney" style="color:#64748b; margin-right:6px;"></i> 연동된 가족</h4>
                                <button onclick="window.openFamilyManageModal('${rootId}', '${client['고객명']}')" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px; transition:0.2s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'"><i class="fa-solid fa-gear"></i> 관리</button>
                            </div>
                            ` + familyPillsHtml + `
                        </div>
                        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                            <h4 style="font-size: 15px; font-weight: 800; color: #0f172a; margin: 0 0 12px 0;"><i class="fa-solid fa-dog" style="color:#64748b; margin-right:6px;"></i> 반려동물 (등록코드)</h4>
                            <div style="color: #475569; font-size: 15px; font-weight:600;">` + (client["반려동물"] || "-") + ` ` + (client["동물이름"] ? `(` + client["동물이름"] + `)` : "") + (client["코드"] ? ` / 코드: ` + client["코드"] : "") + `</div>
                        </div>
                        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                            <h4 style="font-size: 15px; font-weight: 800; color: #0f172a; margin: 0 0 12px 0;"><i class="fa-solid fa-id-card-clip" style="color:#64748b; margin-right:6px;"></i> 운전여부</h4>
                            <div style="color: #475569; font-size: 15px; font-weight:600; margin-bottom: 16px;">` + (client["운전여부"] || "-") + `</div>
                            <h4 style="font-size: 15px; font-weight: 800; color: #0f172a; margin: 0 0 12px 0;"><i class="fa-solid fa-briefcase" style="color:#64748b; margin-right:6px;"></i> 사업여부</h4>
                            <div style="color: #475569; font-size: 15px; font-weight:600;">` + (client["사업여부"] || "-") + `</div>
                        </div>
                        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                            <h4 style="font-size: 15px; font-weight: 800; color: #0f172a; margin: 0 0 12px 0;"><i class="fa-solid fa-car" style="color:#64748b; margin-right:6px;"></i> 차량용도</h4>
                            <div style="color: #475569; font-size: 15px; font-weight:600;">` + (client["차량용도"] || "-") + `</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Tab Content: Touch Insight --><!-- Tab Content: Touch Insight -->
        <div id="tab-touch" class="profile-tab-content" style="display:none; animation: fadeIn 0.3s ease;">
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); min-height: 300px;">
                <h3 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 24px 0;"><i class="fa-solid fa-tags" style="color:#3b82f6; margin-right:8px;"></i> 터치인사이트</h3>
                <div style="color: #475569; font-size: 16px; display: flex; flex-wrap: wrap; gap: 12px;">
                    ` + touchTags + `
                </div>
            </div>
        </div>

        <!-- Tab Content: Insurance -->
        <div id="tab-ins" class="profile-tab-content" style="display:none; animation: fadeIn 0.3s ease;">
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); min-height: 300px;">
                <h3 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 24px 0;"><i class="fa-solid fa-file-contract" style="color:#3b82f6; margin-right:8px;"></i> 보험 가입내역</h3>
                <div>` + insHtml + `</div>
            </div>
        </div>
        
    </div>
    <style>
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }
    </style>
    `;
};window.showMasterDetail = function(idStr, el) {
    document.querySelectorAll('.master-list-card').forEach(c => {
        c.classList.remove('active-card');
        c.style.borderColor = '#e2e8f0';
        c.style.boxShadow = '0 1px 2px rgba(0,0,0,0.02)';
        c.style.background = 'white';
    });
    if(el) {
        el.classList.add('active-card');
        el.style.borderColor = '#3b82f6';
        el.style.boxShadow = '0 4px 6px -1px rgba(59, 130, 246, 0.1)';
        el.style.background = '#eff6ff';
    }
    const client = globalCustomerData.find(c => String(c["고객번호"] || c["ID"]) === String(idStr));
    if(!client) return;
    const detailArea = document.getElementById("masterDetailArea");
    if(detailArea) detailArea.innerHTML = window.generateProfileHtml(client);
};




  window.openProfile = function(idStr) {
    if (!idStr) {
        const modal = document.getElementById("profileModal");
        if (modal) {
            modal.style.display = "flex";
            setTimeout(() => modal.classList.add("show"), 10);
        }
        return;
    }
    
    const client = globalCustomerData.find(c => String(c["고객번호"] || c["ID"]) === String(idStr));
    if (!client) {
        alert("고객 정보를 찾을 수 없습니다.");
        return;
    }
    
    const profileContent = document.getElementById("profileModalContent");
    if(profileContent) {
        profileContent.innerHTML = window.generateProfileHtml(client);
    }
    
    const modal = document.getElementById("profileModal");
    if (modal) {
        modal.style.display = "flex";
        setTimeout(() => modal.classList.add("show"), 10);
    }
};
    function renderTable(d) { return window.renderTable(d); }


function openProfile(id) { return window.openProfile(id); }

window.updateQuickFilterCounts = function() {
    let total = globalCustomerData.length;
    let interest = 0;
    let consult = 0;
    let contract = 0;
    let care = 0;
    
    let birth = 0;
    let sangryung = 0;
    let expiry = 0;
    
    const today = new Date();
    const currentMonthStr = String(today.getMonth() + 1).padStart(2, '0');
    const currentDayStr = String(today.getDate()).padStart(2, '0');
    const currentMD = currentMonthStr + currentDayStr;

    globalCustomerData.forEach(c => {
        let s = String(c['상태'] || c['고객상태'] || '');
        if(s.includes('관심') || s.includes('가망')) interest++;
        else if(s.includes('상담') || s.includes('설계')) consult++;
        else if(s.includes('체결') || s.includes('계약')) contract++;
        else if(s.includes('케어') || s.includes('집중')) care++;
        
        let birthSource = String(c['생일'] || c['생년월일'] || c['주민번호'] || "");
        let bMD = "";
        
        if (birthSource.includes('-')) {
            let p1 = birthSource.split('-')[0];
            if (p1.length === 6) {
                bMD = p1.substring(2,6); // MMDD
            } else if (p1.length === 4 && birthSource.split('-').length === 3) {
                bMD = birthSource.split('-')[1] + birthSource.split('-')[2];
            }
        }
        
        if (!bMD) {
            let b = birthSource.replace(/\D/g, '');
            if (b.length >= 8) bMD = b.substring(4, 8);
            else if (b.length >= 6) bMD = b.substring(2, 6);
            else if (b.length >= 4) bMD = b.substring(0, 4);
        }
        
        if (bMD === currentMD) birth++;
        
        let sMD = "";
        const sang = String(c['상령일'] || "").replace(/\D/g, '');
        if (sang.length >= 8) sMD = sang.substring(4, 8);
        else if (sang.length >= 6) sMD = sang.substring(2, 6);
        else if (sang.length >= 4) sMD = sang.substring(0, 4);
        
        if (!sMD && bMD && bMD.length === 4) {
            let m = parseInt(bMD.substring(0,2));
            let d = bMD.substring(2,4);
            m = m + 6;
            if (m > 12) m -= 12;
            sMD = String(m).padStart(2, '0') + d;
        }
        if (sMD && sMD.length === 4) {
            let sy = today.getFullYear();
            let sm = parseInt(sMD.substring(0,2)) - 1;
            let sd = parseInt(sMD.substring(2,4));
            let sDate = new Date(sy, sm, sd);
            if (sDate < today) sDate.setFullYear(sy + 1);
            let diffDays = Math.floor((sDate - today) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays <= 30) sangryung++;
        }
        
        let hasExp = false;
        try {
            let gArr = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(c, true) : [];
            gArr.forEach(i => {
                let ed = i['갱신일자'] || i['만기일자'] || i['갱신일'] || i['만기일'] || '';
                if(ed) {
                    let dStr = String(ed).replace(/\D/g, '');
                    if (dStr.length >= 6) {
                        let y = parseInt(dStr.substring(0,4));
                        let m = dStr.substring(4,6);
                        let cy = new Date().getFullYear();
                        if (y === cy && m === currentMonthStr) hasExp = true;
                    }
                }
            });
        } catch(e){}
        if (hasExp) expiry++;
    });

    const insightCounts = {};
    globalCustomerData.forEach(c => {
        let tags = String(c['터치인사이트'] || '').split(',').map(t=>t.trim()).filter(t=>t);
        tags.forEach(t => { 
            let mappedTag = t.trim();
            insightCounts[mappedTag] = (insightCounts[mappedTag] || 0) + 1; 
        });
    });
    
    Object.entries(insightCounts).forEach(([tag, count]) => {
        const el = document.getElementById('touch-count-' + tag);
        if (el) el.innerText = count;
    });

    const updateEls = (ids, text) => {
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = text;
        });
    };

    updateEls(['qf-count-total'], total + "명");
    updateEls(['qf-interest', 'qf-count-interest', 'pipe-count-interest'], interest);
    updateEls(['qf-count-consult', 'pipe-count-consult'], consult);
    updateEls(['qf-contract', 'qf-count-contract', 'pipe-count-contract'], contract);
    updateEls(['qf-count-care', 'pipe-count-care'], care);
    
    updateEls(['mini-badge-birth'], birth + "명");
    updateEls(['mini-badge-sangryung'], sangryung + "명");
    updateEls(['mini-badge-expiry'], expiry + "명");
};
function updateQuickFilterCounts() { return window.updateQuickFilterCounts(); }

// ===== ANTIGRAVITY FILTER LISTENER =====
window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'APPLY_FILTER') {
        console.log('Received APPLY_FILTER:', e.data);
        const fType = e.data.filterType;
        const fVal = e.data.value;
        
        const activeFilters = document.querySelectorAll('.filter-btn, .status-filter-btn');
        activeFilters.forEach(b => b.classList.remove('active'));
        window.currentQuickFilter = '';
        
        let filtered = [...globalCustomerData];
        
                if (fType === 'status') {
            filtered = filtered.filter(c => {
                const s = String(c['상태'] || c['고객상태'] || "");
                if (fVal === '관심') return s.includes('관심') || s.includes('가망');
                if (fVal === '체결') return s.includes('체결') || s.includes('계약');
                return s.includes(fVal);
            });
        } 
        else if (fType === 'insight') {
            filtered = filtered.filter(c => String(c['터치인사이트']).includes(fVal));
        }
        else if (fType === 'birth') {
            if (fVal === 'today') {
                const today = new Date();
                const currentMD = String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
                filtered = filtered.filter(c => {
                    let birthSource = String(c['생일'] || c['생년월일'] || c['주민번호'] || "");
                    let bMD = "";
                    if (birthSource.includes('-')) {
                        let p1 = birthSource.split('-')[0];
                        if (p1.length === 6) bMD = p1.substring(2,6);
                        else if (p1.length === 4 && birthSource.split('-').length === 3) bMD = birthSource.split('-')[1] + birthSource.split('-')[2];
                    }
                    if (!bMD) {
                        let b = birthSource.replace(/\D/g, '');
                        if (b.length >= 8) bMD = b.substring(4, 8);
                        else if (b.length >= 6) bMD = b.substring(2, 6);
                        else if (b.length >= 4) bMD = b.substring(0, 4);
                    }
                    return bMD === currentMD;
                });
            } else {
                filtered = filtered.filter(c => String(c['생일']).includes(fVal));
            }
        }
        else if (fType === 'sang') {
            if (fVal === 'today' || fVal === 'thisMonth') {
                const today = new Date();
                today.setHours(0,0,0,0);
                filtered = filtered.filter(c => {
                    let birthSource = String(c['생일'] || c['생년월일'] || c['주민번호'] || "");
                    let bMD = "";
                    if (birthSource.includes('-')) {
                        let p1 = birthSource.split('-')[0];
                        if (p1.length === 6) bMD = p1.substring(2,6);
                        else if (p1.length === 4 && birthSource.split('-').length === 3) bMD = birthSource.split('-')[1] + birthSource.split('-')[2];
                    }
                    if (!bMD) {
                        let b = birthSource.replace(/\D/g, '');
                        if (b.length >= 8) bMD = b.substring(4, 8);
                        else if (b.length >= 6) bMD = b.substring(2, 6);
                        else if (b.length >= 4) bMD = b.substring(0, 4);
                    }
                    
                    let sMD = "";
                    let s = String(c['상령일'] || "").replace(/\D/g, '');
                    if (s.length >= 8) sMD = s.substring(4, 8);
                    else if (s.length >= 6) sMD = s.substring(2, 6);
                    else if (s.length >= 4) sMD = s.substring(0, 4);
                    
                    if (!sMD && bMD && bMD.length === 4) {
                        let m = parseInt(bMD.substring(0,2));
                        let d = bMD.substring(2,4);
                        m = m + 6;
                        if (m > 12) m -= 12;
                        sMD = String(m).padStart(2, '0') + d;
                    }
                    
                    if (!sMD || sMD.length !== 4) return false;
                    let sm = parseInt(sMD.substring(0, 2), 10) - 1;
                    let sd = parseInt(sMD.substring(2, 4), 10);
                    let sDate = new Date(today.getFullYear(), sm, sd);
                    
                    if (sDate < today) {
                        sDate.setFullYear(today.getFullYear() + 1);
                    }
                    
                    const diffDays = Math.floor((sDate - today) / (1000 * 60 * 60 * 24));
                    return diffDays >= 0 && diffDays <= 30;
                });
            } else {
                filtered = filtered.filter(c => String(c['상령일']).includes(fVal));
            }
        }
        else if (fType === 'expiry') {
            const today = new Date();
            today.setHours(0,0,0,0);
            filtered = filtered.filter(c => {
                let hasExp = false;
                try {
                    let gArr = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(c, true) : [];
                    gArr.forEach(i => {
                        let ed = i['갱신일자'] || i['만기일자'] || i['갱신일'] || i['만기일'] || '';
                        if(ed) {
                            let dStr = String(ed).replace(/\D/g, '');
                            if (dStr.length >= 6) {
                                let y = parseInt(dStr.substring(0,4));
                                let m = dStr.substring(4,6);
                                let cy = new Date().getFullYear();
                                const currentMonthStr = String(new Date().getMonth() + 1).padStart(2, '0');
                                if (y === cy && m === currentMonthStr) hasExp = true;
                            }
                        }
                    });
                } catch(e){}
                return hasExp;
            });
        } else if (fType === 'insurance') {
            const lifeComps = ["한화생명","교보생명","농협생명","메트라이프","KDB생명","DB생명","흥국생명","동양생명","미래에셋생명","라이나생명","푸본현대생명","신한라이프","ABL생명","iM라이프","KB라이프","IBK연금보험","처브라이프","카디프생명","하나생명","AIA생명"];
            const nonlifeComps = ["삼성화재","메리츠화재","DB손해보험","KB손해보험","현대해상","한화손해보험","롯데손해보험","흥국화재","하나손해보험","NH농협손해보험","라이나손보","AIG손보","MG손해보험"];

            filtered = filtered.filter(c => {
                let match = false;
                try {
                    let gArr = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(c, true) : [];
                    gArr.forEach(i => {
                        let comp = String(i['보험사명'] || i['차_보험사명'] || i['차_보험사'] || i['company'] || '').trim();
                        let prod = String(i['상품명'] || i['차_상품명'] || i['product'] || '').trim();
                        if (fVal === '생보 전체보기') {
                            if (lifeComps.some(lc => comp.includes(lc) || lc.includes(comp))) match = true;
                        } else if (fVal === '손보 전체보기') {
                            if (nonlifeComps.some(nc => comp.includes(nc) || nc.includes(comp))) match = true;
                        } else {
                            if (comp === fVal || comp.includes(fVal) || prod.includes(fVal)) {
                                match = true;
                            }
                        }
                    });
                } catch(e) {
                    if (String(c['가입내역']).includes(fVal) || String(c['상품명']).includes(fVal)) match = true;
                }
                return match;
            });
        }
        
        if (typeof window.renderListModal === 'function') {
            window.renderListModal(filtered, fType, fVal);
        }
        
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
    }
});


window.closeModal = function() {
    const listModal = document.getElementById('listModal');
    if (listModal) {
        listModal.classList.remove('active');
        setTimeout(() => listModal.style.display = 'none', 300);
    }
};

window.renderListModal = function(filtered, fType, fVal) {
    const head = document.getElementById("listTableHead");
    const body = document.getElementById("listTableBody");
    const title = document.getElementById("modalTitle");
    if (!head || !body) return;

    let titleStr = "리스트";
    let thHtml = "<tr>";
    
    if (fType === 'status') {
        titleStr = "영업 파이프라인: " + fVal;
        thHtml += "<th>고객명</th><th>상태</th><th>직업</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
    } else if (fType === 'insight') {
        titleStr = "터치인사이트: " + fVal;
        thHtml += "<th>고객명</th><th>상태</th><th>직업</th><th>태그</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
    } else if (fType === 'birth' || fType === 'sang') {
        titleStr = fType === 'birth' ? "이번달 생일 고객" : "이번달 상령일 고객";
        thHtml += "<th>고객명</th><th>" + (fType === 'birth' ? '생일' : '상령일') + "</th><th>상태</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
    } else if (fType === 'expiry') {
        titleStr = "이번달 만기 예정 고객";
        thHtml += "<th>고객명</th><th>가입내역</th><th>만기일</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
    } else if (fType === 'insurance') {
        titleStr = "가입내역: " + fVal;
        thHtml += "<th>고객명</th><th>상품명</th><th>상태</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
    } else {
        thHtml += "<th>고객명</th><th>상태</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
    }

    thHtml += "</tr>";
    head.innerHTML = thHtml;

    let tbHtml = "";
    if (filtered.length === 0) {
        tbHtml = "<tr><td colspan='6' style='text-align:center; padding: 40px; color:#94a3b8;'>해당하는 고객이 없습니다.</td></tr>";
    } else {
        filtered.forEach(r => {
            const name = r["고객명"] || r["대표자명"] || "-";
            const phone = r["폰번호"] || r["대표자 연락처"] || "-";
            const status = r["상태"] || "-";
            const job = r["직업"] || "-";
            const id = r["고객번호"] || r["ID"] || "";
            
            tbHtml += "<tr>";
            if (fType === 'status') {
                tbHtml += "<td><div class='user-name' style='font-weight:700;'>" + name + "</div></td>";
                tbHtml += "<td><span class='pill' style='background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;'>" + status + "</span></td>";
                tbHtml += "<td>" + job + "</td>";
                tbHtml += "<td>" + phone + "</td>";
            } else if (fType === 'insight') {
                tbHtml += "<td><div class='user-name' style='font-weight:700;'>" + name + "</div></td>";
                tbHtml += "<td>" + status + "</td>";
                tbHtml += "<td>" + job + "</td>";
                tbHtml += "<td><span class='pill' style='background:#e0e7ff; color:#4338ca; border:1px solid #c7d2fe;'>" + fVal + "</span></td>";
                tbHtml += "<td>" + phone + "</td>";
            } else if (fType === 'birth' || fType === 'sang') {
                const dateVal = r[fType === 'birth' ? '생일' : '상령일'] || "-";
                tbHtml += "<td><div class='user-name' style='font-weight:700;'>" + name + "</div></td>";
                tbHtml += "<td><div style='color:var(--primary); font-weight:700;'>" + dateVal + "</div></td>";
                tbHtml += "<td>" + status + "</td>";
                tbHtml += "<td>" + phone + "</td>";
            } else if (fType === 'expiry') {
                let expiringInsName = "-";
                let expiringDate = "만기예정";
                try {
                    let gArr = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(r, true) : [];
                    const currentMonthStr = String(new Date().getMonth() + 1).padStart(2, '0');
                    let expItems = gArr.filter(i => {
                        let ed = i['갱신일자'] || i['만기일자'] || i['갱신일'] || i['만기일'] || '';
                        if (!ed) return false;
                        let dStr = String(ed).replace(/\D/g, '');
                        if (dStr.length >= 6) {
                            let y = parseInt(dStr.substring(0,4));
                            let m = dStr.substring(4,6);
                            let cy = new Date().getFullYear();
                            return y === cy && m === currentMonthStr;
                        }
                        return false;
                    });
                    if (expItems.length > 0) {
                        let names = [];
                        let dates = [];
                        expItems.forEach(expItem => {
                            let comp = expItem['보험사명'] || expItem['차_보험사명'] || expItem['차_보험사'] || "-";
                            let isCar = (expItem.isAuto === true || expItem.isAuto === "true" || expItem.isCar === true || expItem['보험분류'] === '자동차' || expItem['보험분류'] === '이륜차');
                            let fallbackProd = (expItem['차량용도'] && String(expItem['차량용도']).includes('이륜차')) ? "이륜차보험" : "자동차보험";
                            let prod = expItem['상품명'] || expItem['차_상품명'] || (isCar ? fallbackProd : "보험명 없음");
                            if (prod === "보험명 없음" && comp !== "-") prod = fallbackProd;
                            
                            let expInsured = expItem['피보험자'] || expItem['차_피보험자'] || expItem['기본피보험자'] || expItem['차_기본피보험자'] || "";
                            if (expInsured && expInsured !== name) {
                                prod += ` <span style="color:#ef4444; font-weight:700;">(피보험자: ${expInsured})</span>`;
                            }
                            names.push(`<span style="font-size:11px; color:#64748b; background:#f1f5f9; padding:2px 6px; border-radius:4px; margin-right:4px;">${comp}</span><br><span style="color:#0f172a;">${prod}</span>`);
                            dates.push(expItem['갱신일자'] || expItem['만기일자'] || expItem['갱신일'] || expItem['만기일'] || "만기예정");
                        });
                        expiringInsName = names.join('<hr style="margin:8px 0; border:0; border-top:1px dashed #cbd5e1;">');
                        expiringDate = dates.join('<hr style="margin:8px 0; border:0; border-top:1px dashed #cbd5e1;">');
                    }
                } catch(e) {}
                tbHtml += "<td><div class='user-name' style='font-weight:700;'>" + name + "</div></td>";
                tbHtml += "<td><div style='color:#475569; font-size:13px; max-width:200px; line-height:1.4;'>" + expiringInsName + "</div></td>";
                tbHtml += "<td><div style='color:var(--badge-red); font-weight:700;'>" + expiringDate + "</div></td>";
                tbHtml += "<td>" + phone + "</td>";
            } else if (fType === 'insurance') {
                let matchedProd = "-";
                try {
                    const lifeComps = ["한화생명","교보생명","농협생명","메트라이프","KDB생명","DB생명","흥국생명","동양생명","미래에셋생명","라이나생명","푸본현대생명","신한라이프","ABL생명","iM라이프","KB라이프","IBK연금보험","처브라이프","카디프생명","하나생명","AIA생명"];
                    const nonlifeComps = ["삼성화재","메리츠화재","DB손해보험","KB손해보험","현대해상","한화손해보험","롯데손해보험","흥국화재","하나손해보험","NH농협손해보험","라이나손보","AIG손보","MG손해보험"];
                    let gArr = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(r, true) : [];
                    let expItem = gArr.find(i => {
                        let comp = String(i['보험사명'] || i['차_보험사명'] || i['차_보험사'] || i['company'] || '').trim();
                        let prod = String(i['상품명'] || i['차_상품명'] || i['product'] || '').trim();
                        if (fVal === '생보 전체보기') {
                            return lifeComps.some(lc => comp.includes(lc) || lc.includes(comp));
                        } else if (fVal === '손보 전체보기') {
                            return nonlifeComps.some(nc => comp.includes(nc) || nc.includes(comp));
                        }
                        return comp === fVal || comp.includes(fVal) || prod.includes(fVal);
                    });
                    if (expItem) {
                        let comp = expItem['보험사명'] || expItem['차_보험사명'] || expItem['차_보험사'] || expItem.company || "-";
                        let prod = expItem['상품명'] || expItem['차_상품명'] || expItem.product || "상품명 없음";
                        matchedProd = `<span style="font-size:11px; color:#64748b; background:#f1f5f9; padding:2px 6px; border-radius:4px; margin-right:4px;">${comp}</span><br><span style="color:#0f172a;">${prod}</span>`;
                    }
                } catch(e) {}
                tbHtml += "<td><div class='user-name' style='font-weight:700;'>" + name + "</div></td>";
                tbHtml += "<td><div style='color:#475569; font-size:13px; max-width:200px; line-height:1.4;'>" + matchedProd + "</div></td>";
                tbHtml += "<td>" + status + "</td>";
                tbHtml += "<td>" + phone + "</td>";
            } else {
                tbHtml += "<td><div class='user-name' style='font-weight:700;'>" + name + "</div></td>";
                tbHtml += "<td>" + status + "</td>";
                tbHtml += "<td>" + phone + "</td>";
            }
            
            tbHtml += "<td style='text-align: right;'><button class='action-btn' onclick=\"if(typeof closeModal==='function') closeModal(); if(typeof openProfile==='function') openProfile('" + id + "');\" title='상세보기'><i class='fa-solid fa-ellipsis'></i></button></td>";
            tbHtml += "</tr>";
        });
    }
    
    body.innerHTML = tbHtml;
    if (title) title.innerHTML = "<i class='fa-solid fa-list' style='color:var(--primary);'></i> " + titleStr;
    
    const listModal = document.getElementById('listModal');
    if (listModal) {
        listModal.style.display = 'flex';
        setTimeout(() => listModal.classList.add('active'), 10);
    }
};





window.toggleAccordion = function(id) {
    const row = document.getElementById('acc-' + id);
    if(row) {
        if(row.style.display === 'none') row.style.display = 'table-row';
        else row.style.display = 'none';
    }
};

async function sortSheetByColumnA(spreadsheetId, sheetTitle) {
    try {
        const sheetMeta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
        const sheet = sheetMeta.result.sheets.find(s => s.properties.title === sheetTitle);
        if (!sheet) return;
        const sheetId = sheet.properties.sheetId;

        const requests = [{
            sortRange: {
                range: {
                    sheetId: sheetId,
                    startRowIndex: 1, 
                    startColumnIndex: 0,
                    endColumnIndex: 50
                },
                sortSpecs: [{
                    dimensionIndex: 0, 
                    sortOrder: "ASCENDING"
                }]
            }
        }];

        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            resource: { requests }
        });
        console.log("Sort completed: " + sheetTitle);
    } catch (e) {
        console.warn("Sort failed for " + sheetTitle + ":", e);
    }
}



window.checkOnlyOneBikeUsage = function(chk, insCount) {
    if (!chk.checked) return;
    const container = document.getElementById("bike-usage-wrapper-" + insCount);
    if (!container) return;
    container.querySelectorAll('input[type="checkbox"]').forEach(c => {
        if (c !== chk) c.checked = false;
    });
};

window.handleCarUsageChange = function(selectElem, insCount) {
    const val = selectElem.value;
    const directWrapper = document.getElementById("direct-wrapper-" + insCount);
    const bikeWrapper = document.getElementById("bike-usage-wrapper-" + insCount);
    
    if (val === "이륜차") {
        if (directWrapper) {
            directWrapper.style.display = "none";
            const directChk = directWrapper.querySelector('input[type="checkbox"]');
            if (directChk) directChk.checked = false;
        }
        if (bikeWrapper) bikeWrapper.style.display = "block";
    } else {
        if (directWrapper) directWrapper.style.display = "flex";
        if (bikeWrapper) {
            bikeWrapper.style.display = "none";
            bikeWrapper.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
        }
    }
};


// ===== CRM_TEST Family Setup Wizard Helpers =====
window.wizardMode = "single";
window.wizardRowCount = 1;

window.setWizardMode = function(mode) {
    window.wizardMode = mode;
    if (mode === "family") {
        document.getElementById("wizard-step-1").style.display = "none";
        document.getElementById("family-setup-area").style.display = "block";
    } else if (mode === "back") {
        document.getElementById("wizard-step-1").style.display = "block";
        document.getElementById("family-setup-area").style.display = "none";
    } else if (mode === "single") {
        document.getElementById("wizard-step-1").style.display = "block";
        document.getElementById("family-setup-area").style.display = "none";
    }
};

window.handleWizardRelChange = function(selectElem) {
    const customInput = selectElem.nextElementSibling;
    if (selectElem.value === "기타") {
        customInput.style.display = "inline-block";
        selectElem.style.display = "none";
    }
};

window.addWizardFamilyRow = function() {
    window.wizardRowCount++;
    const div = document.createElement("div");
    div.className = "wizard-row";
    div.id = "wrow-" + window.wizardRowCount;
    div.style.cssText = "display: flex; gap: 10px; align-items: center; margin-bottom: 12px;";
    div.innerHTML = `
        <select class="w-rel" onchange="handleWizardRelChange(this)" style="padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; flex: 0.5; outline: none;">
            <option value="">관계 선택</option>
            <option value="배우자">배우자</option>
            <option value="자녀">자녀</option>
            <option value="부모">부모 (부/모)</option>
            <option value="조부모">조부모 (조부/조모)</option>
            <option value="형제/자매">형제/자매</option>
            <option value="손자녀">손자녀 (손자/손녀)</option>
            <option value="며느리/사위">며느리/사위</option>
            <option value="친척">친척</option>
            <option value="직원">직원</option>
            <option value="기타">기타 (직접입력)</option>
        </select>
        <input type="text" class="w-rel-custom" placeholder="직접입력" style="display:none; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; flex: 0.5; outline: none;">
        <input type="text" class="w-name" placeholder="성함 입력" style="padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; flex: 1; outline: none;">
        <button type="button" onclick="document.getElementById('wrow-${window.wizardRowCount}').remove()" style="background: transparent; color: #ef4444; border: 1px solid #ef4444; padding: 9px 12px; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: bold;"><i class="fa-solid fa-minus"></i> 삭제</button>
    `;
    document.getElementById("wizard-family-list").appendChild(div);
};

window.executeWizardStart = function() {
    window.disableInitFamilyTabs = false;
    document.getElementById("regSetupWizard").style.display = "none";
    document.getElementById("crmRegForm").style.display = "flex";
    
    const rootId = document.getElementById("base-cust-id").value;
    const mainName = document.getElementById("wizard-main-name").value.trim() || '무명고객';
    
          if (typeof window.initFamilyTabs === "function") {
          window.initFamilyTabs(rootId, mainName + ' (본인)');
      } else if (typeof initFamilyTabs === "function") {
          initFamilyTabs(rootId, mainName + ' (본인)');
      } else {
          alert("오류: 탭 초기화 함수(initFamilyTabs)를 찾을 수 없습니다. 브라우저 캐시를 비워주세요.");
      }

    const mw = document.querySelector('.sian-main-wrapper'); 
    if (mw) mw.style.display = 'flex';
    
    // update root tab data in DOM
    const nameInput = document.querySelector("#crmRegForm input[name='고객명']");
    if (nameInput) nameInput.value = mainName;
    
    // update root tab in familyState
    if (window.familyState && window.familyState[0]) {
        window.familyState[0].data["고객명"] = mainName;
    }
    
    if (window.wizardMode === "family") {
        const rows = document.querySelectorAll(".wizard-row");
        rows.forEach((row) => {
            const relSelect = row.querySelector(".w-rel");
            const relCustom = row.querySelector(".w-rel-custom");
            const nameInput = row.querySelector(".w-name");
            
            let rel = relSelect.value;
            if (rel === "기타") rel = relCustom.value.trim();
            const nm = nameInput.value.trim();
            
            if (nm || rel) {
                if (window.familyState) {
                    const displayLabel = nm ? rel + '(' + nm + ')' : rel;
                    const newId = window.familyState[0].id + '-' + window.familyState.length;
                    window.familyState.push({
                        id: newId,
                        label: displayLabel,
                        isRoot: false,
                        data: {
                            "고객번호": newId,
                            "가족사항": rel,
                            "고객명": nm
                        },
                        insHtml: ''
                    });
                }
            }
        });
        
        if (window.familyState && window.familyState.length > 1) {
            const rootMember = window.familyState[0];
            const familyStr = window.familyState
                .filter(f => !f.isRoot)
                .map(f => {
                    const fRel = f.data['가족_관계'] || f.data['가족사항'] || '가족';
                    const fName = f.data['고객명'] || '이름미상';
                    return fRel + '(' + fName + ')';
                })
                .join(', ');
                
            rootMember.data['가족사항'] = familyStr;
            const fsInput = document.querySelector("#crmRegForm input[name='가족사항']");
            if (fsInput) fsInput.value = familyStr;
        }
        if (typeof window.upgradeAllInsurancesToSmartUI === 'function') window.upgradeAllInsurancesToSmartUI();
    }
    
          if (typeof window.renderFamilyTabs === "function") {
          window.renderFamilyTabs();
      } else if (typeof renderFamilyTabs === "function") {
          renderFamilyTabs();
      }
};
window.handleDriverMemo = function(sel, idx) {
    const memo = document.getElementById(`driver-memo-${idx}`);
    const needsMemo = ['기명피보험자 및 지정 1인 한정', '가족 및 형제·자매 한정', '가족 및 지정 1인 한정', '누구나 운전 (기본 / 제한 없음)'].includes(sel.value);
    if (memo) {
        memo.style.display = needsMemo ? 'block' : 'none';
        if (!needsMemo) memo.value = '';
    }
    window.updateDriverHidden(idx);
};
window.updateDriverHidden = function(idx) {
    const sel = document.querySelector(`[onchange="window.handleDriverMemo(this, ${idx})"]`);
    const memo = document.getElementById(`driver-memo-${idx}`);
    const hidden = document.getElementById(`driver-hidden-${idx}`);
    if (sel && hidden) {
        let finalVal = sel.value;
        if (memo && memo.style.display !== 'none' && memo.value.trim()) {
            finalVal += ` [${memo.value.trim()}]`;
        }
        hidden.value = finalVal;
    }
};
document.addEventListener('DOMContentLoaded', () => {
    const nameInput = document.querySelector('input[name="고객명"]');
    if(nameInput) {
        nameInput.addEventListener('input', function() {
            const newName = this.value.trim() || '무명고객';
            if (window.familyState && window.activeFamilyId) {
                let activeTab = window.familyState.find(f => f.id === window.activeFamilyId);
                if (activeTab) {
                    activeTab.data['고객명'] = newName;
                    const rootId = activeTab.id;
                    
                    // Update Pill Texts
                    document.querySelectorAll('.ins-pill-btn[data-id="' + rootId + '"]').forEach(btn => {
                        btn.innerText = newName;
                        btn.setAttribute('data-name', newName);
                        // If this pill is currently active, update the real-input as well
                        if (btn.classList.contains('active')) {
                            const group = btn.closest('.smart-ins-group');
                            if (group) {
                                const realInput = group.querySelector('.real-input');
                                if (realInput) realInput.value = newName;
                            }
                        }
                    });
                }
            }
        });
    }
});
document.body.addEventListener('input', function(e) {
    if (e.target && e.target.name === '고객명') {
        const newName = e.target.value.trim() || '무명고객';
        if (window.familyState && window.activeFamilyId) {
            let activeTab = window.familyState.find(f => f.id === window.activeFamilyId);
            if (activeTab) {
                activeTab.data['고객명'] = newName;
                const rootId = activeTab.id;
                document.querySelectorAll('.ins-pill-btn[data-id="' + rootId + '"]').forEach(btn => {
                    btn.innerText = newName;
                    btn.setAttribute('data-name', newName);
                    if (btn.classList.contains('active')) {
                        const group = btn.closest('.smart-ins-group');
                        if (group) {
                            const realInput = group.querySelector('.real-input');
                            if (realInput) realInput.value = newName;
                        }
                    }
                });
            }
        }
    }
});

window.openTotalCustomers = function() {
    window.targetSheetName = "weraclecrm" || 'weraclecrm'; //  전체보기 시 일반고객 모드로 초기화
    window.currentQuickFilter = '';
    const searchInput = document.getElementById('masterSearch');
    if (searchInput) searchInput.value = '';
    
    const activeFilters = document.querySelectorAll('.filter-btn, .status-filter-btn, .db-pipeline-btn');
    activeFilters.forEach(b => b.classList.remove('active'));
    
    if (typeof window.renderTable === 'function') {
        window.renderTable(globalCustomerData);
    }
    
    if (typeof openMasterModal === 'function') {
        openMasterModal();
    } else {
        const masterModal = document.getElementById('masterModal');
          if (masterModal) {
              masterModal.style.display = 'flex';
              setTimeout(() => masterModal.classList.add('active'), 10);
          }
    }
    
    const mTitle = document.querySelector('#masterModal .modal-title');
    if (mTitle) {
        const memCountEl = document.getElementById('memberCount');
        const count = memCountEl ? memCountEl.innerText : globalCustomerData.length;
        mTitle.innerHTML = '<i class="fa-solid fa-users" style="color:var(--primary);"></i> 전체 고객 마스터 리스트 <span id="memberCount" style="font-size:16px; margin-left:10px; color:#64748b;">' + count + '</span>';
    }
};
window.copyMaskedCustomerInfo = function(btn, name, jumin, phone, address, job, mask = false) {
    if (typeof copyCustomerInfo === 'function') {
        copyCustomerInfo(btn, name, jumin, phone, address, job, mask);
        return;
    }
    let maskedJumin = mask ? (formatJumin(jumin, true) || jumin) : (formatJumin(jumin, false) || jumin);
    const text = `고객명: ${name}\n주민번호: ${maskedJumin}\n연락처: ${phone}\n주소: ${address}\n직업: ${job}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showCustomAlert("복사 완료", mask ? "전달용 1차 정보(마스킹)가 복사되었습니다." : "전달용 1차 정보가 복사되었습니다.");
        }).catch(() => {
            fallbackCopyTextToClipboard(text);
        });
    } else {
        fallbackCopyTextToClipboard(text);
    }
};
// --- 대량 등록 (Bulk Registration) 로직 ---
window.openBulkRegModal = function() {
    const w = document.getElementById('regModal'); if (w) { w.classList.remove('active'); w.style.display = 'none'; }

    ['bulkColName', 'bulkColJumin', 'bulkColPhone', 'bulkColAddr', 'bulkColJob', 'bulkColMemo'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });
    const wrapper = document.getElementById('bulkDataInputWrapper');
    if (wrapper) wrapper.style.display = 'block';
    document.getElementById('bulkPreviewArea').style.display = 'none';
    document.getElementById('bulkPreviewBtn').style.display = 'block';
    document.getElementById('bulkSubmitBtn').style.display = 'none';
    document.getElementById('bulkPreviewTableBody').innerHTML = '';
    document.getElementById('bulkRegModal').style.display = 'flex';
};

let bulkParsedData = [];

window.previewBulkData = function() { try {
    const getLines = (id) => {
        const el = document.getElementById(id);
        if(!el) return [];
        // Do not trim entirely to preserve empty lines at the start/end if they pasted a column with blanks.
        // Actually, let's split by \n first, then trim each line.
        const val = el.value.replace(/\r/g, '');
        if (!val.trim()) return [];
        const lines = val.split('\n').map(line => line.trim());
        // Remove trailing empty lines to prevent Excel's trailing newline from creating a ghost row
        while(lines.length > 0 && lines[lines.length - 1] === '') {
            lines.pop();
        }
        return lines;
    };

    const names = getLines('bulkColName');
    const jumins = getLines('bulkColJumin');
    const phones = getLines('bulkColPhone');
    const addrs = getLines('bulkColAddr');
    const jobs = getLines('bulkColJob');
    const memos = getLines('bulkColMemo');

    if (names.length === 0) {
        alert("최소한 이름 열 데이터는 붙여넣어야 합니다.");
        return;
    }
    
    // Check lengths to prevent shifting. Only compare lengths of columns that have actual data.
    const lengths = [names.length, jumins.length, phones.length, addrs.length, jobs.length, memos.length].filter(l => l > 0);
    const maxLen = Math.max(...lengths);
    const minLen = Math.min(...lengths);
    
    if (lengths.length > 1 && maxLen !== minLen) {
        alert("입력하신 열들의 줄 수(데이터 행 수)가 서로 다릅니다!\n(예: 이름은 " + names.length + "줄인데 다른 데이터는 " + minLen + "줄입니다.)\n데이터가 짝이 안 맞고 밀릴 수 있으므로, 엑셀에서 복사하실 때 줄 수를 똑같이 맞춰주세요.");
        return;
    }

    const rowCount = maxLen;
    let maxId = 0;
    (window.globalCustomerData || []).forEach(c => {
        let idVal = c["고객번호"] || c["사업자번호"] || c["ID"];
        if(idVal) {
            let numStr = String(idVal).split('-')[0].replace(/\D/g, '');
            if(numStr) {
                let n = parseInt(numStr, 10);
                if(!isNaN(n) && n > maxId) maxId = n;
            }
        }
    });

    bulkParsedData = [];
    let html = '';
    let currentId = maxId + 1;
    let hasError = false;

    for (let i = 0; i < rowCount; i++) {
        const name = names[i] || '';
        const jumin = jumins[i] || '';
        const phone = formatPhone(phones[i] || '');
        const addr = addrs[i] || '';
        const job = jobs[i] || '';
        const memo = memos[i] || '';

        const isNameMissing = !name;
        if (isNameMissing) hasError = true;

        bulkParsedData.push({
            고객번호: currentId.toString(),
            고객명: name,
            주민번호: jumin,
            폰번호: phone,
            주소: addr,
            직업: job,
            특이사항: memo
        });

        const trStyle = isNameMissing ? 'background:#fee2e2;' : 'background:white;';
        const nameStyle = isNameMissing ? 'color:#ef4444; font-weight:800;' : '';

        html += `<tr style="${trStyle}">
            <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-weight:700; color:#3b82f6;">${currentId}</td>
            <td style="padding:10px; border-bottom:1px solid #e2e8f0; ${nameStyle}">${name || '이름 누락(필수)'}</td>
            <td style="padding:10px; border-bottom:1px solid #e2e8f0;">${jumin}</td>
            <td style="padding:10px; border-bottom:1px solid #e2e8f0;">${phone}</td>
            <td style="padding:10px; border-bottom:1px solid #e2e8f0;">${addr}</td>
            <td style="padding:10px; border-bottom:1px solid #e2e8f0;">${job}</td>
            <td style="padding:10px; border-bottom:1px solid #e2e8f0; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${memo}</td>
        </tr>`;

        currentId++;
    }

    document.getElementById('bulkCount').innerText = bulkParsedData.length;
    document.getElementById('bulkPreviewTableBody').innerHTML = html;
    document.getElementById('bulkPreviewArea').style.display = 'block';
    document.getElementById('bulkDataInputWrapper').style.display = 'none';

    if (hasError) {
        alert("이름이 누락된 행이 있습니다. 붉은색으로 표시된 행을 확인 후 다시 붙여넣어 주세요.");
        document.getElementById('bulkSubmitBtn').style.display = 'none';
    } else if (bulkParsedData.length > 0) {
        document.getElementById('bulkSubmitBtn').style.display = 'block'; document.getElementById('bulkPreviewBtn').style.display = 'none'; } } catch(e) { alert("Preview Error: " + e.message + "\n" + e.stack); } };

window.submitBulkData = async function() {
    if (bulkParsedData.length === 0) return;
    if (!confirm(`총 ${bulkParsedData.length}명의 고객을 등록하시겠습니까?`)) return;
    
    document.getElementById('bulkSubmitBtn').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';
    document.getElementById('bulkSubmitBtn').disabled = true;

    try {
        const spreadsheetId = (window.spreadsheetId || localStorage.getItem("g_sheet_id"));
        if (!spreadsheetId) throw new Error("구글 시트 ID가 설정되지 않았습니다.");

        const sName = window.targetSheetName || (window.targetSheetName || "weraclecrm");
        const headers = getCrmHeaders(sName); // 전체 컬럼 헤더 배열

        // bulkParsedData를 2차원 배열(values)로 변환
        const valuesToAppend = bulkParsedData.map(data => {
            const rowArr = new Array(headers.length).fill(""); // 기본적으로 모두 빈 문자열로 초기화
            
            // 등록일자는 오늘 날짜로 세팅
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const todayStr = `${yyyy}-${mm}-${dd}`;

            // 나이/성별/상령일은 주민번호로 자동 계산
            let calculatedAge = '', calculatedGender = '', calculatedSang = '', calculatedBirth = '';
            const cleanJumin = data.주민번호.replace(/-/g, "");
            if (cleanJumin && cleanJumin.length >= 6) {
                const jd = typeof calculateJuminData === 'function' ? calculateJuminData(cleanJumin) : null;
                if (jd) {
                    calculatedAge = jd.age || '';
                    calculatedGender = jd.gender || '';
                    calculatedBirth = jd.birth || '';
                    calculatedSang = jd.sang || '';
                }
            }

            // 헤더 인덱스에 맞춰 데이터 꽂아넣기
            headers.forEach((h, i) => {
                const head = String(h).trim();
                if (head === "고객번호" || head === "ID") rowArr[i] = data.고객번호;
                else if (head === "고객명" || head === "대표자명") rowArr[i] = data.고객명;
                else if (head === "주민번호" || head === "사업자번호") rowArr[i] = data.주민번호;
                else if (head === "폰번호" || head === "대표자폰번호") rowArr[i] = data.폰번호;
                else if (head === "주소" || head === "대표주소") rowArr[i] = data.주소;
                else if (head === "직업" || head === "업태") rowArr[i] = data.직업;
                else if (head === "특이사항") rowArr[i] = data.특이사항;
                else if (head === "등록일") rowArr[i] = todayStr;
                else if (head === "상태") rowArr[i] = "관심고객";
                else if (head === "나이" && calculatedAge) rowArr[i] = calculatedAge;
                else if (head === "성별" && calculatedGender) rowArr[i] = calculatedGender;
                else if (head === "상령일" && calculatedSang) rowArr[i] = calculatedSang;
                else if (head === "생일" && calculatedBirth) rowArr[i] = calculatedBirth;
                else if (head === "담당자") {
                    const savedAgent = localStorage.getItem("googleUserName");
                    if (savedAgent) rowArr[i] = savedAgent;
                }
            });

            return rowArr;
        });

        // 한 번에 Append
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId,
            range: `${sName}!A:A`, // 시트의 A열 끝에 자동으로 맞춰서 삽입
            valueInputOption: "USER_ENTERED",
            resource: { values: valuesToAppend }
        });

        alert(`성공적으로 ${bulkParsedData.length}명의 고객이 등록되었습니다!`);
        document.getElementById('bulkRegModal').style.display = 'none';
        
        // 데이터 리로드
        if (typeof loadCRMData === 'function') {
            await loadCRMData();
        } else if (typeof loadData === 'function') {
            loadData();
        } else if (typeof window.location.reload === 'function') {
            window.location.reload();
        }

    } catch (error) {
        console.error("Bulk Insert Error:", error);
        
        let errMsg = error.message;
        if (!errMsg && error.result && error.result.error) errMsg = error.result.error.message;
        if (!errMsg) errMsg = JSON.stringify(error);
        alert("일괄 등록 중 오류가 발생했습니다:\n" + errMsg);
    } finally {
        const btn = document.getElementById('bulkSubmitBtn');
        btn.innerHTML = '등록 ';
        btn.disabled = false;
    }
};
window.closeMasterModal = function() {
    const m = document.getElementById('masterModal');
    if (m) {
        m.classList.remove('active');
        setTimeout(() => m.style.display = 'none', 300);
    }
};

window.syncCustomerNameToTabs = function(newName) {
    const safeName = newName.trim();
    if (!safeName) return;
    document.querySelectorAll('.insurance-entry').forEach(entry => {
        const diffCb = entry.querySelector('.diff-cb');
        if (diffCb && diffCb.checked) {
            const contractorInput = entry.querySelector('input[name="계약자"], input[name="차_계약자"]');
            // Update if empty or matches previous states
            if (contractorInput && (!contractorInput.value || contractorInput.dataset.autoSynced === "true")) {
                contractorInput.value = safeName;
                contractorInput.dataset.autoSynced = "true";
            }
        }
    });
};


// --- 스마트 간편 등록 (Smart Registration) ---
window.openSmartRegModal = function() {
    // 마법사 모달 닫기
    const w = document.getElementById('regModal');
    if (w) { w.classList.remove('active'); w.style.display = 'none'; }
    
    // 스마트 모달 초기화
    document.getElementById('smartRegInput').value = '';
    ['smartRegName', 'smartRegJumin', 'smartRegPhone', 'smartRegAddr', 'smartRegJob', 'smartRegMemo'].forEach(id => {
        document.getElementById(id).value = '';
    });
    
    let maxId = 0;
    if (typeof globalCustomerData !== 'undefined' && globalCustomerData.length > 0) {
        globalCustomerData.forEach(c => {
            const num = parseInt(c['고객번호'] || c['ID'], 10);
            if (!isNaN(num) && num > maxId) maxId = num;
        });
    }
    const newId = maxId > 0 ? (maxId + 1).toString() : "1";
    if(document.getElementById('smartRegId')) document.getElementById('smartRegId').value = newId;
    
    if(document.getElementById('smartRegChunkContainer')) document.getElementById('smartRegChunkContainer').innerHTML = '<div style="color:#94a3b8; font-size:13px; text-align:center; margin-top:20px;">텍스트를 입력하면 여기에 드래그 가능한 블록이 생성됩니다.</div>';
    document.getElementById('smartRegTooltip').style.display = 'none';
    
    document.getElementById('smartRegModal').style.display = 'flex';
};

window.closeSmartRegModal = function() {
    document.getElementById('smartRegModal').style.display = 'none';
};

window.autoParseSmartReg = function() {
    const txt = document.getElementById('smartRegInput').value;
    const container = document.getElementById('smartRegChunkContainer');
    
    // Auto-fill logic
    const phoneMatch = txt.match(/010[- .]?\d{3,4}[- .]?\d{4}/);
    if (phoneMatch && !document.getElementById('smartRegPhone').value) document.getElementById('smartRegPhone').value = phoneMatch[0];
    
    const juminMatch = txt.match(/\d{2}[01]\d[0-3]\d[- .]?[1-4]\d{6}/);
    if (juminMatch && !document.getElementById('smartRegJumin').value) document.getElementById('smartRegJumin').value = juminMatch[0];
    
    const nameMatch = txt.match(/^[가-힣]{2,4}\b|\b[가-힣]{2,4}(?=\s*(010|\d{6}))/);
    if (nameMatch && !document.getElementById('smartRegName').value) document.getElementById('smartRegName').value = nameMatch[0].trim();
    
    const addrMatch = txt.match(/([가-힣]+(시|도)\s+)?[가-힣]+(구|군)\s+[가-힣]+(동|면|읍|리)\s+[\w~-]+(길|로)?/);
    if (addrMatch && !document.getElementById('smartRegAddr').value) document.getElementById('smartRegAddr').value = addrMatch[0].trim();

    if (!container) return;
    
    if (!txt.trim()) {
        container.innerHTML = '<div style="color:#94a3b8; font-size:13px; text-align:center; margin-top:20px;">텍스트를 입력하면 여기에 드래그 가능한 블록이 생성됩니다.</div>';
        return;
    }

    const lines = txt.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let html = '';
    
    lines.forEach((line, i) => {
        let isAssigned = false;
        let assignedTo = '';
        
        if (phoneMatch && line.includes(phoneMatch[0])) { isAssigned = true; assignedTo = '전화번호'; }
        else if (juminMatch && line.includes(juminMatch[0])) { isAssigned = true; assignedTo = '주민번호'; }
        else if (nameMatch && line.includes(nameMatch[0].trim())) { isAssigned = true; assignedTo = '고객명'; }
        else if (addrMatch && line.includes(addrMatch[0].trim())) { isAssigned = true; assignedTo = '주소'; }
        
        let bg = isAssigned ? '#f1f5f9' : '#ffffff';
        let border = isAssigned ? '#e2e8f0' : '#3b82f6';
        let icon = isAssigned ? '<i class="fa-solid fa-check" style="color:#10b981; margin-right:6px;"></i>' : '<i class="fa-solid fa-grip-vertical" style="color:#94a3b8; margin-right:8px; cursor:grab;"></i>';
        let badge = isAssigned ? '<span style="font-size:11px; background:#e2e8f0; color:#475569; padding:2px 6px; border-radius:4px; margin-left:8px;">' + assignedTo + '</span>' : '';
        let opacity = isAssigned ? '0.7' : '1';
        
        html += '<div draggable="true" ondragstart="window.startSmartDrag(event, this)" style="display:flex; align-items:center; background:' + bg + '; border:2px solid ' + border + '; border-radius:8px; padding:10px 14px; cursor:grab; opacity:' + opacity + '; transition:all 0.2s;" onmouseover="this.style.boxShadow=\'0 2px 5px rgba(0,0,0,0.1)\'" onmouseout="this.style.boxShadow=\'none\'">' +
                    icon +
                    '<div style="font-size:14px; font-weight:600; color:#334155; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + line + '</div>' +
                    badge +
                '</div>';
    });
    
    container.innerHTML = html;
};

// --- DnD Smart Registration Logic ---
window.startSmartDrag = function(e, el) {
    const text = el.querySelector('div').innerText;
    e.dataTransfer.setData('text/plain', text);
    e.dataTransfer.effectAllowed = 'copy';
    
    if (!document.getElementById('dnd-smart-style')) {
        const style = document.createElement('style');
        style.id = 'dnd-smart-style';
        style.innerHTML = '.dnd-target-active { outline: 2px dashed #93c5fd !important; background: #f8fafc !important; transition: all 0.2s; } .dnd-drag-over { outline: 2px solid #3b82f6 !important; background: #eff6ff !important; }';
        document.head.appendChild(style);
    }
    
    document.querySelectorAll('#smartRegModal .form-input').forEach(inp => {
        inp.classList.add('dnd-target-active');
    });
};

document.addEventListener('dragend', function(e) {
    document.querySelectorAll('#smartRegModal .form-input').forEach(inp => {
        inp.classList.remove('dnd-target-active');
        inp.classList.remove('dnd-drag-over');
    });
});

document.addEventListener('dragover', function(e) {
    if (e.target.classList && e.target.classList.contains('form-input')) {
        e.preventDefault(); 
        e.dataTransfer.dropEffect = 'copy';
        e.target.classList.add('dnd-drag-over');
    }
});

document.addEventListener('dragleave', function(e) {
    if (e.target.classList && e.target.classList.contains('form-input')) {
        e.target.classList.remove('dnd-drag-over');
    }
});

document.addEventListener('drop', function(e) {
    if (e.target.classList && e.target.classList.contains('form-input')) {
        e.preventDefault();
        const text = e.dataTransfer.getData('text/plain');
        e.target.value = text;
        e.target.classList.remove('dnd-drag-over');
        
        e.target.style.transition = 'all 0.3s';
        e.target.style.background = '#dbeafe';
        e.target.style.borderColor = '#3b82f6';
        setTimeout(() => {
            e.target.style.background = '';
            e.target.style.borderColor = '';
        }, 500);
    }
});

  document.addEventListener('DOMContentLoaded', () => {
    const smartInput = document.getElementById('smartRegInput');
    const tooltip = document.getElementById('smartRegTooltip');
    
    if (smartInput && tooltip) {
        smartInput.addEventListener('mouseup', function(e) {
            const start = this.selectionStart;
            const end = this.selectionEnd;
            if (start !== end) {
                // 텍스트가 선택됨
                window.lastSmartRegSelection = this.value.substring(start, end).trim();
                
                // 툴팁 위치 계산
                const rect = this.getBoundingClientRect();
                // 텍스트 안의 커서 위치를 정확히 알긴 어려우므로 마우스 위치 기준
                tooltip.style.left = e.clientX + 'px';
                tooltip.style.top = (e.clientY - 15) + 'px';
                tooltip.style.display = 'flex';
            } else {
                tooltip.style.display = 'none';
            }
        });
        
        // 입력창 외 클릭 시 툴팁 닫기
        document.addEventListener('mousedown', function(e) {
            if (e.target !== smartInput && !tooltip.contains(e.target)) {
                tooltip.style.display = 'none';
            }
        });
    }
});

window.assignSmartReg = function(fieldId) {
    if (window.lastSmartRegSelection) {
        document.getElementById(fieldId).value = window.lastSmartRegSelection;
        document.getElementById('smartRegTooltip').style.display = 'none';
    }
};

window.submitSmartReg = async function() {
    const name = document.getElementById('smartRegName').value.trim();
    if (!name) {
        alert("고객명을 입력해주세요.");
        return;
    }
    
    const jumin = document.getElementById('smartRegJumin').value.trim();
    const phone = document.getElementById('smartRegPhone').value.trim();
    const addr = document.getElementById('smartRegAddr').value.trim();
    const job = document.getElementById('smartRegJob').value.trim();
    const memo = document.getElementById('smartRegMemo').value.trim();
    
    // Get assigned ID
    let newId = document.getElementById('smartRegId') ? document.getElementById('smartRegId').value : "";
    if(!newId) {
        let maxId = 0;
        if (typeof globalCustomerData !== 'undefined' && globalCustomerData.length > 0) {
            globalCustomerData.forEach(c => {
                const num = parseInt(c['고객번호'] || c['ID'], 10);
                if (!isNaN(num) && num > maxId) maxId = num;
            });
        }
        newId = maxId > 0 ? (maxId + 1).toString() : "1";
    }
    
    // 시트 업로드 (대량등록 로직 차용)
    if (typeof gapi === 'undefined' || !gapi.client || !gapi.client.sheets) {
        alert("Google Sheets API가 초기화되지 않았습니다.");
        return;
    }
    
    const spreadsheetId = (window.spreadsheetId || localStorage.getItem('g_sheet_id')); if(!spreadsheetId) { alert('연동된 구글 시트 ID가 없습니다.'); return; }
    const sName = "weraclecrm"; // 간편등록은 무조건 일반고객(weraclecrm)으로 고정
    
    try {
        const headers = (typeof getCrmHeaders === 'function') ? getCrmHeaders(sName) : window.getCrmHeaders(sName);
        const rowArr = new Array(headers.length).fill("");
        
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = yyyy + "-" + mm + "-" + dd;
        
        let calculatedAge = '', calculatedGender = '', calculatedSang = '', calculatedBirth = '';
        const cleanJumin = jumin.replace(/-/g, "");
        if (cleanJumin && cleanJumin.length >= 6) {
            const jd = (typeof calculateJuminData === 'function') ? calculateJuminData(cleanJumin) : (window.calculateJuminData ? window.calculateJuminData(cleanJumin) : null);
            if (jd) {
                calculatedAge = jd.age || '';
                calculatedGender = jd.gender || '';
                calculatedBirth = jd.birth || '';
                calculatedSang = jd.sang || '';
            }
        }
        
        const newUid = "UID_" + new Date().getTime() + "_" + Math.floor(Math.random()*1000);
        
        headers.forEach((h, i) => {
            const head = String(h).trim();
            if (head === "고객번호" || head === "ID") rowArr[i] = newId;
            else if (head === "고객명" || head === "대표자명") rowArr[i] = name;
            else if (head === "주민번호" || head === "사업자번호") rowArr[i] = jumin;
            else if (head === "폰번호" || head === "대표자폰번호") rowArr[i] = phone;
            else if (head === "주소" || head === "대표주소") rowArr[i] = addr;
            else if (head === "직업" || head === "대표업태") rowArr[i] = job;
            else if (head === "특이사항" || head === "메모") rowArr[i] = memo;
            else if (head === "상태") rowArr[i] = "관심고객";
            else if (head === "나이") rowArr[i] = calculatedAge;
            else if (head === "성별") rowArr[i] = calculatedGender;
            else if (head === "생일") rowArr[i] = calculatedBirth;
            else if (head === "상령일") rowArr[i] = calculatedSang;
            else if (head === "등록일") rowArr[i] = todayStr;
            else if (head === "UID") rowArr[i] = newUid;
        });
        
        const endCol = (typeof getCrmEndCol === 'function') ? getCrmEndCol(sName) : window.getCrmEndCol(sName);
        const rangeStr = sName + "!A1:" + endCol + "1";
        
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId,
            range: rangeStr,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: [rowArr] }
        });
        
        alert("성공적으로 간편 등록되었습니다!");
        window.closeSmartRegModal();
        
        // Optimistic Update: 화면 즉시 갱신 및 로딩창 방지 (버벅임 해결)
        if (typeof globalCustomerData !== 'undefined') {
            const newObj = {};
            headers.forEach((h, i) => { newObj[String(h).trim()] = rowArr[i]; });
            newObj.rowNumber = globalCustomerData.length > 0 ? Math.max(...globalCustomerData.map(c => c.rowNumber || 0)) + 1 : 2;
            newObj.sheetName = "weraclecrm";
            globalCustomerData.push(newObj);
            
            if (typeof updateQuickFilterCounts === 'function') updateQuickFilterCounts();
            if (typeof renderTable === 'function') renderTable();
        }
    } catch (e) {
        console.error("Smart reg error:", e);
        let msg = e.message; if(!msg && e.result && e.result.error) msg = e.result.error.message; 
        
        if (msg === "Failed to fetch" || msg.includes("A network error occurred")) {
            alert("구글 로그인 세션(1시간)이 만료되어 연결이 끊겼습니다.\n\n우측 상단의 [연동 해제] 버튼을 누른 후, 다시 Google 로그인을 진행해 주시면 즉시 해결됩니다.");
        } else {
            alert("등록 중 오류가 발생했습니다: " + msg);
        }
        console.error(e);
    }
};






// ==========================================
//  QUICK EDIT MODULE (Sniper Edit)
// ==========================================

window.populateQuickEditDropdowns = function() {
    const nameDrop = document.getElementById("quickEditNameDropdown");
    const numDrop = document.getElementById("quickEditNumDropdown");
    if(!nameDrop || !numDrop) return;
    
    let nameHtml = '<option value=""> 고객명으로 선택하기...</option>';
    let numHtml = '<option value=""> 고객번호로 선택하기...</option>';
    
    if(window.globalCustomerData && window.globalCustomerData.length > 0) {
        window.globalCustomerData.forEach(c => {
            const name = c["고객명"] || c["이름"] || c["대표자명"] || "이름없음";
            const num = c["고객번호"] || c["ID"] || "?";
            nameHtml += `<option value="${num}">${name} (No.${num})</option>`;
            numHtml += `<option value="${num}">No.${num} (${name})</option>`;
        });
    }
    nameDrop.innerHTML = nameHtml;
    numDrop.innerHTML = numHtml;
};;

window.handleQuickEditDropdown = function(type) {
    let selectedNum = "";
    if(type === 'name') {
        selectedNum = document.getElementById("quickEditNameDropdown").value;
        document.getElementById("quickEditNumDropdown").value = "";
    } else {
        selectedNum = document.getElementById("quickEditNumDropdown").value;
        document.getElementById("quickEditNameDropdown").value = "";
    }
    
    if(!selectedNum) return;
    
    document.getElementById("quickEditSearchInput").value = selectedNum;
    window.handleQuickEditSearch();
};

window.openQuickEditModal = function() {
    const modal = document.getElementById('quickEditModal');
    if(modal) {
        modal.style.display = 'flex';
        document.getElementById('quickEditSearchInput').value = '';
        document.getElementById('quickEditResultArea').innerHTML = '<tr><td colspan="10" style="text-align:center; color:#94a3b8; font-size:15px; font-weight:600; padding:80px 0;">검색어를 입력하시면 고객 리스트가 나타납니다.</td></tr>';
        document.getElementById('quickEditTableHeader').innerHTML = '';
        document.getElementById('quickEditCount').innerText = "0";
        
        if (typeof window.populateQuickEditDropdowns === 'function') {
            window.populateQuickEditDropdowns();
        }
        
        setTimeout(() => document.getElementById('quickEditSearchInput').focus(), 100);
    }
};

window.closeQuickEditModal = function() {
    const modal = document.getElementById('quickEditModal');
    if(modal) modal.style.display = 'none';
};

window.currentQuickEditTab = 'basic';

window.setQuickEditTab = function(tab) {
    window.currentQuickEditTab = tab;
    // Update Tab Styles
    ['basic', 'touch', 'insure'].forEach(t => {
        const btn = document.getElementById('qe-tab-' + t);
        if(btn) {
            if(t === tab) {
                btn.style.color = '#3b82f6';
                btn.style.fontWeight = '800';
                btn.style.borderBottom = '3px solid #3b82f6';
            } else {
                btn.style.color = '#94a3b8';
                btn.style.fontWeight = '700';
                btn.style.borderBottom = '3px solid transparent';
            }
        }
    });
    window.handleQuickEditSearch();
};

window.currentQuickEditTab = '1차';

window.setQuickEditTab = function(tabName) {
    window.currentQuickEditTab = tabName;
    ['1차', '터치', '보험'].forEach(t => {
        const btn = document.getElementById('qeTab-' + t);
        if (btn) {
            if (t === tabName) {
                btn.style.background = '#3b82f6';
                btn.style.color = 'white';
                btn.style.boxShadow = '0 2px 4px rgba(59,130,246,0.2)';
            } else {
                btn.style.background = '#e2e8f0';
                btn.style.color = '#475569';
                btn.style.boxShadow = 'none';
            }
        }
    });
    window.handleQuickEditSearch();
};

window.handleQuickEditSearch = function() {
    try {
        const query = document.getElementById('quickEditSearchInput').value.trim().toLowerCase();
        const resultArea = document.getElementById('quickEditResultArea');
        const theadArea = document.getElementById('quickEditTableHeader');
        const countArea = document.getElementById('quickEditCount');
        
        if(!window.globalCustomerData || window.globalCustomerData.length === 0) {
            resultArea.innerHTML = '<tr><td colspan="15" style="text-align:center; padding:100px 20px; color:#ef4444; font-weight:600; font-size:15px;">데이터가 아직 로드되지 않았습니다.</td></tr>';
            if(countArea) countArea.innerText = "0";
            return;
        }
        
        const cleanQuery = query.replace(/[\s-]/g, "");
        let matches = window.globalCustomerData;
        
        if(cleanQuery) {
            matches = matches.filter(c => {
                let allValuesStr = "";
                for (let key in c) {
                    if (c.hasOwnProperty(key)) {
                        let val = c[key];
                        if (typeof val === 'object') val = JSON.stringify(val);
                        allValuesStr += String(val).toLowerCase().replace(/[\s-]/g, "") + "|";
                    }
                }
                return allValuesStr.includes(cleanQuery);
            });
        }
        
        matches = matches.slice(0, 50);
        if(countArea) countArea.innerText = matches.length;
        
        const thStyle = "padding:14px; font-size:13px; font-weight:800; color:#475569; border-bottom:1px solid #e2e8f0; white-space:nowrap; background:#f1f5f9; position:sticky; top:0;";
        let theadHtml = '<tr>';
        
        const tab = window.currentQuickEditTab;
        
        if (tab === '1차') {
            theadHtml += `<th style="${thStyle} min-width:80px;">고객명</th>
                          <th style="${thStyle} min-width:90px;">상태</th>
                          <th style="${thStyle}">나이/성별</th>
                          <th style="${thStyle}">생일</th>
                          <th style="${thStyle}">폰번호</th>
                          <th style="${thStyle}">주소</th>
                          <th style="${thStyle}">직업(상세)</th>
                          <th style="${thStyle}">특이사항</th>
                          <th style="${thStyle}">가족사항</th>`;
        } else if (tab === '터치') {
            theadHtml += `<th style="${thStyle} width:10%;">고객명</th>
                          <th style="${thStyle} width:10%;">상태</th>
                          <th style="${thStyle} width:50%;">터치인사이트</th>
                          <th style="${thStyle} width:20%;">특이사항</th>`;
        } else if (tab === '보험') {
            theadHtml += `<th style="${thStyle} width:10%;">고객명</th>
                          <th style="${thStyle} width:10%;">상태</th>
                          <th style="${thStyle} width:70%;">가입내역</th>`;
        }
        
        theadHtml += `<th style="${thStyle} text-align:right;">상세보기</th></tr>`;
        theadArea.innerHTML = theadHtml;
        
        if(matches.length === 0) {
            resultArea.innerHTML = `<tr><td colspan="15" style="text-align:center; padding:100px 20px; color:#94a3b8; font-weight:600; font-size:15px;">일치하는 데이터가 없습니다.</td></tr>`;
            return;
        }
        
        const escapeHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const tdStyle = "padding:12px 14px; font-size:13px; font-weight:600; color:#475569; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;";
        const tdNormal = "padding:12px 14px; font-size:13px; font-weight:600; color:#475569; white-space:normal; line-height:1.5;";
        
        let html = '';
        matches.forEach(r => {
            const id = escapeHtml(r["고객번호"] || r["ID"] || "");
            const name = escapeHtml(r["고객명"] || "-");
            const status = escapeHtml(r["상태"] || "-");
            
            html += `<tr style="border-bottom:1px solid #f1f5f9; transition:0.2s; cursor:pointer;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'" onclick="if(typeof document!=='undefined'){document.getElementById('quickEditModal').style.display='none';} if(typeof openProfile==='function') openProfile('${id}');">`;
            
            if (tab === '1차') {
                const ageGen = escapeHtml((r["나이"]||'') + " " + (r["성별"]||'')).trim() || "-";
                const birth = escapeHtml(r["생일"] || "-");
                const phone = escapeHtml(r["폰번호"] || "-");
                const addr = escapeHtml(r["주소"] || r["거주지"] || "-");
                const job = escapeHtml((r["직업"]||'') + " " + (r["상세업무"]||'')).trim() || "-";
                const note = escapeHtml(r["특이사항"] || "-");
                const fam = escapeHtml(r["가족사항"] || "-");
                
                html += `<td style="${tdStyle} font-weight:800; color:#0f172a;">${name}</td>`;
                html += `<td style="${tdStyle} color:#3b82f6;">${status}</td>`;
                html += `<td style="${tdStyle}">${ageGen}</td>`;
                html += `<td style="${tdStyle}">${birth}</td>`;
                html += `<td style="${tdStyle}">${phone}</td>`;
                html += `<td style="${tdStyle} max-width:150px;">${addr}</td>`;
                html += `<td style="${tdStyle} max-width:150px;">${job}</td>`;
                html += `<td style="${tdNormal} max-width:150px;">${note}</td>`;
                html += `<td style="${tdStyle} max-width:150px;">${fam}</td>`;
            } else if (tab === '터치') {
                const insight = escapeHtml(r["터치인사이트"] || "-");
                const note = escapeHtml(r["특이사항"] || "-");
                html += `<td style="${tdStyle} font-weight:800; color:#0f172a;">${name}</td>`;
                html += `<td style="${tdStyle} color:#3b82f6;">${status}</td>`;
                html += `<td style="${tdNormal} max-width:400px; color:#1e293b; font-weight:700;">${insight}</td>`;
                html += `<td style="${tdNormal} max-width:200px;">${note}</td>`;
            } else if (tab === '보험') {
                let insDisplay = "-";
                let _gList = typeof getGlobalInsuranceList === "function" ? getGlobalInsuranceList(r, true) : [];
                if (_gList.length > 0) {
                    try {
                        const parsed = _gList;
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            insDisplay = parsed.map(ins => {
                                const type = ins.보험분류 || ins.type || ins.보험종류 || "";
                                const comp = ins.보험사명 || ins.차_보험사명 || ins.company || "";
                                const prod = ins.보험종류 === "자동차보험" ? (ins.차량번호 || "자동차보험") : (ins.상품명 || ins.product || "");
                                const date = ins.체결일 || ins.책임개시일 || ins.date || "";
                                
                                const insured = ins.피보험자 || ins.차_피보험자 || "";
                                const payMethod = ins.결제방식 || ins.차_결제방식 || "";
                                let payInfo = "";
                                if (payMethod === "카드") {
                                    const cardNo = ins.카드번호 || ins.차_카드번호 || "";
                                    const cardValid = ins.유효기간 || ins.차_유효기간 || "";
                                    if (cardNo || cardValid) payInfo = `${payMethod}(${cardNo} / ${cardValid})`;
                                } else if (payMethod === "자동이체" || payMethod === "가상계좌") {
                                    const bankName = ins.은행명 || ins.차_은행명 || "";
                                    const accountNo = ins.계좌번호 || ins.차_계좌번호 || "";
                                    if (bankName || accountNo) payInfo = `${payMethod}(${bankName} / ${accountNo})`;
                                } else if (ins.결제정보) {
                                    payInfo = ins.결제정보;
                                }
                                
                                const insuredStr = insured && insured !== "-" ? ` | 피보:${insured}` : "";
                                const premStr = ins.보험료 ? ` | 월:${ins.보험료}` : "";
                                const payStr = payInfo && payInfo !== "-" && !payInfo.includes('(/)') && !payInfo.includes('( / )') ? ` | 결제:${payInfo}` : "";

                                return `<span style="display:inline-block; background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; padding:5px 8px; border-radius:6px; margin:2px 4px 4px 0; font-size:12.5px;">
                                    <strong>${comp}</strong> ${type} ${prod ? '('+prod+')' : ''} ${date} 
                                    <span style="color:#3b82f6; font-size:11.5px; margin-left:4px;">${insuredStr}${premStr}${payStr}</span>
                                </span>`;
                            }).join(' ');
                        } else {
                            insDisplay = escapeHtml(r["가입내역"]);
                        }
                    } catch(e) {
                        insDisplay = escapeHtml(r["가입내역"]);
                    }
                }
                html += `<td style="${tdStyle} font-weight:800; color:#0f172a;">${name}</td>`;
                html += `<td style="${tdStyle} color:#3b82f6;">${status}</td>`;
                html += `<td style="${tdNormal} max-width:500px; color:#334155; font-weight:700;">${insDisplay}</td>`;
            }
            
            // Render a distinct, highly visible OPEN button
            html += `<td style="${tdStyle} text-align:right;">
                <button type="button" style="background:#4f46e5; color:white; border:none; padding:8px 16px; border-radius:8px; font-weight:800; font-size:13px; cursor:pointer; box-shadow:0 2px 4px rgba(79,70,229,0.3); transition:all 0.2s;" onmouseover="this.style.background='#4338ca'; this.style.transform='translateY(-1px)';" onmouseout="this.style.background='#4f46e5'; this.style.transform='translateY(0)';">
                    <i class='fa-solid fa-folder-open'></i> 프로필 열기
                </button>
            </td>`;
            html += `</tr>`;
        });
        
        resultArea.innerHTML = html;
    } catch(e) {
        console.error("Speed Search Error:", e);
    }
};
// --- INJECTED FIXES ---
window.addEventListener('message', function(event) {
    if(event.data && event.data.type === 'FORCE_SHEET_ID') {
        const sid = event.data.sheetId;
        window.spreadsheetId = sid;
        localStorage.setItem("g_sheet_id", sid);
        
        if(window.supabase && window.supabaseClient) {
            window.supabaseClient.auth.getUser().then(({ data }) => {
                if(data && data.user) {
                    window.supabaseClient.from('profiles').update({ g_sheet_id: sid }).eq('id', data.user.id).then(()=>{});
                }
            });
        }
        
        if(typeof window.fetchClientsFromSheet === 'function') {
            window.fetchClientsFromSheet();
        }
    }
});





// --- DASHBOARD INSURANCE SEARCH FUNCTIONS ---
window.updateDashInsCompanies = function() {
    const cat = document.getElementById("dash-ins-type-select").value;
    const compSelect = document.getElementById("dash-ins-comp-select");
    if (!compSelect) return;
    compSelect.innerHTML = '<option value="">회사명 선택</option>';
    if (cat === "생명") {
        compSelect.innerHTML += '<option value="생보 전체보기" style="font-weight:700; color:#2563eb;"> 생보 전체보기</option>';
        const lifeComps = ["한화생명","교보생명","농협생명","메트라이프","KDB생명","DB생명","흥국생명","동양생명","미래에셋생명","라이나생명","푸본현대생명","신한라이프","ABL생명","iM라이프","KB라이프","IBK연금보험","처브라이프","카디프생명","하나생명","AIA생명"];
        lifeComps.forEach(c => compSelect.innerHTML += `<option value="${c}">${c}</option>`);
    } else if (cat === "손해") {
        compSelect.innerHTML += '<option value="손보 전체보기" style="font-weight:700; color:#2563eb;"> 손보 전체보기</option>';
        const nonlifeComps = ["삼성화재","메리츠화재","DB손해보험","KB손해보험","현대해상","한화손해보험","롯데손해보험","흥국화재","하나손해보험","NH농협손해보험","라이나손보","AIG손보","MG손해보험"];
        nonlifeComps.forEach(c => compSelect.innerHTML += `<option value="${c}">${c}</option>`);
    }
};

window.searchDashInsurance = function() {
    const comp = document.getElementById("dash-ins-comp-select").value;
    if(!comp) return alert("회사명을 선택해주세요.");
    window.postMessage({ type: 'APPLY_FILTER', filterType: 'insurance', value: comp }, '*');
    
    // 모달 띄우기
    const listModal = document.getElementById('listModal');
    if (listModal) {
        listModal.style.display = 'flex';
        setTimeout(() => listModal.classList.add('active'), 10);
    }
};






// --- UPLOAD SEARCH FUNCTION ---
window.searchClientForUpload = function() {
    try {
        const q = document.getElementById("uploadSearchNameInput").value.trim().toLowerCase().replace(/[\s-]/g, "");
        const resultDiv = document.getElementById("uploadSearchResult");
        if(!q) {
            resultDiv.style.display = "none";
            return;
        }
        const matches = window.globalCustomerData.filter(c => {
            const name = String(c["고객명"] || c["이름"] || c["대표자명"] || "").toLowerCase().replace(/\s+/g, "");
            const num = String(c["고객번호"] || c["ID"] || "").replace(/\s+/g, "");
            return name.includes(q) || num.includes(q);
        }).slice(0, 10);
        
        if(matches.length === 0) {
            resultDiv.style.display = "block";
            resultDiv.innerHTML = '<div style="padding:8px; font-size:13px; color:#64748b; text-align:center;">일치하는 고객이 없습니다.</div>';
            return;
        }
        
        let html = '';
        matches.forEach(c => {
            const cNum = c["고객번호"] || c["ID"] || "";
            const cName = c["고객명"] || c["이름"] || c["대표자명"] || "";
            const phone = c["폰번호"] || c["대표자폰번호"] || "-";
            html += `<div style="padding:8px 12px; border-bottom:1px solid #f1f5f9; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'" onclick="document.getElementById('uploadClientId').value='${cNum}'; if(typeof window.lookupClientForUpload === 'function') window.lookupClientForUpload(); document.getElementById('uploadSearchNameInput').value=''; document.getElementById('uploadSearchResult').style.display='none';">
                <div style="font-weight:700; color:#0f172a; font-size:14px;">${cName} <span style="font-size:11px; color:#94a3b8; font-weight:500; margin-left:6px;">No.${cNum}</span></div>
                <div style="font-size:12px; color:#64748b; margin-top:2px;">${phone}</div>
            </div>`;
        });
        resultDiv.innerHTML = html;
        resultDiv.style.display = "block";
    } catch(e) {
        alert("Upload Search Error: " + e.message);
    }
}




























window.executeSpeedSearch = function(query) {
    if(!query || !query.trim()) return;
    const cleanQuery = query.toLowerCase().replace(/[\s-]/g, "");
    
    if(!window.globalCustomerData || window.globalCustomerData.length === 0) {
        alert("데이터가 로드되지 않았습니다.");
        return;
    }
    
    const matches = window.globalCustomerData.filter(c => {
        // 1. 기본 고객 정보 검색
        const basicFields = [
            c["고객명"], c["이름"], c["대표자명"], c["법인명"],
            c["고객번호"], c["ID"], c["사업자번호"], c["법인번호"],
            c["주민번호"], c["대표자주민번호"],
            c["폰번호"], c["대표자폰번호"], c["대표자핸드폰"], c["사업자전화번호"], c["전화번호"],
            c["주소"], c["대표주소"], c["사업장주소"], c["거주지"],
            c["직업"], c["상세업무"], c["업태"], c["대표업종"],
            c["특이사항"], c["상담메모"], c["메모"], c["터치인사이트"],
            c["가족사항"], c["반려동물"], c["동물이름"], c["상태"],
            c["생일"], c["상령일"]
        ];
        
        for (let i = 0; i < basicFields.length; i++) {
            const val = basicFields[i];
            if (val && String(val).toLowerCase().replace(/[\s-]/g, "").includes(cleanQuery)) {
                return true;
            }
        }
        
        // 2. 보험가입내역 검색 (보험사명, 상품명, 증권번호, 피보험자/계약자 등)
        const insList = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(c, true) : (c["보험가입리스트"] || []);
        if (Array.isArray(insList)) {
            for (let j = 0; j < insList.length; j++) {
                const ins = insList[j];
                if (!ins) continue;
                const insFields = [
                    ins["보험사명"], ins["차_보험사명"], ins["보험사"], ins["차_보험사"], ins.company,
                    ins["상품명"], ins["차_상품명"], ins.product, ins["차종"],
                    ins["증권번호"], ins["차_증권번호"],
                    ins["계약자"], ins["피보험자"], ins["차_계약자"], ins["차_피보험자"],
                    ins["가입내역"], ins["운전자특약"], ins["연령특약"], ins["보험종류"]
                ];
                for (let k = 0; k < insFields.length; k++) {
                    const ival = insFields[k];
                    if (ival && String(ival).toLowerCase().replace(/[\s-]/g, "").includes(cleanQuery)) {
                        return true;
                    }
                }
            }
        }
        
        // 3. 가족 구성원 정보 검색
        if (Array.isArray(c.familyMembers)) {
            for (let f = 0; f < c.familyMembers.length; f++) {
                const fm = c.familyMembers[f];
                if (!fm) continue;
                const fmFields = [
                    fm["고객명"], fm["이름"], fm["고객번호"], fm["주민번호"], fm["폰번호"],
                    fm["직업"], fm["상세업무"], fm["가족관계"], fm["관계"]
                ];
                for (let m = 0; m < fmFields.length; m++) {
                    const fval = fmFields[m];
                    if (fval && String(fval).toLowerCase().replace(/[\s-]/g, "").includes(cleanQuery)) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    });
    
    window.renderListModal(matches, 'search', query);
};


window.addEventListener('message', async function(event) {
    if (event.data && (event.data.type === 'SAVE_TARGET_CSV' || event.data.type === 'SAVE_CONTACTS_SHEET')) {
        console.log('Received SAVE_TARGET_CSV/SAVE_CONTACTS_SHEET in app.js', event.data.payload);
        try {
            const targetSpreadsheetId = spreadsheetId || window.spreadsheetId || localStorage.getItem('g_sheet_id');
            if (!window.gapi || !targetSpreadsheetId) {
                console.error('GAPI not ready or spreadsheetId missing');
                return;
            }
            
            const sName = 'CRM_Contacts';
            const meta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: targetSpreadsheetId });
            let targetSheetObj = (meta.result.sheets || []).find(s => s.properties.title === sName);
            
            const headers = ['등록일시', '고객명', '전화번호', '출처', '태그', '상태'];

            if (!targetSheetObj) {
                console.log('Creating missing sheet: ' + sName);
                const addResp = await gapi.client.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: targetSpreadsheetId,
                    resource: { requests: [{ addSheet: { properties: { title: sName } } }] }
                });
                targetSheetObj = addResp.result.replies[0].addSheet;
            }
            
            // 헤더 보장
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: targetSpreadsheetId,
                range: sName + '!A1:F1',
                valueInputOption: 'USER_ENTERED',
                resource: { values: [headers] }
            });
            
            //  [핵심] 기존 미등록 연락처 영역 초기화 (활성 관리 풀 동기화)
            await gapi.client.sheets.spreadsheets.values.clear({
                spreadsheetId: targetSpreadsheetId,
                range: sName + '!A2:F'
            });

            if (event.data.payload && Array.isArray(event.data.payload) && event.data.payload.length > 0) {
                const nowStr = new Date().toLocaleString('ko-KR');
                const toInsert = event.data.payload.map(row => [
                    row.date || nowStr,
                    row.name || '미등록 고객',
                    row.phone || '',
                    row.source || '파일 업로드',
                    row.tags || row.tag || '신규 가망고객',
                    row.status || '미등록'
                ]);

                const neededRowCount = toInsert.length + 50;
                const currentGridRowCount = (targetSheetObj && targetSheetObj.properties && targetSheetObj.properties.gridProperties) 
                    ? targetSheetObj.properties.gridProperties.rowCount 
                    : 1000;

                if (neededRowCount > currentGridRowCount) {
                    console.log(`Expanding sheet ${sName} rowCount from ${currentGridRowCount} to ${neededRowCount}`);
                    await gapi.client.sheets.spreadsheets.batchUpdate({
                        spreadsheetId: targetSpreadsheetId,
                        resource: {
                            requests: [{
                                updateSheetProperties: {
                                    properties: {
                                        sheetId: targetSheetObj.properties.sheetId,
                                        gridProperties: { rowCount: neededRowCount }
                                    },
                                    fields: 'gridProperties.rowCount'
                                }
                            }]
                        }
                    });
                }

                console.log(`Writing ${toInsert.length} active contacts to ${sName}!A2`);
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: targetSpreadsheetId,
                    range: sName + '!A2',
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: toInsert }
                });
            }
            
            try { window.crmContactsData = await fetchClientsFromSheet('CRM_Contacts'); } catch(e) { console.error('CRM_Contacts fetch error:', e); window.crmContactsData = []; }
            window.parent.postMessage({ type: 'syncData', data: window.globalCustomerData, crmContacts: window.crmContactsData || [], blacklist: window.crmBlacklistData || [] }, '*');
            console.log('CRM_Contacts active pool synced successfully in Google Sheet');
        } catch(e) {
            console.error('Error saving contacts:', e);
        }
    }

    if (event.data && event.data.type === 'UPDATE_CONTACT_STATUS') {
        try {
            const targetSpreadsheetId = spreadsheetId || window.spreadsheetId || localStorage.getItem('g_sheet_id');
            const cleanTargetPhone = String(event.data.phone || '').replace(/[^0-9]/g, '');
            const newStatus = event.data.status || 'CRM편입완료';
            if (window.gapi && gapi.client && gapi.client.sheets && targetSpreadsheetId && cleanTargetPhone) {
                const sName = 'CRM_Contacts';
                const resp = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: targetSpreadsheetId,
                    range: sName + '!A:F'
                });
                const rows = resp.result.values || [];
                for (let i = 1; i < rows.length; i++) {
                    const rowPhone = String(rows[i][2] || '').replace(/[^0-9]/g, '');
                    if (rowPhone === cleanTargetPhone) {
                        const rowNum = i + 1;
                        await gapi.client.sheets.spreadsheets.values.update({
                            spreadsheetId: targetSpreadsheetId,
                            range: sName + '!F' + rowNum,
                            valueInputOption: 'USER_ENTERED',
                            resource: { values: [[newStatus]] }
                        });
                        console.log('Updated contact ' + cleanTargetPhone + ' status to ' + newStatus + ' at row ' + rowNum);
                        break;
                    }
                }
                try { window.crmContactsData = await fetchClientsFromSheet('CRM_Contacts'); } catch(e) {}
                window.parent.postMessage({ type: 'syncData', data: window.globalCustomerData, crmContacts: window.crmContactsData || [], blacklist: window.crmBlacklistData || [] }, '*');
            }
        } catch(e) {
            console.error('Error updating contact status:', e);
        }
    }

    if (event.data && event.data.type === 'SAVE_BLACKLIST_SHEET') {
        console.log('Received SAVE_BLACKLIST_SHEET in app.js', event.data.payload);
        try {
            const targetSpreadsheetId = spreadsheetId || window.spreadsheetId || localStorage.getItem('g_sheet_id');
            if (!window.gapi || !targetSpreadsheetId) {
                console.error('GAPI not ready or spreadsheetId missing');
                return;
            }
            
            const sName = 'CRM_Blacklist';
            const meta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: targetSpreadsheetId });
            let targetSheetObj = (meta.result.sheets || []).find(s => s.properties.title === sName);
            
            const headers = ['차단일시', '고객명', '전화번호', '차단사유', '상태'];

            if (!targetSheetObj) {
                console.log('Creating missing sheet: ' + sName);
                const addResp = await gapi.client.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: targetSpreadsheetId,
                    resource: { requests: [{ addSheet: { properties: { title: sName } } }] }
                });
                targetSheetObj = addResp.result.replies[0].addSheet;
            }
            
            // 헤더 보장
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: targetSpreadsheetId,
                range: sName + '!A1:E1',
                valueInputOption: 'USER_ENTERED',
                resource: { values: [headers] }
            });
            
            //  [핵심] 기존 블랙리스트 영역 초기화 (활성 관리 풀 동기화)
            await gapi.client.sheets.spreadsheets.values.clear({
                spreadsheetId: targetSpreadsheetId,
                range: sName + '!A2:E'
            });

            if (event.data.payload && Array.isArray(event.data.payload) && event.data.payload.length > 0) {
                const nowStr = new Date().toLocaleString('ko-KR');
                const values = event.data.payload.map(row => [
                    row.date || nowStr,
                    row.name || '차단고객',
                    row.phone || '',
                    row.reason || '수신 거부 / 차단',
                    row.status || '차단중'
                ]);

                const neededRowCount = values.length + 50;
                const currentGridRowCount = (targetSheetObj && targetSheetObj.properties && targetSheetObj.properties.gridProperties) 
                    ? targetSheetObj.properties.gridProperties.rowCount 
                    : 1000;

                if (neededRowCount > currentGridRowCount) {
                    await gapi.client.sheets.spreadsheets.batchUpdate({
                        spreadsheetId: targetSpreadsheetId,
                        resource: {
                            requests: [{
                                updateSheetProperties: {
                                    properties: {
                                        sheetId: targetSheetObj.properties.sheetId,
                                        gridProperties: { rowCount: neededRowCount }
                                    },
                                    fields: 'gridProperties.rowCount'
                                }
                            }]
                        }
                    });
                }

                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: targetSpreadsheetId,
                    range: sName + '!A2',
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: values }
                });
            }
            
            try { window.crmBlacklistData = await fetchClientsFromSheet('CRM_Blacklist'); } catch(e) { console.error('CRM_Blacklist fetch error:', e); window.crmBlacklistData = []; }
            window.parent.postMessage({ type: 'syncData', data: window.globalCustomerData, crmContacts: window.crmContactsData || [], blacklist: window.crmBlacklistData || [] }, '*');
            console.log('CRM_Blacklist active pool synced successfully in Google Sheet');
        } catch(e) {
            console.error('Error saving blacklist:', e);
        }
    }

    if (event.data && event.data.type === 'INIT_TOWER_SHEETS') {
        try {
            const targetSpreadsheetId = spreadsheetId || window.spreadsheetId || localStorage.getItem('g_sheet_id');
            if (window.gapi && gapi.client && gapi.client.sheets && targetSpreadsheetId) {
                const meta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: targetSpreadsheetId });
                const sheetTitles = (meta.result.sheets || []).map(s => s.properties.title);
                
                if (!sheetTitles.includes('CRM_Contacts')) {
                    await gapi.client.sheets.spreadsheets.batchUpdate({
                        spreadsheetId: targetSpreadsheetId,
                        resource: { requests: [{ addSheet: { properties: { title: 'CRM_Contacts' } } }] }
                    });
                    await gapi.client.sheets.spreadsheets.values.update({
                        spreadsheetId: targetSpreadsheetId,
                        range: 'CRM_Contacts!A1:F1',
                        valueInputOption: 'USER_ENTERED',
                        resource: { values: [['등록일시', '고객명', '전화번호', '출처', '태그', '상태']] }
                    });
                }
                
                if (!sheetTitles.includes('CRM_Blacklist')) {
                    await gapi.client.sheets.spreadsheets.batchUpdate({
                        spreadsheetId: targetSpreadsheetId,
                        resource: { requests: [{ addSheet: { properties: { title: 'CRM_Blacklist' } } }] }
                    });
                    await gapi.client.sheets.spreadsheets.values.update({
                        spreadsheetId: targetSpreadsheetId,
                        range: 'CRM_Blacklist!A1:E1',
                        valueInputOption: 'USER_ENTERED',
                        resource: { values: [['차단일시', '고객명', '전화번호', '차단사유', '상태']] }
                    });
                }
            }
        } catch(e) {
            console.warn('INIT_TOWER_SHEETS error:', e);
        }
    }
});

window.addEventListener('message', async function(e) { 
    if(e.data && e.data.type === 'requestSyncData') { 
        if(window.globalCustomerData) { 
            const targetSpreadsheetId = spreadsheetId || window.spreadsheetId || localStorage.getItem('g_sheet_id');
            if (window.gapi && gapi.client && gapi.client.sheets && targetSpreadsheetId) {
                try {
                    const meta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: targetSpreadsheetId });
                    const sheetTitles = (meta.result.sheets || []).map(s => s.properties.title);
                    
                    if (!sheetTitles.includes('CRM_Contacts')) {
                        await gapi.client.sheets.spreadsheets.batchUpdate({
                            spreadsheetId: targetSpreadsheetId,
                            resource: { requests: [{ addSheet: { properties: { title: 'CRM_Contacts' } } }] }
                        });
                        await gapi.client.sheets.spreadsheets.values.update({
                            spreadsheetId: targetSpreadsheetId,
                            range: 'CRM_Contacts!A1:F1',
                            valueInputOption: 'USER_ENTERED',
                            resource: { values: [['등록일시', '고객명', '전화번호', '출처', '태그', '상태']] }
                        });
                    }
                    
                    if (!sheetTitles.includes('CRM_Blacklist')) {
                        await gapi.client.sheets.spreadsheets.batchUpdate({
                            spreadsheetId: targetSpreadsheetId,
                            resource: { requests: [{ addSheet: { properties: { title: 'CRM_Blacklist' } } }] }
                        });
                        await gapi.client.sheets.spreadsheets.values.update({
                            spreadsheetId: targetSpreadsheetId,
                            range: 'CRM_Blacklist!A1:E1',
                            valueInputOption: 'USER_ENTERED',
                            resource: { values: [['차단일시', '고객명', '전화번호', '차단사유', '상태']] }
                        });
                    }
                } catch(err) {
                    console.warn('Auto-init sheets on syncData error:', err);
                }
            }

            if (!window.isCrmContactsFetched && (!window.crmContactsData || window.crmContactsData.length === 0)) {
                window.isCrmContactsFetched = true;
                try {
                    window.crmContactsData = await fetchClientsFromSheet('CRM_Contacts');
                } catch(err) {
                    window.crmContactsData = [];
                }
            }
            if (!window.isBlacklistFetched && (!window.crmBlacklistData || window.crmBlacklistData.length === 0)) {
                window.isBlacklistFetched = true;
                try {
                    window.crmBlacklistData = await fetchClientsFromSheet('CRM_Blacklist');
                } catch(err) {
                    window.crmBlacklistData = [];
                }
            }
            window.parent.postMessage({ 
                type: 'syncData', 
                data: window.globalCustomerData, 
                crmContacts: window.crmContactsData || [],
                blacklist: window.crmBlacklistData || []
            }, '*'); 
        } 
    }
    
    if(e.data && e.data.type === 'workerAuthFailed' && !isHeadless) {
        if (window.googleLibTimeout) {
            clearTimeout(window.googleLibTimeout);
            window.googleLibTimeout = null;
        }
        if (typeof loadGoogleLibraries === "function" && !window.gapiInited) {
            loadGoogleLibraries();
        }
    }
    
    //  Receive syncData from parent (which came from workerFrame)
    if(e.data && e.data.type === 'syncData' && !isHeadless) {
        console.log(" Received syncData from workerFrame via parent! Skipping direct fetch.");
        globalCustomerData = e.data.data || [];
        window.globalCustomerData = globalCustomerData;
        if (e.data.targetData) globalTargetData = e.data.targetData;
        if (e.data.crmContacts) window.crmContactsData = e.data.crmContacts;
        
        showLoading(false);
        isLoadingCRMData = false;
        
        if (typeof updateAgentHeaderUI === 'function') updateAgentHeaderUI();
        if (typeof initYearFilterOptions === 'function') initYearFilterOptions();
        if (typeof initClientDatalist === 'function') initClientDatalist();
        if (typeof updateQuickFilterCounts === 'function') updateQuickFilterCounts();
        if (typeof renderTable === 'function') renderTable();
        
        if (window.googleLibTimeout) clearTimeout(window.googleLibTimeout);
        setTimeout(() => {
            if (typeof loadGoogleLibraries === "function" && !window.gapiInited) {
                loadGoogleLibraries();
            }
        }, 500);
    }
});









// ---- NEW PHASE 2 FUNCTIONS ----
window.toggleFamilyStatus = function() {
    const idInput = document.getElementById("base-cust-id");
    const currentId = idInput.value;
    
    if (currentId.includes("-")) {
        if(confirm("이 고객을 가족에서 분리하여 독립적인 새 고객번호를 부여하시겠습니까?")) {
            let maxId = 0;
            globalCustomerData.forEach(c => {
                let idVal = c["고객번호"] || c["사업자번호"];
                if(idVal) {
                    let numStr = String(idVal).split('-')[0].replace(/\D/g, '');
                    if(numStr) {
                        let n = parseInt(numStr, 10);
                        if(n > maxId) maxId = n;
                    }
                }
            });
            idInput.value = String(maxId + 1);
            document.getElementById("familyToggleBtn").innerText = "가족으로 묶기 ";
            showCustomAlert("분리 완료", "새로운 독립 고객번호(" + idInput.value + ")가 부여되었습니다. [저장하기]를 누르면 확정됩니다.");
        }
    } else {
        const rootId = prompt("어떤 고객의 가족으로 묶으시겠습니까?\n묶을 대상의 고객번호(예: 105)를 입력해주세요.");
        if(rootId && rootId.trim() !== "") {
            let rootBase = rootId.trim();
            let maxSub = 0;
            globalCustomerData.forEach(c => {
                let idVal = String(c["고객번호"] || c["사업자번호"]);
                if(idVal.startsWith(rootBase + "-")) {
                    let sub = parseInt(idVal.split('-')[1], 10);
                    if(sub > maxSub) maxSub = sub;
                }
            });
            idInput.value = rootBase + "-" + (maxSub + 1);
            document.getElementById("familyToggleBtn").innerText = "가족에서 분리(독립) ";
            showCustomAlert("가족 편입 완료", "가족 번호(" + idInput.value + ")가 부여되었습니다. [저장하기]를 누르면 확정됩니다.");
        }
    }
};

window.deleteCustomerData = async function() {
    if(!window.isEditMode || !window.editTargetId) return;
    if(!confirm("이 고객 데이터를 완전히 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다.")) return;
    
    showLoading(true);
    try {
        const targetIdx = globalCustomerData.findIndex(c => String(c["고객번호"] || c["사업자번호"]) === window.editTargetId);
        if(targetIdx === -1) throw new Error("데이터를 찾을 수 없습니다.");
        
        const rNum = globalCustomerData[targetIdx].rowNumber;
        const sName = globalCustomerData[targetIdx].sheetName || "weraclecrm";
        
        const spreadsheetId = (window.spreadsheetId || localStorage.getItem("g_sheet_id"));
        const headers = getCrmHeaders(sName);
        const emptyRow = new Array(headers.length).fill("");
        
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId,
            range: sName + "!A" + rNum,
            valueInputOption: "USER_ENTERED",
            resource: { values: [emptyRow] }
        });
        
        showCustomAlert("삭제 완료", "데이터가 성공적으로 삭제되었습니다.");
        if(typeof closeRegModal === 'function') closeRegModal();
        await loadCRMData();
    } catch(err) {
        console.error("Delete Error", err);
        alert("삭제 실패: " + err.message);
    } finally {
        showLoading(false);
    }
};














































// ==========================================
// 15. Profile Family Management (Modal)
// ==========================================
window.openFamilyManageModal = function(rootId, rootName) {
    document.getElementById('fm-modal-title').innerText = `[${rootName}] 가족 관리`;
    document.getElementById('fm-current-root-id').value = rootId;
    document.getElementById('fm-search-input').value = "";
    document.getElementById('fm-search-results').innerHTML = "";
    
    // Load current members
    const familyMembers = globalCustomerData.filter(c => {
        const cId = String(c["고객번호"] || c["ID"] || "");
        return cId === rootId || cId.startsWith(rootId + "-");
    });
    
    let html = "";
    familyMembers.forEach(fm => {
        const fmId = String(fm["고객번호"] || fm["ID"] || "");
        const fmName = fm["고객명"] || "이름없음";
        let fmRel = fm["가족사항"] || fm["가족_관계"] || "가족";
        if (fmId === rootId) fmRel = "계약자(본인)";
        else if (fmRel.includes("(")) fmRel = fmRel.split("(")[0];
        
        let btnHtml = "";
        if (fmId !== rootId) {
            btnHtml = `<button onclick="window.unlinkFamilyMember('${fmId}', '${fmName}')" style="background:#fef2f2; color:#ef4444; border:1px solid #fca5a5; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fef2f2'">분리(독립)</button>`;
        } else {
            btnHtml = `<span style="font-size:12px; color:#94a3b8; font-weight:600; padding:6px 0;">가족 대표 (분리 불가)</span>`;
        }

        html += `<div style="display:flex; justify-content:space-between; align-items:center; background:white; border:1px solid #e2e8f0; padding:12px 16px; border-radius:8px;">
            <div>
                <div style="font-weight:700; color:#0f172a; font-size:14px;">${fmName} <span style="font-size:12px; color:#64748b; font-weight:500; margin-left:6px;">(${fmRel})</span></div>
                <div style="font-size:12px; color:#94a3b8; margin-top:2px;">고객번호: ${fmId}</div>
            </div>
            ${btnHtml}
        </div>`;
    });
    document.getElementById('fm-current-members').innerHTML = html;
    
    document.getElementById('family-manage-modal').style.display = 'flex';
};

window.searchCustomerForFamily = function() {
    const keyword = document.getElementById('fm-search-input').value.trim();
    const resultDiv = document.getElementById('fm-search-results');
    const rootId = document.getElementById('fm-current-root-id').value;
    
    if (keyword.length < 1) {
        resultDiv.innerHTML = '<div style="color:#ef4444; font-size:13px; font-weight:600;">검색어를 입력해주세요.</div>';
        return;
    }
    
    const results = globalCustomerData.filter(c => {
        const cId = String(c["고객번호"] || c["ID"] || "");
        const name = c["고객명"] || c["이름"] || c["대표자명"] || "";
        const phone = c["폰번호"] || c["대표자폰번호"] || "";
        // Exclude current family members
        if (cId === rootId || cId.startsWith(rootId + "-")) return false;
        return name.includes(keyword) || phone.includes(keyword);
    });
    
    if (results.length === 0) {
        resultDiv.innerHTML = '<div style="color:#64748b; font-size:13px;">검색 결과가 없습니다.</div>';
        return;
    }
    
    let html = "";
    results.forEach(c => {
        const cId = String(c["고객번호"] || c["ID"] || "");
        const name = c["고객명"] || c["이름"] || c["대표자명"] || "";
        html += `<div style="display:flex; justify-content:space-between; align-items:center; background:white; border:1px solid #e2e8f0; padding:10px 14px; border-radius:8px;">
            <div>
                <div style="font-weight:700; color:#0f172a; font-size:13px;">${name}</div>
                <div style="font-size:11px; color:#94a3b8; margin-top:2px;">고객번호: ${cId}</div>
            </div>
            <button onclick="window.linkCustomerToFamily('${cId}', '${name}')" style="background:#e0e7ff; color:#4f46e5; border:1px solid #c7d2fe; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='#c7d2fe'" onmouseout="this.style.background='#e0e7ff'">이 가족으로 묶기</button>
        </div>`;
    });
    resultDiv.innerHTML = html;
};

window.linkCustomerToFamily = async function(targetCustId, targetName) {
    const rootId = document.getElementById('fm-current-root-id').value;
    if(!confirm(`[${targetName}] 고객을 이 가족 그룹으로 편입하시겠습니까?`)) return;
    
    let maxSub = 0;
    globalCustomerData.forEach(c => {
        let idVal = String(c["고객번호"] || c["사업자번호"]);
        if(idVal.startsWith(rootId + "-")) {
            let sub = parseInt(idVal.split('-')[1], 10);
            if(sub > maxSub) maxSub = sub;
        }
    });
    const newId = rootId + "-" + (maxSub + 1);
    
    await updateCustomerIdInSheet(targetCustId, newId, ` [${targetName}] 가족 편입 완료`);
};

window.unlinkFamilyMember = async function(targetCustId, targetName) {
    if(!confirm(`[${targetName}] 고객을 이 가족에서 분리하여 독립시키겠습니까?\n새로운 독립 고객번호가 부여됩니다.`)) return;
    
    let maxId = 0;
    globalCustomerData.forEach(c => {
        let idVal = c["고객번호"] || c["사업자번호"];
        if(idVal) {
            let numStr = String(idVal).split('-')[0].replace(/\D/g, '');
            if(numStr) {
                let n = parseInt(numStr, 10);
                if(n > maxId) maxId = n;
            }
        }
    });
    const newId = String(maxId + 1);
    
    await updateCustomerIdInSheet(targetCustId, newId, ` [${targetName}] 가족 독립 완료`);
};

async function updateCustomerIdInSheet(oldId, newId, successMsg) {
    showLoading(true);
    try {
        const targetIdx = globalCustomerData.findIndex(c => String(c["고객번호"] || c["사업자번호"]) === oldId);
        if(targetIdx === -1) throw new Error("데이터를 찾을 수 없습니다.");
        
        const rNum = globalCustomerData[targetIdx].rowNumber;
        const sName = globalCustomerData[targetIdx].sheetName || "weraclecrm";
        const spreadsheetId = (window.spreadsheetId || localStorage.getItem("g_sheet_id"));
        
        // Update column A (고객번호)
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId,
            range: sName + "!A" + rNum,
            valueInputOption: "USER_ENTERED",
            resource: { values: [[newId]] }
        });
        
        showCustomAlert("업데이트 완료", successMsg + `<br>새 고객번호: ${newId}`);
        document.getElementById('family-manage-modal').style.display = 'none';
        
        const p2 = document.getElementById('profileModal');
        if (p2) { p2.classList.remove('show'); p2.classList.remove('active'); p2.style.display = 'none'; }
        if (typeof loadCRMData === 'function') await loadCRMData();
        
    } catch(err) {
        console.error("ID Update Error", err);
        alert("오류 발생: " + err.message);
    } finally {
        showLoading(false);
    }
}


window.deleteCustomerFromProfile = async function(custId, custName) {
    if(!confirm(`정말 [${custName}] 고객을 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며 보험 데이터도 함께 삭제됩니다.`)) return;
    
    showLoading(true);
    try {
        const targetIdx = globalCustomerData.findIndex(c => String(c["고객번호"] || c["사업자번호"] || c["ID"]) === String(custId));
        if(targetIdx === -1) throw new Error("데이터를 찾을 수 없습니다.");
        
        const rNum = globalCustomerData[targetIdx].rowNumber;
        const sName = globalCustomerData[targetIdx].sheetName || "weraclecrm";
        const spreadsheetId = (window.spreadsheetId || localStorage.getItem("g_sheet_id"));
        const headers = getCrmHeaders(sName);
        const emptyRow = new Array(headers.length).fill("");
        
        // 1. Delete from weraclecrm
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId,
            range: sName + "!A" + rNum,
            valueInputOption: "USER_ENTERED",
            resource: { values: [emptyRow] }
        });

        // 2. Clear global customer data locally so the next sync removes their insurance
        globalCustomerData.splice(targetIdx, 1);

        // 3. Trigger a save to force 보험관리 sheet to rebuild without this customer
        if (typeof window.forceSyncInsuranceSheet === 'function') {
            await window.forceSyncInsuranceSheet();
        }
        
        showCustomAlert("삭제 완료", `[${custName}] 고객의 데이터가 삭제되었습니다.`);
        const p1 = document.getElementById('profileModal');
        if (p1) { p1.classList.remove('show'); p1.classList.remove('active'); p1.style.display = 'none'; }
        await loadCRMData();
        
    } catch(err) {
        console.error("Delete Error", err);
        alert("삭제 실패: " + err.message);
    } finally {
        showLoading(false);
    }
};

window.forceSyncInsuranceSheet = async function() {
    // Re-generate the 보험관리 sheet to remove the deleted customer's records
    const spreadsheetId = (window.spreadsheetId || localStorage.getItem("g_sheet_id"));
    const insSheetName = "보험관리";
    
    const allInsRows = [];
    globalCustomerData.forEach(c => {
        let rawIns = c["보험가입내역"] || c["가입내역"] || c["insurance"] || "";
        let insList = [];
        try {
            if (typeof rawIns === "string" && rawIns.trim().startsWith("[")) {
                insList = JSON.parse(rawIns);
            } else if (Array.isArray(rawIns)) {
                insList = rawIns;
            }
        } catch(e) { }
        
        if (Array.isArray(insList) && insList.length > 0) {
            let custIdStr = String(c["고객번호"] || c["사업자번호"] || "");
            let custNameStr = c["고객명"] || c["대표자명"] || "";
            let formattedInsRows = insList.map(ins => {
                let isAuto = (ins.isAuto === true || ins.isAuto === "true" || ins.isCar === true || ins['보험분류'] === '자동차' || ins['보험분류'] === '이륜차');
                
                let pName = ins['상품명'] || ins['차_상품명'] || (isAuto ? "자동차(이륜차)" : "");
                let comp = ins['보험사명'] || ins['차_보험사명'] || ins['company'] || "";
                let con = ins['계약자'] || ins['차_계약자'] || "";
                let inr = ins['피보험자'] || ins['차_피보험자'] || ins['기본피보험자'] || "";
                let prem = ins['총보험료'] || ins['보험료'] || ins['차_보험료'] || ins['premium'] || "";
                let payMethod = ins.결제방식 || ins['차_결제방식'] || ins.paymentMethod || ins.payment || ins['결제방식'] || "-";
                let pay = ins['결제정보'] || ins['차_결제수단'] || ins['payInfo'] || "";
                if (payMethod === '카드') {
                    const cardNo = ins['카드번호'] || ins['차_카드번호'] || "";
                    const cardValid = ins['유효기간'] || ins['차_유효기간'] || "";
                    if (cardNo || cardValid) pay = `${cardNo} / ${cardValid}`;
                } else if (payMethod === '자동이체' || payMethod === '가상계좌') {
                    const bName = ins['은행명'] || ins['차_은행명'] || "";
                    const aNo = ins['계좌번호'] || ins['차_계좌번호'] || "";
                    if (bName || aNo) pay = `${bName} / ${aNo}`;
                }
                let cov = ins['가입내역'] || ins['특이사항'] || "";
                
                let type = ins['보험분류'] || ins['보험종류'] || "";
                let signD = ins['체결일'] || "";
                let expD = ins['만기일자'] || ins['만기일'] || "";
                let renD = ins['갱신일자'] || ins['갱신일'] || "";
                let payTerm = ins['납입기간'] || "";
                
                let carNo = ins['차량번호'] || ins['차_차량번호'] || "";
                let carUsg = ins['차량용도'] || ins['차_차량용도'] || "";
                let detUsg = ins['상세용도'] || ins['차_상세용도'] || ins['이륜차용도'] || "";
                let respD = ins['책임개시일'] || "";
                
                let covText = (typeof cov === 'string') ? cov : JSON.stringify(cov);
                
                return [
                    custIdStr, custNameStr, isAuto ? "자동차" : "장기",
                    pName, comp, con, inr, prem, pay,
                    type, signD, expD, renD, payTerm,
                    carNo, carUsg, detUsg, respD,
                    covText
                ];
            });
            allInsRows.push(...formattedInsRows);
        }
    });
    
    await gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId, range: insSheetName + "!A2:Z" });
    if (allInsRows.length > 0) {
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId,
            range: insSheetName + "!A2",
            valueInputOption: "USER_ENTERED",
            resource: { values: allInsRows }
        });
    }
};
















// [ANTIGRAVITY FIX] 전역 모달 오버레이 클릭 차단 (배경 클릭 시 꺼짐 및 먹통 방지)
document.addEventListener('click', function(e) {
    if (e.target && e.target.classList && (e.target.classList.contains('modal-overlay') || e.target.classList.contains('vlab-modal-overlay'))) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    }
}, true);




