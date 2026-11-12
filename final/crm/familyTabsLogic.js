// familyTabsLogic.js
// Handles the 2-Tier Tab UI and state swapping for Family Household CRM Input

window.familyState = [];
window.activeFamilyId = null;
window.activeCategoryId = 1;

function initFamilyTabs(baseId, baseLabel) {
    window.initFamilyTabs = initFamilyTabs;
    if (window.disableInitFamilyTabs) return;

    const initialId = (baseId !== undefined && baseId !== null) ? String(baseId) : 'p_' + Date.now();
    const initialLabel = baseLabel || '계약자(이름 미정)';
    
    let familyMembers = [];
    if (typeof window.isEditMode !== 'undefined' && window.isEditMode && typeof globalCustomerData !== 'undefined') {
        const isFamilySub = /-\d+(?:-\d+)*$/.test(initialId);
        const rootIdStr = isFamilySub ? initialId.replace(/(-\d+)+$/, '') : initialId;
        const escRoot = rootIdStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const famSubRegex = new RegExp('^' + escRoot + '-\\d+(?:-\\d+)*$');

        familyMembers = globalCustomerData.filter(c => {
            const cId = String(c["고객번호"] || c["사업자번호"] || "").trim();
            return cId === rootIdStr || famSubRegex.test(cId);
        }).sort((a, b) => {
            const aId = String(a["고객번호"] || "").trim();
            const bId = String(b["고객번호"] || "").trim();
            if (aId === rootIdStr) return -1;
            if (bId === rootIdStr) return 1;
            const aParts = aId.split('-').map(p => parseInt(p, 10) || 0);
            const bParts = bId.split('-').map(p => parseInt(p, 10) || 0);
            const maxLen = Math.max(aParts.length, bParts.length);
            for (let i = 0; i < maxLen; i++) {
                const valA = aParts[i] !== undefined ? aParts[i] : -1;
                const valB = bParts[i] !== undefined ? bParts[i] : -1;
                if (valA !== valB) return valA - valB;
            }
            return 0;
        });
    }

    if (familyMembers.length > 0) {
        window.familyState = familyMembers.map((client, index) => {
            const cId = String(client["고객번호"]);
            const isRoot = (cId === initialId.split('-')[0]);
            const rel = client["가족사항"] || (isRoot ? "본인" : "가족");
            const nm = client["고객명"] || "";
            let _rel = rel; if(!isRoot && !_rel.includes('계약자')) _rel = '계약자의 ' + _rel; const displayLabel = isRoot ? (nm ? nm + ' (메인 계약자)' : '메인 계약자(이름 미정)') : (nm ? nm + ' (' + _rel + ')' : '이름 미정 (' + _rel + ')');
            
            let pData = undefined;
            if (typeof window.parsePetData === 'function') {
                const pets = window.parsePetData(client['반려동물'], client['동물이름'], client['코드'], client['동물생일'] || client['동물생년월일'], client['동물모색'], client['동물성별']);
                const hasPet = pets.length > 0 || (client['반려동물'] && client['반려동물'] !== '무' && client['반려동물'] !== '없음' && client['반려동물'] !== '-');
                pData = {
                    isChecked: hasPet,
                    rows: pets
                };
            }
            return {
                id: cId,
                label: displayLabel,
                isRoot: isRoot,
                data: { ...client },
                petData: pData,
                insHtml: '',
                isSaved: true
            };
        });
        
        let activeIdx = window.familyState.findIndex(f => f.id === initialId);
        window.activeFamilyId = activeIdx >= 0 ? window.familyState[activeIdx].id : window.familyState[0].id;
    } else {
        window.familyState = [{
            id: initialId,
            label: initialLabel,
            isRoot: true,
            data: { "고객번호": initialId },
            insHtml: '',
            isSaved: (typeof window.isEditMode !== 'undefined' && window.isEditMode)
        }];
        window.activeFamilyId = window.familyState[0].id;
    }
    window.activeCategoryId = 1;
    
    const form = document.getElementById('crmRegForm');
    if (!form) return;
    
    document.querySelectorAll('#tier-1-tabs').forEach(el => el.remove());
    document.querySelectorAll('#tier-2-tabs').forEach(el => el.remove());
    document.querySelectorAll('#wizard-bottom-nav').forEach(el => el.remove());
    document.querySelectorAll('.sian-main-wrapper').forEach(el => {
        el.parentNode.insertBefore(form, el);
        el.remove();
    });

    const isNew = !window.isEditMode;
    if(isNew) { document.body.classList.add('mode-new'); } else { document.body.classList.remove('mode-new'); }

    const mainWrapper = document.createElement('div');
    mainWrapper.className = 'sian-main-wrapper';
    mainWrapper.style.padding = '0'; mainWrapper.style.display = 'flex'; mainWrapper.style.flex = '1'; mainWrapper.style.overflow = 'hidden'; mainWrapper.style.width = '100%'; mainWrapper.style.boxSizing = 'border-box';
    
    const defaultSubmit = form.querySelector('button[type="submit"]');
    if (defaultSubmit && defaultSubmit.parentElement) {
        defaultSubmit.parentElement.style.display = isNew ? 'none' : 'flex';
    }
    
    // Hide injected edit-save buttons in New Registration Mode
    const editSaveBtns = form.querySelectorAll('.edit-save-btn');
    editSaveBtns.forEach(btn => {
        btn.style.display = isNew ? 'none' : 'flex';
    });

    if (isNew) {
        mainWrapper.style.flexDirection = 'row';
        mainWrapper.style.background = '#f8fafc';
        
        const isSingle = (window.wizardMode === 'single');
        const famSidebar = document.createElement('div');
        famSidebar.id = 'tier-1-tabs';
        famSidebar.className = 'family-sidebar-wizard';
        famSidebar.style.width = '240px'; famSidebar.style.minWidth = '240px'; famSidebar.style.background = '#ffffff'; famSidebar.style.borderRight = '1px solid #e2e8f0'; famSidebar.style.padding = '20px 10px'; famSidebar.style.display = isSingle ? 'none' : 'flex'; famSidebar.style.flexDirection = 'column'; famSidebar.style.gap = '8px'; famSidebar.style.position = 'relative'; famSidebar.style.overflowY = 'auto';

        const rightArea = document.createElement('div');
        rightArea.style.flex = '1'; rightArea.style.display = 'flex'; rightArea.style.flexDirection = 'column'; rightArea.style.overflow = 'hidden';

        const stepper = document.createElement('div');
        stepper.id = 'tier-2-tabs';
        stepper.className = 'stepper-wizard';
        stepper.style.display = 'flex'; stepper.style.padding = '12px 24px'; stepper.style.background = '#ffffff'; stepper.style.borderBottom = '1px solid #e2e8f0'; stepper.style.gap = '16px'; stepper.style.alignItems = 'center';
        
        const catData = [
            { id: 1, name: "1차 정보", desc: "기본 인적사항" },
            { id: 2, name: "터치인사이트", desc: "고객 관심사 분석" },
            { id: 3, name: "보험 가입 내역", desc: "보장 분석 및 관리" }
        ];
        
        catData.forEach(cat => {
            const stepBtn = document.createElement('div');
            stepBtn.className = 'nav-item step-item';
            stepBtn.setAttribute('data-cat', cat.id);
            stepBtn.style.flex = '1'; stepBtn.style.padding = '10px 16px'; stepBtn.style.borderRadius = '12px'; stepBtn.style.border = '1px solid #e2e8f0'; stepBtn.style.background = '#f8fafc'; stepBtn.style.cursor = 'pointer'; stepBtn.style.display = 'flex'; stepBtn.style.flexDirection = 'column'; stepBtn.style.gap = '4px'; stepBtn.style.transition = '0.2s';
            stepBtn.innerHTML = '<div style="font-size:11px; font-weight:800; color:#94a3b8;" class="step-num">STEP ' + cat.id + '</div><div style="font-size:14px; font-weight:800; color:#1e293b;" class="step-title">' + cat.name + '</div>';
            stepBtn.onclick = () => { if (typeof window.switchCategoryTab === 'function') window.switchCategoryTab(cat.id); };
            stepper.appendChild(stepBtn);
        });

        const formWrapper = document.createElement('div');
        formWrapper.style.flex = '1'; formWrapper.style.overflow = 'hidden'; formWrapper.style.display = 'flex'; formWrapper.style.flexDirection = 'column';
        
        const bottomNav = document.createElement('div');
        bottomNav.id = 'wizard-bottom-nav';
        bottomNav.style.padding = '12px 24px'; bottomNav.style.background = '#ffffff'; bottomNav.style.borderTop = '1px solid #e2e8f0'; bottomNav.style.display = 'flex'; bottomNav.style.justifyContent = 'space-between'; bottomNav.style.alignItems = 'center'; bottomNav.style.flexShrink = '0'; bottomNav.style.position = 'sticky'; bottomNav.style.bottom = '0'; bottomNav.style.zIndex = '20'; bottomNav.style.borderRadius = '0 0 20px 0';

        form.parentNode.insertBefore(mainWrapper, form);
        mainWrapper.appendChild(famSidebar);
        mainWrapper.appendChild(rightArea);
        rightArea.appendChild(stepper);
        rightArea.appendChild(formWrapper);
        formWrapper.appendChild(form);
        rightArea.appendChild(bottomNav);

    } else {
        mainWrapper.style.flexDirection = 'column';
        
        const tabContainer = document.createElement('div');
        tabContainer.id = 'tier-1-tabs';
        tabContainer.className = 'family-tabs';
        tabContainer.style.position = 'relative';
    
        const containerWrapper = document.createElement('div');
        containerWrapper.className = 'sian-container'; containerWrapper.style.display = 'flex'; containerWrapper.style.flex = '1'; containerWrapper.style.background = 'white'; containerWrapper.style.border = '1px solid #cbd5e1'; containerWrapper.style.borderTop = 'none'; containerWrapper.style.overflow = 'hidden';
    
        const catContainer = document.createElement('div');
        catContainer.id = 'tier-2-tabs';
        catContainer.className = 'sidebar'; catContainer.style.width = '220px'; catContainer.style.minWidth = '220px'; catContainer.style.background = '#ffffff'; catContainer.style.borderRight = '1px solid #e2e8f0'; catContainer.style.padding = '20px 10px'; catContainer.style.boxSizing = 'border-box'; catContainer.style.flexShrink = '0'; catContainer.style.display = 'flex'; catContainer.style.flexDirection = 'column'; catContainer.style.gap = '5px';
        
        const catData = [
            { id: 1, name: "1차 정보", icon: "fa-user" },
            { id: 2, name: "터치인사이트", icon: "fa-chart-pie" },
            { id: 3, name: "보험 가입 내역", icon: "fa-shield-halved" }
        ];
        
        catData.forEach(cat => {
            const btn = document.createElement('div');
            btn.className = 'nav-item'; btn.style.padding = '14px 20px'; btn.style.color = '#475569'; btn.style.fontSize = '15px'; btn.style.fontWeight = '700'; btn.style.cursor = 'pointer'; btn.style.borderRadius = '8px'; btn.style.display = 'flex'; btn.style.justifyContent = 'space-between'; btn.style.alignItems = 'center';
            btn.setAttribute('data-cat', cat.id);
            btn.innerHTML = '<div style="display:flex; align-items:center; gap:8px;"><i class="fa-solid ' + cat.icon + '" style="color:#94a3b8; width:16px;"></i> ' + cat.name + '</div><i class="fa-solid fa-chevron-right" style="font-size:11px; color:#cbd5e1;"></i>';
            btn.onclick = () => { if (typeof window.switchCategoryTab === 'function') window.switchCategoryTab(cat.id); };
            catContainer.appendChild(btn);
        });
    
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'content'; contentWrapper.style.padding = '0'; contentWrapper.style.flex = '1'; contentWrapper.style.display = 'flex'; contentWrapper.style.flexDirection = 'column'; contentWrapper.style.overflow = 'hidden'; contentWrapper.style.minWidth = '0';
    
        form.parentNode.insertBefore(mainWrapper, form);
        mainWrapper.appendChild(tabContainer);
        mainWrapper.appendChild(containerWrapper);
        containerWrapper.appendChild(catContainer);
        containerWrapper.appendChild(contentWrapper);
        contentWrapper.appendChild(form);
    }

    renderFamilyTabs();
    if (typeof window.upgradeAllInsurancesToSmartUI === 'function') window.upgradeAllInsurancesToSmartUI();
    if (typeof window.switchCategoryTab === 'function') window.switchCategoryTab(1);
}

