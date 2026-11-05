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

window.openQuickEditModal = function() {
    const modal = document.getElementById('quickEditModal');
    if (!modal) return;

    modal.style.display = 'flex';
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
        if (searchInput) searchInput.focus();
    }, 150);
};

window.closeQuickEditModal = function() {
    const modal = document.getElementById('quickEditModal');
    if (modal) modal.style.display = 'none';
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
            badgeText.innerText = '운전여부: ' + (window.speedCenterFilters.driver || '선택 대기');
        } else if (activeType === 'pet') {
            badgeText.innerText = '반려동물: ' + (window.speedCenterFilters.hasPet === '유' ? '보유(유)' : '없음(무)');
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

        // 1. Text Search query
        if (query) {
            matches = matches.filter(c => {
                const name = String(c['성함'] || c['대표자명'] || '').toLowerCase();
                const phone = String(c['연락처'] || c['전화번호'] || '').replace(/-/g, '');
                const qClean = query.replace(/-/g, '');
                const memo = String(c['특이사항'] || c['메모'] || '').toLowerCase();
                const job = String(c['직업'] || '').toLowerCase();
                const addr = String(c['주소'] || '').toLowerCase();
                return name.includes(query) || phone.includes(qClean) || memo.includes(query) || job.includes(query) || addr.includes(query);
            });
        }

        // 2. Single Filter Application
        const f = window.speedCenterFilters;
        if (f.activeType) {
            if (f.activeType === 'driver' && f.driver) {
                matches = matches.filter(c => {
                    const driverVal = String(c['운전'] || '').toLowerCase();
                    const carUsageVal = String(c['차량용도'] || '').toLowerCase();
                    const combined = driverVal + " " + carUsageVal;
                    return combined.includes(f.driver.toLowerCase());
                });
            } else if (f.activeType === 'pet' && f.hasPet) {
                matches = matches.filter(c => {
                    const pet = String(c['반려동물'] || c['반려'] || '').trim();
                    const has = pet && pet !== '무' && pet !== '없음' && pet !== '-' && pet !== 'x';
                    return (f.hasPet === '유') ? has : !has;
                });
            } else if (f.activeType === 'biz' && f.bizType) {
                matches = matches.filter(c => {
                    const biz = String(c['사업자구분'] || c['직업'] || c['상세직무'] || '').toLowerCase();
                    if (f.bizType === '개인사업자') return biz.includes('개인') || biz.includes('자영업') || biz.includes('대표');
                    if (f.bizType === '법인사업자') return biz.includes('법인');
                    if (f.bizType === '일반고객') return !biz.includes('사업자') && !biz.includes('법인');
                    return biz.includes(f.bizType.toLowerCase());
                });
            } else if (f.activeType === 'pay' && f.payMethod) {
                matches = matches.filter(c => {
                    let payStr = String(c['결제방법'] || c['수납방법'] || c['납부방법'] || '').toLowerCase();
                    try {
                        let insList = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(c, true) : [];
                        if (insList.length > 0) {
                            insList.forEach(i => {
                                payStr += " " + String(i['납입방법'] || i['결제방법'] || '').toLowerCase();
                            });
                        }
                    } catch(e) {}
                    return payStr.includes(f.payMethod.toLowerCase());
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
            if (tab === '1차') {
                theadArea.innerHTML = `
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700;">고객명</th>
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700;">진행상태</th>
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700;">연령/성별</th>
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700;">생년월일</th>
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700;">연락처</th>
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700;">운전</th>
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700;">반려동물</th>
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700;">직업</th>
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700;">주소</th>
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700;">특이사항</th>
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700;">가족사항</th>
                `;
            } else if (tab === '터치') {
                theadArea.innerHTML = `
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700; width:120px;">고객명</th>
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700; width:100px;">진행상태</th>
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700;">터치 인사이트 (우선순위 추천)</th>
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700;">상담 메모</th>
                `;
            } else if (tab === '보험') {
                theadArea.innerHTML = `
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700; width:120px;">고객명</th>
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700; width:100px;">진행상태</th>
                    <th style="padding:12px 14px; text-align:left; color:#475569; font-weight:700;">가입 증권 / 상품 내역</th>
                `;
            }
        }

        // Render Rows
        let tbHtml = '';
        if (matches.length === 0) {
            tbHtml = '<tr><td colspan="15" style="text-align:center; padding:60px 20px; color:#94a3b8; font-weight:600;"><i class="fa-solid fa-magnifying-glass" style="font-size:24px; margin-bottom:8px; display:block;"></i>일치하는 고객이 없습니다.</td></tr>';
        } else {
            matches.forEach(c => {
                const id = c['고객ID'] || c['고객고유번호'] || c['id'] || '';
                const name = c['성함'] || c['대표자명'] || '-';
                const status = c['상태'] || c['진행상태'] || '신규';
                const phone = c['연락처'] || c['전화번호'] || '-';
                const ageGender = (c['나이'] ? c['나이'] + '세' : '-') + ' / ' + (c['성별'] || '-');
                const birth = c['생년월일'] || c['생일'] || '-';
                const driver = (c['운전'] || '-') + (c['차량용도'] ? ' (' + c['차량용도'] + ')' : '');
                const pet = (c['반려동물'] && c['반려동물'] !== '무' && c['반려동물'] !== '없음') 
                            ? `<span style="color:#d97706; font-weight:700;">🐾 ${c['반려동물']}</span>` 
                            : '<span style="color:#94a3b8;">-</span>';
                const job = (c['직업'] || '-') + (c['상세직무'] ? ` (${c['상세직무']})` : '');
                const addr = c['주소'] || '-';
                const memo = c['특이사항'] || c['메모'] || '-';
                const family = c['가족사항'] || '-';
                const touch = c['터치인사이트'] || '-';

                let statusBg = '#eff6ff'; let statusColor = '#2563eb';
                if (status.includes('상담')) { statusBg = '#fefce8'; statusColor = '#ca8a04'; }
                else if (status.includes('체결') || status.includes('계약')) { statusBg = '#ecfdf5'; statusColor = '#059669'; }
                else if (status.includes('케어')) { statusBg = '#fee2e2'; statusColor = '#dc2626'; }

                tbHtml += `<tr style="border-bottom:1px solid #f1f5f9; cursor:pointer;" onmouseover="this.style.background='#f8fafc';" onmouseout="this.style.background='#ffffff';">`;
                
                if (tab === '1차') {
                    tbHtml += `
                        <td style="padding:12px 14px; font-weight:800; color:#1e293b;" onclick="showMasterDetail('${id}')">${name}</td>
                        <td style="padding:12px 14px;"><span style="display:inline-block; padding:3px 8px; border-radius:6px; font-size:11.5px; font-weight:700; background:${statusBg}; color:${statusColor};">${status}</span></td>
                        <td style="padding:12px 14px; color:#475569; font-size:13px;">${ageGender}</td>
                        <td style="padding:12px 14px; color:#475569; font-size:13px;">${birth}</td>
                        <td style="padding:12px 14px; color:#0284c7; font-weight:700; font-size:13px;">${phone}</td>
                        <td style="padding:12px 14px; color:#475569; font-size:13px;">${driver}</td>
                        <td style="padding:12px 14px; color:#475569; font-size:13px;">${pet}</td>
                        <td style="padding:12px 14px; color:#475569; font-size:13px;">${job}</td>
                        <td style="padding:12px 14px; color:#64748b; font-size:12.5px; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${addr}">${addr}</td>
                        <td style="padding:12px 14px; color:#64748b; font-size:12.5px; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${memo}">${memo}</td>
                        <td style="padding:12px 14px; color:#64748b; font-size:12.5px;">${family}</td>
                    `;
                } else if (tab === '터치') {
                    tbHtml += `
                        <td style="padding:12px 14px; font-weight:800; color:#1e293b;" onclick="showMasterDetail('${id}')">${name}</td>
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
                        <td style="padding:12px 14px; font-weight:800; color:#1e293b;" onclick="showMasterDetail('${id}')">${name}</td>
                        <td style="padding:12px 14px;"><span style="display:inline-block; padding:3px 8px; border-radius:6px; font-size:11.5px; font-weight:700; background:${statusBg}; color:${statusColor};">${status}</span></td>
                        <td style="padding:12px 14px; color:#334155;">${insSummary}</td>
                    `;
                }
                tbHtml += '</tr>';
            });
        }
        resultArea.innerHTML = tbHtml;
    } catch(err) {
        console.error("Speed Center Search Error:", err);
    }
};
