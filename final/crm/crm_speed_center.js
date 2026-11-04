/**
 * crm_speed_center.js
 * 위라클 CRM - 스피드 작업 센터 전담 모듈 (독립 분리)
 * 기능: 빠른 검색, 1차/터치/보험 탭 전환, 5대 다이렉트 필터(운전/나이/반려동물/사업자/결제)
 */

window.speedCenterFilters = {
    driver: '',      // '', '이륜차', '영업용', '업무용', '자가용'
    ageGroup: '',    // '', '10', '20', '30', '40', '50', '60'
    hasPet: false,   // true / false
    bizType: '',     // '', '개인사업자', '법인사업자', '일반고객'
    payMethod: ''    // '', '카드', '자동이체'
};

window.openQuickEditModal = function() {
    const modal = document.getElementById('quickEditModal');
    if (!modal) return;

    modal.style.display = 'flex';
    document.getElementById('quickEditSearchInput').value = '';
    
    // 필터 초기화
    window.resetSpeedCenterFilters(false);

    // 초기 검색 및 테이블 렌더링
    window.handleQuickEditSearch();

    setTimeout(() => {
        const inp = document.getElementById('quickEditSearchInput');
        if (inp) inp.focus();
    }, 150);
};

window.closeQuickEditModal = function() {
    const modal = document.getElementById('quickEditModal');
    if (modal) modal.style.display = 'none';
};

window.resetSpeedCenterFilters = function(triggerSearch = true) {
    window.speedCenterFilters = {
        driver: '',
        ageGroup: '',
        hasPet: false,
        bizType: '',
        payMethod: ''
    };

    // UI 버튼 active 클래스 해제
    document.querySelectorAll('.sc-filter-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = '#ffffff';
        btn.style.color = '#475569';
        btn.style.borderColor = '#cbd5e1';
    });

    const petBtn = document.getElementById('sc-btn-pet');
    if (petBtn) {
        petBtn.style.background = '#ffffff';
        petBtn.style.color = '#475569';
        petBtn.style.borderColor = '#cbd5e1';
    }

    const selects = ['sc-select-driver', 'sc-select-age', 'sc-select-biz', 'sc-select-pay'];
    selects.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    if (triggerSearch) window.handleQuickEditSearch();
};

