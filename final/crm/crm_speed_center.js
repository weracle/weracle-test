/**
 * crm_speed_center.js
 * 스피드 작업 센터 - [3번 옵션: 5대 포커스 카드 + 나이 직접 검색]
 * 단 1개 조건 집중 탐색 (Single Condition Focus)
 */

window.speedCenterFilters = {
    activeType: null, // null | 'driver' | 'pet' | 'biz' | 'pay' | 'age'
    driver: '',
    hasPet: '',
    bizType: '',
    payMethod: '',
    ageSearch: ''
};

window.syncSpeedCenterMobileUI = function() {
    const isMobile = window.innerWidth <= 768;
    const focusGrid = document.querySelector('#quickEditModal .sc-focus-grid') || document.getElementById('sc-focus-grid-container');
    const activeBadge = document.getElementById('sc-active-badge');
    const tableWrap = document.getElementById('quickEditTableWrap');
    const mobileList = document.getElementById('quickEditMobileList');
    
    if (focusGrid) {
        if (isMobile) {
            focusGrid.style.setProperty('display', 'none', 'important');
        } else {
            focusGrid.style.setProperty('display', 'flex', 'important');
        }
    }
    if (activeBadge) {
        if (isMobile) {
            activeBadge.style.setProperty('display', 'none', 'important');
        } else {
            activeBadge.style.removeProperty('display');
        }
    }
    if (tableWrap && mobileList) {
        if (isMobile) {
            tableWrap.style.setProperty('display', 'none', 'important');
            mobileList.style.setProperty('display', 'flex', 'important');
        } else {
            tableWrap.style.setProperty('display', 'block', 'important');
            mobileList.style.setProperty('display', 'none', 'important');
        }
    }
};

window.addEventListener('resize', () => {
    if (typeof window.syncSpeedCenterMobileUI === 'function') {
        window.syncSpeedCenterMobileUI();
    }
});

window.openQuickEditModal = function() {
    const modal = document.getElementById('quickEditModal');
    if (!modal) return;

    modal.style.display = 'flex';
    modal.classList.add('active');
    modal.style.alignItems = 'flex-start';
    modal.style.justifyContent = 'center';
    modal.style.padding = '32px 16px 60px';
    modal.style.overflowY = 'auto';
    modal.scrollTop = 0;

    const content = modal.querySelector('.modal-content');
    if (content) {
        content.style.margin = '0 auto';
        content.style.transform = 'none';
        content.style.top = '0';
    }

    window.syncSpeedCenterMobileUI();

    const searchInput = document.getElementById('quickEditSearchInput');
    const centerInput = document.getElementById('centerSpeedSearchInput');
    if (searchInput) {
        if (centerInput && centerInput.value.trim() && !centerInput.value.includes('스피드 작업 센터 열기') && !centerInput.value.includes('원하시는 고객을')) {
            searchInput.value = centerInput.value.trim();
        } else {
            searchInput.value = '';
        }
    }
    
    // 초기화 및 렌더링
    window.resetSpeedCenterFilters(false);
    window.handleQuickEditSearch();

    setTimeout(() => {
        if (searchInput) {
            try {
                searchInput.focus({ preventScroll: true });
            } catch(e) {
                searchInput.focus();
            }
        }
        if (modal) modal.scrollTop = 0;
    }, 150);
};