function renderFamilyTabs() {
    window.renderFamilyTabs = renderFamilyTabs;
    const t1 = document.getElementById('tier-1-tabs');
    if (!t1) return;
    
    const isNew = !window.isEditMode;
    const isSingle = (window.wizardMode === 'single');
    
    if (isNew && isSingle) {
        t1.style.display = 'none';
        if (typeof window.renderWizardBottomNav === 'function') window.renderWizardBottomNav();
        return;
    }
    
    if(isNew) { 
        document.body.classList.add('mode-new'); 
        t1.style.display = 'flex';
    } else { 
        document.body.classList.remove('mode-new'); 
        t1.style.display = '';
    }
    let html = '';
    
    if (isNew) {
        html += '<div style="font-size:14px; font-weight:800; color:#1e293b; margin-bottom:12px; padding-left:10px;">가족 목록</div>';
        window.familyState.forEach(f => {
            const isActive = f.id === window.activeFamilyId;
            const activeStyle = isActive ? "background:#eff6ff; border-color:#3b82f6; color:#1e40af;" : "background:#ffffff; border-color:#e2e8f0; color:#475569;";
            html += "<div onclick=\"switchFamilyTab('" + f.id + "')\" style=\"padding:14px 16px; border-radius:10px; border:1px solid; margin-bottom:8px; cursor:pointer; font-weight:700; transition:0.2s; " + activeStyle + "\">";
            html += (f.isRoot ? '' : '') + ' ' + f.label;
            html += "</div>";
        });
        html += "<div onclick=\"addFamilyTab()\" style=\"padding:14px 16px; border-radius:10px; border:1px dashed #cbd5e1; background:#f8fafc; color:#64748b; cursor:pointer; font-weight:700; text-align:center; transition:0.2s;\" onmouseover=\"this.style.background='#f1f5f9'\" onmouseout=\"this.style.background='#f8fafc'\"><i class=\"fa-solid fa-plus\"></i> 가족 구성원 추가</div>";
    } else {
        window.familyState.forEach(f => {
            const activeClass = f.id === window.activeFamilyId ? " active" : "";
            html += "<div class=\"fam-tab" + activeClass + "\" onclick=\"switchFamilyTab('" + f.id + "')\">";
            html += (f.isRoot ? '' : '') + ' ' + f.label;
            html += "</div>";
        });
        html += "<div class=\"fam-tab fam-tab-add\" onclick=\"addFamilyTab()\">가족 추가</div>";
        html += "<button type=\"button\" onclick=\"if(typeof closeRegModal === 'function') closeRegModal()\" style=\"position: absolute; right: 15px; bottom: 10px; width: 30px; height: 30px; background:white; border:1px solid #cbd5e1; border-radius:6px; font-size:14px; color:#64748b; cursor:pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition:0.2s;\" onmouseover=\"this.style.color='#ef4444'; this.style.borderColor='#ef4444';\" onmouseout=\"this.style.color='#64748b'; this.style.borderColor='#cbd5e1';\"><i class=\"fa-solid fa-xmark\"></i></button>";
    }
    t1.innerHTML = html;
    if (typeof window.renderWizardBottomNav === 'function') window.renderWizardBottomNav();
}

function addFamilyTab() {
    const modal = document.getElementById('family-add-modal');
    if (modal) {
        document.getElementById('fam-add-rel').value = '';
        document.getElementById('fam-add-name').value = '';
        modal.style.display = 'flex';
        document.getElementById('fam-add-rel').focus();
    } else {
        // Fallback
        const newName = prompt("추가할 가족의 호칭 또는 이름을 입력하세요 (예: 아내, 자녀)");
        if (!newName) return;
        saveCurrentFormToState();
        const newId = window.familyState[0].id + '-' + window.familyState.length;
          window.familyState.push({ id: newId, label: newName, isRoot: false, data: { "고객번호": newId }, insHtml: '' });
        switchFamilyTab(newId);
    }
}

