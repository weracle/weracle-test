// ==========================================

// claim_property.js - 재물 보험 전용 실행 엔진

// ==========================================



  // ================== 데이터 연동 ==================
  window.claimCustomerData = [];
  window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'syncData') {
          window.claimCustomerData = event.data.data || [];
          console.log("claim.html received customer data:", window.claimCustomerData.length);
      }
  });

  // ================== 설정 데이터 ==================

  const reqFaxCompanies = []; 
  let selectedCategory = "";
  let currentSystemStep = "step1"; 
  let slidesOrderGroups = [];
  let currentSlideIdx = -1;
  let canvasInstances = {};
  
  function updateHeader(mode) {
    try {
      const hdr = document.getElementById('appHeader');
      const btm = document.getElementById('bottomNav');
      if (!hdr || !btm) return;
      
      if(mode === 'init') { 
        hdr.style.display = 'none'; 
        btm.style.display = 'none'; 
      } else if(mode === 'company') { 
        hdr.style.display = 'flex'; 
        document.getElementById('progressWrap').style.opacity = '0'; 
        btm.style.display = 'none'; 
        document.getElementById('nextBtn').innerText = "다음";
      } else if(mode === 'flow') { 
        hdr.style.display = 'flex'; 
        document.getElementById('progressWrap').style.opacity = '1'; 
        btm.style.display = 'flex'; 
      }
    } catch (e) {
      console.error("updateHeader 에러:", e);
    }
  }
 
  function moveStep(stepId) { 
    try {
      document.querySelectorAll('.claim-step').forEach(el => el.classList.remove('active')); 
      const targetEl = document.getElementById(stepId);
      if (targetEl) {
        targetEl.classList.add('active'); 
        currentSystemStep = stepId;
      } else {
        console.error(`이동할 스텝 엘리먼트가 존재하지 않습니다: ${stepId}`);
      }
      window.scrollTo(0, 0);
    } catch (e) {
      console.error("moveStep 에러:", e);
    }
  }
  
  function goBack() {
    try {
      if(currentSystemStep === 'step2') { 
        window.location.href = 'claim.html';
        return; 
      } else if(currentSystemStep === 'step_dyn_flow') {
        let prev = currentSlideIdx - 1;
        if(prev >= 0) { 
          showSlide(prev); 
        } else { 
          updateHeader('company'); 
          moveStep('step2'); 
        }
      }
    } catch (e) {
      console.error("goBack 에러:", e);
    }
  }
 
  function selectCategory(cat) { 
    selectedCategory = cat; 
    renderCompanyList(); 
    updateHeader('company');
    moveStep('step2'); 
  }
  
  function renderCompanyList() { 
    try {
      const select = document.getElementById('companySelect'); 
      if (!select) return;
      let options = "<option value='' disabled selected>가입하신 보험사를 선택해주세요</option>"; 
      const companies = Object.keys(CONFIG[selectedCategory] || {});
      companies.forEach(c => options += `<option value='${c}'>${c}</option>`); 
      select.innerHTML = options; 
      checkFaxRequirement(); 
    } catch (e) {
      console.error("renderCompanyList 에러:", e);
    }
  }
 
  function checkFaxRequirement() { 
    try {
      const select = document.getElementById('companySelect');
      if (!select) return;
      const company = select.value; 
      const faxWrap = document.getElementById('faxInputWrap'); 
      if (!faxWrap) return;
      
      if (reqFaxCompanies.includes(company)) { 
        faxWrap.classList.remove('hidden'); 
      } else { 
        faxWrap.classList.add('hidden'); 
        document.getElementById('faxNumber').value = ""; 
      } 
    } catch (e) {
      console.error("checkFaxRequirement 에러:", e);
    }
  }
 
  function goToDynStep() {
    try {
      const select = document.getElementById('companySelect');
      if (!select) return alert("보험사 선택 드롭다운이 준비되지 않았습니다.");
      const comp = select.value;
      if(!comp) return alert("보험사를 선택해주세요.");
      if(reqFaxCompanies.includes(comp) && !document.getElementById('faxNumber').value) {
        return alert("해당 보험사는 가상 팩스번호 입력이 필수입니다.");
      }
      
      const compConfig = CONFIG[selectedCategory] ? CONFIG[selectedCategory][comp] : null;
      if (!compConfig) {
        return alert(`선택하신 보험사(${comp})의 세부 CONFIG 설정을 찾을 수 없습니다.`);
      }
      
      slidesOrderGroups = [];
      if(compConfig.step1) slidesOrderGroups.push(compConfig.step1.filter(f => FIELD_DEFS[f]));
      if(compConfig.step2) slidesOrderGroups.push(compConfig.step2.filter(f => FIELD_DEFS[f]));
      if(compConfig.step3) slidesOrderGroups.push(compConfig.step3.filter(f => FIELD_DEFS[f]));
      if(compConfig.step4) slidesOrderGroups.push(compConfig.step4.filter(f => FIELD_DEFS[f]));
 
      let html = '';
      const groupTitles = [
        "1. 피보험자/수익자 정보",
        "2. 사고 관련 정보",
        "3. 은행 계좌 및 서명",
        "4. 추가 정보 입력"
      ];
 
      slidesOrderGroups.forEach((groupFields, idx) => {
        let title = groupTitles[idx] || "추가 정보 입력";
        html += `<div class="app-slide" id="slide_${idx}">
                   <div class="slide-title">${title}</div>`;
                   
        groupFields.forEach(fieldId => {
          let labelText = FIELD_DEFS[fieldId].label;
          const isToggleCont = FIELD_DEFS[fieldId].type === 'checkbox_toggle_cont';
          html += `<div class="sub-form-group field-wrapper" id="wrapper_${fieldId}">
                     ${isToggleCont ? '' : `<label class="main-label">${labelText}</label>`}
                     ${buildInputHtml(fieldId)}
                   </div>`;
        });
        html += `</div>`;
      });
      
      html += `<div class="app-slide" id="slide_${slidesOrderGroups.length}">
                 <div class="slide-title">청구 서류 첨부</div>
                 <input type="file" id="fileInput" multiple accept="image/*, .pdf" style="display:none;" onchange="handleFiles(this.files)">
                 <div class="file-drop-area" onclick="document.getElementById('fileInput').click()"> 여기를 터치하여 서류 업로드</div>
                 <div id="fileList" class="file-list" style="margin-top: 12px;"></div>
               </div>`;
               
      const container = document.getElementById('slides-container');
      if (!container) throw new Error("slides-container 엘리먼트를 찾을 수 없습니다.");
      container.innerHTML = html;
      
      canvasInstances = {};
      const flatOrder = slidesOrderGroups.reduce((acc, val) => acc.concat(val), []);
      flatOrder.forEach(f => {
        if(FIELD_DEFS[f].type.includes('signature')) {
          initSignature(f);
        }
      });
 
      updateHeader('flow');
      moveStep('step_dyn_flow');
      
      if(flatOrder.includes('diffInsured')) {
        setTimeout(() => toggleInsured(false), 20);
      }
      if(flatOrder.includes('diffInsuredCont')) {
        setTimeout(() => toggleContFields(false), 20);
      }
      if(flatOrder.includes('sameAsCont')) {
        setTimeout(() => {
          const val = document.querySelector('input[name="sameAsCont"]:checked')?.value;
          copyFields('ins', 'cont', val === 'yes');
        }, 20);
      }
      if(flatOrder.includes('sameAsBene')) {
        setTimeout(() => {
          const val = document.querySelector('input[name="sameAsBene"]:checked')?.value;
          copyFields('ins', 'bene', val === 'yes');
        }, 20);
      }
      
      if (typeof window.attachCustomerPickerButtons === 'function') {
        window.attachCustomerPickerButtons();
      }
      showSlide(0);
    } catch (e) {
      alert("동적 슬라이드를 그리는 도중 에러가 발생했습니다: " + e.message);
      console.error(e);
    }
  }
 
  function buildInputHtml(fieldId) {
    const def = FIELD_DEFS[fieldId];
    const defaultVal = def.type === 'date' ? new Date().toISOString().split('T')[0] : '';
    let extraAttrs = '';
    
    if (fieldId.includes('Rrn') || def.label.includes('주민번호')) {
      extraAttrs = 'maxlength="13" oninput="this.value = this.value.replace(/[^0-9]/g, \'\')"';
    }
 
        if (def.type === 'text' || def.type === 'date') {
      let inputHtml = `<input type="` + (def.type==='date'?'date':'text') + `" id="` + fieldId + `" class="form-control" ` + extraAttrs + ` placeholder="` + (def.placeholder||'') + `" value="` + defaultVal + `">`;
      
      // Add '없음' button for specific companies and fields
      const noBankOwnerCompanies = ['흥국생명', 'DB생명', 'KDB생명', '메트라이프', '농협생명', '교보생명', '한화생명'];
      const noRelationCompanies = ['교보생명', '한화생명'];
      
      if (fieldId === 'bankOwner' && noBankOwnerCompanies.includes(document.getElementById('companySelect')?.value)) {
          return `<div style="display: flex; gap: 8px;">` + inputHtml + `<button type="button" style="padding: 0 15px; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; color: #475569; font-weight: 600; cursor: pointer; white-space: nowrap;" onclick="document.getElementById('bankOwner').value='없음'">없음</button></div>`;
      }
      if ((fieldId === 'beneRelation' || fieldId === 'guideRelation') && noRelationCompanies.includes(document.getElementById('companySelect')?.value)) {
          return `<div style="display: flex; gap: 8px;">` + inputHtml + `<button type="button" style="padding: 0 15px; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; color: #475569; font-weight: 600; cursor: pointer; white-space: nowrap;" onclick="document.getElementById('').value='없음'">없음</button></div>`;
      }
      
      return inputHtml;
    } else if(def.type === 'textarea') {
      return `<textarea id="${fieldId}" class="form-control" rows="5" placeholder="자세하게 적어주시면 빠른 처리에 도움이 됩니다."></textarea>`;
    } else if(def.type === 'checkbox_copy') {
      let yesText = fieldId === 'sameAsCont' ? "동일함 (자동복사)" : "동일함";
      let noText = fieldId === 'sameAsCont' ? "다름 (직접입력)" : "다름";
      return `<div class="radio-group">
                <label><input type="radio" name="${fieldId}" value="yes" checked onchange="copyFields('${def.from}', '${def.to}', true)"> ${yesText}</label>
                <label><input type="radio" name="${fieldId}" value="no" onchange="copyFields('${def.from}', '${def.to}', false)"> ${noText}</label>
              </div>`;
    } else if(def.type === 'checkbox_toggle_bank') {
      return `<div class="radio-group">
                <label><input type="radio" name="${fieldId}" value="yes" onchange="toggleBankFields(true)"> 예 (자동이체 수령)</label>
                <label><input type="radio" name="${fieldId}" value="no" checked onchange="toggleBankFields(false)"> 아니오 (계좌 직접입력)</label>
              </div>`;
    } else if(def.type === 'checkbox_toggle_cont') {
      return `<div class="radio-group">
                <label style="padding: 12px 14px; font-weight: 600; display: flex; align-items: center; border: 2px solid #d1d6db; border-radius: 12px; background: #ffffff; cursor: pointer; color: #4e5968;">
                  <input type="checkbox" id="${fieldId}" onchange="toggleContFields(this.checked)" style="margin-right: 12px; width: 20px; height: 20px; accent-color: #0284c7; margin-bottom: 0; vertical-align: middle;"> 
                  ${def.label}
                </label>
              </div>`;
    } else if(def.type === 'radio') {
      return `<div class="radio-group">` + def.options.map((o,i) => `<label><input type="radio" name="${fieldId}" value="${o}" ${i===0?'checked':''}> ${o}</label>`).join('') + `</div>`;
    } else if(def.type === 'checkbox') {
      return `<div class="radio-group"><label><input type="checkbox" id="${fieldId}"> ${def.label}</label></div>`;
    } else if(def.type === 'custom_diff_insured') {
      return `<div class="radio-group">
                <label><input type="radio" name="${fieldId}" value="no" checked onchange="toggleInsured(false)"> 동일함</label>
                <label><input type="radio" name="${fieldId}" value="yes" onchange="toggleInsured(true)"> 다름 (새로 입력)</label>
              </div>`;
 
    } else if(def.type === 'custom_id') {
      let idcardHtml = '';
      let licenseHtml = '';
      
      if (fieldId === 'idVerification_Samsung') {
        idcardHtml = `
          <div class="sub-form-group"><label class="sub-label">발급일자</label><input type="date" id="${fieldId}_idIssueDate" class="form-control"></div>
        `;
        licenseHtml = `
          <div class="sub-form-group"><label class="sub-label">운전면허번호</label><input type="text" id="${fieldId}_idLicenseNum" class="form-control" placeholder="숫자 및 기호"></div>
          <div class="sub-form-group"><label class="sub-label">일련번호</label><input type="text" id="${fieldId}_idLicenseSerial" class="form-control" placeholder="일련번호 입력"></div>
        `;
      } else if (fieldId === 'idVerification_Hana') {
        idcardHtml = `
          <div class="sub-form-group"><label class="sub-label">주민등록번호</label><input type="text" id="${fieldId}_idIssueAuth" class="form-control" maxlength="13" oninput="this.value = this.value.replace(/[^0-9]/g, '')" placeholder="숫자만 13자리 입력"></div>
        `;
        licenseHtml = `
          <div class="sub-form-group"><label class="sub-label">운전면허번호</label><input type="text" id="${fieldId}_idLicenseNum" class="form-control" placeholder="숫자 및 기호"></div>
          <div class="sub-form-group"><label class="sub-label">발급기관</label><input type="text" id="${fieldId}_idLicenseAuth" class="form-control" placeholder="예: 경찰청장"></div>
          <div class="sub-form-group"><label class="sub-label">발급일자</label><input type="date" id="${fieldId}_idLicenseSerial" class="form-control"></div>
        `;
      } else if (fieldId === 'idVerification_Chubb') {
        idcardHtml = `
          <div class="sub-form-group"><label class="sub-label">발급일자</label><input type="date" id="${fieldId}_idIssueDate" class="form-control"></div>
        `;
        licenseHtml = `
          <div class="sub-form-group"><label class="sub-label">운전면허번호</label><input type="text" id="${fieldId}_idLicenseNum" class="form-control" placeholder="숫자 및 기호"></div>
          <div class="sub-form-group"><label class="sub-label">발급기관</label><input type="text" id="${fieldId}_idLicenseAuth" class="form-control" placeholder="예: 경찰청장"></div>
          <div class="sub-form-group"><label class="sub-label">발급일자</label><input type="date" id="${fieldId}_idLicenseSerial" class="form-control"></div>
        `;
      } else if (fieldId === 'idVerification_IM' || fieldId === 'idVerification_ABL') {
        idcardHtml = `
          <div class="sub-form-group"><label class="sub-label">발급일자</label><input type="date" id="${fieldId}_idIssueDate" class="form-control"></div>
        `;
        licenseHtml = `
          <div class="sub-form-group"><label class="sub-label">운전면허번호</label><input type="text" id="${fieldId}_idLicenseNum" class="form-control" placeholder="숫자 및 기호"></div>
        `;
      } else if (fieldId === 'idVerification_Shinhan' || fieldId === 'idVerification_Nonghyup') {
        idcardHtml = `
          <div class="sub-form-group"><label class="sub-label">발급일자</label><input type="date" id="${fieldId}_idIssueDate" class="form-control"></div>
          
        `;
        licenseHtml = `
          <div class="sub-form-group"><label class="sub-label">운전면허번호</label><input type="text" id="${fieldId}_idLicenseNum" class="form-control" placeholder="숫자 및 기호"></div>
          <div class="sub-form-group"><label class="sub-label">일련번호</label><input type="text" id="${fieldId}_idLicenseSerial" class="form-control"></div>
        `;
      } else if (fieldId === 'idVerification_Lina') {
        idcardHtml = `
          <div class="sub-form-group"><label class="sub-label">발급일자</label><input type="date" id="${fieldId}_idIssueDate" class="form-control"></div>
          
        `;
        licenseHtml = `
          <div class="sub-form-group"><label class="sub-label">운전면허번호</label><input type="text" id="${fieldId}_idLicenseNum" class="form-control" placeholder="숫자 및 기호"></div>
        `;
      } else if (fieldId === 'idVerification_Mirae' || fieldId === 'idVerification_Dongyang' || fieldId === 'idVerification_DB') {
        idcardHtml = `
          <div class="sub-form-group"><label class="sub-label">발급일자</label><input type="date" id="${fieldId}_idIssueDate" class="form-control"></div>
        `;
        licenseHtml = `
          <div class="sub-form-group"><label class="sub-label">운전면허번호</label><input type="text" id="${fieldId}_idLicenseNum" class="form-control" placeholder="숫자 및 기호"></div>
          <div class="sub-form-group"><label class="sub-label">일련번호</label><input type="text" id="${fieldId}_idLicenseSerial" class="form-control"></div>
        `;
      } else if (fieldId === 'idVerification_KDB') {
        idcardHtml = `
          <div class="sub-form-group"><label class="sub-label">발급일자</label><input type="date" id="${fieldId}_idIssueDate" class="form-control"></div>
          <div class="sub-form-group"><label class="sub-label">발급기관</label><input type="text" id="${fieldId}_idIssueAuth" class="form-control" placeholder="발급기관명"></div>
        `;
        licenseHtml = `
          <div class="sub-form-group"><label class="sub-label">운전면허번호</label><input type="text" id="${fieldId}_idLicenseNum" class="form-control" placeholder="숫자 및 기호"></div>
          <div class="sub-form-group"><label class="sub-label">일련번호</label><input type="text" id="${fieldId}_idLicenseSerial" class="form-control"></div>
        `;
      } else if (fieldId === 'idVerification_MetLife') {
        idcardHtml = `
          <div class="sub-form-group"><label class="sub-label">발급일자</label><input type="date" id="${fieldId}_idIssueDate" class="form-control"></div>
        `;
        licenseHtml = `
          <div class="sub-form-group"><label class="sub-label">운전면허번호</label><input type="text" id="${fieldId}_idLicenseNum" class="form-control" placeholder="숫자 및 기호"></div>
          <div class="sub-form-group"><label class="sub-label">일련번호</label><input type="text" id="${fieldId}_idLicenseSerial" class="form-control"></div>
          <div class="sub-form-group"><label class="sub-label">발급일자</label><input type="date" id="${fieldId}_idLicenseAuth" class="form-control"></div>
        `;
      } else {
        idcardHtml = `
          <div class="sub-form-group"><label class="sub-label">발급일자</label><input type="date" id="${fieldId}_idIssueDate" class="form-control"></div>
          <div class="sub-form-group"><label class="sub-label">발급기관</label><input type="text" id="${fieldId}_idIssueAuth" class="form-control" placeholder="예: 서울시장"></div>
        `;
        licenseHtml = `
          <div class="sub-form-group"><label class="sub-label">운전면허번호</label><input type="text" id="${fieldId}_idLicenseNum" class="form-control" placeholder="숫자 및 기호"></div>
          <div class="sub-form-group"><label class="sub-label">발급기관</label><input type="text" id="${fieldId}_idLicenseAuth" class="form-control" placeholder="예: 경찰청장"></div>
          <div class="sub-form-group"><label class="sub-label">일련번호</label><input type="text" id="${fieldId}_idLicenseSerial" class="form-control" placeholder="일련번호 입력"></div>
        `;
      }
  
      return `<div class="radio-group" style="margin-bottom: 12px;">
                <label><input type="radio" name="${fieldId}_type" value="idcard" checked onchange="toggleIdFields(this, '${fieldId}')"> 주민등록증</label>
                <label><input type="radio" name="${fieldId}_type" value="license" onchange="toggleIdFields(this, '${fieldId}')"> 운전면허증</label>
              </div>
              <div id="${fieldId}_idcard">${idcardHtml}</div>
              <div id="${fieldId}_license" class="hidden">${licenseHtml}</div>`;
              
    } else if(def.type === 'signature') {
      return `<canvas id="${fieldId}" class="signature-pad"></canvas>
              <span class="sig-clear-btn" onclick="clearSignature('${fieldId}')">지우기</span>
              <div style="clear:both;"></div>`;
              
    } else if(def.type === 'signature_name') {
      return `<div class="sub-form-group" style="margin-top:8px;"><label class="sub-label">성함</label><input type="text" id="${fieldId}_name" class="form-control" placeholder="이름을 직접 입력해 주세요."></div>
              <label class="main-label" style="margin-top:16px;">서명</label>
              <canvas id="${fieldId}" class="signature-pad"></canvas>
              <span class="sig-clear-btn" onclick="clearSignature('${fieldId}')">지우기</span>
              <div style="clear:both;"></div>`;
    }
  }
 
  function showSlide(idx) {
    try {
      const slides = document.querySelectorAll('.app-slide');
      if (slides.length === 0) return;
      
      slides.forEach(s => s.classList.remove('active'));
      
      if (idx >= slides.length) {
        idx = slides.length - 1;
      }
      currentSlideIdx = idx;
      
      const targetSlide = document.getElementById('slide_' + idx);
      if (targetSlide) {
        targetSlide.classList.add('active');
      }
      
      const totalSteps = slidesOrderGroups.length + 1;
      const pct = ((idx + 1) / totalSteps) * 100;
      const pBar = document.getElementById('progressBar');
      if (pBar) pBar.style.width = pct + '%';
      
      const nextBtn = document.getElementById('nextBtn');
      if (nextBtn) {
        if(idx === slides.length - 1) {
          nextBtn.innerText = "제출 및 청구완료";
        } else {
          nextBtn.innerText = "다음";
        }
      }
      
      setTimeout(resizeAllCanvas, 30);
      document.querySelector('.content-area').scrollTo(0, 0);
    } catch (e) {
      console.error("showSlide 에러:", e);
    }
  }
 
  function handleNextButton() {
    try {
      const totalSlides = slidesOrderGroups.length + 1;
      if(currentSlideIdx === totalSlides - 1) {
        finalSubmit();
      } else {
        showSlide(currentSlideIdx + 1);
      }
    } catch (e) {
      console.error("handleNextButton 에러:", e);
    }
  }
 
  function copyFields(from, to, shouldCopy) {
    try {
      const fields = ['Name', 'Rrn', 'Phone', 'Address'];
      fields.forEach(k => {
        const fromEl = document.getElementById(from + k);
        const toEl = document.getElementById(to + k);
        const toWrapper = document.getElementById('wrapper_' + to + k);
        
        if (toWrapper) {
          toWrapper.classList.toggle('hidden', shouldCopy);
        }
        
        if (shouldCopy) {
          if (fromEl && toEl) {
            toEl.value = fromEl.value;
            toEl.disabled = true;
          }
        } else {
          if (toEl) {
            toEl.value = "";
            toEl.disabled = false;
          }
        }
      });
      
      const relationEl = document.getElementById(to + 'Relation');
      const relationWrapper = document.getElementById('wrapper_' + to + 'Relation');
      if (relationWrapper) relationWrapper.classList.toggle('hidden', shouldCopy);
      if (shouldCopy && relationEl) {
        relationEl.value = "본인";
        relationEl.disabled = true;
      } else if (!shouldCopy && relationEl) {
        relationEl.value = "";
        relationEl.disabled = false;
      }

      // --- Custom Logic for signatures and Samsung Life ---
      if (from === 'ins' && to === 'bene') {
          const company = document.getElementById('companySelect')?.value;
          const sigBeneWrapper = document.getElementById('wrapper_sigBeneficiary');
          const insAddressWrapper = document.getElementById('wrapper_insAddress');

          // 1. 삼성생명 등: "수익자 서명"을 숨기고 "피보험자 서명"만 노출
          const targetCompanies = ['삼성생명', '하나생명', '흥국생명', 'DB생명', 'KDB생명', '메트라이프', '농협생명', '교보생명', '한화생명', '처브라이프생명', 'KB라이프', 'IM라이프', 'ABL생명', '신한라이프', '라이나생명', '미래에셋', '수호천사동양생명'];
            if (sigBeneWrapper && selectedCategory === '생명보험') {
              sigBeneWrapper.classList.toggle('hidden', shouldCopy);
          }

          // 2. 다를시(shouldCopy=false): 삼성생명은 피보험자 주소 폼 삭제(숨김)
          if (insAddressWrapper && selectedCategory === '생명보험') {
              insAddressWrapper.classList.toggle('hidden', !shouldCopy);
          }
      }
    } catch (e) {
      console.error("copyFields 에러:", e);
    }
  }
 
  function toggleContFields(isChecked) {
    try {
      const select = document.getElementById('companySelect');
      const contFields = ['contName', 'contRrn', 'contPhone', 'contAddress', 'contRelation'];
      contFields.forEach(id => {
        let wrapper = document.getElementById('wrapper_' + id);
        if(wrapper) {
          wrapper.classList.toggle('hidden', !isChecked);
        }
      });
 
      if (selectedCategory !== "생명보험" && select && select.value === "AIG손해보험") {
        const sigInsWrapper = document.getElementById('wrapper_sigInsured');
        if (sigInsWrapper) {
          const wasHidden = sigInsWrapper.classList.contains('hidden');
          sigInsWrapper.classList.toggle('hidden', !isChecked); 
          
          if (isChecked && wasHidden) {
            setTimeout(() => {
              const inst = canvasInstances['sigInsured'];
              if (inst) inst.scaleCanvas();
            }, 50);
          }
        }
      }
      
      if (selectedCategory !== "생명보험" && select && (select.value === "DB손해보험" || select.value.includes("DB손해"))) {
        const sigBeneWrapper = document.getElementById('wrapper_sigBeneficiary');
        if (sigBeneWrapper) {
          const wasHidden = sigBeneWrapper.classList.contains('hidden');
          sigBeneWrapper.classList.toggle('hidden', !isChecked); 
          
          if (isChecked && wasHidden) {
            setTimeout(() => {
              const inst = canvasInstances['sigBeneficiary'];
              if (inst) inst.scaleCanvas();
            }, 50);
          }
        }
      }
    } catch (e) {
      console.error("toggleContFields 에러:", e);
    }
  }
 
  function toggleBankFields(isAuto) {
    try {
      const bankFields = ['bankName', 'bankAccount', 'bankOwner', 'bankOwnerRrn', 'bankOwnerRel'];
      bankFields.forEach(id => {
        let wrapper = document.getElementById('wrapper_' + id);
        if(wrapper) wrapper.classList.toggle('hidden', isAuto);
        if(isAuto) {
          let el = document.getElementById(id);
          if(el) el.value = "";
        }
      });
    } catch (e) {
      console.error("toggleBankFields 에러:", e);
    }
  }
  
  function toggleIdFields(radioEl, fieldId) {
    try {
      const isLicense = radioEl.value === 'license';
      const idcardEl = document.getElementById(`${fieldId}_idcard`);
      const licenseEl = document.getElementById(`${fieldId}_license`);
      if (idcardEl) idcardEl.classList.toggle('hidden', isLicense);
      if (licenseEl) licenseEl.classList.toggle('hidden', !isLicense);
    } catch (e) {
      console.error("toggleIdFields 에러:", e);
    }
  }
 
  function toggleInsured(isDiff) {
    try {
      const insFields = ['insName', 'insRrn', 'insPhone', 'insAddress', 'insRelation'];
      insFields.forEach(id => {
        let wrapper = document.getElementById('wrapper_' + id);
        if(wrapper) wrapper.classList.toggle('hidden', !isDiff);
        if(!isDiff) {
          let el = document.getElementById(id);
          if(el) el.value = "";
        }
      });
    } catch (e) {
      console.error("toggleInsured 에러:", e);
    }
  }
 
    function initSignature(canvasId) {
    try {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      let isDrawing = false;
      let points = [];

      // 1) 모던 카드형 래퍼 부착
      let wrap = document.getElementById('wrap_' + canvasId);
      if (!wrap && canvas.parentNode) {
        wrap = document.createElement('div');
        wrap.id = 'wrap_' + canvasId;
        wrap.className = 'signature-box-wrap';

        const parent = canvas.parentNode;
        parent.insertBefore(wrap, canvas);

        const hint = document.createElement('div');
        hint.id = 'hint_' + canvasId;
        hint.className = 'sig-placeholder-hint';
        hint.innerHTML = '<span>여기에 정자로 서명해 주세요</span>';
        wrap.appendChild(hint);

        const line = document.createElement('div');
        line.className = 'sig-guide-line';
        wrap.appendChild(line);

        wrap.appendChild(canvas);

        const footer = document.createElement('div');
        footer.className = 'sig-box-footer';
        footer.innerHTML = '<span class="sig-status-tag" id="status_' + canvasId + '">서명 대기</span>'
                         + '<button type="button" class="sig-btn-clear" onclick="clearSignature(\'' + canvasId + '\')">다시 서명 (초기화)</button>';
        wrap.appendChild(footer);

        const oldBtn = parent.querySelector('.sig-clear-btn');
        if (oldBtn) oldBtn.style.display = 'none';
      }

      function scaleCanvas() {
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const dpr = window.devicePixelRatio || 1;
        
        let backup = null;
        if (!isCanvasBlank(canvas)) {
          backup = canvas.toDataURL();
        }

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 2.8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#0f172a';

        if (backup) {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, rect.width, rect.height);
          };
          img.src = backup;
        }
      }

      canvasInstances[canvasId] = { canvas, ctx, scaleCanvas };
      scaleCanvas();

      function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
          x: clientX - rect.left,
          y: clientY - rect.top
        };
      }

      function startStroke(e) {
        isDrawing = true;
        const pos = getPos(e);
        points = [pos];
        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2.8;
        ctx.strokeStyle = '#0f172a';
        ctx.moveTo(pos.x, pos.y);

        if (wrap) {
          wrap.classList.add('is-signing');
          const hint = document.getElementById('hint_' + canvasId);
          if (hint) hint.classList.add('signed');
          const status = document.getElementById('status_' + canvasId);
          if (status) {
            status.classList.add('signed');
            status.innerText = '서명 완료';
          }
        }
        if (e.cancelable && e.type.startsWith('touch')) {
          e.preventDefault();
        }
      }

      function moveStroke(e) {
        if (!isDrawing) return;
        const pos = getPos(e);
        points.push(pos);

        if (points.length >= 3) {
          const p1 = points[points.length - 2];
          const p2 = points[points.length - 1];
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
          ctx.stroke();
        } else if (points.length === 2) {
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
        }

        if (e.cancelable && e.type.startsWith('touch')) {
          e.preventDefault();
        }
      }

      function endStroke() {
        if (!isDrawing) return;
        isDrawing = false;
        if (points.length === 1) {
          ctx.beginPath();
          ctx.arc(points[0].x, points[0].y, 1.4, 0, Math.PI * 2);
          ctx.fillStyle = '#0f172a';
          ctx.fill();
        }
        if (wrap) {
          wrap.classList.remove('is-signing');
          wrap.classList.add('has-signed');
        }
      }

      canvas.addEventListener('mousedown', startStroke);
      canvas.addEventListener('mousemove', moveStroke);
      window.addEventListener('mouseup', endStroke);

      canvas.addEventListener('touchstart', startStroke, { passive: false });
      canvas.addEventListener('touchmove', moveStroke, { passive: false });
      window.addEventListener('touchend', endStroke);

    } catch (e) {
      console.error(`서명 패드(${canvasId}) 초기화 에러:`, e);
    }
  }

  function clearSignature(canvasId) {
    try {
      const inst = canvasInstances[canvasId];
      if (inst) {
        inst.ctx.clearRect(0, 0, inst.canvas.width, inst.canvas.height);
      }
      const hint = document.getElementById('hint_' + canvasId);
      if (hint) hint.classList.remove('signed');
      const status = document.getElementById('status_' + canvasId);
      if (status) {
        status.classList.remove('signed');
        status.innerText = '서명 대기';
      }
      const wrap = document.getElementById('wrap_' + canvasId);
      if (wrap) {
        wrap.classList.remove('has-signed');
        wrap.classList.remove('is-signing');
      }
    } catch (e) {
      console.error("서명 초기화 에러:", e);
    }
  }

  function resizeAllCanvas() {
    try {
      Object.keys(canvasInstances).forEach(id => {
        const inst = canvasInstances[id];
        if (inst && inst.canvas.offsetParent !== null) {
          inst.scaleCanvas();
        }
      });
    } catch (e) {
      console.error("캔버스 리사이즈 에러:", e);
    }
  }
  
  function isCanvasBlank(canvas) {
    if(!canvas) return true;
    const blank = document.createElement('canvas');
    blank.width = canvas.width;
    blank.height = canvas.height;
    return canvas.toDataURL() === blank.toDataURL();
  }
  
  window.addEventListener("resize", resizeAllCanvas);
 
    let fileArray = [];
  function handleFiles(files) { 
      if (!files || files.length === 0) return;
      for(let i = 0; i < files.length; i++) { 
          fileArray.push(files[i]); 
      } 
      renderFileList(); 
      let fileInput = document.getElementById('fileInput');
      if (fileInput) fileInput.value = '';
  }
  function removeFile(index) { 
      fileArray.splice(index, 1); 
      renderFileList(); 
  }
  function renderFileList() { 
      const list = document.getElementById('fileList'); 
      if (!list) return; 
      list.innerHTML = ""; 
      for(let idx = 0; idx < fileArray.length; idx++) {
          let file = fileArray[idx];
          let htmlStr = '<div style="display:flex; justify-content:space-between; align-items:center; background:#f2f4f6; padding:12px 16px; border-radius:10px; margin-bottom:8px; font-size:14px; font-weight:600; color:#333d4b;"><span> ' + (file.name || '알수없는파일') + '</span><span style="color:#ff4d4d; cursor:pointer;" onclick="removeFile(' + idx + ')">X</span></div>';
          list.innerHTML += htmlStr; 
      }
  }
    const compressImage = async (file) => { 
    return new Promise((resolve) => { 
      if (!file.type.startsWith('image/')) { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve({ name: file.name, data: reader.result.split(',')[1] }); return; } 
      const reader = new FileReader(); reader.readAsDataURL(file); 
      reader.onload = (event) => { 
        const img = new Image(); img.src = event.target.result; 
        img.onload = () => { 
          const canvas = document.createElement('canvas'); let width = img.width; let height = img.height; const max_size = 1200; 
          if (width > max_size || height > max_size) { if (width > height) { height *= max_size / width; width = max_size; } else { width *= max_size / height; height = max_size; } } 
          canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); 
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7); resolve({ name: file.name, data: dataUrl.split(',')[1] }); 
        }; 
      }; 
    }); 
  };
 

    async function finalSubmit() {
    const btn = document.getElementById('nextBtn');
    if (fileArray.length === 0) return alert("청구 서류를 첨부해 주세요.");
    
    btn.innerText = "전송 중..."; btn.disabled = true;
    try {
        const sameAsBeneRadio = document.querySelector('input[name="sameAsBene"]:checked')?.value || "no";
        if (sameAsBeneRadio === 'yes') {
            const fields = ['Name', 'Rrn', 'Phone', 'Address'];
            fields.forEach(k => {
                const insEl = document.getElementById('ins' + k);
                const beneEl = document.getElementById('bene' + k);
                if (insEl && beneEl) beneEl.value = insEl.value;
            });
        }
        const sameAsContRadio = document.querySelector('input[name="sameAsCont"]:checked')?.value || "no";
        if (sameAsContRadio === 'yes') {
            const fields = ['Name', 'Rrn', 'Phone', 'Address'];
            fields.forEach(k => {
                const insEl = document.getElementById('ins' + k);
                const contEl = document.getElementById('cont' + k);
                if (insEl && contEl) contEl.value = insEl.value;
            });
        }

        // --- 생명보험 계약자 자동복사 로직 추가 ---
        const diffInsuredContEl = document.getElementById('diffInsuredCont');
        if (diffInsuredContEl && !diffInsuredContEl.checked) {
            const fields = ['Name', 'Rrn', 'Phone', 'Address', 'Relation'];
            fields.forEach(k => {
                const insEl = document.getElementById('ins' + k);
                const contEl = document.getElementById('cont' + k);
                if (insEl && contEl && !contEl.value) {
                    contEl.value = insEl.value;
                }
            });
        }
        
        const payload = {};
        const inputs = document.querySelectorAll('.claim-app-container input, .claim-app-container select, .claim-app-container textarea');
        inputs.forEach(el => {
            if (el.type === 'radio' && !el.checked) return;
            if (el.id) payload[el.id] = el.value;
            if (el.name && el.type === 'radio') payload[el.name] = el.value;
        });

        const sigPads = ['sigInsured', 'sigContractor', 'sigBeneficiary', 'sigClaimant', 'sigGuide', 'sigBeneficiary_opt'];
        sigPads.forEach(id => {
            const inst = canvasInstances[id];
            if (inst && !isCanvasBlank(inst.canvas)) {
                payload[id] = inst.canvas.toDataURL('image/png').split(',')[1];
                if (id === 'sigClaimant') {
                    payload['sigClaimant_name'] = document.getElementById('sigClaimant_name')?.value || document.getElementById('contName')?.value || document.getElementById('insName')?.value || '';
                }
            }
                  });
  
                      payload.company = document.getElementById('companySelect')?.value || '';
              if ((document.getElementById('diffInsuredCont') && !document.getElementById('diffInsuredCont').checked) || payload.sameAsCont === 'yes') {
                  payload.insName = payload.insName || payload.contName || '';
                  payload.insRrn = payload.insRrn || payload.contRrn || '';
                  payload.insPhone = payload.insPhone || payload.contPhone || '';
                  payload.insAddress = payload.insAddress || payload.contAddress || '';

                  payload.contName = payload.contName || payload.insName || '';
                  payload.contRrn = payload.contRrn || payload.insRrn || '';
                  payload.contPhone = payload.contPhone || payload.insPhone || '';
                  payload.contAddress = payload.contAddress || payload.insAddress || '';

                  if (payload.sigInsured && !payload.sigBeneficiary) {
                      payload.sigBeneficiary = payload.sigInsured;
                  }
                  if (payload.sigInsured && !payload.sigContractor) {
                      payload.sigContractor = payload.sigInsured;
                  }
              }

              // --- Custom Mapping Logic for Life Insurance ---
              if (sameAsBeneRadio === 'yes') {
                if (payload.sigInsured && !payload.sigBeneficiary) {
                    payload.sigBeneficiary = payload.sigInsured;
                }
                if (payload.company === '하나생명') {
                    payload.beneName_P2 = payload.insName || '';
                    payload.sigBeneficiary_P2 = payload.sigInsured || '';
                    payload.beneName_P3 = payload.insName || '';
                    payload.sigBeneficiary_P3 = payload.sigInsured || '';
                    payload.insName_P3 = payload.insName || '';
                    payload.sigInsured_P3 = payload.sigInsured || '';
                }
                
            } else {
                if (selectedCategory === '생명보험') {
                    if (payload.company !== 'KB라이프') {
                        payload.insAddress = payload.beneAddress || '';
                    }
                }
            }

          // --- ID Verification Mapping Logic ---
          const isNonLife = selectedCategory !== '생명보험';
          if (isNonLife) {
              const unifiedType = document.querySelector('input[name="unified_idType"]:checked')?.value;
              if (unifiedType) {
                  payload['unified_idType'] = unifiedType;
                  const prefix = unifiedType === '주민등록증' ? 'idcard' : 'license';
                  const fields = ['idIssueDate', 'idIssueAuth', 'idLicenseNum', 'idLicenseAuth', 'idLicenseSerial'];
                  fields.forEach(f => {
                      const el = document.getElementById(`unified_${prefix}_${f}`);
                      if (el && el.value) {
                          payload[`unified_${f}`] = el.value;
                      }
                  });
              }
          } else {
              const lifeCompanyIdFieldMap = {
                  "삼성생명": "idVerification_Samsung",
                  "하나생명": "idVerification_Hana",
                  "처브라이프생명": "idVerification_Chubb",
                  "IM라이프": "idVerification_IM",
                  "ABL생명": "idVerification_ABL",
                  "신한라이프": "idVerification_Shinhan",
                  "라이나생명": "idVerification_Lina",
                  "미래에셋": "idVerification_Mirae",
                  "수호천사동양생명": "idVerification_Dongyang",
                  "DB생명": "idVerification_DB",
                  "KDB생명": "idVerification_KDB",
                  "메트라이프": "idVerification_MetLife",
                  "농협생명": "idVerification_Nonghyup"
              };
              const company = payload.company;
              if (lifeCompanyIdFieldMap[company]) {
                  const fieldId = lifeCompanyIdFieldMap[company];
                  const idTypeVal = document.querySelector(`input[name="${fieldId}_type"]:checked`)?.value;
                  if (idTypeVal) {
                      payload['unified_idType'] = idTypeVal === 'idcard' ? '주민등록증' : '운전면허증';
                  }
                  const fields = ['idIssueDate', 'idIssueAuth', 'idLicenseNum', 'idLicenseAuth', 'idLicenseSerial'];
                  fields.forEach(f => {
                      const val = payload[`${fieldId}_${f}`];
                      if (val) {
                          payload[`unified_${f}`] = val;
                      }
                  });
              }
          }
          const sameAsBeneVal = payload['sameAsBene'] || "no";
          if (sameAsBeneVal === 'yes') {
              
              // 1. 보이지 않는 피보험자 정보가 수익자에게 정상 매핑되도록 강제 주입
              payload.beneName = payload.insName || '';
              payload.beneRrn = payload.insRrn || '';
              payload.benePhone = payload.insPhone || '';
              payload.beneAddress = payload.insAddress || '';
              payload.beneRelation = "본인";

              // 2. 생명보험: 수익자 서명 1개만 활성화되므로 수익자 서명을 피보험자 서명으로 복사
              if (selectedCategory === '생명보험') {
                  if (payload.sigBeneficiary && !payload.sigInsured) {
                      payload.sigInsured = payload.sigBeneficiary;
                  }
              } else {
                  // 손해보험 기존 로직
                  if (payload.sigInsured && !payload.sigBeneficiary) {
                      payload.sigBeneficiary = payload.sigInsured;
                  } else if (!payload.sigInsured && payload.sigBeneficiary) {
                      payload.sigInsured = payload.sigBeneficiary;
                  }
              }
          }
          
          if (selectedCategory === "생명보험") {
              payload.contAddress = payload.beneAddress || '';
          }

          const base64Files = await Promise.all(fileArray.map(file => compressImage(file)));
        payload.attachedFiles = base64Files.map(f => 'data:image/jpeg;base64,' + f.data);
        payload.category = selectedCategory;

        if (selectedCategory === '질병상해') {
            const accTypeRadios = document.getElementsByName('accType_ds');
            let selectedAccType = '';
            for (const radio of accTypeRadios) {
                if (radio.checked) {
                    selectedAccType = radio.value;
                    break;
                }
            }
            if (selectedAccType === '질병') {
                payload.accType_ds = true;
            } else if (selectedAccType === '상해') {
                payload.accType_dh = true;
            }
        } else if (selectedCategory === '배상') {
            payload.accType_liability = true;
        }
        
        if (payload['accType_dh']) {
            if (payload['accType_dh'] === '질병') {
                payload.accType_ds = true;
                payload.accType_dh = false;
            } else if (payload['accType_dh'] === '재해') {
                payload.accType_dh = true;
                payload.accType_ds = false;
            }
        }

        // 카테고리가 '생명보험'인 경우 JSON 내부 데이터는 '질병상해'로 저장되어 있음
        let searchCategory = payload.category;
        if (searchCategory === '생명보험') {
            searchCategory = '질병상해';
        }

        let row;
        if (Array.isArray(mappingData)) {
            row = mappingData.find(r => r.category === searchCategory && r.company === payload.company);
            // 만약 못찾으면 통합 칼럼 "가입보험사—보험종류" (또는 유사이름) 이 있는지 확인
            if (!row) {
                row = mappingData.find(r => {
                    const combined = r["가입보험사—보험종류"] || r["가입보험사-보험종류"] || r["가입보험사_보험종류"] || "";
                    return combined.includes(payload.company) && combined.includes(searchCategory);
                });
            }
        } else {
            let sheetName = payload.company;
            if (searchCategory && searchCategory !== "생명") sheetName += "_" + searchCategory; if(!mappingData[sheetName]) { sheetName = payload.company; }
            row = mappingData[sheetName];
        }
        
        if (!row) {
            alert('해당 보험사의 양식을 찾을 수 없습니다.\n(선택한 보험사: ' + payload.company + ', 분류: ' + payload.category + ')');
            btn.innerText = '다시 시도';
            btn.disabled = false;
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        
        const progressWrap = document.getElementById('progressWrap');
        if (progressWrap) progressWrap.style.opacity = '1';

        const maxPages = 15;
        let pagesAdded = 0;

        for (let i = 1; i <= maxPages; i++) {
            const formUrlKey = 'formUrl_P' + i;
            if (!row[formUrlKey] || row[formUrlKey].trim() === '') continue;

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
                        const rawFormUrl = String(row[formUrlKey]).trim();
            // ImgBB 원본은 간헐적 TLS 행/CORS 차단 문제가 있으므로 고속 CDN 프록시를 1차로 로드
            const cdnProxyUrl = 'https://images.weserv.nl/?url=' + encodeURIComponent(rawFormUrl);
            
            const img = await new Promise((resolve, reject) => {
                let resolved = false;
                const tryResolve = (targetImg, srcLabel) => {
                    if (!resolved) {
                        resolved = true;
                        console.log('[양식 로딩 성공]', srcLabel);
                        resolve(targetImg);
                    }
                };

                // 1차: Cloudflare 기반 고속 CDN 프록시 로드 (확실한 CORS 헤더 및 캐시)
                const proxyImg = new Image();
                proxyImg.crossOrigin = 'Anonymous';
                proxyImg.onload = () => tryResolve(proxyImg, 'CDN 프록시');
                proxyImg.onerror = () => loadDirect();

                // 2차: 프록시 실패 시 원본 직접 로드
                const loadDirect = () => {
                    if (resolved) return;
                    console.warn('[CDN 프록시 실패, 원본 재시도]', rawFormUrl);
                    const directImg = new Image();
                    directImg.crossOrigin = 'Anonymous';
                    directImg.onload = () => tryResolve(directImg, '원본 서버');
                    directImg.onerror = () => {
                        if (!resolved) {
                            resolved = true;
                            reject(new Error('양식 이미지를 불러오는데 실패했습니다: ' + rawFormUrl));
                        }
                    };
                    directImg.src = rawFormUrl;
                };

                // CDN 프록시가 4초 내 응답 없을 때 원본 병렬 시도
                setTimeout(() => {
                    if (!resolved) loadDirect();
                }, 4000);

                proxyImg.src = cdnProxyUrl;
            });
            
            // 기존 좌표계가 800px 기준으로 세팅되었을 확률이 매우 높으므로 800으로 스케일링합니다.
            const baseWidth = 800;
            const scale = baseWidth / img.width;
            canvas.width = baseWidth;
            canvas.height = img.height * scale;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            ctx.font = "20px 'Malgun Gothic', 'Pretendard', sans-serif";
            ctx.fillStyle = 'black';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';

            const fieldNames = [
                'sameAsBene', 'sameAsCont', 'autoTransfer', 'diffInsuredCont',
                'insName', 'insRrn', 'insPhone', 'insAddress', 'insRelation',
                'contName', 'contRrn', 'contPhone', 'contAddress', 'docAddress', 'contRelation',
                'beneName', 'beneRrn', 'benePhone', 'beneAddress', 'beneRelation',
                'guideName', 'guidePhone', 'guideRelation',
                'bankName', 'bankAccount', 'bankOwner', 'bankOwnerRrn', 'bankOwnerRel',
                'accDate', 'accPlace', 'accDetails', 'hospitalName', 'diseaseName',
                'accType_ds', 'accType_dh', 'writeDate',
                'petName', 'petBreed', 'petGender', 'petColor',
                'unified_idType', 'unified_idIssueDate', 'unified_idIssueAuth',
                'unified_idLicenseNum', 'unified_idLicenseAuth', 'unified_idLicenseSerial',
                'sigInsured', 'sigContractor', 'sigBeneficiary', 'sigClaimant', 'sigGuide', 'petBirth', 'accType_ij', 'accType_ad', 'accType_pet', 'accType_liability', 'sigBeneficiary_opt', 'sigClaimant_name'
            ];

            for (const f of fieldNames) {
                for (const suffix of ['', '2', '3', '4', '5']) {
                    let xKey = f + (i === 1 ? '' : '_P' + i) + '_Left' + suffix;
                    let yKey = f + (i === 1 ? '' : '_P' + i) + '_Top' + suffix;

                    if (i === 1 && !(xKey in row) && ((f + '_P1_Left' + suffix) in row)) {
                        xKey = f + '_P1_Left' + suffix;
                        yKey = f + '_P1_Top' + suffix;
                    }

                    if (row[xKey] && row[yKey] && row[xKey] !== '-100' && row[yKey] !== '-100' && row[xKey] !== '') {
                        const x = parseFloat(row[xKey]);
                        const y = parseFloat(row[yKey]);
                        
                        let textToDraw = payload[f] || '';
                        
                        if (f === 'sameAsBene' || f === 'sameAsCont' || f === 'autoTransfer' || f === 'diffInsuredCont') {
                            if (payload[f] === true || payload[f] === 'yes') {
                                textToDraw = 'V';
                            } else {
                                textToDraw = '';
                            }
                        }

                        if (textToDraw) {
                            if (typeof textToDraw === 'string' && textToDraw.startsWith('iVBORw0KGgo')) {
                                const sigImg = new Image();
                                sigImg.src = 'data:image/png;base64,' + textToDraw;
                                await new Promise(r => { sigImg.onload = r; sigImg.onerror = r; });
                                ctx.drawImage(sigImg, x - 60, y - 30, 120, 60); // 서명을 뱃지 중앙(x, y)에 완벽하게 일치시키고 비율을 맞춤
                            } else {
                                ctx.fillText(textToDraw, x, y + 8); // 시각적 중앙을 맞추기 위해 약간 아래로(y+8) 보정
                            }
                        }
                    }
                }
            }

            const pageDataUrl = canvas.toDataURL('image/jpeg', 0.95);
            if (pagesAdded > 0) doc.addPage();
            doc.addImage(pageDataUrl, 'JPEG', 0, 0, 210, 297);
            pagesAdded++;
        }

        if (payload.attachedFiles && payload.attachedFiles.length > 0) {
            for (let i = 0; i < payload.attachedFiles.length; i++) {
                if (pagesAdded > 0) doc.addPage();
                try {
                    doc.addImage(payload.attachedFiles[i], 'JPEG', 0, 0, 210, 297);
                    pagesAdded++;
                } catch (e) {
                    console.error('첨부파일 추가 실패', e);
                }
            }
        }

        const userName = payload.insName || '고객';
        const fileName = payload.company + '_청구서_' + userName + '.pdf';

        // 수신 팩스번호 결정 (직접 입력값 우선, 없으면 insurance_fax_list.js 기본값 참조)
        let targetFaxNum = '';
        const faxInput = document.getElementById('faxNumber');
        if (faxInput && faxInput.value.trim()) {
            targetFaxNum = faxInput.value.trim().replace(/[^0-9-]/g, '');
        } else if (window.INSURANCE_FAX_DATA && typeof window.INSURANCE_FAX_DATA.getFax === 'function') {
            targetFaxNum = window.INSURANCE_FAX_DATA.getFax(payload.company);
        }

        const pdfBase64 = doc.output('datauristring').split(',')[1];

        btn.innerText = "서류 준비 완료";
        btn.disabled = false;

        // 전송 전 파일 확인창(PDF 미리보기 팝업 모달) 열기
        openPdfPreviewModal(doc, fileName, payload.company, targetFaxNum, pdfBase64, userName);

    } catch (e) { 
        alert("청구서 생성에 실패하였습니다: " + e.message); 
        btn.innerText = "다시 시도"; 
        btn.disabled = false; 
        console.error(e); 
    }
  }




// ==========================================
// [ 청구서 PDF 미리보기 모달 및 팩스 발송 파이프라인 ]
// ==========================================
let currentGeneratedPdfDoc = null;
let currentGeneratedPdfFileName = '';
let currentGeneratedPdfBase64 = '';
let currentTargetFaxNumber = '';
let currentTargetCompanyName = '';
let currentTargetClientName = '';

function openPdfPreviewModal(doc, fileName, company, faxNum, pdfBase64, clientName) {
  currentGeneratedPdfDoc = doc;
  currentGeneratedPdfFileName = fileName;
  currentGeneratedPdfBase64 = pdfBase64;
  currentTargetFaxNumber = faxNum || '';
  currentTargetCompanyName = company || '';
  currentTargetClientName = clientName || (document.getElementById('insName') && document.getElementById('insName').value.trim()) || (document.getElementById('userName') && document.getElementById('userName').value.trim()) || '고객';

  const modal = document.getElementById('pdfPreviewModal');
  const iframe = document.getElementById('pdfPreviewIframe');
  const subtitle = document.getElementById('pdfPreviewSubtitle');
  const sendBtn = document.getElementById('modalSendFaxBtn');

  if (subtitle) {
    if (currentTargetFaxNumber) {
      subtitle.innerText = currentTargetCompanyName + ' 보상과 팩스(' + currentTargetFaxNumber + ')로 발송 예정';
      subtitle.style.color = '#0284c7';
    } else {
      subtitle.innerText = currentTargetCompanyName + ' 보상과 (지정 팩스번호 없음 / PDF 다운로드 전용)';
      subtitle.style.color = '#e11d48';
    }
  }

  if (iframe) {
    try {
      const blobUrl = doc.output('bloburl');
      iframe.src = blobUrl;
    } catch (err) {
      console.warn('bloburl 생성 실패, dataurl 사용', err);
      iframe.src = doc.output('datauristring');
    }
  }

  if (sendBtn) {
    sendBtn.innerText = '확인 완료 · 팩스 전송';
    sendBtn.disabled = false;
  }

  if (modal) {
    modal.classList.add('active');
  }
}

function closePdfPreviewModal() {
  const modal = document.getElementById('pdfPreviewModal');
  if (modal) {
    modal.classList.remove('active');
  }
  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn) {
    nextBtn.innerText = '청구서 전송 / 확인';
    nextBtn.disabled = false;
  }
}

