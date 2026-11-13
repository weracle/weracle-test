/**
 * crm_enhancements.js
 * 위라클 CRM - 핵심 기능 고도화 모듈 (독립 분리)
 * 기능:
 * 1. 구글 연동 만료 안내 문구 통일 및 중복 알림 차단 (Items 1 & 2)
 * 2. 오늘 챙겨야 할 고객 - 지난 보험 만기 계약 제외 및 정확한 계산 (Item 9)
 * 3. 영업 파이프라인 1-클릭 상태 변경 (Item 10)
 * 4. 이번 달 보험금 청구 고객 리스트 및 뱃지 연동 (Item 11)
 */

// ==============================================================
// 1 & 2. 구글 연동 알림 단일화 & 중복 팝업 차단 (Items 1 & 2)
// ==============================================================
(function() {
    window._googleAuthAlertShown = false;
    const originalAlert = window.alert;

    window.alert = function(msg) {
        if (typeof msg === 'string') {
            const isGoogleAuthMsg = msg.includes('구글 연동') || 
                                    msg.includes('구글 로그인') || 
                                    msg.includes('연동 권한이 없거나') || 
                                    msg.includes('연동 시간이 만료') ||
                                    msg.includes('연동이 끊어졌습니다') ||
                                    msg.includes('연동 해제');
            if (isGoogleAuthMsg) {
                if (window._googleAuthAlertShown) {
                    console.log('[CRM] 중복 구글 연동 경고 팝업 차단됨');
                    return;
                }
                window._googleAuthAlertShown = true;
                return originalAlert.call(window, "구글 계정 연동 세션이 만료되었습니다.\n안전한 데이터 저장을 위해 화면 우측 상단의 [연동하기] 버튼을 눌러 다시 연동해 주세요.");
            }
        }
        return originalAlert.apply(window, arguments);
    };

    // 커스텀 알림도 동일하게 가로챔
    if (typeof window.showCustomAlert === 'function') {
        const origCustomAlert = window.showCustomAlert;
        window.showCustomAlert = function(title, body) {
            if ((typeof title === 'string' && (title.includes('구글') || title.includes('연동'))) ||
                (typeof body === 'string' && (body.includes('구글 로그인') || body.includes('연동 해제')))) {
                if (window._googleAuthAlertShown) return;
                window._googleAuthAlertShown = true;
                return origCustomAlert.call(window, "구글 연동 안내", "구글 계정 연동 세션이 만료되었습니다.<br>안전한 데이터 저장을 위해 화면 우측 상단의 <b>[연동하기]</b> 버튼을 눌러 다시 연동해 주세요.");
            }
            return origCustomAlert.apply(window, arguments);
        };
    }
})();

// 토큰 갱신 시 플래그 리셋
window.addEventListener('storage', function(e) {
    if (e.key === 'g_access_token' && e.newValue) {
        window._googleAuthAlertShown = false;
    }
});


// ==============================================================
// 9. 만기 도래 계산 헬퍼 - 해당 만기일 당일(D-Day)만 정확히 매칭 (Item 9)
// ==============================================================
function getExpiryDateParts(ed) {
    if (!ed) return null;
    let s = String(ed).trim();
    let parts = s.split(/[-./\s]+/);
    if (parts.length >= 3) {
        let y = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10) - 1;
        let d = parseInt(parts[2], 10);
        if (y < 100) y += 2000;
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
            return { y, m, d };
        }
    } else if (parts.length === 2) {
        let m = parseInt(parts[0], 10) - 1;
        let d = parseInt(parts[1], 10);
        if (!isNaN(m) && !isNaN(d)) {
            return { y: null, m, d };
        }
    }
    let digits = s.replace(/\D/g, '');
    if (digits.length >= 8) {
        let y = parseInt(digits.substring(0, 4), 10);
        let m = parseInt(digits.substring(4, 6), 10) - 1;
        let d = parseInt(digits.substring(6, 8), 10);
        return { y, m, d };
    } else if (digits.length === 4) {
        let m = parseInt(digits.substring(0, 2), 10) - 1;
        let d = parseInt(digits.substring(2, 4), 10);
        if (m >= 0 && m < 12 && d >= 1 && d <= 31) {
            return { y: null, m, d };
        }
    }
    return null;
}

window.isExpiringCustomer = function(c) {
    let hasExp = false;
    try {
        let gArr = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(c, true) : [];
        const today = new Date();
        const cleanToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        gArr.forEach(i => {
            let ed = i['갱신일자'] || i['만기일자'] || i['갱신일'] || i['만기일'] || i['expireDate'] || i['renewalDate'] || '';
            if (ed) {
                let p = getExpiryDateParts(ed);
                if (p) {
                    let expYear = (p.y !== null && p.y !== undefined) ? p.y : today.getFullYear();
                    let targetDate = new Date(expYear, p.m, p.d);
                    targetDate.setHours(0, 0, 0, 0);
                    if (p.y === null && targetDate < cleanToday) {
                        targetDate.setFullYear(today.getFullYear() + 1);
                    }
                    let diffDays = Math.round((targetDate - cleanToday) / (1000 * 60 * 60 * 24));
                    if (diffDays >= 0 && diffDays <= 30) {
                        hasExp = true;
                    }
                }
            }
        });
    } catch(e) {}
    return hasExp;
};


// ==============================================================
// 11. 이번 달 보험금 청구 고객 판별 헬퍼 (Item 11)
// ==============================================================
window.isClaimCustomer = function(c) {
    const today = new Date();
    const curYM = String(today.getFullYear()) + String(today.getMonth() + 1).padStart(2, '0'); // e.g. "202611"

    // 1. 청구 일자 필드 검사
    const claimDate = String(c['청구일자'] || c['청구일'] || c['접수일'] || '').replace(/\D/g, '');
    if (claimDate && claimDate.startsWith(curYM)) return true;

    // 2. 청구 여부/내역 필드 검사
    const claimField = String(c['보험금청구'] || c['청구내역'] || c['청구사유'] || c['청구'] || '').trim();
    if (claimField && claimField !== '-' && claimField !== '없음' && claimField !== '무' && claimField !== 'false') {
        return true;
    }

    // 3. 터치인사이트 태그에 '청구' 포함 여부
    const touch = String(c['터치인사이트'] || '');
    if (touch.includes('청구')) return true;

    // 4. 특이사항/메모에 '청구' 포함 여부
    const memo = String(c['특이사항'] || c['메모'] || '');
    if (memo.includes('청구') || memo.includes('보험금')) return true;

    // 5. 가입 보험 계약 리스트에 청구 내역 존재 여부
    try {
        let gArr = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(c, true) : [];
        if (gArr.some(i => {
            const iClaim = String(i['청구내역'] || i['청구'] || i['보상내역'] || '').trim();
            return (iClaim && iClaim !== '-' && iClaim !== '없음');
        })) {
            return true;
        }
    } catch(e) {}

    return false;
};