window.confirmFamilyAdd = function() {
    const relInput = document.getElementById('fam-add-rel').value.trim();
    const nameInput = document.getElementById('fam-add-name').value.trim();
    
    if (!relInput) {
        alert("가족 관계를 입력해주세요! (예: 배우자, 자녀)");
        return;
    }
    
    let _relInput = relInput; if(!_relInput.includes('계약자')) _relInput = '계약자의 ' + _relInput; const displayLabel = nameInput ? nameInput + ' (' + _relInput + ')' : '이름 미정 (' + _relInput + ')';
    
    saveCurrentFormToState();
    const newId = window.familyState[0].id + '-' + window.familyState.length;
    
    window.familyState.push({
        id: newId,
        label: displayLabel,
        isRoot: false,
        data: {
            "고객번호": newId,
            "가족사항": relInput,
            "고객명": nameInput
        },
        insHtml: ''
    });
    
    document.getElementById('family-add-modal').style.display = 'none';
    switchFamilyTab(newId);
};

function switchFamilyTab(personId) {
    if (window.activeFamilyId === personId) return;
    saveCurrentFormToState();
    window.activeFamilyId = personId;
    loadStateToForm(personId);
    let target = window.familyState.find(f => f.id === personId);
    if (target) appendMirroredInsurances(target);
    
    renderFamilyTabs();
    
    // Update dashboard view if we are in Read-Only mode
        if (window.currentFormMode === 'detail' && typeof window.renderReadonlyDashboard === 'function') {
        window.renderReadonlyDashboard();
    }
    
    window.scrollTo(0, 0);
    if (typeof window.switchCategoryTab === "function") window.switchCategoryTab(1);
    const scrollEl = document.querySelector('#crmRegForm .modal-body') || document.querySelector('.modal-body');
    if (scrollEl) scrollEl.scrollTo(0, 0);
    
    if (typeof window.upgradeAllInsurancesToSmartUI === 'function') {
        window.upgradeAllInsurancesToSmartUI();
    }
}

function switchCategoryTab(catId) {
    window.activeCategoryId = catId;
    
    // Update tier-2 UI
    document.querySelectorAll('#tier-2-tabs .nav-item').forEach(btn => {
        if (parseInt(btn.getAttribute('data-cat')) === catId) {
            btn.classList.add('active');
            if (btn.classList.contains('step-item')) {
                btn.style.borderColor = '#1e293b';
                btn.style.background = '#ffffff';
                btn.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)';
                const num = btn.querySelector('.step-num');
                if (num) num.style.color = '#3b82f6';
            }
        } else {
            btn.classList.remove('active');
            if (btn.classList.contains('step-item')) {
                btn.style.borderColor = '#e2e8f0';
                btn.style.background = '#f8fafc';
                btn.style.boxShadow = 'none';
                const num = btn.querySelector('.step-num');
                if (num) num.style.color = '#94a3b8';
            }
        }
    });
    if (typeof window.renderWizardBottomNav === 'function') window.renderWizardBottomNav();
    
    // Show correct form step
    document.getElementById('step-1').style.display = (catId === 1) ? 'block' : 'none';
    document.getElementById('step-2').style.display = (catId === 2) ? 'block' : 'none';
    document.getElementById('step-3').style.display = (catId === 3) ? 'block' : 'none';
    const step4 = document.getElementById('step-4');
    if (step4) step4.style.display = (catId === 4) ? 'block' : 'none';
    
    // Also run app.js showStep just in case (to sync its internal state)
    if (typeof window.showStep === 'function') {
        currentStep = catId; 
    }
    if (window.currentFormMode === 'detail' && typeof window.renderReadonlyDashboard === 'function') {
        window.renderReadonlyDashboard();
    }
    
    window.scrollTo(0, 0);
    const scrollEl = document.querySelector('#crmRegForm .modal-body') || document.querySelector('.modal-body');
    if (scrollEl) scrollEl.scrollTo(0, 0);
    
    if (typeof window.upgradeAllInsurancesToSmartUI === 'function') {
        window.upgradeAllInsurancesToSmartUI();
    }
    
    // If in Read-Only mode, force a re-render of the dashboard to show the clicked category's data
    if (typeof window.isReadonly !== 'undefined' && window.isReadonly && window.activeFamilyId) {
        switchFamilyTab(window.activeFamilyId);
    }
}

window.isClientContractorOfInsurance = function(ins, clientOrTab) {
    if (!ins) return false;
    const clean = (s) => String(s || '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, '');
    const data = (clientOrTab && clientOrTab.data) ? clientOrTab.data : (clientOrTab || {});
    const myName = clean(data['고객명'] || data['이름'] || data['대표자명'] || (clientOrTab && clientOrTab.label) || '');
    const myId = String(data['고객번호'] || (clientOrTab && clientOrTab.id) || '').trim();

    let cName = clean(ins['계약자'] || ins['차_계약자'] || '');
    let cId = String(ins['계약자_id'] || ins['차_계약자_id'] || '').trim();

    if (!cName || cName === '본인') return true;
    if (cId && myId && cId === myId) return true;
    if (cName && myName && cName === myName) return true;

    if (window.familyState && window.familyState.length > 0) {
        const otherContractor = window.familyState.find(f => {
            if (f.id === (clientOrTab && clientOrTab.id)) return false;
            const fName = clean(f.data && f.data['고객명'] ? f.data['고객명'] : f.label);
            const fId = String((f.data && f.data['고객번호']) || f.id || '').trim();
            if (cId && fId && cId === fId) return true;
            if (cName && fName && cName === fName) return true;
            return false;
        });
        if (otherContractor) {
            return false;
        }
    }

    return true;
};

function saveCurrentFormToState() {
    if (!window.activeFamilyId) return;
    let target = window.familyState.find(f => f.id === window.activeFamilyId);
    if (!target) return;
    
    const form = document.getElementById("crmRegForm");
    if (!form) return;
    
    const dataObj = {};
    form.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.closest('#insurance-area')) return; // handled separately
        if (el.type === 'file') return;
        
        const key = el.name || el.id;
        if (!key) return;
        
        if (el.type === 'checkbox' || el.type === 'radio') {
            dataObj[key] = el.checked;
        } else {
            dataObj[key] = el.value;
        }
    });
    
    // Handle dynamic insurance list
    const insListDom = document.getElementById('insurance-area');
    if (insListDom) {
        insListDom.querySelectorAll('input, select, textarea').forEach(el => {
            if (el.type === 'checkbox' || el.type === 'radio') {
                if (el.checked) el.setAttribute('checked', 'checked');
                else el.removeAttribute('checked');
            } else if (el.tagName === 'SELECT') {
                el.querySelectorAll('option').forEach(opt => {
                    if (opt.value === el.value) opt.setAttribute('selected', 'selected');
                    else opt.removeAttribute('selected');
                });
            } else {
                el.setAttribute('value', el.value);
            }
        });
        const editableEntries = Array.from(insListDom.querySelectorAll('.insurance-entry:not(.mirrored-entry)'));
        target.insHtml = editableEntries.map(e => e.outerHTML).join('');
    }
    
    target.data = { ...(target.data || {}), ...dataObj };
    if (typeof window.getPetSerializedData === 'function') {
        const petSer = window.getPetSerializedData();
        dataObj['반려동물'] = petSer.species;
        dataObj['동물이름'] = petSer.names;
        dataObj['코드'] = petSer.codes;
        dataObj['동물생일'] = petSer.births;
        dataObj['동물모색'] = petSer.colors;
        dataObj['동물성별'] = petSer.genders;
    }
    if (typeof window.getPetRowsData === 'function') {
        target.petData = window.getPetRowsData();
    }
    
        // Update tab label if name changed or relationship changed
    if (target.isRoot) {
        const rootNm = dataObj['고객명'] || (target.data && target.data['고객명']);
        target.label = rootNm ? rootNm + ' (메인 계약자)' : '메인 계약자(이름 미정)';
    } else {
        const rel = dataObj['가족_관계'] || dataObj['가족사항'] || (target.data && target.data['가족_관계']) || (target.data && target.data['가족사항']) || '가족';
        if (target.data) {
            target.data['가족_관계'] = rel;
            if (!target.data['가족사항']) target.data['가족사항'] = rel;
        }
        let _rel = rel; if(!_rel.includes('계약자')) _rel = '계약자의 ' + _rel; 
        const curName = dataObj['고객명'] || (target.data && target.data['고객명']) || '';
        target.label = curName ? curName + ' (' + _rel + ')' : '이름 미정 (' + _rel + ')';
    }
    renderFamilyTabs();
    
    if (window.familyState && window.familyState.length > 1) {
        const rootMember = window.familyState[0];
        const isNew = !window.isEditMode;
        // In new registration mode or when rootMember's 가족사항 is blank, auto-synthesize familyStr
        if (isNew || !rootMember.data['가족사항']) {
            const familyStr = window.familyState
                .filter(f => !f.isRoot)
                .map(f => {
                    const fRel = (f.data && (f.data['가족_관계'] || f.data['가족사항'])) || '가족';
                    const fName = (f.data && f.data['고객명']) || '이름미상';
                    return fRel + '(' + fName + ')';
                })
                .filter(Boolean)
                .join(', ');
                
            if (familyStr) {
                rootMember.data['가족사항'] = familyStr;
                if (window.activeFamilyId === rootMember.id) {
                    const fsInput = document.querySelector('input[name="가족사항"]');
                    if (fsInput && !fsInput.value) fsInput.value = familyStr;
                }
            }
        }
    }
}

