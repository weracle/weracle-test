/**
 * crm_smart_reg.js
 * 위라클 CRM - 스마트 간편 등록 전담 모듈 (독립 분리)
 * 기능:
 * 1. 전화번호 010-XXXX-XXXX 표준 자동 포맷팅 (Item 13)
 * 2. 주민번호 및 전화번호 중복 고객 자동 감지 및 확인 팝업 (Item 12)
 * 3. 스마트 간편 등록 처리 (submitSmartReg 오버라이드)
 */

// 전화번호 포맷팅 함수 (어떤 방식으로 입력하든 010-0000-0000 규격으로 통일)
window.formatPhoneNumber = function(input) {
    if (!input) return "";
    let clean = String(input).replace(/\D/g, "");
    
    if (clean.length === 11) {
        return clean.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    } else if (clean.length === 10) {
        if (clean.startsWith('02')) {
            return clean.replace(/(\d{2})(\d{4})(\d{4})/, '$1-$2-$3');
        } else {
            return clean.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
        }
    } else if (clean.length === 9 && clean.startsWith('02')) {
        return clean.replace(/(\d{2})(\d{3})(\d{4})/, '$1-$2-$3');
    } else if (clean.length > 11) {
        // 11자리 초과시 앞 11자리 기준 포맷
        clean = clean.substring(0, 11);
        return clean.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    }
    return input.trim();
};

// 중복 고객 감지 함수 (주민번호 또는 전화번호)
window.findDuplicateCustomer = function(phone, jumin) {
    if (!window.globalCustomerData || window.globalCustomerData.length === 0) return null;
    
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    const cleanJumin = String(jumin || '').replace(/\D/g, '');
    
    // 전화번호는 최소 9자리 이상일 때 검사
    const hasValidPhone = cleanPhone.length >= 9;
    // 주민번호는 앞 6자리(생년월일) 이상 또는 13자리 전체
    const hasValidJumin = cleanJumin.length >= 13;
    
    if (!hasValidPhone && !hasValidJumin) return null;
    
    return window.globalCustomerData.find(c => {
        const cPhone = String(c['폰번호'] || c['연락처'] || c['대표자폰번호'] || c['대표자 연락처'] || '').replace(/\D/g, '');
        const cJumin = String(c['주민번호'] || c['사업자번호'] || '').replace(/\D/g, '');
        
        // 1. 전화번호 일치 검사
        if (hasValidPhone && cPhone && cPhone === cleanPhone) {
            return true;
        }
        
        // 2. 13자리 주민번호 일치 검사
        if (hasValidJumin && cJumin && cJumin.length >= 13 && cJumin === cleanJumin) {
            return true;
        }
        
        return false;
    });
};

// 실시간 전화번호 입력 포맷 이벤트 바인딩
document.addEventListener('DOMContentLoaded', function() {
    initPhoneFormatters();
});

function initPhoneFormatters() {
    const phoneInputs = ['smartRegPhone', 'client_phone', 'modal_phone'];
    phoneInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', function(e) {
                // 숫자만 추출 후 임시 포맷
                let num = e.target.value.replace(/\D/g, '');
                if (num.length >= 11) {
                    e.target.value = window.formatPhoneNumber(num);
                }
            });
            el.addEventListener('blur', function(e) {
                e.target.value = window.formatPhoneNumber(e.target.value);
            });
        }
    });
}