// ==============================================================
// 10. 영업 파이프라인 1-클릭 상태 변경 (Item 10)
// ==============================================================
window.quickChangeCustomerStatus = async function(id, newStatus, selectEl) {
    if (!id || !newStatus) return;
    if (newStatus.includes('잠재') || newStatus.includes('가망') || newStatus.includes('신규')) newStatus = '잠재고객';
    else if (newStatus.includes('관심')) newStatus = '관심고객';
    else if (newStatus.includes('유력') || newStatus.includes('상담') || newStatus.includes('설계')) newStatus = '유력고객';
    else if (newStatus.includes('계약') || newStatus.includes('체결') || newStatus.includes('케어') || newStatus.includes('유지') || newStatus.includes('집중') || newStatus.includes('VIP')) newStatus = '계약고객';
    else newStatus = '잠재고객';
    
    if (!window.globalCustomerData) {
        alert("고객 데이터를 찾을 수 없습니다.");
        return;
    }
    
    const targetIdx = window.globalCustomerData.findIndex(c => String(c['고객번호'] || c['ID']) === String(id));
    if (targetIdx === -1) {
        alert("해당 고객을 찾을 수 없습니다. (ID: " + id + ")");
        return;
    }

    const cust = window.globalCustomerData[targetIdx];
    const prevStatus = cust['상태'] || cust['고객상태'] || '잠재고객';
    const custName = cust['고객명'] || cust['대표자명'] || '고객';

    // 1. 메모리 데이터 즉시 갱신 (Optimistic Update)
    cust['상태'] = newStatus;
    if (cust['고객상태']) cust['고객상태'] = newStatus;

    // 2. 셀렉트 박스 스타일 업데이트
    if (selectEl) {
        let bg = '#eff6ff', color = '#2563eb', border = '#93c5fd';
        if (newStatus.includes('상담') || newStatus.includes('설계')) {
            bg = '#fefce8'; color = '#ca8a04'; border = '#fde047';
        } else if (newStatus.includes('체결') || newStatus.includes('계약')) {
            bg = '#ecfdf5'; color = '#059669'; border = '#86efac';
        } else if (newStatus.includes('케어') || newStatus.includes('집중')) {
            bg = '#fee2e2'; color = '#dc2626'; border = '#fca5a5';
        }
        selectEl.style.background = bg;
        selectEl.style.color = color;
        selectEl.style.borderColor = border;
    }

    // 3. 대시보드 파이프라인 카운트 즉시 재계산
    if (typeof window.updateQuickFilterCounts === 'function') {
        window.updateQuickFilterCounts();
    }

    // 4. 구글 시트 단일 셀 다이렉트 업데이트 (초고속, 쿼터 소모 최소화)
    try {
        const spreadsheetId = window.spreadsheetId || localStorage.getItem('g_sheet_id');
        const sName = cust.sheetName || 'weraclecrm';
        const rNum = cust.rowNumber;

        if (window.gapi && window.gapi.client && window.gapi.client.sheets && spreadsheetId && rNum) {
            const headers = (typeof getCrmHeaders === 'function') ? getCrmHeaders(sName) : (window.getCrmHeaders ? window.getCrmHeaders(sName) : []);
            let colIdx = headers.indexOf('상태');
            if (colIdx === -1) colIdx = headers.indexOf('고객상태');

            if (colIdx !== -1) {
                // 컬럼 인덱스 -> 엑셀 알파벳 열 변환 (0 -> A, 1 -> B, ...)
                let colLetter = '';
                let tempIdx = colIdx;
                while (tempIdx >= 0) {
                    colLetter = String.fromCharCode((tempIdx % 26) + 65) + colLetter;
                    tempIdx = Math.floor(tempIdx / 26) - 1;
                }

                const range = `${sName}!${colLetter}${rNum}`;
                await window.gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetId,
                    range: range,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[newStatus]] }
                });
            }
        }

        // 부모 창에 동기화 알림 (임베디드 지원)
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'syncData', data: window.globalCustomerData }, '*');
        }

        // 토스트 알림
        window.showToastNotice(`✨ [${custName}] 상태가 [${newStatus}](으)로 변경되었습니다!`);
    } catch(err) {
        console.error("상태 변경 구글 시트 저장 실패:", err);
        // 실패 시 롤백 안내
        alert(`구글 시트 저장 중 오류가 발생했습니다.\n다시 시도해 주세요: ${err.message || ''}`);
        cust['상태'] = prevStatus;
        if (selectEl) selectEl.value = prevStatus;
        if (typeof window.updateQuickFilterCounts === 'function') window.updateQuickFilterCounts();
    }
};

// 미니 토스트 알림창
window.showToastNotice = function(text) {
    let toast = document.getElementById('crm-quick-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'crm-quick-toast';
        toast.style.position = 'fixed';
        toast.style.bottom = '24px';
        toast.style.right = '24px';
        toast.style.background = '#0f172a';
        toast.style.color = '#ffffff';
        toast.style.padding = '12px 20px';
        toast.style.borderRadius = '12px';
        toast.style.fontSize = '13.5px';
        toast.style.fontWeight = '700';
        toast.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.3)';
        toast.style.zIndex = '9999999';
        toast.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        document.body.appendChild(toast);
    }
    toast.innerText = text;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
    }, 2500);
};


