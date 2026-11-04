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
// 9. 만기 도래 계산 헬퍼 - 지난 날짜 제외 (Item 9)
// ==============================================================
window.isExpiringCustomer = function(c) {
    let hasExp = false;
    try {
        let gArr = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(c, true) : [];
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
        const curYear = today.getFullYear();
        const curMonth = today.getMonth(); // 0-indexed

        gArr.forEach(i => {
            let ed = i['갱신일자'] || i['만기일자'] || i['갱신일'] || i['만기일'] || '';
            if (ed) {
                let dStr = String(ed).replace(/\D/g, '');
                if (dStr.length >= 6) {
                    let y = parseInt(dStr.substring(0, 4), 10);
                    let m = parseInt(dStr.substring(4, 6), 10) - 1;
                    let d = dStr.length >= 8 ? parseInt(dStr.substring(6, 8), 10) : 28;
                    let expDate = new Date(y, m, d, 23, 59, 59);

                    // 당월 만기이면서 '오늘(자정)' 이후(당일 포함)인 건만 인정 (이미 지난 만기 제외!)
                    if (y === curYear && m === curMonth && expDate >= todayStart) {
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
    const prevStatus = cust['상태'] || cust['고객상태'] || '관심고객';
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
    // 1. 대시보드 카운트 함수 고도화 (만기 지난 계약 제외 + 이달의 청구 뱃지 연동)
    const origUpdateCounts = window.updateQuickFilterCounts;
    window.updateQuickFilterCounts = function() {
        if (!window.globalCustomerData) return;

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

        window.globalCustomerData.forEach(c => {
            let s = String(c['상태'] || c['고객상태'] || '');
            if (s.includes('관심') || s.includes('가망')) interest++;
            else if (s.includes('상담') || s.includes('설계')) consult++;
            else if (s.includes('체결') || s.includes('계약')) contract++;
            else if (s.includes('케어') || s.includes('집중')) care++;

            // 생일
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
            if (bMD === currentMD) birth++;

            // 상령일
            let sMD = "";
            const sang = String(c['상령일'] || "").replace(/\D/g, '');
            if (sang.length >= 8) sMD = sang.substring(4, 8);
            else if (sang.length >= 6) sMD = sang.substring(2, 6);
            else if (sang.length >= 4) sMD = sang.substring(0, 4);
            if (!sMD && bMD && bMD.length === 4) {
                let m = parseInt(bMD.substring(0,2), 10);
                let d = bMD.substring(2,4);
                m = m + 6;
                if (m > 12) m -= 12;
                sMD = String(m).padStart(2, '0') + d;
            }
            if (sMD && sMD.length === 4) {
                let sy = today.getFullYear();
                let sm = parseInt(sMD.substring(0,2), 10) - 1;
                let sd = parseInt(sMD.substring(2,4), 10);
                let sDate = new Date(sy, sm, sd);
                if (sDate < today) sDate.setFullYear(sy + 1);
                let diffDays = Math.floor((sDate - today) / (1000 * 60 * 60 * 24));
                if (diffDays >= 0 && diffDays <= 30) sangryung++;
            }

            // 만기 도래 (Item 9: 지난 날짜 제외한 정확한 계산)
            if (window.isExpiringCustomer(c)) expiry++;

            // 이달의 보험금 청구 (Item 11)
            if (window.isClaimCustomer(c)) claim++;
        });

        // UI 엘리먼트 갱신
        const setElText = (id, txt) => {
            const el = document.getElementById(id);
            if (el) el.innerText = txt;
        };

        setElText('pipe-count-interest', interest);
        setElText('pipe-count-consult', consult);
        setElText('pipe-count-contract', contract);
        setElText('pipe-count-care', care);

        setElText('mini-badge-birth', birth + "명");
        setElText('mini-badge-sangryung', sangryung + "명");
        setElText('mini-badge-expiry', expiry + "명");
        setElText('mini-badge-claim', claim + "명");
    };

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
            titleStr = `이번 달 만기 예정 고객 (${filtered.length}명)`;
            thHtml += "<th>고객명</th><th>가입내역</th><th>만기일</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
        } else if (fType === 'claim') {
            filtered = filtered.filter(window.isClaimCustomer);
            titleStr = `이번 달 보험금 청구 고객 (${filtered.length}명)`;
            thHtml += "<th>고객명</th><th>청구/터치 내역</th><th>상태</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
        } else if (fType === 'status') {
            titleStr = `영업 파이프라인: ${fVal} (${filtered.length}명)`;
            thHtml += "<th>고객명</th><th>상태 변경 (1-클릭)</th><th>직업</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
        } else if (fType === 'insight') {
            titleStr = `터치인사이트: ${fVal} (${filtered.length}명)`;
            thHtml += "<th>고객명</th><th>상태</th><th>직업</th><th>태그</th><th>폰번호</th><th style='text-align: right;'>상세보기</th>";
        } else if (fType === 'birth' || fType === 'sang') {
            titleStr = (fType === 'birth' ? "오늘 생일 고객" : "상령일 도래 고객") + ` (${filtered.length}명)`;
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
            tbHtml = "<tr><td colspan='6' style='text-align:center; padding: 40px; color:#94a3b8; font-size:14px; font-weight:600;'>해당하는 고객이 없습니다.</td></tr>";
        } else {
            filtered.forEach(r => {
                const name = r["고객명"] || r["대표자명"] || "-";
                const phone = r["폰번호"] || r["대표자 연락처"] || r["연락처"] || "-";
                const status = r["상태"] || r["고객상태"] || "관심고객";
                const job = r["직업"] || r["대표업태"] || "-";
                const id = r["고객번호"] || r["ID"] || "";

                tbHtml += "<tr>";

                // Item 10: 파이프라인 1-클릭 상태 변경 셀렉트 박스
                if (fType === 'status') {
                    let sBg = '#eff6ff', sColor = '#2563eb', sBorder = '#93c5fd';
                    if (status.includes('상담') || status.includes('설계')) { sBg = '#fefce8'; sColor = '#ca8a04'; sBorder = '#fde047'; }
                    else if (status.includes('체결') || status.includes('계약')) { sBg = '#ecfdf5'; sColor = '#059669'; sBorder = '#86efac'; }
                    else if (status.includes('케어') || status.includes('집중')) { sBg = '#fee2e2'; sColor = '#dc2626'; sBorder = '#fca5a5'; }

                    const statusOptions = ['관심고객', '상담/설계', '계약체결', '집중케어'];
                    let selectHtml = `<select onchange="window.quickChangeCustomerStatus('${id}', this.value, this)" style="padding:4px 10px; border-radius:8px; font-weight:700; font-size:12.5px; border:1.5px solid ${sBorder}; background:${sBg}; color:${sColor}; outline:none; cursor:pointer;">`;
                    
                    statusOptions.forEach(opt => {
                        const isSel = (status === opt) || 
                                      (opt === '관심고객' && (status.includes('관심') || status.includes('가망'))) ||
                                      (opt === '상담/설계' && (status.includes('상담') || status.includes('설계'))) ||
                                      (opt === '계약체결' && (status.includes('체결') || status.includes('계약'))) ||
                                      (opt === '집중케어' && (status.includes('케어') || status.includes('집중')));
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
                // Item 9: 만기 도래 행 (지난 계약 제외)
                else if (fType === 'expiry') {
                    let expiringInsName = "-";
                    let expiringDate = "만기예정";
                    try {
                        let gArr = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(r, true) : [];
                        const today = new Date();
                        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
                        const curYear = today.getFullYear();
                        const curMonth = today.getMonth();

                        let expItems = gArr.filter(i => {
                            let ed = i['갱신일자'] || i['만기일자'] || i['갱신일'] || i['만기일'] || '';
                            if (!ed) return false;
                            let dStr = String(ed).replace(/\D/g, '');
                            if (dStr.length >= 6) {
                                let y = parseInt(dStr.substring(0, 4), 10);
                                let m = parseInt(dStr.substring(4, 6), 10) - 1;
                                let d = dStr.length >= 8 ? parseInt(dStr.substring(6, 8), 10) : 28;
                                let expDate = new Date(y, m, d, 23, 59, 59);
                                return (y === curYear && m === curMonth && expDate >= todayStart);
                            }
                            return false;
                        });

                        if (expItems.length > 0) {
                            let names = [];
                            let dates = [];
                            expItems.forEach(expItem => {
                                let comp = expItem['보험사명'] || expItem['차_보험사명'] || expItem['차_보험사'] || "-";
                                let prod = expItem['상품명'] || expItem['차_상품명'] || "보험 계약";
                                names.push(`<span style="font-size:11px; color:#64748b; background:#f1f5f9; padding:2px 6px; border-radius:4px; margin-right:4px;">${comp}</span><br><span style="color:#0f172a; font-weight:700;">${prod}</span>`);
                                dates.push(expItem['갱신일자'] || expItem['만기일자'] || expItem['갱신일'] || expItem['만기일'] || "만기예정");
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
