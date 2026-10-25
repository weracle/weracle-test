// Toggle Logic
const toggleBtns = document.querySelectorAll('.toggle-btn');
const indicator = document.querySelector('.toggle-indicator');
if(toggleBtns && indicator) {
    toggleBtns.forEach((btn, index) => {
        btn.addEventListener('click', () => {
            toggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if(index === 1) {
                indicator.style.left = 'calc(50% - 4px)';
            } else {
                indicator.style.left = '4px';
            }
        });
    });
}

const listModal = document.getElementById('listModal');
const listModalTitle = document.getElementById('modalTitle');
const listTableHead = document.getElementById('listTableHead');
const listTableBody = document.getElementById('listTableBody');
const masterModal = document.getElementById('masterModal');
const profileModal = document.getElementById('profileModal');
const editModal = document.getElementById('editModal');

let dummyData = {
    'birthday': {
        title: ' 오늘 생일 고객 리스트 (3명)',
        headers: ['고객명', '성별/나이', '생일', '상태', '폰번호', '상세보기'],
        rows: [
            { name: '이상수', meta: '45세 남성', date: '12-05', status: '<span class="pill vip">VIP</span>', phone: '010-1234-5678' },
            { name: '김지영', meta: '42세 여성', date: '12-05', status: '<span class="pill general" style="background:#e2e8f0; color:#475569;">계약/유지</span>', phone: '010-9876-5432' }
        ]
    },
    'sangryung': {
        title: ' 상령일 도래 대상자 (5명)',
        headers: ['고객명', '성별/나이', '상령일 (D-Day)', '상태', '폰번호', '상세보기'],
        rows: [
            { name: '박도윤', meta: '15세 남성', date: '12-10 (D-5)', status: '<span class="pill pending">보류</span>', phone: '010-5555-7777' }
        ]
    },
    'expiry': {
        title: ' 보험 만기 대상자 (2명)',
        headers: ['고객명', '만기 임박 보험', '만기일 (D-Day)', '폰번호', '상세보기'],
        rows: [
            { name: '최민호', ins: '다이렉트 자동차보험 (DB손보)', date: '2026-10-01 (D-20)', phone: '010-1111-2222' }
        ]
    },
    'pipeline_1': {
        title: '‍ 관심 고객 (45명)',
        headers: ['고객명', '상태(단계)', '직업', '특이사항(메모)', '폰번호', '상세보기'],
        rows: [
            { name: '이영희', status: '<span class="pill pending">관심고객</span>', job: '프리랜서', memo: '인스타 보고 문의옴. 이번주 금 통화예약', phone: '010-1111-3333' }
        ]
    },
    'pipeline_2': {
        title: ' 상담/설계 중 (12명)',
        headers: ['고객명', '상태(단계)', '직업', '특이사항(메모)', '폰번호', '상세보기'],
        rows: [
            { name: '김철수', status: '<span class="pill general" style="background:#dcfce7; color:#166534;">상담/설계 중</span>', job: '자영업', memo: '암보험 리모델링 제안서 발송완료', phone: '010-2222-4444' }
        ]
    },
    'pipeline_3': {
        title: ' 계약/유지 고객 (840명)',
        headers: ['고객명', '상태(단계)', '직업', '특이사항(메모)', '폰번호', '상세보기'],
        rows: [
            { name: '이상수', status: '<span class="pill general" style="background:#e2e8f0; color:#475569;">계약/유지</span>', job: 'IT 개발자', memo: '가족계약 3건 우수고객', phone: '010-1234-5678' }
        ]
    },
    'pipeline_4': {
        title: ' 집중 케어 (8명)',
        headers: ['고객명', '상태(단계)', '직업', '특이사항(메모)', '폰번호', '상세보기'],
        rows: [
            { name: '박회장', status: '<span class="pill vip" style="background:#fef08a; color:#854d0e;">집중 케어</span>', job: '법인 대표', memo: '최근 수술 청구건 있음. 안부전화 요망', phone: '010-9999-9999' }
        ]
    },
    'touch_medical': {
        title: ' 의료 테마 관심고객',
        headers: ['고객명', '나이/성별', '직업', '테마 태그', '상태', '폰번호', '상세보기'],
        rows: [
            { name: '김지영', meta: '42세 여성', job: '디자이너', tag: '<span class="pill" style="background:#dbeafe; color:#1d4ed8;">의료 테마</span>', status: '<span class="pill general" style="background:#e2e8f0; color:#475569;">계약/유지</span>', phone: '010-9876-5432' }
        ]
    },
    'touch_life': {
        title: ' 라이프 테마 관심고객',
        headers: ['고객명', '나이/성별', '직업', '테마 태그', '상태', '폰번호', '상세보기'],
        rows: [
            { name: '최민호', meta: '35세 남성', job: '스타트업', tag: '<span class="pill" style="background:#d1fae5; color:#047857;">라이프 테마</span>', status: '<span class="pill pending">상담중</span>', phone: '010-5555-1111' }
        ]
    },
    'touch_health': {
        title: ' 건강 테마 관심고객',
        headers: ['고객명', '나이/성별', '직업', '테마 태그', '상태', '폰번호', '상세보기'],
        rows: [
            { name: '이상수', meta: '45세 남성', job: 'IT 개발자', tag: '<span class="pill" style="background:#ffe4e6; color:#be123c;">건강 테마</span>', status: '<span class="pill vip">VIP</span>', phone: '010-1234-5678' }
        ]
    }
};

