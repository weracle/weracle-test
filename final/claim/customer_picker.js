/**
 * ==============================================================================
 * [위라클 통합 보험금 청구] 청구 대상자 사전 설정 위저드 및 CRM 고객 연동 모듈
 * ==============================================================================
 * 
 * [핵심 프로세스]
 * 1. 보험사 선택 후 1단계(인적사항) 진입 시 직관적인 대상자 설정 위저드 자동 실행
 *    - Q1. 피보험자와 계약자(또는 수익자)가 같나요? [동일함] vs [다름]
 *    - Q2. 위라클랩 등록 고객인가요? [피보험자 고객 찾기] / [계약자 고객 찾기]
 * 2. 원스톱 단일 주입 (Clean Staging) 원칙:
 *    - 팝업 안에서 최종 확인 후 [청구서 작성 시작]을 누를 때 정확히 1회 원자적 주입
 *    - 폼 내부에서 데이터가 임시로 채워졌다 덮어써지며 생기는 데이터 찌꺼기/겹침 오류 100% 원천 차단
 *    - '다릅니다' 선택 시 손보 'diffInsuredCont' 자동 활성화 및 폼 펼침, 생보 'sameAsBene' 자동 해제
 * 3. 5대 청구 파트 (질병상해, 펫보험, 생명보험, 배상책임, 재물보험) 공통 호환
 * 4. 4단계 코비 수평 스텝퍼 바(updateStepperBar) 무한루프 방지 및 가로 그리드 정렬 100% 보존
 *    - step_dyn_flow 활성화 시에만 표시 (회사 선택 step2 등에서는 100% 숨김)
 * ==============================================================================
 */

