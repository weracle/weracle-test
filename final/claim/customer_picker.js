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
      const cached = localStorage.getItem('weracle_crm_customers_cache');
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

    // 메시지 수신 대기
    window.addEventListener('message', function (event) {
      if (!event.data) return;
      if (event.data.type === 'syncData' || event.data.type === 'crmData' || event.data.type === 'CUSTOMER_DATA_SYNC') {
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

  // 2. 고객 데이터 정제기
  function sanitizeCustomer(client) {
    if (!client) return null;

    const rawName = client.name || client.client_name || client.customerName || '';
    const rawPhone = client.phone || client.mobile || client.client_phone || '';
    const rawRrn = client.rrn || client.jumin || client.client_jumin || client.idNum || '';
    const rawAddress = client.address || client.addr || client.client_address || '';

    const cleanRrn = String(rawRrn).replace(/[^0-9]/g, '');
    let rrnFront = '', rrnBack = '';
    if (cleanRrn.length === 13) {
      rrnFront = cleanRrn.substring(0, 6);
      rrnBack = cleanRrn.substring(6, 13);
    } else if (String(rawRrn).includes('-')) {
      const parts = String(rawRrn).split('-');
      rrnFront = (parts[0] || '').replace(/[^0-9]/g, '');
      rrnBack = (parts[1] || '').replace(/[^0-9]/g, '');
    }

    const cleanPhone = String(rawPhone).replace(/[^0-9]/g, '');

    const bankName = client.bank_name || client.bankName || client.bank || '';
    const bankAccount = String(client.account_number || client.accountNumber || client.bankAccount || '').replace(/[^0-9]/g, '');
    const bankOwner = client.account_holder || client.accountHolder || client.bankOwner || rawName;

    let pets = [];
    if (Array.isArray(client.pets) && client.pets.length > 0) {
      pets = client.pets;
    } else if (client.pet_name || client.petName) {
      pets.push({
        name: client.pet_name || client.petName || '',
        breed: client.pet_breed || client.petBreed || '',
        birth: client.pet_birth || client.petBirth || '',
        gender: client.pet_gender || client.petGender || '',
        color: client.pet_color || client.petColor || ''
      });
    }

    return {
      raw: client,
      name: rawName,
      phone: cleanPhone,
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

  // 3. 모달 DOM 생성
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
            <button type="button" class="crm-modal-close" onclick="closeCrmPickerModal()" aria-label="닫기">✕</button>
          </div>

          <!-- 메인 설정 위저드 뷰 (Setup View) -->
          <div id="crmSetupView" class="crm-view-container">
            <div id="crmSetupScroll" class="crm-modal-scroll">
              <!-- JS에서 동적 렌더링 -->
            </div>
            <div class="crm-modal-footer">
              <button type="button" class="btn-footer-skip" onclick="skipToDirectWrite()">
                ✍️ 건너뛰고 직접 수기 작성
              </button>
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
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
  function renderCustomerList() {
    const listEl = document.getElementById('crmCustomerList');
    if (!listEl) return;

    let all = window.crmPickerState.customers || [];
    if (all.length === 0 && Array.isArray(window.claimCustomerData) && window.claimCustomerData.length > 0) {
      all = window.claimCustomerData;
      window.crmPickerState.customers = all;
    }

    const keyword = (window.crmPickerState.searchKeyword || '').toLowerCase().trim();

    let filtered = all;
    if (keyword) {
      filtered = all.filter(c => {
        const name = (c.name || c.client_name || c.customerName || '').toLowerCase();
        const phone = (c.phone || c.mobile || c.client_phone || '').replace(/[^0-9]/g, '');
        const rrn = (c.rrn || c.jumin || c.client_jumin || '').replace(/[^0-9]/g, '');
        return name.includes(keyword) || phone.includes(keyword) || rrn.includes(keyword);
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
    filtered.forEach((client, idx) => {
      const sanitized = sanitizeCustomer(client);
      const petCount = sanitized.pets ? sanitized.pets.length : 0;
      const petBadge = petCount > 0 ? `<span class="badge-pet">🐾 반려견 ${petCount}마리</span>` : '';
      const bankBadge = sanitized.bankName ? `<span class="badge-bank">${sanitized.bankName}</span>` : '';

      html += `
        <div class="crm-customer-card" onclick="selectCustomerFromList(${idx})">
          <div class="card-left">
            <div class="customer-avatar">${sanitized.name.charAt(0) || '고'}</div>
          </div>
          <div class="card-center">
            <div class="customer-main-line">
              <span class="customer-name">${sanitized.name}</span>
              <span class="customer-rrn">${sanitized.rrnFront ? sanitized.rrnFront + '-*******' : '주민번호 미등록'}</span>
              ${petBadge}
              ${bankBadge}
            </div>
            <div class="customer-sub-line">
              <span class="customer-phone">📞 ${sanitized.phone || '연락처 없음'}</span>
              <span class="customer-addr">🏠 ${sanitized.address || '주소 미등록'}</span>
            </div>
          </div>
          <div class="card-right">
            <button type="button" class="btn-select-client">선택 ›</button>
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;
  }

  // 고객 검색 목록에서 고객 선택 완료
  window.selectCustomerFromList = function (idx) {
    let all = window.crmPickerState.customers || [];
    const keyword = (window.crmPickerState.searchKeyword || '').toLowerCase().trim();
    let filtered = all;
    if (keyword) {
      filtered = all.filter(c => {
        const name = (c.name || c.client_name || c.customerName || '').toLowerCase();
        const phone = (c.phone || c.mobile || c.client_phone || '').replace(/[^0-9]/g, '');
        const rrn = (c.rrn || c.jumin || c.client_jumin || '').replace(/[^0-9]/g, '');
        return name.includes(keyword) || phone.includes(keyword) || rrn.includes(keyword);
      });
    }

    const client = filtered[idx];
    if (!client) return;

    const sanitized = sanitizeCustomer(client);
    const role = window.crmPickerState.selectingRole;

    if (role === 'insured') {
      window.crmPickerState.insuredCustomer = client;
      window.crmPickerState.insuredData = sanitized;
    } else {
      window.crmPickerState.contractorCustomer = client;
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
      const dynStep = document.getElementById('step_dyn_flow');
      if (!dynStep || !dynStep.classList.contains('active')) return;

      const slides = Array.from(document.querySelectorAll('#slides-container .app-slide'));
      if (slides.length === 0) return;

      let activeIdx = slides.findIndex(s => s.classList.contains('active'));
      if (activeIdx < 0) activeIdx = 0;

      let dynFlow = document.getElementById('step_dyn_flow');
      if (!dynFlow) return;

      let stepperWrap = document.getElementById('covyStepperBar');
      if (!stepperWrap) {
        stepperWrap = document.createElement('div');
        stepperWrap.id = 'covyStepperBar';
        stepperWrap.className = 'covy-style-stepper';
        dynFlow.parentNode.insertBefore(stepperWrap, dynFlow);
      } else {
        stepperWrap.className = 'covy-style-stepper';
      }

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
        align-items: flex-start;
        justify-content: center;
        z-index: 99999;
        padding: 40px 16px;
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
        margin: auto 0;
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
        align-items: flex-start;
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
        align-items: flex-start;
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
          align-items: flex-start;
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