// 스마트 등록 처리 오버라이드
window.submitSmartReg = async function() {
    const nameEl = document.getElementById('smartRegName');
    const name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
        alert("고객명을 입력해주세요.");
        if (nameEl) nameEl.focus();
        return;
    }
    
    let jumin = document.getElementById('smartRegJumin') ? document.getElementById('smartRegJumin').value.trim() : '';
    let phoneRaw = document.getElementById('smartRegPhone') ? document.getElementById('smartRegPhone').value.trim() : '';
    const addr = document.getElementById('smartRegAddr') ? document.getElementById('smartRegAddr').value.trim() : '';
    const job = document.getElementById('smartRegJob') ? document.getElementById('smartRegJob').value.trim() : '';
    const memo = document.getElementById('smartRegMemo') ? document.getElementById('smartRegMemo').value.trim() : '';
    
    // 전화번호 010-XXXX-XXXX 통일 포맷 적용 (Item 13)
    const phone = window.formatPhoneNumber(phoneRaw);
    if (document.getElementById('smartRegPhone')) {
        document.getElementById('smartRegPhone').value = phone;
    }
    
    // 주민번호 하이픈 정규화
    const cleanJumin = jumin.replace(/\D/g, "");
    if (cleanJumin.length === 13) {
        jumin = cleanJumin.substring(0, 6) + "-" + cleanJumin.substring(6, 13);
    }
    
    // 중복 고객 감지 검사 (Item 12)
    const duplicate = window.findDuplicateCustomer(phone, cleanJumin);
    if (duplicate) {
        const exName = duplicate['고객명'] || duplicate['대표자명'] || '기존고객';
        const exPhone = duplicate['폰번호'] || duplicate['연락처'] || '-';
        const exId = duplicate['고객번호'] || duplicate['ID'] || '';
        const exStatus = duplicate['상태'] || duplicate['고객상태'] || '-';
        
        const confirmMsg = `⚠️ 이미 등록된 고객입니다!\n\n` +
            `• 기존 고객명: ${exName}\n` +
            `• 기존 연락처: ${exPhone}\n` +
            `• 고객 상태: ${exStatus} (고객번호: ${exId}번)\n\n` +
            `정말로 중복으로 추가 등록하시겠습니까?`;
            
        if (!confirm(confirmMsg)) {
            console.log("[스마트 간편 등록] 중복 감출로 등록 취소됨");
            return;
        }
    }
    
    // 신규 고객 ID 배정
    let newId = document.getElementById('smartRegId') ? document.getElementById('smartRegId').value : "";
    if (!newId) {
        let maxId = 0;
        if (typeof globalCustomerData !== 'undefined' && globalCustomerData.length > 0) {
            globalCustomerData.forEach(c => {
                const num = parseInt(c['고객번호'] || c['ID'], 10);
                if (!isNaN(num) && num > maxId) maxId = num;
            });
        }
        newId = maxId > 0 ? (maxId + 1).toString() : "1";
    }
    
    // 구글 시트 API 연동 확인
    if (typeof gapi === 'undefined' || !gapi.client || !gapi.client.sheets) {
        alert("Google Sheets API가 초기화되지 않았습니다. 우측 상단의 [연동하기]를 확인해주세요.");
        return;
    }
    
    const spreadsheetId = (window.spreadsheetId || localStorage.getItem('g_sheet_id'));
    if (!spreadsheetId) {
        alert('연동된 구글 시트 ID가 없습니다. 연동 상태를 확인해 주세요.');
        return;
    }
    
    const sName = "weraclecrm"; // 일반고객 시트 고정
    
    try {
        const headers = (typeof getCrmHeaders === 'function') ? getCrmHeaders(sName) : (window.getCrmHeaders ? window.getCrmHeaders(sName) : []);
        const rowArr = new Array(headers.length).fill("");
        
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = yyyy + "-" + mm + "-" + dd;
        
        let calculatedAge = '', calculatedGender = '', calculatedSang = '', calculatedBirth = '';
        if (cleanJumin && cleanJumin.length >= 6) {
            const jd = (typeof calculateJuminData === 'function') ? calculateJuminData(cleanJumin) : (window.calculateJuminData ? window.calculateJuminData(cleanJumin) : null);
            if (jd) {
                calculatedAge = jd.age || '';
                calculatedGender = jd.gender || '';
                calculatedBirth = jd.birth || '';
                calculatedSang = jd.sang || '';
            }
        }
        
        const newUid = "UID_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
        
        headers.forEach((h, i) => {
            const head = String(h).trim();
            if (head === "고객번호" || head === "ID") rowArr[i] = newId;
            else if (head === "고객명" || head === "대표자명") rowArr[i] = name;
            else if (head === "주민번호" || head === "사업자번호") rowArr[i] = jumin;
            else if (head === "폰번호" || head === "대표자폰번호" || head === "연락처") rowArr[i] = phone;
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
        
        const endCol = (typeof getCrmEndCol === 'function') ? getCrmEndCol(sName) : (window.getCrmEndCol ? window.getCrmEndCol(sName) : 'AZ');
        const rangeStr = sName + "!A1:" + endCol + "1";
        
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId,
            range: rangeStr,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: [rowArr] }
        });
        
        alert(`✅ 고객 [${name}]님이 성공적으로 등록되었습니다!\n(연락처: ${phone || '없음'})`);
        if (typeof window.closeSmartRegModal === 'function') window.closeSmartRegModal();
        
        // Optimistic UI Update: 대시보드 및 테이블 즉시 반영
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
        let msg = e.message;
        if (!msg && e.result && e.result.error) msg = e.result.error.message;
        
        if (msg === "Failed to fetch" || (typeof msg === 'string' && msg.includes("A network error occurred"))) {
            alert("구글 계정 연동 세션이 만료되었습니다.\n안전한 데이터 저장을 위해 화면 우측 상단의 [연동하기] 버튼을 눌러 다시 연동해 주세요.");
        } else {
            alert("등록 중 오류가 발생했습니다: " + (msg || "알 수 없는 오류"));
        }
    }
};

console.log("[CRM Modular] crm_smart_reg.js 로드 완료 (중복 감지 & 전화번호 표준화)");
