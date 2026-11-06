/**
 * customer_picker.js - CRM 고객 정보 불러오기 및 청구서 폼 연동 모듈 (고도화 버전)
 * 
 * [주요 기능]
 * 1. Step 1 슬라이드 헤더("1. 피보험자/수익자 정보") 우측에 대표 메인 버튼 배치
 * 2. 현재 선택된 보험사 입력폼 필드 실시간 감지:
 *    - 보상/안내받으실 분 (guideName, guidePhone, guideRelation)
 *    - 자동이체 수령 체크 (autoTransfer) vs 계좌 직접 입력 (bankName, bankAccount, bankOwner)
 *    - 예금주 주민번호 (bankOwnerRrn) 및 관계 (bankOwnerRel)
 *    - 펫보험 반려동물 정보 (petName, petBreed) 및 다견/다묘 선택 UI
 * 3. 2단계 프리뷰 화면에서 채워질 항목 리스트를 깔끔한 카드로 시각화
 * 4. [폼에 즉시 반영하기] 클릭 시 입력폼에 데이터 일괄 주입 후 청구 입력폼 화면으로 복귀
 */

(function () {
  'use strict';

  // 전역 상태 관리
  window.crmPickerState = {
    customers: [],
    targetType: 'main', // 'main' (통합 고객 불러오기)
    selectedCustomer: null,
    previewData: null,
    searchKeyword: '',
    selectedPetIndex: 0,
    receiptType: 'auto' // 'auto' (자동이체 수령) 또는 'bank' (계좌 직접입력)
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
      console.warn('[CustomerPicker] 로컬 캐시 로드 실패:', e);
    }

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'requestSyncData' }, '*');
      }
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'requestSyncData' }, '*');
      }
    } catch (e) {}

    window.addEventListener('message', function (event) {
      if (event.data && event.data.type === 'syncData') {
        const data = event.data.data || [];
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

    const name = String(client['고객명'] || client['대표자명'] || client['이름'] || '').trim();

    let rawJumin = String(client['주민번호'] || client['주민등록번호'] || '').trim();
    let cleanJumin = rawJumin.replace(/[^0-9]/g, '');

    let rawPhone = String(client['폰번호'] || client['연락처'] || client['휴대전화'] || '').trim();
    let cleanPhone = rawPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length === 11) {
      cleanPhone = cleanPhone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    } else if (cleanPhone.length === 10) {
      cleanPhone = cleanPhone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    }

    const address = String(client['주소'] || client['자택주소'] || '').trim();
    const job = String(client['직업'] || client['상세업무'] || '').trim();

    // 계좌 정보 탐색
    let bankName = String(client['은행명'] || client['차_은행명'] || '').trim();
    let bankAccount = String(client['계좌번호'] || client['차_계좌번호'] || '').trim();
    let bankOwner = name;

    const insList = client['보험가입리스트'] || client['가입내역'] || [];
    if (Array.isArray(insList)) {
      for (let i = 0; i < insList.length; i++) {
        const item = insList[i];
        if (item && (item['은행명'] || item['계좌번호'])) {
          if (!bankName && item['은행명']) bankName = String(item['은행명']).trim();
          if (!bankAccount && item['계좌번호']) bankAccount = String(item['계좌번호']).trim();
        }
      }
    }

    // 반려동물 목록 탐색 및 다견/다묘 분리 파싱
    const pets = [];
    const petBreedRaw = String(client['반려동물'] || '').trim();
    const petNameRaw = String(client['동물이름'] || '').trim();
    const petCodeRaw = String(client['코드'] || '').trim();

    if (petNameRaw || (petBreedRaw && petBreedRaw !== '해당없음' && petBreedRaw !== '-')) {
      const names = petNameRaw.split(/[,/&+\n]+/).map(s => s.trim()).filter(Boolean);
      const breeds = petBreedRaw.split(/[,/&+\n]+/).map(s => s.trim()).filter(s => s && s !== '해당없음' && s !== '-');
      const codes = petCodeRaw.split(/[,/&+\n]+/).map(s => s.trim()).filter(Boolean);

      const maxLen = Math.max(names.length, breeds.length, 1);
      for (let i = 0; i < maxLen; i++) {
        const pName = names[i] || names[0] || '반려동물';
        const pBreed = breeds[i] || breeds[0] || '품종미상';
        const pCode = codes[i] || codes[0] || '';
        pets.push({ name: pName, breed: pBreed, code: pCode });
      }
    }

    return {
      name,
      rrn: cleanJumin,
      phone: cleanPhone,
      address,
      job,
      bankName,
      bankAccount,
      bankOwner,
      bankOwnerRrn: cleanJumin,
      pets
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
            <div class="crm-preview-scroll" id="crmPreviewScroll">
              <!-- 동적으로 렌더링되는 채워질 항목 리스트 -->
            </div>
            
            <div class="crm-preview-footer">
              <button type="button" class="crm-btn-back" onclick="backToCustomerList()">← 다른 고객 선택</button>
              <button type="button" class="crm-btn-apply" onclick="confirmAndApplyCustomerData()">✨ 폼에 즉시 반영하기</button>
            </div>
          </div>

        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // 모달 배경 클릭 시 닫기
    const backdrop = document.getElementById('crmPickerModal');
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) {
        closeCustomerPicker();
      }
    });

    // ESC 키로 닫기
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isModalOpen()) {
        closeCustomerPicker();
      }
    });

    injectCustomStyles();
  }

  // 4. 모달 열기/닫기 및 스텝 전환
  window.openCustomerPicker = function (targetType) {
    ensureModalDom();
    if (!window.crmPickerState.customers || window.crmPickerState.customers.length === 0) {
      initDataSync();
    }
    window.crmPickerState.targetType = targetType || 'main';
    window.crmPickerState.selectedCustomer = null;
    window.crmPickerState.previewData = null;
    window.crmPickerState.searchKeyword = '';
    window.crmPickerState.selectedPetIndex = 0;

    const modal = document.getElementById('crmPickerModal');
    if (!modal) return;

    modal.classList.add('show');
    switchStep(1);

    const searchInput = document.getElementById('crmSearchInput');
    if (searchInput) {
      searchInput.value = '';
      setTimeout(() => searchInput.focus(), 100);
    }

    renderCustomerList();

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'requestSyncData' }, '*');
      }
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'requestSyncData' }, '*');
      }
    } catch (e) {}
  };

  window.closeCustomerPicker = function () {
    const modal = document.getElementById('crmPickerModal');
    if (modal) {
      modal.classList.remove('show');
    }
  };

  function isModalOpen() {
    const modal = document.getElementById('crmPickerModal');
    return modal && modal.classList.contains('show');
  }

  function switchStep(stepNum) {
    const s1 = document.getElementById('crmPickerStep1');
    const s2 = document.getElementById('crmPickerStep2');
    if (stepNum === 1) {
      if (s1) s1.classList.add('active');
      if (s2) s2.classList.remove('active');
      document.getElementById('crmModalTitle').innerText = 'CRM 고객 정보 불러오기';
      document.getElementById('crmModalSub').innerText = '고객을 선택하면 청구서 폼에 채워질 데이터 목록이 표시됩니다.';
    } else {
      if (s1) s1.classList.remove('active');
      if (s2) s2.classList.add('active');
      document.getElementById('crmModalTitle').innerText = '청구서 반영 데이터 확인';
      document.getElementById('crmModalSub').innerText = '아래 리스트의 정보가 현재 보험사 입력폼에 자동으로 채워집니다.';
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
    const listEl = document.getElementById('crmCustomerList');
    if (!listEl) return;

    let customers = window.crmPickerState.customers || window.claimCustomerData || [];
    const keyword = window.crmPickerState.searchKeyword;

    if (!Array.isArray(customers) || customers.length === 0) {
      listEl.innerHTML = `
        <div class="crm-empty-state">
          <div class="crm-empty-icon">📂</div>
          <p class="crm-empty-title">불러올 수 있는 CRM 고객 데이터가 없습니다.</p>
          <p class="crm-empty-desc">CRM 메인 화면에서 로그인 후 고객 데이터를 로드한 뒤 다시 시도해 주세요.</p>
        </div>
      `;
      return;
    }

    let filtered = customers;
    if (keyword) {
      filtered = customers.filter(c => {
        const name = String(c['고객명'] || c['대표자명'] || c['이름'] || '').toLowerCase();
        const phone = String(c['폰번호'] || c['연락처'] || c['휴대전화'] || '').replace(/[^0-9]/g, '');
        const jumin = String(c['주민번호'] || c['주민등록번호'] || '').replace(/[^0-9]/g, '');
        const cleanKw = keyword.replace(/[^0-9a-zA-Z가-힣]/g, '');
        return name.includes(keyword) || phone.includes(cleanKw) || jumin.includes(cleanKw);
      });
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="crm-empty-state">
          <div class="crm-empty-icon">🔍</div>
          <p class="crm-empty-title">'${keyword}' 검색 결과가 없습니다.</p>
          <p class="crm-empty-desc">다른 이름이나 전화번호로 다시 검색해 보세요.</p>
        </div>
      `;
      return;
    }

    window._filteredCustomerPool = filtered;

    let html = '';
    filtered.forEach((client, idx) => {
      const sanitized = sanitizeCustomer(client);
      const juminMasked = sanitized.rrn.length >= 7
        ? sanitized.rrn.slice(0, 6) + '-' + sanitized.rrn.slice(6, 7) + '******'
        : sanitized.rrn || '-';
      const phoneDisplay = sanitized.phone || '-';
      const petSummary = sanitized.pets.length > 0
        ? `🐾 반려동물 ${sanitized.pets.length}마리 (${sanitized.pets.map(p => p.name).join(', ')})`
        : '';

      html += `
        <div class="crm-customer-card" onclick="selectCustomerForPreview(${idx})">
          <div class="crm-card-header">
            <span class="crm-card-name">${sanitized.name || '(이름없음)'}</span>
            <span class="crm-card-jumin">${juminMasked}</span>
          </div>
          <div class="crm-card-details">
            <div class="crm-card-line">📞 ${phoneDisplay}</div>
            ${sanitized.address ? `<div class="crm-card-line">📍 ${sanitized.address}</div>` : ''}
            ${petSummary ? `<div class="crm-card-line" style="color:#0284c7; font-weight:600;">${petSummary}</div>` : ''}
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;
  }

  // 6. 고객 선택 및 "채워지는 부분 리스트" 미리보기 화면 렌더링
  window.selectCustomerForPreview = function (filteredIndex) {
    const list = window._filteredCustomerPool || window.crmPickerState.customers || [];
    const client = list[filteredIndex];
    if (!client) return;

    const sanitized = sanitizeCustomer(client);
    window.crmPickerState.selectedCustomer = client;
    window.crmPickerState.previewData = sanitized;
    window.crmPickerState.selectedPetIndex = 0;

    // 현재 폼(보험사)에 실제로 존재하는 필드들 실시간 감지
    const hasGuide = !!document.getElementById('guideName') || !!document.getElementById('guidePhone');
    const hasAutoTransfer = !!document.getElementById('autoTransfer');
    const hasBank = !!document.getElementById('bankName') || !!document.getElementById('bankAccount');
    const hasBankOwnerRrn = !!document.getElementById('bankOwnerRrn');
    const hasPet = !!document.getElementById('petName') || !!document.getElementById('petBreed');

    // 자동이체 기본값 설정
    window.crmPickerState.receiptType = hasAutoTransfer ? 'auto' : 'bank';

    renderPreviewListHtml(sanitized, {
      hasGuide,
      hasAutoTransfer,
      hasBank,
      hasBankOwnerRrn,
      hasPet
    });

    switchStep(2);
  };

  function renderPreviewListHtml(data, formCaps) {
    const scrollEl = document.getElementById('crmPreviewScroll');
    if (!scrollEl) return;

    let html = `
      <div class="crm-summary-header-box">
        <div class="crm-summary-badge">선택된 고객</div>
        <div class="crm-summary-client-name">${data.name} <span>(${data.phone || '연락처 없음'})</span></div>
        <div class="crm-summary-desc">현재 선택하신 보험사 양식에 맞추어 아래 항목들이 자동으로 채워집니다.</div>
      </div>
    `;

    // 1. 피보험자 인적사항 섹션
    html += `
      <div class="crm-fill-section-card">
        <div class="crm-section-title">
          <span class="crm-section-num">1</span>
          <span>피보험자(치료받으신 분) 인적사항</span>
        </div>
        <div class="crm-fill-grid">
          <div class="crm-fill-item">
            <span class="crm-fill-label">성명</span>
            <input type="text" id="prev_name" class="crm-inline-input" value="${data.name}">
          </div>
          <div class="crm-fill-item">
            <span class="crm-fill-label">주민등록번호 (13자리)</span>
            <input type="text" id="prev_rrn" class="crm-inline-input" value="${data.rrn}" maxlength="13">
          </div>
          <div class="crm-fill-item">
            <span class="crm-fill-label">휴대전화번호</span>
            <input type="text" id="prev_phone" class="crm-inline-input" value="${data.phone}">
          </div>
          <div class="crm-fill-item">
            <span class="crm-fill-label">자택 주소</span>
            <input type="text" id="prev_address" class="crm-inline-input" value="${data.address}">
          </div>
        </div>
      </div>
    `;

    // 2. 보상안내받으실 분 섹션 (해당 입력폼이 있는 회사인 경우)
    if (formCaps.hasGuide) {
      html += `
        <div class="crm-fill-section-card">
          <div class="crm-section-title">
            <span class="crm-section-num">2</span>
            <span>보상 안내받으실 분 정보</span>
            <span class="crm-section-badge">해당 보험사 필수 항목</span>
          </div>
          <div class="crm-fill-grid">
            <div class="crm-fill-item">
              <span class="crm-fill-label">안내받으실 분 성명</span>
              <input type="text" id="prev_guideName" class="crm-inline-input" value="${data.name}">
            </div>
            <div class="crm-fill-item">
              <span class="crm-fill-label">안내 연락처</span>
              <input type="text" id="prev_guidePhone" class="crm-inline-input" value="${data.phone}">
            </div>
            <div class="crm-fill-item">
              <span class="crm-fill-label">피보험자와의 관계</span>
              <input type="text" id="prev_guideRelation" class="crm-inline-input" value="본인">
            </div>
          </div>
        </div>
      `;
    }

    // 3. 보험금 수령 / 자동이체 설정 섹션
    if (formCaps.hasAutoTransfer || formCaps.hasBank) {
      html += `
        <div class="crm-fill-section-card">
          <div class="crm-section-title">
            <span class="crm-section-num">${formCaps.hasGuide ? '3' : '2'}</span>
            <span>보험금 수령 방법 및 계좌 정보</span>
          </div>
      `;

      // 자동이체 수령 체크박스가 있는 회사인 경우 라디오 옵션 제공
      if (formCaps.hasAutoTransfer) {
        html += `
          <div class="crm-radio-choice-group">
            <label class="crm-radio-label">
              <input type="radio" name="crmReceiptType" value="auto" checked onchange="toggleReceiptType('auto')">
              <span><strong>기존 보험료 납입 자동이체 계좌로 수령</strong> (서식에 '예'로 자동 체크, 계좌입력 생략)</span>
            </label>
            <label class="crm-radio-label">
              <input type="radio" name="crmReceiptType" value="bank" onchange="toggleReceiptType('bank')">
              <span><strong>다른 계좌로 직접 수령</strong> (은행/계좌번호 직접 입력)</span>
            </label>
          </div>
        `;
      }

      // 계좌 입력 영역
      const bankDisplay = formCaps.hasAutoTransfer ? 'none' : 'block';
      html += `
        <div id="crmBankDetailsWrap" style="display:${bankDisplay}; margin-top:12px;">
          <div class="crm-fill-grid">
            <div class="crm-fill-item">
              <span class="crm-fill-label">은행명</span>
              <input type="text" id="prev_bankName" class="crm-inline-input" value="${data.bankName}" placeholder="예: 신한은행">
            </div>
            <div class="crm-fill-item">
              <span class="crm-fill-label">예금주</span>
              <input type="text" id="prev_bankOwner" class="crm-inline-input" value="${data.bankOwner || data.name}">
            </div>
            <div class="crm-fill-item" style="grid-column: 1 / -1;">
              <span class="crm-fill-label">계좌번호</span>
              <input type="text" id="prev_bankAccount" class="crm-inline-input" value="${data.bankAccount}" placeholder="숫자만 입력">
            </div>
      `;

      // 예금주 주민번호 요구 회사인 경우 추가 필드 노출
      if (formCaps.hasBankOwnerRrn) {
        html += `
            <div class="crm-fill-item">
              <span class="crm-fill-label">예금주 주민등록번호 (13자리)</span>
              <input type="text" id="prev_bankOwnerRrn" class="crm-inline-input" value="${data.bankOwnerRrn}" maxlength="13">
            </div>
            <div class="crm-fill-item">
              <span class="crm-fill-label">예금주와 피보험자 관계</span>
              <input type="text" id="prev_bankOwnerRel" class="crm-inline-input" value="본인">
            </div>
        `;
      }

      html += `
          </div>
        </div>
      </div>
      `;
    }

    // 4. 반려동물 정보 섹션 (펫보험 탭인 경우)
    if (formCaps.hasPet) {
      const petSecNum = (formCaps.hasGuide ? 1 : 0) + (formCaps.hasAutoTransfer || formCaps.hasBank ? 1 : 0) + 2;
      html += `
        <div class="crm-fill-section-card">
          <div class="crm-section-title">
            <span class="crm-section-num">${petSecNum}</span>
            <span>🐾 반려동물 정보 (청구 대상)</span>
            <span class="crm-section-badge">펫보험</span>
          </div>
      `;

      if (data.pets.length > 1) {
        html += `<p style="font-size:13px; color:#475569; margin: 0 0 10px 0; font-weight:600;">등록된 반려동물이 여러 마리입니다. 청구할 반려동물을 선택해주세요:</p>`;
        data.pets.forEach((pet, pIdx) => {
          html += `
            <label class="crm-pet-select-item">
              <input type="radio" name="crmSelectedPet" value="${pIdx}" ${pIdx === 0 ? 'checked' : ''} onchange="onSelectPetChoice(${pIdx})">
              <div class="crm-pet-info-box">
                <span class="crm-pet-name">${pet.name}</span>
                <span class="crm-pet-sub">${pet.breed} ${pet.code ? ' / 등록코드: ' + pet.code : ''}</span>
              </div>
            </label>
          `;
        });
      } else if (data.pets.length === 1) {
        const pet = data.pets[0];
        html += `
          <div class="crm-fill-grid">
            <div class="crm-fill-item">
              <span class="crm-fill-label">반려동물 이름</span>
              <input type="text" id="prev_petName" class="crm-inline-input" value="${pet.name}">
            </div>
            <div class="crm-fill-item">
              <span class="crm-fill-label">품종</span>
              <input type="text" id="prev_petBreed" class="crm-inline-input" value="${pet.breed}">
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="crm-fill-grid">
            <div class="crm-fill-item">
              <span class="crm-fill-label">반려동물 이름</span>
              <input type="text" id="prev_petName" class="crm-inline-input" placeholder="이름 직접 입력">
            </div>
            <div class="crm-fill-item">
              <span class="crm-fill-label">품종</span>
              <input type="text" id="prev_petBreed" class="crm-inline-input" placeholder="품종 직접 입력">
            </div>
          </div>
        `;
      }

      html += `</div>`;
    }

    scrollEl.innerHTML = html;
  }

  // 수령 방식 토글 (자동이체 vs 계좌입력)
  window.toggleReceiptType = function (type) {
    window.crmPickerState.receiptType = type;
    const wrap = document.getElementById('crmBankDetailsWrap');
    if (wrap) {
      wrap.style.display = type === 'bank' ? 'block' : 'none';
    }
  };

  // 반려동물 선택 변경
  window.onSelectPetChoice = function (pIdx) {
    window.crmPickerState.selectedPetIndex = pIdx;
  };

  // 7. 데이터 최종 승인 및 폼 주입 ("폼에 반영하기" 버튼 클릭 시)
  window.confirmAndApplyCustomerData = function () {
    const finalName = document.getElementById('prev_name')?.value.trim() || '';
    let finalRrn = document.getElementById('prev_rrn')?.value.replace(/[^0-9]/g, '').trim() || '';
    const finalPhone = document.getElementById('prev_phone')?.value.trim() || '';
    const finalAddress = document.getElementById('prev_address')?.value.trim() || '';

    if (!finalName) {
      alert('성명을 입력해 주세요.');
      return;
    }

    if (finalRrn.length > 0 && finalRrn.length !== 13) {
      const proceed = confirm('주민등록번호가 13자리가 아닙니다. 그대로 진행하시겠습니까?');
      if (!proceed) return;
    }

    // 값 주입 헬퍼 함수
    function setFieldValue(fieldId, value) {
      const el = document.getElementById(fieldId);
      if (el && value !== undefined && value !== null) {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // 1. 피보험자 정보 주입
    setFieldValue('insName', finalName);
    setFieldValue('insRrn', finalRrn);
    setFieldValue('insPhone', finalPhone);
    setFieldValue('insAddress', finalAddress);

    // 2. 보상안내받으실 분 주입
    const guideName = document.getElementById('prev_guideName')?.value.trim() || finalName;
    const guidePhone = document.getElementById('prev_guidePhone')?.value.trim() || finalPhone;
    const guideRelation = document.getElementById('prev_guideRelation')?.value.trim() || '본인';
    setFieldValue('guideName', guideName);
    setFieldValue('guidePhone', guidePhone);
    setFieldValue('guideRelation', guideRelation);

    // 3. 보험금 수령 / 자동이체 처리
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

    // 계좌 입력 방식이거나 autoTransfer가 없는 보험사인 경우 계좌정보 주입
    if (receiptType === 'bank' || !autoTransferEl) {
      const bName = document.getElementById('prev_bankName')?.value.trim() || '';
      const bOwner = document.getElementById('prev_bankOwner')?.value.trim() || finalName;
      const bAcc = document.getElementById('prev_bankAccount')?.value.trim() || '';
      if (bName) setFieldValue('bankName', bName);
      if (bOwner) setFieldValue('bankOwner', bOwner);
      if (bAcc) setFieldValue('bankAccount', bAcc);

      // 예금주 주민번호 & 관계
      const bRrn = document.getElementById('prev_bankOwnerRrn')?.value.replace(/[^0-9]/g, '').trim() || finalRrn;
      const bRel = document.getElementById('prev_bankOwnerRel')?.value.trim() || '본인';
      if (document.getElementById('bankOwnerRrn')) setFieldValue('bankOwnerRrn', bRrn);
      if (document.getElementById('bankOwnerRel')) setFieldValue('bankOwnerRel', bRel);
    }

    // 4. 반려동물 정보 주입 (다견/다묘 선택 반영)
    const previewData = window.crmPickerState.previewData;
    if (previewData && previewData.pets && previewData.pets.length > 0) {
      const pIdx = window.crmPickerState.selectedPetIndex || 0;
      const chosenPet = previewData.pets[pIdx] || previewData.pets[0];
      setFieldValue('petName', chosenPet.name);
      setFieldValue('petBreed', chosenPet.breed);
    } else {
      const customPetName = document.getElementById('prev_petName')?.value.trim();
      const customPetBreed = document.getElementById('prev_petBreed')?.value.trim();
      if (customPetName) setFieldValue('petName', customPetName);
      if (customPetBreed) setFieldValue('petBreed', customPetBreed);
    }

    // 모달 닫기
    closeCustomerPicker();

    // 완료 알림 토스트
    showSuccessToast(`✅ CRM 고객(${finalName}) 정보가 폼에 성공적으로 반영되었습니다.`);
  };

  // 성공 토스트 UI
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
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }

  // 8. Step 1 슬라이드 헤더 우측에 단일 메인 버튼 부착
  function attachButtonsToForm() {
    // 기존 입력칸 옆 조그만 개별 버튼 제거
    document.querySelectorAll('.btn-picker-trigger').forEach(el => el.remove());

    // Step 1 슬라이드 헤더 탐색
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
        mainBtn.innerHTML = `👤 CRM 고객정보 불러오기`;
        mainBtn.onclick = function (e) {
          e.preventDefault();
          window.openCustomerPicker('main');
        };

        titleEl.appendChild(mainBtn);
      }
    }

    // 하단 고정 바에 [이전] 버튼 부착
    const bottomNav = document.getElementById('bottomNav');
    if (bottomNav && !document.getElementById('prevBtn')) {
      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.id = 'prevBtn';
      prevBtn.className = 'btn-prev';
      prevBtn.innerText = '이전';
      prevBtn.onclick = function (e) {
        e.preventDefault();
        if (typeof goBack === 'function') goBack();
      };
      const nextBtn = document.getElementById('nextBtn');
      if (nextBtn) {
        bottomNav.insertBefore(prevBtn, nextBtn);
      } else {
        bottomNav.appendChild(prevBtn);
      }
    }
  }

  // 9. 전용 스타일 주입
  function injectCustomStyles() {
    if (document.getElementById('crmPickerCustomStyles')) return;
    const style = document.createElement('style');
    style.id = 'crmPickerCustomStyles';
    style.innerHTML = `
      .btn-picker-main {
        background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
        color: #ffffff;
        font-size: 13.5px;
        font-weight: 700;
        padding: 8px 16px;
        border-radius: 10px;
        border: none;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);
        transition: all 0.2s ease;
      }
      .btn-picker-main:hover {
        background: linear-gradient(135deg, #0369a1 0%, #075985 100%);
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(2, 132, 199, 0.35);
      }

      .crm-summary-header-box {
        background: #f0f9ff;
        border: 1px solid #bae6fd;
        border-radius: 14px;
        padding: 16px;
        margin-bottom: 16px;
      }
      .crm-summary-badge {
        font-size: 11px;
        font-weight: 800;
        color: #0284c7;
        background: #e0f2fe;
        display: inline-block;
        padding: 2px 8px;
        border-radius: 6px;
        margin-bottom: 6px;
      }
      .crm-summary-client-name {
        font-size: 18px;
        font-weight: 800;
        color: #0c4a6e;
      }
      .crm-summary-client-name span {
        font-size: 14px;
        font-weight: 500;
        color: #64748b;
        margin-left: 6px;
      }
      .crm-summary-desc {
        font-size: 12.5px;
        color: #475569;
        margin-top: 6px;
      }

      .crm-fill-section-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 16px;
        margin-bottom: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.03);
      }
      .crm-section-title {
        font-size: 14px;
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
        font-size: 11px;
        color: #0284c7;
        background: #e0f2fe;
        padding: 2px 8px;
        border-radius: 6px;
        margin-left: auto;
      }

      .crm-fill-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .crm-fill-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
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

      .crm-pet-select-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .crm-pet-select-item:hover {
        background: #f0f9ff;
        border-color: #bae6fd;
      }
      .crm-pet-info-box {
        display: flex;
        flex-direction: column;
      }
      .crm-pet-name {
        font-size: 14px;
        font-weight: 800;
        color: #0f172a;
      }
      .crm-pet-sub {
        font-size: 12px;
        color: #64748b;
      }

      .crm-success-toast {
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: rgba(15, 23, 42, 0.92);
        color: #ffffff;
        padding: 12px 24px;
        border-radius: 30px;
        font-size: 14px;
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

  // 10. URL 파라미터 자동 입력 연동 유지
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
        if (el && v && (!el.value || el.value.trim() === '')) {
          el.value = v;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      setVal('insName', name);
      setVal('insPhone', phone);
      setVal('insRrn', jumin.replace(/[^0-9]/g, ''));
    } catch (e) {
      console.warn('[CustomerPicker] autoFillFromUrlParams 에러:', e);
    }
  }

  // 11. 돔 변경 감시 및 초기화
  function initObserver() {
    const observer = new MutationObserver(function () {
      const slide0 = document.getElementById('slide_0');
      if (slide0) {
        const titleEl = slide0.querySelector('.slide-title');
        if (titleEl && !titleEl.querySelector('#btnCrmPickerMain')) {
          attachButtonsToForm();
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initDataSync();
    attachButtonsToForm();
    initObserver();
    autoFillFromUrlParams();
  });

  // 전역 함수 노출
  window.attachCustomerPickerButtons = attachButtonsToForm;
  window.autoFillFromUrlParams = autoFillFromUrlParams;

})();