function openModal(type) {
    if(!listModal || !dummyData[type]) return;
    const data = dummyData[type];
    listModalTitle.innerText = data.title;
    
    let thHtml = '<tr>';
    data.headers.forEach((h, i) => {
        if(i === data.headers.length - 1) thHtml += '<th style="text-align: right;">' + h + '</th>';
        else thHtml += '<th>' + h + '</th>';
    });
    thHtml += '</tr>';
    listTableHead.innerHTML = thHtml; listTableHead.style.cssText = 'position: sticky; top: 0; background: #f1f5f9; z-index: 10; box-shadow: 0 1px 3px rgba(0,0,0,0.1);';
    
    let tbHtml = '';
    data.rows.forEach(r => {
        tbHtml += '<tr>';
        tbHtml += '<td><div class="user-name">' + r.name + '</div></td>';
        if (type === 'birthday' || type === 'sangryung') {
            tbHtml += '<td><div class="user-email">' + r.meta + '</div></td>';
            tbHtml += '<td><div class="user-name" style="color:var(--primary);">' + r.date + '</div></td>';
            tbHtml += '<td>' + r.status + '</td>';
            tbHtml += '<td>' + r.phone + '</td>';
        } else if (type === 'expiry') {
            tbHtml += '<td><div class="user-name" style="color:#475569;">' + r.ins + '</div></td>';
            tbHtml += '<td><div class="user-name" style="color:var(--badge-red);">' + r.date + '</div></td>';
            tbHtml += '<td>' + r.phone + '</td>';
        } else if (type.startsWith('pipeline')) {
            tbHtml += '<td>' + r.status + '</td>';
            tbHtml += '<td>' + r.job + '</td>';
            tbHtml += '<td><div class="user-email" style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + r.memo + '</div></td>';
            tbHtml += '<td>' + r.phone + '</td>';
        } else if (type.startsWith('touch') || type === 'search_ins') {
            tbHtml += '<td><div class="user-email">' + r.meta + '</div></td>';
            tbHtml += '<td>' + r.job + '</td>';
            tbHtml += '<td>' + (r.tag ? r.tag : '') + '</td>';
            tbHtml += '<td>' + r.status + '</td>';
            tbHtml += '<td>' + r.phone + '</td>';
        }
        tbHtml += '<td style="text-align: right;"><button class="action-btn" onclick="closeModal(); openProfile();" title="상세보기"><i class="fa-solid fa-ellipsis"></i></button></td>';
        tbHtml += '</tr>';
    });
    listTableBody.innerHTML = tbHtml;
    
    listModal.classList.add('active'); listModal.style.display = 'flex';
}