function downloadCurrentPdf() {
  if (currentGeneratedPdfDoc && currentGeneratedPdfFileName) {
    currentGeneratedPdfDoc.save(currentGeneratedPdfFileName);
  }
}

async function confirmAndSendFax() {
  const sendBtn = document.getElementById('modalSendFaxBtn');
  if (sendBtn) {
    sendBtn.innerText = '팩스 전송 중...';
    sendBtn.disabled = true;
  }

  // 1. 로컬 파일(file://) 환경인 경우 안내 (백엔드 서버 부재)
  if (window.location.protocol === 'file:') {
    alert(
      '[로컬 브라우저 테스트 안내]\n\n' +
      '현재 내 컴퓨터 로컬 파일(file://)로 실행 중이므로 백엔드 팩스 서버(/api/send-fax)가 연결되지 않습니다.\n\n' +
      '• 수신 대상: ' + currentTargetCompanyName + ' 보상과\n' +
      '• 수신 팩스: ' + (currentTargetFaxNumber || '미지정') + '\n\n' +
      'Vercel 등 서버에 업로드 시 실제 팝빌을 거쳐 팩스가 전송됩니다!\n' +
      '생성된 청구서 PDF를 기기에 저장합니다.'
    );
    downloadCurrentPdf();
    closePdfPreviewModal();
    return;
  }

  // 2. 수신 팩스번호 확인
  const cleanFaxNumber = currentTargetFaxNumber ? currentTargetFaxNumber.replace(/[^0-9]/g, '') : '';
  if (!cleanFaxNumber) {
    alert('발송할 팩스번호가 없습니다. PDF 다운로드로 진행합니다.');
    downloadCurrentPdf();
    closePdfPreviewModal();
    return;
  }

  // 3. 담당 설계사 정보(프로필) 및 추가 파라미터 추출
  const planner = (window.parent && window.parent.currentProfile) || window.currentProfile || {};
  let plannerPhone = planner.phone || planner.mobile || (planner.card_data && planner.card_data.phone) || localStorage.getItem('user_phone') || '';
  let plannerName = planner.nickname || planner.name || (planner.card_data && planner.card_data.name) || '담당자';

  let cleanPlannerCheck = (plannerPhone || '').replace(/[^0-9]/g, '');
  if (!cleanPlannerCheck || cleanPlannerCheck.length < 10) {
    const inputPhone = prompt('알림톡 전송 결과를 수신할 담당 설계사님의 휴대폰번호를 입력해 주세요.\n(예: 010-1234-5678)', '');
    if (inputPhone && inputPhone.trim()) {
      plannerPhone = inputPhone.trim();
      try { localStorage.setItem('user_phone', plannerPhone); } catch(e){}
    }
  }

  const pageCount = currentGeneratedPdfDoc ? currentGeneratedPdfDoc.internal.getNumberOfPages() : 1;
  let callCenter = '1588-1001';
  if (window.INSURANCE_FAX_DATA && window.INSURANCE_FAX_DATA.faxList && window.INSURANCE_FAX_DATA.faxList[currentTargetCompanyName]) {
    callCenter = window.INSURANCE_FAX_DATA.faxList[currentTargetCompanyName].phone || callCenter;
  }

  // 4. 실제 서버리스 API 호출 (/api/send-fax)
  try {
    const response = await fetch('/api/send-fax', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiverNumber: cleanFaxNumber,
        receiverName: currentTargetCompanyName + ' 보상과',
        pdfBase64: currentGeneratedPdfBase64,
        plannerPhone: plannerPhone,
        plannerName: plannerName,
        clientName: currentTargetClientName || '고객',
        companyName: currentTargetCompanyName,
        callCenter: callCenter,
        pageCount: pageCount
      })
    });

    const result = await response.json();
    if (result.success) {
      alert('팩스 전송 및 알림톡 접수 안내가 정상 처리되었습니다!\n(접수번호: ' + result.receiptNum + ')\n\n통신사 전송 완료 시 카카오톡 알림톡으로 최종 결과가 안내됩니다.\n확인용 PDF 파일도 기기에 저장합니다.');
      downloadCurrentPdf();
      closePdfPreviewModal();
      location.reload();
    } else {
      alert('팩스 전송에 실패했습니다: ' + (result.message || '알 수 없는 오류') + '\n\nPDF 파일은 기기에 안전하게 저장됩니다.');
      downloadCurrentPdf();
      if (sendBtn) {
        sendBtn.innerText = '다시 시도';
        sendBtn.disabled = false;
      }
    }
  } catch (error) {
    console.error('팩스 통신 오류:', error);
    alert('팩스 서버와 통신 중 오류가 발생했습니다.\n\nPDF 파일은 기기에 안전하게 저장됩니다.');
    downloadCurrentPdf();
    if (sendBtn) {
      sendBtn.innerText = '다시 시도';
      sendBtn.disabled = false;
    }
  }
}