window.closeQuickEditModal = function() {
    const modal = document.getElementById('quickEditModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
};

// Focus Card (Single-Condition Focus)
window.focusSpeedCard = function(type) {
    if (window.speedCenterFilters.activeType !== type) {
        window.speedCenterFilters.activeType = type;
        window.updateSpeedCardUI(type);

        if (type === 'age') {
            const ageInput = document.getElementById('sc-input-age');
            if (ageInput) {
                ageInput.focus();
                if (ageInput.value.trim()) {
                    window.setSpeedSingleFilter('age', ageInput.value);
                }
            }
        }
    }
};

// Set Single Filter (clears all other 4 conditions)
window.setSpeedSingleFilter = function(type, value) {
    const val = (value || '').trim();

    if (!val) {
        // 값 비움 처리
        window.speedCenterFilters[type === 'driver' ? 'driver' : type === 'pet' ? 'hasPet' : type === 'biz' ? 'bizType' : type === 'pay' ? 'payMethod' : 'ageSearch'] = '';
        window.speedCenterFilters.activeType = null;
        window.updateSpeedCardUI(null);
        window.handleQuickEditSearch();
        return;
    }

    // 단 1개 조건만 활성화 (다른 4개 조건 리셋)
    window.speedCenterFilters.activeType = type;
    window.speedCenterFilters.driver = (type === 'driver') ? val : '';
    window.speedCenterFilters.hasPet = (type === 'pet') ? val : '';
    window.speedCenterFilters.bizType = (type === 'biz') ? val : '';
    window.speedCenterFilters.payMethod = (type === 'pay') ? val : '';
    window.speedCenterFilters.ageSearch = (type === 'age') ? val : '';

    // 다른 카드 UI 리셋
    if (type !== 'driver') { const el = document.getElementById('sc-select-driver'); if (el) el.value = ''; }
    if (type !== 'pet') { const el = document.getElementById('sc-select-pet'); if (el) el.value = ''; }
    if (type !== 'biz') { const el = document.getElementById('sc-select-biz'); if (el) el.value = ''; }
    if (type !== 'pay') { const el = document.getElementById('sc-select-pay'); if (el) el.value = ''; }
    if (type !== 'age') { const el = document.getElementById('sc-input-age'); if (el) el.value = ''; }

    window.updateSpeedCardUI(type);
    window.handleQuickEditSearch();
};

// Update Card Visuals (Active border, radio dot, badge)
window.updateSpeedCardUI = function(activeType) {
    const cards = ['driver', 'pet', 'biz', 'pay', 'age'];
    cards.forEach(c => {
        const cardEl = document.getElementById('sc-card-' + c);
        const dotEl = document.getElementById('sc-dot-' + c);
        const isActive = (c === activeType);

        if (cardEl) {
            if (isActive) {
                cardEl.style.borderColor = '#2563eb';
                cardEl.style.background = '#eff6ff';
                cardEl.style.boxShadow = '0 4px 14px rgba(37,99,235,0.15)';
            } else {
                cardEl.style.borderColor = '#e2e8f0';
                cardEl.style.background = '#ffffff';
                cardEl.style.boxShadow = 'none';
            }
        }
        if (dotEl) {
            if (isActive) {
                dotEl.style.borderColor = '#2563eb';
                dotEl.style.background = '#2563eb';
            } else {
                dotEl.style.borderColor = '#cbd5e1';
                dotEl.style.background = 'transparent';
            }
        }
    });

    // Badge update
    const badgeText = document.getElementById('sc-badge-text');
    if (badgeText) {
        if (!activeType) {
            badgeText.innerText = '전체 고객 (필터 없음)';
        } else if (activeType === 'driver') {
            const dVal = window.speedCenterFilters.driver;
            badgeText.innerText = '운전여부: ' + (dVal === '운전' ? '운전자 (운전함)' : dVal === '운전안함' ? '비운전자 (운전안함)' : dVal || '선택 대기');
        } else if (activeType === 'pet') {
            badgeText.innerText = '반려동물: ' + (window.speedCenterFilters.hasPet === '유' ? '보유 (유)' : '없음 (무)');
        } else if (activeType === 'biz') {
            badgeText.innerText = '사업자구분: ' + (window.speedCenterFilters.bizType || '선택 대기');
        } else if (activeType === 'pay') {
            badgeText.innerText = '결제방식: ' + (window.speedCenterFilters.payMethod || '선택 대기');
        } else if (activeType === 'age') {
            badgeText.innerText = '나이 직접 검색: ' + (window.speedCenterFilters.ageSearch ? "'" + window.speedCenterFilters.ageSearch + "'" : '입력 대기');
        }
    }
};

window.resetSpeedCenterFilters = function(triggerSearch = true) {
    window.speedCenterFilters = {
        activeType: null,
        driver: '',
        hasPet: '',
        bizType: '',
        payMethod: '',
        ageSearch: ''
    };

    ['sc-select-driver', 'sc-select-pet', 'sc-select-biz', 'sc-select-pay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const ageInput = document.getElementById('sc-input-age');
    if (ageInput) ageInput.value = '';

    window.updateSpeedCardUI(null);

    if (triggerSearch) window.handleQuickEditSearch();
};

window.currentQuickEditTab = '1차';

window.setQuickEditTab = function(tabName) {
    window.currentQuickEditTab = tabName;
    ['1차', '터치', '보험'].forEach(t => {
        const btn = document.getElementById('qeTab-' + t);
        if (btn) {
            if (t === tabName) {
                btn.style.background = '#3b82f6';
                btn.style.color = 'white';
                btn.style.boxShadow = '0 2px 4px rgba(59,130,246,0.2)';
            } else {
                btn.style.background = '#e2e8f0';
                btn.style.color = '#475569';
                btn.style.boxShadow = 'none';
            }
        }
    });
    window.handleQuickEditSearch();
};

window.handleQuickEditSearch = function() {
    try {
        const searchInput = document.getElementById('quickEditSearchInput');
        const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const resultArea = document.getElementById('quickEditResultArea');
        const theadArea = document.getElementById('quickEditTableHeader');
        const countArea = document.getElementById('quickEditCount');

        if (!resultArea) return;

        if (!window.globalCustomerData || window.globalCustomerData.length === 0) {
            resultArea.innerHTML = '<tr><td colspan="15" style="text-align:center; padding:80px 20px; color:#94a3b8; font-weight:600; font-size:15px;">등록된 고객 데이터가 없습니다.</td></tr>';
            if (countArea) countArea.innerText = '0';
            return;
        }

        let matches = window.globalCustomerData.slice();

        // 1. Text Search query (고객명, 폰번호, 대표자명, 고객번호, UID, 특이사항, 직업, 주소, 가족사항, 터치인사이트, 차량, 반려동물, 보험사/상품명 종합 검색)
        if (query) {
            matches = matches.filter(c => {
                const name = String(c['고객명'] || c['이름'] || c['성함'] || c['대표자명'] || '').toLowerCase();
                const phone = String(c['폰번호'] || c['연락처'] || c['전화번호'] || c['대표자폰번호'] || '').replace(/-/g, '');
                const qClean = query.replace(/-/g, '');
                const idVal = (String(c['고객번호'] || '') + ' ' + String(c['ID'] || '') + ' ' + String(c['UID'] || '')).toLowerCase();
                const memo = String(c['특이사항'] || c['메모'] || '').toLowerCase();
                const job = String(c['직업'] || '').toLowerCase();
                const addr = String(c['주소'] || '').toLowerCase();
                const family = String(c['가족사항'] || '').toLowerCase();
                const touch = String(c['터치인사이트'] || '').toLowerCase();
                const car = String(c['차량용도'] || '').toLowerCase();
                const pet = String(c['반려동물'] || '').toLowerCase();

                let insText = '';
                try {
                    let insList = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(c, true) : [];
                    if (insList && insList.length > 0) {
                        insText = insList.map(i => (i['보험사명'] || i['회사명'] || '') + ' ' + (i['상품명'] || '')).join(' ').toLowerCase();
                    }
                } catch(e) {}

                return name.includes(query) || phone.includes(qClean) || idVal.includes(query) || 
                       memo.includes(query) || job.includes(query) || addr.includes(query) || 
                       family.includes(query) || touch.includes(query) || car.includes(query) || 
                       pet.includes(query) || insText.includes(query);
            });
        }

        // 2. Single Filter Application
        const f = window.speedCenterFilters;
        if (f.activeType) {
            if (f.activeType === 'driver' && f.driver) {
                matches = matches.filter(c => {
                    const driverVal = String(c['운전여부'] || c['운전'] || '').trim().toLowerCase();
                    const carUsageVal = String(c['차량용도'] || '').trim().toLowerCase();
                    const combined = driverVal + " " + carUsageVal;
                    const target = f.driver.trim().toLowerCase();

                    // 1. 비운전자 (운전안함)
                    if (target === '운전안함' || target === '비운전') {
                        return driverVal === '비운전' || driverVal.includes('안함') || driverVal === '무' || driverVal === '없음' || carUsageVal === '-' || carUsageVal === '';
                    }

                    // 2. 운전자 전체 (운전함) - 비운전이 아니거나 차량용도가 존재하는 모든 고객
                    if (target === '운전' || target === '운전자' || target === '운전함') {
                        return driverVal === '운전' || (driverVal !== '비운전' && !driverVal.includes('안함') && carUsageVal && carUsageVal !== '-');
                    }

                    // 3. 자가용 (개인용, 출퇴근용, 승용차, 자가용 포함)
                    if (target === '자가용') {
                        return carUsageVal.includes('자가용') || carUsageVal.includes('개인용') || carUsageVal.includes('출퇴근') || carUsageVal.includes('승용차');
                    }

                    // 4. 영업용 (업무용, 화물용, 영업용 포함)
                    if (target === '영업용') {
                        return carUsageVal.includes('영업용') || carUsageVal.includes('업무용') || carUsageVal.includes('화물');
                    }

                    // 5. 이륜차 (바이크, 오토바이, 원동기, 이륜차 포함)
                    if (target === '이륜차') {
                        return carUsageVal.includes('이륜차') || carUsageVal.includes('바이크') || carUsageVal.includes('오토바이') || carUsageVal.includes('원동기');
                    }

                    return combined.includes(target);
                });
            } else if (f.activeType === 'pet' && f.hasPet) {
                matches = matches.filter(c => {
                    const pet = String(c['반려동물'] || c['반려'] || '').trim();
                    const has = pet && pet !== '무' && pet !== '없음' && pet !== '-' && pet !== 'x';
                    return (f.hasPet === '유') ? has : !has;
                });
            } else if (f.activeType === 'biz' && f.bizType) {
                matches = matches.filter(c => {
                    const isBiz = String(c['사업여부'] || '').toUpperCase() === 'Y';
                    const biz = String(c['사업자구분'] || c['상호명'] || c['직업'] || c['상세직무'] || c['상세업무'] || '').toLowerCase();
                    const isCorp = biz.includes('법인') || (c['상호명'] && (c['상호명'].includes('주식회사') || c['상호명'].includes('(주)')));

                    // 1. 사업자 전체 (개인+법인 모든 사업자)
                    if (f.bizType === '사업자') {
                        return isBiz || isCorp || biz.includes('사업') || biz.includes('자영업') || biz.includes('대표');
                    }

                    // 2. 일반고객 (비사업자/직장인 전체)
                    if (f.bizType === '일반고객') {
                        return !isBiz && !isCorp && !biz.includes('사업자') && !biz.includes('자영업') && !biz.includes('대표');
                    }

                    // 3. 개인사업자
                    if (f.bizType === '개인사업자') {
                        return (isBiz && !isCorp) || biz.includes('개인') || biz.includes('자영업') || (biz.includes('대표') && !isCorp);
                    }

                    // 4. 법인사업자
                    if (f.bizType === '법인사업자') {
                        return isCorp || (isBiz && biz.includes('법인'));
                    }

                    return isBiz || biz.includes(f.bizType.toLowerCase());
                });
            } else if (f.activeType === 'pay' && f.payMethod) {
                const targetMethod = f.payMethod.trim().toLowerCase();
                const isCardSearch = targetMethod.includes('카드');
                const isTransferSearch = targetMethod.includes('이체') || targetMethod.includes('계좌');
                const isUnregistered = targetMethod.includes('미등록');

                matches = matches.filter(c => {
                    let payStr = String(c['결제방식'] || c['결제방법'] || c['차_결제방식'] || c['수납방법'] || c['납부방법'] || c['결제정보'] || '').toLowerCase();
                    for (let k = 1; k <= 10; k++) {
                        if (c['보험' + k + '_결제방식']) payStr += ' ' + String(c['보험' + k + '_결제방식']).toLowerCase();
                        if (c['보험' + k + '_결제정보']) payStr += ' ' + String(c['보험' + k + '_결제정보']).toLowerCase();
                    }
                    let insCount = 0;
                    try {
                        let insList = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(c, true) : [];
                        if (insList && insList.length > 0) {
                            insCount = insList.length;
                            insList.forEach(i => {
                                payStr += ' ' + String(i['결제방식'] || i['차_결제방식'] || i['납입방법'] || i['결제방법'] || i['결제정보'] || i['payMethod'] || '').toLowerCase();
                            });
                        }
                    } catch(e) {}

                    if (isUnregistered) {
                        return !payStr.trim() && insCount === 0;
                    }
                    if (isCardSearch) {
                        return payStr.includes('카드') || payStr.includes('신용') || payStr.includes('체크');
                    } else if (isTransferSearch) {
                        return payStr.includes('이체') || payStr.includes('자동이체') || payStr.includes('계좌') || payStr.includes('통장') || payStr.includes('은행');
                    }
                    return payStr.includes(targetMethod);
                });
            } else if (f.activeType === 'age' && f.ageSearch) {
                matches = matches.filter(c => {
                    let age = parseInt(c['나이'], 10);
                    if (isNaN(age) || age <= 0) {
                        let b = String(c['생년월일'] || c['생일'] || c['주민번호'] || '').replace(/\D/g, '');
                        if (b.length >= 6) {
                            let birthYear = parseInt(b.substring(0, 2), 10);
                            const curYear = new Date().getFullYear();
                            const fullBirthYear = (birthYear > (curYear % 100)) ? (1900 + birthYear) : (2000 + birthYear);
                            age = curYear - fullBirthYear;
                        }
                    }
                    if (isNaN(age)) return false;

                    const term = f.ageSearch.trim().toLowerCase();
                    if (term.includes('대')) {
                        const decade = parseInt(term, 10);
                        return age >= decade && age < decade + 10;
                    }
                    const num = parseInt(term, 10);
                    if (!isNaN(num)) {
                        return age === num || String(age).startsWith(term);
                    }
                    return String(age).includes(term);
                });
            }
        }

        if (countArea) countArea.innerText = matches.length;

        // Render Headers
        const tab = window.currentQuickEditTab || '1차';
        if (theadArea) {
            const thStyle = 'padding:9px 10px; text-align:left; color:#475569; font-weight:700; font-size:12px; white-space:nowrap; letter-spacing:-0.3px;';
            if (tab === '1차') {
                theadArea.innerHTML = `
                    <th style="${thStyle}">고객명</th>
                    <th style="${thStyle}">진행상태</th>
                    <th style="${thStyle}">연령/성별</th>
                    <th style="${thStyle}">생년월일</th>
                    <th style="${thStyle}">연락처</th>
                    <th style="${thStyle}">운전</th>
                    <th style="${thStyle}">반려동물</th>
                    <th style="${thStyle}">직업</th>
                    <th style="${thStyle}">주소</th>
                    <th style="${thStyle}">특이사항</th>
                    <th style="${thStyle}">가족사항</th>
                `;
            } else if (tab === '터치') {
                theadArea.innerHTML = `
                    <th style="${thStyle} width:110px;">고객명</th>
                    <th style="${thStyle} width:90px;">진행상태</th>
                    <th style="${thStyle}">터치 인사이트 (우선순위 추천)</th>
                    <th style="${thStyle}">상담 메모</th>
                `;
            } else if (tab === '보험') {
                theadArea.innerHTML = `
                    <th style="${thStyle} width:110px;">고객명</th>
                    <th style="${thStyle} width:90px;">진행상태</th>
                    <th style="${thStyle}">가입 증권 / 상품 내역</th>
                `;
            }
        }

        // Render Rows
        let tbHtml = '';
        let mobileCardHtml = '';

        if (matches.length === 0) {
            tbHtml = '<tr><td colspan="15" style="text-align:center; padding:60px 20px; color:#94a3b8; font-weight:600;"><i class="fa-solid fa-magnifying-glass" style="font-size:24px; margin-bottom:8px; display:block;"></i>일치하는 고객이 없습니다.</td></tr>';
            mobileCardHtml = '<div style="text-align:center; padding:50px 14px; color:#94a3b8; font-weight:600;"><i class="fa-solid fa-magnifying-glass" style="font-size:24px; margin-bottom:8px; display:block;"></i>일치하는 고객이 없습니다.</div>';
        } else {
            matches.forEach(c => {
                const id = c['고객번호'] || c['사업자번호'] || c['ID'] || c['id'] || c['rowNumber'] || c['고객명'] || '';
                const name = c['고객명'] || c['이름'] || c['성함'] || c['대표자명'] || '-';
                const status = c['상태'] || c['진행상태'] || '신규';
                const rawPhone = c['폰번호'] || c['연락처'] || c['전화번호'] || '';
                const phone = (window.formatPhone ? window.formatPhone(rawPhone) : rawPhone) || '-';
                const ageGender = (c['나이'] ? c['나이'] + '세' : '-') + ' / ' + (c['성별'] || '-');
                const birth = c['생년월일'] || c['생일'] || '-';
                const driveStatus = c['운전여부'] || c['운전'] || '-';
                const carUsage = (c['차량용도'] && c['차량용도'] !== '-') ? ' (' + c['차량용도'] + ')' : '';
                const driver = (driveStatus !== '-' ? driveStatus : '') + carUsage || '-';
                const hasPet = (c['반려동물'] && c['반려동물'] !== '무' && c['반려동물'] !== '없음');
                const pet = hasPet 
                            ? `<span style="color:#d97706; font-weight:700;">${c['반려동물']}</span>` 
                            : '<span style="color:#94a3b8;">-</span>';
                const job = (c['직업'] || '-') + (c['상세직무'] ? ` (${c['상세직무']})` : '');
                const addr = c['주소'] || '-';
                const memo = c['특이사항'] || c['메모'] || '-';
                const family = c['가족사항'] || '-';
                const touch = c['터치인사이트'] || '-';

                let statusBg = '#eff6ff'; let statusColor = '#2563eb'; let statusBorder = '#bfdbfe';
                if (status.includes('상담')) { statusBg = '#fefce8'; statusColor = '#ca8a04'; statusBorder = '#fef08a'; }
                else if (status.includes('체결') || status.includes('계약')) { statusBg = '#faf5ff'; statusColor = '#7e22ce'; statusBorder = '#e9d5ff'; }
                else if (status.includes('케어')) { statusBg = '#fee2e2'; statusColor = '#dc2626'; statusBorder = '#fecaca'; }
                else if (status.includes('관심')) { statusBg = '#f0fdf4'; statusColor = '#15803d'; statusBorder = '#bbf7d0'; }

                // 1. PC Table Row
                tbHtml += `<tr style="border-bottom:1px solid #f1f5f9; cursor:pointer;" onmouseover="this.style.background='#f8fafc';" onmouseout="this.style.background='#ffffff';">`;
                
                if (tab === '1차') {
                    tbHtml += `
                        <td style="padding:9px 10px; font-weight:800; color:#1e293b; font-size:12.5px; white-space:nowrap;" onclick="if(typeof openProfile==='function'){openProfile('${id}');}else if(typeof showMasterDetail==='function'){showMasterDetail('${id}');}">${name}</td>
                        <td style="padding:9px 10px; white-space:nowrap;"><span style="display:inline-block; padding:2px 7px; border-radius:5px; font-size:11px; font-weight:700; background:${statusBg}; color:${statusColor};">${status}</span></td>
                        <td style="padding:9px 10px; color:#475569; font-size:12px; white-space:nowrap;">${ageGender}</td>
                        <td style="padding:9px 10px; color:#475569; font-size:12px; white-space:nowrap;">${birth}</td>
                        <td style="padding:9px 10px; color:#0284c7; font-weight:700; font-size:12px; white-space:nowrap;">${phone}</td>
                        <td style="padding:9px 10px; color:#475569; font-size:12px; white-space:nowrap;">${driver}</td>
                        <td style="padding:9px 10px; color:#475569; font-size:12px; white-space:nowrap;">${pet}</td>
                        <td style="padding:9px 10px; color:#475569; font-size:12px; white-space:nowrap;">${job}</td>
                        <td style="padding:9px 10px; color:#64748b; font-size:12px; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${addr}">${addr}</td>
                        <td style="padding:9px 10px; color:#64748b; font-size:12px; max-width:160px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${memo}">${memo}</td>
                        <td style="padding:9px 10px; color:#64748b; font-size:12px; white-space:nowrap;">${family}</td>
                    `;
                } else if (tab === '터치') {
                    tbHtml += `
                        <td style="padding:12px 14px; font-weight:800; color:#1e293b;" onclick="if(typeof openProfile==='function'){openProfile('${id}');}else if(typeof showMasterDetail==='function'){showMasterDetail('${id}');}">${name}</td>
                        <td style="padding:12px 14px;"><span style="display:inline-block; padding:3px 8px; border-radius:6px; font-size:11.5px; font-weight:700; background:${statusBg}; color:${statusColor};">${status}</span></td>
                        <td style="padding:12px 14px; color:#4338ca; font-weight:600; font-size:13px;">${touch}</td>
                        <td style="padding:12px 14px; color:#64748b; font-size:13px;">${memo}</td>
                    `;
                } else if (tab === '보험') {
                    let insSummary = '-';
                    try {
                        let insList = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(c, true) : [];
                        if (insList.length > 0) {
                            insSummary = insList.map(i => {
                                const comp = i['회사명'] || i['보험사'] || '';
                                const prod = i['상품명'] || '';
                                const pay = i['납입방법'] || i['결제방법'] || '';
                                return `<span style="display:inline-block; background:#f1f5f9; border:1px solid #e2e8f0; padding:2px 8px; border-radius:4px; margin-right:6px; margin-bottom:4px; font-size:12px;"><b>${comp}</b> ${prod} ${pay ? `(${pay})` : ''}</span>`;
                            }).join('');
                        }
                    } catch(e) {}

                    tbHtml += `
                        <td style="padding:12px 14px; font-weight:800; color:#1e293b;" onclick="if(typeof openProfile==='function'){openProfile('${id}');}else if(typeof showMasterDetail==='function'){showMasterDetail('${id}');}">${name}</td>
                        <td style="padding:12px 14px;"><span style="display:inline-block; padding:3px 8px; border-radius:6px; font-size:11.5px; font-weight:700; background:${statusBg}; color:${statusColor};">${status}</span></td>
                        <td style="padding:12px 14px; color:#334155;">${insSummary}</td>
                    `;
                }
                tbHtml += '</tr>';

                // 2. Mobile Version A (Info Card)
                mobileCardHtml += `<div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:12px 14px; box-shadow:0 1px 3px rgba(0,0,0,0.03); cursor:pointer; transition:all 0.15s;" onclick="if(typeof openProfile==='function'){openProfile('${id}');}else if(typeof showMasterDetail==='function'){showMasterDetail('${id}');}">`;
                mobileCardHtml += `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:7px;">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span style="display:inline-block; padding:2px 7px; border-radius:5px; font-size:11px; font-weight:800; background:${statusBg}; color:${statusColor}; border:1px solid ${statusBorder};">${status}</span>
                            <span style="font-size:14.5px; font-weight:800; color:#0f172a;">${name}</span>
                            <span style="font-size:12px; color:#64748b; font-weight:600;">(${ageGender})</span>
                        </div>
                        ${rawPhone ? `<a href="tel:${rawPhone}" onclick="event.stopPropagation();" style="font-size:11.5px; font-weight:700; color:#0284c7; text-decoration:none; display:flex; align-items:center; gap:4px; background:#f0f9ff; border:1px solid #bae6fd; padding:3px 7px; border-radius:6px;"><i class="fa-solid fa-phone"></i> ${phone}</a>` : ''}
                    </div>
                `;

                if (tab === '1차') {
                    let tagItems = '';
                    if (job && job !== '-') tagItems += `<span style="background:#eff6ff; color:#1e40af; border:1px solid #dbeafe; font-size:10.5px; font-weight:700; padding:2px 6px; border-radius:5px; display:inline-flex; align-items:center; gap:3px;"><i class="fa-solid fa-briefcase"></i> ${job}</span>`;
                    const isDriver = (c['운전여부'] === '운전' || (c['운전'] && c['운전'] !== '무' && c['운전'] !== '없음' && c['운전'] !== '비운전'));
                    if (isDriver) tagItems += `<span style="background:#f1f5f9; color:#475569; border:1px solid #e2e8f0; font-size:10.5px; font-weight:700; padding:2px 6px; border-radius:5px; display:inline-flex; align-items:center; gap:3px;"><i class="fa-solid fa-car"></i> ${driver}</span>`;
                    if (hasPet) tagItems += `<span style="background:#fff7ed; color:#c2410c; border:1px solid #ffedd5; font-size:10.5px; font-weight:700; padding:2px 6px; border-radius:5px; display:inline-flex; align-items:center; gap:3px;">${c['반려동물']}</span>`;

                    mobileCardHtml += `
                        ${tagItems ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:7px;">${tagItems}</div>` : ''}
                        ${addr !== '-' ? `<div style="font-size:11.5px; color:#64748b; line-height:1.35; display:flex; align-items:flex-start; gap:5px; margin-top:3px;"><i class="fa-solid fa-location-dot" style="margin-top:2px; font-size:11px; color:#94a3b8;"></i> <span>${addr}</span></div>` : ''}
                        ${memo !== '-' ? `<div style="font-size:11.5px; color:#334155; font-weight:600; line-height:1.35; display:flex; align-items:flex-start; gap:5px; margin-top:3px;"><i class="fa-solid fa-note-sticky" style="margin-top:2px; font-size:11px; color:#94a3b8;"></i> <span>${memo}</span></div>` : ''}
                    `;
                } else if (tab === '터치') {
                    mobileCardHtml += `
                        <div style="background:#eff6ff; border-radius:8px; padding:7px 10px; margin-bottom:5px; font-size:12px; color:#1d4ed8; font-weight:700;">
                            <i class="fa-solid fa-sparkles"></i> ${touch}
                        </div>
                        ${memo !== '-' ? `<div style="font-size:11.5px; color:#64748b; line-height:1.35; display:flex; align-items:flex-start; gap:5px;"><i class="fa-solid fa-comment-dots" style="margin-top:2px; font-size:11px; color:#94a3b8;"></i> <span>상담메모: ${memo}</span></div>` : ''}
                    `;
                } else if (tab === '보험') {
                    let insSummary = '-';
                    try {
                        let insList = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(c, true) : [];
                        if (insList.length > 0) {
                            insSummary = insList.map(i => {
                                const comp = i['회사명'] || i['보험사'] || '';
                                const prod = i['상품명'] || '';
                                const pay = i['납입방법'] || i['결제방법'] || '';
                                return `<span style="display:inline-block; background:#f1f5f9; border:1px solid #e2e8f0; padding:2px 7px; border-radius:4px; margin-right:4px; margin-bottom:4px; font-size:11.5px;"><b>${comp}</b> ${prod} ${pay ? `(${pay})` : ''}</span>`;
                            }).join('');
                        }
                    } catch(e) {}

                    mobileCardHtml += `
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; font-size:11.5px; color:#334155; line-height:1.4;">
                            <div style="font-weight:700; color:#0f172a; margin-bottom:3px;"><i class="fa-solid fa-file-shield" style="color:#2563eb;"></i> 가입 상품:</div>
                            ${insSummary}
                        </div>
                    `;
                }

                mobileCardHtml += `</div>`;
            });
        }
        if (resultArea) resultArea.innerHTML = tbHtml;
        const mobileListArea = document.getElementById('quickEditMobileList');
        if (mobileListArea) mobileListArea.innerHTML = mobileCardHtml;
        if (typeof window.syncSpeedCenterMobileUI === 'function') window.syncSpeedCenterMobileUI();
    } catch(err) {
        console.error("Speed Center Search Error:", err);
    }
};