function loadStateToForm(personId) {
    let target = window.familyState.find(f => f.id === personId);
    if (!target) return;
    
    const form = document.getElementById("crmRegForm");
    if (!form) return;
    
    form.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.closest('#insurance-area')) return;
        if (el.type === 'file') return;
        
        const key = el.name || el.id;
        if (!key) return;
        
        if (target.data[key] !== undefined) {
            if (el.type === 'checkbox' || el.type === 'radio') {
                el.checked = target.data[key] === true || target.data[key] === 'true' || target.data[key] === 'TRUE';
            } else {
                el.value = target.data[key];
            }
        } else {
            if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
            else el.value = '';
        }
    });

    // Manually restore UI lock states without triggering destructive change events
    const noPhoneCb = document.getElementById('no-phone-cb');
    const bp = document.getElementById('base-phone');
    if (noPhoneCb && bp) {
        bp.disabled = noPhoneCb.checked;
        noPhoneCb.parentNode.style.background = noPhoneCb.checked ? '#cbd5e1' : '#f1f5f9';
    }

    const diffAddrCb = document.getElementById('diff-address-cb');
    if (diffAddrCb) {
        diffAddrCb.parentNode.style.background = diffAddrCb.checked ? '#cbd5e1' : '#f1f5f9';
    }
    
    // Restore insurances
    const insListDom = document.getElementById('insurance-area');
    if (insListDom) {
        if (target.insHtml) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = target.insHtml;
            const entries = tempDiv.querySelectorAll('.insurance-entry');
            const clean = (s) => String(s || '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, '');
            const myName = clean(target.data['고객명']);
            const myId = String(target.data['고객번호'] || target.id).trim();

            let hasValid = false;
            entries.forEach(entry => {
                const activeTypeSel = entry.querySelector('input[name="보험종류"]');
                const activeType = activeTypeSel ? activeTypeSel.value : '장기보험';
                const prefix = activeType === '자동차보험' ? '차_' : '';

                const cInp = entry.querySelector('input[name="' + prefix + '계약자"]');
                const cIdInp = entry.querySelector('input[name="' + prefix + '계약자_id"]');

                const cN = clean(cInp ? cInp.value : '');
                const cI = cIdInp ? String(cIdInp.value || '').trim() : '';

                const isContractor = (!cN || cN === '본인' || cN === myName || (cI && myId && cI === myId));
                if (!isContractor) {
                    entry.remove();
                } else {
                    hasValid = true;
                }
            });

            if (hasValid) {
                insListDom.innerHTML = tempDiv.innerHTML;
            } else {
                insListDom.innerHTML = '';
            }
        } else if (target.data["가입내역"] || (target.data["보험가입리스트"] && target.data["보험가입리스트"].length > 0)) {
            // If insHtml is empty but data exists (e.g. loaded from DB), regenerate it!
            insListDom.innerHTML = '';
            try {
                let insArr = [];
                if (target.data["가입내역"]) {
                    insArr = typeof target.data["가입내역"] === 'string' ? JSON.parse(target.data["가입내역"]) : target.data["가입내역"];
                }
                if ((!Array.isArray(insArr) || insArr.length === 0) && Array.isArray(target.data["보험가입리스트"])) {
                    insArr = target.data["보험가입리스트"];
                }
                if (Array.isArray(insArr) && typeof window.addInsuranceFields === 'function') {
                    window.insCount = 0;
                    insArr.forEach(ins => {
                        if (typeof window.isClientContractorOfInsurance === 'function') {
                            if (window.isClientContractorOfInsurance(ins, target)) {
                                window.addInsuranceFields(ins);
                            }
                        } else {
                            window.addInsuranceFields(ins);
                        }
                    });
                }
            } catch(e) {}
        } else {
            insListDom.innerHTML = '';
        }
    }
    
    // Restore pets
    if (typeof window.restorePetRowsFromData === 'function' && target.petData !== undefined) {
        window.restorePetRowsFromData(target.petData);
    } else if (typeof window.restorePetRows === 'function') {
        window.restorePetRows(target.data);
    }
    
    // --- ANTIGRAVITY 터치인사이트 UI 동기화 ---
    const insightHidden = document.getElementById('form-insight-data');
    if (insightHidden) {
        const arr = (insightHidden.value || '').split(',').map(s => s.trim()).filter(Boolean);
        document.querySelectorAll('.insight-pill input[type="checkbox"]').forEach(cb => {
            cb.checked = arr.includes(cb.value);
        });
    }
    
        // --- Toggle Family Fields ---
    if (target.isRoot) {
        document.querySelectorAll('.family-fields').forEach(el => el.style.display = 'none');
    } else {
        document.querySelectorAll('.family-fields').forEach(el => el.style.display = 'block');
    }
    // --- ANTIGRAVITY 주소다름 연동 ---
    const diffCbLabel = document.getElementById('diff-address-label');
    const diffCb = document.getElementById('diff-address-cb');
    if (diffCbLabel && diffCb) {
        if (target.isRoot) {
            diffCbLabel.style.display = 'none';
        } else {
            diffCbLabel.style.display = 'flex';
            if (target.data['diff_address'] === true || target.data['diff_address'] === 'true') {
                diffCb.checked = true;
                diffCb.parentNode.style.background = '#cbd5e1';
            } else {
                diffCb.checked = false;
                diffCb.parentNode.style.background = '#f1f5f9';
                // 강제 복사 (if empty or sync)
                if (window.familyState && window.familyState[0]) {
                    const rootData = window.familyState[0].data;
                    document.getElementById('base-address').value = rootData['기본주소'] || '';
                    document.getElementById('detail-address').value = rootData['상세주소입력'] || '';
                }
            }
        }
    }
    window.activeFamilyId = personId;
    renderFamilyTabs();
}

// Hook into the edit mode as well
var origFillCrmRegForm = window.fillCrmRegForm;
if (origFillCrmRegForm) {
    window.fillCrmRegForm = function(targetData) {
        origFillCrmRegForm(targetData);
        // After filling, we should initialize the tab system with THIS person's data.
        setTimeout(() => {
            // initFamilyTabs(); removed to prevent overwrite
            // The DOM now has the edited person's data. We need to save it to state.
            window.familyState[0].label = targetData['고객명'] ? targetData['고객명'] + ' (메인 계약자)' : '메인 계약자(이름 미정)';
            saveCurrentFormToState();
        }, 100);
    };
}


// --- Phase 3: Smart Insurance UI ---

