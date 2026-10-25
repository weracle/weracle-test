/**
 * 설계이지(PlanEasy) 언더라이팅 심사 분석 및 매칭 엔진
 * Underwriting Evaluation & Matching Engine (표준체 3개월/1년/5년, 간편심사 3.5.5, 치아, 투약/진료)
 */

// 0. 심사 결과 보기 방식 전환 (표 형태, 카드 형태, 바 형태)
function switchResultStyle(style) {
    document.querySelectorAll('.style-switch-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-style') === style);
    });
    document.querySelectorAll('.v-container').forEach(el => {
        el.style.display = (el.getAttribute('data-view') === style) ? '' : 'none';
    });
}

// 1. 상단 6대 메인 탭 전환
function switchMainTab(paneId) {
    // 모든 탭 패널 숨김
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    // 모든 탭 버튼 비활성화
    document.querySelectorAll('.sgez-tab-btn').forEach(b => b.classList.remove('active'));
    
    // 대상 탭 표시
    const target = document.getElementById(paneId);
    if (target) target.classList.add('active');
    
    // 대상 탭 버튼 활성화
    const tabMap = {
        'tabSummary': 0,
        'tabStandard': 1,
        'tabSimple': 2,
        'tabDental': 3,
        'tabAllMedical': 4,
        'tabAllDrugs': 5
    };
    const tabBtns = document.querySelectorAll('.sgez-tab-btn');
    const idx = tabMap[paneId];
    if (idx !== undefined && tabBtns[idx]) {
        tabBtns[idx].classList.add('active');
    }

    // 탭 전환 시 항상 종합 요약 리포트(카드형) 기본 노출 상태로 초기화
    if (paneId === 'tabStandard') filterStandard('all');
    if (paneId === 'tabSimple') filterSimple('all');
    if (paneId === 'tabDental') filterDental('all');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 2. 건강체(일반심사) 기간별 서브 필터링 및 결과 카드 갱신 (전체항목, 3개월, 1년, 5년)
function filterStandard(key, btn) {
    const subPills = document.querySelectorAll('#tabStandard .sub-pill-bar .sub-pill');
    subPills.forEach(p => p.classList.remove('active'));
    if (btn && btn.parentElement) {
        btn.classList.add('active');
    } else {
        const pillMap = {
            'all': 0,
            '3m': 1,
            '1y': 2,
            '5y_treat': 3,
            '5y_11dis': 4
        };
        const idx = pillMap[key];
        if (idx !== undefined && subPills[idx]) {
            subPills[idx].classList.add('active');
        }
    }
    
    const evalData = window._currentStdEval;
    let title = '표준체(일반심사) 4대 고지항목 언더라이팅 종합 리포트';
    let badge = '<span class="point-tag tag-pass">건강체 가입가능</span>';
    let metric = '0건 해당 (정상 통과)';
    let desc = '최근 3개월 진료, 1년 추가검사 소견, 5년 내 7일 지속치료 및 30일 계속투약이 없습니다. <b>표준체 무할증으로 전기간 정상 가입</b>이 가능합니다.';

    if (evalData) {
        const items3m = evalData.items3m || [];
        const items1y = evalData.items1y || [];
        const hosp5y = evalData.hospItems5y || [];
        const surg5y = evalData.surgItems5y || [];
        const treat7d = evalData.treat7dItems || [];
        const drug30d = evalData.drug30dItems || [];
        const dis11 = evalData.dis11Items || [];

        if (key === 'all') {
            title = '표준체(일반심사) 4대 고지항목 언더라이팅 종합 리포트';
            if (evalData.pass) {
                badge = '<span class="point-tag tag-pass">건강체 가입가능</span>';
                metric = '0건 해당 (정상 통과)';
                desc = '최근 3개월 진료, 1년 추가검사 소견, 5년 7일치료/30일투약/입원수술 및 11대 질병 기준을 완벽하게 통과했습니다.';
            } else {
                badge = '<span class="point-tag tag-warn">고지필요 확인대상</span>';
                metric = '고지 대상 확인 필요';
                desc = '건강체 4대 알릴의무 항목 중 확인 및 청약 시 고지가 필요한 내역이 존재합니다.';
            }
        } else if (key === '3m') {
            title = '1. 진료 (3개월) 점검 결과';
            if (items3m.length > 0) {
                badge = '<span class="point-tag tag-warn">고지필요</span>';
                metric = `${items3m.length}건 방문`;
                desc = `최근 3개월 이내 총 ${items3m.length}건의 병의원 진료 내역이 확인되어 청약 시 고지가 필요합니다.`;
            } else {
                badge = '<span class="point-tag tag-pass">통과</span>';
                metric = '0건 (통과)';
                desc = '최근 3개월 이내 병의원 진료 내역이 없어 3개월 법정 알릴의무 기간을 완벽하게 통과했습니다.';
            }
        } else if (key === '1y') {
            title = '2. 추가검사, 재검사 (1년) 점검 결과';
            if (items1y.length > 0) {
                badge = '<span class="point-tag tag-warn">확인필요</span>';
                metric = `${items1y.length}건 소견`;
                desc = `최근 1년 이내 ${items1y[0].codeName || '추가검사'} 등 정밀검사/소견 ${items1y.length}건이 확인되었습니다.`;
            } else {
                badge = '<span class="point-tag tag-pass">통과</span>';
                metric = '0건 (통과)';
                desc = '최근 1년 이내 의사의 추가검사 및 재검사 소견이 없어 고지 대상 없이 통과되었습니다.';
            }
        } else if (key === '5y_treat') {
            title = '3. 7일이상 치료, 30일이상 투약, 입원, 수술 (5년) 점검 결과';
            const totalTreat = hosp5y.length + surg5y.length + treat7d.length + drug30d.length;
            if (totalTreat > 0) {
                badge = '<span class="point-tag tag-warn">고지필요</span>';
                metric = `${totalTreat}건 해당`;
                desc = `입원 ${hosp5y.length}건, 수술 ${surg5y.length}건, 7일 지속치료 ${treat7d.length}건, 30일 계속투약 ${drug30d.length}건이 확인되었습니다.`;
            } else {
                badge = '<span class="point-tag tag-pass">통과</span>';
                metric = '0건 (통과)';
                desc = '동일 질환 7일 지속치료, 30일 계속투약, 입원 및 수술 이력이 없어 법정 고지 기준을 모두 통과했습니다.';
            }
        } else if (key === '5y_11dis') {
            title = '4. 11대 중대질병 (5년) 점검 결과';
            if (dis11.length > 0) {
                badge = '<span class="point-tag tag-warn">고지필요</span>';
                metric = `${dis11.length}건 진단`;
                desc = `11대 중대질환 중 ${dis11[0].diseaseCategory}(${dis11[0].code} ${dis11[0].name}) 진단·치료 사실이 확인되었습니다.`;
            } else {
                badge = '<span class="point-tag tag-pass">통과</span>';
                metric = '0건 (통과)';
                desc = '암, 백혈병, 고혈압, 협심증, 심근경색, 심장판막증, 간경화증, 뇌졸중, 당뇨병 등 11대 중대질환 진단 및 치료 이력이 전무하여 완벽 통과되었습니다.';
            }
        }
    }
    
    const titleEl = document.getElementById('stdResTitle');
    if (titleEl) titleEl.innerText = title;
    const badgeEl = document.getElementById('stdResBadge');
    if (badgeEl) badgeEl.innerHTML = badge;
    const metricEl = document.getElementById('stdResMetricNum');
    if (metricEl) {
        metricEl.innerText = metric;
        metricEl.style.color = metric.includes('통과') ? '#059669' : '#dc2626';
    }
    const descEl = document.getElementById('stdResDesc');
    if (descEl) descEl.innerHTML = desc;
    
    // 전체항목 보기일 때는 종합 요약 리포트 표시, 개별 기간 클릭 시 상세 테이블 표시
    const summaryBox = document.getElementById('stdSummaryReport');
    const detailBox = document.getElementById('stdDetailSection');
    if (key === 'all') {
        if (summaryBox) summaryBox.style.display = '';
        if (detailBox) detailBox.style.display = 'none';
    } else {
        if (summaryBox) summaryBox.style.display = 'none';
        if (detailBox) detailBox.style.display = '';
        
        const allTrs = document.querySelectorAll('#stdTable tbody tr');
        allTrs.forEach(r => {
            const isGroupHeader = r.classList.contains('group-header-row');
            const rowPeriodGroup = r.getAttribute('data-period-group');
            const rowPeriod = r.getAttribute('data-period');
            
            if (isGroupHeader) {
                r.style.display = (rowPeriodGroup === key) ? '' : 'none';
            } else if (rowPeriod === key) {
                r.style.display = '';
            } else {
                r.style.display = 'none';
            }
        });
    }
}
const selectStdPeriod = filterStandard;

// 3. 유병자(간편심사) 서브 필터링 및 결과 카드 갱신
function filterSimple(key, btn) {
    const subPills = document.querySelectorAll('#tabSimple .sub-pill-bar .sub-pill');
    subPills.forEach(p => p.classList.remove('active'));
    if (btn && btn.parentElement) {
        btn.classList.add('active');
    } else {
        const pillMap = {
            'all': 0,
            '3m': 1,
            '5y_hosp': 2,
            '5y_6dis': 3
        };
        const idx = pillMap[key];
        if (idx !== undefined && subPills[idx]) {
            subPills[idx].classList.add('active');
        }
    }
    
    const sim = window._currentSimEval;
    let title = '간편심사(유병자) 3대 질문 언더라이팅 리포트';
    let badge = '<span class="point-tag tag-pass">초경증 3.5.5 가입가능</span>';
    let metric = '3.5.5 가입가능';
    let desc = '간편고지 전 항목 통과 (최저가 3.5.5 초경증 가입가능)';

    if (sim) {
        if (key === 'all') {
            title = '간편심사(유병자) 3대 질문 언더라이팅 리포트';
            badge = `<span class="point-tag ${sim.pass ? 'tag-pass' : 'tag-warn'}">${sim.grade} 가입가능</span>`;
            metric = `${sim.grade} 가입가능`;
            desc = sim.desc;
        } else if (key === '3m') {
            title = '1. 진료, 소견 (3개월) 점검 결과';
            if (sim.findings3m > 0) {
                badge = '<span class="point-tag tag-warn">소견 확인필요</span>';
                metric = `${sim.findings3m}건 해당`;
                desc = `최근 3개월 이내 입원·수술·추가검사 소견 ${sim.findings3m}건이 확인되었습니다.`;
            } else {
                badge = '<span class="point-tag tag-pass">통과</span>';
                metric = '0건 (통과)';
                desc = '최근 3개월 이내 입원, 수술, 추가검사(재검사) 필요 소견이 전혀 없습니다.';
            }
        } else if (key === '5y_hosp') {
            title = '2. 입원, 수술 (5년) 점검 결과';
            if (sim.hospSurg5y > 0) {
                badge = '<span class="point-tag tag-warn">고지필요</span>';
                metric = `${sim.hospSurg5y}건 확인`;
                desc = `최근 5년 이내 입원/수술 이력 ${sim.hospSurg5y}건이 확인되어 간편심사 플랜(3.2.5 등) 적용 여부 검토가 필요합니다.`;
            } else {
                badge = '<span class="point-tag tag-pass">해당없음</span>';
                metric = '0건 (통과)';
                desc = '최근 5년 이내 질병이나 상해로 인한 입원 및 수술 이력이 없습니다.';
            }
        } else if (key === '5y_6dis') {
            title = '3. 6대 중대질병 (5년) 점검 결과';
            if (sim.dis6Items && sim.dis6Items.length > 0) {
                badge = '<span class="point-tag tag-warn">고지필요</span>';
                metric = `${sim.dis6Items.length}건 확인`;
                desc = `최근 5년 6대 질병(${sim.dis6Items[0].diseaseCategory}) 이력이 확인되었습니다.`;
            } else {
                badge = '<span class="point-tag tag-pass">해당없음</span>';
                metric = '0건 (통과)';
                desc = '최근 5년 이내 암, 협심증, 심근경색, 심장판막증, 간경화증, 뇌졸중 진단 및 치료 사실이 없습니다.';
            }
        }
    }
    
    const summaryBox = document.getElementById('simSummaryReport');
    const detailBox = document.getElementById('simDetailSection');
    if (key === 'all') {
        if (summaryBox) summaryBox.style.display = '';
        if (detailBox) detailBox.style.display = 'none';
    } else {
        if (summaryBox) summaryBox.style.display = 'none';
        if (detailBox) detailBox.style.display = '';
        
        const rows = document.querySelectorAll('#simTable tbody tr');
        rows.forEach(r => {
            const isGroupHeader = r.classList.contains('group-header-row');
            const rowPeriodGroup = r.getAttribute('data-period-group');
            const cat = r.getAttribute('data-cat');
            if (isGroupHeader) {
                r.style.display = (rowPeriodGroup === key) ? '' : 'none';
            } else if (cat === key) {
                r.style.display = '';
            } else {
                r.style.display = 'none';
            }
        });
    }
}

// 4. 치아보험 서브 필터링 및 결과 카드 갱신
function filterDental(key, btn) {
    const subPills = document.querySelectorAll('#tabDental .sub-pill-bar .sub-pill');
    subPills.forEach(p => p.classList.remove('active'));
    if (btn && btn.parentElement) {
        btn.classList.add('active');
    } else {
        const pillMap = {
            'all': 0,
            'cavity': 1,
            'perio': 2,
            'denture': 3
        };
        const idx = pillMap[key];
        if (idx !== undefined && subPills[idx]) {
            subPills[idx].classList.add('active');
        }
    }
    
    const summaryBox = document.getElementById('denSummaryReport');
    const detailBox = document.getElementById('denDetailSection');
    if (key === 'all') {
        if (summaryBox) summaryBox.style.display = '';
        if (detailBox) detailBox.style.display = 'none';
    } else {
        if (summaryBox) summaryBox.style.display = 'none';
        if (detailBox) detailBox.style.display = '';
        
        const rows = document.querySelectorAll('#denTable tbody tr');
        rows.forEach(r => {
            const isGroupHeader = r.classList.contains('group-header-row');
            const groupKey = r.getAttribute('data-period-group');
            const rowCat = r.getAttribute('data-cat');
            
            if (isGroupHeader) {
                r.style.display = (groupKey === key) ? '' : 'none';
            } else if (rowCat === key) {
                r.style.display = '';
            } else {
                r.style.display = 'none';
            }
        });
    }
}

// 5. 모든투약내역 서브 필터링 및 결과 카드 갱신
function filterDrugs(key, btn) {
    if (btn && btn.parentElement) {
        btn.parentElement.querySelectorAll('.sub-pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
    }
    
    const drugData = {
        'all': {
            title: '처방·조제 의약품 전수 목록',
            badge: '<span class="point-tag tag-pass">30일 고지의무 위반 없음</span>',
            metric: '0건',
            unit: '30일 이상 계속 투약 0건',
            desc: '동일 원인 30일 이상 투약 기준에 해당하는 고지 대상 약물이 없습니다.'
        },
        'warn_only': {
            title: '모든투약내역 확인필요내용 (30일 이상 투약 점검)',
            badge: '<span class="point-tag tag-pass">해당사항 없음 (정상 통과)</span>',
            metric: '0건 해당',
            unit: '30일 이상 계속 투약 0건',
            desc: '동일 질환으로 30일 이상 계속 투약한 약물이 전혀 없어, <b>고지 대상이나 확인이 필요한 주의 약제가 없습니다</b>.'
        }
    };
    
    const info = drugData[key] || drugData['all'];
    document.getElementById('drugResTitle').innerText = info.title;
    document.getElementById('drugResBadge').innerHTML = info.badge;
    const drugMetricEl = document.getElementById('drugResMetricNum');
    if (drugMetricEl) drugMetricEl.innerText = info.metric;
    const drugUnitEl = document.getElementById('drugResMetricUnit');
    if (drugUnitEl) drugUnitEl.innerText = info.unit;
    document.getElementById('drugResDesc').innerHTML = info.desc;
    
    const rows = document.querySelectorAll('#drugTable tbody tr');
    const emptyRow = document.getElementById('drugNoWarnRow');
    rows.forEach(r => {
        if (r.id === 'drugNoWarnRow') return;
        if (key === 'all') {
            r.style.display = '';
            r.classList.remove('row-highlight');
        } else if (key === 'warn_only') {
            r.style.display = 'none';
        }
    });
    if (emptyRow) {
        emptyRow.style.display = (key === 'warn_only') ? '' : 'none';
    }
}

// 6. 모든진료내역 서브 필터링 및 결과 카드 갱신
function filterAllMedical(key, btn) {
    if (btn && btn.parentElement) {
        btn.parentElement.querySelectorAll('.sub-pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
    }
    
    const titleEl = document.getElementById('medResTitle');
    const badgeEl = document.getElementById('medResBadge');
    const metricEl = document.getElementById('medResMetricNum');
    const descEl = document.getElementById('medResDesc');
    const secDetail = document.getElementById('secMedDetail');
    const secOrgs = document.getElementById('secMedOrgs');
    const boxOrgs = document.getElementById('medOrgs');

    if (key === 'all') {
        if (titleEl) titleEl.innerText = '모든진료내역 전수 점검 결과';
        if (badgeEl) badgeEl.innerHTML = '<span class="point-tag tag-pass">진료내역 심사 완료</span>';
        if (metricEl) { metricEl.innerText = '0건 방문'; metricEl.style.color = 'var(--brand-primary)'; }
        if (descEl) descEl.innerHTML = '병의원 및 약국 방문 기록과 세부 처치·검사 내역이 정상 연동되었습니다.';
        document.querySelectorAll('#medBasic tbody tr, #medDetail tbody tr').forEach(r => {
            r.style.display = '';
        });
        if (secDetail) secDetail.style.display = '';
        if (secOrgs) secOrgs.style.display = '';
        if (boxOrgs) boxOrgs.style.display = '';
    } else if (key === 'warn_only') {
        if (titleEl) titleEl.innerText = '모든진료내역 확인필요내용';
        if (badgeEl) badgeEl.innerHTML = '<span class="point-tag tag-pass">확인필요 0건</span>';
        if (metricEl) { metricEl.innerText = '0건 해당'; metricEl.style.color = 'var(--brand-primary)'; }
        if (descEl) descEl.innerHTML = '보험 가입 및 고지 시 확인이 필요한 주의 진료 및 수술 내역이 없습니다.';
        document.querySelectorAll('#medBasic tbody tr, #medDetail tbody tr').forEach(r => {
            if (r.classList.contains('row-check-needed')) {
                r.style.display = '';
            } else {
                r.style.display = 'none';
            }
        });
        if (secOrgs) secOrgs.style.display = 'none';
        if (boxOrgs) boxOrgs.style.display = 'none';
    }
}

// ========================================================
// 7. 건보공단 간편인증 및 실시간 언더라이팅 연동 모듈
// ========================================================

let nhisAuthCache = null;

function openAuthModal() {
    const modal = document.getElementById('uAuthModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeAuthModal() {
    const modal = document.getElementById('uAuthModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function getUnderwritingApiUrl() {
    if (window.HYPHEN_API_URL) return window.HYPHEN_API_URL;
    return '/api/hyphen';
}

async function callUnderwritingApi(payload) {
    const apiUrl = getUnderwritingApiUrl();
    let resp;
    try {
        resp = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (netErr) {
        throw new Error(`인증 서버와의 통신에 실패했습니다. (${netErr.message}) 잠시 후 다시 시도해주세요.`);
    }

    const text = await resp.text();
    let resData;
    try {
        resData = JSON.parse(text);
    } catch (jsonErr) {
        if (!resp.ok) {
            throw new Error(`인증 서버 응답 오류 (HTTP ${resp.status}). 백엔드 서버 상태를 확인해주세요.`);
        }
        throw new Error('인증 서버 응답 데이터를 정상적으로 파싱할 수 없습니다.');
    }

    if (!resp.ok) {
        const msg = resData.error || resData.message || `HTTP ${resp.status}`;
        throw new Error(`인증 처리 오류: ${msg}`);
    }

    return resData;
}

async function requestNhisAuth() {
    const name = document.getElementById('uAuthName')?.value?.trim();
    const ssn1 = document.getElementById('uAuthSsn1')?.value?.trim();
    const ssn2 = document.getElementById('uAuthSsn2')?.value?.trim();
    const phone = document.getElementById('uAuthPhone')?.value?.trim();
    const orgCd = document.getElementById('uAuthOrgCd')?.value || 'kakao';

    if (!name) {
        alert('고객 성명을 입력해주세요.');
        document.getElementById('uAuthName')?.focus();
        return;
    }
    if (!ssn1 || ssn1.length !== 6 || !/^\d{6}$/.test(ssn1)) {
        alert('주민등록번호 앞 6자리를 올바르게 입력해주세요.');
        document.getElementById('uAuthSsn1')?.focus();
        return;
    }
    if (!ssn2 || ssn2.length !== 7 || !/^\d{7}$/.test(ssn2)) {
        alert('주민등록번호 뒤 7자리를 올바르게 입력해주세요.');
        document.getElementById('uAuthSsn2')?.focus();
        return;
    }
    if (!phone || phone.length < 10) {
        alert('휴대폰 번호를 올바르게 입력해주세요.');
        document.getElementById('uAuthPhone')?.focus();
        return;
    }

    const statusBox = document.getElementById('uAuthStatusBox');
    const statusTitle = document.getElementById('uAuthStatusTitle');
    const statusDesc = document.getElementById('uAuthStatusDesc');
    const btnReq = document.getElementById('btnRequestAuth');

    if (statusBox) statusBox.style.display = 'block';
    if (statusTitle) statusTitle.innerText = '스마트폰으로 인증 요청 발송 중...';
    if (statusDesc) statusDesc.innerText = '고객님의 스마트폰으로 인증 요청을 전송하고 있습니다. 잠시만 기다려주세요.';
    if (btnReq) {
        btnReq.disabled = true;
        btnReq.innerText = '인증 요청 대기 중...';
    }

    try {
        if (statusTitle) statusTitle.innerText = '스마트폰 인증 대기 중...';
        if (statusDesc) statusDesc.innerText = `스마트폰(${orgCd.toUpperCase()})으로 인증 요청이 도착했습니다. 스마트폰에서 [인증완료]를 눌러주시면 심사 결과가 화면에 자동으로 표시됩니다.`;

        const resData = await callUnderwritingApi({
            serviceType: 'nhis',
            name: name,
            ssn1: ssn1,
            ssn2: ssn2,
            mobileNo: phone,
            loginOrgCd: orgCd
        });

        try {
            localStorage.setItem('LAST_NHIS_RAW_RESPONSE', JSON.stringify(resData));
        } catch (e) {}

        const common = resData.data?.common || resData.common || {};
        const isError = common.errYn === 'Y' || (common.errMsg && common.errMsg.trim() !== '');

        if (isError) {
            const rawMsg = common.errMsg || '인증 요청 처리에 실패했습니다.';
            let guideMsg = '오류: ' + rawMsg;
            if (rawMsg.includes('LOGIN-999')) {
                guideMsg = '인증 요청 처리 오류 [LOGIN-999]\n\n' +
                    '원인 및 확인 사항:\n' +
                    '1. 입력하신 성명, 주민등록번호(앞 6자리 및 뒤 7자리), 휴대폰 번호가 선택하신 간편인증사(카카오톡/PASS 등)의 본인 명의 정보와 정확히 일치해야 합니다.\n' +
                    '2. 최근 1~2분 내에 인증 요청을 반복 전송한 경우, 인증기관 보안 정책에 의해 일시 차단될 수 있습니다. 1~2분 후 다시 시도해주세요.\n' +
                    '3. 법인폰, 미성년자, 알뜰폰 명의 불일치 시 인증이 제한될 수 있습니다.';
            } else if (rawMsg.includes('LOGIN-004')) {
                guideMsg = '인증 정보 확인 오류 [LOGIN-004]\n\n' + rawMsg + '\n\n* 이름, 주민등록번호, 휴대폰 번호가 본인 명의 정보와 일치하는지 확인해주세요.';
            }
            if (statusTitle) statusTitle.innerText = '인증 실패';
            if (statusDesc) statusDesc.innerText = rawMsg;
            if (btnReq) {
                btnReq.disabled = false;
                btnReq.innerText = '간편인증 요청 및 실시간 심사 시작';
            }
            alert(guideMsg);
            return;
        }

        let dataObj = resData.data || resData;
        while (dataObj && dataObj.data && typeof dataObj.data === 'object' && !dataObj.personalCareInfoList && !dataObj.basicMedicalTreatmentInfoList && !dataObj.resBasicTreatList) {
            dataObj = dataObj.data;
        }

        // 실제 수신된 레코드 존재 여부 정밀 검증
        const hasRecords = Boolean(
            (dataObj.personalCareInfoList && dataObj.personalCareInfoList.length > 0) ||
            (dataObj.basicMedicalTreatmentInfoList && dataObj.basicMedicalTreatmentInfoList.length > 0) ||
            (dataObj.resBasicTreatList && dataObj.resBasicTreatList.length > 0) ||
            (dataObj.resDetailTreatList && dataObj.resDetailTreatList.length > 0) ||
            (dataObj.prescriptionFormulationInfoList && dataObj.prescriptionFormulationInfoList.length > 0) ||
            (dataObj.resPrescribeDrugList && dataObj.resPrescribeDrugList.length > 0)
        );

        if (!hasRecords) {
            if (statusTitle) statusTitle.innerText = '수신 데이터 0건 또는 인증 미완료';
            if (statusDesc) statusDesc.innerText = '스마트폰 카카오톡 인증이 서명되지 않았거나, 건보공단에 최근 5년 진료 기록이 없습니다.';
            if (btnReq) {
                btnReq.disabled = false;
                btnReq.innerText = '다시 간편인증 요청하기';
            }
            renderUnderwritingData(dataObj, name);
            alert(`${name} 님: 최근 5년 건강보험공단 진료·처방 내역이 0건으로 수신되었습니다.\n\n* 스마트폰 카카오톡 지갑에서 알림을 받지 못하셨거나 인증서 서명을 완료하지 않은 상태에서 결과가 수신된 경우, 화면 상단의 [건보공단 원본 JSON] 버튼을 클릭하여 수신된 전문 상태를 확인하시거나 다시 인증을 진행해 주시기 바랍니다.`);
            return;
        }

        renderUnderwritingData(dataObj, name);
        closeAuthModal();
        alert(`${name} 님의 최근 5년 건강보험공단 진료·투약 내역 조회가 성공적으로 완료되어 3개월·1년·5년 법정 알릴의무 심사 결과가 화면에 반영되었습니다.`);
    } catch (err) {
        if (statusTitle) statusTitle.innerText = '통신 오류';
        if (statusDesc) statusDesc.innerText = err.message;
        if (btnReq) {
            btnReq.disabled = false;
            btnReq.innerText = '간편인증 요청 및 실시간 심사 시작';
        }
        alert(err.message);
    }
}

// 2단계 잔여 호환용 헬퍼 (기존 호출 방어)
async function verifyNhisAndAnalyze() {
    await requestNhisAuth();
}

function loadSampleUnderwritingData() {
    const inputName = document.getElementById('uAuthName')?.value?.trim();
    const targetName = inputName || '홍길동';

    const sampleData = {
        personalCareInfoList: [
            {
                medicalCenter: '서울성심병원',
                daysHsptTrtm: '3',
                medicalExpensesIPaid: '72000',
                amtBenefited: '182000',
                totalMedicalExpenses: '254000'
            },
            {
                medicalCenter: '종로연세이비인후과의원',
                daysHsptTrtm: '2',
                medicalExpensesIPaid: '14400',
                amtBenefited: '33600',
                totalMedicalExpenses: '48000'
            },
            {
                medicalCenter: '도봉온누리약국',
                daysHsptTrtm: '2',
                medicalExpensesIPaid: '5550',
                amtBenefited: '12950',
                totalMedicalExpenses: '18500'
            }
        ],
        basicMedicalTreatmentInfoList: [
            {
                treatmentStartDate: '2024-05-12',
                medicalCenter: '서울성심병원',
                diagDept: '내과',
                primaryDxCode: 'K21.0',
                primaryDxName: '위식도역류병',
                numberVisitDays: '2',
                medicalExpensesIPaid: '37200',
                amtBenefited: '86800',
                totalMedicalExpenses: '124000'
            },
            {
                treatmentStartDate: '2023-11-20',
                medicalCenter: '종로연세이비인후과의원',
                diagDept: '이비인후과',
                primaryDxCode: 'J00',
                primaryDxName: '급성 비인두염(감기)',
                numberVisitDays: '2',
                medicalExpensesIPaid: '14400',
                amtBenefited: '33600',
                totalMedicalExpenses: '48000'
            }
        ],
        detailedMedicalTreatmentInfoList: [
            {
                treatmentStartDate: '2024-05-12',
                medicalCenter: '서울성심병원',
                medicalDetails: '검사',
                codeName: '상부소화관내시경검사(E7611)',
                singleDose: '1',
                singleDoseCount: '1',
                totalDosingDays: '1'
            }
        ],
        prescriptionFormulationInfoList: [
            {
                treatmentStartDate: '2024-05-12',
                medicalCenter: '도봉온누리약국',
                prescriptionFilled: '조제완료',
                medicineName: '라베프라졸나트륨정20mg',
                componentName: 'Rabeprazole Sodium',
                singleDose: '1',
                singleDoseCount: '1',
                totalDosingDays: '14',
                efficacy: '위산분비억제제'
            },
            {
                treatmentStartDate: '2023-11-20',
                medicalCenter: '도봉온누리약국',
                prescriptionFilled: '조제완료',
                medicineName: '아세트아미노펜정500mg',
                componentName: 'Acetaminophen',
                singleDose: '1',
                singleDoseCount: '3',
                totalDosingDays: '3',
                efficacy: '해열진통소염제'
            }
        ]
    };

    renderUnderwritingData(sampleData, targetName);
    closeAuthModal();
    alert(`시연용 샘플 데이터가 성공적으로 로드되었습니다. (${targetName} 님 기준 5년 병력 고지의무 심사 완료)`);
}

function renderUnderwritingData(data, patientName) {
    if (!data) return;

    // 1. 고객명 및 헤더 정보 반영
    if (patientName) {
        const elName = document.getElementById('uCustName');
        const elAvatar = document.getElementById('uCustAvatar');
        const elStatus = document.getElementById('uCustStatus');
        if (elName) elName.innerText = patientName + ' 님';
        if (elAvatar) elAvatar.innerText = patientName.charAt(0);
        if (elStatus) elStatus.innerText = '심사 완료 (정상)';
        document.title = '심사 분석 리포트 - ' + patientName + ' 님';
    }

    const rawBasic = data.basicMedicalTreatmentInfoList || data.resBasicTreatList || [];
    const basicList = rawBasic.map(item => ({
        treatmentStartDate: item.treatmentStartDate || item.resTreatStartDate || item.treatStartDate || '-',
        medicalCenter: item.medicalCenter || item.resHospitalName || item.hospitalName || item.resTreatCenterName || '-',
        diagDept: item.diagDept || item.resTreatDept || item.treatDept || '일반',
        primaryDxCode: item.primaryDxCode || item.resDiseaseCode || item.diseaseCode || '-',
        primaryDxName: item.primaryDxName || item.resDiseaseName || item.diseaseName || '-',
        numberVisitDays: item.numberVisitDays || item.resTreatDays || item.treatDays || '1',
        medicalExpensesIPaid: item.medicalExpensesIPaid || item.resUserShareAmount || item.userShareAmount || '0',
        amtBenefited: item.amtBenefited || item.resPublicShareAmount || item.publicShareAmount || '0',
        totalMedicalExpenses: item.totalMedicalExpenses || item.resTotalAmount || item.totalAmount || '0'
    }));

    let orgs = data.personalCareInfoList || [];
    if (orgs.length === 0 && basicList.length > 0) {
        const orgMap = {};
        basicList.forEach(b => {
            const hName = b.medicalCenter;
            if (!orgMap[hName]) {
                orgMap[hName] = { medicalCenter: hName, daysHsptTrtm: 0, medicalExpensesIPaid: 0, amtBenefited: 0, totalMedicalExpenses: 0 };
            }
            orgMap[hName].daysHsptTrtm += Number(b.numberVisitDays || 1);
            orgMap[hName].medicalExpensesIPaid += Number(String(b.medicalExpensesIPaid).replace(/[^0-9]/g, '') || 0);
            orgMap[hName].amtBenefited += Number(String(b.amtBenefited).replace(/[^0-9]/g, '') || 0);
            orgMap[hName].totalMedicalExpenses += Number(String(b.totalMedicalExpenses).replace(/[^0-9]/g, '') || 0);
        });
        orgs = Object.values(orgMap);
    }

    const rawDetail = data.detailedMedicalTreatmentInfoList || data.resDetailTreatList || [];
    const detailList = rawDetail.map(item => ({
        treatmentStartDate: item.treatmentStartDate || item.resTreatStartDate || item.treatStartDate || '-',
        medicalCenter: item.medicalCenter || item.resHospitalName || item.hospitalName || '-',
        medicalDetails: item.medicalDetails || item.resTreatType || item.treatType || '처치/검사',
        codeName: item.codeName || item.resCodeName || item.resTreatName || item.treatName || '-',
        singleDose: item.singleDose || item.resOneDose || '1',
        singleDoseCount: item.singleDoseCount || item.resDailyDosesNumber || '1',
        totalDosingDays: item.totalDosingDays || item.resTotalDosingdays || '1'
    }));

    const rawDrug = data.prescriptionFormulationInfoList || data.resPrescribeDrugList || [];
    const drugList = rawDrug.map(item => ({
        treatmentStartDate: item.treatmentStartDate || item.resTreatStartDate || item.treatStartDate || '-',
        medicalCenter: item.medicalCenter || item.resHospitalName || item.hospitalName || '-',
        medicineName: item.medicineName || item.resDrugName || item.drugName || '-',
        componentName: item.componentName || item.resIngredients || item.ingredients || '-',
        singleDose: item.singleDose || item.resOneDose || '1',
        singleDoseCount: item.singleDoseCount || item.resDailyDosesNumber || '1',
        totalDosingDays: item.totalDosingDays || item.resTotalDosingdays || '1',
        efficacy: item.efficacy || item.resTreatType || item.treatType || '전문의 처방약'
    }));

    const numFmt = (n) => Number(String(n || 0).replace(/[^0-9]/g, '') || 0).toLocaleString('ko-KR') + '원';

    // 2. 의료기관별 요약 테이블 (#medOrgs tbody)
    const orgsTbody = document.querySelector('#medOrgs tbody');
    if (orgsTbody) {
        if (orgs.length === 0) {
            orgsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:36px; color:#94a3b8;">조회된 의료기관 내역이 없습니다.</td></tr>';
        } else {
            orgsTbody.innerHTML = orgs.map(item => `
                <tr>
                    <td style="font-weight:600;">${item.medicalCenter || '-'}</td>
                    <td style="text-align:center;">${item.daysHsptTrtm || '1'}회</td>
                    <td style="text-align:right; color:#2563eb; font-weight:600;">${numFmt(item.medicalExpensesIPaid)}</td>
                    <td style="text-align:right; color:#64748b;">${numFmt(item.amtBenefited)}</td>
                    <td style="text-align:right; font-weight:700;">${numFmt(item.totalMedicalExpenses)}</td>
                </tr>
            `).join('');
        }
    }

    // 3. 기본 진료내역 테이블 (#medBasic tbody)
    const basicTbody = document.querySelector('#medBasic tbody');
    if (basicTbody) {
        if (basicList.length === 0) {
            basicTbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:36px; color:#94a3b8;">조회된 병의원 및 약국 진료내역이 없습니다.</td></tr>';
        } else {
            basicTbody.innerHTML = basicList.map(item => `
                <tr>
                    <td>${item.treatmentStartDate || '-'}</td>
                    <td style="font-weight:600;">${item.medicalCenter || '-'}</td>
                    <td>${item.diagDept || '-'}</td>
                    <td><span class="point-tag tag-pass">${item.primaryDxCode || '-'}</span></td>
                    <td style="font-weight:600;">${item.primaryDxName || '-'}</td>
                    <td style="text-align:center;">${item.numberVisitDays || '1'}일</td>
                    <td style="text-align:right; color:#2563eb;">${numFmt(item.medicalExpensesIPaid)}</td>
                    <td style="text-align:right; color:#64748b;">${numFmt(item.amtBenefited)}</td>
                    <td style="text-align:right; font-weight:700;">${numFmt(item.totalMedicalExpenses)}</td>
                </tr>
            `).join('');
        }
    }

    // 4. 세부 처치·수술·검사 테이블 (#medDetail tbody)
    const detailTbody = document.querySelector('#medDetail tbody');
    if (detailTbody) {
        if (detailList.length === 0) {
            detailTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:36px; color:#94a3b8;">조회된 세부 처치·수술·검사 내역이 없습니다.</td></tr>';
        } else {
            detailTbody.innerHTML = detailList.map(item => `
                <tr>
                    <td>${item.treatmentStartDate || '-'}</td>
                    <td style="font-weight:600;">${item.medicalCenter || '-'}</td>
                    <td><span class="point-tag tag-pass">${item.medicalDetails || '검사'}</span></td>
                    <td style="font-weight:600;">${item.codeName || '-'}</td>
                    <td style="text-align:center;">${item.singleDose || '1'}</td>
                    <td style="text-align:center;">${item.singleDoseCount || '1'}</td>
                    <td style="text-align:center;">${item.totalDosingDays || '1'}일</td>
                </tr>
            `).join('');
        }
    }

    // 5. 처방·조제 의약품 테이블 (#drugTable tbody)
    const drugTbody = document.querySelector('#drugTable tbody');
    if (drugTbody) {
        if (drugList.length === 0) {
            drugTbody.innerHTML = '<tr id="drugNoWarnRow"><td colspan="8" class="clean-pass-td" style="text-align:center; padding:36px; color:#94a3b8;">조회된 처방·투약 내역이 없습니다. (0건 · 고지 불필요 통과)</td></tr>';
        } else {
            drugTbody.innerHTML = drugList.map(item => {
                const days = Number(item.totalDosingDays || 0);
                const isWarn = days >= 30;
                const resultTag = isWarn
                    ? '<span class="point-tag tag-warn">30일 고지대상</span>'
                    : '<span class="point-tag tag-pass">통과</span>';
                const usage = item.singleDose ? `${item.singleDose}정 1일 ${item.singleDoseCount || 1}회` : '용법준수';
                return `
                    <tr class="${isWarn ? 'row-check-needed' : ''}">
                        <td>${item.treatmentStartDate || '-'}</td>
                        <td style="font-weight:600;">${item.medicalCenter || '-'}</td>
                        <td style="font-weight:600;">${item.medicineName || '-'}</td>
                        <td style="color:#64748b;">${item.componentName || '-'}</td>
                        <td style="text-align:center;">${usage}</td>
                        <td style="text-align:center; font-weight:700; ${isWarn ? 'color:#dc2626;' : ''}">${days}일</td>
                        <td>${item.efficacy || '전문의 처방약'}</td>
                        <td style="text-align:center;">${resultTag}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    // 6. 상단 탭 뱃지 및 메트릭 카드 갱신
    const tabBtns = document.querySelectorAll('.sgez-tab-btn');
    if (tabBtns && tabBtns.length >= 6) {
        const badgeMed = tabBtns[4]?.querySelector('.tab-mini-badge');
        if (badgeMed) badgeMed.innerText = `${basicList.length}건`;
        const badgeDrug = tabBtns[5]?.querySelector('.tab-mini-badge');
        if (badgeDrug) badgeDrug.innerText = `${drugList.length}종`;
    }

    const medMetric = document.getElementById('medResMetricNum');
    if (medMetric) medMetric.innerText = `총 ${basicList.length}건 방문`;
    const medDesc = document.getElementById('medResDesc');
    if (medDesc) medDesc.innerHTML = `최근 5년 동안 <b>총 ${basicList.length}건의 병의원 및 약국 방문 내역</b>이 조회되었습니다.`;

    const drugTitle = document.getElementById('drugResTitle');
    if (drugTitle) drugTitle.innerText = `처방·조제 의약품 전수 목록 (${drugList.length}종)`;
    const drugMetric = document.getElementById('drugResMetricNum');
    if (drugMetric) drugMetric.innerText = `${drugList.length}종 처방`;
    const drugDesc = document.getElementById('drugResDesc');
    if (drugDesc) drugDesc.innerHTML = `최근 5년 동안 <b>총 ${drugList.length}종의 의약품 처방 내역</b>이 수집되었습니다.`;

    // 7. 치아보험(TAB 4) 실시간 정밀 고지 판정 및 상세 테이블 동기화
    const perioItems = [];
    const cavityItems = [];
    const dentureItems = [];

    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());

    // 1) 세부 처치·수술·검사 목록에서 치주수술/발치 및 치아 관련 정밀 탐색
    detailList.forEach(d => {
        const rawDate = String(d.treatmentStartDate || '').replace(/[^0-9]/g, '');
        let dDate = now;
        if (rawDate.length === 8) {
            dDate = new Date(`${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`);
        }
        const cName = d.codeName || '';
        const mDetail = d.medicalDetails || '';
        const combo = (cName + ' ' + mDetail).toLowerCase();

        // 단순 치료후처치(소독, 세척 등)는 제외
        if (combo.includes('후처치') || combo.includes('치료후처치')) return;

        // [치주수술] 치주소파술, 치은박리, 구강내소염수술, 치은절제, 골이식 등
        const isPerioSurg = combo.includes('치주소파술') || combo.includes('치은박리') || combo.includes('구강내소염수술') || combo.includes('치은절제') || (combo.includes('치주') && combo.includes('수술'));
        // [발치] 치주질환으로 인한 발치
        const isPerioExt = combo.includes('발치') && (combo.includes('치주') || combo.includes('치은'));

        if (dDate >= fiveYearsAgo && (isPerioSurg || isPerioExt)) {
            const matchedBasic = basicList.find(b => {
                const bDate = String(b.treatmentStartDate || '').replace(/[^0-9]/g, '');
                return bDate === rawDate && (b.medicalCenter === d.medicalCenter || !d.medicalCenter);
            });
            const dxCode = matchedBasic ? String(matchedBasic.primaryDxCode || '').replace(/^A/, '') : 'K05';
            const dxName = matchedBasic ? String(matchedBasic.primaryDxName || '').replace(/^\(양방\)/, '') : '치주질환';

            if (!perioItems.some(p => p.treatmentStartDate === d.treatmentStartDate && p.procName === cName)) {
                perioItems.push({
                    treatmentStartDate: d.treatmentStartDate,
                    primaryDxCode: dxCode,
                    primaryDxName: dxName,
                    procName: cName,
                    medicalCenter: d.medicalCenter,
                    diagDept: matchedBasic ? matchedBasic.diagDept : '치과',
                    isSurgery: isPerioSurg,
                    isExtraction: isPerioExt
                });
            }
        }
    });

    // 2) 기본 진료내역에서 틀니, 충치 및 미반영 치주질환 수술 탐색
    basicList.forEach(b => {
        const rawDate = String(b.treatmentStartDate || '').replace(/[^0-9]/g, '');
        let bDate = now;
        if (rawDate.length === 8) {
            bDate = new Date(`${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`);
        }
        const dxCode = String(b.primaryDxCode || '').toUpperCase().replace(/^A/, '');
        const dxName = b.primaryDxName || '';

        // [틀니 점검] 현재 틀니 착용 여부
        if (dxName.includes('틀니') || dxName.includes('의치')) {
            if (!dentureItems.some(item => item.treatmentStartDate === b.treatmentStartDate && item.medicalCenter === b.medicalCenter)) {
                dentureItems.push({
                    treatmentStartDate: b.treatmentStartDate,
                    primaryDxCode: dxCode,
                    primaryDxName: dxName,
                    procName: '틀니(의치) 제작 및 치료',
                    medicalCenter: b.medicalCenter,
                    diagDept: b.diagDept || '치과'
                });
            }
        }

        // [충치 점검] 최근 1년 K02 치아우식증
        if (bDate >= oneYearAgo && (dxCode.startsWith('K02') || dxName.includes('치아우식') || dxName.includes('충치'))) {
            if (!cavityItems.some(item => item.treatmentStartDate === b.treatmentStartDate && item.medicalCenter === b.medicalCenter)) {
                cavityItems.push({
                    treatmentStartDate: b.treatmentStartDate,
                    primaryDxCode: dxCode,
                    primaryDxName: dxName,
                    procName: '충치(치아우식증) 치료',
                    medicalCenter: b.medicalCenter,
                    diagDept: b.diagDept || '치과'
                });
            }
        }
    });

    // 정렬 (최신 진료일 순)
    perioItems.sort((a, b) => String(b.treatmentStartDate).localeCompare(String(a.treatmentStartDate)));
    cavityItems.sort((a, b) => String(b.treatmentStartDate).localeCompare(String(a.treatmentStartDate)));
    dentureItems.sort((a, b) => String(b.treatmentStartDate).localeCompare(String(a.treatmentStartDate)));

    const totalDenWarn = perioItems.length + cavityItems.length + dentureItems.length;

    // A. 상단 메인 네비게이션 치아 탭 뱃지 동기화
    const tabBadgeDen = document.getElementById('tabBadgeDental');
    if (tabBadgeDen) {
        if (totalDenWarn > 0) {
            tabBadgeDen.className = 'tab-mini-badge b-warn';
            tabBadgeDen.innerText = '고지필요';
        } else {
            tabBadgeDen.className = 'tab-mini-badge b-blue';
            tabBadgeDen.innerText = '통과';
        }
    }

    // B. 종합 요약 브리핑(TAB 1) 내 치아보험 카드 동기화
    const sumTileDen = document.getElementById('sumTileDental');
    const sumTileDenTitle = document.getElementById('sumTileDenTitle');
    const sumTileDenSub = document.getElementById('sumTileDenSub');
    const sumFactDenture = document.getElementById('sumFactDenture');
    const sumFactCavity = document.getElementById('sumFactCavity');
    const sumFactPerio = document.getElementById('sumFactPerio');

    if (sumTileDen && sumTileDenTitle && sumTileDenSub) {
        if (totalDenWarn > 0) {
            sumTileDen.className = 'sum-tile-card c-red';
            sumTileDenTitle.innerText = '고지 필요';
            if (perioItems.length > 0) {
                sumTileDenSub.innerText = `최근 5년 치주수술 ${perioItems.length}건 고지대상`;
            } else if (cavityItems.length > 0) {
                sumTileDenSub.innerText = `최근 1년 충치치료 ${cavityItems.length}건 고지대상`;
            } else {
                sumTileDenSub.innerText = '틀니(의치) 착용 고지대상';
            }
        } else {
            sumTileDen.className = 'sum-tile-card c-blue';
            sumTileDenTitle.innerText = '가입 가능';
            sumTileDenSub.innerText = '3대 고지 전 항목 정상 통과';
        }
    }

    if (sumFactDenture) {
        sumFactDenture.innerHTML = dentureItems.length > 0
            ? `<span class="sum-fact-v v-notice">고지필요 (${dentureItems.length}건)</span>`
            : '해당없음 (0건)';
    }
    if (sumFactCavity) {
        sumFactCavity.innerHTML = cavityItems.length > 0
            ? `<span class="sum-fact-v v-notice">고지필요 (${cavityItems.length}건)</span>`
            : '해당없음 (0건)';
    }
    if (sumFactPerio) {
        sumFactPerio.innerHTML = perioItems.length > 0
            ? `<span class="sum-fact-v v-notice">고지필요 (${perioItems.length}건)</span>`
            : '해당없음 (0건)';
    }

    // C. 치아보험 탭(TAB 4) 상단 심사 결과 배지 동기화
    const denBadge = document.getElementById('denResBadge');
    if (denBadge) {
        if (perioItems.length > 0) {
            denBadge.className = 'point-tag tag-warn';
            denBadge.innerText = `치주수술 고지필요 (${perioItems.length}건)`;
        } else if (cavityItems.length > 0) {
            denBadge.className = 'point-tag tag-warn';
            denBadge.innerText = `충치 치료 고지필요 (${cavityItems.length}건)`;
        } else if (dentureItems.length > 0) {
            denBadge.className = 'point-tag tag-warn';
            denBadge.innerText = `틀니 착용 고지필요 (${dentureItems.length}건)`;
        } else {
            denBadge.className = 'point-tag tag-pass';
            denBadge.innerText = '3대 고지 전 항목 통과 (가입 가능)';
        }
    }

    // D. 치아보험 요약 리포트 카드 3종 뷰 (표 / 카드 / 바) 동기화
    // 1) 표 형태
    const tblResDenture = document.getElementById('denTblResDenture');
    const tblDescDenture = document.getElementById('denTblDescDenture');
    if (tblResDenture) {
        tblResDenture.className = `point-tag ${dentureItems.length > 0 ? 'tag-warn' : 'tag-pass'}`;
        tblResDenture.innerText = dentureItems.length > 0 ? '고지필요' : '해당없음';
    }
    if (tblDescDenture) {
        tblDescDenture.innerText = dentureItems.length > 0 ? `틀니 제작/착용 이력 ${dentureItems.length}건 확인` : '현재 틀니 제작 및 장착 사실 없음 (0건)';
    }

    const tblResCavity = document.getElementById('denTblResCavity');
    const tblDescCavity = document.getElementById('denTblDescCavity');
    if (tblResCavity) {
        tblResCavity.className = `point-tag ${cavityItems.length > 0 ? 'tag-warn' : 'tag-pass'}`;
        tblResCavity.innerText = cavityItems.length > 0 ? '고지필요' : '해당없음';
    }
    if (tblDescCavity) {
        tblDescCavity.innerText = cavityItems.length > 0 ? `최근 1년 충치 치료 ${cavityItems.length}건 확인` : '최근 1년 충치 치료 및 발치 소견 없음 (0건)';
    }

    const tblResPerio = document.getElementById('denTblResPerio');
    const tblDescPerio = document.getElementById('denTblDescPerio');
    if (tblResPerio) {
        tblResPerio.className = `point-tag ${perioItems.length > 0 ? 'tag-warn' : 'tag-pass'}`;
        tblResPerio.innerText = perioItems.length > 0 ? '고지필요' : '해당없음';
    }
    if (tblDescPerio) {
        tblDescPerio.innerText = perioItems.length > 0 ? `최근 5년 치주질환 수술(치주소파술 등) ${perioItems.length}건 확인` : '최근 5년 치주질환 수술 및 발치 소견 없음 (0건)';
    }

    // 2) 카드 형태
    const cardDenture = document.getElementById('denCardDenture');
    const cardResDenture = document.getElementById('denCardResDenture');
    const cardDescDenture = document.getElementById('denCardDescDenture');
    if (cardDenture) cardDenture.className = `v-card ${dentureItems.length > 0 ? 'warn' : 'pass'}`;
    if (cardResDenture) cardResDenture.innerText = dentureItems.length > 0 ? '고지필요' : '해당없음';
    if (cardDescDenture) cardDescDenture.innerText = dentureItems.length > 0 ? `틀니 착용 (${dentureItems.length}건)` : '틀니 착용 없음 (0건)';

    const cardCavity = document.getElementById('denCardCavity');
    const cardResCavity = document.getElementById('denCardResCavity');
    const cardDescCavity = document.getElementById('denCardDescCavity');
    if (cardCavity) cardCavity.className = `v-card ${cavityItems.length > 0 ? 'warn' : 'pass'}`;
    if (cardResCavity) cardResCavity.innerText = cavityItems.length > 0 ? '고지필요' : '해당없음';
    if (cardDescCavity) cardDescCavity.innerText = cavityItems.length > 0 ? `충치 치료 (${cavityItems.length}건)` : '충치 치료 없음 (0건)';

    const cardPerio = document.getElementById('denCardPerio');
    const cardResPerio = document.getElementById('denCardResPerio');
    const cardDescPerio = document.getElementById('denCardDescPerio');
    if (cardPerio) cardPerio.className = `v-card ${perioItems.length > 0 ? 'warn' : 'pass'}`;
    if (cardResPerio) cardResPerio.innerText = perioItems.length > 0 ? '고지필요' : '해당없음';
    if (cardDescPerio) cardDescPerio.innerText = perioItems.length > 0 ? `치주수술 이력 (${perioItems.length}건)` : '잇몸수술 이력 없음 (0건)';

    // 3) 바 형태
    const listResDenture = document.getElementById('denListResDenture');
    const listDescDenture = document.getElementById('denListDescDenture');
    if (listResDenture) {
        listResDenture.className = `point-tag ${dentureItems.length > 0 ? 'tag-warn' : 'tag-pass'}`;
        listResDenture.innerText = dentureItems.length > 0 ? '고지필요' : '해당없음';
    }
    if (listDescDenture) {
        listDescDenture.innerText = dentureItems.length > 0 ? `틀니(가철성 의치) 치료 및 장착 사실 ${dentureItems.length}건 확인` : '현재 틀니(가철성 의치) 장착 및 치료 사실 없음 (0건)';
    }

    const listResCavity = document.getElementById('denListResCavity');
    const listDescCavity = document.getElementById('denListDescCavity');
    if (listResCavity) {
        listResCavity.className = `point-tag ${cavityItems.length > 0 ? 'tag-warn' : 'tag-pass'}`;
        listResCavity.innerText = cavityItems.length > 0 ? '고지필요' : '해당없음';
    }
    if (listDescCavity) {
        listDescCavity.innerText = cavityItems.length > 0 ? `최근 1년 이내 충치 보철·충전 ${cavityItems.length}건 확인` : '최근 1년 이내 충치 보철·충전 및 발치 소견 없음 (0건)';
    }

    const listResPerio = document.getElementById('denListResPerio');
    const listDescPerio = document.getElementById('denListDescPerio');
    if (listResPerio) {
        listResPerio.className = `point-tag ${perioItems.length > 0 ? 'tag-warn' : 'tag-pass'}`;
        listResPerio.innerText = perioItems.length > 0 ? '고지필요' : '해당없음';
    }
    if (listDescPerio) {
        listDescPerio.innerText = perioItems.length > 0 ? `최근 5년 이내 치주질환 수술(치주소파술 등) ${perioItems.length}건 확인` : '최근 5년 이내 치주질환 수술 및 발치 소견 없음 (0건)';
    }

    // E. 확인 필요 고지 대상 섹션 (#denCheckTable) 동기화
    const denCheckBadge = document.getElementById('denCheckBadge');
    const denCheckDesc = document.getElementById('denCheckDesc');
    const denCheckTbody = document.getElementById('denCheckTbody');

    if (denCheckBadge) {
        if (totalDenWarn > 0) {
            denCheckBadge.className = 'point-tag tag-warn';
            denCheckBadge.innerText = `고지대상 ${totalDenWarn}건`;
        } else {
            denCheckBadge.className = 'point-tag tag-pass';
            denCheckBadge.innerText = '고지대상 없음 (0건)';
        }
    }

    if (denCheckDesc) {
        if (totalDenWarn > 0) {
            denCheckDesc.style.color = '#dc2626';
            denCheckDesc.innerText = '치아보험 3대 질문 중 고지 필요 내역이 확인되었습니다. 청약 시 고지가 필수입니다.';
        } else {
            denCheckDesc.style.color = '#059669';
            denCheckDesc.innerText = '치아보험 3대 질문 전 항목 통과 (가입 가능)';
        }
    }

    if (denCheckTbody) {
        if (totalDenWarn === 0) {
            denCheckTbody.innerHTML = '<tr><td colspan="6" class="clean-pass-td" style="text-align:center; padding:32px; color:#1d4ed8;">치아보험 확인 필요 고지 항목이 없습니다. (3대 질문 전 항목 정상 통과)</td></tr>';
        } else {
            const checkRows = [];
            dentureItems.forEach(item => {
                checkRows.push(`
                    <tr class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td><span class="period-tag tag-p3m">틀니</span> <b>1. 틀니 (의치)</b></td>
                        <td><b>${item.medicalCenter}</b><br><span style="font-size:11.5px; color:#64748b;">${item.primaryDxCode} (${item.primaryDxName})</span></td>
                        <td style="font-weight:600; color:#991b1b;">
                            <b>${item.procName}</b> 내역 확인<br>
                            <span style="font-size:11px; color:#64748b; font-weight:normal;">현재 틀니(가철성 의치) 착용 여부 질문에 해당하므로 청약 시 법정 고지 필수</span>
                        </td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                        <td style="text-align:center;"><button type="button" class="btn-tbl-action" onclick="filterDental('denture')">상세보기 →</button></td>
                    </tr>
                `);
            });
            cavityItems.forEach(item => {
                checkRows.push(`
                    <tr class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td><span class="period-tag tag-p1y">1년</span> <b>2. 충치 (치아우식증)</b></td>
                        <td><b>${item.medicalCenter}</b><br><span style="font-size:11.5px; color:#64748b;">${item.primaryDxCode} (${item.primaryDxName})</span></td>
                        <td style="font-weight:600; color:#991b1b;">
                            <b>${item.procName}</b> 치료 내역 확인<br>
                            <span style="font-size:11px; color:#64748b; font-weight:normal;">최근 1년 이내 충치로 인한 치료·투약 사실에 해당하므로 청약 시 법정 고지 필수</span>
                        </td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                        <td style="text-align:center;"><button type="button" class="btn-tbl-action" onclick="filterDental('cavity')">상세보기 →</button></td>
                    </tr>
                `);
            });
            perioItems.forEach(item => {
                checkRows.push(`
                    <tr class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td><span class="period-tag tag-p5y">5년</span> <b>3. 치주수술, 발치</b></td>
                        <td><b>${item.medicalCenter}</b><br><span style="font-size:11.5px; color:#64748b;">${item.primaryDxCode} (${item.primaryDxName})</span></td>
                        <td style="font-weight:600; color:#991b1b;">
                            <b>${item.procName}</b> 시행 확인<br>
                            <span style="font-size:11px; color:#64748b; font-weight:normal;">최근 5년 이내 치주질환으로 인한 치주수술(치주소파술 등)에 해당하므로 청약 시 법정 고지 필수</span>
                        </td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                        <td style="text-align:center;"><button type="button" class="btn-tbl-action" onclick="filterDental('perio')">상세보기 →</button></td>
                    </tr>
                `);
            });
            denCheckTbody.innerHTML = checkRows.join('');
        }
    }

    // F. 치아보험 상세 점검표 (#denTable tbody) 동기화
    const denTableTbody = document.getElementById('denTableTbody');
    if (denTableTbody) {
        let denHtml = '';

        // [분류 1] 1번 질문: 틀니
        denHtml += `
            <tr class="group-header-row" data-period-group="denture">
                <td colspan="6">
                    <span class="period-tag tag-p3m">1. 현재 틀니(의치)를 하고 있는지 여부</span>
                    점검 내용: 가철성 의치(틀니) 치료 및 장착 여부
                </td>
            </tr>
        `;
        if (dentureItems.length === 0) {
            denHtml += `
                <tr data-cat="denture">
                    <td colspan="6" class="clean-pass-td">
                        현재 틀니(의치) 제작 및 착용 사실이 전혀 없습니다. (0건 · 1번 질문 정상 통과)
                    </td>
                </tr>
            `;
        } else {
            dentureItems.forEach(item => {
                denHtml += `
                    <tr data-cat="denture" class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td style="font-weight:600;">${item.primaryDxCode} (${item.primaryDxName})</td>
                        <td><span class="point-tag tag-warn">틀니(의치)</span> <b>${item.procName}</b></td>
                        <td style="text-align:center;">1일</td>
                        <td><b>${item.medicalCenter}</b> (${item.diagDept || '치과'})</td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                    </tr>
                `;
            });
        }

        // [분류 2] 2번 질문: 충치 (1년)
        denHtml += `
            <tr class="group-header-row" data-period-group="cavity">
                <td colspan="6">
                    <span class="period-tag tag-p1y">2. 최근 1년 이내 충치(치아우식증) 치료 여부</span>
                    분석 기준일: 최근 1년
                </td>
            </tr>
        `;
        if (cavityItems.length === 0) {
            denHtml += `
                <tr data-cat="cavity">
                    <td colspan="6" class="clean-pass-td">
                        최근 1년 이내 충치(치아우식증) 치료 및 발치 소견 내역이 없습니다. (0건 · 정상 통과)
                    </td>
                </tr>
            `;
        } else {
            cavityItems.forEach(item => {
                denHtml += `
                    <tr data-cat="cavity" class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td style="font-weight:600;">${item.primaryDxCode} (${item.primaryDxName})</td>
                        <td><span class="point-tag tag-warn">충치치료</span> <b>${item.procName}</b></td>
                        <td style="text-align:center;">1일</td>
                        <td><b>${item.medicalCenter}</b> (${item.diagDept || '치과'})</td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                    </tr>
                `;
            });
        }

        // [분류 3] 3번 질문: 치주수술, 발치 (5년)
        denHtml += `
            <tr class="group-header-row" data-period-group="perio">
                <td colspan="6">
                    <span class="period-tag tag-p5y">3. 최근 5년 이내 치주질환으로 치주수술 또는 발치 여부</span>
                    분석 기준일: 최근 5년 (${perioItems.length > 0 ? `치주수술 ${perioItems.length}건 확인` : '조회된 내역 없음'})
                </td>
            </tr>
        `;
        if (perioItems.length === 0) {
            denHtml += `
                <tr data-cat="perio">
                    <td colspan="6" class="clean-pass-td">
                        최근 5년 이내 치주질환(잇몸질환)으로 인한 수술 및 발치 사실이 없습니다. (0건 · 정상 통과)
                    </td>
                </tr>
            `;
        } else {
            perioItems.forEach(item => {
                const badgeLabel = item.isSurgery ? '치주수술' : '발치';
                denHtml += `
                    <tr data-cat="perio" class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td style="font-weight:600;">${item.primaryDxCode} (${item.primaryDxName})</td>
                        <td><span class="point-tag tag-warn">${badgeLabel}</span> <b>${item.procName}</b></td>
                        <td style="text-align:center;">1일</td>
                        <td><b>${item.medicalCenter}</b> (${item.diagDept || '치과'})</td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                    </tr>
                `;
            });
        }

        denTableTbody.innerHTML = denHtml;
    }

    // 8. 건강체(표준체) 및 유병자(간편심사) 실시간 룰 엔진 평가 및 화면 동기화
    const { stdEval, simEval } = evaluateUnderwriting(basicList, detailList, drugList);
    window._currentStdEval = stdEval;
    window._currentSimEval = simEval;
    renderStandardAndSimple(stdEval, simEval, basicList, detailList, drugList);
}

function evaluateUnderwriting(basicList, detailList, drugList) {
    const now = new Date();
    const date3m = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    const date1y = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const date2y = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
    const date5y = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());

    const parseDate = (s) => {
        const c = String(s || '').replace(/[^0-9]/g, '');
        if (c.length === 8) return new Date(`${c.substring(0, 4)}-${c.substring(4, 6)}-${c.substring(6, 8)}`);
        return null;
    };

    // 치과 진료 및 처치 여부 판정 (일반 건강체/유병자 인보험 인수 무관 예외 질환 - 치아보험에서만 전담 심사)
    const isDentalRecord = (item) => {
        const dept = (item.diagDept || item.resTreatDept || '').toUpperCase();
        const center = (item.medicalCenter || item.resHospitalName || '').toUpperCase();
        const code = String(item.primaryDxCode || item.resDiseaseCode || '').toUpperCase().replace(/^A/, '');
        const cName = (item.codeName || item.resTreatName || item.primaryDxName || item.resDiseaseName || '').toUpperCase();
        const mDetail = (item.medicalDetails || item.resTreatType || '').toUpperCase();
        
        if (dept.includes('치과') || center.includes('치과')) return true;
        if (/^K0[0-8]/.test(code)) return true;
        const dentalKeywords = ['치아', '치주', '치은', '발치', '근관', '신경치료', '레진', '인레이', '크라운', '임플란트', '치석제거', '스케일링', '발수', '우식', '틀니', '의치', '치조'];
        if (dentalKeywords.some(kw => cName.includes(kw) || mDetail.includes(kw))) return true;
        return false;
    };

    // 1. 건강체 3개월 진료 (치과 단순 진료는 일반 건강보험 고지 제외 대상이므로 분리)
    const items3m = basicList.filter(b => {
        const d = parseDate(b.treatmentStartDate);
        if (!d || d < date3m) return false;
        return !isDentalRecord(b);
    });

    // 2. 건강체 1년 재검사/추가검사 소견 (치과 진료 제외 및 영문 단어 내 CT 오탐 방지)
    const retestPatterns = [
        /조직검사/,
        /생검/,
        /세침흡인/,
        /(^|[^a-zA-Z])CT([^a-zA-Z]|$)/i,
        /전산화단층/,
        /(^|[^a-zA-Z])MRI([^a-zA-Z]|$)/i,
        /자기공명/,
        /(^|[^a-zA-Z])MRA([^a-zA-Z]|$)/i,
        /정밀검사/,
        /추가검사/,
        /재검사/,
        /초음파/
    ];
    const items1y = detailList.filter(d => {
        const dt = parseDate(d.treatmentStartDate);
        if (!dt || dt < date1y) return false;
        if (isDentalRecord(d)) return false;
        const combo = (d.codeName + ' ' + d.medicalDetails);
        return retestPatterns.some(p => p.test(combo));
    });

    // 3. 최근 5년 입원 (치과 제외)
    const hospItems5y = basicList.filter(b => {
        const dt = parseDate(b.treatmentStartDate);
        if (!dt || dt < date5y) return false;
        if (isDentalRecord(b)) return false;
        return (b.diagDept || '').includes('입원');
    });

    // 4. 최근 5년 수술 (치과 치료·발치·치주수술은 일반 인보험 수술 제외이므로 분리)
    const nonSurg = ['세척', '발수', '치석제거', '후처치', '관리료', '진찰료', '마취', '영상', '방사선', '단순처치'];
    const surgItems5y = detailList.filter(d => {
        const dt = parseDate(d.treatmentStartDate);
        if (!dt || dt < date5y) return false;
        if (isDentalRecord(d)) return false;
        const cName = d.codeName || '';
        if (nonSurg.some(kw => cName.includes(kw))) return false;
        return cName.includes('수술') || cName.includes('절제') || cName.includes('봉합');
    });

    // 5. 최근 5년 7일 이상 지속치료 (동일 질환 통원 7일 이상 - 치과 제외)
    const diseaseVisits = {};
    basicList.forEach(b => {
        const dt = parseDate(b.treatmentStartDate);
        if (!dt || dt < date5y) return;
        if (isDentalRecord(b)) return;
        const codePrefix = String(b.primaryDxCode || '').toUpperCase().replace(/^A/, '').substring(0, 3);
        const key = codePrefix || b.primaryDxName || '기타';
        if (!diseaseVisits[key]) {
            diseaseVisits[key] = {
                key,
                code: b.primaryDxCode,
                name: b.primaryDxName,
                count: 0,
                hospital: b.medicalCenter,
                lastDate: b.treatmentStartDate
            };
        }
        diseaseVisits[key].count += Number(b.numberVisitDays || 1);
    });
    const treat7dItems = Object.values(diseaseVisits).filter(v => v.count >= 7);

    // 6. 최근 5년 30일 이상 계속투약 (동일 성분/약품 처방일수 합산 - 치과 및 중복제거)
    const dedupDrugMap = {};
    drugList.forEach(dr => {
        const dt = parseDate(dr.treatmentStartDate);
        if (!dt || dt < date5y) return;
        if (isDentalRecord(dr)) return;
        const dedupKey = `${dr.treatmentStartDate}_${dr.medicineName || dr.componentName}`;
        if (!dedupDrugMap[dedupKey] || dedupDrugMap[dedupKey].totalDosingDays < Number(dr.totalDosingDays || 1)) {
            dedupDrugMap[dedupKey] = {
                treatmentStartDate: dr.treatmentStartDate,
                medicalCenter: dr.medicalCenter,
                medicineName: dr.medicineName,
                componentName: dr.componentName,
                totalDosingDays: Number(dr.totalDosingDays || 1)
            };
        }
    });

    const drugAccum = {};
    Object.values(dedupDrugMap).forEach(dr => {
        const key = dr.medicineName || dr.componentName;
        if (!drugAccum[key]) {
            drugAccum[key] = {
                name: key,
                totalDays: 0,
                hospital: dr.medicalCenter,
                lastDate: dr.treatmentStartDate
            };
        }
        drugAccum[key].totalDays += dr.totalDosingDays;
    });
    const drug30dItems = Object.values(drugAccum).filter(d => d.totalDays >= 30);

    // 7. 최근 5년 11대 중대질병
    const critical11 = [
        { id: 'cancer', name: '암/악성신생물', regex: /^[CD]([0-9]{2})/ },
        { id: 'leukemia', name: '백혈병', regex: /^C9[1-5]/ },
        { id: 'htn', name: '고혈압', regex: /^I1[0-5]/ },
        { id: 'angina', name: '협심증', regex: /^I20/ },
        { id: 'ami', name: '심근경색', regex: /^I2[1-3]/ },
        { id: 'valve', name: '심장판막증', regex: /^(I0[5-8]|I3[4-7])/ },
        { id: 'cirrhosis', name: '간경화증', regex: /^K74/ },
        { id: 'stroke', name: '뇌졸중', regex: /^I6[0-4]/ },
        { id: 'diabetes', name: '당뇨병', regex: /^E1[0-4]/ },
        { id: 'aids', name: '에이즈/HIV', regex: /^B2[0-4]/ },
        { id: 'rectal', name: '직장/항문질환', regex: /^K6[0-2]/ }
    ];
    const dis11Items = [];
    basicList.forEach(b => {
        const dt = parseDate(b.treatmentStartDate);
        if (!dt || dt < date5y) return;
        const code = String(b.primaryDxCode || '').toUpperCase().replace(/^A/, '');
        const matched = critical11.find(c => c.regex.test(code));
        if (matched) {
            dis11Items.push({
                treatmentStartDate: b.treatmentStartDate,
                diseaseId: matched.id,
                diseaseCategory: matched.name,
                primaryDxCode: b.primaryDxCode,
                primaryDxName: b.primaryDxName,
                medicalCenter: b.medicalCenter
            });
        }
    });

    const stdPass = (
        items3m.length === 0 &&
        items1y.length === 0 &&
        hospItems5y.length === 0 &&
        surgItems5y.length === 0 &&
        treat7dItems.length === 0 &&
        drug30dItems.length === 0 &&
        dis11Items.length === 0
    );

    const stdEval = {
        pass: stdPass,
        items3m,
        items1y,
        hospItems5y,
        surgItems5y,
        treat7dItems,
        drug30dItems,
        dis11Items
    };

    // ==========================================
    // 유병자 (간편심사 3.5.5 / 3.2.5)
    // ==========================================
    const hosp3m = hospItems5y.filter(h => parseDate(h.treatmentStartDate) >= date3m);
    const surg3m = surgItems5y.filter(s => parseDate(s.treatmentStartDate) >= date3m);
    const findings3m = hosp3m.length + surg3m.length + items1y.filter(r => parseDate(r.treatmentStartDate) >= date3m).length;

    const hospSurg5y = hospItems5y.length + surgItems5y.length;

    const hosp2y = hospItems5y.filter(h => parseDate(h.treatmentStartDate) >= date2y);
    const surg2y = surgItems5y.filter(s => parseDate(s.treatmentStartDate) >= date2y);
    const hospSurg2y = hosp2y.length + surg2y.length;

    const dis6Items = dis11Items.filter(d => ['cancer', 'stroke', 'angina', 'ami', 'valve', 'cirrhosis'].includes(d.diseaseId));

    const sim355Pass = (findings3m === 0 && hospSurg5y === 0 && dis6Items.length === 0);
    const sim325Pass = (findings3m === 0 && hospSurg2y === 0 && dis6Items.length === 0);

    let simGrade = '3.5.5';
    let simDesc = '간편고지 전 항목 통과 (최저가 3.5.5 초경증 가입가능)';
    let simPass = false;

    if (sim355Pass) {
        simGrade = '3.5.5';
        simDesc = '간편고지 전 항목 통과 (최저가 3.5.5 초경증 가입가능)';
        simPass = true;
    } else if (sim325Pass) {
        simGrade = '3.2.5';
        simDesc = '최근 2년 입원·수술 기준 충족 (3.2.5 간편심사 플랜 가입가능)';
        simPass = true;
    } else {
        simGrade = '심사필요';
        simDesc = '최근 3개월 소견, 2년 입원수술, 5년 6대질병 중 확인 필요 항목이 있습니다.';
        simPass = false;
    }

    const simEval = {
        pass: simPass,
        grade: simGrade,
        desc: simDesc,
        findings3m,
        hospSurg5y,
        hospSurg2y,
        dis6Items,
        hospItems5y,
        surgItems5y,
        hosp3m,
        surg3m
    };

    return { stdEval, simEval };
}

function renderStandardAndSimple(stdEval, simEval, basicList, detailList, drugList) {
    // 1. 상단 메인 네비게이션 탭 뱃지 동기화
    const tabBadgeStd = document.getElementById('tabBadgeStandard');
    if (tabBadgeStd) {
        tabBadgeStd.className = `tab-mini-badge ${stdEval.pass ? 'b-blue' : 'b-warn'}`;
        tabBadgeStd.innerText = stdEval.pass ? '가능' : '고지필요';
    }

    const tabBadgeSim = document.getElementById('tabBadgeSimple');
    if (tabBadgeSim) {
        if (simEval.grade === '3.5.5') {
            tabBadgeSim.className = 'tab-mini-badge b-blue';
            tabBadgeSim.innerText = '3.5.5';
        } else if (simEval.grade === '3.2.5') {
            tabBadgeSim.className = 'tab-mini-badge b-green';
            tabBadgeSim.innerText = '3.2.5';
        } else {
            tabBadgeSim.className = 'tab-mini-badge b-warn';
            tabBadgeSim.innerText = '심사필요';
        }
    }

    // 2. Tab 1 종합 요약 브리핑 타일 동기화
    // 2-1. 건강체(표준체) 타일
    const sumTileStd = document.getElementById('sumTileStandard');
    const sumTileStdTitle = document.getElementById('sumTileStdTitle');
    const sumTileStdSub = document.getElementById('sumTileStdSub');
    const sumFactStd3m = document.getElementById('sumFactStd3m');
    const sumFactStdHospSurg = document.getElementById('sumFactStdHospSurg');
    const sumFactStdDrug = document.getElementById('sumFactStdDrug');

    const totalStdHospSurg = stdEval.hospItems5y.length + stdEval.surgItems5y.length;
    if (sumTileStd && sumTileStdTitle && sumTileStdSub) {
        if (stdEval.pass) {
            sumTileStd.className = 'sum-tile-card c-blue';
            sumTileStdTitle.innerText = '가입가능';
            sumTileStdSub.innerText = '고지의무 0건 통과 · 표준체 무할증';
        } else {
            sumTileStd.className = 'sum-tile-card c-red';
            sumTileStdTitle.innerText = '고지 필요';
            if (stdEval.items3m.length > 0) {
                sumTileStdSub.innerText = `최근 3개월 진료 ${stdEval.items3m.length}건 확인`;
            } else if (totalStdHospSurg > 0) {
                sumTileStdSub.innerText = `최근 5년 입원/수술 ${totalStdHospSurg}건 확인`;
            } else if (stdEval.drug30dItems.length > 0) {
                sumTileStdSub.innerText = `30일 이상 계속투약 ${stdEval.drug30dItems.length}건 확인`;
            } else if (stdEval.dis11Items.length > 0) {
                sumTileStdSub.innerText = `11대 중대질병 ${stdEval.dis11Items[0].diseaseCategory} 확인`;
            } else {
                sumTileStdSub.innerText = '건강체 고지 대상 항목 확인필요';
            }
        }
    }
    if (sumFactStd3m) {
        sumFactStd3m.innerHTML = stdEval.items3m.length > 0
            ? `<span class="sum-fact-v v-notice">${stdEval.items3m.length}건 방문</span>`
            : '0건 (진료 없음)';
    }
    if (sumFactStdHospSurg) {
        sumFactStdHospSurg.innerHTML = totalStdHospSurg > 0
            ? `<span class="sum-fact-v v-notice">입원 ${stdEval.hospItems5y.length}건 · 수술 ${stdEval.surgItems5y.length}건</span>`
            : '0건 (해당 없음)';
    }
    if (sumFactStdDrug) {
        sumFactStdDrug.innerHTML = stdEval.drug30dItems.length > 0
            ? `<span class="sum-fact-v v-notice">${stdEval.drug30dItems.length}건 (30일 이상)</span>`
            : '0건 (30일 이상 없음)';
    }

    // 2-2. 유병자(간편심사) 타일
    const sumTileSim = document.getElementById('sumTileSimple');
    const sumTileSimTitle = document.getElementById('sumTileSimTitle');
    const sumTileSimSub = document.getElementById('sumTileSimSub');
    const sumFactSim3m = document.getElementById('sumFactSim3m');
    const sumFactSimHospSurg = document.getElementById('sumFactSimHospSurg');
    const sumFactSim6Dis = document.getElementById('sumFactSim6Dis');

    if (sumTileSim && sumTileSimTitle && sumTileSimSub) {
        if (simEval.grade === '3.5.5') {
            sumTileSim.className = 'sum-tile-card c-blue';
            sumTileSimTitle.innerText = '3.5.5 가입가능';
            sumTileSimSub.innerText = '간편고지 전 항목 통과 · 최저가 플랜';
        } else if (simEval.grade === '3.2.5') {
            sumTileSim.className = 'sum-tile-card c-green';
            sumTileSimTitle.innerText = '3.2.5 가입가능';
            sumTileSimSub.innerText = '최근 2년 입원·수술 기준 충족';
        } else {
            sumTileSim.className = 'sum-tile-card c-red';
            sumTileSimTitle.innerText = '고지 필요';
            if (simEval.findings3m > 0) {
                sumTileSimSub.innerText = `최근 3개월 소견 ${simEval.findings3m}건 확인`;
            } else if (simEval.hospSurg2y > 0) {
                sumTileSimSub.innerText = `최근 2년 입원/수술 ${simEval.hospSurg2y}건 확인`;
            } else if (simEval.dis6Items.length > 0) {
                sumTileSimSub.innerText = `6대 중대질병 ${simEval.dis6Items[0].diseaseCategory} 확인`;
            } else {
                sumTileSimSub.innerText = '간편심사 항목 확인필요';
            }
        }
    }
    if (sumFactSim3m) {
        sumFactSim3m.innerHTML = simEval.findings3m > 0
            ? `<span class="sum-fact-v v-notice">소견 ${simEval.findings3m}건 확인</span>`
            : '소견 없음 (통과)';
    }
    if (sumFactSimHospSurg) {
        sumFactSimHospSurg.innerHTML = simEval.hospSurg5y > 0
            ? `<span class="sum-fact-v v-notice">입원 ${simEval.hospItems5y.length}건 · 수술 ${simEval.surgItems5y.length}건</span>`
            : '입원 0일 · 수술 0건';
    }
    if (sumFactSim6Dis) {
        sumFactSim6Dis.innerHTML = simEval.dis6Items.length > 0
            ? `<span class="sum-fact-v v-notice">진단 ${simEval.dis6Items.length}건 확인</span>`
            : '0건 (진단 없음)';
    }

    // 2-3. 모든 투약내역 타일
    const sumTileDrug = document.getElementById('sumTileDrug');
    const sumTileDrugTitle = document.getElementById('sumTileDrugTitle');
    const sumTileDrugSub = document.getElementById('sumTileDrugSub');
    const sumFactDrugTotal = document.getElementById('sumFactDrugTotal');
    const sumFactDrugMaxDays = document.getElementById('sumFactDrugMaxDays');
    const sumFactDrugOver30 = document.getElementById('sumFactDrugOver30');

    const maxDrugDays = drugList.reduce((m, d) => Math.max(m, Number(d.totalDosingDays || 0)), 0);
    if (sumTileDrug && sumTileDrugTitle && sumTileDrugSub) {
        if (stdEval.drug30dItems.length > 0) {
            sumTileDrug.className = 'sum-tile-card c-red';
            sumTileDrugTitle.innerText = '고지 필요';
            sumTileDrugSub.innerText = `30일 이상 계속투약 ${stdEval.drug30dItems.length}건 확인`;
        } else {
            sumTileDrug.className = 'sum-tile-card c-blue';
            sumTileDrugTitle.innerText = '고지 불필요';
            sumTileDrugSub.innerText = '30일 이상 계속 투약 0건';
        }
    }
    if (sumFactDrugTotal) sumFactDrugTotal.innerText = `${drugList.length}종 조제`;
    if (sumFactDrugMaxDays) sumFactDrugMaxDays.innerText = `${maxDrugDays}일`;
    if (sumFactDrugOver30) {
        sumFactDrugOver30.innerHTML = stdEval.drug30dItems.length > 0
            ? `<span class="sum-fact-v v-notice">${stdEval.drug30dItems.length}건 (고지대상)</span>`
            : '0건';
    }

    // 3. Tab 2 건강체 리포트 동기화
    const stdResBadge = document.getElementById('stdResBadge');
    if (stdResBadge) {
        stdResBadge.className = `point-tag ${stdEval.pass ? 'tag-pass' : 'tag-warn'}`;
        stdResBadge.innerText = stdEval.pass ? '가입가능 (정상 통과)' : '고지의무 확인필요';
    }

    // 3-1. Table View
    const stdTblRes3m = document.getElementById('stdTblRes3m');
    const stdTblDesc3m = document.getElementById('stdTblDesc3m');
    if (stdTblRes3m) {
        stdTblRes3m.className = `point-tag ${stdEval.items3m.length > 0 ? 'tag-warn' : 'tag-pass'}`;
        stdTblRes3m.innerText = stdEval.items3m.length > 0 ? '고지필요' : '통과';
    }
    if (stdTblDesc3m) {
        stdTblDesc3m.innerText = stdEval.items3m.length > 0 ? `최근 3개월 병원 진료 ${stdEval.items3m.length}건 확인` : '최근 3개월 병원 진료 없음 (0건)';
    }

    const stdTblRes1y = document.getElementById('stdTblRes1y');
    const stdTblDesc1y = document.getElementById('stdTblDesc1y');
    if (stdTblRes1y) {
        stdTblRes1y.className = `point-tag ${stdEval.items1y.length > 0 ? 'tag-warn' : 'tag-pass'}`;
        stdTblRes1y.innerText = stdEval.items1y.length > 0 ? '확인필요' : '통과';
    }
    if (stdTblDesc1y) {
        stdTblDesc1y.innerText = stdEval.items1y.length > 0 ? `최근 1년 추가·재검사 소견 ${stdEval.items1y.length}건 확인` : '최근 1년 추가·재검사 소견 없음 (0건)';
    }

    const totalTreat5y = stdEval.hospItems5y.length + stdEval.surgItems5y.length + stdEval.treat7dItems.length + stdEval.drug30dItems.length;
    const stdTblRes5yTreat = document.getElementById('stdTblRes5yTreat');
    const stdTblDesc5yTreat = document.getElementById('stdTblDesc5yTreat');
    if (stdTblRes5yTreat) {
        stdTblRes5yTreat.className = `point-tag ${totalTreat5y > 0 ? 'tag-warn' : 'tag-pass'}`;
        stdTblRes5yTreat.innerText = totalTreat5y > 0 ? '고지필요' : '해당없음';
    }
    if (stdTblDesc5yTreat) {
        stdTblDesc5yTreat.innerText = totalTreat5y > 0 ? `입원 ${stdEval.hospItems5y.length}건 / 수술 ${stdEval.surgItems5y.length}건 / 7일치료 ${stdEval.treat7dItems.length}건 / 30일투약 ${stdEval.drug30dItems.length}건` : '입원 0일 / 수술 0건 / 30일투약 없음 (0건)';
    }

    const stdTblRes5y11Dis = document.getElementById('stdTblRes5y11Dis');
    const stdTblDesc5y11Dis = document.getElementById('stdTblDesc5y11Dis');
    if (stdTblRes5y11Dis) {
        stdTblRes5y11Dis.className = `point-tag ${stdEval.dis11Items.length > 0 ? 'tag-warn' : 'tag-pass'}`;
        stdTblRes5y11Dis.innerText = stdEval.dis11Items.length > 0 ? '고지필요' : '해당없음';
    }
    if (stdTblDesc5y11Dis) {
        stdTblDesc5y11Dis.innerText = stdEval.dis11Items.length > 0 ? `${stdEval.dis11Items[0].diseaseCategory} 등 ${stdEval.dis11Items.length}건 확인` : '암·뇌졸중·심근경색 등 중대질환 없음 (0건)';
    }

    // 3-2. Card View
    const stdCard3m = document.getElementById('stdCard3m');
    const stdCardRes3m = document.getElementById('stdCardRes3m');
    const stdCardDesc3m = document.getElementById('stdCardDesc3m');
    if (stdCard3m) stdCard3m.className = `v-card ${stdEval.items3m.length > 0 ? 'warn' : 'pass'}`;
    if (stdCardRes3m) stdCardRes3m.innerText = stdEval.items3m.length > 0 ? '고지필요' : '통과';
    if (stdCardDesc3m) stdCardDesc3m.innerText = stdEval.items3m.length > 0 ? `병원 진료 (${stdEval.items3m.length}건)` : '병원 진료 없음 (0건)';

    const stdCard1y = document.getElementById('stdCard1y');
    const stdCardRes1y = document.getElementById('stdCardRes1y');
    const stdCardDesc1y = document.getElementById('stdCardDesc1y');
    if (stdCard1y) stdCard1y.className = `v-card ${stdEval.items1y.length > 0 ? 'warn' : 'pass'}`;
    if (stdCardRes1y) stdCardRes1y.innerText = stdEval.items1y.length > 0 ? '확인필요' : '통과';
    if (stdCardDesc1y) stdCardDesc1y.innerText = stdEval.items1y.length > 0 ? `재검 소견 (${stdEval.items1y.length}건)` : '추가검사 소견 없음 (0건)';

    const stdCard5yTreat = document.getElementById('stdCard5yTreat');
    const stdCardRes5yTreat = document.getElementById('stdCardRes5yTreat');
    const stdCardDesc5yTreat = document.getElementById('stdCardDesc5yTreat');
    if (stdCard5yTreat) stdCard5yTreat.className = `v-card ${totalTreat5y > 0 ? 'warn' : 'pass'}`;
    if (stdCardRes5yTreat) stdCardRes5yTreat.innerText = totalTreat5y > 0 ? '고지필요' : '해당없음';
    if (stdCardDesc5yTreat) stdCardDesc5yTreat.innerText = totalTreat5y > 0 ? `치료/투약/수술 (${totalTreat5y}건)` : '법정 기준 미달 (0건)';

    const stdCard5y11Dis = document.getElementById('stdCard5y11Dis');
    const stdCardRes5y11Dis = document.getElementById('stdCardRes5y11Dis');
    const stdCardDesc5y11Dis = document.getElementById('stdCardDesc5y11Dis');
    if (stdCard5y11Dis) stdCard5y11Dis.className = `v-card ${stdEval.dis11Items.length > 0 ? 'warn' : 'pass'}`;
    if (stdCardRes5y11Dis) stdCardRes5y11Dis.innerText = stdEval.dis11Items.length > 0 ? '고지필요' : '해당없음';
    if (stdCardDesc5y11Dis) stdCardDesc5y11Dis.innerText = stdEval.dis11Items.length > 0 ? `${stdEval.dis11Items[0].diseaseCategory} (${stdEval.dis11Items.length}건)` : '중대질환 없음 (0건)';

    // 3-3. List View
    const stdListRes3m = document.getElementById('stdListRes3m');
    const stdListDesc3m = document.getElementById('stdListDesc3m');
    if (stdListRes3m) {
        stdListRes3m.className = `point-tag ${stdEval.items3m.length > 0 ? 'tag-warn' : 'tag-pass'}`;
        stdListRes3m.innerText = stdEval.items3m.length > 0 ? '고지필요' : '통과';
    }
    if (stdListDesc3m) {
        stdListDesc3m.innerText = stdEval.items3m.length > 0 ? `최근 3개월 이내 병의원 진료 ${stdEval.items3m.length}건 확인` : '최근 3개월 이내 병의원 진료 내역 없음 (0건)';
    }

    const stdListRes1y = document.getElementById('stdListRes1y');
    const stdListDesc1y = document.getElementById('stdListDesc1y');
    if (stdListRes1y) {
        stdListRes1y.className = `point-tag ${stdEval.items1y.length > 0 ? 'tag-warn' : 'tag-pass'}`;
        stdListRes1y.innerText = stdEval.items1y.length > 0 ? '확인필요' : '통과';
    }
    if (stdListDesc1y) {
        stdListDesc1y.innerText = stdEval.items1y.length > 0 ? `최근 1년 이내 추가검사·재검사 소견 ${stdEval.items1y.length}건 확인` : '최근 1년 이내 추가검사·재검사 소견 없음 (0건)';
    }

    const stdListRes5yTreat = document.getElementById('stdListRes5yTreat');
    const stdListDesc5yTreat = document.getElementById('stdListDesc5yTreat');
    if (stdListRes5yTreat) {
        stdListRes5yTreat.className = `point-tag ${totalTreat5y > 0 ? 'tag-warn' : 'tag-pass'}`;
        stdListRes5yTreat.innerText = totalTreat5y > 0 ? '고지필요' : '해당없음';
    }
    if (stdListDesc5yTreat) {
        stdListDesc5yTreat.innerText = totalTreat5y > 0 ? `입원 ${stdEval.hospItems5y.length}건 / 수술 ${stdEval.surgItems5y.length}건 / 7일치료 ${stdEval.treat7dItems.length}건 / 30일투약 ${stdEval.drug30dItems.length}건` : '입원 0일 / 수술 0건 / 30일 이상 계속투약 없음 (0건)';
    }

    const stdListRes5y11Dis = document.getElementById('stdListRes5y11Dis');
    const stdListDesc5y11Dis = document.getElementById('stdListDesc5y11Dis');
    if (stdListRes5y11Dis) {
        stdListRes5y11Dis.className = `point-tag ${stdEval.dis11Items.length > 0 ? 'tag-warn' : 'tag-pass'}`;
        stdListRes5y11Dis.innerText = stdEval.dis11Items.length > 0 ? '고지필요' : '해당없음';
    }
    if (stdListDesc5y11Dis) {
        stdListDesc5y11Dis.innerText = stdEval.dis11Items.length > 0 ? `${stdEval.dis11Items[0].diseaseCategory} 등 11대 질환 이력 ${stdEval.dis11Items.length}건 확인` : '암, 뇌졸중, 급성심근경색 등 11대 질환 이력 없음 (0건)';
    }

    // 3-4. Tab 2 확인 필요 고지 대상 테이블 (#stdCheckTbody)
    const stdCheckBadge = document.getElementById('stdCheckBadge');
    const stdCheckDesc = document.getElementById('stdCheckDesc');
    const stdCheckTbody = document.getElementById('stdCheckTbody');

    const totalStdWarn = stdEval.items3m.length + stdEval.items1y.length + stdEval.hospItems5y.length + stdEval.surgItems5y.length + stdEval.treat7dItems.length + stdEval.drug30dItems.length + stdEval.dis11Items.length;

    if (stdCheckBadge) {
        stdCheckBadge.className = `point-tag ${totalStdWarn > 0 ? 'tag-warn' : 'tag-pass'}`;
        stdCheckBadge.innerText = totalStdWarn > 0 ? `고지대상 ${totalStdWarn}건` : '확인필요 0건';
    }
    if (stdCheckDesc) {
        if (totalStdWarn > 0) {
            stdCheckDesc.style.color = '#dc2626';
            stdCheckDesc.innerText = '표준체(일반심사) 4대 고지항목 중 확인 필요 내역이 확인되었습니다. 청약 시 고지가 필수입니다.';
        } else {
            stdCheckDesc.style.color = '#059669';
            stdCheckDesc.innerText = '표준체(일반심사) 4대 고지 항목 전 항목 정상 통과 (가입 가능)';
        }
    }
    if (stdCheckTbody) {
        if (totalStdWarn === 0) {
            stdCheckTbody.innerHTML = '<tr><td colspan="6" class="clean-pass-td" style="text-align:center; padding:32px; color:#1d4ed8;">표준체(일반심사) 고지 대상 확인 필요 항목이 없습니다. (4대 질문 전 항목 정상 통과)</td></tr>';
        } else {
            const checkRows = [];
            // 3개월
            stdEval.items3m.forEach(item => {
                checkRows.push(`
                    <tr class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td><span class="period-tag tag-p3m">3개월</span> <b>1. 최근 3개월 진료</b></td>
                        <td><b>${item.medicalCenter}</b><br><span style="font-size:11.5px; color:#64748b;">${item.primaryDxCode} (${item.primaryDxName})</span></td>
                        <td style="font-weight:600; color:#991b1b;">
                            최근 3개월 이내 병의원 진료 내역 확인<br>
                            <span style="font-size:11px; color:#64748b; font-weight:normal;">3개월 이내 진료, 투약 사실은 계약전 알릴의무 필수 고지 대상</span>
                        </td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                        <td style="text-align:center;"><button type="button" class="btn-tbl-action" onclick="filterStandard('3m')">상세보기 →</button></td>
                    </tr>
                `);
            });
            // 1년 추가검사
            stdEval.items1y.forEach(item => {
                checkRows.push(`
                    <tr class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td><span class="period-tag tag-p1y">1년</span> <b>2. 추가검사(재검사)</b></td>
                        <td><b>${item.medicalCenter}</b><br><span style="font-size:11.5px; color:#64748b;">${item.codeName}</span></td>
                        <td style="font-weight:600; color:#991b1b;">
                            <b>${item.codeName}</b> 검사/소견 확인<br>
                            <span style="font-size:11px; color:#64748b; font-weight:normal;">최근 1년 이내 의사로부터 추가검사(재검사)를 받은 사실에 해당</span>
                        </td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">확인필요</span></td>
                        <td style="text-align:center;"><button type="button" class="btn-tbl-action" onclick="filterStandard('1y')">상세보기 →</button></td>
                    </tr>
                `);
            });
            // 입원/수술
            stdEval.hospItems5y.forEach(item => {
                checkRows.push(`
                    <tr class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td><span class="period-tag tag-p5y">5년</span> <b>3. 질병/상해 입원</b></td>
                        <td><b>${item.medicalCenter}</b><br><span style="font-size:11.5px; color:#64748b;">${item.primaryDxCode} (${item.primaryDxName})</span></td>
                        <td style="font-weight:600; color:#991b1b;">
                            입원 치료 내역 확인 (${item.numberVisitDays || 1}일)<br>
                            <span style="font-size:11px; color:#64748b; font-weight:normal;">최근 5년 이내 입원 사실은 표준체 및 간편심사 필수 고지 대상</span>
                        </td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                        <td style="text-align:center;"><button type="button" class="btn-tbl-action" onclick="filterStandard('5y_treat')">상세보기 →</button></td>
                    </tr>
                `);
            });
            stdEval.surgItems5y.forEach(item => {
                checkRows.push(`
                    <tr class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td><span class="period-tag tag-p5y">5년</span> <b>3. 질병/상해 수술</b></td>
                        <td><b>${item.medicalCenter}</b><br><span style="font-size:11.5px; color:#64748b;">${item.codeName}</span></td>
                        <td style="font-weight:600; color:#991b1b;">
                            <b>${item.codeName}</b> 수술 시행 확인<br>
                            <span style="font-size:11px; color:#64748b; font-weight:normal;">최근 5년 이내 수술 사실은 표준체 및 간편심사 필수 고지 대상</span>
                        </td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                        <td style="text-align:center;"><button type="button" class="btn-tbl-action" onclick="filterStandard('5y_treat')">상세보기 →</button></td>
                    </tr>
                `);
            });
            // 7일 치료
            stdEval.treat7dItems.forEach(item => {
                checkRows.push(`
                    <tr class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.lastDate || '-'}</td>
                        <td><span class="period-tag tag-p5y">5년</span> <b>3. 계속하여 7일이상 치료</b></td>
                        <td><b>${item.hospital || '-'}</b><br><span style="font-size:11.5px; color:#64748b;">${item.code} (${item.name})</span></td>
                        <td style="font-weight:600; color:#991b1b;">
                            동일 원인 질환 통원 <b>${item.count}일</b> 확인 (7일 이상 기준 초과)<br>
                            <span style="font-size:11px; color:#64748b; font-weight:normal;">동일한 원인으로 계속하여 7일 이상 치료 사실에 해당</span>
                        </td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                        <td style="text-align:center;"><button type="button" class="btn-tbl-action" onclick="filterStandard('5y_treat')">상세보기 →</button></td>
                    </tr>
                `);
            });
            // 30일 투약
            stdEval.drug30dItems.forEach(item => {
                checkRows.push(`
                    <tr class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.lastDate || '-'}</td>
                        <td><span class="period-tag tag-p5y">5년</span> <b>3. 계속하여 30일이상 투약</b></td>
                        <td><b>${item.hospital || '-'}</b><br><span style="font-size:11.5px; color:#64748b;">${item.name}</span></td>
                        <td style="font-weight:600; color:#991b1b;">
                            동일 의약품 처방 누적 <b>${item.totalDays}일</b> 확인 (30일 이상 기준 초과)<br>
                            <span style="font-size:11px; color:#64748b; font-weight:normal;">동일한 원인으로 계속하여 30일 이상 투약 사실에 해당</span>
                        </td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                        <td style="text-align:center;"><button type="button" class="btn-tbl-action" onclick="filterStandard('5y_treat')">상세보기 →</button></td>
                    </tr>
                `);
            });
            // 11대 중대질병
            stdEval.dis11Items.forEach(item => {
                checkRows.push(`
                    <tr class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td><span class="period-tag tag-p5y">5년</span> <b>4. 11대 중대질병</b></td>
                        <td><b>${item.medicalCenter}</b><br><span style="font-size:11.5px; color:#64748b;">${item.primaryDxCode} (${item.primaryDxName})</span></td>
                        <td style="font-weight:600; color:#991b1b;">
                            <b>11대 중대질환 (${item.diseaseCategory})</b> 진단·치료 확인<br>
                            <span style="font-size:11px; color:#64748b; font-weight:normal;">암, 협심증, 심근경색, 판막, 간경화, 뇌졸중, 당뇨, 고혈압 등 11대 중대질환 고지 필수</span>
                        </td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                        <td style="text-align:center;"><button type="button" class="btn-tbl-action" onclick="filterStandard('5y_11dis')">상세보기 →</button></td>
                    </tr>
                `);
            });

            stdCheckTbody.innerHTML = checkRows.join('');
        }
    }

    // 3-5. Tab 2 상세내용 점검표 (#stdTableTbody) 동기화
    const stdTableTbody = document.getElementById('stdTableTbody');
    if (stdTableTbody) {
        let stdHtml = '';

        // [분류 1] 진료 (3개월)
        stdHtml += `
            <tr class="group-header-row" data-period-group="3m">
                <td colspan="6">
                    <span class="period-tag tag-p3m">1. 진료 (3개월)</span>
                    분석 기준일: 최근 3개월 (${stdEval.items3m.length > 0 ? `진료 ${stdEval.items3m.length}건 확인` : '진료 내역 없음'})
                </td>
            </tr>
        `;
        if (stdEval.items3m.length === 0) {
            stdHtml += `
                <tr data-cat="3m" data-period="3m">
                    <td colspan="6" class="clean-pass-td">
                        최근 3개월 이내 병의원 진료 및 투약 내역이 전혀 없습니다. (0건 · 정상 통과)
                    </td>
                </tr>
            `;
        } else {
            stdEval.items3m.forEach(item => {
                stdHtml += `
                    <tr data-cat="3m" data-period="3m" class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td style="font-weight:600;">${item.primaryDxCode} (${item.primaryDxName})</td>
                        <td><span class="point-tag tag-warn">외래진료</span> ${item.diagDept || '일반'}</td>
                        <td style="text-align:center;">${item.numberVisitDays || 1}일</td>
                        <td><b>${item.medicalCenter}</b></td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                    </tr>
                `;
            });
        }

        // [분류 2] 추가검사, 재검사 (1년)
        stdHtml += `
            <tr class="group-header-row" data-period-group="1y">
                <td colspan="6">
                    <span class="period-tag tag-p1y">2. 추가검사, 재검사 (1년)</span>
                    분석 기준일: 최근 1년 (${stdEval.items1y.length > 0 ? `추가검사 ${stdEval.items1y.length}건 확인` : '조회된 내역 없음'})
                </td>
            </tr>
        `;
        if (stdEval.items1y.length === 0) {
            stdHtml += `
                <tr data-cat="1y" data-period="1y">
                    <td colspan="6" class="clean-pass-td">
                        최근 1년 이내 의사의 추가검사·재검사 소견 내역이 없습니다. (0건 · 정상 통과)
                    </td>
                </tr>
            `;
        } else {
            stdEval.items1y.forEach(item => {
                stdHtml += `
                    <tr data-cat="1y" data-period="1y" class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td style="font-weight:600;">${item.codeName}</td>
                        <td><span class="point-tag tag-warn">${item.medicalDetails || '정밀검사'}</span></td>
                        <td style="text-align:center;">1일</td>
                        <td><b>${item.medicalCenter}</b></td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">확인필요</span></td>
                    </tr>
                `;
            });
        }

        // [분류 3] 7일이상 치료, 30일이상 투약, 입원, 수술 (5년)
        stdHtml += `
            <tr class="group-header-row" data-period-group="5y_treat">
                <td colspan="6">
                    <span class="period-tag tag-p5y">3. 7일이상 치료, 30일이상 투약, 입원, 수술 (5년)</span>
                    분석 기준일: 최근 5년
                </td>
            </tr>
        `;
        if (totalTreat5y === 0) {
            stdHtml += `
                <tr data-cat="5y_treat" data-period="5y_treat">
                    <td style="font-weight:700;"><span class="period-tag tag-p5y" style="margin:0;">7일이상 치료</span></td>
                    <td><b>동일원인 7일 이상 지속 치료 점검</b></td>
                    <td><span class="tag-clean-pass">동일원인 치료 7일 이상 없음</span></td>
                    <td style="text-align:center;"><span class="tag-clean-pass">미해당</span></td>
                    <td>전 의료기관</td>
                    <td style="text-align:center;"><span class="point-tag tag-pass">통과</span></td>
                </tr>
                <tr data-cat="5y_treat" data-period="5y_treat">
                    <td style="font-weight:700;"><span class="period-tag tag-p5y" style="margin:0;">30일이상 투약</span></td>
                    <td><b>동일원인 30일 이상 계속 투약 점검</b></td>
                    <td><span class="tag-clean-pass">동일원인 투약 30일 이상 없음</span></td>
                    <td style="text-align:center;"><span class="tag-clean-pass">미해당</span></td>
                    <td>전 의료기관</td>
                    <td style="text-align:center;"><span class="point-tag tag-pass">통과</span></td>
                </tr>
                <tr data-cat="5y_treat" data-period="5y_treat">
                    <td style="font-weight:700;"><span class="period-tag tag-p5y" style="margin:0;">입원 및 수술</span></td>
                    <td><b>질병 또는 상해로 인한 입원 및 수술 점검</b></td>
                    <td><span class="tag-clean-pass">입원 0일 (0회) / 질병수술 0건</span></td>
                    <td style="text-align:center;"><span class="tag-clean-pass">미해당</span></td>
                    <td>전 의료기관</td>
                    <td style="text-align:center;"><span class="point-tag tag-pass">통과</span></td>
                </tr>
            `;
        } else {
            // 입원 내역
            stdEval.hospItems5y.forEach(item => {
                stdHtml += `
                    <tr data-cat="5y_treat" data-period="5y_treat" class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td style="font-weight:600;">${item.primaryDxCode} (${item.primaryDxName})</td>
                        <td><span class="point-tag tag-warn">입원치료</span> (${item.diagDept || '입원'})</td>
                        <td style="text-align:center;">${item.numberVisitDays || 1}일</td>
                        <td><b>${item.medicalCenter}</b></td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                    </tr>
                `;
            });
            // 수술 내역
            stdEval.surgItems5y.forEach(item => {
                stdHtml += `
                    <tr data-cat="5y_treat" data-period="5y_treat" class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td style="font-weight:600;">${item.codeName}</td>
                        <td><span class="point-tag tag-warn">수술</span> (${item.medicalDetails || '처치및수술'})</td>
                        <td style="text-align:center;">1일</td>
                        <td><b>${item.medicalCenter}</b></td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                    </tr>
                `;
            });
            // 7일 치료
            stdEval.treat7dItems.forEach(item => {
                stdHtml += `
                    <tr data-cat="5y_treat" data-period="5y_treat" class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.lastDate || '-'}</td>
                        <td style="font-weight:600;">${item.code} (${item.name})</td>
                        <td><span class="point-tag tag-warn">7일이상 지속치료</span></td>
                        <td style="text-align:center; font-weight:700; color:#dc2626;">${item.count}일</td>
                        <td><b>${item.hospital || '-'}</b></td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                    </tr>
                `;
            });
            // 30일 투약
            stdEval.drug30dItems.forEach(item => {
                stdHtml += `
                    <tr data-cat="5y_treat" data-period="5y_treat" class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.lastDate || '-'}</td>
                        <td style="font-weight:600;">${item.name}</td>
                        <td><span class="point-tag tag-warn">30일이상 투약</span></td>
                        <td style="text-align:center; font-weight:700; color:#dc2626;">${item.totalDays}일</td>
                        <td><b>${item.hospital || '-'}</b></td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                    </tr>
                `;
            });
        }

        // [분류 4] 11대 중대질병 (5년)
        stdHtml += `
            <tr class="group-header-row" data-period-group="5y_11dis">
                <td colspan="6">
                    <span class="period-tag tag-p5y">4. 11대 중대질병 (5년)</span>
                    분석 기준일: 최근 5년 (암 · 뇌졸중 · 급성심근경색 · 고혈압 · 당뇨 등)
                </td>
            </tr>
        `;
        if (stdEval.dis11Items.length === 0) {
            stdHtml += `
                <tr data-cat="5y_11dis" data-period="5y_11dis">
                    <td style="font-weight:700;"><span class="period-tag tag-p5y" style="margin:0;">11대 중대질병</span></td>
                    <td><b>11대 중대질병 진단·치료·투약 점검</b></td>
                    <td><span class="tag-clean-pass">진단·치료 0건</span></td>
                    <td style="text-align:center;"><span class="tag-clean-pass">미해당</span></td>
                    <td>전 의료기관</td>
                    <td style="text-align:center;"><span class="point-tag tag-pass">통과</span></td>
                </tr>
            `;
        } else {
            stdEval.dis11Items.forEach(item => {
                stdHtml += `
                    <tr data-cat="5y_11dis" data-period="5y_11dis" class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td style="font-weight:600;">${item.primaryDxCode} (${item.primaryDxName})</td>
                        <td><span class="point-tag tag-warn">${item.diseaseCategory}</span></td>
                        <td style="text-align:center;">1일</td>
                        <td><b>${item.medicalCenter}</b></td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                    </tr>
                `;
            });
        }

        stdTableTbody.innerHTML = stdHtml;
    }

    // 4. Tab 3 유병자(간편심사) 리포트 동기화
    const simResBadge = document.getElementById('simResBadge');
    if (simResBadge) {
        if (simEval.grade === '3.5.5') {
            simResBadge.className = 'point-tag tag-pass';
            simResBadge.innerText = '초경증 3.5.5 가입가능';
        } else if (simEval.grade === '3.2.5') {
            simResBadge.className = 'point-tag tag-pass';
            simResBadge.innerText = '간편 3.2.5 가입가능';
        } else {
            simResBadge.className = 'point-tag tag-warn';
            simResBadge.innerText = '간편고지 확인필요';
        }
    }

    // 4-1. Table View
    const simTblRes3m = document.getElementById('simTblRes3m');
    const simTblDesc3m = document.getElementById('simTblDesc3m');
    if (simTblRes3m) {
        simTblRes3m.className = `point-tag ${simEval.findings3m > 0 ? 'tag-warn' : 'tag-pass'}`;
        simTblRes3m.innerText = simEval.findings3m > 0 ? '소견확인' : '통과';
    }
    if (simTblDesc3m) {
        simTblDesc3m.innerText = simEval.findings3m > 0 ? `최근 3개월 입원/수술/추가검사 소견 ${simEval.findings3m}건 확인` : '최근 3개월 입원·수술·추가검사 소견 없음 (0건)';
    }

    const simTblRes5yHosp = document.getElementById('simTblRes5yHosp');
    const simTblDesc5yHosp = document.getElementById('simTblDesc5yHosp');
    if (simTblRes5yHosp) {
        simTblRes5yHosp.className = `point-tag ${simEval.hospSurg5y > 0 ? 'tag-warn' : 'tag-pass'}`;
        simTblRes5yHosp.innerText = simEval.hospSurg5y > 0 ? '고지필요' : '해당없음';
    }
    if (simTblDesc5yHosp) {
        simTblDesc5yHosp.innerText = simEval.hospSurg5y > 0 ? `입원 ${simEval.hospItems5y.length}건 / 수술 ${simEval.surgItems5y.length}건 확인` : '입원 0일 / 질병수술 0건 (0건)';
    }

    const simTblRes5y6Dis = document.getElementById('simTblRes5y6Dis');
    const simTblDesc5y6Dis = document.getElementById('simTblDesc5y6Dis');
    if (simTblRes5y6Dis) {
        simTblRes5y6Dis.className = `point-tag ${simEval.dis6Items.length > 0 ? 'tag-warn' : 'tag-pass'}`;
        simTblRes5y6Dis.innerText = simEval.dis6Items.length > 0 ? '고지필요' : '해당없음';
    }
    if (simTblDesc5y6Dis) {
        simTblDesc5y6Dis.innerText = simEval.dis6Items.length > 0 ? `${simEval.dis6Items[0].diseaseCategory} 등 6대 질환 ${simEval.dis6Items.length}건 확인` : '암·뇌졸중·심근경색 등 6대 질환 없음 (0건)';
    }

    // 4-2. Card View
    const simCard3m = document.getElementById('simCard3m');
    const simCardRes3m = document.getElementById('simCardRes3m');
    const simCardDesc3m = document.getElementById('simCardDesc3m');
    if (simCard3m) simCard3m.className = `v-card ${simEval.findings3m > 0 ? 'warn' : 'pass'}`;
    if (simCardRes3m) simCardRes3m.innerText = simEval.findings3m > 0 ? '소견확인' : '통과';
    if (simCardDesc3m) simCardDesc3m.innerText = simEval.findings3m > 0 ? `입원/수술소견 (${simEval.findings3m}건)` : '소견 없음 (0건)';

    const simCard5yHosp = document.getElementById('simCard5yHosp');
    const simCardRes5yHosp = document.getElementById('simCardRes5yHosp');
    const simCardDesc5yHosp = document.getElementById('simCardDesc5yHosp');
    if (simCard5yHosp) simCard5yHosp.className = `v-card ${simEval.hospSurg5y > 0 ? 'warn' : 'pass'}`;
    if (simCardRes5yHosp) simCardRes5yHosp.innerText = simEval.hospSurg5y > 0 ? '고지필요' : '해당없음';
    if (simCardDesc5yHosp) simCardDesc5yHosp.innerText = simEval.hospSurg5y > 0 ? `입원/수술 (${simEval.hospSurg5y}건)` : '입원/수술 없음 (0건)';

    const simCard5y6Dis = document.getElementById('simCard5y6Dis');
    const simCardRes5y6Dis = document.getElementById('simCardRes5y6Dis');
    const simCardDesc5y6Dis = document.getElementById('simCardDesc5y6Dis');
    if (simCard5y6Dis) simCard5y6Dis.className = `v-card ${simEval.dis6Items.length > 0 ? 'warn' : 'pass'}`;
    if (simCardRes5y6Dis) simCardRes5y6Dis.innerText = simEval.dis6Items.length > 0 ? '고지필요' : '해당없음';
    if (simCardDesc5y6Dis) simCardDesc5y6Dis.innerText = simEval.dis6Items.length > 0 ? `${simEval.dis6Items[0].diseaseCategory} (${simEval.dis6Items.length}건)` : '6대질환 없음 (0건)';

    // 4-3. List View
    const simListRes3m = document.getElementById('simListRes3m');
    const simListDesc3m = document.getElementById('simListDesc3m');
    if (simListRes3m) {
        simListRes3m.className = `point-tag ${simEval.findings3m > 0 ? 'tag-warn' : 'tag-pass'}`;
        simListRes3m.innerText = simEval.findings3m > 0 ? '소견확인' : '통과';
    }
    if (simListDesc3m) {
        simListDesc3m.innerText = simEval.findings3m > 0 ? `최근 3개월 이내 입원·수술·재검사 소견 ${simEval.findings3m}건 확인` : '최근 3개월 이내 입원·수술·추가검사 소견 없음 (0건)';
    }

    const simListRes5yHosp = document.getElementById('simListRes5yHosp');
    const simListDesc5yHosp = document.getElementById('simListDesc5yHosp');
    if (simListRes5yHosp) {
        simListRes5yHosp.className = `point-tag ${simEval.hospSurg5y > 0 ? 'tag-warn' : 'tag-pass'}`;
        simListRes5yHosp.innerText = simEval.hospSurg5y > 0 ? '고지필요' : '해당없음';
    }
    if (simListDesc5yHosp) {
        simListDesc5yHosp.innerText = simEval.hospSurg5y > 0 ? `최근 5년 이내 입원 ${simEval.hospItems5y.length}건, 수술 ${simEval.surgItems5y.length}건 확인` : '최근 5년 이내 질병·상해 입원 또는 수술 없음 (0건)';
    }

    const simListRes5y6Dis = document.getElementById('simListRes5y6Dis');
    const simListDesc5y6Dis = document.getElementById('simListDesc5y6Dis');
    if (simListRes5y6Dis) {
        simListRes5y6Dis.className = `point-tag ${simEval.dis6Items.length > 0 ? 'tag-warn' : 'tag-pass'}`;
        simListRes5y6Dis.innerText = simEval.dis6Items.length > 0 ? '고지필요' : '해당없음';
    }
    if (simListDesc5y6Dis) {
        simListDesc5y6Dis.innerText = simEval.dis6Items.length > 0 ? `${simEval.dis6Items[0].diseaseCategory} 등 6대 질환 이력 ${simEval.dis6Items.length}건 확인` : '암, 협심증, 심근경색, 뇌졸중 등 6대 질환 없음 (0건)';
    }

    // 4-4. Tab 3 확인 필요 고지 대상 리스트 (#simCheckTbody)
    const simCheckBadge = document.getElementById('simCheckBadge');
    const simCheckDesc = document.getElementById('simCheckDesc');
    const simCheckTbody = document.getElementById('simCheckTbody');

    const totalSimWarn = simEval.findings3m + simEval.hospSurg5y + simEval.dis6Items.length;

    if (simCheckBadge) {
        simCheckBadge.className = `point-tag ${totalSimWarn > 0 ? 'tag-warn' : 'tag-pass'}`;
        simCheckBadge.innerText = totalSimWarn > 0 ? `확인필요 ${totalSimWarn}건` : '확인필요 없음 (0건)';
    }
    if (simCheckDesc) {
        if (totalSimWarn > 0) {
            simCheckDesc.style.color = '#dc2626';
            simCheckDesc.innerText = '간편심사 3대 질문 중 고지 필요 내역이 확인되었습니다. 적합한 플랜(3.5.5 / 3.2.5 등) 심사가 필요합니다.';
        } else {
            simCheckDesc.style.color = '#059669';
            simCheckDesc.innerText = '3.5.5 간편심사 3대 질문 전 항목 통과 (가입 가능)';
        }
    }
    if (simCheckTbody) {
        if (totalSimWarn === 0) {
            simCheckTbody.innerHTML = '<tr><td colspan="6" class="clean-pass-td" style="text-align:center; padding:32px; color:#1d4ed8;">간편심사 고지 대상 확인 필요 항목이 없습니다. (3.5.5 초경증 전 항목 정상 통과)</td></tr>';
        } else {
            const checkRows = [];
            // 3개월 소견
            simEval.hosp3m.forEach(item => {
                checkRows.push(`
                    <tr class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td><span class="period-tag tag-p3m">3개월</span> <b>1. 입원 소견</b></td>
                        <td><b>${item.medicalCenter}</b><br><span style="font-size:11.5px; color:#64748b;">${item.primaryDxCode} (${item.primaryDxName})</span></td>
                        <td style="font-weight:600; color:#991b1b;">
                            최근 3개월 이내 입원 이력 확인<br>
                            <span style="font-size:11px; color:#64748b; font-weight:normal;">3개월 이내 입원/수술/추가검사 소견 질문에 해당</span>
                        </td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                        <td style="text-align:center;"><button type="button" class="btn-tbl-action" onclick="filterSimple('3m')">상세보기 →</button></td>
                    </tr>
                `);
            });
            simEval.surg3m.forEach(item => {
                checkRows.push(`
                    <tr class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td><span class="period-tag tag-p3m">3개월</span> <b>1. 수술 소견</b></td>
                        <td><b>${item.medicalCenter}</b><br><span style="font-size:11.5px; color:#64748b;">${item.codeName}</span></td>
                        <td style="font-weight:600; color:#991b1b;">
                            최근 3개월 이내 수술 이력 확인<br>
                            <span style="font-size:11px; color:#64748b; font-weight:normal;">3개월 이내 입원/수술/추가검사 소견 질문에 해당</span>
                        </td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                        <td style="text-align:center;"><button type="button" class="btn-tbl-action" onclick="filterSimple('3m')">상세보기 →</button></td>
                    </tr>
                `);
            });
            // 5년 입원/수술
            simEval.hospItems5y.forEach(item => {
                checkRows.push(`
                    <tr class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td><span class="period-tag tag-p5y">5년</span> <b>2. 질병/상해 입원</b></td>
                        <td><b>${item.medicalCenter}</b><br><span style="font-size:11.5px; color:#64748b;">${item.primaryDxCode} (${item.primaryDxName})</span></td>
                        <td style="font-weight:600; color:#991b1b;">
                            입원 치료 내역 확인 (${item.numberVisitDays || 1}일)<br>
                            <span style="font-size:11px; color:#64748b; font-weight:normal;">간편심사 플랜(3.5.5 / 3.2.5 등) 선택 기준 적용 필요</span>
                        </td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                        <td style="text-align:center;"><button type="button" class="btn-tbl-action" onclick="filterSimple('5y_hosp')">상세보기 →</button></td>
                    </tr>
                `);
            });
            simEval.surgItems5y.forEach(item => {
                checkRows.push(`
                    <tr class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td><span class="period-tag tag-p5y">5년</span> <b>2. 질병/상해 수술</b></td>
                        <td><b>${item.medicalCenter}</b><br><span style="font-size:11.5px; color:#64748b;">${item.codeName}</span></td>
                        <td style="font-weight:600; color:#991b1b;">
                            <b>${item.codeName}</b> 수술 시행 확인<br>
                            <span style="font-size:11px; color:#64748b; font-weight:normal;">간편심사 플랜(3.5.5 / 3.2.5 등) 선택 기준 적용 필요</span>
                        </td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                        <td style="text-align:center;"><button type="button" class="btn-tbl-action" onclick="filterSimple('5y_hosp')">상세보기 →</button></td>
                    </tr>
                `);
            });
            // 6대 질병
            simEval.dis6Items.forEach(item => {
                checkRows.push(`
                    <tr class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td><span class="period-tag tag-p5y">5년</span> <b>3. 6대 중대질병</b></td>
                        <td><b>${item.medicalCenter}</b><br><span style="font-size:11.5px; color:#64748b;">${item.primaryDxCode} (${item.primaryDxName})</span></td>
                        <td style="font-weight:600; color:#991b1b;">
                            <b>6대 중대질병 (${item.diseaseCategory})</b> 진단·치료 확인<br>
                            <span style="font-size:11px; color:#64748b; font-weight:normal;">암, 협심증, 심근경색, 판막, 간경화, 뇌졸중 질문 해당</span>
                        </td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                        <td style="text-align:center;"><button type="button" class="btn-tbl-action" onclick="filterSimple('5y_6dis')">상세보기 →</button></td>
                    </tr>
                `);
            });

            simCheckTbody.innerHTML = checkRows.join('');
        }
    }

    // 4-5. Tab 3 상세내용 점검표 (#simTableTbody) 동기화
    const simTableTbody = document.getElementById('simTableTbody');
    if (simTableTbody) {
        let simHtml = '';

        // [분류 1] 1. 진료, 소견 (3개월)
        simHtml += `
            <tr class="group-header-row" data-period-group="3m">
                <td colspan="6">
                    <span class="period-tag tag-p3m">1. 진료, 소견 (3개월)</span>
                    분석 기준일: 최근 3개월 (${simEval.findings3m > 0 ? `소견 ${simEval.findings3m}건 확인` : '소견 없음'})
                </td>
            </tr>
        `;
        if (simEval.findings3m === 0) {
            simHtml += `
                <tr data-cat="3m">
                    <td colspan="6" class="clean-pass-td">
                        최근 3개월 이내 입원·수술·추가검사 소견이 전혀 없습니다. (0건 · 1번 질문 정상 통과)
                    </td>
                </tr>
            `;
        } else {
            simEval.hosp3m.forEach(item => {
                simHtml += `
                    <tr data-cat="3m" class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td style="font-weight:600;">${item.primaryDxCode} (${item.primaryDxName})</td>
                        <td><span class="point-tag tag-warn">입원치료</span> (${item.diagDept || '입원'})</td>
                        <td style="text-align:center;">${item.numberVisitDays || 1}일</td>
                        <td><b>${item.medicalCenter}</b></td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                    </tr>
                `;
            });
            simEval.surg3m.forEach(item => {
                simHtml += `
                    <tr data-cat="3m" class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td style="font-weight:600;">${item.codeName}</td>
                        <td><span class="point-tag tag-warn">수술</span> (${item.medicalDetails || '처치및수술'})</td>
                        <td style="text-align:center;">1일</td>
                        <td><b>${item.medicalCenter}</b></td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                    </tr>
                `;
            });
        }

        // [분류 2] 2. 입원, 수술 (5년)
        simHtml += `
            <tr class="group-header-row" data-period-group="5y_hosp">
                <td colspan="6">
                    <span class="period-tag tag-p5y">2. 입원, 수술 (5년)</span>
                    분석 기준일: 최근 5년 (${simEval.hospSurg5y > 0 ? `입원/수술 ${simEval.hospSurg5y}건 확인` : '조회된 내역 없음'})
                </td>
            </tr>
        `;
        if (simEval.hospSurg5y === 0) {
            simHtml += `
                <tr data-cat="5y_hosp">
                    <td style="font-weight:700;"><span class="period-tag tag-p5y" style="margin:0;">5년 전수점검</span></td>
                    <td><b>질병·상해 입원 및 수술 전수 점검</b></td>
                    <td><span class="tag-clean-pass">입원 0일 (0회) / 질병수술 0건</span></td>
                    <td style="text-align:center;"><span class="tag-clean-pass">미해당</span></td>
                    <td>전 의료기관</td>
                    <td style="text-align:center;"><span class="point-tag tag-pass">통과</span></td>
                </tr>
            `;
        } else {
            simEval.hospItems5y.forEach(item => {
                simHtml += `
                    <tr data-cat="5y_hosp" class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td style="font-weight:600;">${item.primaryDxCode} (${item.primaryDxName})</td>
                        <td><span class="point-tag tag-warn">입원치료</span> (${item.diagDept || '입원'})</td>
                        <td style="text-align:center;">${item.numberVisitDays || 1}일</td>
                        <td><b>${item.medicalCenter}</b></td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                    </tr>
                `;
            });
            simEval.surgItems5y.forEach(item => {
                simHtml += `
                    <tr data-cat="5y_hosp" class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td style="font-weight:600;">${item.codeName}</td>
                        <td><span class="point-tag tag-warn">수술</span> (${item.medicalDetails || '처치및수술'})</td>
                        <td style="text-align:center;">1일</td>
                        <td><b>${item.medicalCenter}</b></td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                    </tr>
                `;
            });
        }

        // [분류 3] 3. 6대 중대질병 (5년)
        simHtml += `
            <tr class="group-header-row" data-period-group="5y_6dis">
                <td colspan="6">
                    <span class="period-tag tag-p5y">3. 6대 중대질병 (5년)</span>
                    분석 기준일: 최근 5년 (암, 협심증, 심근경색, 판막증, 간경화, 뇌졸중)
                </td>
            </tr>
        `;
        if (simEval.dis6Items.length === 0) {
            simHtml += `
                <tr data-cat="5y_6dis">
                    <td colspan="6" class="clean-pass-td">
                        최근 5년 이내 6대 중대질병(암, 협심증, 심근경색, 심장판막증, 간경화, 뇌졸중)으로 인한 진단, 입원, 수술 사실이 전혀 없습니다. (0건 · 3번 질문 정상 통과)
                    </td>
                </tr>
            `;
        } else {
            simEval.dis6Items.forEach(item => {
                simHtml += `
                    <tr data-cat="5y_6dis" class="row-check-needed">
                        <td style="font-weight:700; color:#dc2626;">${item.treatmentStartDate}</td>
                        <td style="font-weight:600;">${item.primaryDxCode} (${item.primaryDxName})</td>
                        <td><span class="point-tag tag-warn">${item.diseaseCategory}</span></td>
                        <td style="text-align:center;">1일</td>
                        <td><b>${item.medicalCenter}</b></td>
                        <td style="text-align:center;"><span class="point-tag tag-warn">고지필요</span></td>
                    </tr>
                `;
            });
        }

        simTableTbody.innerHTML = simHtml;
    }
}

function showNhisDiagnostics() {
    const modal = document.getElementById('nhisDiagModal');
    const jsonView = document.getElementById('nhisDiagJsonView');
    const statusSummary = document.getElementById('nhisDiagStatusSummary');
    
    const raw = localStorage.getItem('LAST_NHIS_RAW_RESPONSE');
    if (!raw) {
        alert('최근 조회된 건강보험공단 통신 데이터가 없습니다. 먼저 상단의 [고객 정보 입력 / 간편인증]을 통해 인증을 진행해주세요.');
        return;
    }
    try {
        const parsed = JSON.parse(raw);
        const commonInfo = parsed.data?.common || parsed.common || {};
        const topKeys = Object.keys(parsed);
        
        if (statusSummary) {
            statusSummary.innerText = `HTTP ${parsed.statusCode || 200} | errYn: ${commonInfo.errYn || 'N'} | 최상위 필드: ${topKeys.join(', ')}`;
        }
        if (jsonView) {
            jsonView.textContent = JSON.stringify(parsed, null, 2);
        }
        if (modal) {
            modal.style.display = 'flex';
        }
    } catch (e) {
        alert('진단 데이터 파싱 오류: ' + e.message);
    }
}

function closeNhisDiagModal() {
    const modal = document.getElementById('nhisDiagModal');
    if (modal) modal.style.display = 'none';
}

function copyNhisDiagJson() {
    const jsonView = document.getElementById('nhisDiagJsonView');
    if (!jsonView || !jsonView.textContent) {
        alert('복사할 JSON 데이터가 없습니다.');
        return;
    }
    navigator.clipboard.writeText(jsonView.textContent).then(() => {
        alert('건보공단 수신 원본 JSON 전문이 클립보드에 복사되었습니다.');
    }).catch(err => {
        alert('클립보드 복사 실패: ' + err.message);
    });
}

// 전역 바인딩
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.getUnderwritingApiUrl = getUnderwritingApiUrl;
window.callUnderwritingApi = callUnderwritingApi;
window.requestNhisAuth = requestNhisAuth;
window.verifyNhisAndAnalyze = verifyNhisAndAnalyze;
window.loadSampleUnderwritingData = loadSampleUnderwritingData;
window.renderUnderwritingData = renderUnderwritingData;
window.showNhisDiagnostics = showNhisDiagnostics;
window.closeNhisDiagModal = closeNhisDiagModal;
window.copyNhisDiagJson = copyNhisDiagJson;