window.setSpeedFilter = function(filterKey, value) {
    if (filterKey === 'hasPet') {
        window.speedCenterFilters.hasPet = !window.speedCenterFilters.hasPet;
        const petBtn = document.getElementById('sc-btn-pet');
        if (petBtn) {
            if (window.speedCenterFilters.hasPet) {
                petBtn.style.background = '#fef3c7';
                petBtn.style.color = '#b45309';
                petBtn.style.borderColor = '#f59e0b';
            } else {
                petBtn.style.background = '#ffffff';
                petBtn.style.color = '#475569';
                petBtn.style.borderColor = '#cbd5e1';
            }
        }
    } else {
        window.speedCenterFilters[filterKey] = value;
    }
    window.handleQuickEditSearch();
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
            if (countArea) countArea.innerText = "0";
            return;
        }

        const cleanQuery = query.replace(/[\s-]/g, "");
        let matches = [...window.globalCustomerData];

        // 1. 텍스트 검색 필터
        if (cleanQuery) {
            matches = matches.filter(c => {
                let allValuesStr = "";
                for (let key in c) {
                    if (c.hasOwnProperty(key)) {
                        let val = c[key];
                        if (typeof val === 'object') val = JSON.stringify(val);
                        allValuesStr += String(val).toLowerCase().replace(/[\s-]/g, "") + "|";
                    }
                }
                return allValuesStr.includes(cleanQuery);
            });
        }

        // 2. 신규 필터 5종 적용
        const f = window.speedCenterFilters;

        // 4번: 운전여부 (이륜차, 영업용, 업무용, 자가용)
        if (f.driver) {
            matches = matches.filter(c => {
                const driverVal = String(c['운전여부'] || '').toLowerCase();
                const carUsageVal = String(c['차량용도'] || '').toLowerCase();
                const combined = driverVal + " " + carUsageVal;
                return combined.includes(f.driver.toLowerCase());
            });
        }

        // 5번: 나이대별 필터 (10대 이하, 20대, 30대, 40대, 50대, 60대 이상)
        if (f.ageGroup) {
            matches = matches.filter(c => {
                let age = parseInt(c['나이'], 10);
                if (isNaN(age) || age <= 0) {
                    // 생년월일이나 주민번호로 나이 추정
                    let b = String(c['생일'] || c['생년월일'] || c['주민번호'] || '').replace(/\D/g, '');
                    if (b.length >= 6) {
                        let birthYear = parseInt(b.substring(0, 2), 10);
                        const curYear = new Date().getFullYear();
                        const fullBirthYear = (birthYear > (curYear % 100)) ? (1900 + birthYear) : (2000 + birthYear);
                        age = curYear - fullBirthYear;
                    }
                }
                if (isNaN(age)) return false;

                if (f.ageGroup === '10') return age < 20;
                if (f.ageGroup === '20') return age >= 20 && age < 30;
                if (f.ageGroup === '30') return age >= 30 && age < 40;
                if (f.ageGroup === '40') return age >= 40 && age < 50;
                if (f.ageGroup === '50') return age >= 50 && age < 60;
                if (f.ageGroup === '60') return age >= 60;
                return true;
            });
        }

        // 6번: 반려동물 필터
        if (f.hasPet) {
            matches = matches.filter(c => {
                const pet = String(c['반려동물'] || '').trim();
                const petName = String(c['동물이름'] || '').trim();
                if (pet && pet !== '무' && pet !== '없음' && pet !== '-' && pet !== 'false') return true;
                if (petName && petName !== '-' && petName !== '없음') return true;
                return false;
            });
        }

        // 7번: 개인사업자 / 법인사업자 / 일반고객 필터
        if (f.bizType) {
            matches = matches.filter(c => {
                const biz = String(c['사업여부'] || '').trim();
                const corpName = String(c['상호명'] || '').trim();
                const bizNum = String(c['사업자번호'] || '').trim();

                if (f.bizType === '법인사업자') {
                    return biz.includes('법인') || corpName.includes('(주)') || corpName.includes('주식회사');
                } else if (f.bizType === '개인사업자') {
                    return (biz.includes('개인') || (bizNum && !corpName.includes('(주)')));
                } else if (f.bizType === '일반고객') {
                    return !bizNum && !biz.includes('사업');
                }
                return true;
            });
        }

        // 8번: 결제정보 (신용카드 / 자동이체) 필터
        if (f.payMethod) {
            matches = matches.filter(c => {
                let hasPayMethod = false;
                try {
                    let insList = typeof getGlobalInsuranceList === 'function' ? getGlobalInsuranceList(c, true) : [];
                    insList.forEach(i => {
                        const pay = String(i['납입방법'] || i['결제방법'] || i['이체방법'] || i['결제정보'] || '').toLowerCase();
                        if (f.payMethod === '카드' && (pay.includes('카드') || pay.includes('card'))) hasPayMethod = true;
                        if (f.payMethod === '자동이체' && (pay.includes('이체') || pay.includes('통장') || pay.includes('계좌') || pay.includes('cms'))) hasPayMethod = true;
                    });
                } catch(e) {}
                return hasPayMethod;
            });
        }

        if (countArea) countArea.innerText = matches.length;

        // 테이블 헤더 렌더링
        const thStyle = "padding:12px 14px; font-size:13px; font-weight:800; color:#475569; border-bottom:1px solid #e2e8f0; white-space:nowrap; background:#f1f5f9; position:sticky; top:0;";
        let theadHtml = '<tr>';
        const tab = window.currentQuickEditTab;

        if (tab === '1차') {
            theadHtml += `<th style="${thStyle} min-width:80px;">고객명</th>
                          <th style="${thStyle} min-width:90px;">상태</th>
                          <th style="${thStyle}">나이/성별</th>
                          <th style="${thStyle}">생일</th>
                          <th style="${thStyle}">폰번호</th>
                          <th style="${thStyle}">운전/용도</th>
                          <th style="${thStyle}">반려동물</th>
                          <th style="${thStyle}">직업(상세)</th>
                          <th style="${thStyle}">주소</th>
                          <th style="${thStyle}">특이사항</th>
                          <th style="${thStyle}">가족사항</th>`;
        } else if (tab === '터치') {
            theadHtml += `<th style="${thStyle} width:10%;">고객명</th>
                          <th style="${thStyle} width:10%;">상태</th>
                          <th style="${thStyle} width:50%;">터치인사이트</th>
                          <th style="${thStyle} width:30%;">특이사항</th>`;
        } else if (tab === '보험') {
            theadHtml += `<th style="${thStyle} width:10%;">고객명</th>
                          <th style="${thStyle} width:10%;">상태</th>
                          <th style="${thStyle} width:80%;">가입내역 / 결제정보</th>`;
        }
        theadHtml += '</tr>';
        if (theadArea) theadArea.innerHTML = theadHtml;

        // 테이블 바디 렌더링 (최대 100건)
        const displayList = matches.slice(0, 100);
        let tbHtml = '';

        if (displayList.length === 0) {
            tbHtml = '<tr><td colspan="15" style="text-align:center; padding:80px 20px; color:#94a3b8; font-weight:600; font-size:15px;">조건에 일치하는 고객이 없습니다.</td></tr>';
        } else {
            displayList.forEach(c => {
                const id = c['고객번호'] || c['ID'] || '';
                const name = c['고객명'] || c['대표자명'] || '-';
                const status = c['상태'] || c['고객상태'] || '관심고객';
                const phone = c['폰번호'] || c['연락처'] || '-';
                const ageGender = (c['나이'] ? c['나이'] + '세' : '-') + ' / ' + (c['성별'] || '-');
                const birth = c['생일'] || c['생년월일'] || '-';
                const driver = (c['운전여부'] || '-') + (c['차량용도'] ? ' (' + c['차량용도'] + ')' : '');
                const pet = (c['반려동물'] && c['반려동물'] !== '무' && c['반려동물'] !== '없음') 
                            ? `🐶 ${c['동물이름'] || '유'}` 
                            : '-';
                const job = (c['직업'] || '-') + (c['상세업무'] ? ` (${c['상세업무']})` : '');
                const addr = c['주소'] || '-';
                const memo = c['특이사항'] || c['메모'] || '-';
                const family = c['가족사항'] || '-';
                const touch = c['터치인사이트'] || '-';

                // 상태 뱃지 스타일
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