window.upgradeAllInsurancesToSmartUI = function() {
    // Generate latest pillsHtml
    let pillsHtml = '';
    if (window.familyState) {
        window.familyState.forEach(f => {
            let _rel = f.data['가족_관계'] || '가족'; if(!_rel.includes('계약자')) _rel = '계약자의 ' + _rel; let fName = f.data['고객명'] ? f.data['고객명'] : (f.isRoot ? '메인 계약자' : _rel);
            let fId = f.data['고객번호'] || f.id;
            pillsHtml += '<button type="button" class="ins-pill-btn" data-id="' + fId + '" data-name="' + fName + '">' + fName + '</button>';
        });
    }
    pillsHtml += '<button type="button" class="ins-pill-btn outsider-btn" data-id="" data-name="">외부인(직접입력)</button>';
    
    // 1. Refresh existing injected cards
    const existingCards = document.querySelectorAll('.smart-ins-injected');
    existingCards.forEach(card => {
        const groups = card.querySelectorAll('.pill-group');
        groups.forEach(group => {
            group.innerHTML = pillsHtml;
        });
        initSmartInsPills(card);
    });

    if (!document.getElementById('smart-ins-pill-css')) {
        const style = document.createElement('style');
        style.id = 'smart-ins-pill-css';
        style.innerHTML = '.ins-pill-btn { padding: 8px 16px; border-radius: 20px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; } .ins-pill-btn:hover { background: #f1f5f9; } .ins-pill-btn.active { background: #3b82f6; color: white; border-color: #3b82f6; }';
        document.head.appendChild(style);
    }
    
    if (!window.familyState || window.familyState.length === 0) return;
    if (!window.familyState[0] || !window.familyState[0].label) return;
    
    const cards = document.querySelectorAll('.insured-person-card:not(.smart-ins-injected)');
    cards.forEach(card => {
        card.classList.add('smart-ins-injected');
        
        const isCar = card.closest('[id^="ins-car-"]') !== null;
        const prefix = isCar ? '차_' : '';
        
                                        const cInp = card.querySelector('input[name="' + prefix + '계약자"]');
        const iInp = card.querySelector('input[name="' + prefix + '피보험자"]');
        const cIdInp = card.querySelector('input[name="' + prefix + '계약자_id"]');
        const iIdInp = card.querySelector('input[name="' + prefix + '피보험자_id"]');
        
        const activeF = (window.familyState && window.activeFamilyId) ? window.familyState.find(x => x.id === window.activeFamilyId) : (window.familyState ? window.familyState[0] : null);
        const activeName = (activeF && activeF.data && activeF.data['고객명']) ? activeF.data['고객명'] : (window.familyState && window.familyState[0] && window.familyState[0].data['고객명'] ? window.familyState[0].data['고객명'] : '본인');

        let cVal = cInp && cInp.value ? cInp.value.trim() : activeName;
        let iVal = iInp && iInp.value ? iInp.value.trim() : activeName;
        
        const cleanStr = (s) => String(s || '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, '');
        
        let cIdVal = cIdInp && cIdInp.value ? cIdInp.value : "";
        if (!cIdVal) {
            let m = window.familyState.find(f => {
                let _rel = f.data['가족_관계'] || '가족'; if(!_rel.includes('계약자')) _rel = '계약자의 ' + _rel;
                let fName = f.data['고객명'] ? f.data['고객명'] : (f.isRoot ? '메인 계약자' : _rel);
                return fName === cVal || (f.isRoot && (cVal === '본인' || cVal === '계약자' || cVal === '메인 계약자'));
            });
            cIdVal = m ? (m.data['고객번호'] || m.id) : "outsider";
        }

        let iIdVal = iIdInp && iIdInp.value ? iIdInp.value : "";
        if (!iIdVal) {
            let m = window.familyState.find(f => {
                let _rel = f.data['가족_관계'] || '가족'; if(!_rel.includes('계약자')) _rel = '계약자의 ' + _rel;
                let fName = f.data['고객명'] ? f.data['고객명'] : (f.isRoot ? '메인 계약자' : _rel);
                return fName === iVal || (f.isRoot && (iVal === '본인' || iVal === '계약자' || iVal === '메인 계약자'));
            });
            iIdVal = m ? (m.data['고객번호'] || m.id) : "outsider";
        }

        let directHtml = '';
        const directWrap = card.querySelector('[id^="direct-wrap-"]');
        if (directWrap) directHtml = directWrap.outerHTML;

        card.innerHTML = buildSmartInsUI(prefix, cVal, cIdVal, iVal, iIdVal, directHtml);
        
        initSmartInsPills(card);
    });
};

var origAddInsRow = window.addInsRow;
if (origAddInsRow) {
    window.addInsRow = function(data, skipAnimation) {
        origAddInsRow(data, skipAnimation);
        setTimeout(window.upgradeAllInsurancesToSmartUI, 10);
    };
}

function buildSmartInsUI(prefix, cVal, cIdVal, iVal, iIdVal, directHtml) {
    let pillsHtml = '';
    window.familyState.forEach(f => {
        let _rel = f.data['가족_관계'] || '가족'; if(!_rel.includes('계약자')) _rel = '계약자의 ' + _rel; let fName = f.data['고객명'] ? f.data['고객명'] : (f.isRoot ? '메인 계약자' : _rel);
        let fId = f.data['고객번호'] || f.id;
        pillsHtml += '<button type="button" class="ins-pill-btn" data-id="' + fId + '" data-name="' + fName + '">' + fName + '</button>';
    });
    pillsHtml += '<button type="button" class="ins-pill-btn outsider-btn" data-id="" data-name="">외부인(직접입력)</button>';
    
    return '<div style="padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #cbd5e1; margin-bottom:5px;">' +
        '<input type="checkbox" class="diff-cb" checked style="display:none;">' +
        '<div class="insured-extra-panel" style="display:none;"></div>' +
        '<div class="insured-basic-panel" style="display:none;"></div>' +
        '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">' +
            '<div style="font-size:14px; font-weight:800; color:#0f172a;">‍‍ 계약자 / 피보험자 지정</div>' +
             directHtml + 
        '</div>' +
        '<div style="display:flex; flex-direction:column; gap:16px;">' +
            '<div class="smart-ins-group" data-target="' + prefix + '계약자">' +
                '<label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:8px;">계약자 (보험료 납부자)</label>' +
                '<div class="pill-group" style="display:flex; gap:8px; flex-wrap:wrap;">' +
                     pillsHtml + 
                '</div>' +
                '<div class="outsider-input-wrap" style="display:none; margin-top:8px;">' +
                    '<input type="text" class="real-input" name="' + prefix + '계약자" value="' + cVal + '" placeholder="외부인 이름 입력" style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1;">' +
                '</div>' +
                '<input type="hidden" class="real-id-input" name="' + prefix + '계약자_id" value="' + cIdVal + '">' +
            '</div>' +
            '<div class="smart-ins-group" data-target="' + prefix + '피보험자">' +
                '<label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:8px;">피보험자 (보장 대상자)</label>' +
                '<div class="pill-group" style="display:flex; gap:8px; flex-wrap:wrap;">' +
                     pillsHtml + 
                '</div>' +
                '<div class="outsider-input-wrap" style="display:none; margin-top:8px;">' +
                    '<input type="text" class="real-input" name="' + prefix + '피보험자" value="' + iVal + '" placeholder="외부인 이름 입력" style="width:100%; padding:10px; border-radius:6px; border:1px solid #cbd5e1;">' +
                '</div>' +
                '<input type="hidden" class="real-id-input" name="' + prefix + '피보험자_id" value="' + iIdVal + '">' +
            '</div>' +
        '</div>' +
    '</div>';
}

function initSmartInsPills(card) {
    const groups = card.querySelectorAll('.smart-ins-group');
    const cleanStr = (s) => String(s || '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, '');
    groups.forEach(group => {
        const idInput = group.querySelector('.real-id-input');
        const nameInput = group.querySelector('.real-input');
        const outsiderWrap = group.querySelector('.outsider-input-wrap');
        const pills = group.querySelectorAll('.ins-pill-btn');
        
        let targetId = idInput ? String(idInput.value || '').trim() : '';
        let targetName = nameInput ? cleanStr(nameInput.value) : '';
        
        let matched = false;
        if (targetId && targetId !== 'outsider') {
            pills.forEach(p => {
                if (p.dataset.id === targetId && !p.classList.contains('outsider-btn')) {
                    p.classList.add('active');
                    if (nameInput) nameInput.value = p.dataset.name;
                    matched = true;
                }
            });
        }
        if (!matched && targetName) {
            pills.forEach(p => {
                if (!matched && !p.classList.contains('outsider-btn') && cleanStr(p.dataset.name) === targetName) {
                    p.classList.add('active');
                    if (idInput) idInput.value = p.dataset.id;
                    if (nameInput) nameInput.value = p.dataset.name;
                    matched = true;
                }
            });
        }
        if (!matched) {
            const outBtn = group.querySelector('.outsider-btn');
            if (outBtn) outBtn.classList.add('active');
            if (outsiderWrap) outsiderWrap.style.display = 'block';
        }
    });
}

function appendMirroredInsurances(targetTab) {
    const insArea = document.getElementById('insurance-area');
    if (!insArea) return;
    
    insArea.querySelectorAll('.mirrored-entry').forEach(el => el.remove());
    
    if (!window.familyState || window.familyState.length <= 1) return;
    if (!targetTab) return;
    
    const clean = (s) => String(s || '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, '');
    const myName = clean(targetTab.data['고객명'] || targetTab.data['이름'] || targetTab.label || '');
    const myId = String(targetTab.data['고객번호'] || targetTab.id || '').trim();
    const myDisplayName = (targetTab.data && targetTab.data['고객명']) || targetTab.label || '본인';
    
    let mirroredCards = [];
    const seenKeys = new Set();
    
    window.familyState.forEach(f => {
        if (f.id === targetTab.id) return;
        
        const fDisplayName = (f.data && f.data['고객명']) || f.label || '가족';
        const fId = String(f.data['고객번호'] || f.id || '').trim();
        
        let candidateList = [];
        
        if (f.insHtml) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = f.insHtml;
            const entries = tempDiv.querySelectorAll('.insurance-entry:not(.mirrored-entry)');
            entries.forEach(entry => {
                const isCar = !!entry.querySelector('input[name="보험종류"][value="자동차보험"]') || !!entry.querySelector('[id^="ins-car-"]:not([style*="display: none"])');
                const prefix = isCar ? '차_' : '';
                const activeType = isCar ? '자동차보험' : '장기보험';
                
                const cInp = entry.querySelector('input[name="' + prefix + '계약자"]');
                const iInp = entry.querySelector('input[name="' + prefix + '피보험자"]');
                const cIdInp = entry.querySelector('input[name="' + prefix + '계약자_id"]');
                const iIdInp = entry.querySelector('input[name="' + prefix + '피보험자_id"]');
                
                let cN = cInp ? (cInp.getAttribute('value') || cInp.value || '') : '';
                let iN = iInp ? (iInp.getAttribute('value') || iInp.value || '') : '';
                let cI = cIdInp ? (cIdInp.getAttribute('value') || cIdInp.value || '') : '';
                let iI = iIdInp ? (iIdInp.getAttribute('value') || iIdInp.value || '') : '';
                
                if (!cN || cN === '본인') cN = fDisplayName;
                if (!iN || iN === '본인') iN = fDisplayName;
                
                const compEl = entry.querySelector('select[name="' + prefix + '보험사명"], input[name="' + prefix + '보험사명"]');
                const prodEl = entry.querySelector('input[name="' + prefix + '상품명"]');
                const premEl = entry.querySelector('input[name="' + prefix + '보험료"]');
                const payEl = entry.querySelector('select[name="' + prefix + '결제방식"], input[name="' + prefix + '결제방식"]');
                const startEl = entry.querySelector('input[name="' + prefix + '체결일"], input[name="' + prefix + '책임개시일"]');
                const endEl = entry.querySelector('input[name="' + prefix + '만기일"]');
                
                candidateList.push({
                    activeType: activeType,
                    contractorName: cN,
                    contractorId: cI || fId,
                    insuredName: iN,
                    insuredId: iI,
                    company: compEl ? (compEl.getAttribute('value') || compEl.value || '') : '',
                    product: prodEl ? (prodEl.getAttribute('value') || prodEl.value || '') : '',
                    premium: premEl ? (premEl.getAttribute('value') || premEl.value || '') : '',
                    paymentMethod: payEl ? (payEl.getAttribute('value') || payEl.value || '') : '',
                    startDate: startEl ? (startEl.getAttribute('value') || startEl.value || '') : '',
                    expireDate: endEl ? (endEl.getAttribute('value') || endEl.value || '') : '',
                    sourceTabId: f.id,
                    sourceTabName: fDisplayName
                });
            });
        }
        
        let dbList = [];
        if (f.data && f.data['가입내역']) {
            try {
                dbList = typeof f.data['가입내역'] === 'string' ? JSON.parse(f.data['가입내역']) : f.data['가입내역'];
            } catch(e) {}
        }
        if ((!Array.isArray(dbList) || dbList.length === 0) && f.data && Array.isArray(f.data['보험가입리스트'])) {
            dbList = f.data['보험가입리스트'];
        }
        if (Array.isArray(dbList)) {
            dbList.forEach(item => {
                const isCar = (item['보험종류'] === '자동차보험' || !!item['차_보험사명'] || !!item['차_보험사']);
                const prefix = isCar ? '차_' : '';
                const activeType = isCar ? '자동차보험' : '장기보험';
                
                let cN = item['계약자'] || item['차_계약자'] || '';
                let iN = item['피보험자'] || item['차_피보험자'] || item['기본피보험자'] || '';
                let cI = item['계약자_id'] || item['차_계약자_id'] || '';
                let iI = item['피보험자_id'] || item['차_피보험자_id'] || '';
                
                if (!cN || cN === '본인') cN = fDisplayName;
                if (!iN || iN === '본인') iN = fDisplayName;
                
                candidateList.push({
                    activeType: activeType,
                    contractorName: cN,
                    contractorId: cI || fId,
                    insuredName: iN,
                    insuredId: iI,
                    company: item[prefix + '보험사명'] || item[prefix + '보험사'] || item['보험사명'] || item['company'] || '',
                    product: item[prefix + '상품명'] || item['상품명'] || item['product'] || '',
                    premium: item[prefix + '보험료'] || item['보험료'] || item['premium'] || '',
                    paymentMethod: item[prefix + '결제방식'] || item['결제방식'] || item['paymentMethod'] || '',
                    startDate: item[prefix + '체결일'] || item[prefix + '책임개시일'] || item['체결일'] || item['date'] || '',
                    expireDate: item[prefix + '만기일'] || item['만기일'] || item['expireDate'] || '',
                    sourceTabId: f.id,
                    sourceTabName: fDisplayName
                });
            });
        }
        
        candidateList.forEach(c => {
            const cleanC = clean(c.contractorName);
            const cleanI = clean(c.insuredName);
            
            const isInsured = (cleanI === myName || (c.insuredId && myId && String(c.insuredId).trim() === myId));
            const isContractor = (cleanC === myName || (c.contractorId && myId && String(c.contractorId).trim() === myId));
            
            if (isInsured && !isContractor) {
                const uniqueKey = c.company + '_' + c.product + '_' + c.startDate + '_' + c.contractorName;
                if (!seenKeys.has(uniqueKey)) {
                    seenKeys.add(uniqueKey);
                    mirroredCards.push(c);
                }
            }
        });
    });
    
    let myDbList = [];
    if (targetTab.data && targetTab.data['가입내역']) {
        try {
            myDbList = typeof targetTab.data['가입내역'] === 'string' ? JSON.parse(targetTab.data['가입내역']) : targetTab.data['가입내역'];
        } catch(e) {}
    }
    if ((!Array.isArray(myDbList) || myDbList.length === 0) && targetTab.data && Array.isArray(targetTab.data['보험가입리스트'])) {
        myDbList = targetTab.data['보험가입리스트'];
    }
    if (Array.isArray(myDbList)) {
        myDbList.forEach(item => {
            const isCar = (item['보험종류'] === '자동차보험' || !!item['차_보험사명'] || !!item['차_보험사']);
            const prefix = isCar ? '차_' : '';
            const activeType = isCar ? '자동차보험' : '장기보험';
            
            let cN = item['계약자'] || item['차_계약자'] || '';
            let iN = item['피보험자'] || item['차_피보험자'] || item['기본피보험자'] || '';
            let cI = item['계약자_id'] || item['차_계약자_id'] || '';
            let iI = item['피보험자_id'] || item['차_피보험자_id'] || '';
            
            const cleanC = clean(cN);
            const cleanI = clean(iN);
            
            const isInsured = (!cleanI || cleanI === '본인' || cleanI === myName || (iI && myId && String(iI).trim() === myId));
            const isContractor = (!cleanC || cleanC === '본인' || cleanC === myName || (cI && myId && String(cI).trim() === myId));
            
            if (!isContractor && isInsured) {
                let matchedFam = window.familyState.find(fam => {
                    const famN = clean(fam.data['고객명'] || fam.label);
                    const famId = String(fam.data['고객번호'] || fam.id).trim();
                    return (cI && famId && cI === famId) || (cleanC && famN && cleanC === famN);
                });
                
                const uniqueKey = (item[prefix + '보험사명'] || item['company'] || '') + '_' + (item[prefix + '상품명'] || item['product'] || '') + '_' + (item[prefix + '체결일'] || item['date'] || '') + '_' + cN;
                if (!seenKeys.has(uniqueKey)) {
                    seenKeys.add(uniqueKey);
                    mirroredCards.push({
                        activeType: activeType,
                        contractorName: cN || (matchedFam ? matchedFam.label : '계약자'),
                        contractorId: cI || (matchedFam ? matchedFam.id : ''),
                        insuredName: iN || myDisplayName,
                        insuredId: iI || myId,
                        company: item[prefix + '보험사명'] || item[prefix + '보험사'] || item['보험사명'] || item['company'] || '',
                        product: item[prefix + '상품명'] || item['상품명'] || item['product'] || '',
                        premium: item[prefix + '보험료'] || item['보험료'] || item['premium'] || '',
                        paymentMethod: item[prefix + '결제방식'] || item['결제방식'] || item['paymentMethod'] || '',
                        startDate: item[prefix + '체결일'] || item[prefix + '책임개시일'] || item['체결일'] || item['date'] || '',
                        expireDate: item[prefix + '만기일'] || item['만기일'] || item['expireDate'] || '',
                        sourceTabId: matchedFam ? matchedFam.id : '',
                        sourceTabName: matchedFam ? ((matchedFam.data && matchedFam.data['고객명']) || matchedFam.label) : cN
                    });
                }
            }
        });
    }
    
    if (mirroredCards.length === 0) return;
    
    let html = '';
    mirroredCards.forEach(c => {
        let premStr = '-';
        if (c.premium) {
            const num = Number(String(c.premium).replace(/[^0-9]/g, ''));
            premStr = num ? num.toLocaleString() + '원' : c.premium;
        }
        
        const gotoBtn = c.sourceTabId ? ('<button type="button" onclick="switchFamilyTab(\'' + c.sourceTabId + '\'); if(typeof switchCategoryTab===\'function\') switchCategoryTab(2);" style="background:#ffffff; color:#2563eb; border:1px solid #bfdbfe; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; transition:0.2s; display:inline-flex; align-items:center; gap:4px; box-shadow:0 1px 2px rgba(0,0,0,0.05);" onmouseover="this.style.background=\'#eff6ff\'" onmouseout="this.style.background=\'#ffffff\'"><i class="fa-solid fa-arrow-up-right-from-square"></i> 계약자(' + c.sourceTabName + ') 탭에서 수정하기</button>') : '';
        
        html += '<div class="form-section-card insurance-entry mirrored-entry" style="background:#f8fafc; border:1.5px dashed #94a3b8; border-radius:12px; padding:18px; margin-bottom:16px; box-shadow:0 2px 4px rgba(0,0,0,0.02);">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">' +
                '<div style="display:flex; align-items:center; gap:8px;">' +
                    '<span style="background:#e0e7ff; color:#3730a3; font-weight:800; font-size:12px; padding:4px 10px; border-radius:12px; border:1px solid #c7d2fe;"><i class="fa-solid fa-shield-heart" style="margin-right:4px;"></i>계약자 가입 보장 (피보험자: ' + myDisplayName + ')</span>' +
                    '<span style="font-size:13px; font-weight:700; color:#475569;">' + c.activeType + '</span>' +
                '</div>' +
                '<div>' + gotoBtn + '</div>' +
            '</div>' +
            '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; font-size:13px; color:#334155;">' +
                '<div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0;">' +
                    '<span style="color:#64748b; font-size:11px; font-weight:700; display:block; margin-bottom:2px;">보험사 / 상품명</span>' +
                    '<span style="font-weight:800; color:#0f172a; font-size:14px;">' + (c.company || '-') + '</span>' +
                    '<span style="color:#334155; margin-left:4px;">' + (c.product || '-') + '</span>' +
                '</div>' +
                '<div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0;">' +
                    '<span style="color:#64748b; font-size:11px; font-weight:700; display:block; margin-bottom:2px;">계약자 / 피보험자</span>' +
                    '<span style="font-weight:700; color:#1e293b;">계약자: </span><span style="color:#2563eb; font-weight:800;">' + c.contractorName + '</span>' +
                    '<span style="margin:0 6px; color:#cbd5e1;">|</span>' +
                    '<span style="font-weight:700; color:#1e293b;">피보험자: </span><span style="color:#0f172a; font-weight:800;">' + myDisplayName + '</span>' +
                '</div>' +
                '<div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0;">' +
                    '<span style="color:#64748b; font-size:11px; font-weight:700; display:block; margin-bottom:2px;">보험료 / 납입방법</span>' +
                    '<span style="font-weight:800; color:#0f172a; font-size:14px;">' + premStr + '</span>' +
                    (c.paymentMethod ? ('<span style="color:#64748b; font-size:12px; margin-left:6px;">(' + c.paymentMethod + ')</span>') : '') +
                '</div>' +
                '<div style="background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #e2e8f0;">' +
                    '<span style="color:#64748b; font-size:11px; font-weight:700; display:block; margin-bottom:2px;">기간 (체결일 ~ 만기일)</span>' +
                    '<span style="font-weight:600; color:#334155;">' + (c.startDate || '-') + ' ~ ' + (c.expireDate || '-') + '</span>' +
                '</div>' +
            '</div>' +
            '<div style="margin-top:10px; padding:8px 12px; background:#eff6ff; border-radius:6px; font-size:12px; color:#1e40af; display:flex; align-items:center; gap:6px;">' +
                '<i class="fa-solid fa-circle-info" style="color:#3b82f6;"></i>' +
                '<span>이 계약의 계약자는 <strong>' + c.contractorName + '</strong>님입니다. 계약 내용 변경, 수정, 삭제는 계약자 탭에서만 가능합니다.</span>' +
            '</div>' +
        '</div>';
    });
    
    insArea.insertAdjacentHTML('beforeend', html);
}

document.addEventListener('click', function(e) {
    if (e.target.classList.contains('ins-pill-btn')) {
        e.preventDefault();
        const p = e.target;
        const group = p.closest('.smart-ins-group');
        if (!group) return;
        
        const pills = group.querySelectorAll('.ins-pill-btn');
        const idInput = group.querySelector('.real-id-input');
        const nameInput = group.querySelector('.real-input');
        const outsiderWrap = group.querySelector('.outsider-input-wrap');
        
        pills.forEach(btn => btn.classList.remove('active'));
        p.classList.add('active');
        
        if (p.classList.contains('outsider-btn')) {
            outsiderWrap.style.display = 'block';
            idInput.value = '';
            nameInput.value = '';
            nameInput.focus();
        } else {
            outsiderWrap.style.display = 'none';
            idInput.value = p.dataset.id;
            nameInput.value = p.dataset.name;
        }
    }
});


// --- Phase 4: Family Grouping in List View (Right Column) ---


// Hook openRegModal for New Registration
if (typeof window.openRegModal === 'function' && !window.origOpenRegModal) {
    window.origOpenRegModal = window.openRegModal;
    window.openRegModal = function(mode) {
        window.origOpenRegModal(mode);
        if (mode === 'new') {
            setTimeout(() => {
                // initFamilyTabs(); removed to prevent overwrite
            }, 50);
        }
    };
}

// Hook addInsuranceFields to automatically upgrade new insurances to Smart UI
if (typeof window.addInsuranceFields === 'function' && !window.origAddInsuranceFields) {
    window.origAddInsuranceFields = window.addInsuranceFields;
    window.addInsuranceFields = function(data, mode) {
        window.origAddInsuranceFields(data, mode);
        setTimeout(() => {
            if (typeof window.upgradeAllInsurancesToSmartUI === 'function') {
                window.upgradeAllInsurancesToSmartUI();
            }
        }, 50);
    };
}

// Expose to window
window.switchCategoryTab = switchCategoryTab;
window.submitFamilyForm = async function(e) {
    if (e) e.preventDefault();
    if (window.isFamilySubmitInProgress) return;
    
    saveCurrentFormToState();
    
    const activeF = window.familyState.find(x => x.id === window.activeFamilyId);
    if (!activeF) return;

    window.isFamilySubmitInProgress = true;
    if(typeof showLoading === 'function') showLoading(true);
    
    const origClose = window.closeRegModal;
    window.closeRegModal = function() {};
    const origLoad = window.loadCRMData;
    window.loadCRMData = async function() {};
    
    window.isFamilySubmit = true;
    
    if (window.activeFamilyId !== activeF.id) {
        loadStateToForm(activeF.id);
        await new Promise(r => setTimeout(r, 50));
    }
    
    if (!activeF.isRoot) {
        const rootData = window.familyState[0].data;
        const rootPhone = rootData['폰번호'] || '';
        const rootJumin = rootData['주민번호'] || '';
        const dh = document.querySelector('[name="대표자핸드폰"]');
        if(dh) dh.value = rootPhone;
        const dj = document.querySelector('[name="대표자주민번호"]');
        if(dj) dj.value = rootJumin;
        
        const famInput = document.querySelector('[name="가족사항"]');
        if (famInput && !famInput.value.trim()) famInput.value = activeF.label;
        
        const baseIdEl = document.getElementById("base-cust-id");
        if (baseIdEl) {
            let currentId = baseIdEl.value;
            let rootId = window.familyState[0].data["고객번호"];
            if (currentId === rootId) {
                // Determine suffix
                let activeIdx = window.familyState.findIndex(x => x.id === activeF.id);
                baseIdEl.value = rootId + "-" + activeIdx;
            }
        }
    }
    
    if (activeF.isSaved) {
        window.isEditMode = true;
        window.editTargetId = activeF.data["고객번호"];
    } else {
        window.isEditMode = false;
        window.editTargetId = null;
    }

    const event = new Event("submit", { cancelable: true });
    window.isSubmittingCrm = false; 
    
    try {
        let savedClient = await window.submitCrmData(event);
        if (savedClient === false) {
            // Validation failed, let user fix it
            window.isFamilySubmit = false;
            window.isFamilySubmitInProgress = false;
            window.closeRegModal = origClose;
            window.loadCRMData = origLoad;
            if(typeof showLoading === 'function') showLoading(false);
            return;
        }
        
        if (savedClient) {
            activeF.isSaved = true;
            if (savedClient.rowNumber) activeF.rowNumber = savedClient.rowNumber;
            showCustomAlert("현재 탭 저장 완료", activeF.label + " 정보가 성공적으로 저장되었습니다.");
        }
    } catch (err) {
        console.error("Tab Save Error:", err);
    }
    
    window.isFamilySubmit = false;
    window.closeRegModal = origClose;
    window.loadCRMData = origLoad;
    window.loadCRMData();
    window.isFamilySubmitInProgress = false;
    if(typeof showLoading === 'function') showLoading(false);
};

window.initFamilyTabs = initFamilyTabs;

window.handleDiffAddress = function(cb) {
    const baseAddr = document.getElementById('base-address');
    const detailAddr = document.getElementById('detail-address');
    if (cb.checked) {
        // 주소다름 체크 시: 내용을 지워주고 편집하게 유도
        baseAddr.value = '';
        detailAddr.value = '';
        cb.parentNode.style.background = '#cbd5e1';
    } else {
        // 주소같음: 계약자(root) 주소 가져오기
        if (window.familyState && window.familyState.length > 0) {
            baseAddr.value = window.familyState[0].data['기본주소'] || '';
            detailAddr.value = window.familyState[0].data['상세주소입력'] || '';
        }
        cb.parentNode.style.background = '#f1f5f9';
    }
};


window.renderWizardBottomNav = function() {
    const nav = document.getElementById('wizard-bottom-nav');
    if (!nav) return;
    
    let html = '';
    
    // Prev Button
    if (window.activeCategoryId > 1) {
        html += '<button type="button" onclick="switchCategoryTab(' + (window.activeCategoryId - 1) + ')" style="padding:14px 24px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#475569; font-size:15px; font-weight:700; cursor:pointer; transition:0.2s;">이전 단계</button>';
    } else {
        html += '<div></div>';
    }
    
    // Next / Save Button
    const isSingle = (window.wizardMode === 'single');
    if (window.activeCategoryId < 3) {
        html += '<button type="button" onclick="switchCategoryTab(' + (window.activeCategoryId + 1) + ')" style="padding:14px 32px; border-radius:8px; border:none; background:#1e293b; color:#ffffff; font-size:15px; font-weight:700; cursor:pointer; transition:0.2s;">다음 단계 </button>';
    } else {
        if (isSingle) {
            html += '<button type="button" onclick="window.submitAllFamilyData(event)" style="padding:14px 32px; border-radius:8px; border:none; background:#10b981; color:#ffffff; font-size:14px; font-weight:800; cursor:pointer; transition:0.2s; box-shadow:0 4px 6px -1px rgba(16,185,129,0.3);"><i class="fa-solid fa-check" style="margin-right:6px;"></i> 고객 등록 완료</button>';
        } else {
            const currentIndex = window.familyState.findIndex(f => f.id === window.activeFamilyId);
            if (currentIndex < window.familyState.length - 1) {
                const nextFam = window.familyState[currentIndex + 1];
                html += '<button type="button" onclick="switchFamilyTab(\'' + nextFam.id + '\'); switchCategoryTab(1);" style="padding:14px 32px; border-radius:8px; border:none; background:#3b82f6; color:#ffffff; font-size:15px; font-weight:700; cursor:pointer; transition:0.2s; box-shadow:0 4px 6px -1px rgba(59,130,246,0.3);">다음 가족(' + nextFam.label + ') 입력 </button>';
            } else {
                html += '<button type="button" onclick="window.submitAllFamilyData(event)" style="padding:14px 32px; border-radius:8px; border:none; background:#10b981; color:#ffffff; font-size:14px; font-weight:800; cursor:pointer; transition:0.2s; box-shadow:0 4px 6px -1px rgba(16,185,129,0.3);">최종 일괄 저장 </button>';
            }
        }
    }
    
    nav.innerHTML = html;
};

window.submitAllFamilyData = async function(e) {
    if (e) e.preventDefault();
    if (window.isFamilySubmitInProgress) return;
    
    saveCurrentFormToState();
    
    const isSingle = (window.wizardMode === 'single');
    const confirmMsg = isSingle ? '고객 정보를 등록하시겠습니까?' : '모든 가족 정보를 저장하시겠습니까?';
    if(!confirm(confirmMsg)) return;
    
    window.isFamilySubmitInProgress = true;
    if(typeof showLoading === 'function') showLoading(true);
    
    const origClose = window.closeRegModal;
    window.closeRegModal = function() {};
    const origLoad = window.loadCRMData;
    window.loadCRMData = async function() {};
    
    window.isFamilySubmit = true;
    
    let successCount = 0;
    for (let i = 0; i < window.familyState.length; i++) {
        const fam = window.familyState[i];
        
        loadStateToForm(fam.id);
        await new Promise(r => setTimeout(r, 100));
        
        if (!fam.isRoot) {
            const rootData = window.familyState[0].data;
            const dh = document.querySelector('[name="대표자핸드폰"]'); if(dh) dh.value = rootData['폰번호'] || '';
            const dj = document.querySelector('[name="대표자주민번호"]'); if(dj) dj.value = rootData['주민번호'] || '';
            const famInput = document.querySelector('[name="가족사항"]'); if (famInput && !famInput.value.trim()) famInput.value = fam.label;
            const baseIdEl = document.getElementById("base-cust-id");
            if (baseIdEl && baseIdEl.value === rootData["고객번호"]) {
                baseIdEl.value = rootData["고객번호"] + "-" + i;
            }
        }
        
        window.isEditMode = !!fam.isSaved;
        window.editTargetId = fam.isSaved ? fam.data["고객번호"] : null;
        
        try {
            const event = new Event("submit", { cancelable: true });
            window.isSubmittingCrm = false; 
            let savedClient = await window.submitCrmData(event);
            if (savedClient) {
                fam.isSaved = true;
                successCount++;
            } else {
                switchFamilyTab(fam.id);
                switchCategoryTab(1); 
                window.isFamilySubmitInProgress = false;
                if(typeof showLoading === 'function') showLoading(false);
                window.closeRegModal = origClose;
                window.loadCRMData = origLoad;
                window.isFamilySubmit = false;
                return; 
            }
        } catch(err) {
            console.error(err);
        }
    }
    
    window.isFamilySubmitInProgress = false;
    window.closeRegModal = origClose;
    window.loadCRMData = origLoad;
    window.isFamilySubmit = false;
    
    if(typeof showLoading === 'function') showLoading(false);
    
    if (successCount > 0) {
        alert(successCount + "명의 고객 데이터가 일괄 저장되었습니다!");
        window.closeRegModal();
        window.loadCRMData();
    } else {
        alert("저장에 실패했습니다. 필수값을 확인해주세요.");
    }
};







