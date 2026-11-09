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
  function initDataSync() {
    try {
      const cached = localStorage.getItem('weracle_crm_customers_cache')
                  || localStorage.getItem('demo_crm_data')
                  || localStorage.getItem('weracle_crm_cached_data');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          window.crmPickerState.customers = parsed;
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

  // 2. 고객 데이터 정제기 (CRM 한글/영문/공백/배열 모든 구조 완벽 호환)
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
      return {
        raw: client,
        name: colName,
        phone: cleanPhone,
        formattedPhone: formatPhoneDisplay(cleanPhone),
        rrn: cleanRrn,
        rrnFront: cleanRrn.length >= 6 ? cleanRrn.substring(0, 6) : '',
        rrnBack: cleanRrn.length >= 7 ? cleanRrn.substring(6) : '',
        address: colAddr,
        bankName: '',
        bankAccount: '',
        bankOwner: colName,
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

    // 빈 행 필터링: 이름과 폰번호/주민번호가 모두 없는 가짜 행 제외
    if (!rawName && !rawPhone && !rawRrn) return null;

    // 4. 주소
    const rawAddress = getVal(['주소', '자택주소', '거주지', '사업장주소', '상세주소', '소재지', 'address', 'addr', 'client_address']);

    // 5. 은행 / 계좌
    const bankName = getVal(['은행명', '은행', '환급은행', 'bank_name', 'bankName', 'bank']);
    const rawAccount = getVal(['계좌번호', '계좌', '환급계좌', 'account_number', 'accountNumber', 'bankAccount']);
    const bankAccount = rawAccount.replace(/[^0-9]/g, '');
    const bankOwner = getVal(['예금주', '예금주명', 'account_holder', 'accountHolder', 'bankOwner']) || rawName;

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
        birth: getVal(['동물생일', 'pet_birth']),
        gender: getVal(['동물성별', 'pet_gender']),
        color: getVal(['동물모색', 'pet_color'])
      });
    }

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

    return {
      raw: client,
      name: rawName,
      phone: cleanPhone,
      formattedPhone: formatPhoneDisplay(cleanPhone),
      rrn: cleanRrn,
      rrnFront: rrnFront,
      rrnBack: rrnBack,
      address: rawAddress,
      bankName: bankName,
      bankAccount: bankAccount,
      bankOwner: bankOwner,
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
              ${insured.bankName ? `<span>🏦 ${insured.bankName} ${insured.bankAccount}</span>` : ''}
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
                ${contractor.bankName ? `<span>🏦 ${contractor.bankName} ${contractor.bankAccount} (${contractor.bankOwner})</span>` : ''}
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
  // ========================================================
  // [고객 리스트 렌더링 및 실시간 검색]
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
        <div class="crm-empty-state">
          <div class="empty-icon">🔍</div>
          <p class="empty-title">${keyword ? '일치하는 고객이 없습니다' : '등록된 고객 데이터가 없습니다'}</p>
          <p class="empty-sub">${keyword ? '검색어를 다시 확인해주세요.' : '위라클랩 CRM에서 고객을 먼저 등록해주세요.'}</p>
        </div>
      `;
      return;
    }

    let html = '';
    filtered.forEach((sanitized, idx) => {
      const petCount = sanitized.pets ? sanitized.pets.length : 0;
      const petBadge = petCount > 0 ? `<span class="badge-pet">🐾 반려견 ${petCount}마리</span>` : '';
      const bankBadge = sanitized.bankName ? `<span class="badge-bank">${sanitized.bankName}</span>` : '';

      html += `
        <div class="crm-customer-card" onclick="selectCustomerFromList(${idx})">
          <div class="card-left">
            <div class="customer-avatar">${sanitized.name ? sanitized.name.charAt(0) : '고'}</div>
          </div>
          <div class="card-center">
            <div class="customer-main-line">
              <span class="customer-name">${sanitized.name || '이름 없음'}</span>
              <span class="customer-rrn">${sanitized.rrnFront ? sanitized.rrnFront + '-*******' : '주민번호 미등록'}</span>
              ${petBadge}
              ${bankBadge}
            </div>
            <div class="customer-sub-line">
              <span class="customer-phone">📞 ${sanitized.formattedPhone || sanitized.phone || '연락처 없음'}</span>
              <span class="customer-addr">🏠 ${sanitized.address || '주소 미등록'}</span>
            </div>
          </div>
          <div class="card-right">
            <button type="button" class="btn-select-client">선택 ›</button>
          </div>
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

  // ========================================================
  // [단일 주입 엔진 (Clean Staging)]
  // ========================================================
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

    // 4. 피보험자 정보 주입
    if (insured) {
      setFieldValue('insName', insured.name);
      setFieldValue('insRrn', insured.rrn);
      setFieldValue('insRrn_front', insured.rrnFront);
      setFieldValue('insRrn_back', insured.rrnBack);
      setFieldValue('insPhone', insured.phone);
      setFieldValue('insAddress', insured.address);
    }

    // 5. 계약자 / 수익자 정보 주입
    if (isDiff && contractor) {
      // 손해보험 cont* 필드 주입
      setFieldValue('contName', contractor.name);
      setFieldValue('contRrn', contractor.rrn);
      setFieldValue('contRrn_front', contractor.rrnFront);
      setFieldValue('contRrn_back', contractor.rrnBack);
      setFieldValue('contPhone', contractor.phone);
      setFieldValue('contAddress', contractor.address);

      // 생명보험 bene* 필드 주입
      setFieldValue('beneName', contractor.name);
      setFieldValue('beneRrn', contractor.rrn);
      setFieldValue('beneRrn_front', contractor.rrnFront);
      setFieldValue('beneRrn_back', contractor.rrnBack);
      setFieldValue('benePhone', contractor.phone);
      setFieldValue('beneAddress', contractor.address);

      // 보상안내(guide*) 주입
      setFieldValue('guideName', contractor.name);
      setFieldValue('guidePhone', contractor.phone);

      // 계좌정보 주입 (계약자 우선, 없으면 피보험자)
      const moneyTarget = contractor.bankAccount ? contractor : (insured || contractor);
      injectBankData(moneyTarget);

    } else if (!isDiff && insured) {
      // 동일 모드: 피보험자 계좌 및 보상안내 주입
      setFieldValue('guideName', insured.name);
      setFieldValue('guidePhone', insured.phone);
      setFieldValue('guideRelation', '본인');
      injectBankData(insured);
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

    // 모달 닫기
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
    setFieldValue('bankName', target.bankName);
    setFieldValue('bankAccount', target.bankAccount);
    setFieldValue('bankOwner', target.bankOwner || target.name);
    setFieldValue('bankOwnerRrn', target.rrn);
    setFieldValue('bankOwnerRel', target === window.crmPickerState.insuredData ? '본인' : '계약자');
  }

  // 필드 값 안전 주입
  function setFieldValue(fieldId, value) {
    if (value === undefined || value === null || value === '') return;
    const el = document.getElementById(fieldId);
    if (el) {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
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
      .crm-modal-footer {
        padding: 16px 24px 20px;
        background: #ffffff;
        border-top: 1px solid #f1f5f9;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
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
      .crm-search-input-box svg {
        position: absolute;
        left: 12px;
        pointer-events: none;
      }
      .crm-search-input-box input {
        width: 100%;
        padding: 10px 36px 10px 38px;
        border-radius: 10px;
        border: 1.5px solid #cbd5e1;
        font-size: 13.5px;
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

})();
