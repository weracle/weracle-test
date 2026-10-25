/**
 * customer_picker.js - CRM 고객 정보 불러오기 및 청구서 폼 연동 모듈
 * 대상: 피보험자 / 계약자 인적사항 안전 매핑 및 데이터 정제기
 * 무결성 보장: 61개 보험사 PDF 좌표 매핑과 독립적으로 작동
 */

(function () {
  'use strict';

  // 전역 상태 관리
  window.crmPickerState = {
    customers: [],
    targetType: 'ins', // 'ins' (피보험자) 또는 'cont' (계약자)
    selectedCustomer: null,
    previewData: null,
    searchKeyword: ''
  };

  // 1. 데이터 수신 및 로컬 캐시 동기화
  function initDataSync() {
    // 로컬 스토리지 캐시 로드
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

    // 부모 창 및 오프너 창에 데이터 동기화 요청
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'requestSyncData' }, '*');
      }
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'requestSyncData' }, '*');
      }
    } catch (e) {}

    // postMessage 수신 리스너
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

  // 2. 데이터 정제기 (Data Sanitizer)
  function sanitizeCustomer(client) {
    if (!client) return null;

    // 이름 추출
    const name = String(client['고객명'] || client['대표자명'] || client['이름'] || '').trim();

    // 주민등록번호 추출 및 숫자 13자리 정제
    let rawJumin = String(client['주민번호'] || client['주민등록번호'] || '').trim();
    let cleanJumin = rawJumin.replace(/[^0-9]/g, '');

    // 연락처 추출 및 숫자 정제
    let rawPhone = String(client['폰번호'] || client['연락처'] || client['휴대전화'] || '').trim();
    let cleanPhone = rawPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length === 11) {
      cleanPhone = cleanPhone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    } else if (cleanPhone.length === 10) {
      cleanPhone = cleanPhone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    }

    // 주소 추출
    const address = String(client['주소'] || client['자택주소'] || '').trim();

    // 직업/상세업무
    const job = String(client['직업'] || client['상세업무'] || '').trim();

    // 보험관리 가입내역에서 계좌 정보 탐색
    let bankName = '';
    let bankAccount = '';
    let bankOwner = name;

    const insList = client['보험가입리스트'] || client['가입내역'] || [];
    if (Array.isArray(insList)) {
      for (let i = 0; i < insList.length; i++) {
        const item = insList[i];
        if (item && (item['은행명'] || item['계좌번호'])) {
          bankName = String(item['은행명'] || '').trim();
          bankAccount = String(item['계좌번호'] || '').trim().replace(/[^0-9-]/g, '');
          if (item['예금주']) bankOwner = String(item['예금주']).trim();
          break;
        }
      }
    }

    if (!bankName && client['은행명']) bankName = String(client['은행명']).trim();
    if (!bankAccount && client['계좌번호']) bankAccount = String(client['계좌번호']).trim().replace(/[^0-9-]/g, '');

    return {
      id: client['고객번호'] || client['ID'] || client['UID'] || '',
      name: name,
      rrn: cleanJumin,
      rawRrn: rawJumin,
      phone: cleanPhone,
      address: address,
      job: job,
      bankName: bankName,
      bankAccount: bankAccount,
      bankOwner: bankOwner,
      raw: client
    };
  }

  // 3. 모달 DOM 생성 및 주입
  function ensureModalDom() {
    if (document.getElementById('crmPickerModal')) return;

    const modalHtml = `
      <div id="crmPickerModal" class="crm-modal-backdrop">
        <div class="crm-modal-container">
          <div class="crm-modal-header">
            <div>
              <h3 class="crm-modal-title" id="crmModalTitle">CRM 고객 정보 불러오기</h3>
              <p class="crm-modal-sub" id="crmModalSub">고객을 선택하면 폼에 들어갈 데이터가 미리보기로 표시됩니다.</p>
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
            <div class="crm-preview-scroll">
              <div class="crm-preview-banner" id="crmPreviewBanner">
                선택한 고객의 정보가 입력 폼에 채워집니다.
              </div>
              <div class="crm-preview-group">
                <label class="crm-preview-label">성명</label>
                <input type="text" id="prev_name" class="crm-preview-input">
              </div>
              <div class="crm-preview-group">
                <label class="crm-preview-label">주민등록번호 (13자리 숫자)</label>
                <input type="text" id="prev_rrn" class="crm-preview-input" maxlength="13">
              </div>
              <div class="crm-preview-group">
                <label class="crm-preview-label">휴대전화번호</label>
                <input type="text" id="prev_phone" class="crm-preview-input">
              </div>
              <div class="crm-preview-group">
                <label class="crm-preview-label">거주지 주소</label>
                <input type="text" id="prev_address" class="crm-preview-input">
              </div>
              <div class="crm-preview-group">
                <label class="crm-preview-label">직업 / 상세업무</label>
                <input type="text" id="prev_job" class="crm-preview-input">
              </div>

              <!-- 계좌 정보 섹션 -->
              <div class="crm-preview-account-box" id="crmPreviewAccountBox">
                <label class="crm-account-check-label">
                  <input type="checkbox" id="prev_fillAccount" checked>
                  <span>보험금 수령 계좌 정보도 함께 채우기</span>
                </label>
                <div class="crm-preview-row-grid">
                  <div class="crm-preview-group" style="margin-bottom:0;">
                    <label class="crm-preview-label">은행명</label>
                    <input type="text" id="prev_bankName" class="crm-preview-input">
                  </div>
                  <div class="crm-preview-group" style="margin-bottom:0;">
                    <label class="crm-preview-label">예금주</label>
                    <input type="text" id="prev_bankOwner" class="crm-preview-input">
                  </div>
                </div>
                <div class="crm-preview-group" style="margin-top:8px; margin-bottom:0;">
                  <label class="crm-preview-label">계좌번호</label>
                  <input type="text" id="prev_bankAccount" class="crm-preview-input">
                </div>
              </div>
            </div>
            
            <div class="crm-preview-footer">
              <button type="button" class="crm-btn-back" onclick="backToCustomerList()">이전으로</button>
              <button type="button" class="crm-btn-apply" onclick="confirmAndApplyCustomerData()">확인 완료 - 폼에 입력</button>
            </div>
          </div>

        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  // 4. 모달 열기 및 닫기
  window.openCustomerPicker = function (targetType) {
    ensureModalDom();
    window.crmPickerState.targetType = targetType || 'ins';
    window.crmPickerState.selectedCustomer = null;
    window.crmPickerState.previewData = null;
    window.crmPickerState.searchKeyword = '';

    const titleEl = document.getElementById('crmModalTitle');
    const subEl = document.getElementById('crmModalSub');
    if (targetType === 'cont') {
      if (titleEl) titleEl.innerText = '계약자 정보 불러오기';
      if (subEl) subEl.innerText = '계약자(보험료 납입자)로 지정할 고객을 선택해 주세요.';
    } else {
      if (titleEl) titleEl.innerText = '피보험자 정보 불러오기';
      if (subEl) subEl.innerText = '치료받으신 분(피보험자)으로 지정할 고객을 선택해 주세요.';
    }

    const modal = document.getElementById('crmPickerModal');
    if (modal) {
      modal.classList.add('show');
    }

    switchStep(1);

    const searchInput = document.getElementById('crmSearchInput');
    if (searchInput) {
      searchInput.value = '';
      setTimeout(() => searchInput.focus(), 100);
    }

    renderCustomerList();
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
    if (!s1 || !s2) return;
    if (stepNum === 1) {
      s1.classList.add('active');
      s2.classList.remove('active');
    } else {
      s1.classList.remove('active');
      s2.classList.add('active');
    }
  }

  window.backToCustomerList = function () {
    switchStep(1);
  };

  // 5. 고객 검색 및 렌더링
  window.onCustomerSearchInput = function (val) {
    window.crmPickerState.searchKeyword = (val || '').trim().toLowerCase();
    renderCustomerList();
  };

  function renderCustomerList() {
    const listArea = document.getElementById('crmCustomerList');
    if (!listArea) return;

    let customers = window.crmPickerState.customers || window.claimCustomerData || [];
    const keyword = window.crmPickerState.searchKeyword;

    if (!Array.isArray(customers) || customers.length === 0) {
      listArea.innerHTML = `
        <div class="crm-empty-state">
          <p class="crm-empty-title">불러올 수 있는 고객 데이터가 없습니다.</p>
          <p class="crm-empty-desc">CRM 메인 화면에서 로그인 후 고객 데이터를 로드한 뒤 다시 시도해 주세요.</p>
        </div>
      `;
      return;
    }

    let filtered = customers;
    if (keyword) {
      filtered = customers.filter(c => {
        const name = String(c['고객명'] || c['대표자명'] || c['이름'] || '').toLowerCase();
        const phone = String(c['폰번호'] || c['연락처'] || '').replace(/[^0-9]/g, '');
        const jumin = String(c['주민번호'] || c['주민등록번호'] || '').replace(/[^0-9]/g, '');
        return name.includes(keyword) || phone.includes(keyword) || jumin.includes(keyword);
      });
    }

    if (filtered.length === 0) {
      listArea.innerHTML = `
        <div class="crm-empty-state">
          <p class="crm-empty-title">검색 결과가 없습니다.</p>
          <p class="crm-empty-desc">고객명이나 휴대폰 번호를 다시 확인해 주세요.</p>
        </div>
      `;
      return;
    }

    let html = '';
    filtered.slice(0, 50).forEach((client, idx) => {
      const sanitized = sanitizeCustomer(client);
      let maskedJumin = sanitized.rrn;
      if (maskedJumin && maskedJumin.length >= 7) {
        maskedJumin = maskedJumin.substring(0, 6) + '-' + maskedJumin.substring(6, 7) + '******';
      } else if (!maskedJumin) {
        maskedJumin = '주민번호 미등록';
      }

      html += `
        <div class="crm-customer-card" onclick="selectCustomerForPreview(${idx})">
          <div class="crm-card-header">
            <span class="crm-card-name">${sanitized.name || '성명 미상'}</span>
            <span class="crm-card-badge">${sanitized.job || '고객'}</span>
          </div>
          <div class="crm-card-info-row">
            <span class="crm-info-item">전화: ${sanitized.phone || '미등록'}</span>
            <span class="crm-info-item">주민번호: ${maskedJumin}</span>
          </div>
          <div class="crm-card-address">${sanitized.address || '주소 정보 없음'}</div>
        </div>
      `;
    });

    listArea.innerHTML = html;

    // 현재 필터된 배열을 전역에 임시 보관
    window._filteredCustomerPool = filtered;
  }

  // 6. 고객 선택 및 미리보기 화면 전환
  window.selectCustomerForPreview = function (filteredIndex) {
    const list = window._filteredCustomerPool || window.crmPickerState.customers || [];
    const client = list[filteredIndex];
    if (!client) return;

    const sanitized = sanitizeCustomer(client);
    window.crmPickerState.selectedCustomer = client;
    window.crmPickerState.previewData = sanitized;

    const banner = document.getElementById('crmPreviewBanner');
    if (banner) {
      const t = window.crmPickerState.targetType;
      banner.innerText = t === 'cont'
        ? '[계약자(보험료 납입자)] 정보로 적용 예정입니다.'
        : '[피보험자(치료받으신 분)] 정보로 적용 예정입니다.';
    }

    document.getElementById('prev_name').value = sanitized.name || '';
    document.getElementById('prev_rrn').value = sanitized.rrn || '';
    document.getElementById('prev_phone').value = sanitized.phone || '';
    document.getElementById('prev_address').value = sanitized.address || '';
    document.getElementById('prev_job').value = sanitized.job || '';

    // 계좌 정보
    const accBox = document.getElementById('crmPreviewAccountBox');
    const bankNameInput = document.getElementById('prev_bankName');
    const bankOwnerInput = document.getElementById('prev_bankOwner');
    const bankAccountInput = document.getElementById('prev_bankAccount');

    if (sanitized.bankName || sanitized.bankAccount) {
      if (accBox) accBox.style.display = 'block';
      if (bankNameInput) bankNameInput.value = sanitized.bankName || '';
      if (bankOwnerInput) bankOwnerInput.value = sanitized.bankOwner || sanitized.name || '';
      if (bankAccountInput) bankAccountInput.value = sanitized.bankAccount || '';
    } else {
      if (accBox) accBox.style.display = 'block';
      if (bankNameInput) bankNameInput.value = '';
      if (bankOwnerInput) bankOwnerInput.value = sanitized.name || '';
      if (bankAccountInput) bankAccountInput.value = '';
    }

    switchStep(2);
  };

  // 7. 데이터 최종 승인 및 폼 주입
  window.confirmAndApplyCustomerData = function () {
    const target = window.crmPickerState.targetType || 'ins';

    const finalName = document.getElementById('prev_name').value.trim();
    let finalRrn = document.getElementById('prev_rrn').value.replace(/[^0-9]/g, '').trim();
    const finalPhone = document.getElementById('prev_phone').value.trim();
    const finalAddress = document.getElementById('prev_address').value.trim();
    const finalJob = document.getElementById('prev_job').value.trim();

    if (!finalName) {
      alert('성명을 입력해 주세요.');
      return;
    }

    if (finalRrn.length > 0 && finalRrn.length !== 13) {
      const proceed = confirm('주민등록번호가 13자리가 아닙니다. 그대로 진행하시겠습니까?');
      if (!proceed) return;
    }

    // 값 주입 및 change 이벤트 트리거 헬퍼
    function setFieldValue(fieldId, value) {
      const el = document.getElementById(fieldId);
      if (el) {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    if (target === 'ins') {
      setFieldValue('insName', finalName);
      setFieldValue('insRrn', finalRrn);
      setFieldValue('insPhone', finalPhone);
      setFieldValue('insAddress', finalAddress);
      setFieldValue('insJob', finalJob);
    } else if (target === 'cont') {
      setFieldValue('contName', finalName);
      setFieldValue('contRrn', finalRrn);
      setFieldValue('contPhone', finalPhone);
      setFieldValue('contAddress', finalAddress);
      setFieldValue('contRelation', '본인');
    }

    // 계좌 정보 주입 (선택된 경우)
    const fillAccount = document.getElementById('prev_fillAccount')?.checked;
    if (fillAccount) {
      const bName = document.getElementById('prev_bankName').value.trim();
      const bOwner = document.getElementById('prev_bankOwner').value.trim();
      const bAcc = document.getElementById('prev_bankAccount').value.trim();

      if (bName) setFieldValue('bankName', bName);
      if (bOwner) setFieldValue('bankOwner', bOwner);
      if (bAcc) setFieldValue('bankAccount', bAcc);
    }

    closeCustomerPicker();
  };

  // 8. 폼 라벨 옆에 불러오기 버튼 자동 부착
  function attachButtonsToForm() {
    // 피보험자 버튼
    const insWrap = document.getElementById('wrapper_insName');
    if (insWrap && !insWrap.querySelector('.btn-picker-trigger')) {
      const label = insWrap.querySelector('.main-label');
      if (label) {
        label.style.display = 'flex';
        label.style.justifyContent = 'space-between';
        label.style.alignItems = 'center';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-picker-trigger';
        btn.innerText = 'CRM 고객 불러오기';
        btn.onclick = function (e) {
          e.preventDefault();
          window.openCustomerPicker('ins');
        };
        label.appendChild(btn);
      }
    }

    // 계약자 버튼
    const contWrap = document.getElementById('wrapper_contName');
    if (contWrap && !contWrap.querySelector('.btn-picker-trigger')) {
      const label = contWrap.querySelector('.main-label');
      if (label) {
        label.style.display = 'flex';
        label.style.justifyContent = 'space-between';
        label.style.alignItems = 'center';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-picker-trigger';
        btn.innerText = 'CRM 고객 불러오기';
        btn.onclick = function (e) {
          e.preventDefault();
          window.openCustomerPicker('cont');
        };
        label.appendChild(btn);
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

  // 9. 코비 스타일 수평 스텝퍼 바 (순수 시각용 UI 표시 도우미 - 100% 기존 데이터 연동)
  function updateStepperBar() {
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

    const slides = document.querySelectorAll('.app-slide');
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
      let text = titleEl ? titleEl.innerText.replace(/^[0-9.]+\s*/, '') : ('단계 ' + (i + 1));
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
  }

  // slides-container 감시자 등록 (동적 슬라이드 렌더링 시 자동 부착)
  function initObserver() {
    const targetNode = document.getElementById('slides-container');
    if (!targetNode) {
      setTimeout(initObserver, 300);
      return;
    }

    const observer = new MutationObserver(function () {
      attachButtonsToForm();
      updateStepperBar();
    });

    observer.observe(targetNode, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    attachButtonsToForm();
    updateStepperBar();

    // claim-step 전환 감시 (step2 -> step_dyn_flow 진입 시)
    const contentArea = document.querySelector('.content-area');
    if (contentArea) {
      const stepObserver = new MutationObserver(function () {
        updateStepperBar();
      });
      stepObserver.observe(contentArea, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }
  }

  // 초기화 실행
  document.addEventListener('DOMContentLoaded', function () {
    initDataSync();
    initObserver();
  });

  window.attachCustomerPickerButtons = attachButtonsToForm;
  window.updateStepperBar = updateStepperBar;

})();