function closeModal() { if(listModal) { listModal.classList.remove('active'); setTimeout(() => { listModal.style.display = 'none'; }, 300); } }
function openMasterModal() { if(masterModal) { masterModal.classList.add('active'); masterModal.style.display = 'flex'; masterModal.style.pointerEvents = 'auto'; } }
function closeMasterModal() { if(masterModal) { masterModal.classList.remove('active'); masterModal.style.display = 'none'; masterModal.style.pointerEvents = 'none'; } }
function openProfile() { if(profileModal) { profileModal.classList.add('active'); profileModal.style.display = 'flex'; profileModal.style.pointerEvents = 'auto'; } }
function closeProfile() { if(profileModal) { profileModal.classList.remove('active'); setTimeout(() => { profileModal.style.display = 'none'; }, 300); } }
function openEdit() { if(editModal) { editModal.classList.add('active'); editModal.style.display = 'flex'; editModal.style.pointerEvents = 'auto'; } }
function closeEdit() { if(editModal) { editModal.classList.remove('active'); setTimeout(() => { editModal.style.display = 'none'; }, 300); } }

document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        closeModal();
        closeMasterModal();
        openProfile();
    });
});

document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', (e) => {
        if (e.target === m) {
            m.classList.remove('active');
            m.style.display = 'none'; m.style.pointerEvents = 'none';
        }
    });
});

function toggleSubTags(id) {
    const el = document.getElementById(id);
    if(el) {
        el.classList.toggle('active');
    }
}

const lifeCompanies = ["한화생명","교보생명","농협생명","메트라이프","KDB생명","DB생명","흥국생명","동양생명","미래에셋생명","라이나생명","푸폰현대생명","신한라이프","ABL생명","IM라이프","KB라이프","IBK연금보험","처브라이프","카디프생명","하나생명","AIA생명"];
const nonlifeCompanies = ["삼성화재","메리츠화재","DB손해보험","KB손해보험","현대해상","한화손해보험","롯데손해보험","흥국화재","하나손해보험","NH농협손해보험","라이나손보","AIG손보","MG손해보험"];

function updateInsCompanies() {
    const type = document.getElementById('ins-type-select').value;
    const compSelect = document.getElementById('ins-comp-select');
    compSelect.innerHTML = '<option value="">회사명 선택</option>';
    
    let list = [];
    if(type === '생명') list = lifeCompanies;
    if(type === '손해') list = nonlifeCompanies;
    
    list.forEach(c => {
        compSelect.innerHTML += `<option value="`+c+`">`+c+`</option>`;
    });
}

function searchInsurance() {
    const comp = document.getElementById('ins-comp-select').value;
    if(!comp) {
        alert("회사명을 선택해주세요!");
        return;
    }
    
    dummyData['search_ins'] = {
        title: ' ' + comp + ' 가입고객 리스트',
        headers: ['고객명', '나이/성별', '가입상품(가설)', '테마 태그', '상태', '폰번호', '상세보기'],
        rows: [
            { name: '이상수', meta: '45세 남성', job: comp + ' 통합보험', status: '<span class="pill general" style="background:#e2e8f0; color:#475569;">유지중</span>', phone: '010-1234-5678', tag: '', memo: '' }
        ]
    };
    if(typeof window.openDynamicList === 'function') window.openDynamicList('insight', comp);
}

function switchEditTab(tabName) {
    document.querySelectorAll('.edit-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('#editTabs .tab-item').forEach(el => el.classList.remove('active'));
    const targetContent = document.getElementById('step-' + tabName);
    if(targetContent) targetContent.style.display = 'block';
    
    // Add active to the clicked element if event exists
    if(typeof event !== 'undefined' && event.currentTarget) {
        event.currentTarget.classList.add('active');
    } else {
        // Fallback if event is not available
        const tabs = {
            'basic': 0, 'insurance': 1, 'family': 2, 'medical': 3
        };
        const items = document.querySelectorAll('#editTabs .tab-item');
        if(items[tabs[tabName]]) items[tabs[tabName]].classList.add('active');
    }
}










