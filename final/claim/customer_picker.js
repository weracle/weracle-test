/**
 * ==============================================================================
 * [위라클 통합 보험금 청구] CRM 고객 데이터 연동 및 자동 완성 모듈 (V2 - Dual Role Staging)
 * ==============================================================================
 * 
 * [핵심 기능]
 * 1. 실전 2인 구조 (피보험자 vs 계약자/수익자) 완벽 지원
 *    - 피보험자 = 계약자/수익자 동일 (본인 청구)
 *    - 피보험자 ≠ 계약자/수익자 다름 (가족/대리 청구)
 * 2. 원스톱 단일 주입 (Clean Staging) 원칙:
 *    - 팝업 안에서 최종 확인 후 [폼에 반영하기]를 누르는 단 1회의 순간에 각자 자리에 깨끗하게 주입
 *    - 폼 내부에서 데이터가 임시로 채워졌다 덮어써지며 생기는 데이터 찌꺼기/겹침 오류 100% 원천 차단
 * 3. 5대 청구 파트 (질병상해, 펫보험, 생명보험, 배상책임, 재물보험) 공통 연동
 *    - 손해보험 'cont*(계약자)' 및 생명보험 'bene*(수익자)' 스마트 분기 매핑
 *    - 보상안내(guide*) 및 수령계좌(bank*)는 실제 돈 받는 주체에게 자동 지정
 * 4. 4단계 코비 수평 스텝퍼 바(updateStepperBar) 100% 무한루프 방지 및 안전 작동
 * ==============================================================================
 */