// ==============================================================
// 10 & 11. renderListModal 및 updateQuickFilterCounts 고도화
// ==============================================================
(function() {
    // 1. 대시보드 카운트 함수 고도화 (PC & 모바일 완벽 동기화 + 만기 당일 계산 + 이달의 청구 뱃지 연동)
    const origUpdateCounts = window.updateQuickFilterCounts;
    window.updateQuickFilterCounts = function() {
        const rawData = (window.globalCustomerData && Array.isArray(window.globalCustomerData) && window.globalCustomerData.length > 0) 
            ? window.globalCustomerData 
            : ((typeof globalCustomerData !== 'undefined' && Array.isArray(globalCustomerData) && globalCustomerData.length > 0) 
                ? globalCustomerData 
                : (typeof window.getActiveCRMData === 'function' ? window.getActiveCRMData() : []));

        if (!rawData || !Array.isArray(rawData)) return;

        let interest = 0;
        let consult = 0;
        let contract = 0;
        let care = 0;
        let birth = 0;
        let sangryung = 0;
        let expiry = 0;
        let claim = 0;

        const today = new Date();
        const currentMonthStr = String(today.getMonth() + 1).padStart(2, '0');
        const currentDayStr = String(today.getDate()).padStart(2, '0');
        const currentMD = currentMonthStr + currentDayStr;

        let potential = 0;
        let influential = 0;
        rawData.forEach(c => {
            let s = String(c['상태'] || c['고객상태'] || '');
            if (s.includes('잠재') || s.includes('가망') || s.includes('신규')) potential++;
            else if (s.includes('관심')) interest++;
            else if (s.includes('유력') || s.includes('상담') || s.includes('설계')) influential++;
            else if (s.includes('계약') || s.includes('체결') || s.includes('케어') || s.includes('유지') || s.includes('집중') || s.includes('VIP')) contract++;
            consult = influential; care = contract;

            // 생일 대상자 (30일 이내)
            if (typeof window.isBirthCustomer === 'function' && window.isBirthCustomer(c)) birth++;

            // 상령일 대상자 (30일 이내)
            if (typeof window.isSangryungCustomer === 'function' && window.isSangryungCustomer(c)) sangryung++;

            // 만기일 대상자 (30일 이내)
            if (typeof window.isExpiringCustomer === 'function' && window.isExpiringCustomer(c)) expiry++;

            // 이달의 보험금 청구 (Item 11)
            if (typeof window.isClaimCustomer === 'function' && window.isClaimCustomer(c)) claim++;
        });

        // UI 엘리먼트 갱신 (PC 및 모바일 완벽 100% 동기화)
        const total = rawData.length;

        const setTxt = (sel, val) => {
            document.querySelectorAll(sel).forEach(el => el.innerText = val);
        };

        // 1. 전체 고객 수 (PC & Mobile)
        setTxt('#qf-count-total, #qf-count-all', total + "명");
        setTxt('.m-sync-total', total);

        // 2. 파이프라인 (PC & Mobile - 잠재 / 관심 / 유력 / 계약)
        setTxt('#pipe-count-potential', potential);
        setTxt('#pipe-count-interest, #qf-count-interest, #qf-interest', interest);
        setTxt('#pipe-count-influential, #pipe-count-consult, #qf-count-consult', influential);
        setTxt('#pipe-count-contract, #pipe-count-care, #qf-count-contract, #qf-contract, #qf-count-care', contract);

        setTxt('.m-sync-potential', potential);
        setTxt('.m-sync-interest', interest);
        setTxt('.m-sync-influential, .m-sync-consult', influential);
        setTxt('.m-sync-contract, .m-sync-care', contract);

        // 3. 오늘 케어 카드 (PC)
        setTxt('#mini-badge-birth', birth + "명");
        setTxt('#mini-badge-sangryung', sangryung + "명");
        setTxt('#mini-badge-expiry', expiry + "명");
        setTxt('#mini-badge-claim', claim + "명");

        // 4. 오늘 케어 카드 (Mobile)
        setTxt('.m-sync-birth', birth);
        setTxt('.m-sync-sang', sangryung);
        setTxt('.m-sync-expiry', expiry);
        setTxt('.m-sync-claim', claim);

        // 5. 터치인사이트 태그 카운트 (PC)
        const insightCounts = {};
        rawData.forEach(c => {
            let tags = String(c['터치인사이트'] || '').split(',').map(t => t.trim()).filter(t => t);
            tags.forEach(t => { 
                insightCounts[t] = (insightCounts[t] || 0) + 1; 
            });
        });
        const allTags = ['실손', '암', '치아', '간병', '치매', '후유장해', '자동차', '운전자', '바이크', '골프', '펫보험', '연금', '재테크', '종신', '정기', '생활비', '주택화재', '재물보험'];
        allTags.forEach(tag => {
            const el = document.getElementById('touch-count-' + tag);
            if (el) el.innerText = insightCounts[tag] || 0;
        });
        Object.entries(insightCounts).forEach(([tag, count]) => {
            const el = document.getElementById('touch-count-' + tag);
            if (el) el.innerText = count;
        });
    };

    // 리사이즈 시에도 즉시 모바일/PC 카운트 재동기화
    window.addEventListener('resize', function() {
        if (typeof window.updateQuickFilterCounts === 'function') {
            window.updateQuickFilterCounts();
        }
    });

    // 2. 모달 렌더링 함수 오버라이드
    window.renderListModal = function(filtered, fType, fVal) {
        const head = document.getElementById("listTableHead");
        const body = document.getElementById("listTableBody");
        const title = document.getElementById("modalTitle");
        if (!head || !body) return;

        let titleStr = "고객 리스트";
        let thHtml = "<tr>";

        // Item 9 & Item 11 전용 필터 적용
        if (fType === 'expiry') {
            filtered = filtered.filter(window.isExpiringCustomer);
            titleStr = `만기일 대상자 (30일 이내) (${filtered.length}명)`;
            thHtml += "<th>고객명</th><th>가입내역</th><th>만기일</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
        } else if (fType === 'claim') {
            filtered = filtered.filter(window.isClaimCustomer);
            titleStr = `이번 달 보험금 청구 고객 (${filtered.length}명)`;
            thHtml += "<th>고객명</th><th>청구/터치 내역</th><th>상태</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
        } else if (fType === 'status') {
            titleStr = `영업 파이프라인: ${fVal} (${filtered.length}명)`;
            thHtml += "<th>고객명</th><th>상태 변경 (1-클릭)</th><th>직업</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
        } else if (fType === 'insurance') {
            titleStr = `가입내역: ${fVal} (${filtered.length}명)`;
            thHtml += "<th>고객명</th><th>상품명</th><th>상태</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
        } else if (fType === 'insight') {
            titleStr = `터치인사이트: ${fVal} (${filtered.length}명)`;
            thHtml += "<th>고객명</th><th>상태</th><th>직업</th><th>태그</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
        } else if (fType === 'birth' || fType === 'sang') {
            if (fType === 'birth') {
                filtered = filtered.filter(window.isBirthCustomer);
                titleStr = `생일 대상자 (30일 이내) (${filtered.length}명)`;
            } else {
                filtered = filtered.filter(window.isSangryungCustomer);
                titleStr = `상령일 대상자 (30일 이내) (${filtered.length}명)`;
            }
            thHtml += "<th>고객명</th><th>" + (fType === 'birth' ? '생일' : '상령일') + "</th><th>상태</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
        } else if (fType === 'insurance') {
            titleStr = `가입내역: ${fVal} (${filtered.length}명)`;
            thHtml += "<th>고객명</th><th>상품명</th><th>상태</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
        } else {
            thHtml += "<th>고객명</th><th>상태</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
        }

        thHtml += "</tr>";
        head.innerHTML = thHtml;

        let tbHtml = "";
        if (filtered.length === 0) {
            const colCount = head ? (head.querySelectorAll('th').length || 5) : 5;
            tbHtml = "<tr><td colspan='" + colCount + "' style='text-align:center; padding: 40px; color:#94a3b8; font-size:14px; font-weight:600;'>해당하는 고객이 없습니다.</td></tr>";
        } else {
            filtered.forEach(r => {
                const name = r["고객명"] || r["대표자명"] || "-";
                const phone = r["폰번호"] || r["대표자 연락처"] || r["연락처"] || "-";
                const status = r["상태"] || r["고객상태"] || "잠재고객";
                const job = r["직업"] || r["대표업태"] || "-";
                const id = r["고객번호"] || r["ID"] || "";

                tbHtml += "<tr>";

                // Item 10: 파이프라인 1-클릭 상태 변경 셀렉트 박스 (잠재 / 관심 / 유력 / 계약)
                if (fType === 'status') {
                    let sBg = '#eff6ff', sColor = '#1d4ed8', sBorder = '#bfdbfe';
                    if (status.includes('잠재') || status.includes('가망') || status.includes('신규')) { sBg = '#eff6ff'; sColor = '#1d4ed8'; sBorder = '#bfdbfe'; }
                    else if (status.includes('관심')) { sBg = '#fff7ed'; sColor = '#c2410c'; sBorder = '#fed7aa'; }
                    else if (status.includes('유력') || status.includes('상담') || status.includes('설계')) { sBg = '#fef2f2'; sColor = '#b91c1c'; sBorder = '#fecaca'; }
                    else if (status.includes('계약') || status.includes('체결') || status.includes('케어') || status.includes('유지') || status.includes('집중') || status.includes('VIP')) { sBg = '#f0fdf4'; sColor = '#15803d'; sBorder = '#bbf7d0'; }

                    const statusOptions = ['잠재고객', '관심고객', '유력고객', '계약고객'];
                    let selectHtml = `<select onchange="window.quickChangeCustomerStatus('${id}', this.value, this)" style="padding:4px 10px; border-radius:8px; font-weight:700; font-size:12.5px; border:1.5px solid ${sBorder}; background:${sBg}; color:${sColor}; outline:none; cursor:pointer;">`;
                    
                    statusOptions.forEach(opt => {
                        const isSel = (status === opt) || 
                                      (opt === '잠재고객' && (status.includes('잠재') || status.includes('가망') || status.includes('신규'))) ||
                                      (opt === '관심고객' && status.includes('관심')) ||
                                      (opt === '유력고객' && (status.includes('유력') || status.includes('상담') || status.includes('설계'))) ||
                                      (opt === '계약고객' && (status.includes('체결') || status.includes('계약') || status.includes('케어') || status.includes('유지') || status.includes('집중') || status.includes('VIP')));
                        selectHtml += `<option value="${opt}" ${isSel ? 'selected' : ''}>${opt}</option>`;
                    });
                    selectHtml += `</select>`;

                    tbHtml += `<td><div class='user-name' style='font-weight:800; cursor:pointer; color:#0f172a;' onclick="if(typeof openProfile==='function') openProfile('${id}')">${name}</div></td>`;
                    tbHtml += `<td>${selectHtml}</td>`;
                    tbHtml += `<td>${job}</td>`;
                    tbHtml += `<td><span style="color:#0284c7; font-weight:700;">${phone}</span></td>`;
                }
                // Item 11: 이달의 보험금 청구 행
                else if (fType === 'claim') {
                    let claimInfo = r['보험금청구'] || r['청구내역'] || r['청구사유'] || r['터치인사이트'] || r['특이사항'] || '청구 건 접수';
                    tbHtml += `<td><div class='user-name' style='font-weight:800; cursor:pointer; color:#0f172a;' onclick="if(typeof openProfile==='function') openProfile('${id}')">${name}</div></td>`;
                    tbHtml += `<td><div style='color:#e11d48; font-weight:700; font-size:13px; max-width:260px; line-height:1.4;'>${claimInfo}</div></td>`;
                    tbHtml += `<td><span class='pill' style='background:#f1f5f9; color:#475569; font-weight:700;'>${status}</span></td>`;
                    tbHtml += `<td><span style="color:#0284c7; font-weight:700;">${phone}</span></td>`;
                }
                // Item 9: 만기일 대상자 행 (30일 이내 매칭)
                else if (fType === 'expiry') {
                    let expiringInsName = "-";
                    let expiringDate = "만기 예정";
                    try {
                        let gArr = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(r, true) : [];
                        const today = new Date();
                        const cleanToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

                        let expItems = gArr.filter(i => {
                            let ed = i['갱신일자'] || i['만기일자'] || i['갱신일'] || i['만기일'] || i['expireDate'] || i['renewalDate'] || '';
                            if (!ed) return false;
                            let p = getExpiryDateParts(ed);
                            if (!p) return false;
                            let expYear = (p.y !== null && p.y !== undefined) ? p.y : today.getFullYear();
                            let targetDate = new Date(expYear, p.m, p.d);
                            targetDate.setHours(0, 0, 0, 0);
                            if (p.y === null && targetDate < cleanToday) {
                                targetDate.setFullYear(today.getFullYear() + 1);
                            }
                            let diffDays = Math.round((targetDate - cleanToday) / (1000 * 60 * 60 * 24));
                            return (diffDays >= 0 && diffDays <= 30);
                        });

                        if (expItems.length > 0) {
                            let names = [];
                            let dates = [];
                            expItems.forEach(expItem => {
                                let comp = expItem['보험사명'] || expItem['차_보험사명'] || expItem['차_보험사'] || expItem['company'] || "-";
                                let prod = expItem['상품명'] || expItem['차_상품명'] || expItem['product'] || "보험 계약";
                                names.push(`<span style="font-size:11px; color:#64748b; background:#f1f5f9; padding:2px 6px; border-radius:4px; margin-right:4px;">${comp}</span><br><span style="color:#0f172a; font-weight:700;">${prod}</span>`);
                                dates.push(expItem['갱신일자'] || expItem['만기일자'] || expItem['갱신일'] || expItem['만기일'] || expItem['expireDate'] || expItem['renewalDate'] || "30일 내 만기");
                            });
                            expiringInsName = names.join('<hr style="margin:8px 0; border:0; border-top:1px dashed #cbd5e1;">');
                            expiringDate = dates.join('<hr style="margin:8px 0; border:0; border-top:1px dashed #cbd5e1;">');
                        }
                    } catch(e) {}

                    tbHtml += `<td><div class='user-name' style='font-weight:800; cursor:pointer; color:#0f172a;' onclick="if(typeof openProfile==='function') openProfile('${id}')">${name}</div></td>`;
                    tbHtml += `<td><div style='color:#475569; font-size:13px; max-width:220px; line-height:1.4;'>${expiringInsName}</div></td>`;
                    tbHtml += `<td><div style='color:#4f46e5; font-weight:800; font-size:13px;'>${expiringDate}</div></td>`;
                    tbHtml += `<td><span style="color:#0284c7; font-weight:700;">${phone}</span></td>`;
                }
                else if (fType === 'insurance') {
                    let matchedProd = "-";
                    try {
                        let gArr = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(r, true) : [];
                        const lifeComps = ["한화생명","교보생명","농협생명","메트라이프","KDB생명","DB생명","흥국생명","동양생명","미래에셋생명","라이나생명","푸본현대생명","신한라이프","ABL생명","iM라이프","KB라이프","IBK연금보험","처브라이프","카디프생명","하나생명","AIA생명"];
                        const nonlifeComps = ["삼성화재","메리츠화재","DB손해보험","KB손해보험","현대해상","한화손해보험","롯데손해보험","흥국화재","하나손해보험","NH농협손해보험","라이나손보","AIG손보","MG손해보험"];
                        let expItem = gArr.find(i => {
                            let comp = String(i['보험사명'] || i['차_보험사명'] || i['차_보험사'] || i['company'] || '').trim();
                            let prod = String(i['상품명'] || i['차_상품명'] || i['product'] || '').trim();
                            let kind = String(i['보험분류'] || '').trim();
                            if (fVal === '생보 전체보기' || fVal === '생명보험') {
                                return kind.includes('생명') || lifeComps.some(lc => comp.includes(lc) || lc.includes(comp));
                            } else if (fVal === '손보 전체보기' || fVal === '손해보험') {
                                return kind.includes('손해') || kind.includes('화재') || nonlifeComps.some(nc => comp.includes(nc) || nc.includes(comp));
                            }
                            return comp === fVal || comp.includes(fVal) || prod.includes(fVal);
                        });
                        if (expItem) {
                            let comp = expItem['보험사명'] || expItem['차_보험사명'] || expItem['차_보험사'] || expItem.company || "-";
                            let prod = expItem['상품명'] || expItem['차_상품명'] || expItem.product || "상품명 없음";
                            matchedProd = `<span style="font-size:11px; color:#64748b; background:#f1f5f9; padding:2px 6px; border-radius:4px; margin-right:4px;">${comp}</span><br><span style="color:#0f172a; font-weight:700;">${prod}</span>`;
                        }
                    } catch(e) {}
                    tbHtml += `<td><div class='user-name' style='font-weight:800; cursor:pointer; color:#0f172a;' onclick="if(typeof openProfile==='function') openProfile('${id}')">${name}</div></td>`;
                    tbHtml += `<td><div style='color:#475569; font-size:13px; max-width:200px; line-height:1.4;'>${matchedProd}</div></td>`;
                    tbHtml += `<td>${status}</td>`;
                    tbHtml += `<td><span style="color:#0284c7; font-weight:700;">${phone}</span></td>`;
                }
                else if (fType === 'insight') {
                    tbHtml += `<td><div class='user-name' style='font-weight:800; cursor:pointer; color:#0f172a;' onclick="if(typeof openProfile==='function') openProfile('${id}')">${name}</div></td>`;
                    tbHtml += `<td>${status}</td>`;
                    tbHtml += `<td>${job}</td>`;
                    tbHtml += `<td><span class='pill' style='background:#e0e7ff; color:#4338ca; border:1px solid #c7d2fe;'>${fVal}</span></td>`;
                    tbHtml += `<td><span style="color:#0284c7; font-weight:700;">${phone}</span></td>`;
                }
                else if (fType === 'birth' || fType === 'sang') {
                    const dateVal = r[fType === 'birth' ? '생일' : '상령일'] || "-";
                    tbHtml += `<td><div class='user-name' style='font-weight:800; cursor:pointer; color:#0f172a;' onclick="if(typeof openProfile==='function') openProfile('${id}')">${name}</div></td>`;
                    tbHtml += `<td><div style='color:#2563eb; font-weight:800;'>${dateVal}</div></td>`;
                    tbHtml += `<td>${status}</td>`;
                    tbHtml += `<td><span style="color:#0284c7; font-weight:700;">${phone}</span></td>`;
                }
                else {
                    tbHtml += `<td><div class='user-name' style='font-weight:800; cursor:pointer; color:#0f172a;' onclick="if(typeof openProfile==='function') openProfile('${id}')">${name}</div></td>`;
                    tbHtml += `<td>${status}</td>`;
                    tbHtml += `<td><span style="color:#0284c7; font-weight:700;">${phone}</span></td>`;
                }

                tbHtml += `<td style='text-align: right;'><button class='action-btn' onclick="if(typeof closeModal==='function') closeModal(); if(typeof openProfile==='function') openProfile('${id}');" title='상세보기' style="background:#f1f5f9; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:700; color:#475569;"><i class='fa-solid fa-arrow-right'></i></button></td>`;
                tbHtml += "</tr>";
            });
        }

        body.innerHTML = tbHtml;
        if (title) title.innerHTML = `<i class='fa-solid fa-list-check' style='color:#3b82f6;'></i> ` + titleStr;

        const listModal = document.getElementById('listModal');
        if (listModal) {
            listModal.style.display = 'flex';
            setTimeout(() => listModal.classList.add('active'), 10);
        }
    };
})();