(function () {
  'use strict';

  // 전역 상태 관리
  window.crmPickerState = {
    customers: [],
    searchKeyword: '',
    currentView: 'setup', // 'setup' (메인 설정 카드) or 'search' (고객 검색 리스트)
    selectingRole: 'insured', // 'insured' or 'contractor'

    // Q1: 피보험자 != 계약자/수익자 여부 (false = 동일함, true = 다름)
    isDifferent: false,

    // Q2: Person A - 피보험자 (치료받은 분)
    insuredCustomer: null,
    insuredData: null,

    // Q2: Person B - 계약자 / 수익자 (보험금 수령자 - isDifferent가 true일 때)
    contractorCustomer: null,
    contractorData: null,

    receiptType: 'auto', // 'auto' or 'bank'
    selectedPetIndex: 0
  };

  // 1회 자동 팝업 플래그
  window._crmPickerOpenedOnce = false;

  // 1. 데이터 수신 및 로컬 캐시 동기화
  
  // [직접 구글 시트 연동] CRM 화면을 거치지 않아도 토큰/시트ID가 있으면 '보험관리' 탭 실시간 직접 조회
  async function syncFromGoogleSheetsDirect() {
    try {
      const token = (function() {
        try {
          return localStorage.getItem('g_access_token') || sessionStorage.getItem('g_access_token');
        } catch(e) { return null; }
      })();
      const sheetId = (function() {
        try {
          return localStorage.getItem('g_sheet_id') || sessionStorage.getItem('g_sheet_id');
        } catch(e) { return null; }
      })();

      if (!token || !sheetId) return;

      console.log('[CRM Picker] 구글 시트 직접 동기화 시작 (토큰/시트ID 확인됨)');

      // 1. 보험관리 탭 직접 조회
      const insUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/' + encodeURIComponent("'보험관리'") + '?valueRenderOption=FORMATTED_VALUE';
      const insResp = await fetch(insUrl, { headers: { Authorization: 'Bearer ' + token } });
      if (insResp.ok) {
        const insJson = await insResp.json();
        const rows = insJson.values || [];
        if (rows.length > 1) {
          const headers = rows[0].map(h => String(h || '').trim());
          const parsedIns = rows.slice(1).map(r => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
            return obj;
          });
          window.crmPickerState.insuranceRows = parsedIns;
          try { localStorage.setItem('weracle_crm_insurance_cache', JSON.stringify(parsedIns)); } catch(e) {}
          console.log('[CRM Picker] 보험관리 직접 조회 성공:', parsedIns.length, '건');
        }
      }

      // 2. 고객 목록이 비어있으면 weraclecrm 직접 조회
      if (!window.crmPickerState.customers || window.crmPickerState.customers.length === 0) {
        const custUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/' + encodeURIComponent("'weraclecrm'") + '?valueRenderOption=FORMATTED_VALUE';
        const custResp = await fetch(custUrl, { headers: { Authorization: 'Bearer ' + token } });
        if (custResp.ok) {
          const custJson = await custResp.json();
          const rows = custJson.values || [];
          if (rows.length > 1) {
            const headers = rows[0].map(h => String(h || '').trim());
            const parsedCust = rows.slice(1).map((r, idx) => {
              const obj = { rowNumber: idx + 2 };
              headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
              return obj;
            });
            window.crmPickerState.customers = parsedCust;
            window.claimCustomerData = parsedCust;
            try { localStorage.setItem('weracle_crm_customers_cache', JSON.stringify(parsedCust)); } catch(e) {}
            console.log('[CRM Picker] 고객목록 직접 조회 성공:', parsedCust.length, '건');
          }
        }
      }

      // UI 즉시 재렌더링
      if (typeof isModalOpen === 'function' && isModalOpen()) {
        if (window.crmPickerState.currentView === 'search') {
          renderCustomerList();
        } else {
          // 현재 선택된 고객 데이터 최신화
          if (window.crmPickerState.insuredCustomer) {
            window.crmPickerState.insuredData = sanitizeCustomer(window.crmPickerState.insuredCustomer);
          }
          if (window.crmPickerState.contractorCustomer) {
            window.crmPickerState.contractorData = sanitizeCustomer(window.crmPickerState.contractorCustomer);
          }
          renderSetupView();
        }
      }
    } catch (e) {
      console.warn('[CRM Picker] 구글 시트 직접 동기화 오류 (정상 폴백 진행):', e);
    }
  }

  function initDataSync() {
    setTimeout(syncFromGoogleSheetsDirect, 100);
    try {
      const cached = localStorage.getItem('weracle_crm_customers_cache')
                  || localStorage.getItem('demo_crm_data')
                  || localStorage.getItem('weracle_crm_cached_data');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          window.crmPickerState.customers = parsed;
        try {
          const insCached = localStorage.getItem('weracle_crm_insurance_cache');
          if (insCached) {
            const parsedIns = JSON.parse(insCached);
            if (Array.isArray(parsedIns) && parsedIns.length > 0) {
              window.crmPickerState.insuranceRows = parsedIns;
            }
          }
        } catch(e) {}
          if (!window.claimCustomerData || window.claimCustomerData.length === 0) {
            window.claimCustomerData = parsed;
          }
        }
      }
    } catch (e) {
      console.warn('[CRM Picker] 캐시 로드 실패:', e);
    }

    // 부모 창(index.html / crm)에 최신 고객 데이터 동기화 요청
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'requestSyncData' }, '*');
    }
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'requestSyncData' }, '*');
    }

    // 부모 창이나 opener의 전역 고객 변수 직접 참조 (초고속 즉시 동기화)
    try {
      const parentData = (window.parent && window.parent.globalCustomerData)
                      || (window.opener && window.opener.globalCustomerData)
                      || window.claimCustomerData;
      if (Array.isArray(parentData) && parentData.length > 0 && (!window.crmPickerState.customers || window.crmPickerState.customers.length === 0)) {
        window.crmPickerState.customers = parentData;
        window.claimCustomerData = parentData;
      }
    } catch (e) {}

    // 메시지 수신 대기
    window.addEventListener('message', function (event) {
      if (!event.data) return;
      if (event.data.type === 'syncData' || event.data.type === 'syncCrmData' || event.data.type === 'crmData' || event.data.type === 'CUSTOMER_DATA_SYNC') {
        const data = event.data.data || event.data.customers;
        if (Array.isArray(data) && data.length > 0) {
          window.crmPickerState.customers = data;
          window.claimCustomerData = data;
          try {
            localStorage.setItem('weracle_crm_customers_cache', JSON.stringify(data));
          } catch (e) {}
          if (isModalOpen() && window.crmPickerState.currentView === 'search') {
            renderCustomerList();
          }
        }
      }
    });
  }

  // 2. 은행 및 금융 사전
  const BANK_DICTIONARY = [
    { match: /국민|kb/i, name: '국민은행' },
    { match: /신한/i, name: '신한은행' },
    { match: /우리/i, name: '우리은행' },
    { match: /하나|keb/i, name: '하나은행' },
    { match: /농협|nh/i, name: '농협은행' },
    { match: /기업|ibk/i, name: '기업은행' },
    { match: /카카오/i, name: '카카오뱅크' },
    { match: /토스/i, name: '토스뱅크' },
    { match: /케이뱅크|k뱅크/i, name: '케이뱅크' },
    { match: /새마을/i, name: '새마을금고' },
    { match: /신협/i, name: '신협' },
    { match: /우체국/i, name: '우체국' },
    { match: /sc제일|제일/i, name: 'SC제일은행' },
    { match: /씨티|시티/i, name: '씨티은행' },
    { match: /수협/i, name: '수협은행' },
    { match: /대구|iM뱅크/i, name: '대구은행' },
    { match: /부산/i, name: '부산은행' },
    { match: /광주/i, name: '광주은행' },
    { match: /제주/i, name: '제주은행' },
    { match: /전북/i, name: '전북은행' },
    { match: /경남/i, name: '경남은행' },
    { match: /산업|kdb/i, name: 'KDB산업은행' }
  ];

  // 카드 결제 여부 엄격 판정기 (보험금 청구는 카드 수령 원천 불가)
  function isCardPayment(text) {
    if (!text) return false;
    const s = String(text);
    return /카드|신용|체크|card|credit|check/i.test(s);
  }

  // 은행명 정규화 추출기 (카드 결제 원천 배제)
  function resolveBankName(text) {
    if (!text || typeof text !== 'string') return '';
    const s = text.trim();
    if (!s || isCardPayment(s)) return '';
    for (const b of BANK_DICTIONARY) {
      if (b.match.test(s)) return b.name;
    }
    return '';
  }

  // 예금주명 유효성 엄격 검증기 (보험 상품명/특약/금융기관명 원천 배제)
  function isValidOwnerName(name) {
    if (!name || typeof name !== 'string') return false;
    const s = name.trim();
    if (!s || s.length < 2 || s.length > 25) return false;
    // 명백한 보험 상품명 패턴 배제 (예: "퍼펙트플러스 종합보장보험", "무배당 OO실손보험")
    if (s.endsWith('보험') || /종합보험|보장보험|실손보험|암보험|운전자보험|치아보험|화재보험|해상보험|생명보험/.test(s)) return false;
    if (/플러스|다이렉트|무배당|유배당|세이프|마이라이프|굿앤굿/.test(s)) return false;
    if (s.length > 4 && /보험|보장|특약|배상|치료비|진단비/.test(s)) return false;
    // 금융기관명 배제
    if (/은행|카드|뱅크|증권|금고|신협|새마을|캐피탈|페이|계좌|자동이체/i.test(s)) return false;
    return true;
  }

  // 날짜 형식 여부 정밀 판정기 (계좌번호 오인식 방지)
  function isDateString(str) {
    if (!str) return false;
    const s = String(str).trim();
    // YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD
    if (/^(?:19|20)\d{2}[-./](?:0?[1-9]|1[0-2])[-./](?:0?[1-9]|[12]\d|3[01])$/.test(s)) return true;
    // YY-MM-DD
    if (/^\d{2}[-./](?:0?[1-9]|1[0-2])[-./](?:0?[1-9]|[12]\d|3[01])$/.test(s)) return true;
    // YYYYMMDD
    const digits = s.replace(/[^0-9]/g, '');
    if (digits.length === 8 && /^(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/.test(digits)) return true;
    return false;
  }

  // 텍스트 내에서 계좌번호 패턴 정밀 추출 (주민번호, 전화번호, 연도/날짜, 카드번호 배제)
  function extractAccountNumber(text, excludeRrn, excludePhone) {
    if (!text || typeof text !== 'string') return '';
    if (isCardPayment(text)) return ''; // 카드 번호는 원천 배제
    const cleanExcludeRrn = (excludeRrn || '').replace(/[^0-9]/g, '');
    const cleanExcludePhone = (excludePhone || '').replace(/[^0-9]/g, '');

    // 1) 하이픈 포함 계좌 패턴 (예: 123-456-789012 또는 1234-5678-9012)
    const hyphenMatches = text.match(/\b\d{2,6}-\d{2,6}-\d{2,8}(?:-\d{1,5})?\b/g);
    if (hyphenMatches) {
      for (const m of hyphenMatches) {
        if (isDateString(m)) continue; // 날짜(YYYY-MM-DD) 절대 제외!
        const digits = m.replace(/[^0-9]/g, '');
        if (digits.length >= 8 && digits.length <= 18) {
          if (cleanExcludePhone && digits === cleanExcludePhone) continue;
          if (cleanExcludeRrn && digits === cleanExcludeRrn) continue;
          if (digits.startsWith('010') || digits.startsWith('011')) continue;
          return m.trim();
        }
      }
    }

    // 2) 8~18자리 연속 숫자 패턴
    const digitMatches = text.match(/\b\d{8,18}\b/g);
    if (digitMatches) {
      for (const d of digitMatches) {
        if (isDateString(d)) continue; // 날짜(YYYYMMDD) 절대 제외!
        if (cleanExcludePhone && d === cleanExcludePhone) continue;
        if (cleanExcludeRrn && d === cleanExcludeRrn) continue;
        if (d.startsWith('010') || d.startsWith('011')) continue;
        return d.trim();
      }
    }

    return '';
  }

  // 계좌번호 숫자 정규화
  function normalizeAccDigits(acc) {
    return String(acc || '').replace(/[^0-9]/g, '');
  }

  // 단일 계좌 후보 정밀 파싱 함수
  function parseAccountCandidate(rawBank, rawAcc, rawOwner, compName, rawRrn, rawPhone, defaultOwner) {
    if (isCardPayment(rawBank) || isCardPayment(rawAcc) || isCardPayment(rawOwner)) return null;

    let bName = resolveBankName(rawBank) || '';
    let bAcc = '';
    let bOwner = isValidOwnerName(rawOwner) ? String(rawOwner).trim() : '';

    if (rawAcc) {
      if (typeof rawAcc === 'string' && rawAcc.includes('/')) {
        const parts = rawAcc.split('/');
        if (!bName) bName = resolveBankName(parts[0]) || '';
        bAcc = extractAccountNumber(parts[1] || parts[0], rawRrn, rawPhone);
        if (!bOwner && parts[2] && isValidOwnerName(parts[2])) {
          bOwner = parts[2].trim();
        }
      } else {
        bAcc = extractAccountNumber(String(rawAcc), rawRrn, rawPhone);
      }
    }

    if (!bName && typeof rawBank === 'string') {
      bName = resolveBankName(rawBank);
    }

    if (!bAcc && typeof rawBank === 'string') {
      bAcc = extractAccountNumber(rawBank, rawRrn, rawPhone);
    }

    if (bName && bAcc && !isDateString(bAcc)) {
      return {
        bankName: bName,
        bankAccount: bAcc,
        bankOwner: bOwner || defaultOwner || '',
        company: compName ? String(compName).trim() : ''
      };
    }
    return null;
  }

  // 중복 계좌 병합 및 고유 계좌 리스트 적재 헬퍼
  function addUniqueAccount(accList, cand) {
    if (!cand || !cand.bankName || !cand.bankAccount) return;
    if (isCardPayment(cand.bankName) || isCardPayment(cand.bankAccount)) return;

    const cleanAcc = normalizeAccDigits(cand.bankAccount);
    if (cleanAcc.length < 8) return;

    const existing = accList.find(a => {
      const aClean = normalizeAccDigits(a.bankAccount);
      return a.bankName === cand.bankName && aClean === cleanAcc;
    });

    if (existing) {
      if (cand.company && !existing.companies.includes(cand.company)) {
        existing.companies.push(cand.company);
        existing.company = existing.companies.join(', ');
      }
      if (!existing.bankOwner && cand.bankOwner) {
        existing.bankOwner = cand.bankOwner;
      }
    } else {
      accList.push({
        bankName: cand.bankName,
        bankAccount: cand.bankAccount,
        bankOwner: cand.bankOwner || '',
        company: cand.company || '',
        companies: cand.company ? [cand.company] : []
      });
    }
  }

  // 데모/샘플 고객 계좌 매핑 (CRM 데모 데이터 즉시 호환 - 다중 계좌 시뮬레이션 포함)
  const DEMO_SAMPLE_ACCOUNTS = {
    '김민수': [
      { bank: '국민은행', account: '110-293-847201', company: '메리츠화재' },
      { bank: '신한은행', account: '110-482-918237', company: '삼성화재' }
    ],
    '이영희': { bank: '국민은행', account: '042-24-0192831', company: 'KB손해보험' },
    '박철수': { bank: '기업은행', account: '010-5555-8888-01', company: 'DB손해보험' },
    '정우성': { bank: '신한은행', account: '110-482-918237', company: '현대해상' },
    '한지민': { bank: '카카오뱅크', account: '3333-01-8492018', company: '한화손해보험' },
    '강동원': { bank: '국민은행', account: '1002-841-928172', company: '메리츠화재' },
    '송혜교': { bank: '신한은행', account: '110-918-283746', company: '삼성화재' },
    '유재석': { bank: '신한은행', account: '110-384-918237', company: '흥국화재' },
    '신민아': { bank: '우리은행', account: '1002-841-928172', company: 'KB손해보험' },
    '조인성': { bank: '하나은행', account: '123-819203-91827', company: '롯데손해보험' },
    '배수지': { bank: '하나은행', account: '584-910283-91820', company: 'DB손해보험' },
    '윤여정': { bank: '농협은행', account: '302-0192-8472-11', company: '농협손해보험' },
    '이병헌': { bank: '국민은행', account: '042-12-8472019', company: '현대해상' },
    '김태리': { bank: '신한은행', account: '110-847-291823', company: '메리츠화재' },
    '최수진': { bank: '하나은행', account: '123-910293-84707', company: '삼성화재' }
  };

  // 2. 고객 데이터 정제기 (CRM 한글/영문 모든 키 100% 호환)
  function sanitizeCustomer(client) {
    if (!client) return null;

    // 만약 배열 형태로 넘어왔을 경우 (Google Sheets raw 2D row)
    if (Array.isArray(client)) {
      const colName = String(client[1] || client[0] || '').trim();
      if (!colName || colName === '고객명' || colName === '이름' || colName === '성명') return null;
      const colPhone = String(client[8] || client[11] || client[2] || '').trim();
      const colRrn = String(client[3] || client[6] || '').trim();
      const colAddr = String(client[11] || client[13] || '').trim();
      if (!colName && !colPhone && !colRrn) return null;

      const cleanRrn = colRrn.replace(/[^0-9]/g, '');
      const cleanPhone = colPhone.replace(/[^0-9]/g, '');

      const accounts = [];
      for (const cell of client) {
        if (!cell) continue;
        const s = String(cell).trim();
        if (!s || isCardPayment(s)) continue;
        const cand = parseAccountCandidate(s, s, '', '', cleanRrn, cleanPhone, colName);
        if (cand) addUniqueAccount(accounts, cand);
      }

      if (accounts.length === 0 && DEMO_SAMPLE_ACCOUNTS[colName]) {
        const demo = DEMO_SAMPLE_ACCOUNTS[colName];
        if (Array.isArray(demo)) {
          demo.forEach(d => addUniqueAccount(accounts, { bankName: resolveBankName(d.bank) || d.bank, bankAccount: d.account, bankOwner: colName, company: d.company || '' }));
        } else if (demo && demo.bank) {
          addUniqueAccount(accounts, { bankName: resolveBankName(demo.bank) || demo.bank, bankAccount: demo.account, bankOwner: colName, company: demo.company || '' });
        }
      }

      let selectedIdx = 0;
      const selectEl = typeof document !== 'undefined' ? document.getElementById('companySelect') : null;
      const activeComp = (selectEl && selectEl.value) ? selectEl.value.trim() : '';
      if (activeComp && accounts.length > 0) {
        const compNorm = activeComp.replace(/\s+/g, '').toLowerCase();
        const matchIdx = accounts.findIndex(a => {
          if (!a.company) return false;
          const cNorm = a.company.replace(/\s+/g, '').toLowerCase();
          return cNorm.includes(compNorm) || compNorm.includes(cNorm);
        });
        if (matchIdx !== -1) selectedIdx = matchIdx;
      }

      let arrBankName = '';
      let arrAccount = '';
      let arrOwner = isValidOwnerName(colName) ? colName : '';
      if (accounts.length > 0) {
        const selAcc = accounts[selectedIdx] || accounts[0];
        arrBankName = selAcc.bankName;
        arrAccount = selAcc.bankAccount;
        arrOwner = selAcc.bankOwner || arrOwner;
      }

      return {
        raw: client,
        name: colName,
        phone: cleanPhone,
        formattedPhone: formatPhoneDisplay(cleanPhone),
        rrn: cleanRrn,
        rrnFront: cleanRrn.length >= 6 ? cleanRrn.substring(0, 6) : '',
        rrnBack: cleanRrn.length >= 7 ? cleanRrn.substring(6) : '',
        address: colAddr,
        accounts: accounts,
        selectedAccountIndex: selectedIdx,
        bankName: arrBankName,
        bankAccount: arrAccount,
        bankOwner: arrOwner,
        pets: []
      };
    }

    // 객체 형태: 키 앞뒤 공백 및 대소문자 무관 안전 추출 헬퍼
    const getVal = (possibleKeys) => {
      for (const k of possibleKeys) {
        if (client[k] !== undefined && client[k] !== null) {
          const val = String(client[k]).trim();
          if (val) return val;
        }
      }
      const objKeys = Object.keys(client);
      for (const k of possibleKeys) {
        const normTarget = k.replace(/\s+/g, '').toLowerCase();
        const found = objKeys.find(ok => ok.replace(/\s+/g, '').toLowerCase() === normTarget);
        if (found && client[found] !== undefined && client[found] !== null) {
          const val = String(client[found]).trim();
          if (val) return val;
        }
      }
      return '';
    };

    // 1. 이름
    const rawName = getVal(['고객명', '이름', '성명', '피보험자', '피보험자명', '대표자명', '상호명', 'name', 'client_name', 'customerName']);
    if (!rawName || rawName === '고객명' || rawName === '이름' || rawName === '성명') return null;

    // 2. 전화번호
    const rawPhone = getVal(['폰번호', '휴대폰', '전화번호', '핸드폰', '연락처', '휴대전화', 'phone', 'mobile', 'client_phone']);

    // 3. 주민번호 / 생년월일
    const rawRrn = getVal(['주민번호', '주민등록번호', '생년월일', '주민', '사업자번호', 'rrn', 'jumin', 'client_jumin', 'idNum']);

    // 빈 행 필터링
    if (!rawName && !rawPhone && !rawRrn) return null;

    // 4. 주소
    const rawAddress = getVal(['주소', '자택주소', '거주지', '사업장주소', '상세주소', '소재지', 'address', 'addr', 'client_address']);

    const cleanRrn = String(rawRrn).replace(/[^0-9]/g, '');
    let rrnFront = '', rrnBack = '';
    if (cleanRrn.length === 13) {
      rrnFront = cleanRrn.substring(0, 6);
      rrnBack = cleanRrn.substring(6, 13);
    } else if (String(rawRrn).includes('-')) {
      const parts = String(rawRrn).split('-');
      rrnFront = (parts[0] || '').replace(/[^0-9]/g, '');
      rrnBack = (parts[1] || '').replace(/[^0-9]/g, '');
    } else if (cleanRrn.length >= 6) {
      rrnFront = cleanRrn.substring(0, 6);
      rrnBack = cleanRrn.substring(6);
    }

    let cleanPhone = String(rawPhone).replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10 && cleanPhone.startsWith('10')) cleanPhone = '0' + cleanPhone;
    if (cleanPhone.length === 8) cleanPhone = '010' + cleanPhone;

    // E. 계약 리스트 (보험가입리스트, 보험목록 등) 모든 후보 합산 순회 (단락평가 방지)
    const contractListCandidates = [
      client['보험가입리스트'],
      client['보험목록'],
      client['보험리스트'],
      client['insuranceList'],
      client['insList']
    ];

    let allContracts = [];
    const _cid = String(client['고객번호'] || '').trim();
    const _cname = String(rawName || client['고객명'] || client['이름'] || '').trim();
    const _crrn = String(rawRrn || client['주민번호'] || '').replace(/[^0-9]/g, '');

    const insCache = (window.crmPickerState && window.crmPickerState.insuranceRows && window.crmPickerState.insuranceRows.length > 0) ? window.crmPickerState.insuranceRows : (function() { try { return JSON.parse(localStorage.getItem('weracle_crm_insurance_cache') || '[]'); } catch(e) { return []; } })();
    if (insCache.length > 0) {
      for (const item of insCache) {
        if (!item || typeof item !== 'object') continue;
        const iCid = String(item['고객번호'] || '').trim();
        const iName = String(item['고객명'] || '').trim();
        const iInsur = String(item['피보험자'] || '').trim();
        const iCont = String(item['계약자'] || '').trim();
        const iRrn = String(item['주민번호'] || '').replace(/[^0-9]/g, '');

        let isMatch = false;
        if (_cid && iCid && _cid === iCid) isMatch = true;
        else if (_crrn.length >= 6 && iRrn.length >= 6 && _crrn === iRrn) isMatch = true;
        else if (_cname && (iName === _cname || iInsur === _cname || iCont === _cname)) isMatch = true;

        if (isMatch) {
          allContracts.push(item);
        }
      }
    }
    for (const cand of contractListCandidates) {
      if (Array.isArray(cand) && cand.length > 0) {
        allContracts.push(...cand);
      } else if (typeof cand === 'string' && cand.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(cand);
          if (Array.isArray(parsed) && parsed.length > 0) allContracts.push(...parsed);
        } catch (e) {}
      }
    }

    // 5. [지능형 다중 계좌 수집기] 카드 결제 배제 및 다중 은행 계좌 전수 수집
    const accounts = [];

    // A. 명시적 은행/계좌/예금주 직접 필드 탐색
    const directBankKeys = [
      '은행명', '은행', '환급은행', '이체은행', '결제은행', '차_은행명', 'bank_name', 'bankName',
      'bank', 'bank_nm', '환급은행명', '수령은행', '수령은행명'
    ];
    const directAccKeys = [
      '계좌번호', '계좌', '환급계좌', '이체계좌', '결제계좌', '차_계좌번호', 'account_number', 'accountNumber',
      'bankAccount', 'account', '환급계좌번호', '수령계좌', '수령계좌번호', '납입계좌'
    ];
    const directOwnerKeys = ['예금주', '예금주명', '계좌예금주', '환급예금주', 'bankOwner', 'accountHolder', '수령예금주'];

    let dirBank = '', dirAcc = '', dirOwner = '';
    for (const bk of directBankKeys) {
      const v = getVal([bk]);
      if (v) { dirBank = v; break; }
    }
    for (const ak of directAccKeys) {
      const v = getVal([ak]);
      if (v) { dirAcc = v; break; }
    }
    for (const ok of directOwnerKeys) {
      const v = getVal([ok]);
      if (v && isValidOwnerName(v)) { dirOwner = v; break; }
    }

    if (dirBank || dirAcc) {
      const directCand = parseAccountCandidate(dirBank, dirAcc, dirOwner, '', cleanRrn, cleanPhone, rawName);
      if (directCand) addUniqueAccount(accounts, directCand);
    }

    // B. 고객 텍스트 결제 필드 스캔 (단일 문자열 내 은행/계좌/예금주 파싱)
    const scanTextFields = [
      '결제정보', '차_결제정보', '결제방식', '결제내역', 'payInfo', 'pay_info',
      '특이사항', '상세업무', '상담메모', '메모'
    ];
    for (const tf of scanTextFields) {
      const v = getVal([tf]);
      if (v && !isCardPayment(v)) {
        const cand = parseAccountCandidate(v, v, '', '', cleanRrn, cleanPhone, rawName);
        if (cand) addUniqueAccount(accounts, cand);
      }
    }

    // C. 순번별 계약 필드 전수 스캔 (보험1_ ~ 보험20_)
    for (let i = 1; i <= 20; i++) {
      const prefix = '보험' + i;
      const comp = getVal([prefix + '_보험사', prefix + '_회사명', prefix + '_보험회사', prefix + '_상품명']);
      const bBank = getVal([prefix + '_은행명', prefix + '_은행', prefix + '_환급은행', prefix + '_이체은행']);
      const bAcc = getVal([prefix + '_계좌번호', prefix + '_계좌', prefix + '_환급계좌', prefix + '_이체계좌']);
      const bOwner = getVal([prefix + '_예금주', prefix + '_예금주명', prefix + '_환급예금주']);
      const bPay = getVal([prefix + '_결제정보', prefix + '_결제내역', prefix + '_가입내역']);

      if ((bBank || bAcc) && !isCardPayment(bBank) && !isCardPayment(bAcc)) {
        const cand = parseAccountCandidate(bBank, bAcc, bOwner, comp, cleanRrn, cleanPhone, rawName);
        if (cand) addUniqueAccount(accounts, cand);
      }
      if (bPay && !isCardPayment(bPay)) {
        const cand = parseAccountCandidate(bPay, bPay, bOwner, comp, cleanRrn, cleanPhone, rawName);
        if (cand) addUniqueAccount(accounts, cand);
      }
    }

    // D. 연결된 모든 계약 목록 (allContracts) 전수 스캔
    if (allContracts.length > 0) {
      for (const item of allContracts) {
        if (!item || typeof item !== 'object') continue;
        const comp = String(item['보험사'] || item['회사명'] || item['보험회사'] || item['원수사'] || item['company'] || '').trim();

        let iBank = '', iAcc = '', iOwner = '';
        for (const bk of ['은행명', '차_은행명', '환급은행', '이체은행', 'bank_name', 'bankName', 'bank']) {
          if (item[bk]) { iBank = String(item[bk]); break; }
        }
        for (const ak of ['계좌번호', '차_계좌번호', '환급계좌', '이체계좌', 'account_number', 'accountNumber', 'bankAccount']) {
          if (item[ak]) { iAcc = String(item[ak]); break; }
        }
        for (const ok of ['예금주', '예금주명', '계좌예금주', '환급예금주', 'bankOwner', 'accountHolder', '수령예금주']) {
          if (item[ok] && isValidOwnerName(item[ok])) { iOwner = String(item[ok]); break; }
        }

        if ((iBank || iAcc) && !isCardPayment(iBank) && !isCardPayment(iAcc)) {
          const cand = parseAccountCandidate(iBank, iAcc, iOwner, comp, cleanRrn, cleanPhone, rawName);
          if (cand) addUniqueAccount(accounts, cand);
        }

        for (const payKey of ['결제정보', '차_결제정보', 'payInfo', '결제방식', '특약내역', '상세업무']) {
          const v = item[payKey];
          if (v && typeof v === 'string' && !isCardPayment(v)) {
            const cand = parseAccountCandidate(v, v, iOwner, comp, cleanRrn, cleanPhone, rawName);
            if (cand) addUniqueAccount(accounts, cand);
          }
        }
      }
    }

    // E. 커스텀 동적 키 검색 (사용자가 추가한 '은행' 또는 '계좌' 열)
    for (const k of Object.keys(client)) {
      if (k.startsWith('보험') && /\d/.test(k)) continue; // 이미 처리됨
      if (/은행/i.test(k) || /계좌/i.test(k)) {
        const v = client[k];
        if (v && typeof v === 'string' && !isCardPayment(v)) {
          const cand = parseAccountCandidate(v, v, '', '', cleanRrn, cleanPhone, rawName);
          if (cand) addUniqueAccount(accounts, cand);
        }
      }
    }

    // F. 데모/샘플 데이터 폴백
    if (accounts.length === 0 && DEMO_SAMPLE_ACCOUNTS[rawName]) {
      const demo = DEMO_SAMPLE_ACCOUNTS[rawName];
      if (Array.isArray(demo)) {
        demo.forEach(d => addUniqueAccount(accounts, { bankName: resolveBankName(d.bank) || d.bank, bankAccount: d.account, bankOwner: rawName, company: d.company || '' }));
      } else if (demo && demo.bank) {
        addUniqueAccount(accounts, { bankName: resolveBankName(demo.bank) || demo.bank, bankAccount: demo.account, bankOwner: rawName, company: demo.company || '' });
      }
    }

    // G. 현재 선택된 보험사와 매칭되는 기본 계좌 탐색
    let selectedIdx = 0;
    const selectEl = typeof document !== 'undefined' ? document.getElementById('companySelect') : null;
    const activeComp = (selectEl && selectEl.value) ? selectEl.value.trim() : '';
    if (activeComp && accounts.length > 0) {
      const compNorm = activeComp.replace(/\s+/g, '').toLowerCase();
      const matchIdx = accounts.findIndex(a => {
        if (!a.company) return false;
        const cNorm = a.company.replace(/\s+/g, '').toLowerCase();
        return cNorm.includes(compNorm) || compNorm.includes(cNorm);
      });
      if (matchIdx !== -1) {
        selectedIdx = matchIdx;
      }
    }

    // H. 기본 계좌 세팅 (계좌가 없거나 카드결제만 있으면 완전히 빈 문자열로 둠)
    let finalBankName = '';
    let finalBankAccount = '';
    let finalBankOwner = '';

    if (accounts.length > 0) {
      const selAcc = accounts[selectedIdx] || accounts[0];
      finalBankName = selAcc.bankName;
      finalBankAccount = selAcc.bankAccount;
      finalBankOwner = selAcc.bankOwner || (isValidOwnerName(rawName) ? rawName : '');
    }

    // 6. 반려동물
    const petBreed = getVal(['반려동물', '품종', '견종', '묘종', 'pet_breed', 'petBreed']);
    const petName = getVal(['동물이름', '반려동물이름', '반려견이름', 'pet_name', 'petName']);
    let pets = [];
    if (Array.isArray(client.pets) && client.pets.length > 0) {
      pets = client.pets;
    } else if (petBreed || petName) {
      pets.push({
        name: petName,
        breed: petBreed,
        birth: getVal(['동물생일', '동물생년월일', 'pet_birth']),
        gender: getVal(['동물성별', 'pet_gender']),
        color: getVal(['동물모색', 'pet_color'])
      });
    }

    const firstContract = allContracts.length > 0 ? allContracts[0] : null;
    const contractContName = firstContract ? String(firstContract['계약자'] || '').trim() : '';

    return {
      raw: client,
      name: rawName,
      contractorName: contractContName,
      contracts: allContracts,
      phone: cleanPhone,
      formattedPhone: formatPhoneDisplay(cleanPhone),
      rrn: cleanRrn,
      rrnFront: rrnFront,
      rrnBack: rrnBack,
      address: rawAddress,
      accounts: accounts,
      selectedAccountIndex: selectedIdx,
      bankName: finalBankName,
      bankAccount: finalBankAccount,
      bankOwner: finalBankOwner,
      pets: pets
    };
  }

  function formatPhoneDisplay(num) {
    if (!num) return '';
    const clean = String(num).replace(/[^0-9]/g, '');
    if (clean.length === 11) return clean.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    if (clean.length === 10) return clean.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    return clean;
  }
  function ensureModalDom() {
    if (document.getElementById('crmPickerModalBackdrop')) return;

    const modalHtml = `
      <div id="crmPickerModalBackdrop" class="crm-modal-backdrop" onclick="handleBackdropClick(event)">
        <div class="crm-modal-card" onclick="event.stopPropagation()">
          
          <!-- 모달 헤더 -->
          <div class="crm-modal-header">
            <div class="crm-header-text">
              <h3 id="crmModalTitle">📋 보험금 청구 대상자 설정</h3>
              <p id="crmModalSubtitle">청구서 작성 전 대상자 관계 및 고객 정보를 설정합니다.</p>
            </div>
            <div class="crm-header-actions">
              <button type="button" class="btn-header-skip" onclick="skipToDirectWrite()" title="고객 정보 선택 없이 바로 청구서를 작성합니다">
                ✍️ 건너뛰고 수기작성
              </button>
              <button type="button" class="crm-modal-close" onclick="closeCrmPickerModal()" aria-label="닫기">✕</button>
            </div>
          </div>

          <!-- 메인 설정 위저드 뷰 (Setup View) -->
          <div id="crmSetupView" class="crm-view-container">
            <div id="crmSetupScroll" class="crm-modal-scroll">
              <!-- JS에서 동적 렌더링 -->
            </div>
            <div class="crm-modal-footer">
              <button type="button" class="btn-footer-apply" onclick="applyCustomerSetup()">
                ✨ 설정 완료 및 청구서 작성 시작
              </button>
            </div>
          </div>

          <!-- 고객 검색 뷰 (Search View) -->
          <div id="crmSearchView" class="crm-view-container" style="display: none;">
            <div class="crm-search-bar-wrap">
              <button type="button" class="btn-search-back" onclick="switchView('setup')">
                ‹ 이전
              </button>
              <div class="crm-search-input-box">
                <input type="text" id="crmSearchInput" placeholder="이름, 연락처(뒷자리), 주민번호 앞자리 검색..." autocomplete="off">
                <button type="button" id="crmSearchClear" class="crm-search-clear" onclick="clearSearchInput()" style="display: none;">✕</button>
              </div>
            </div>
            <div class="crm-search-role-guide" id="crmSearchRoleGuide">
              <!-- 피보험자 선택 모드 or 계약자 선택 모드 안내 문구 -->
            </div>
            <div id="crmCustomerList" class="crm-customer-list">
              <!-- 고객 카드 동적 렌더링 -->
            </div>
          </div>

        </div>
      </div>

      <!-- 성공 토스트 알림 -->
      <div id="crmSuccessToast" class="crm-success-toast">
        <span class="toast-icon">✨</span>
        <span id="crmToastMessage" class="toast-message">청구 대상자 설정이 완료되었습니다.</span>
      </div>
    `;

    const wrap = document.createElement('div');
    wrap.innerHTML = modalHtml;
    document.body.appendChild(wrap);

    // 검색 인풋 이벤트 리스너
    const searchInput = document.getElementById('crmSearchInput');
    const clearBtn = document.getElementById('crmSearchClear');
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        window.crmPickerState.searchKeyword = e.target.value.trim();
        if (clearBtn) {
          clearBtn.style.display = window.crmPickerState.searchKeyword ? 'flex' : 'none';
        }
        renderCustomerList();
      });
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          clearSearchInput();
        }
      });
    }
  }

  // 모달 열림 여부 확인
  function isModalOpen() {
    const backdrop = document.getElementById('crmPickerModalBackdrop');
    return backdrop && backdrop.classList.contains('active');
  }

  // 백드롭 클릭 핸들러
  window.handleBackdropClick = function (e) {
    if (e.target && e.target.id === 'crmPickerModalBackdrop') {
      closeCrmPickerModal();
    }
  };

  // 검색 인풋 초기화
  window.clearSearchInput = function () {
    const searchInput = document.getElementById('crmSearchInput');
    const clearBtn = document.getElementById('crmSearchClear');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    if (clearBtn) clearBtn.style.display = 'none';
    window.crmPickerState.searchKeyword = '';
    renderCustomerList();
  };

  // 뷰 전환 (setup vs search)
  window.switchView = function (viewName) {
    window.crmPickerState.currentView = viewName;
    const setupView = document.getElementById('crmSetupView');
    const searchView = document.getElementById('crmSearchView');
    const titleEl = document.getElementById('crmModalTitle');
    const subtitleEl = document.getElementById('crmModalSubtitle');

    if (viewName === 'setup') {
      if (setupView) setupView.style.display = 'flex';
      if (searchView) searchView.style.display = 'none';
      if (titleEl) titleEl.innerText = '📋 보험금 청구 대상자 설정';
      if (subtitleEl) subtitleEl.innerText = '청구서 작성 전 대상자 관계 및 고객 정보를 설정합니다.';
      renderSetupView();
    } else {
      if (setupView) setupView.style.display = 'none';
      if (searchView) searchView.style.display = 'flex';
      const roleText = window.crmPickerState.selectingRole === 'insured' ? '피보험자 (치료받은 분)' : '계약자 / 수익자 (보험금 수령자)';
      if (titleEl) titleEl.innerText = '🔍 ' + roleText + ' 고객 찾기';
      if (subtitleEl) subtitleEl.innerText = '위라클랩 CRM에 등록된 고객을 검색하여 선택해주세요.';

      const guideEl = document.getElementById('crmSearchRoleGuide');
      if (guideEl) {
        guideEl.innerHTML = '<strong>' + roleText + '</strong>로 지정할 고객을 선택해주세요.';
      }

      const searchInput = document.getElementById('crmSearchInput');
      if (searchInput) {
        searchInput.value = '';
        setTimeout(() => searchInput.focus(), 80);
      }
      window.crmPickerState.searchKeyword = '';
      renderCustomerList();
    }
  };

  // 모달 열기
  window.openCrmPickerModal = function () {
    syncFromGoogleSheetsDirect();
    ensureModalDom();
    injectCustomStyles();
    initDataSync();

    const backdrop = document.getElementById('crmPickerModalBackdrop');
    if (backdrop) {
      backdrop.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    switchView('setup');
  };

  // 모달 닫기
  window.closeCrmPickerModal = function () {
    const backdrop = document.getElementById('crmPickerModalBackdrop');
    if (backdrop) {
      backdrop.classList.remove('active');
      document.body.style.overflow = '';
    }
  };

  // 계좌 표시 및 선택 컴포넌트 렌더러
  function renderAccountSection(role, customer) {
    if (!customer) return '';
    const accList = customer.accounts || [];

    if (accList.length === 0) {
      return `
        <div class="crm-acc-empty-badge" style="margin-top: 6px; display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; color: #b45309; font-size: 12px; font-weight: 600;">
          <span>⚠️</span>
          <span>계좌 미등록 (청구서에서 직접 입력)</span>
        </div>
      `;
    }

    if (accList.length === 1) {
      const acc = accList[0];
      const compLabel = acc.company ? `<span style="font-size: 11px; color: #475569; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; margin-left: 6px; font-weight: 600;">${acc.company}</span>` : '';
      return `
        <div style="margin-top: 6px; color: #1e293b; font-size: 13px; font-weight: 600; display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
          <span>🏦 ${acc.bankName} ${acc.bankAccount}</span>
          <span style="font-size: 12px; color: #64748b; font-weight: 500;">(예금주: ${acc.bankOwner || customer.name})</span>
          ${compLabel}
        </div>
      `;
    }

    // 2개 이상의 계좌 보유 시 (드롭다운 선택기 노출)
    const selIdx = (typeof customer.selectedAccountIndex === 'number' && customer.selectedAccountIndex >= 0 && customer.selectedAccountIndex < accList.length)
      ? customer.selectedAccountIndex
      : 0;

    return `
      <div class="crm-multi-account-box" style="margin-top: 8px; padding: 10px 12px; background: #eff6ff; border: 1.5px solid #3b82f6; border-radius: 10px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
          <span style="font-size: 12px; font-weight: 800; color: #1e40af; display: flex; align-items: center; gap: 4px;">
            🏦 입금 계좌 선택 <span style="background: #2563eb; color: #fff; font-size: 11px; padding: 1px 6px; border-radius: 10px;">${accList.length}개 보유</span>
          </span>
          <span style="font-size: 11px; color: #2563eb; font-weight: 600;">
            ✓ 선택한 계좌로 자동 입력
          </span>
        </div>
        <select class="crm-account-select" onchange="selectCustomerAccount('${role}', this.value)" style="width: 100%; padding: 8px 10px; font-size: 13px; font-weight: 600; color: #0f172a; background: #ffffff; border: 1.5px solid #60a5fa; border-radius: 8px; cursor: pointer; outline: none; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
          ${accList.map((acc, aIdx) => {
            const isSel = aIdx === selIdx;
            const compTxt = acc.company ? ` (${acc.company})` : '';
            return `<option value="${aIdx}" ${isSel ? 'selected' : ''}>${acc.bankName} ${acc.bankAccount}${compTxt} [예금주: ${acc.bankOwner || customer.name}]</option>`;
          }).join('')}
        </select>
      </div>
    `;
  }

  // 계좌 수동 선택 핸들러
  window.selectCustomerAccount = function (role, idxStr) {
    const idx = parseInt(idxStr, 10);
    const target = role === 'insured' ? window.crmPickerState.insuredData : window.crmPickerState.contractorData;
    if (!target || !target.accounts || !target.accounts[idx]) return;

    target.selectedAccountIndex = idx;
    const selected = target.accounts[idx];
    target.bankName = selected.bankName;
    target.bankAccount = selected.bankAccount;
    target.bankOwner = selected.bankOwner || target.name;

    renderSetupView();
  };

  // ========================================================
  // [메인 뷰 1] 대상자 사전 설정 위저드 (Setup View)
  // ========================================================
  function renderSetupView() {
    const scrollEl = document.getElementById('crmSetupScroll');
    if (!scrollEl) return;

    const isDiff = window.crmPickerState.isDifferent;
    const insured = window.crmPickerState.insuredData;
    const contractor = window.crmPickerState.contractorData;

    // 현재 선택된 보험사 명칭 확인
    const select = document.getElementById('companySelect');
    const compName = select ? select.value : '';

    let html = '';

    // 상단 선택 보험사 배지
    if (compName) {
      html += `
        <div class="crm-company-badge-wrap">
          <span class="crm-comp-chip">선택 보험사: <strong>${compName}</strong></span>
        </div>
      `;
    }

    // ----------------------------------------------------
    // Q1. 피보험자와 계약자(또는 수익자)가 같나요?
    // ----------------------------------------------------
    html += `
      <div class="crm-wizard-card">
        <div class="crm-wizard-card-header">
          <div class="crm-q-badge">Q1</div>
          <div class="crm-q-title">
            <h4>피보험자와 계약자(또는 수익자)가 같나요?</h4>
            <p>환자(치료받은 분)와 보험계약자(돈 받는 분)의 일치 여부를 선택하세요.</p>
          </div>
        </div>

        <div class="crm-toggle-grid">
          <div class="crm-toggle-box ${!isDiff ? 'active' : ''}" onclick="setDiffMode(false)">
            <div class="crm-toggle-radio"></div>
            <div class="crm-toggle-content">
              <div class="crm-toggle-main">👤 예, 동일합니다</div>
              <div class="crm-toggle-sub">본인 청구 (치료받은 분 = 수령자)</div>
            </div>
          </div>
          <div class="crm-toggle-box ${isDiff ? 'active' : ''}" onclick="setDiffMode(true)">
            <div class="crm-toggle-radio"></div>
            <div class="crm-toggle-content">
              <div class="crm-toggle-main">👥 아니오, 다릅니다</div>
              <div class="crm-toggle-sub">가족 / 대리 청구 (자녀·부모 등)</div>
            </div>
          </div>
        </div>
      </div>
    `;

    // ----------------------------------------------------
    // Q2. 고객 정보 불러오기 (위라클랩 CRM)
    // ----------------------------------------------------
    html += `
      <div class="crm-wizard-card">
        <div class="crm-wizard-card-header">
          <div class="crm-q-badge">Q2</div>
          <div class="crm-q-title">
            <h4>고객 정보 불러오기</h4>
            <p>위라클랩에 등록된 고객을 검색하여 선택하거나 직접 입력하세요.</p>
          </div>
        </div>

        <!-- Person A: 피보험자 -->
        <div class="crm-person-slot">
          <div class="crm-slot-header">
            <span class="crm-slot-tag insured">치료받은 분 (피보험자)</span>
            <span class="crm-slot-hint">병원 진료 및 치료를 받으신 분</span>
          </div>
    `;

    if (insured) {
      html += `
        <div class="crm-selected-client-card">
          <div class="crm-client-avatar">👤</div>
          <div class="crm-client-meta">
            <div class="crm-client-title">
              <span class="crm-c-name">${insured.name}</span>
              <span class="crm-c-rrn">${insured.rrnFront ? insured.rrnFront + '-*******' : '주민번호 미등록'}</span>
            </div>
            <div class="crm-client-details">
              <span>📞 ${insured.phone || '연락처 없음'}</span>
              <span>🏠 ${insured.address || '주소 없음'}</span>
              ${renderAccountSection('insured', insured)}
            </div>
          </div>
          <div class="crm-client-actions">
            <button type="button" class="btn-card-change" onclick="startCustomerSearch('insured')">변경</button>
            <button type="button" class="btn-card-remove" onclick="removeCustomer('insured')" title="선택 해제">✕</button>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="crm-empty-slot-card">
          <div class="crm-empty-slot-info">
            <p class="crm-empty-text">아직 선택된 피보험자 고객이 없습니다.</p>
            <p class="crm-empty-sub">등록 고객을 찾거나, 청구서에서 직접 수기로 작성할 수 있습니다.</p>
          </div>
          <button type="button" class="btn-slot-search" onclick="startCustomerSearch('insured')">
            🔍 피보험자 고객 찾기
          </button>
        </div>
      `;
    }

    html += `</div>`; // End Person A

    // Person B: 계약자 / 수익자 (isDiff === true 일 때만 표시)
    if (isDiff) {
      html += `
        <div class="crm-person-slot contractor-slot">
          <div class="crm-slot-header">
            <span class="crm-slot-tag contractor">보험금 수령자 (계약자 / 수익자)</span>
            <span class="crm-slot-hint">보상 안내를 받고 보험금을 수령할 분</span>
          </div>
      `;

      if (contractor) {
        html += `
          <div class="crm-selected-client-card">
            <div class="crm-client-avatar contractor">👥</div>
            <div class="crm-client-meta">
              <div class="crm-client-title">
                <span class="crm-c-name">${contractor.name}</span>
                <span class="crm-c-rrn">${contractor.rrnFront ? contractor.rrnFront + '-*******' : '주민번호 미등록'}</span>
              </div>
              <div class="crm-client-details">
                <span>📞 ${contractor.phone || '연락처 없음'}</span>
                <span>🏠 ${contractor.address || '주소 없음'}</span>
                ${renderAccountSection('contractor', contractor)}
              </div>
            </div>
            <div class="crm-client-actions">
              <button type="button" class="btn-card-change" onclick="startCustomerSearch('contractor')">변경</button>
              <button type="button" class="btn-card-remove" onclick="removeCustomer('contractor')" title="선택 해제">✕</button>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="crm-empty-slot-card">
            <div class="crm-empty-slot-info">
              <p class="crm-empty-text">아직 선택된 계약자/수익자 고객이 없습니다.</p>
              <p class="crm-empty-sub">등록 고객을 찾거나, 청구서에서 직접 수기로 작성할 수 있습니다.</p>
            </div>
            <button type="button" class="btn-slot-search contractor" onclick="startCustomerSearch('contractor')">
              🔍 계약자/수익자 고객 찾기
            </button>
          </div>
        `;
      }

      html += `</div>`; // End Person B
    }

    html += `</div>`; // End Q2 card

    scrollEl.innerHTML = html;
  }

  // Q1 모드 변경 (동일 vs 다름)
  window.setDiffMode = function (isDiff) {
    window.crmPickerState.isDifferent = isDiff;
    renderSetupView();
  };

  // 고객 검색 시작
  window.startCustomerSearch = function (role) {
    window.crmPickerState.selectingRole = role;
    switchView('search');
  };

  // 고객 선택 해제
  window.removeCustomer = function (role) {
    if (role === 'insured') {
      window.crmPickerState.insuredCustomer = null;
      window.crmPickerState.insuredData = null;
    } else {
      window.crmPickerState.contractorCustomer = null;
      window.crmPickerState.contractorData = null;
    }
    renderSetupView();
  };

  // ========================================================
  // [메인 뷰 2] 고객 검색 목록 렌더러 (Search View)
  // ========================================================
  function renderCustomerList() {
    const listEl = document.getElementById('crmCustomerList');
    if (!listEl) return;

    let all = window.crmPickerState.customers || [];
    if (all.length === 0 && Array.isArray(window.claimCustomerData) && window.claimCustomerData.length > 0) {
      all = window.claimCustomerData;
      window.crmPickerState.customers = all;
    }

    // 유효한 고객만 정제 (빈 행/헤더행 완전 제외)
    const validCustomers = all.map(c => sanitizeCustomer(c)).filter(Boolean);

    const keyword = (window.crmPickerState.searchKeyword || '').toLowerCase().trim();

    let filtered = validCustomers;
    if (keyword) {
      filtered = validCustomers.filter(s => {
        const name = (s.name || '').toLowerCase();
        const phone = (s.phone || '').replace(/[^0-9]/g, '');
        const rrn = (s.rrn || '').replace(/[^0-9]/g, '');
        const addr = (s.address || '').toLowerCase();
        return name.includes(keyword) || phone.includes(keyword) || rrn.includes(keyword) || addr.includes(keyword);
      });
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="crm-empty-search-state" style="padding: 60px 20px; text-align: center; color: #94a3b8;">
          <div style="font-size: 38px; margin-bottom: 12px; opacity: 0.6;">🔍</div>
          <div style="font-size: 15.5px; font-weight: 700; color: #475569; margin-bottom: 6px;">등록된 고객이 없습니다.</div>
          <div style="font-size: 13px; color: #94a3b8;">검색어를 다시 확인하시거나, 우측 상단의 [건너뛰고 수기작성]을 이용해주세요.</div>
        </div>
      `;
      window._lastFilteredCustomers = [];
      return;
    }

    let html = '';
    filtered.forEach((sanitized, idx) => {
      const petCount = sanitized.pets ? sanitized.pets.length : 0;
      const petBadge = petCount > 0 ? `<span class="badge-pet">🐾 반려견 ${petCount}마리</span>` : '';
      const accCount = (sanitized.accounts && sanitized.accounts.length) || (sanitized.bankName ? 1 : 0);
      let bankBadge = '';
      if (accCount >= 2) {
        bankBadge = `<span class="badge-bank" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; font-weight:700;">🏦 계좌 ${accCount}개 보유</span>`;
      } else if (accCount === 1) {
        bankBadge = `<span class="badge-bank">🏦 ${sanitized.bankName}${sanitized.bankAccount ? ' ' + sanitized.bankAccount : ''}</span>`;
      } else {
        bankBadge = `<span class="badge-bank" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a;">⚠️ 계좌 미등록</span>`;
      }

      html += `
        <div class="crm-customer-card" onclick="selectCustomerFromList(${idx})">
          <div class="customer-avatar">${(sanitized.name || '고')[0]}</div>
          <div class="card-center">
            <div class="customer-main-line">
              <span class="customer-name">${sanitized.name}</span>
              <span class="customer-rrn">${sanitized.rrnFront ? sanitized.rrnFront + '-*******' : '생년월일 미등록'}</span>
              ${petBadge}
              ${bankBadge}
            </div>
            <div class="customer-sub-line">
              <span>📞 ${sanitized.phone || '연락처 없음'}</span>
              <span>🏠 ${sanitized.address || '주소 없음'}</span>
            </div>
          </div>
          <button type="button" class="btn-select-client">선택</button>
        </div>
      `;
    });

    window._lastFilteredCustomers = filtered;
    listEl.innerHTML = html;
  }

  // 고객 선택 핸들러
  window.selectCustomerFromList = function (idx) {
    const list = window._lastFilteredCustomers || [];
    const sanitized = list[idx];
    if (!sanitized) return;

    const role = window.crmPickerState.selectingRole;

    if (role === 'insured') {
      window.crmPickerState.insuredCustomer = sanitized.raw;
      window.crmPickerState.insuredData = sanitized;
    } else {
      window.crmPickerState.contractorCustomer = sanitized.raw;
      window.crmPickerState.contractorData = sanitized;
    }

    // 다시 메인 설정 위저드 뷰로 복귀
    switchView('setup');
  };

  window.applyCustomerSetup = function () {
    const isDiff = window.crmPickerState.isDifferent;
    const insured = window.crmPickerState.insuredData;
    const contractor = window.crmPickerState.contractorData;

    // 1. 손해보험 'diffInsuredCont' 체크박스 상태 제어
    const diffInsContEl = document.getElementById('diffInsuredCont');
    if (diffInsContEl) {
      diffInsContEl.checked = isDiff;
      if (typeof window.toggleContFields === 'function') {
        window.toggleContFields(isDiff);
      }
    }

    // 2. 생명보험 'sameAsBene' 라디오 상태 제어
    const beneSameRadios = document.querySelectorAll('input[name="sameAsBene"]');
    if (beneSameRadios.length > 0) {
      beneSameRadios.forEach(r => {
        if (isDiff && (r.value === 'no' || r.value === 'diff')) r.checked = true;
        if (!isDiff && (r.value === 'yes' || r.value === 'same')) r.checked = true;
      });
      if (typeof window.copyFields === 'function') {
        window.copyFields('ins', 'bene', !isDiff);
      }
    }

    // 3. 'sameAsCont' 라디오 상태 제어
    const contSameRadios = document.querySelectorAll('input[name="sameAsCont"]');
    if (contSameRadios.length > 0) {
      contSameRadios.forEach(r => {
        if (isDiff && (r.value === 'no' || r.value === 'diff')) r.checked = true;
        if (!isDiff && (r.value === 'yes' || r.value === 'same')) r.checked = true;
      });
      if (typeof window.copyFields === 'function') {
        window.copyFields('ins', 'cont', !isDiff);
      }
    }

    // 4. 피보험자(치료받은 분) 기본 인적사항 주입
    if (insured) {
      setFieldValue('insName', insured.name);
      setFieldValue('insRrn', insured.rrn);
      setFieldValue('insRrn_front', insured.rrnFront);
      setFieldValue('insRrn_back', insured.rrnBack);
      setFieldValue('insPhone', insured.phone);
      setFieldValue('insAddress', insured.address);
    }

    // 5. [핵심] 계좌 및 수령자 정보 주입 규칙 (동일함 vs 다름)
    if (isDiff) {
      // 👥 [다름 모드] - 수령자는 100% 무조건 계약자/수익자!
      const contName = (contractor ? contractor.name : '') || (insured ? insured.contractorName : '');
      const contPhone = contractor ? contractor.phone : '';
      const contRrn = contractor ? contractor.rrn : '';
      const contRrnFront = contractor ? contractor.rrnFront : '';
      const contRrnBack = contractor ? contractor.rrnBack : '';
      const contAddress = contractor ? contractor.address : '';

      // 계약자/수익자 필드 채우기
      if (contName) {
        setFieldValue('contName', contName);
        setFieldValue('beneName', contName);
        setFieldValue('guideName', contName);
      }
      if (contPhone) {
        setFieldValue('contPhone', contPhone);
        setFieldValue('benePhone', contPhone);
        setFieldValue('guidePhone', contPhone);
      }
      if (contRrn) {
        setFieldValue('contRrn', contRrn);
        setFieldValue('contRrn_front', contRrnFront);
        setFieldValue('contRrn_back', contRrnBack);
        setFieldValue('beneRrn', contRrn);
        setFieldValue('beneRrn_front', contRrnFront);
        setFieldValue('beneRrn_back', contRrnBack);
      }
      if (contAddress) {
        setFieldValue('contAddress', contAddress);
        setFieldValue('beneAddress', contAddress);
      }
      setFieldValue('guideRelation', '계약자');

      // 계좌 및 예금주: 계약자 계좌 우선, 없으면 계약에 등록된 은행/계좌 활용
      const finalBank = (contractor && contractor.bankName) || (insured && insured.bankName) || '';
      const finalAccount = (contractor && contractor.bankAccount) || (insured && insured.bankAccount) || '';
      const finalOwner = (contractor && contractor.name) ? contractor.name : (contName || '');

      setFieldValue('bankName', finalBank, true);
      setFieldValue('bankAccount', finalAccount, true);
      setFieldValue('bankOwner', finalBank ? finalOwner : '', true); // ★ 다를 때는 절대 피보험자 이름이 들어가지 않음!
      setFieldValue('bankOwnerRrn', contRrn);
      setFieldValue('bankOwnerRel', '계약자');

    } else if (insured) {
      // 👤 [동일함 모드] - 본인 수령
      setFieldValue('guideName', insured.name);
      setFieldValue('guidePhone', insured.phone);
      setFieldValue('guideRelation', '본인');

      const finalBank = insured.bankName || '';
      const finalAccount = insured.bankAccount || '';
      const finalOwner = insured.name || insured.bankOwner || '';

      setFieldValue('bankName', finalBank, true);
      setFieldValue('bankAccount', finalAccount, true);
      setFieldValue('bankOwner', finalBank ? finalOwner : '', true);
      setFieldValue('bankOwnerRrn', insured.rrn);
      setFieldValue('bankOwnerRel', '본인');
    }

    // 자동이체 수령 라디오버튼이 있는 경우 '아니오 (계좌 직접입력)'으로 명시적 선택하여 필드 노출 보장
    const autoNoRadio = document.querySelector('input[name="autoTransfer"][value="no"]');
    if (autoNoRadio) {
      autoNoRadio.checked = true;
      if (typeof window.toggleBankFields === 'function') {
        window.toggleBankFields(false);
      }
    }

    // 펫보험 정보 주입 (피보험자 기준)
    if (insured && Array.isArray(insured.pets) && insured.pets.length > 0) {
      const p = insured.pets[0];
      setFieldValue('petName', p.name);
      setFieldValue('petBreed', p.breed);
      setFieldValue('petBirth', p.birth);
      setFieldValue('petGender', p.gender);
      setFieldValue('petColor', p.color);
    }

    closeCrmPickerModal();

    // 1단계 슬라이드 이동 및 토스트 표시
    if (typeof window.showSlide === 'function') {
      window.showSlide(0);
    }
    showToast('✨ 청구 대상자 및 고객 정보가 반영되었습니다.');
  };

  // 계좌 정보 주입 헬퍼
  function injectBankData(target) {
    if (!target) return;
    const finalBank = target.bankName || '';
    const finalAccount = target.bankAccount || '';
    // 예금주: target.bankOwner가 유효하면 사용, 그렇지 않으면 target.name 사용 (상품명 완전 배제)
    const finalOwner = target.name || target.bankOwner || '';

    setFieldValue('bankName', finalBank, true);
    setFieldValue('bankAccount', finalAccount, true);
    setFieldValue('bankOwner', finalBank ? finalOwner : '', true);
    setFieldValue('bankOwnerRrn', target.rrn);

    // 관계 설정: 다름 모드이고 계약자 대상이면 '계약자', 동일 모드이거나 피보험자 대상이면 '본인'
    const isDiff = window.crmPickerState.isDifferent;
    const isContractor = isDiff && (target === window.crmPickerState.contractorData);
    setFieldValue('bankOwnerRel', isContractor ? '계약자' : '본인');

    // 자동이체 수령 라디오버튼이 있는 경우 '아니오 (계좌 직접입력)'으로 명시적 선택하여 필드 노출 보장
    const autoNoRadio = document.querySelector('input[name="autoTransfer"][value="no"]');
    if (autoNoRadio) {
      autoNoRadio.checked = true;
      if (typeof window.toggleBankFields === 'function') {
        window.toggleBankFields(false);
      }
    }
  }

  // 필드 값 안전 주입 (allowEmpty가 true이면 빈 문자열로 리셋 허용)
  function setFieldValue(fieldId, value, allowEmpty) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    if (value === undefined || value === null) return;
    if (value === '' && !allowEmpty) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 건너뛰고 직접 수기 작성
  window.skipToDirectWrite = function () {
    const isDiff = window.crmPickerState.isDifferent;
    const diffInsContEl = document.getElementById('diffInsuredCont');
    if (diffInsContEl) {
      diffInsContEl.checked = isDiff;
      if (typeof window.toggleContFields === 'function') {
        window.toggleContFields(isDiff);
      }
    }
    closeCrmPickerModal();
    if (typeof window.showSlide === 'function') {
      window.showSlide(0);
    }
    showToast('✍️ 직접 수기 입력 모드로 진행합니다.');
  };

  // 토스트 메시지
  function showToast(msg) {
    const toast = document.getElementById('crmSuccessToast');
    const msgEl = document.getElementById('crmToastMessage');
    if (!toast) return;
    if (msgEl) msgEl.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  // ========================================================
  // [Step 1 슬라이드 헤더 우측 메인 버튼 부착 (재진입 지원)]
  // ========================================================
  let isAttaching = false;
  function attachButtonsToForm() {
    if (isAttaching) return;
    isAttaching = true;

    try {
      const slide0 = document.getElementById('slide_0');
      if (slide0) {
        const titleEl = slide0.querySelector('.slide-title');
        if (titleEl && !titleEl.querySelector('#btnCrmPickerMain')) {
          titleEl.style.display = 'flex';
          titleEl.style.justifyContent = 'space-between';
          titleEl.style.alignItems = 'center';
          titleEl.style.flexWrap = 'wrap';
          titleEl.style.gap = '8px';

          const mainBtn = document.createElement('button');
          mainBtn.type = 'button';
          mainBtn.id = 'btnCrmPickerMain';
          mainBtn.className = 'btn-picker-main';
          mainBtn.innerHTML = '✨ 대상자 설정 / CRM 불러오기';
          mainBtn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            window.openCrmPickerModal();
          };
          titleEl.appendChild(mainBtn);
        }
      }

      // 첫 1단계 진입 시 자동 팝업 (단 1회)
      const dynStep = document.getElementById('step_dyn_flow');
      if (dynStep && dynStep.classList.contains('active') && !window._crmPickerOpenedOnce) {
        window._crmPickerOpenedOnce = true;
        setTimeout(() => {
          window.openCrmPickerModal();
        }, 150);
      }
    } finally {
      setTimeout(() => { isAttaching = false; }, 60);
    }
  }

  // ========================================================
  // [코비 스타일 수평 스텝퍼 바 (1단계~4단계) 100% 가로 그리드 보존]
  // ========================================================
  function updateStepperBar() {
    try {
      const dynFlow = document.getElementById('step_dyn_flow');
      let stepperWrap = document.getElementById('covyStepperBar');

      // 1. dynFlow가 없거나 active가 아니면(예: 회사 선택 step2 화면 등) 무조건 숨김!
      if (!dynFlow || !dynFlow.classList.contains('active')) {
        if (stepperWrap) {
          stepperWrap.style.display = 'none';
        }
        window._crmPickerOpenedOnce = false; // 회사 선택 화면으로 돌아왔으므로 다음 진입 시 재실행 허용
        return;
      }

      // 2. dynFlow 안에 슬라이드가 없으면 숨김
      const slides = Array.from(document.querySelectorAll('#slides-container .app-slide'));
      if (slides.length === 0) {
        if (stepperWrap) {
          stepperWrap.style.display = 'none';
        }
        return;
      }

      // 3. 스텝퍼 바 생성 및 위치 지정 (dynFlow 내부의 첫 번째 자식으로 삽입하여 step2 누출 100% 원천 차단)
      if (!stepperWrap) {
        stepperWrap = document.createElement('div');
        stepperWrap.id = 'covyStepperBar';
        stepperWrap.className = 'covy-style-stepper';
        dynFlow.insertBefore(stepperWrap, dynFlow.firstChild);
      } else {
        stepperWrap.className = 'covy-style-stepper';
        if (stepperWrap.parentNode !== dynFlow) {
          dynFlow.insertBefore(stepperWrap, dynFlow.firstChild);
        }
      }

      stepperWrap.style.display = '';

      let activeIdx = slides.findIndex(s => s.classList.contains('active'));
      if (activeIdx < 0) activeIdx = 0;

      let titles = [];
      slides.forEach((slide) => {
        let tEl = slide.querySelector('.slide-title');
        let text = tEl ? tEl.innerText.replace(/✨.*$/, '').trim() : '';
        if (text.includes('피보험자') || text.includes('인적사항')) text = '인적사항';
        else if (text.includes('사고')) text = '사고정보';
        else if (text.includes('계좌') || text.includes('서명')) text = '지급계좌·서명';
        else if (text.includes('서류')) text = '서류첨부';
        titles.push(text);
      });

      let html = '';
      titles.forEach((t, i) => {
        let stateClass = (i === activeIdx) ? 'active' : '';

        html += '<div class="stepper-tab-c ' + stateClass + '" onclick="if(typeof showSlide===\'function\') showSlide(' + i + ')">'
              + '  <div class="stepper-tab-content">'
              + '    <span class="stepper-mini-badge">' + (i + 1) + '</span>'
              + '    <span class="stepper-tab-label">' + t + '</span>'
              + '  </div>'
              + '  <div class="stepper-tab-line"></div>'
              + '</div>';
      });

      stepperWrap.innerHTML = html;
    } catch (e) {
      console.warn('[Covy Stepper] 업데이트 중 경고:', e);
    }
  }

  // ========================================================
  // [전용 스타일 주입 (모던 토글 & 슬롯 카드)]
  // ========================================================
  function injectCustomStyles() {
    if (document.getElementById('crmPickerCustomStyles')) return;

    const style = document.createElement('style');
    style.id = 'crmPickerCustomStyles';
    style.innerHTML = `
      /* 코비 스타일 수평 스텝퍼 바 가로 그리드 절대 보장 */
      #covyStepperBar, .covy-style-stepper {
        display: grid !important;
        grid-template-columns: repeat(auto-fit, minmax(0, 1fr)) !important;
        gap: 12px !important;
        background: #ffffff !important;
        border: 1.5px solid #e2e8f0 !important;
        border-radius: 18px !important;
        padding: 16px 20px 14px !important;
        margin-bottom: 26px !important;
        box-shadow: 0 4px 16px rgba(17, 63, 103, 0.04) !important;
      }

      .btn-picker-main {
        background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
        color: #ffffff;
        border: none;
        border-radius: 12px;
        padding: 8px 16px;
        font-size: 13.5px;
        font-weight: 750;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .btn-picker-main:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(2, 132, 199, 0.35);
        filter: brightness(1.05);
      }

      /* 모달 백드롭 및 카드 */
      .crm-modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(15, 23, 42, 0.72);
        backdrop-filter: blur(8px);
        display: none;
        align-items: flex-start !important;
        justify-content: center;
        z-index: 99999;
        padding: 30px 16px 60px !important;
        overflow-y: auto;
      }
      .crm-modal-backdrop.active {
        display: flex;
        animation: crmFadeIn 0.22s ease-out forwards;
      }
      @keyframes crmFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .crm-modal-card {
        background: #ffffff;
        width: 100%;
        max-width: 620px;
        border-radius: 20px;
        box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.28);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        margin: 0 auto !important;
        animation: crmSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @keyframes crmSlideUp {
        from { transform: translateY(20px) scale(0.98); opacity: 0; }
        to { transform: translateY(0) scale(1); opacity: 1; }
      }

      /* 모달 헤더 */
      .crm-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start !important;
        padding: 22px 24px 18px;
        border-bottom: 1px solid #f1f5f9;
        background: #ffffff;
      }
      .crm-header-text h3 {
        margin: 0 0 4px;
        font-size: 19px;
        font-weight: 800;
        color: #0f172a;
        letter-spacing: -0.4px;
      }
      .crm-header-text p {
        margin: 0;
        font-size: 13.5px;
        color: #64748b;
      }
      .crm-modal-close {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        color: #64748b;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 14px;
        font-weight: 700;
        transition: all 0.15s ease;
      }
      .crm-modal-close:hover {
        background: #fee2e2;
        color: #ef4444;
        border-color: #fca5a5;
      }

      /* 뷰 컨테이너 */
      .crm-view-container {
        display: flex;
        flex-direction: column;
        flex: 1;
        overflow: hidden;
      }

      /* 스크롤 영역 */
      .crm-modal-scroll {
        padding: 20px 24px;
        max-height: calc(85vh - 160px);
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      /* 상단 회사 배지 */
      .crm-company-badge-wrap {
        display: flex;
      }
      .crm-comp-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        color: #1d4ed8;
        font-size: 12.5px;
        padding: 4px 12px;
        border-radius: 12px;
        font-weight: 600;
      }

      /* 위저드 카드 */
      .crm-wizard-card {
        background: #f8fafc;
        border: 1.5px solid #e2e8f0;
        border-radius: 16px;
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .crm-wizard-card-header {
        display: flex;
        align-items: flex-start !important;
        gap: 12px;
      }
      .crm-q-badge {
        background: #0284c7;
        color: #ffffff;
        font-size: 12.5px;
        font-weight: 800;
        padding: 3px 8px;
        border-radius: 8px;
        margin-top: 1px;
      }
      .crm-q-title h4 {
        margin: 0 0 3px;
        font-size: 15.5px;
        font-weight: 750;
        color: #0f172a;
      }
      .crm-q-title p {
        margin: 0;
        font-size: 12.5px;
        color: #64748b;
      }

      /* Q1 대형 토글 박스 그리드 */
      .crm-toggle-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .crm-toggle-box {
        background: #ffffff;
        border: 2px solid #e2e8f0;
        border-radius: 14px;
        padding: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 12px;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .crm-toggle-box:hover {
        border-color: #93c5fd;
        background: #f0f9ff;
      }
      .crm-toggle-box.active {
        border-color: #0284c7;
        background: #f0f9ff;
        box-shadow: 0 4px 12px rgba(2, 132, 199, 0.12);
      }
      .crm-toggle-radio {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid #cbd5e1;
        background: #ffffff;
        flex-shrink: 0;
        position: relative;
        transition: all 0.2s ease;
      }
      .crm-toggle-box.active .crm-toggle-radio {
        border-color: #0284c7;
        background: #0284c7;
      }
      .crm-toggle-box.active .crm-toggle-radio::after {
        content: '';
        position: absolute;
        top: 4px;
        left: 4px;
        width: 8px;
        height: 8px;
        background: #ffffff;
        border-radius: 50%;
      }
      .crm-toggle-main {
        font-size: 14px;
        font-weight: 750;
        color: #0f172a;
        margin-bottom: 2px;
      }
      .crm-toggle-box.active .crm-toggle-main {
        color: #0369a1;
      }
      .crm-toggle-sub {
        font-size: 11.5px;
        color: #64748b;
      }

      /* 대상자 슬롯 */
      .crm-person-slot {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .crm-person-slot.contractor-slot {
        border-color: #fbcfe8;
        background: #fffdfd;
      }
      .crm-slot-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
      }
      .crm-slot-tag {
        font-size: 12px;
        font-weight: 750;
        padding: 3px 8px;
        border-radius: 6px;
      }
      .crm-slot-tag.insured {
        background: #e0f2fe;
        color: #0369a1;
      }
      .crm-slot-tag.contractor {
        background: #fce7f3;
        color: #be185d;
      }
      .crm-slot-hint {
        font-size: 11.5px;
        color: #94a3b8;
      }

      /* 빈 슬롯 카드 */
      .crm-empty-slot-card {
        border: 1.5px dashed #cbd5e1;
        border-radius: 12px;
        padding: 14px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        background: #f8fafc;
      }
      .crm-empty-text {
        margin: 0 0 2px;
        font-size: 13.5px;
        font-weight: 700;
        color: #334155;
      }
      .crm-empty-sub {
        margin: 0;
        font-size: 11.5px;
        color: #64748b;
      }
      .btn-slot-search {
        background: #0284c7;
        color: #ffffff;
        border: none;
        border-radius: 10px;
        padding: 8px 14px;
        font-size: 13px;
        font-weight: 750;
        cursor: pointer;
        white-space: nowrap;
        box-shadow: 0 2px 6px rgba(2, 132, 199, 0.25);
        transition: all 0.15s ease;
      }
      .btn-slot-search:hover {
        background: #0369a1;
        transform: translateY(-1px);
      }
      .btn-slot-search.contractor {
        background: #db2777;
        box-shadow: 0 2px 6px rgba(219, 39, 119, 0.25);
      }
      .btn-slot-search.contractor:hover {
        background: #be185d;
      }

      /* 선택된 고객 카드 */
      .crm-selected-client-card {
        background: #f0fdf4;
        border: 1.5px solid #86efac;
        border-radius: 12px;
        padding: 12px 14px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .crm-client-avatar {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: #dcfce7;
        color: #15803d;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        flex-shrink: 0;
      }
      .crm-client-avatar.contractor {
        background: #fce7f3;
        color: #be185d;
      }
      .crm-client-meta {
        flex: 1;
        min-width: 0;
      }
      .crm-client-title {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 2px;
      }
      .crm-c-name {
        font-size: 15px;
        font-weight: 800;
        color: #0f172a;
      }
      .crm-c-rrn {
        font-size: 12px;
        color: #64748b;
        background: #ffffff;
        padding: 1px 6px;
        border-radius: 4px;
        border: 1px solid #e2e8f0;
      }
      .crm-client-details {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 12px;
        color: #475569;
      }
      .crm-client-actions {
        display: flex;
        gap: 6px;
        flex-shrink: 0;
      }
      .btn-card-change {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        color: #334155;
        border-radius: 8px;
        padding: 5px 10px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      .btn-card-change:hover {
        background: #f1f5f9;
      }
      .btn-card-remove {
        background: #fee2e2;
        border: 1px solid #fca5a5;
        color: #ef4444;
        border-radius: 8px;
        padding: 5px 8px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      /* 모달 푸터 버튼 */
      .crm-header-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
      }
      .btn-header-skip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: #ffffff;
        border: 1px solid rgba(220, 38, 38, 0.2);
        border-radius: 10px;
        padding: 7px 14px;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(239, 68, 68, 0.28);
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        white-space: nowrap;
      }
      .btn-header-skip:hover {
        background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
        box-shadow: 0 4px 14px rgba(220, 38, 38, 0.42);
        transform: translateY(-1px);
      }
      .crm-modal-footer {
        padding: 16px 24px 20px;
        background: #ffffff;
        border-top: 1px solid #f1f5f9;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
      }
      .crm-modal-footer .btn-footer-apply {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .btn-footer-skip {
        background: transparent;
        border: none;
        color: #64748b;
        font-size: 13.5px;
        font-weight: 700;
        cursor: pointer;
        padding: 10px 14px;
        border-radius: 10px;
        transition: all 0.15s ease;
      }
      .btn-footer-skip:hover {
        background: #f1f5f9;
        color: #334155;
      }
      .btn-footer-apply {
        background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
        color: #ffffff;
        border: none;
        border-radius: 12px;
        padding: 12px 24px;
        font-size: 14.5px;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .btn-footer-apply:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(2, 132, 199, 0.45);
        filter: brightness(1.05);
      }

      /* 검색 뷰 */
      .crm-search-bar-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 16px 20px;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
      }
      .btn-search-back {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        color: #334155;
        border-radius: 8px;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 750;
        cursor: pointer;
        white-space: nowrap;
      }
      .crm-search-input-box {
        flex: 1;
        position: relative;
        display: flex;
        align-items: center;
      }
      .crm-search-input-box input {
        width: 100%;
        padding: 11px 36px 11px 14px;
        border-radius: 10px;
        border: 1.5px solid #cbd5e1;
        font-size: 14px;
        outline: none;
        box-sizing: border-box;
      }
      .crm-search-input-box input:focus {
        border-color: #0284c7;
        box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
      }
      .crm-search-clear {
        position: absolute;
        right: 10px;
        background: #cbd5e1;
        border: none;
        color: #ffffff;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
      }
      .crm-search-role-guide {
        padding: 8px 20px;
        background: #eff6ff;
        font-size: 12.5px;
        color: #1e40af;
        border-bottom: 1px solid #dbeafe;
      }
      .crm-customer-list {
        padding: 12px 20px;
        max-height: calc(80vh - 180px);
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .crm-customer-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        background: #ffffff;
        border: 1.5px solid #e2e8f0;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .crm-customer-card:hover {
        border-color: #0284c7;
        background: #f0f9ff;
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(2, 132, 199, 0.08);
      }
      .customer-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #e0f2fe;
        color: #0369a1;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: 800;
        flex-shrink: 0;
      }
      .card-center {
        flex: 1;
        min-width: 0;
      }
      .customer-main-line {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 3px;
        flex-wrap: wrap;
      }
      .customer-name {
        font-size: 14.5px;
        font-weight: 800;
        color: #0f172a;
      }
      .customer-rrn {
        font-size: 12px;
        color: #64748b;
      }
      .badge-pet {
        background: #fef3c7;
        color: #b45309;
        font-size: 11px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 6px;
      }
      .badge-bank {
        background: #f1f5f9;
        color: #475569;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 6px;
      }
      .customer-sub-line {
        display: flex;
        gap: 10px;
        font-size: 12px;
        color: #64748b;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .btn-select-client {
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        color: #0284c7;
        font-weight: 750;
        font-size: 12px;
        border-radius: 8px;
        padding: 6px 12px;
        cursor: pointer;
      }
      .crm-customer-card:hover .btn-select-client {
        background: #0284c7;
        color: #ffffff;
        border-color: #0284c7;
      }

      /* 토스트 */
      .crm-success-toast {
        position: fixed;
        top: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(-20px);
        background: #0f172a;
        color: #ffffff;
        padding: 12px 22px;
        border-radius: 30px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 100000;
        opacity: 0;
        pointer-events: none;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        font-size: 13.5px;
        font-weight: 700;
      }
      .crm-success-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      /* 반응형 */
      @media (max-width: 640px) {
        .crm-modal-backdrop {
          padding: 10px 8px;
        }
        .crm-toggle-grid {
          grid-template-columns: 1fr;
        }
        .crm-empty-slot-card {
          flex-direction: column;
          align-items: flex-start !important;
        }
        .btn-slot-search {
          width: 100%;
        }
        .crm-modal-footer {
          flex-direction: column-reverse;
        }
        .btn-footer-skip, .btn-footer-apply {
          width: 100%;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // ========================================================
  // [돔 감시 및 초기화]
  // ========================================================
  let isObserverUpdating = false;
  function initObserver() {
    const targetNode = document.getElementById('slides-container');
    if (!targetNode) {
      setTimeout(initObserver, 200);
      return;
    }

    const observer = new MutationObserver(function () {
      if (isObserverUpdating) return;
      isObserverUpdating = true;
      try {
        attachButtonsToForm();
        updateStepperBar();
      } finally {
        setTimeout(() => { isObserverUpdating = false; }, 80);
      }
    });

    observer.observe(targetNode, { childList: true, subtree: true });
    attachButtonsToForm();
    updateStepperBar();

    const contentArea = document.querySelector('.content-area');
    if (contentArea) {
      const stepObserver = new MutationObserver(function () {
        if (isObserverUpdating) return;
        isObserverUpdating = true;
        try {
          updateStepperBar();
        } finally {
          setTimeout(() => { isObserverUpdating = false; }, 80);
        }
      });
      stepObserver.observe(contentArea, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initDataSync();
      initObserver();
      injectCustomStyles();
    });
  } else {
    initDataSync();
    initObserver();
    injectCustomStyles();
  }

  window.attachCustomerPickerButtons = attachButtonsToForm;
  window.updateStepperBar = updateStepperBar;

  // ==============================================================================
  // [청구관리 구글 시트 자동 기록 엔진]
  // ==============================================================================
  async function saveClaimRecordToGoogleSheet(claimInfo) {
    try {
      if (!claimInfo) return false;

      // 1. Google OAuth 토큰 및 시트 ID 탐색
      const token = (function() {
        try {
          return localStorage.getItem('g_access_token') ||
                 sessionStorage.getItem('g_access_token') ||
                 (window.gToken) ||
                 (window.parent && window.parent.gToken) ||
                 (window.opener && window.opener.gToken);
        } catch(e) { return null; }
      })();

      const sheetId = (function() {
        try {
          return localStorage.getItem('g_sheet_id') ||
                 sessionStorage.getItem('g_sheet_id') ||
                 (window.gSheetId) ||
                 (window.parent && window.parent.gSheetId) ||
                 (window.opener && window.opener.gSheetId);
        } catch(e) { return null; }
      })();

      if (!token || !sheetId) {
        console.warn('[Claim Logger] Google Sheet token or sheetId missing, skipping sheet append.');
        return false;
      }

      console.log('[Claim Logger] 구글 시트 청구관리 기록 시작... SheetId:', sheetId);

      // 2. 스프레드시트 메타데이터 조회하여 '청구관리' 탭 존재 여부 확인
      const metaUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '?fields=sheets.properties.title';
      const metaResp = await fetch(metaUrl, {
        headers: { Authorization: 'Bearer ' + token }
      });

      if (!metaResp.ok) {
        console.warn('[Claim Logger] 메타데이터 조회 실패:', metaResp.status);
        return false;
      }

      const metaJson = await metaResp.json();
      const existingSheets = (metaJson.sheets || []).map(function(s) {
        return s.properties && s.properties.title;
      });

      const tabTitle = '청구관리';
      const tabExists = existingSheets.indexOf(tabTitle) !== -1;

      // 3. '청구관리' 탭이 없으면 자동 생성 및 첫 행 헤더 입력
      if (!tabExists) {
        console.log('[Claim Logger] "청구관리" 탭이 없어 새로 생성합니다...');
        const addSheetUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + ':batchUpdate';
        const addSheetResp = await fetch(addSheetUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            requests: [
              {
                addSheet: {
                  properties: {
                    title: tabTitle,
                    gridProperties: {
                      frozenRowCount: 1
                    }
                  }
                }
              }
            ]
          })
        });

        if (!addSheetResp.ok) {
          console.warn('[Claim Logger] "청구관리" 탭 생성 실패:', await addSheetResp.text());
          return false;
        }

        // 헤더 행 작성
        const headerRow = [
          '청구일시',
          '피보험자(고객명)',
          '피보험자 주민번호',
          '계약자',
          '계약자 주민번호',
          '접수보험사',
          '청구분야',
          '사고유형',
          '사고/발병일자',
          '수신팩스번호',
          '팩스접수번호',
          '전송상태',
          '담당설계사'
        ];

        const headerUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/' + encodeURIComponent("'" + tabTitle + "'!A1") + ':append?valueInputOption=USER_ENTERED';
        await fetch(headerUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [headerRow]
          })
        });
        console.log('[Claim Logger] "청구관리" 탭 헤더 생성 완료!');
      }

      // 4. 한국 시간 기준 일시 포맷팅 (YYYY-MM-DD HH:mm)
      const now = new Date();
      const kstOffset = 9 * 60 * 60 * 1000;
      const kstDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + kstOffset);
      const pad = function(n) { return String(n).padStart(2, '0'); };
      const claimDateStr = kstDate.getFullYear() + '-' + pad(kstDate.getMonth() + 1) + '-' + pad(kstDate.getDate()) + ' ' + pad(kstDate.getHours()) + ':' + pad(kstDate.getMinutes());

      // 5. 새 청구 데이터 행 구성
      const newRow = [
        claimDateStr,
        claimInfo.insuredName || claimInfo.clientName || '',
        claimInfo.insuredRrn || '',
        claimInfo.contractorName || claimInfo.insuredName || claimInfo.clientName || '',
        claimInfo.contractorRrn || claimInfo.insuredRrn || '',
        claimInfo.companyName || '',
        claimInfo.category || '',
        claimInfo.accType || '',
        claimInfo.accDate || '',
        claimInfo.faxNumber || '',
        claimInfo.receiptNum || '',
        claimInfo.status || '접수완료',
        claimInfo.plannerName || ''
      ];

      // 6. 구글 시트 '청구관리' 탭의 맨 아래에 한 줄 추가 (append)
      const appendUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/' + encodeURIComponent("'" + tabTitle + "'!A1") + ':append?valueInputOption=USER_ENTERED';
      const appendResp = await fetch(appendUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [newRow]
        })
      });

      if (appendResp.ok) {
        console.log('[Claim Logger] "청구관리" 탭에 청구 이력 저장 성공:', newRow);
        return true;
      } else {
        console.warn('[Claim Logger] 행 추가 실패:', await appendResp.text());
        return false;
      }
    } catch (err) {
      console.error('[Claim Logger Critical Error]', err);
      return false;
    }
  }

  window.saveClaimRecordToGoogleSheet = saveClaimRecordToGoogleSheet;


})();