(function () {
  'use strict';

  // 전역 상태 관리
  window.crmPickerState = {
    customers: [],
    searchKeyword: '',
    selectingRole: 'insured', // 'insured' (Person A) or 'contractor' (Person B)

    // Person A: 피보험자 (치료받은 분)
    insuredCustomer: null,
    insuredData: null,

    // 동일 vs 다름 여부
    isDifferent: false,

    // Person B: 계약자 / 수익자 (돈 받으실 분 - isDifferent가 true일 때)
    contractorCustomer: null,
    contractorData: null,
    relation: '모', // '모', '부', '배우자', '자녀', '기타'
    customRelation: '',

    receiptType: 'auto', // 'auto' or 'bank'
    selectedPetIndex: 0
  };

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
          if (isModalOpen()) {
            renderCustomerList();
          }
        }
      }
    });
  }

  // 2. 고객 데이터 정제기 (다견/다묘, 계좌, 안내인 등 포함)
  function sanitizeCustomer(client) {
    if (!client) return null;

    const rawName = client.name || client.client_name || client.customerName || '';
    const rawPhone = client.phone || client.mobile || client.client_phone || '';
    const rawRrn = client.rrn || client.jumin || client.client_jumin || client.idNum || '';
    const rawAddress = client.address || client.addr || client.client_address || '';

    const cleanRrn = String(rawRrn).replace(/[^0-9]/g, '');

    // 계좌 정보 탐색
    let bankName = client.bankName || client.bank || client.bank_name || '';
    let bankAccount = client.bankAccount || client.accountNumber || client.account || client.account_num || '';
    let bankOwner = client.bankOwner || client.accountHolder || client.depositor || rawName;
    let bankOwnerRrn = client.bankOwnerRrn || client.depositorRrn || cleanRrn;

    if (!bankName && client.customFields) {
      bankName = client.customFields.bankName || client.customFields['은행명'] || '';
    }
    if (!bankAccount && client.customFields) {
      bankAccount = client.customFields.bankAccount || client.customFields['계좌번호'] || '';
    }
    if (!bankOwner && client.customFields) {
      bankOwner = client.customFields.bankOwner || client.customFields['예금주'] || rawName;
    }
    if (!bankOwnerRrn && client.customFields) {
      bankOwnerRrn = client.customFields.bankOwnerRrn || client.customFields['예금주주민번호'] || cleanRrn;
    }

    // 반려동물 목록 탐색 및 다견/다묘 분리 파싱
    let pets = [];
    if (Array.isArray(client.pets) && client.pets.length > 0) {
      pets = client.pets;
    } else if (Array.isArray(client.petList) && client.petList.length > 0) {
      pets = client.petList;
    } else {
      const pName = client.petName || client.dogName || client.catName || (client.customFields && (client.customFields.petName || client.customFields['반려동물명']));
      const pBreed = client.petBreed || client.breed || (client.customFields && (client.customFields.petBreed || client.customFields['견종'] || client.customFields['묘종']));
      const pAge = client.petAge || (client.customFields && (client.customFields.petAge || client.customFields['나이']));
      const pGender = client.petGender || (client.customFields && (client.customFields.petGender || client.customFields['성별']));
      const pChip = client.petChipNum || client.chipNum || (client.customFields && (client.customFields.chipNum || client.customFields['마이크로칩']));
      const pType = client.petType || (client.customFields && client.customFields['동물구분']) || '반려견';

      if (pName || pBreed) {
        pets.push({
          name: pName || '이름 미기재',
          breed: pBreed || '품종 미기재',
          age: pAge || '',
          gender: pGender || '',
          chipNum: pChip || '',
          type: pType
        });
      }
    }

    return {
      raw: client,
      name: rawName,
      phone: rawPhone,
      rrn: cleanRrn,
      address: rawAddress,
      bankName: bankName,
      bankAccount: bankAccount,
      bankOwner: bankOwner,
      bankOwnerRrn: String(bankOwnerRrn).replace(/[^0-9]/g, ''),
      pets: pets
    };
  }

  // 3. 모달 DOM 생성
  function ensureModalDom() {
    if (document.getElementById('crmPickerModal')) return;

    const modalHtml = `
      <div id="crmPickerModal" class="crm-modal-backdrop">
        <div class="crm-modal-container">
          <div class="crm-modal-header">
            <div>
              <h3 class="crm-modal-title" id="crmModalTitle">CRM 고객 정보 불러오기</h3>
              <p class="crm-modal-sub" id="crmModalSub">고객을 선택하면 청구서 폼에 채워질 데이터 목록이 표시됩니다.</p>
            </div>
            <button type="button" class="crm-modal-close" onclick="closeCustomerPicker()">&times;</button>
          </div>

          <!-- 단계 1: 고객 검색 및 목록 뷰 -->
          <div id="crmPickerStep1" class="crm-modal-step active">
            <div class="crm-search-wrap">
              <input type="text" id="crmSearchInput" class="crm-search-input" placeholder="고객명, 휴대폰 번호, 주민번호 검색..." oninput="onCustomerSearchInput(this.value)">
            </div>
            <div id="crmCustomerList" class="crm-list-area"></div>
          </div>

          <!-- 단계 2: 선택된 고객 데이터 미리보기 및 검증 뷰 -->
          <div id="crmPickerStep2" class="crm-modal-step">
            <div class="crm-preview-scroll" id="crmPreviewScroll"></div>
            
            <div class="crm-preview-footer">
              <button type="button" class="crm-btn-back" onclick="backToCustomerList()">← 목록에서 다시 찾기</button>
              <button type="button" class="crm-btn-apply" onclick="confirmAndApplyCustomerData()">✨ 폼에 즉시 반영하기</button>
            </div>
          </div>

        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const backdrop = document.getElementById('crmPickerModal');
    if (backdrop) {
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) closeCustomerPicker();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isModalOpen()) closeCustomerPicker();
    });

    injectCustomStyles();
  }

  // 4. 모달 열기/닫기 및 스텝 전환
  window.openCustomerPicker = function (targetRole) {
    ensureModalDom();
    if (!window.crmPickerState.customers || window.crmPickerState.customers.length === 0) {
      initDataSync();
    }

    // 폼에 이미 "다릅니다"가 체크되어 있는지 감지
    const isFormDiff = (document.getElementById('diffInsuredCont')?.checked) ||
                       (document.querySelector('input[name="sameAsCont"]:checked')?.value === 'no') ||
                       (document.querySelector('input[name="sameAsBene"]:checked')?.value === 'no');

    if (targetRole === 'contractor') {
      window.crmPickerState.selectingRole = 'contractor';
      window.crmPickerState.isDifferent = true;
    } else {
      window.crmPickerState.selectingRole = 'insured';
      if (isFormDiff) {
        window.crmPickerState.isDifferent = true;
      }
    }

    const modal = document.getElementById('crmPickerModal');
    if (!modal) return;

    modal.classList.add('show');
    switchStep(1);

    const searchInput = document.getElementById('crmSearchInput');
    if (searchInput) {
      searchInput.value = '';
      setTimeout(() => searchInput.focus(), 100);
    }
    window.crmPickerState.searchKeyword = '';
    renderCustomerList();
  };

  window.closeCustomerPicker = function () {
    const modal = document.getElementById('crmPickerModal');
    if (modal) modal.classList.remove('show');
  };

  function isModalOpen() {
    const modal = document.getElementById('crmPickerModal');
    return modal && modal.classList.contains('show');
  }

  function switchStep(stepNum) {
    const s1 = document.getElementById('crmPickerStep1');
    const s2 = document.getElementById('crmPickerStep2');
    const role = window.crmPickerState.selectingRole || 'insured';

    if (stepNum === 1) {
      if (s1) s1.classList.add('active');
      if (s2) s2.classList.remove('active');
      if (role === 'contractor') {
        document.getElementById('crmModalTitle').innerText = '보험금 받으실 분 (계약자/수익자) 선택';
        document.getElementById('crmModalSub').innerText = '보험금을 수령할 보호자 또는 계약자 고객을 검색해 주세요.';
      } else {
        document.getElementById('crmModalTitle').innerText = '치료받으신 분 (피보험자) 선택';
        document.getElementById('crmModalSub').innerText = '청구 대상이 되는 환자(피보험자) 고객을 먼저 선택해 주세요.';
      }
    } else {
      if (s1) s1.classList.remove('active');
      if (s2) s2.classList.add('active');
      document.getElementById('crmModalTitle').innerText = '청구서 데이터 확인 및 최종 반영';
      document.getElementById('crmModalSub').innerText = '입력폼에 채워질 피보험자 및 계약자/수익자 데이터를 확인하세요.';
    }
  }

  window.backToCustomerList = function () {
    switchStep(1);
  };

  window.onCustomerSearchInput = function (val) {
    window.crmPickerState.searchKeyword = (val || '').trim().toLowerCase();
    renderCustomerList();
  };

  // 5. 고객 목록 렌더링
  function renderCustomerList() {
    const container = document.getElementById('crmCustomerList');
    if (!container) return;

    const all = window.crmPickerState.customers || [];
    const keyword = window.crmPickerState.searchKeyword;

    let filtered = all;
    if (keyword) {
      filtered = all.filter(c => {
        const name = (c.name || c.client_name || '').toLowerCase();
        const phone = (c.phone || c.mobile || '').replace(/[^0-9]/g, '');
        const rrn = (c.rrn || c.jumin || '').replace(/[^0-9]/g, '');
        const cleanKw = keyword.replace(/[^0-9a-zA-Z가-힣]/g, '');

        return name.includes(keyword) || 
               (cleanKw && phone.includes(cleanKw)) || 
               (cleanKw && rrn.includes(cleanKw));
      });
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="crm-empty-state">
          <div class="crm-empty-icon">🔍</div>
          <div class="crm-empty-title">검색된 고객이 없습니다</div>
          <div class="crm-empty-desc">${keyword ? '다른 이름이나 전화번호로 검색해 보세요.' : 'CRM에 등록된 고객 데이터가 없습니다.'}</div>
        </div>
      `;
      return;
    }

    window._filteredCustomerPool = filtered;

    let html = '';
    filtered.forEach((client, idx) => {
      const name = client.name || client.client_name || '이름 없음';
      const phone = client.phone || client.mobile || '연락처 없음';
      const rawRrn = client.rrn || client.jumin || '';
      let maskRrn = '';
      const cleanRrn = String(rawRrn).replace(/[^0-9]/g, '');
      if (cleanRrn.length === 13) {
        maskRrn = cleanRrn.slice(0, 6) + '-' + cleanRrn.slice(6, 7) + '******';
      } else if (cleanRrn.length > 6) {
        maskRrn = cleanRrn.slice(0, 6) + '-*******';
      }

      html += `
        <div class="crm-customer-card" onclick="selectCustomerForPreview(${idx})">
          <div class="crm-card-left">
            <div class="crm-card-avatar">${name.slice(0, 1)}</div>
            <div class="crm-card-info">
              <div class="crm-card-name-row">
                <span class="crm-card-name">${name}</span>
                ${maskRrn ? `<span class="crm-card-badge">${maskRrn}</span>` : ''}
              </div>
              <div class="crm-card-meta">${phone}</div>
            </div>
          </div>
          <button type="button" class="crm-card-select-btn">선택 →</button>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  // 6. 고객 선택 및 "2인 제어 & 채워지는 부분 리스트" 미리보기 화면 렌더링
  window.selectCustomerForPreview = function (filteredIndex) {
    const list = window._filteredCustomerPool || window.crmPickerState.customers || [];
    const client = list[filteredIndex];
    if (!client) return;

    const sanitized = sanitizeCustomer(client);
    const role = window.crmPickerState.selectingRole || 'insured';

    if (role === 'insured') {
      window.crmPickerState.insuredCustomer = client;
      window.crmPickerState.insuredData = sanitized;
    } else if (role === 'contractor') {
      window.crmPickerState.contractorCustomer = client;
      window.crmPickerState.contractorData = sanitized;
      window.crmPickerState.isDifferent = true;
    }

    renderPreviewView();
    switchStep(2);
  };

  // 역할 재선택 트리거
  window.selectRoleAgain = function (role) {
    window.crmPickerState.selectingRole = role;
    switchStep(1);
    const searchInput = document.getElementById('crmSearchInput');
    if (searchInput) {
      searchInput.value = '';
      setTimeout(() => searchInput.focus(), 100);
    }
    window.crmPickerState.searchKeyword = '';
    renderCustomerList();
  };

  // 피보험자 = 계약자 동일 여부 토글
  window.toggleSamePerson = function (isSame) {
    window.crmPickerState.isDifferent = !isSame;
    renderPreviewView();
  };

  // 피보험자와의 관계 선택
  window.selectRelationChoice = function (rel) {
    window.crmPickerState.relation = rel;
    renderPreviewView();
  };

  function renderPreviewView() {
    const scrollEl = document.getElementById('crmPreviewScroll');
    if (!scrollEl) return;

    const insured = window.crmPickerState.insuredData;
    if (!insured) {
      switchStep(1);
      return;
    }

    const isDiff = window.crmPickerState.isDifferent;
    const contractor = window.crmPickerState.contractorData;
    const relation = window.crmPickerState.relation || '모';

    // 폼 지원 역량 탐색
    const hasGuide = !!document.getElementById('guideName') || !!document.getElementById('guidePhone');
    const hasAutoTransfer = !!document.getElementById('autoTransfer');
    const hasBank = !!document.getElementById('bankName') || !!document.getElementById('bankAccount');
    const hasBankOwnerRrn = !!document.getElementById('bankOwnerRrn');
    const hasPet = !!document.getElementById('petName') || !!document.getElementById('petBreed');

    if (!window.crmPickerState.receiptType) {
      window.crmPickerState.receiptType = hasAutoTransfer ? 'auto' : 'bank';
    }

    // 메인 청구 대상(돈 받는 주체)
    const targetForMoney = (isDiff && contractor) ? contractor : insured;

    let html = '';

    // ========================================================
    // 상단 2인 역할 제어 콘솔 (Dual-Role Control Box)
    // ========================================================
    html += `
      <div class="crm-dual-role-card">
        <!-- Person A: 치료받으신 분 -->
        <div class="crm-role-row">
          <div class="crm-role-badge insured">치료받으신 분 (피보험자)</div>
          <div class="crm-role-person-info">
            <span class="crm-person-name">${insured.name}</span>
            <span class="crm-person-sub">${insured.phone || '연락처 없음'}</span>
            ${insured.rrn ? `<span class="crm-person-rrn">(${insured.rrn.slice(0, 6)}-*******)</span>` : ''}
          </div>
          <button type="button" class="crm-btn-change-person" onclick="selectRoleAgain('insured')">고객 변경</button>
        </div>

        <div class="crm-role-divider"></div>

        <!-- Person B: 보험금 받으실 분 (동일 vs 다름 선택기) -->
        <div class="crm-role-row column">
          <div class="crm-role-header-row">
            <div class="crm-role-badge contractor">보험금 받으실 분 (계약자 / 수익자)</div>
            <div class="crm-diff-radio-group">
              <label class="crm-radio-pill ${!isDiff ? 'active' : ''}">
                <input type="radio" name="crmIsDiff" value="same" ${!isDiff ? 'checked' : ''} onchange="toggleSamePerson(true)">
                <span>피보험자와 동일 (본인)</span>
              </label>
              <label class="crm-radio-pill ${isDiff ? 'active' : ''}">
                <input type="radio" name="crmIsDiff" value="diff" ${isDiff ? 'checked' : ''} onchange="toggleSamePerson(false)">
                <span>피보험자와 다름 (가족/대리)</span>
              </label>
            </div>
          </div>

          ${isDiff ? `
            <div class="crm-contractor-select-area">
              ${contractor ? `
                <div class="crm-contractor-chosen-box">
                  <div class="crm-role-person-info">
                    <span class="crm-person-name">${contractor.name}</span>
                    <span class="crm-person-sub">${contractor.phone || '연락처 없음'}</span>
                    ${contractor.rrn ? `<span class="crm-person-rrn">(${contractor.rrn.slice(0, 6)}-*******)</span>` : ''}
                  </div>
                  <button type="button" class="crm-btn-change-person" onclick="selectRoleAgain('contractor')">고객 변경</button>
                </div>
                
                <!-- 관계 선택 칩 -->
                <div class="crm-relation-picker-wrap">
                  <span class="crm-rel-label">피보험자와의 관계:</span>
                  <div class="crm-rel-chips">
                    ${['모', '부', '배우자', '자녀', '기타'].map(r => `
                      <button type="button" class="crm-rel-chip ${relation === r ? 'active' : ''}" onclick="selectRelationChoice('${r}')">${r}</button>
                    `).join('')}
                  </div>
                </div>

                <div class="crm-role-tip-notice">
                  💡 계약자/수익자(${contractor.name}) 정보로 보상안내 문자 수신인 및 보험금 수령 계좌가 안전하게 지정됩니다.
                </div>
              ` : `
                <button type="button" class="crm-btn-pick-contractor-empty" onclick="selectRoleAgain('contractor')">
                  <span style="font-size: 16px;">🔍</span>
                  <span><strong>계약자 / 수익자(보호자) CRM에서 찾기</strong> (클릭)</span>
                </button>
              `}
            </div>
          ` : `
            <div class="crm-same-notice">
              ✓ 피보험자 본인이 계약자이자 수익자입니다. 모든 정보가 본인 기준으로 채워집니다.
            </div>
          `}
        </div>
      </div>
    `;

    // ========================================================
    // 세부 필드 미리보기 리스트
    // ========================================================

    // 1. 피보험자 섹션
    html += `
      <div class="crm-fill-section-card">
        <div class="crm-section-title">
          <span class="crm-section-num">1</span>
          <span>피보험자(치료받으신 분) 인적사항</span>
          <span class="crm-section-badge">${insured.name}</span>
        </div>
        <div class="crm-fill-grid">
          <div class="crm-fill-item">
            <span class="crm-fill-label">성명</span>
            <input type="text" id="prev_ins_name" class="crm-inline-input" value="${insured.name}">
          </div>
          <div class="crm-fill-item">
            <span class="crm-fill-label">주민등록번호 (13자리)</span>
            <input type="text" id="prev_ins_rrn" class="crm-inline-input" value="${insured.rrn}" maxlength="13">
          </div>
          <div class="crm-fill-item">
            <span class="crm-fill-label">휴대전화번호</span>
            <input type="text" id="prev_ins_phone" class="crm-inline-input" value="${insured.phone}">
          </div>
          <div class="crm-fill-item">
            <span class="crm-fill-label">자택 주소</span>
            <input type="text" id="prev_ins_address" class="crm-inline-input" value="${insured.address}">
          </div>
        </div>
      </div>
    `;

    // 2. 계약자 / 수익자 섹션 (다름일 때만)
    if (isDiff && contractor) {
      html += `
        <div class="crm-fill-section-card highlight">
          <div class="crm-section-title">
            <span class="crm-section-num">2</span>
            <span>계약자 / 수익자(보험금 받으실 분) 인적사항</span>
            <span class="crm-section-badge green">${contractor.name} (${relation})</span>
          </div>
          <div class="crm-fill-grid">
            <div class="crm-fill-item">
              <span class="crm-fill-label">성명</span>
              <input type="text" id="prev_cont_name" class="crm-inline-input" value="${contractor.name}">
            </div>
            <div class="crm-fill-item">
              <span class="crm-fill-label">주민등록번호 (13자리)</span>
              <input type="text" id="prev_cont_rrn" class="crm-inline-input" value="${contractor.rrn}" maxlength="13">
            </div>
            <div class="crm-fill-item">
              <span class="crm-fill-label">휴대전화번호</span>
              <input type="text" id="prev_cont_phone" class="crm-inline-input" value="${contractor.phone}">
            </div>
            <div class="crm-fill-item">
              <span class="crm-fill-label">피보험자와의 관계</span>
              <input type="text" id="prev_cont_relation" class="crm-inline-input" value="${relation}">
            </div>
            <div class="crm-fill-item full">
              <span class="crm-fill-label">등본상 주소</span>
              <input type="text" id="prev_cont_address" class="crm-inline-input" value="${contractor.address}">
            </div>
          </div>
        </div>
      `;
    }

    // 3. 보상안내받으실 분 섹션
    if (hasGuide) {
      html += `
        <div class="crm-fill-section-card">
          <div class="crm-section-title">
            <span class="crm-section-num">${isDiff ? '3' : '2'}</span>
            <span>보상 안내 문자 받으실 분</span>
            <span class="crm-section-badge">${targetForMoney.name}</span>
          </div>
          <div class="crm-fill-grid">
            <div class="crm-fill-item">
              <span class="crm-fill-label">안내받으실 분 성명</span>
              <input type="text" id="prev_guideName" class="crm-inline-input" value="${targetForMoney.name}">
            </div>
            <div class="crm-fill-item">
              <span class="crm-fill-label">안내 휴대폰 번호</span>
              <input type="text" id="prev_guidePhone" class="crm-inline-input" value="${targetForMoney.phone}">
            </div>
            <div class="crm-fill-item">
              <span class="crm-fill-label">피보험자와의 관계</span>
              <input type="text" id="prev_guideRelation" class="crm-inline-input" value="${isDiff ? relation : '본인'}">
            </div>
          </div>
        </div>
      `;
    }

    // 4. 보험금 수령 / 자동이체 설정 섹션
    if (hasAutoTransfer || hasBank) {
      html += `
        <div class="crm-fill-section-card">
          <div class="crm-section-title">
            <span class="crm-section-num">${isDiff ? '4' : '3'}</span>
            <span>보험금 수령 방법 및 계좌 정보</span>
            <span class="crm-section-badge">${targetForMoney.name} 명의</span>
          </div>
      `;

      if (hasAutoTransfer) {
        const rType = window.crmPickerState.receiptType;
        html += `
          <div class="crm-radio-choice-group">
            <label class="crm-radio-label">
              <input type="radio" name="crmReceiptType" value="auto" ${rType === 'auto' ? 'checked' : ''} onchange="toggleReceiptType('auto')">
              <span><strong>기존 보험료 납입 자동이체 계좌로 수령</strong> (서식에 '예'로 자동 체크, 계좌입력 생략)</span>
            </label>
            <label class="crm-radio-label">
              <input type="radio" name="crmReceiptType" value="bank" ${rType === 'bank' ? 'checked' : ''} onchange="toggleReceiptType('bank')">
              <span><strong>다른 계좌로 직접 수령</strong> (은행/계좌번호 직접 입력)</span>
            </label>
          </div>
        `;
      }

      html += `
        <div id="crmBankInputsWrap" style="${window.crmPickerState.receiptType === 'auto' ? 'opacity: 0.55;' : ''}">
          <div class="crm-fill-grid" style="margin-top: 12px;">
            <div class="crm-fill-item">
              <span class="crm-fill-label">은행명</span>
              <input type="text" id="prev_bankName" class="crm-inline-input" value="${targetForMoney.bankName || ''}" placeholder="예: 신한은행">
            </div>
            <div class="crm-fill-item">
              <span class="crm-fill-label">계좌번호 (숫자만)</span>
              <input type="text" id="prev_bankAccount" class="crm-inline-input" value="${targetForMoney.bankAccount || ''}" placeholder="예: 110123456789">
            </div>
            <div class="crm-fill-item">
              <span class="crm-fill-label">예금주 성명</span>
              <input type="text" id="prev_bankOwner" class="crm-inline-input" value="${targetForMoney.bankOwner || targetForMoney.name}">
            </div>
            <div class="crm-fill-item">
              <span class="crm-fill-label">피보험자와의 관계</span>
              <input type="text" id="prev_bankOwnerRel" class="crm-inline-input" value="${isDiff ? relation : '본인'}">
            </div>
            ${hasBankOwnerRrn ? `
              <div class="crm-fill-item full">
                <span class="crm-fill-label">예금주 주민등록번호 (13자리)</span>
                <input type="text" id="prev_bankOwnerRrn" class="crm-inline-input" value="${targetForMoney.bankOwnerRrn || targetForMoney.rrn}" maxlength="13">
              </div>
            ` : ''}
          </div>
        </div>
      </div>
      `;
    }

    // 5. 반려동물 정보 섹션 (펫보험 양식일 때만)
    if (hasPet) {
      const petList = (insured && insured.pets) || [];
      const pIdx = window.crmPickerState.selectedPetIndex || 0;

      html += `
        <div class="crm-fill-section-card">
          <div class="crm-section-title">
            <span class="crm-section-num">🐾</span>
            <span>반려동물 정보 선택 (다견/다묘 지원)</span>
          </div>
      `;

      if (petList.length > 0) {
        html += `<div class="crm-pet-list-wrap">`;
        petList.forEach((pet, idx) => {
          html += `
            <label class="crm-pet-select-item ${pIdx === idx ? 'selected' : ''}">
              <input type="radio" name="crmPetChoice" value="${idx}" ${pIdx === idx ? 'checked' : ''} onchange="onSelectPetChoice(${idx})">
              <div class="crm-pet-info-text">
                <div class="crm-pet-name-line">
                  <span class="crm-pet-badge">${pet.type || '반려동물'}</span>
                  <strong>${pet.name}</strong>
                  <span>(${pet.breed || '품종 미기재'})</span>
                </div>
                <div class="crm-pet-sub-meta">
                  ${pet.age ? `나이: ${pet.age}살 | ` : ''}
                  ${pet.gender ? `성별: ${pet.gender} | ` : ''}
                  ${pet.chipNum ? `마이크로칩: ${pet.chipNum}` : '마이크로칩 미등록'}
                </div>
              </div>
            </label>
          `;
        });
        html += `</div>`;
      } else {
        html += `
          <div class="crm-fill-grid" style="margin-top: 10px;">
            <div class="crm-fill-item">
              <span class="crm-fill-label">반려동물 이름</span>
              <input type="text" id="prev_petName" class="crm-inline-input" placeholder="예: 코코">
            </div>
            <div class="crm-fill-item">
              <span class="crm-fill-label">품종</span>
              <input type="text" id="prev_petBreed" class="crm-inline-input" placeholder="예: 말티즈">
            </div>
          </div>
        `;
      }
      html += `</div>`;
    }

    scrollEl.innerHTML = html;
  }

  window.toggleReceiptType = function (type) {
    window.crmPickerState.receiptType = type;
    const wrap = document.getElementById('crmBankInputsWrap');
    if (wrap) {
      wrap.style.opacity = type === 'auto' ? '0.55' : '1';
    }
  };

  window.onSelectPetChoice = function (pIdx) {
    window.crmPickerState.selectedPetIndex = pIdx;
    document.querySelectorAll('.crm-pet-select-item').forEach((el, idx) => {
      if (idx === pIdx) el.classList.add('selected');
      else el.classList.remove('selected');
    });
  };

  // 7. 데이터 최종 승인 및 폼 단일 주입 (Clean Single Transaction)
  window.confirmAndApplyCustomerData = function () {
    const isDiff = window.crmPickerState.isDifferent;
    const insured = window.crmPickerState.insuredData;
    const contractor = window.crmPickerState.contractorData;

    if (!insured) {
      alert('피보험자 정보를 먼저 선택해 주세요.');
      return;
    }

    if (isDiff && !contractor) {
      alert('보험금 받으실 분(계약자/수익자) 정보를 선택해 주세요.\n[계약자 / 수익자 CRM에서 찾기] 버튼을 눌러 지정할 수 있습니다.');
      return;
    }

    // 인풋 엘리먼트 값 주입 도우미
    function setFieldValue(fieldId, value) {
      const el = document.getElementById(fieldId);
      if (el && value !== undefined && value !== null) {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // ========================================================
    // Step A: 폼 모드 동기화 (동일함 vs 다릅니다 스위칭)
    // ========================================================
    if (isDiff) {
      // 1) diffInsuredCont 체크박스
      const diffCheck = document.getElementById('diffInsuredCont');
      if (diffCheck) {
        diffCheck.checked = true;
        diffCheck.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (typeof window.toggleContFields === 'function') {
        window.toggleContFields(true);
      }

      // 2) sameAsCont 라디오 ('no')
      const sameContNo = document.querySelector('input[name="sameAsCont"][value="no"]');
      if (sameContNo) {
        sameContNo.checked = true;
        sameContNo.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (typeof window.copyFields === 'function') {
        window.copyFields('ins', 'cont', false);
      }

      // 3) sameAsBene 라디오 ('no')
      const sameBeneNo = document.querySelector('input[name="sameAsBene"][value="no"]');
      if (sameBeneNo) {
        sameBeneNo.checked = true;
        sameBeneNo.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (typeof window.copyFields === 'function') {
        window.copyFields('ins', 'bene', false);
      }
    } else {
      // 동일함 모드
      const diffCheck = document.getElementById('diffInsuredCont');
      if (diffCheck) {
        diffCheck.checked = false;
        diffCheck.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (typeof window.toggleContFields === 'function') {
        window.toggleContFields(false);
      }

      const sameContYes = document.querySelector('input[name="sameAsCont"][value="yes"]');
      if (sameContYes) {
        sameContYes.checked = true;
        sameContYes.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (typeof window.copyFields === 'function') {
        window.copyFields('ins', 'cont', true);
      }

      const sameBeneYes = document.querySelector('input[name="sameAsBene"][value="yes"]');
      if (sameBeneYes) {
        sameBeneYes.checked = true;
        sameBeneYes.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (typeof window.copyFields === 'function') {
        window.copyFields('ins', 'bene', true);
      }
    }

    // ========================================================
    // Step B: 피보험자(Person A) 필드 주입
    // ========================================================
    const finalInsName = document.getElementById('prev_ins_name')?.value.trim() || insured.name;
    const finalInsRrn = document.getElementById('prev_ins_rrn')?.value.replace(/[^0-9]/g, '').trim() || insured.rrn;
    const finalInsPhone = document.getElementById('prev_ins_phone')?.value.trim() || insured.phone;
    const finalInsAddress = document.getElementById('prev_ins_address')?.value.trim() || insured.address;

    setFieldValue('insName', finalInsName);
    setFieldValue('insRrn', finalInsRrn);
    if (finalInsRrn.length === 13) {
      setFieldValue('insRrn1', finalInsRrn.slice(0, 6));
      setFieldValue('insRrn2', finalInsRrn.slice(6));
    }
    setFieldValue('insPhone', finalInsPhone);
    setFieldValue('insAddress', finalInsAddress);
    setFieldValue('sigInsured_name', finalInsName);

    // ========================================================
    // Step C: 계약자 / 수익자(Person B) 필드 주입 (다를 때)
    // ========================================================
    const relation = window.crmPickerState.relation || '모';

    if (isDiff && contractor) {
      const finalContName = document.getElementById('prev_cont_name')?.value.trim() || contractor.name;
      const finalContRrn = document.getElementById('prev_cont_rrn')?.value.replace(/[^0-9]/g, '').trim() || contractor.rrn;
      const finalContPhone = document.getElementById('prev_cont_phone')?.value.trim() || contractor.phone;
      const finalContAddress = document.getElementById('prev_cont_address')?.value.trim() || contractor.address;
      const finalContRelation = document.getElementById('prev_cont_relation')?.value.trim() || relation;

      // 손해보험 계약자 필드
      setFieldValue('contName', finalContName);
      setFieldValue('contRrn', finalContRrn);
      if (finalContRrn.length === 13) {
        setFieldValue('contRrn1', finalContRrn.slice(0, 6));
        setFieldValue('contRrn2', finalContRrn.slice(6));
      }
      setFieldValue('contPhone', finalContPhone);
      setFieldValue('contAddress', finalContAddress);
      setFieldValue('contRelation', finalContRelation);
      setFieldValue('docAddress', finalContAddress);

      // 생명보험 수익자 필드
      setFieldValue('beneName', finalContName);
      setFieldValue('beneRrn', finalContRrn);
      if (finalContRrn.length === 13) {
        setFieldValue('beneRrn1', finalContRrn.slice(0, 6));
        setFieldValue('beneRrn2', finalContRrn.slice(6));
      }
      setFieldValue('benePhone', finalContPhone);
      setFieldValue('beneAddress', finalContAddress);
      setFieldValue('beneRelation', finalContRelation);

      // 서명인
      setFieldValue('sigClaimant_name', finalContName);
      setFieldValue('sigContractor_name', finalContName);
      setFieldValue('sigBeneficiary_name', finalContName);
    }

    // ========================================================
    // Step D: 보상안내 받으실 분 주입 (실제 돈 받는 주체 기준)
    // ========================================================
    const targetForMoney = (isDiff && contractor) ? contractor : insured;
    const finalGuideName = document.getElementById('prev_guideName')?.value.trim() || targetForMoney.name;
    const finalGuidePhone = document.getElementById('prev_guidePhone')?.value.trim() || targetForMoney.phone;
    const finalGuideRelation = document.getElementById('prev_guideRelation')?.value.trim() || (isDiff ? relation : '본인');

    setFieldValue('guideName', finalGuideName);
    setFieldValue('guidePhone', finalGuidePhone);
    setFieldValue('guideRelation', finalGuideRelation);

    // ========================================================
    // Step E: 보험금 수령 계좌 주입 (실제 돈 받는 주체 기준)
    // ========================================================
    const receiptType = window.crmPickerState.receiptType;
    const autoTransferEl = document.getElementById('autoTransfer');

    if (autoTransferEl) {
      if (receiptType === 'auto') {
        autoTransferEl.checked = true;
        autoTransferEl.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof window.toggleBankFields === 'function') {
          window.toggleBankFields(true);
        }
      } else {
        autoTransferEl.checked = false;
        autoTransferEl.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof window.toggleBankFields === 'function') {
          window.toggleBankFields(false);
        }
      }
    }

    if (receiptType === 'bank' || !autoTransferEl) {
      const bName = document.getElementById('prev_bankName')?.value.trim() || targetForMoney.bankName || '';
      const bOwner = document.getElementById('prev_bankOwner')?.value.trim() || targetForMoney.bankOwner || targetForMoney.name;
      const bAcc = document.getElementById('prev_bankAccount')?.value.trim() || targetForMoney.bankAccount || '';
      const bRrn = document.getElementById('prev_bankOwnerRrn')?.value.replace(/[^0-9]/g, '').trim() || targetForMoney.bankOwnerRrn || targetForMoney.rrn;
      const bRel = document.getElementById('prev_bankOwnerRel')?.value.trim() || (isDiff ? relation : '본인');

      if (bName) setFieldValue('bankName', bName);
      if (bOwner) setFieldValue('bankOwner', bOwner);
      if (bAcc) setFieldValue('bankAccount', bAcc);
      if (document.getElementById('bankOwnerRrn')) setFieldValue('bankOwnerRrn', bRrn);
      if (document.getElementById('bankOwnerRel')) setFieldValue('bankOwnerRel', bRel);
      if (document.getElementById('bankOwnerRelation')) setFieldValue('bankOwnerRelation', bRel);
    }

    // ========================================================
    // Step F: 반려동물 정보 주입 (펫보험 양식일 때만)
    // ========================================================
    if (insured.pets && insured.pets.length > 0) {
      const pIdx = window.crmPickerState.selectedPetIndex || 0;
      const chosenPet = insured.pets[pIdx] || insured.pets[0];
      setFieldValue('petName', chosenPet.name);
      setFieldValue('petBreed', chosenPet.breed);
      if (chosenPet.age) setFieldValue('petAge', chosenPet.age);
      if (chosenPet.chipNum) setFieldValue('petChipNum', chosenPet.chipNum);
    } else {
      const customPetName = document.getElementById('prev_petName')?.value.trim();
      const customPetBreed = document.getElementById('prev_petBreed')?.value.trim();
      if (customPetName) setFieldValue('petName', customPetName);
      if (customPetBreed) setFieldValue('petBreed', customPetBreed);
    }

    closeCustomerPicker();

    // 완료 토스트 노출
    if (isDiff && contractor) {
      showSuccessToast(`✨ 피보험자(${finalInsName}) 및 계약자/수익자(${contractor.name}) 정보가 완벽히 반영되었습니다!`);
    } else {
      showSuccessToast(`✨ 고객(${finalInsName}) 정보가 청구서에 성공적으로 반영되었습니다!`);
    }
  };

  function showSuccessToast(msg) {
    let toast = document.getElementById('crmSuccessToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'crmSuccessToast';
      toast.className = 'crm-success-toast';
      document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  // 8. Step 1 슬라이드 헤더 우측에 메인 버튼 부착 (루프 방지 완벽 가드)
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
          mainBtn.innerHTML = '✨ CRM 고객 불러오기';
          mainBtn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            window.openCustomerPicker('insured');
          };
          titleEl.appendChild(mainBtn);
        }
      }
    } finally {
      setTimeout(() => { isAttaching = false; }, 60);
    }
  }

  // 9. 코비 스타일 수평 스텝퍼 바 (1단계~4단계) 100% 보존
  function updateStepperBar() {
    try {
      const dynFlow = document.getElementById('step_dyn_flow');
      if (!dynFlow) return;

      let stepperWrap = document.getElementById('covyStepperBar');
      if (!stepperWrap) {
        stepperWrap = document.createElement('div');
        stepperWrap.id = 'covyStepperBar';
        stepperWrap.className = 'covy-style-stepper';
        dynFlow.parentNode.insertBefore(stepperWrap, dynFlow);
      }

      if (!dynFlow.classList.contains('active')) {
        stepperWrap.style.display = 'none';
        return;
      }

      const slides = document.querySelectorAll('#slides-container .app-slide');
      if (!slides || slides.length === 0) {
        stepperWrap.style.display = 'none';
        return;
      }

      let activeIdx = -1;
      slides.forEach((s, idx) => {
        if (s.classList.contains('active')) {
          activeIdx = idx;
        }
      });

      if (activeIdx === -1) {
        stepperWrap.style.display = 'none';
        return;
      }
      stepperWrap.style.display = '';

      const titles = [];
      slides.forEach((s, i) => {
        const titleEl = s.querySelector('.slide-title');
        let text = '';
        if (titleEl) {
          const clone = titleEl.cloneNode(true);
          const btnInTitle = clone.querySelector('#btnCrmPickerMain');
          if (btnInTitle) btnInTitle.remove();
          text = clone.innerText.replace(/^[0-9.]+s*/, '').trim();
        } else {
          text = '단계 ' + (i + 1);
        }

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

  // 10. 전용 스타일 주입
  function injectCustomStyles() {
    if (document.getElementById('crmPickerCustomStyles')) return;

    const style = document.createElement('style');
    style.id = 'crmPickerCustomStyles';
    style.innerHTML = `
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

      /* 2인 제어 콘솔 박스 */
      .crm-dual-role-card {
        background: #f8fafc;
        border: 1.5px solid #e2e8f0;
        border-radius: 16px;
        padding: 18px 20px;
        margin-bottom: 20px;
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
      }
      .crm-role-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .crm-role-row.column {
        flex-direction: column;
        align-items: stretch;
      }
      .crm-role-header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 8px;
      }
      .crm-role-divider {
        height: 1px;
        background: #e2e8f0;
        margin: 14px 0;
      }
      .crm-role-badge {
        font-size: 12px;
        font-weight: 800;
        padding: 4px 10px;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
      }
      .crm-role-badge.insured {
        background: #e0f2fe;
        color: #0369a1;
      }
      .crm-role-badge.contractor {
        background: #ecfdf5;
        color: #047857;
      }
      .crm-role-person-info {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
      }
      .crm-person-name {
        font-size: 15.5px;
        font-weight: 800;
        color: #0f172a;
      }
      .crm-person-sub {
        font-size: 13px;
        color: #64748b;
      }
      .crm-person-rrn {
        font-size: 12.5px;
        color: #94a3b8;
      }
      .crm-btn-change-person {
        font-size: 12px;
        font-weight: 700;
        color: #475569;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 4px 10px;
        cursor: pointer;
        transition: 0.15s;
      }
      .crm-btn-change-person:hover {
        background: #f1f5f9;
        color: #0f172a;
        border-color: #94a3b8;
      }

      /* 동일 vs 다름 라디오 알약 */
      .crm-diff-radio-group {
        display: flex;
        gap: 6px;
      }
      .crm-radio-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12.5px;
        font-weight: 700;
        padding: 6px 12px;
        border-radius: 20px;
        border: 1.5px solid #cbd5e1;
        background: #ffffff;
        color: #475569;
        cursor: pointer;
        transition: 0.2s;
      }
      .crm-radio-pill input {
        display: none;
      }
      .crm-radio-pill.active {
        background: #0284c7;
        color: #ffffff;
        border-color: #0284c7;
        box-shadow: 0 2px 8px rgba(2, 132, 199, 0.25);
      }

      /* 계약자 선택 박스 */
      .crm-contractor-select-area {
        margin-top: 10px;
        background: #ffffff;
        border: 1.5px dashed #059669;
        border-radius: 12px;
        padding: 12px 16px;
      }
      .crm-contractor-chosen-box {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .crm-btn-pick-contractor-empty {
        width: 100%;
        padding: 14px;
        background: #f0fdf4;
        border: 1.5px dashed #10b981;
        border-radius: 10px;
        color: #047857;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: 0.2s;
      }
      .crm-btn-pick-contractor-empty:hover {
        background: #dcfce7;
        border-color: #059669;
        transform: translateY(-1px);
      }

      /* 관계 선택 칩 */
      .crm-relation-picker-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px dashed #e2e8f0;
      }
      .crm-rel-label {
        font-size: 12.5px;
        font-weight: 700;
        color: #475569;
      }
      .crm-rel-chips {
        display: flex;
        gap: 6px;
      }
      .crm-rel-chip {
        font-size: 12px;
        font-weight: 700;
        padding: 4px 10px;
        border-radius: 6px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #334155;
        cursor: pointer;
        transition: 0.15s;
      }
      .crm-rel-chip:hover {
        background: #f1f5f9;
      }
      .crm-rel-chip.active {
        background: #047857;
        color: #ffffff;
        border-color: #047857;
      }
      .crm-role-tip-notice {
        font-size: 12px;
        color: #059669;
        font-weight: 600;
        margin-top: 8px;
      }
      .crm-same-notice {
        font-size: 12.5px;
        color: #0284c7;
        font-weight: 600;
        margin-top: 6px;
      }

      /* 리스트 영역 및 카드 */
      .crm-customer-card {
        padding: 14px 18px;
        border-bottom: 1px solid #f1f5f9;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .crm-customer-card:hover {
        background: #f8fbff;
      }
      .crm-card-left {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .crm-card-avatar {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
        color: #ffffff;
        font-size: 16px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .crm-card-name-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 3px;
      }
      .crm-card-name {
        font-size: 15px;
        font-weight: 800;
        color: #0f172a;
      }
      .crm-card-badge {
        font-size: 11.5px;
        font-weight: 600;
        background: #f1f5f9;
        color: #475569;
        padding: 2px 8px;
        border-radius: 12px;
      }
      .crm-card-meta {
        font-size: 12.5px;
        color: #64748b;
      }
      .crm-card-select-btn {
        font-size: 12.5px;
        font-weight: 700;
        color: #0284c7;
        background: #e0f2fe;
        border: none;
        padding: 6px 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: 0.15s;
      }
      .crm-customer-card:hover .crm-card-select-btn {
        background: #0284c7;
        color: #ffffff;
      }

      /* 미리보기 카드 섹션 */
      .crm-fill-section-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 16px;
        margin-bottom: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.03);
      }
      .crm-fill-section-card.highlight {
        border-color: #a7f3d0;
        background: #fcfdfd;
      }
      .crm-section-title {
        font-size: 13.5px;
        font-weight: 800;
        color: #1e293b;
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }
      .crm-section-num {
        width: 20px;
        height: 20px;
        background: #0284c7;
        color: #fff;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
      }
      .crm-section-badge {
        font-size: 11.5px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 6px;
        background: #f1f5f9;
        color: #0284c7;
      }
      .crm-section-badge.green {
        background: #ecfdf5;
        color: #047857;
      }
      .crm-fill-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px 14px;
      }
      .crm-fill-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .crm-fill-item.full {
        grid-column: 1 / -1;
      }
      .crm-fill-label {
        font-size: 11.5px;
        font-weight: 700;
        color: #64748b;
      }
      .crm-inline-input {
        width: 100%;
        padding: 8px 10px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        font-size: 13.5px;
        color: #1e293b;
        background: #f8fafc;
        box-sizing: border-box;
      }
      .crm-inline-input:focus {
        background: #ffffff;
        border-color: #0284c7;
        outline: none;
      }

      .crm-radio-choice-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: #f8fafc;
        padding: 12px;
        border-radius: 10px;
        border: 1px solid #e2e8f0;
      }
      .crm-radio-label {
        font-size: 13px;
        color: #334155;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
      }

      /* 펫 라디오 아이템 */
      .crm-pet-list-wrap {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .crm-pet-select-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        background: #f8fafc;
        border: 1.5px solid #e2e8f0;
        border-radius: 12px;
        cursor: pointer;
        transition: 0.2s;
      }
      .crm-pet-select-item.selected {
        background: #f0f9ff;
        border-color: #0284c7;
      }
      .crm-pet-badge {
        font-size: 11px;
        font-weight: 800;
        background: #0284c7;
        color: #ffffff;
        padding: 2px 6px;
        border-radius: 4px;
        margin-right: 4px;
      }
      .crm-pet-name-line {
        font-size: 14px;
        color: #0f172a;
        margin-bottom: 2px;
      }
      .crm-pet-sub-meta {
        font-size: 12px;
        color: #64748b;
      }

      /* 푸터 영역 */
      .crm-preview-footer {
        padding: 14px 20px;
        background: #ffffff;
        border-top: 1px solid #e2e8f0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .crm-btn-back {
        padding: 10px 18px;
        font-size: 13.5px;
        font-weight: 700;
        color: #64748b;
        background: #f1f5f9;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        transition: 0.2s;
      }
      .crm-btn-back:hover {
        background: #e2e8f0;
        color: #1e293b;
      }
      .crm-btn-apply {
        flex: 1;
        padding: 12px 20px;
        font-size: 14.5px;
        font-weight: 800;
        color: #ffffff;
        background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
        border: none;
        border-radius: 12px;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
        transition: 0.2s;
      }
      .crm-btn-apply:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 18px rgba(2, 132, 199, 0.45);
      }

      /* 성공 토스트 알림창 */
      .crm-success-toast {
        position: fixed;
        top: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(-20px);
        background: rgba(15, 23, 42, 0.94);
        color: #ffffff;
        padding: 14px 28px;
        border-radius: 30px;
        font-size: 14.5px;
        font-weight: 700;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        opacity: 0;
        pointer-events: none;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 10001;
      }
      .crm-success-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    `;
    document.head.appendChild(style);
  }

  // 11. URL 파라미터 자동 입력 연동
  let hasAutoFilledUrlParams = false;
  function autoFillFromUrlParams() {
    try {
      const params = new URLSearchParams(window.location.search);
      const name = params.get('client_name') || params.get('name') || '';
      const phone = params.get('client_phone') || params.get('phone') || '';
      const jumin = params.get('client_jumin') || params.get('jumin') || params.get('rrn') || '';
      const comp = params.get('insurance_company') || params.get('company') || '';

      if (!name && !phone && !jumin && !comp) return;

      if (comp) {
        const compSelect = document.getElementById('companySelect');
        if (compSelect && compSelect.options.length > 0) {
          for (let i = 0; i < compSelect.options.length; i++) {
            const optVal = compSelect.options[i].value || compSelect.options[i].text;
            if (optVal && (optVal.includes(comp) || comp.includes(optVal))) {
              compSelect.selectedIndex = i;
              if (typeof window.checkFaxRequirement === 'function') {
                window.checkFaxRequirement();
              }
              break;
            }
          }
        }
      }

      function setVal(id, v) {
        const el = document.getElementById(id);
        if (el && v) {
          el.value = v;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      if (name) setVal('insName', name);
      if (phone) setVal('insPhone', phone);
      if (jumin) setVal('insRrn', jumin);

      hasAutoFilledUrlParams = true;
    } catch (e) {
      console.warn('[CRM Picker] URL 파라미터 자동 입력 처리 중 예외:', e);
    }
  }

  // 12. 돔 변경 감시 및 초기화 (무한 루프 방지 철통 가드)
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
        if (!hasAutoFilledUrlParams) {
          autoFillFromUrlParams();
        }
      } finally {
        setTimeout(() => { isObserverUpdating = false; }, 80);
      }
    });

    observer.observe(targetNode, { childList: true, subtree: true });
    attachButtonsToForm();
    updateStepperBar();
    autoFillFromUrlParams();

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
    document.addEventListener('DOMContentLoaded', initObserver);
  } else {
    initObserver();
  }

  // 전역 노출
  window.attachCustomerPickerButtons = attachButtonsToForm;
  window.updateStepperBar = updateStepperBar;
  window.autoFillFromUrlParams = autoFillFromUrlParams;

})();