// 초기화 시점 카운트 보정
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        if (typeof window.updateQuickFilterCounts === 'function') {
            window.updateQuickFilterCounts();
        }
    }, 500);
});

console.log("[CRM Modular] crm_enhancements.js 로드 완료 (구글알림정리, 만기계산보정, 파이프라인원클릭, 청구리스트)");



// ==============================================================
// 5. [신규] 고객 데이터 표준화 & 1-클릭 정제 도구 (Item 13 & User Request)
// ==============================================================
(function initDataCleaner() {
    function colIndexToLetter(colIdx) {
        let letter = '';
        while (colIdx >= 0) {
            let temp = colIdx % 26;
            letter = String.fromCharCode(temp + 65) + letter;
            colIdx = Math.floor(colIdx / 26) - 1;
        }
        return letter;
    }

    // 비표준 번호 검출 스캐너
    window.scanNonStandardCustomerData = function() {
        const list = window.globalCustomerData || [];
        const dirtyList = [];
        
        list.forEach((c, index) => {
            const origPhone = String(c['폰번호'] || c['연락처'] || c['전화번호'] || '').trim();
            const origJumin = String(c['주민번호'] || c['대표자주민번호'] || '').trim();
            
            let fixedPhone = origPhone;
            let phoneNeedsFix = false;
            if (origPhone && origPhone !== '폰없음') {
                fixedPhone = window.formatPhone ? window.formatPhone(origPhone) : origPhone;
                if (fixedPhone !== origPhone) {
                    phoneNeedsFix = true;
                }
            }
            
            let fixedJumin = origJumin;
            let juminNeedsFix = false;
            if (origJumin) {
                fixedJumin = window.formatJumin ? window.formatJumin(origJumin) : origJumin;
                if (fixedJumin !== origJumin) {
                    juminNeedsFix = true;
                }
            }
            
            if (phoneNeedsFix || juminNeedsFix) {
                dirtyList.push({
                    index,
                    rowNumber: c.rowNumber,
                    sheetName: c.sheetName || window.targetSheetName || 'weraclecrm',
                    id: c['고객번호'] || c['사업자번호'] || c['ID'] || (index + 1),
                    name: c['고객명'] || c['대표자명'] || '고객',
                    status: c['상태'] || c['진행상태'] || '고객',
                    origPhone,
                    fixedPhone,
                    phoneNeedsFix,
                    origJumin,
                    fixedJumin,
                    juminNeedsFix
                });
            }
        });
        return dirtyList;
    };

    // 모달 DOM 동적 생성
    function ensureCleanerModalDom() {
        let modal = document.getElementById('dataCleanerModal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'dataCleanerModal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.65); z-index:999999; display:none; justify-content:center; align-items:flex-start; padding:32px 16px 60px; box-sizing:border-box; backdrop-filter:blur(4px); overflow-y:auto;';
        
        modal.innerHTML = `
            <div style="background:#ffffff; border-radius:18px; width:100%; max-width:780px; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); overflow:hidden; border:1px solid #e2e8f0; animation: cleanerFadeIn 0.2s ease;">
                <!-- Header -->
                <div style="padding:20px 24px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; background:#ffffff;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:36px; height:36px; border-radius:10px; background:#eff6ff; color:#3b82f6; display:flex; align-items:center; justify-content:center; font-size:18px;">
                            <i class="fa-solid fa-wand-magic-sparkles"></i>
                        </div>
                        <div>
                            <h3 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">고객 번호(전화·주민) 표준화 정제 센터</h3>
                            <p style="margin:2px 0 0 0; font-size:12px; color:#64748b;">구글 시트에 등록된 데이터의 하이픈 누락 및 0 빠짐 번호를 자동 보정합니다.</p>
                        </div>
                    </div>
                    <button onclick="window.closeDataCleanerModal()" style="background:#f1f5f9; border:none; width:32px; height:32px; border-radius:8px; cursor:pointer; color:#64748b; font-size:15px; display:flex; align-items:center; justify-content:center;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <!-- Body (Scrollable) -->
                <div id="cleanerModalBody" style="padding:20px 24px; overflow-y:auto; flex:1; background:#f8fafc;">
                    <!-- Injected dynamically -->
                </div>

                <!-- Footer -->
                <div id="cleanerModalFooter" style="padding:16px 24px; border-top:1px solid #e2e8f0; background:#ffffff; display:flex; justify-content:space-between; align-items:center;">
                    <div id="cleanerSelectCountText" style="font-size:13px; font-weight:700; color:#475569;">선택 0건</div>
                    <div style="display:flex; gap:10px;">
                        <button onclick="window.closeDataCleanerModal()" style="padding:10px 18px; border-radius:10px; background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; font-weight:700; font-size:13px; cursor:pointer;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">닫기</button>
                        <button id="cleanerBatchBtn" onclick="window.executeDataCleaning()" style="padding:10px 22px; border-radius:10px; background:#3b82f6; color:#ffffff; border:none; font-weight:800; font-size:13.5px; cursor:pointer; box-shadow:0 2px 6px rgba(59,130,246,0.3); display:flex; align-items:center; gap:8px;" onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">
                            <i class="fa-solid fa-bolt"></i> 구글 시트 일괄 자동 수정
                        </button>
                    </div>
                </div>
            </div>
        `;

        // CSS animation
        if (!document.getElementById('cleanerModalStyle')) {
            const st = document.createElement('style');
            st.id = 'cleanerModalStyle';
            st.innerHTML = `
                @keyframes cleanerFadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
                .cleaner-check:checked { accent-color: #3b82f6; }
            `;
            document.head.appendChild(st);
        }

        document.body.appendChild(modal);
        return modal;
    }

    let _currentDirtyList = [];

    // 모달 열기
    window.openDataCleanerModal = function() {
        if (!window.globalCustomerData || window.globalCustomerData.length === 0) {
            alert("불러온 고객 데이터가 없습니다.\n먼저 화면 우측 상단의 [연동하기] 버튼으로 구글 시트를 연동해 주세요.");
            return;
        }

        const modal = ensureCleanerModalDom();
        const dirtyList = window.scanNonStandardCustomerData();
        _currentDirtyList = dirtyList;

        const bodyArea = document.getElementById('cleanerModalBody');
        const footerArea = document.getElementById('cleanerModalFooter');
        const batchBtn = document.getElementById('cleanerBatchBtn');

        if (dirtyList.length === 0) {
            bodyArea.innerHTML = `
                <div style="text-align:center; padding:50px 20px;">
                    <div style="width:68px; height:68px; border-radius:50%; background:#ecfdf5; color:#10b981; font-size:32px; display:inline-flex; align-items:center; justify-content:center; margin-bottom:16px;">
                        <i class="fa-solid fa-circle-check"></i>
                    </div>
                    <h3 style="margin:0 0 8px 0; font-size:19px; font-weight:800; color:#0f172a;">모든 번호가 완벽하게 표준화되어 있습니다!</h3>
                    <p style="margin:0; font-size:14px; color:#64748b; line-height:1.5;">
                        등록된 전체 고객 (${window.globalCustomerData.length}명)의 전화번호(010-XXXX-XXXX) 및<br>
                        주민번호(XXXXXX-XXXXXXX)가 모두 표준 규격에 맞게 저장되어 있습니다.
                    </p>
                </div>
            `;
            if (batchBtn) batchBtn.style.display = 'none';
            document.getElementById('cleanerSelectCountText').innerText = "이상 데이터 없음";
        } else {
            if (batchBtn) batchBtn.style.display = 'inline-flex';
            
            let html = `
                <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:14px 16px; margin-bottom:16px; display:flex; align-items:flex-start; gap:12px;">
                    <i class="fa-solid fa-triangle-exclamation" style="color:#d97706; font-size:20px; flex-shrink:0; margin-top:2px;"></i>
                    <div style="font-size:13px; color:#92400e; line-height:1.5; flex:1;">
                        전체 <strong>${window.globalCustomerData.length}명</strong> 중 <strong>${dirtyList.length}건</strong>의 비표준 데이터(앞 0 누락, 하이픈 미입력 등)가 발견되었습니다.<br>
                        <div style="margin-top:6px; display:inline-flex; align-items:center; gap:6px; background:#fef3c7; color:#b45309; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:700; border:1px solid #fcd34d;">
                            <i class="fa-solid fa-pen-to-square"></i> [정제 후] 초록색/파란색 번호 칸을 클릭하여 원하는 번호로 직접 자유롭게 수정하실 수 있습니다!
                        </div>
                    </div>
                </div>

                <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
                    <table style="width:100%; border-collapse:collapse; font-size:12.5px; text-align:left;">
                        <thead>
                            <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0;">
                                <th style="padding:10px 12px; width:34px; text-align:center;">
                                    <input type="checkbox" id="cleanerMasterCheck" checked onchange="window.toggleAllCleanerChecks(this.checked)" style="width:15px; height:15px; cursor:pointer;">
                                </th>
                                <th style="padding:10px 12px; font-weight:700; color:#475569; width:130px;">고객명 (번호)</th>
                                <th style="padding:10px 12px; font-weight:700; color:#475569;">전화번호 (정제 전 ➔ 정제 후 / 클릭하여 수정)</th>
                                <th style="padding:10px 12px; font-weight:700; color:#475569;">주민번호 (정제 전 ➔ 정제 후 / 클릭하여 수정)</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            dirtyList.forEach((item, idx) => {
                let phoneDiffHtml = '';
                if (item.phoneNeedsFix) {
                    phoneDiffHtml = `
                        <div style="display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <span style="color:#ef4444; text-decoration:line-through; font-family:monospace; font-size:11.5px;">${item.origPhone || '(빈값)'}</span>
                            <span style="color:#64748b; font-size:11px;">➔</span>
                            <div style="position:relative; display:inline-flex; align-items:center;">
                                <input type="text" class="cleaner-input-phone" data-idx="${idx}" value="${item.fixedPhone}"
                                       oninput="window.handleCleanerInputChange(this, '${idx}', 'phone')"
                                       style="padding:4px 8px 4px 22px; border:1.5px solid #10b981; border-radius:6px; font-weight:800; font-family:monospace; color:#065f46; background:#ecfdf5; font-size:12.5px; width:130px; outline:none; transition:0.15s;"
                                       onfocus="this.style.borderColor='#059669'; this.style.background='#ffffff'; this.style.boxShadow='0 0 0 2px rgba(16,185,129,0.2)';"
                                       onblur="this.style.borderColor='#10b981'; this.style.background='#ecfdf5'; this.style.boxShadow='none';"
                                       title="클릭하여 번호를 직접 수정할 수 있습니다" />
                                <i class="fa-solid fa-pen" style="position:absolute; left:7px; font-size:9.5px; color:#10b981; pointer-events:none;"></i>
                            </div>
                        </div>
                    `;
                } else {
                    phoneDiffHtml = `
                        <div style="position:relative; display:inline-flex; align-items:center;">
                            <input type="text" class="cleaner-input-phone" data-idx="${idx}" value="${item.origPhone || ''}"
                                   oninput="window.handleCleanerInputChange(this, '${idx}', 'phone')"
                                   style="padding:4px 8px 4px 22px; border:1px solid #cbd5e1; border-radius:6px; font-weight:600; font-family:monospace; color:#475569; background:#f8fafc; font-size:12px; width:130px; outline:none; transition:0.15s;"
                                   onfocus="this.style.borderColor='#3b82f6'; this.style.background='#ffffff';"
                                   onblur="this.style.borderColor='#cbd5e1'; this.style.background='#f8fafc';"
                                   title="클릭하여 번호를 직접 수정할 수 있습니다" />
                            <i class="fa-solid fa-pen" style="position:absolute; left:7px; font-size:9.5px; color:#94a3b8; pointer-events:none;"></i>
                        </div>
                    `;
                }

                let juminDiffHtml = '';
                if (item.juminNeedsFix) {
                    juminDiffHtml = `
                        <div style="display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <span style="color:#ef4444; text-decoration:line-through; font-family:monospace; font-size:11.5px;">${item.origJumin || '(빈값)'}</span>
                            <span style="color:#64748b; font-size:11px;">➔</span>
                            <div style="position:relative; display:inline-flex; align-items:center;">
                                <input type="text" class="cleaner-input-jumin" data-idx="${idx}" value="${item.fixedJumin}"
                                       oninput="window.handleCleanerInputChange(this, '${idx}', 'jumin')"
                                       style="padding:4px 8px 4px 22px; border:1.5px solid #3b82f6; border-radius:6px; font-weight:800; font-family:monospace; color:#1d4ed8; background:#eff6ff; font-size:12.5px; width:140px; outline:none; transition:0.15s;"
                                       onfocus="this.style.borderColor='#2563eb'; this.style.background='#ffffff'; this.style.boxShadow='0 0 0 2px rgba(59,130,246,0.2)';"
                                       onblur="this.style.borderColor='#3b82f6'; this.style.background='#eff6ff'; this.style.boxShadow='none';"
                                       title="클릭하여 주민번호를 직접 수정할 수 있습니다" />
                                <i class="fa-solid fa-pen" style="position:absolute; left:7px; font-size:9.5px; color:#3b82f6; pointer-events:none;"></i>
                            </div>
                        </div>
                    `;
                } else {
                    juminDiffHtml = `
                        <div style="position:relative; display:inline-flex; align-items:center;">
                            <input type="text" class="cleaner-input-jumin" data-idx="${idx}" value="${item.origJumin || ''}"
                                   oninput="window.handleCleanerInputChange(this, '${idx}', 'jumin')"
                                   style="padding:4px 8px 4px 22px; border:1px solid #cbd5e1; border-radius:6px; font-weight:600; font-family:monospace; color:#475569; background:#f8fafc; font-size:12px; width:140px; outline:none; transition:0.15s;"
                                   onfocus="this.style.borderColor='#3b82f6'; this.style.background='#ffffff';"
                                   onblur="this.style.borderColor='#cbd5e1'; this.style.background='#f8fafc';"
                                   title="클릭하여 주민번호를 직접 수정할 수 있습니다" />
                            <i class="fa-solid fa-pen" style="position:absolute; left:7px; font-size:9.5px; color:#94a3b8; pointer-events:none;"></i>
                        </div>
                    `;
                }

                html += `
                    <tr style="border-bottom:1px solid #f1f5f9;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
                        <td style="padding:10px 12px; text-align:center;">
                            <input type="checkbox" class="cleaner-row-check" data-idx="${idx}" checked onchange="window.updateCleanerSelectCount()" style="width:15px; height:15px; cursor:pointer;">
                        </td>
                        <td style="padding:10px 12px; font-weight:800; color:#1e293b;">
                            ${item.name} <span style="font-weight:500; font-size:11.5px; color:#64748b;">(No.${item.id})</span>
                        </td>
                        <td style="padding:10px 12px;">${phoneDiffHtml}</td>
                        <td style="padding:10px 12px;">${juminDiffHtml}</td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
            bodyArea.innerHTML = html;
            window.updateCleanerSelectCount();
        }

        modal.style.display = 'flex';
    };

    window.closeDataCleanerModal = function() {
        const modal = document.getElementById('dataCleanerModal');
        if (modal) modal.style.display = 'none';
    };

    window.toggleAllCleanerChecks = function(checked) {
        document.querySelectorAll('.cleaner-row-check').forEach(cb => {
            cb.checked = checked;
        });
        window.updateCleanerSelectCount();
    };

    window.updateCleanerSelectCount = function() {
        const checks = document.querySelectorAll('.cleaner-row-check:checked');
        const count = checks.length;
        const total = _currentDirtyList.length;
        
        const textEl = document.getElementById('cleanerSelectCountText');
        if (textEl) textEl.innerText = `선택됨: ${count} / ${total}건`;

        const batchBtn = document.getElementById('cleanerBatchBtn');
        if (batchBtn) {
            batchBtn.disabled = (count === 0);
            batchBtn.style.opacity = (count === 0) ? '0.5' : '1';
            batchBtn.innerHTML = `<i class="fa-solid fa-bolt"></i> 선택한 ${count}건 구글 시트 일괄 반영`;
        }
    };

    // 일괄 업데이트 실행
    window.handleCleanerInputChange = function(inputEl, idx, type) {
        const val = inputEl.value.trim();
        const numIdx = parseInt(idx, 10);
        if (!_currentDirtyList || !_currentDirtyList[numIdx]) return;
        const item = _currentDirtyList[numIdx];
        if (type === 'phone') {
            item.fixedPhone = val;
            item.phoneNeedsFix = (val !== item.origPhone);
        } else if (type === 'jumin') {
            item.fixedJumin = val;
            item.juminNeedsFix = (val !== item.origJumin);
        }
    };

    window.executeDataCleaning = async function() {
        const checkedBoxes = Array.from(document.querySelectorAll('.cleaner-row-check:checked'));
        if (checkedBoxes.length === 0) {
            alert("선택된 고객 데이터가 없습니다.");
            return;
        }

        const selectedItems = checkedBoxes.map(cb => {
            const idx = parseInt(cb.getAttribute('data-idx'), 10);
            const item = _currentDirtyList[idx];
            if (!item) return null;

            const pInput = document.querySelector(`.cleaner-input-phone[data-idx="${idx}"]`);
            const jInput = document.querySelector(`.cleaner-input-jumin[data-idx="${idx}"]`);

            if (pInput) {
                const userPhone = pInput.value.trim();
                item.fixedPhone = userPhone;
                if (userPhone !== item.origPhone) item.phoneNeedsFix = true;
            }
            if (jInput) {
                const userJumin = jInput.value.trim();
                item.fixedJumin = userJumin;
                if (userJumin !== item.origJumin) item.juminNeedsFix = true;
            }
            return item;
        }).filter(Boolean);

        const ok = confirm(`선택하신 ${selectedItems.length}명의 번호를 구글 시트에 표준 규격으로 일괄 업데이트하시겠습니까?\n\n• 전화번호: 010-XXXX-XXXX 형식 통일\n• 주민번호: XXXXXX-XXXXXXX 형식 통일`);
        if (!ok) return;

        if (typeof showLoading === 'function') showLoading(true);

        try {
            const spreadsheetId = (window.spreadsheetId || localStorage.getItem("g_sheet_id"));
            if (typeof gapi === 'undefined' || !gapi.client || !gapi.client.sheets) {
                throw new Error("구글 시트 연동 라이브러리(GAPI)가 로드되지 않았습니다. 인터넷 상태 및 로그인을 확인해주세요.");
            }
            if (!spreadsheetId) {
                throw new Error("연결된 구글 시트 ID를 찾을 수 없습니다. 우측 상단의 [연동하기] 버튼으로 구글 시트를 먼저 연동해 주세요.");
            }

            const batchData = [];

            selectedItems.forEach(item => {
                const sheet = item.sheetName || window.targetSheetName || 'weraclecrm';
                const headers = (typeof getCrmHeaders === 'function') ? getCrmHeaders(sheet) : [];
                
                let juminIdx = headers.indexOf('주민번호');
                if (juminIdx === -1) juminIdx = headers.indexOf('사업자번호');
                if (juminIdx === -1) juminIdx = headers.indexOf('주민등록번호');

                let phoneIdx = headers.indexOf('폰번호');
                if (phoneIdx === -1) phoneIdx = headers.indexOf('연락처');
                if (phoneIdx === -1) phoneIdx = headers.indexOf('전화번호');
                if (phoneIdx === -1) phoneIdx = headers.indexOf('대표자폰번호');

                if (item.phoneNeedsFix && phoneIdx !== -1 && item.rowNumber) {
                    const colLetter = colIndexToLetter(phoneIdx);
                    batchData.push({
                        range: `${sheet}!${colLetter}${item.rowNumber}`,
                        values: [[item.fixedPhone]]
                    });
                }

                if (item.juminNeedsFix && juminIdx !== -1 && item.rowNumber) {
                    const colLetter = colIndexToLetter(juminIdx);
                    batchData.push({
                        range: `${sheet}!${colLetter}${item.rowNumber}`,
                        values: [[item.fixedJumin]]
                    });
                }
            });

            if (batchData.length === 0) {
                throw new Error("수정 대상 셀의 열 위치나 행 번호를 찾지 못했습니다. 시트 헤더 설정을 확인해 주세요.");
            }

            await gapi.client.sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: spreadsheetId,
                resource: {
                    valueInputOption: "USER_ENTERED",
                    data: batchData
                }
            });
            console.log(`[Cleaner] Google Sheets ${batchData.length} cells successfully updated via batchUpdate!`);

            // In-Memory globalCustomerData 동기화
            selectedItems.forEach(item => {
                if (window.globalCustomerData && window.globalCustomerData[item.index]) {
                    const cust = window.globalCustomerData[item.index];
                    if (item.phoneNeedsFix) {
                        cust['폰번호'] = item.fixedPhone;
                        if (cust['연락처']) cust['연락처'] = item.fixedPhone;
                        if (cust['전화번호']) cust['전화번호'] = item.fixedPhone;
                    }
                    if (item.juminNeedsFix) {
                        cust['주민번호'] = item.fixedJumin;
                    }
                }
            });

            // 화면 리렌더링
            if (typeof renderTable === 'function') renderTable();
            if (typeof updateQuickFilterCounts === 'function') updateQuickFilterCounts();

            if (typeof showLoading === 'function') showLoading(false);
            window.closeDataCleanerModal();

            alert(`🎉 성공적으로 정제 완료되었습니다!\n\n총 ${selectedItems.length}명의 고객 정보가 표준 규격(010-XXXX-XXXX / XXXXXX-XXXXXXX)으로 구글 시트에 업데이트되었습니다.`);
        } catch (err) {
            console.error("Data cleaner error:", err);
            if (typeof showLoading === 'function') showLoading(false);
            alert("정제 중 오류가 발생했습니다: " + (err.message || err));
        }
    };
})();
