// ==========================================
// 위라클 대시보드 - 스마트 캘린더 & 핵심 비즈니스 로직 (dashboard.js)
// ==========================================

// ==========================================================================
// [설정 1] 영업 인사이트 유튜브 영상 목록 (Item 6-4, 9)
// 유튜브 영상 주소(https://www.youtube.com/watch?v=...) 또는 공유링크(https://youtu.be/...)를 
// 아래 목록에 자유롭게 추가/수정하시면 대시보드 우측 영상 슬라이더에서 즉시 재생됩니다.
// ==========================================================================
const SALES_INSIGHT_VIDEOS = [
  {
    title: "설계사 세일즈 화법 & 실전 클로징 노하우",
    subtitle: "고객의 거절을 극복하고 계약 체결로 이끄는 핵심 화법",
    url: "https://www.youtube.com/watch?v=ScMzIvxBSi4"
  },
  {
    title: "상령일 도래 고객 맞춤 보장분석 공략법",
    subtitle: "보험료 인상 전 골든타임 리모델링 성공 전략",
    url: "https://www.youtube.com/watch?v=ScMzIvxBSi4"
  },
  {
    title: "신계약 창출을 위한 고객 DB 터치 프로세스",
    subtitle: "기계약자 추가 업셀링 및 충성 고객 소개 유치 기법",
    url: "https://www.youtube.com/watch?v=ScMzIvxBSi4"
  }
];

// ==========================================================================
// [설정 2] 이달의 프로모션 배너 이미지 목록 (Item 6-3)
// 깃허브 또는 dashboard/images/ 경로에 promo_1.png ~ promo_5.png 이름으로 
// 이미지를 저장하시면 슬라이더에 자동으로 반영됩니다.
// ==========================================================================
const PROMO_IMAGES = [
  { title: "이달의 핵심 영업 시책 & 프로모션 1", src: "images/promo_1.png", link: "#" },
  { title: "본부 주요 공지사항 & 특별 캠페인 2", src: "images/promo_2.png", link: "#" },
  { title: "신상품 런칭 기념 특별 인센티브 3", src: "images/promo_3.png", link: "#" },
  { title: "우수 설계사(MDRT) 시상 규정 안내 4", src: "images/promo_4.png", link: "#" },
  { title: "월말 마감 전략 세미나 일정 5", src: "images/promo_5.png", link: "#" }
];

let currentPromoIdx = 0;
let currentVideoIdx = 0;


// --- SAFEGUARD V3 (미존재 요소 참조 에러 방지) ---
const originalGetElementById = document.getElementById.bind(document);
document.getElementById = function(id) {
  const el = originalGetElementById(id);
  if (!el) { return document.createElement('div'); }
  return el;
};

// --- 전역 상태 변수 ---
function getParentProp(prop) {
  try {
    if (window.parent && window.parent !== window) {
      return window.parent[prop];
    }
  } catch(e) {}
  return null;
}

const parentProfile = getParentProp('currentProfile');
let crmData = [];
let targetData = [];
let crmEventsList = [];   // 파싱된 모든 CRM 고객 이벤트 리스트
let agentEvents = [];     // 구글 캘린더에서 가져온 개인 일정 리스트
let currentCalDate = new Date(); // 현재 캘린더가 가리키는 기준일 (기본: 오늘)
let activeFilter = 'all'; // 'all', 'google', 'bday', 'sang', 'expiry', 'pay'
let calViewMode = localStorage.getItem('weracle_cal_view_mode') || 'vertical'; // 기본값: 세로형(vertical)
let currentMonthStr = new Date().toISOString().substring(0, 7);
let checkDataInterval = null;

// 구글 토큰 초기화 (메모리, 상위 프레임, 로컬스토리지 순차 탐색)
window.gToken = window.gToken || 
  (parentProfile && parentProfile.google_access_token) || 
  localStorage.getItem('google_access_token') || 
  '';

// ==========================================
// 1. 구글 연동 및 상태 UI 제어
// ==========================================
function updateGoogleStatusUI() {
  const btn = document.getElementById('btnGoogleStatus');
  const label = document.getElementById('googleStatusLabel');
  if (!btn || !label) return;

  if (window.gToken) {
    btn.className = 'google-sync-btn linked';
    label.innerText = '구글 연동됨 (새로고침)';
    btn.title = '구글 캘린더와 연결되어 있습니다. 클릭 시 최신 일정을 동기화합니다.';
  } else {
    btn.className = 'google-sync-btn unlinked';
    label.innerText = '구글 캘린더 연동하기';
    btn.title = '구글 계정과 연동하여 개인 일정을 캘린더에서 바로 확인하고 관리하세요.';
  }
}

function handleGoogleSyncClick() {
  if (window.gToken) {
    const label = document.getElementById('googleStatusLabel');
    if (label) label.innerText = '동기화 중...';
    fetchGoogleCalendarEvents().finally(() => {
      updateGoogleStatusUI();
    });
  } else {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'REQUEST_GOOGLE_LOGIN' }, '*');
    } else {
      alert("구글 연동을 위해 상위 플랫폼 로그인이 필요합니다.");
    }
  }
}

// ==========================================
// 2. 뷰 전환 & 주간 네비게이션 & 필터링
// ==========================================
function switchCalendarView(mode) {
  calViewMode = mode;
  localStorage.setItem('weracle_cal_view_mode', mode);

  const btnV = document.getElementById('btnViewVertical');
  const btnH = document.getElementById('btnViewHorizontal');
  if (btnV && btnH) {
    if (mode === 'vertical') {
      btnV.classList.add('active');
      btnH.classList.remove('active');
    } else {
      btnH.classList.add('active');
      btnV.classList.remove('active');
    }
  }

  renderV3Calendar();
}


// ==========================================================================
// [신규 기능] 명함링크 복사 & 연동 시트보기 & 포털 바로가기 (Items 3, 6-1, 6-2)
// ==========================================================================
function copyMyCardLink() {
  const profile = getParentProp('currentProfile') || window.currentProfile;
  const currentUser = getParentProp('currentUser') || window.currentUser;

  // 1. 도메인 추출 (배포 도메인 우선 적용)
  let baseDomain = window.location.origin;
  if (!baseDomain || baseDomain === 'null' || window.location.protocol === 'file:' || baseDomain.includes('localhost') || baseDomain.includes('127.0.0.1')) {
    baseDomain = 'https://weracle.kr';
  }

  // 2. 단축 슬러그(slug) 우선순위 추출 (디지털 명함 에디터와 100% 동일)
  let slug = '';
  if (profile && profile.card_slug && String(profile.card_slug).trim()) {
    slug = String(profile.card_slug).trim();
  }
  
  if (!slug) {
    try {
      const cp = localStorage.getItem('cached_profile');
      if (cp) {
        const p = JSON.parse(cp);
        if (p && p.card_slug && String(p.card_slug).trim()) {
          slug = String(p.card_slug).trim();
        }
      }
    } catch(e) {}
  }

  if (!slug) {
    try {
      const prev = localStorage.getItem('weracle_preview_card_data');
      if (prev) {
        const p = JSON.parse(prev);
        const s = p.card_slug || (p.card_data && p.card_data.card_slug);
        if (s && String(s).trim()) {
          slug = String(s).trim();
        }
      }
    } catch(e) {}
  }

  if (!slug && profile && profile.nickname) {
    slug = String(profile.nickname).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  }

  if (!slug && currentUser && currentUser.email) {
    slug = currentUser.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '');
  }

  if (!slug) {
    slug = 'my';
  }

  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'my';
  const shortCardUrl = `${baseDomain}/c/${cleanSlug}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shortCardUrl).then(() => {
      alert(`📋 모바일 디지털 명함 단축 링크가 복사되었습니다!\n\n${shortCardUrl}\n\n고객에게 카카오톡 또는 문자로 전달해 보세요.`);
    }).catch(() => {
      prompt('아래 명함 링크를 복사하여 전달하세요:', shortCardUrl);
    });
  } else {
    prompt('아래 명함 링크를 복사하여 전달하세요:', shortCardUrl);
  }
}

function openConnectedSheet() {
  const profile = getParentProp('currentProfile') || window.currentProfile;
  const sheetId = localStorage.getItem('g_sheet_id') || localStorage.getItem('user_spreadsheet_id') || (profile && profile.google_sheet_id);
  if (sheetId) {
    window.open(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`, '_blank');
  } else {
    if (confirm('현재 연결된 구글 시트 ID를 찾을 수 없습니다.\n고객관리(CRM) 페이지로 이동하여 시트를 연동하시겠습니까?')) {
      if (window.parent && typeof window.parent.loadSubPage === 'function') {
        window.parent.loadSubPage('고객관리', '고객관리', 'crm/crm_test.html');
      } else {
        window.open('https://docs.google.com/spreadsheets/', '_blank');
      }
    }
  }
}

function openClaimPage() {
  if (window.parent && typeof window.parent.loadSubPage === 'function') {
    window.parent.loadSubPage('고객관리', '보험금 청구', 'claim/claim.html');
  } else {
    window.location.href = '../claim/claim.html';
  }
}

function openAnalysisPage() {
  if (window.parent && typeof window.parent.loadSubPage === 'function') {
    window.parent.loadSubPage('영업전략', '보장 브랜딩', 'branding/pdf_p.html');
  } else {
    window.location.href = '../branding/pdf_p.html';
  }
}

function openInsurerContacts() {
  openInsurerContactsModal();
}

// -------------------------------------------------------------
// 프로모션 슬라이더 제어 (Item 6-3)
// -------------------------------------------------------------
function renderPromoSlide() {
  const area = document.getElementById('promoSliderArea');
  const counter = document.getElementById('promoSlideCounter');
  if (!area) return;

  const item = PROMO_IMAGES[currentPromoIdx] || PROMO_IMAGES[0];
  if (counter) counter.innerText = `${currentPromoIdx + 1} / ${PROMO_IMAGES.length}`;

  area.innerHTML = `
    <div style="width:100%; height:100%; position:relative; cursor:pointer;" onclick="${item.link && item.link !== '#' ? `window.open('${item.link}', '_blank')` : ''}">
      <img src="${item.src}" alt="${item.title}" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\\'promo-placeholder\\\'><div style=\\\'font-size:26px;\\\'>📢</div><div class=\\\'promo-placeholder-title\\\'>${escapeHtml(item.title)}</div><div class=\\\'promo-placeholder-desc\\\'>지점 및 본부 주요 시책 & 공지사항 (${currentPromoIdx + 1}/${PROMO_IMAGES.length})</div><div style=\\\'font-size:11px; color:#0284c7; font-weight:600;\\\'>이미지 파일: ${item.src}</div></div>';" style="width:100%; height:100%; object-fit:cover; border-radius:10px;">
    </div>
  `;
}

function prevPromoSlide() {
  currentPromoIdx = (currentPromoIdx - 1 + PROMO_IMAGES.length) % PROMO_IMAGES.length;
  renderPromoSlide();
}

function nextPromoSlide() {
  currentPromoIdx = (currentPromoIdx + 1) % PROMO_IMAGES.length;
  renderPromoSlide();
}

// -------------------------------------------------------------
// 영업 인사이트 영상 슬라이더 제어 (Item 6-4, 9)
// -------------------------------------------------------------
function getYouTubeEmbedUrl(url) {
  if (!url) return '';
  let videoId = '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    videoId = match[2];
  } else if (url.length === 11) {
    videoId = url;
  }
  return videoId ? `https://www.youtube.com/embed/${videoId}?rel=0` : url;
}

function renderVideoSlide() {
  const area = document.getElementById('videoSliderArea');
  const counter = document.getElementById('videoSlideCounter');
  if (!area) return;

  const item = SALES_INSIGHT_VIDEOS[currentVideoIdx] || SALES_INSIGHT_VIDEOS[0];
  if (counter) counter.innerText = `${currentVideoIdx + 1} / ${SALES_INSIGHT_VIDEOS.length}`;

  const embedUrl = getYouTubeEmbedUrl(item.url);

  area.innerHTML = `
    <div class="video-frame-container">
      <iframe src="${embedUrl}" title="${escapeHtml(item.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
    </div>
    <div class="video-info-box">
      <div class="video-info-title">${escapeHtml(item.title)}</div>
      <div class="video-info-sub">${escapeHtml(item.subtitle || item.desc || '')}</div>
    </div>
  `;
}

function prevVideoSlide() {
  currentVideoIdx = (currentVideoIdx - 1 + SALES_INSIGHT_VIDEOS.length) % SALES_INSIGHT_VIDEOS.length;
  renderVideoSlide();
}

function nextVideoSlide() {
  currentVideoIdx = (currentVideoIdx + 1) % SALES_INSIGHT_VIDEOS.length;
  renderVideoSlide();
}

// 전역 window 바인딩 (onclick 완벽 작동 보장)
window.copyMyCardLink = copyMyCardLink;
window.openConnectedSheet = openConnectedSheet;
window.openClaimPage = openClaimPage;
window.openAnalysisPage = openAnalysisPage;
window.openInsurerContacts = openInsurerContacts;
window.prevPromoSlide = prevPromoSlide;
window.nextPromoSlide = nextPromoSlide;
window.prevVideoSlide = prevVideoSlide;
window.nextVideoSlide = nextVideoSlide;
window.renderPromoSlide = renderPromoSlide;
window.renderVideoSlide = renderVideoSlide;

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0: 일요일, 1: 월요일 ...
  const diff = d.getDate() - day; // 일요일을 주의 첫날로 맞춤
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function navigateWeek(offset) {
  if (calViewMode === 'horizontal') {
    // 가로형 월간 뷰일 때는 1달 단위로 이전/다음 달 이동 (Item 5)
    currentCalDate.setMonth(currentCalDate.getMonth() + offset);
  } else {
    // 세로형 주간 뷰일 때는 1주일 단위로 이동
    currentCalDate.setDate(currentCalDate.getDate() + (offset * 7));
  }
  renderV3Calendar();
  fetchGoogleCalendarEvents();
}

function navigateToday() {
  currentCalDate = new Date();
  renderV3Calendar();
  fetchGoogleCalendarEvents();
}

function setCalendarFilter(filterType) {
  activeFilter = filterType;
  document.querySelectorAll('.cal-filter-chip').forEach(chip => {
    if (chip.getAttribute('data-filter') === filterType) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
  renderV3Calendar();
}

// ==========================================
// 3. CRM 고객 데이터 분석 엔진 (생일, 상령일, 갱신, 결제일)
// ==========================================
function parseClientBirthday(client) {
  const jumin = (client['주민번호'] || client['주민등록번호'] || '').toString().trim();
  if (jumin.length >= 6) {
    const raw = jumin.replace(/[^0-9]/g, '');
    if (raw.length >= 6) {
      const mm = parseInt(raw.substring(2, 4), 10);
      const dd = parseInt(raw.substring(4, 6), 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        return { month: mm, day: dd };
      }
    }
  }
  const birthStr = (client['생년월일'] || client['생일'] || '').toString().trim();
  if (birthStr) {
    const parts = birthStr.split(/[-./]/);
    if (parts.length >= 3) {
      const mm = parseInt(parts[1], 10);
      const dd = parseInt(parts[2], 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        return { month: mm, day: dd };
      }
    }
    const rawNum = birthStr.replace(/[^0-9]/g, '');
    if (rawNum.length === 8) {
      const mm = parseInt(rawNum.substring(4, 6), 10);
      const dd = parseInt(rawNum.substring(6, 8), 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return { month: mm, day: dd };
    } else if (rawNum.length === 6) {
      const mm = parseInt(rawNum.substring(2, 4), 10);
      const dd = parseInt(rawNum.substring(4, 6), 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return { month: mm, day: dd };
    }
  }
  return null;
}

function analyzeCrmData() {
  if (!crmData || crmData.length === 0) return;
  crmEventsList = [];
  const crmEventSeenKeys = new Set();

  const thisYear = currentCalDate.getFullYear();

  crmData.forEach(client => {
    const name = client['고객명'] || client['성명'] || client['대표자명'] || client['상호명'] || '고객';
    const phone = client['연락처'] || client['폰번호'] || client['휴대폰'] || '';
    const mainProd = client['상품명'] || client['보험사'] || '보험계약';

    // 1) 생일 (Birthday)
    const bday = parseClientBirthday(client);
    if (bday) {
      [-1, 0, 1].forEach(yearOffset => {
        const y = thisYear + yearOffset;
        const mm = String(bday.month).padStart(2, '0');
        const dd = String(bday.day).padStart(2, '0');
        const dateStr = `${y}-${mm}-${dd}`;
        const key = `bday_${dateStr}_${name}_${phone}`;
        if (!crmEventSeenKeys.has(key)) {
          crmEventSeenKeys.add(key);
          crmEventsList.push({
            type: 'bday',
            name: name,
            phone: phone,
            prod: mainProd,
            fullDate: dateStr,
            title: `🎂 [생일] ${name}`,
            note: `${name} 고객님의 생일입니다. 따뜻한 축하 인사와 안부 전화를 건네보세요!`
          });
        }
      });

      // 2) 상령일 (Insurance Age Increase Date: 생년월일 + 6개월)
      let sangMonth = bday.month + 6;
      let sangYearOffset = 0;
      if (sangMonth > 12) {
        sangMonth -= 12;
        sangYearOffset = 1;
      }
      [-1, 0, 1].forEach(yearOffset => {
        const y = thisYear + yearOffset + sangYearOffset;
        const lastDay = new Date(y, sangMonth, 0).getDate();
        const safeDay = Math.min(bday.day, lastDay);
        const mm = String(sangMonth).padStart(2, '0');
        const dd = String(safeDay).padStart(2, '0');
        const dateStr = `${y}-${mm}-${dd}`;
        const key = `sang_${dateStr}_${name}_${phone}`;
        if (!crmEventSeenKeys.has(key)) {
          crmEventSeenKeys.add(key);
          crmEventsList.push({
            type: 'sang',
            name: name,
            phone: phone,
            prod: mainProd,
            fullDate: dateStr,
            title: `📈 [상령일] ${name}`,
            note: `상령일 도래: 보험나이가 1세 증가하기 직전입니다. 보험료 인상 전 맞춤 보장 리모델링을 제안하세요!`
          });
        }
      });
    }

    // 3) 계약 만기 및 갱신일, 결제일 파싱 (단일 소스 수집 + 중복 방지)
    // 보험가입리스트가 존재하면 최우선 단일 소스로 사용하고, 없으면 가입내역 JSON 파싱
    let insList = [];
    if (Array.isArray(client['보험가입리스트']) && client['보험가입리스트'].length > 0) {
      insList = client['보험가입리스트'];
    } else {
      const rawIns = client['가입내역'] || client['보험가입내역'] || client['insurance'];
      if (rawIns) {
        if (Array.isArray(rawIns)) {
          insList = rawIns;
        } else if (typeof rawIns === 'string' && (rawIns.trim().startsWith('[') || rawIns.trim().startsWith('{'))) {
          try {
            const parsed = JSON.parse(rawIns);
            if (Array.isArray(parsed)) insList = parsed;
            else if (typeof parsed === 'object') insList = [parsed];
          } catch(e) {}
        }
      }
    }

    if (insList.length > 0) {
      insList.forEach(ins => {
        const prodName = ins['상품명'] || ins['보험사명'] || ins['보험종류'] || mainProd;
        extractContractEvents(ins, name, phone, prodName, thisYear, crmEventSeenKeys);
      });
    } else {
      // 별도 보험 리스트가 없는 단일 계약일 때만 고객 루트 필드에서 1회 추출
      extractContractEvents(client, name, phone, mainProd, thisYear, crmEventSeenKeys);
    }
  });

  renderV3Calendar();
}

function extractContractEvents(item, name, phone, prod, thisYear, crmEventSeenKeys) {
  if (!item) return;

  // 계약자가 명시되어 있고 고객명과 다른 경우(피보험자 보장내역 미러링 뷰 등)
  const contractor = (item['계약자'] || item['계약자명'] || '').toString().trim();
  const isDifferentContractor = contractor && contractor !== name;

  // 만기일 / 갱신일 (피보험자와 계약자 모두에게 만기 도래 알림 유효)
  const rDateStr = (item['갱신일'] || item['만기일'] || item['자동차_만기일'] || '').toString().trim();
  if (rDateStr) {
    let rawNums = rDateStr.replace(/[^0-9]/g, '');
    let cleanDate = '';
    if (rawNums.length >= 8) {
      cleanDate = `${rawNums.substring(0, 4)}-${rawNums.substring(4, 6)}-${rawNums.substring(6, 8)}`;
    } else if (rawNums.length === 4) {
      cleanDate = `${rawNums.substring(0, 2)}-${rawNums.substring(2, 4)}`;
    } else {
      cleanDate = rDateStr.split('T')[0].replace(/\s+/g, '').replace(/[\.\/]/g, '-');
    }

    if (cleanDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const key = `expiry_${cleanDate}_${name}_${prod}`;
      if (!crmEventSeenKeys || !crmEventSeenKeys.has(key)) {
        if (crmEventSeenKeys) crmEventSeenKeys.add(key);
        crmEventsList.push({
          type: 'expiry',
          name: name,
          phone: phone,
          prod: prod,
          fullDate: cleanDate,
          title: `📑 [만기·갱신] ${name}`,
          note: `${name} 고객님의 계약(${prod}) 만기/갱신일입니다. 사전 연장 및 만기 환급금 상담을 진행하세요.`
        });
      }
    } else if (cleanDate.match(/^\d{2}-\d{2}$/)) {
      [-1, 0, 1].forEach(yearOffset => {
        const fullDate = `${thisYear + yearOffset}-${cleanDate}`;
        const key = `expiry_${fullDate}_${name}_${prod}`;
        if (!crmEventSeenKeys || !crmEventSeenKeys.has(key)) {
          if (crmEventSeenKeys) crmEventSeenKeys.add(key);
          crmEventsList.push({
            type: 'expiry',
            name: name,
            phone: phone,
            prod: prod,
            fullDate: fullDate,
            title: `📑 [만기·갱신] ${name}`,
            note: `${name} 고객님의 계약(${prod}) 만기/갱신일입니다. 사전 연장 및 만기 환급금 상담을 진행하세요.`
          });
        }
      });
    }
  }

  // 보험료 결제일 (Payment Day - 계약자 본인 기준 생성, 피보험자에게는 결제 알림 중복 생성 안 함)
  if (isDifferentContractor) {
    return;
  }

  const payDayRaw = item['결제일'] || item['납입일'] || '';
  const payDay = parseInt(payDayRaw.toString().replace(/[^0-9]/g, ''), 10);
  if (payDay && payDay >= 1 && payDay <= 31) {
    for (let mOffset = -2; mOffset <= 2; mOffset++) {
      let targetD = new Date(thisYear, currentCalDate.getMonth() + mOffset, 1);
      const y = targetD.getFullYear();
      const m = targetD.getMonth() + 1;
      const lastDayOfMonth = new Date(y, m, 0).getDate();
      const actualDay = Math.min(payDay, lastDayOfMonth);
      const fullDateStr = `${y}-${String(m).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;
      
      const key = `pay_${fullDateStr}_${name}_${prod}_${payDay}`;
      if (!crmEventSeenKeys || !crmEventSeenKeys.has(key)) {
        if (crmEventSeenKeys) crmEventSeenKeys.add(key);
        crmEventsList.push({
          type: 'pay',
          name: name,
          phone: phone,
          prod: prod,
          fullDate: fullDateStr,
          title: `💳 [결제] ${name}`,
          note: `${name} 고객님의 정기 보험료 결제일(${payDay}일)입니다. 통장 잔고 및 정상 출금 여부를 체크하세요.`
        });
      }
    }
  }
}

// ==========================================
// 4. 통합 스마트 캘린더 렌더링 (세로형 기본 / 가로형 지원)
// ==========================================
function renderV3Calendar() {
  const grid = document.getElementById("dashboardCalendarGrid");
  const headerRow = document.getElementById("calHeaderRow");
  const periodText = document.getElementById("cal-period-text");
  if (!grid) return;

  grid.innerHTML = "";

  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const todayStr = new Date().toISOString().split('T')[0];

  // ----------------------------------------------------
  // [A] 세로 타임라인 뷰 (Vertical Agenda - 주간 7일)
  // ----------------------------------------------------
  if (calViewMode === 'vertical') {
    if (headerRow) headerRow.style.display = 'none';
    grid.className = 'cal-vertical-timeline';

    const startOfWeek = getStartOfWeek(currentCalDate);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    // 헤더 기간 텍스트
    const sm = startOfWeek.getMonth() + 1;
    const em = endOfWeek.getMonth() + 1;
    if (periodText) {
      if (sm === em) {
        periodText.innerText = `${startOfWeek.getFullYear()}. ${String(sm).padStart(2, "0")} (${startOfWeek.getDate()}일 ~ ${endOfWeek.getDate()}일)`;
      } else {
        periodText.innerText = `${startOfWeek.getFullYear()}. ${String(sm).padStart(2, "0")}.${startOfWeek.getDate()} ~ ${String(em).padStart(2, "0")}.${endOfWeek.getDate()}`;
      }
    }

    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      let d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      weekDates.push(`${y}-${m}-${day}`);
    }

    // 주간 필터 카운트
    updateFilterCounts(weekDates);

    for (let i = 0; i < 7; i++) {
      const fullDateStr = weekDates[i];
      const dDate = new Date(startOfWeek);
      dDate.setDate(dDate.getDate() + i);
      const dd = dDate.getDate();
      const mm = dDate.getMonth() + 1;
      const dayIdx = dDate.getDay();
      const isToday = (fullDateStr === todayStr);

      const dayGoogleEvents = agentEvents.filter(e => e.fullDate === fullDateStr);
      const dayCrmEvents = crmEventsList.filter(e => e.fullDate === fullDateStr);

      let dayEvents = [];

      if (activeFilter === 'all' || activeFilter === 'google') {
        dayEvents.push(...dayGoogleEvents.map(e => ({
          isGoogle: true,
          id: e.id,
          badge: e.timeText || (e.isAllDay ? '종일' : '구글'),
          title: e.name,
          sub: e.description || '',
          raw: e
        })));
      }

      if (activeFilter === 'all') {
        dayEvents.push(...dayCrmEvents.map(e => ({
          isGoogle: false,
          type: e.type,
          badge: getCrmBadgeText(e.type),
          title: `${e.name} 고객님`,
          sub: e.prod ? `(${e.prod})` : '',
          raw: e
        })));
      } else if (activeFilter !== 'google') {
        const filteredCrm = dayCrmEvents.filter(e => e.type === activeFilter);
        dayEvents.push(...filteredCrm.map(e => ({
          isGoogle: false,
          type: e.type,
          badge: getCrmBadgeText(e.type),
          title: `${e.name} 고객님`,
          sub: e.prod ? `(${e.prod})` : '',
          raw: e
        })));
      }

      let eventsHtml = "";
      if (dayEvents.length > 0) {
        eventsHtml = dayEvents.map(item => {
          if (item.isGoogle) {
            const e = item.raw;
            return `
              <div class="cal-v-event-item google" onclick="openGoogleEventDetail('${e.id}')">
                <div class="cal-v-event-info">
                  <span class="cal-v-event-badge google"><i class="fa-regular fa-clock"></i> ${escapeHtml(item.badge)}</span>
                  <span class="cal-v-event-title">${escapeHtml(item.title)}</span>
                  ${item.sub ? `<span class="cal-v-event-sub">${escapeHtml(item.sub)}</span>` : ''}
                </div>
                <div class="cal-v-event-actions">
                  <button type="button" class="cal-v-action-btn" onclick="event.stopPropagation(); openGoogleEventDetail('${e.id}')">
                    <i class="fa-solid fa-pen-to-square"></i> 상세/삭제
                  </button>
                </div>
              </div>`;
          } else {
            const e = item.raw;
            return `
              <div class="cal-v-event-item ${e.type}" onclick="openCrmEventDetail('${e.type}', '${escapeJs(e.name)}', '${escapeJs(e.phone)}', '${escapeJs(e.prod)}', '${escapeJs(e.note)}', '${fullDateStr}')">
                <div class="cal-v-event-info">
                  <span class="cal-v-event-badge ${e.type}">${escapeHtml(item.badge)}</span>
                  <span class="cal-v-event-title">${escapeHtml(item.title)}</span>
                  ${item.sub ? `<span class="cal-v-event-sub">${escapeHtml(item.sub)}</span>` : ''}
                </div>
                <div class="cal-v-event-actions">
                  ${e.phone ? `
                    <a href="tel:${e.phone}" class="cal-v-action-btn" onclick="event.stopPropagation()" title="전화걸기">
                      <i class="fa-solid fa-phone" style="color:#10b981;"></i> 통화
                    </a>
                    <a href="sms:${e.phone}" class="cal-v-action-btn" onclick="event.stopPropagation()" title="문자보내기">
                      <i class="fa-solid fa-comment-sms" style="color:#0ea5e9;"></i> 문자
                    </a>
                  ` : ''}
                  <button type="button" class="cal-v-action-btn" onclick="event.stopPropagation(); openCrmEventDetail('${e.type}', '${escapeJs(e.name)}', '${escapeJs(e.phone)}', '${escapeJs(e.prod)}', '${escapeJs(e.note)}', '${fullDateStr}')">
                    가이드
                  </button>
                </div>
              </div>`;
          }
        }).join('');
      } else {
        eventsHtml = `
          <div class="cal-v-empty-day">
            <span>등록된 일정이 없습니다.</span>
            <button type="button" class="cal-v-quick-add-btn" onclick="openScheduleModalForDate('${fullDateStr}')">
              <i class="fa-solid fa-plus"></i> 이 날에 일정 추가
            </button>
          </div>`;
      }

      const dayCard = document.createElement("div");
      dayCard.className = `cal-timeline-day-card${isToday ? ' is-today' : ''}`;
      dayCard.innerHTML = `
        <div class="cal-day-left-badge">
          <div class="cal-day-date-number">${dd}</div>
          <div class="cal-day-weekday-text">${mm}.${dd} (${dayNames[dayIdx]})</div>
          ${isToday ? '<span class="cal-today-pill">오늘</span>' : ''}
        </div>
        <div class="cal-day-right-content">${eventsHtml}</div>
      `;
      grid.appendChild(dayCard);
    }
  } 
  // ----------------------------------------------------
  // [B] 가로형 달력 뷰 (월 일정 전체가 보이는 월간 7열 그리드 달력 - Item 5)
  // ----------------------------------------------------
  else {
    if (headerRow) {
      headerRow.style.display = 'grid';
      headerRow.style.gridTemplateColumns = 'repeat(7, minmax(0, 1fr))';
      headerRow.style.gap = '6px';
      headerRow.style.width = '100%';
      const colDays = ["일", "월", "화", "수", "목", "금", "토"];
      headerRow.innerHTML = colDays.map((name, i) => {
        const color = i === 0 ? "var(--danger)" : (i === 6 ? "var(--primary)" : "var(--text-muted)");
        return `<div style="color:${color}; font-weight:800; font-size:12px; text-align:center; padding:6px 0; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0;">${name}</div>`;
      }).join('');
    }
    grid.className = 'cal-grid-monthly';

    const curYear = currentCalDate.getFullYear();
    const curMonth = currentCalDate.getMonth(); // 0-based

    if (periodText) {
      periodText.innerText = `${curYear}. ${String(curMonth + 1).padStart(2, "0")}월 전체 일정`;
    }

    // 당월의 1일 및 마지막 일자
    const firstDayObj = new Date(curYear, curMonth, 1);
    const lastDayObj = new Date(curYear, curMonth + 1, 0);
    const firstDayOfWeek = firstDayObj.getDay(); // 0(일) ~ 6(토)
    const daysInMonth = lastDayObj.getDate();

    // 월간 달력 전체 일자 생성 (이전 달 꼬리 + 당월 + 다음 달 머리 = 7의 배수)
    const monthCalendarDates = [];

    // 이전 달 꼬리
    const prevMonthLastDay = new Date(curYear, curMonth, 0).getDate();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const dNum = prevMonthLastDay - i;
      const prevD = new Date(curYear, curMonth - 1, dNum);
      monthCalendarDates.push({
        dateObj: prevD,
        dateNum: dNum,
        fullDateStr: formatYMD(prevD),
        isCurrentMonth: false
      });
    }

    // 당월 일자
    for (let d = 1; d <= daysInMonth; d++) {
      const thisD = new Date(curYear, curMonth, d);
      monthCalendarDates.push({
        dateObj: thisD,
        dateNum: d,
        fullDateStr: formatYMD(thisD),
        isCurrentMonth: true
      });
    }

    // 다음 달 머리
    const remainingCells = (7 - (monthCalendarDates.length % 7)) % 7;
    for (let d = 1; d <= remainingCells; d++) {
      const nextD = new Date(curYear, curMonth + 1, d);
      monthCalendarDates.push({
        dateObj: nextD,
        dateNum: d,
        fullDateStr: formatYMD(nextD),
        isCurrentMonth: false
      });
    }

    // 월간 전체 일자에 대한 필터 카운트 업데이트
    const allFullDates = monthCalendarDates.map(c => c.fullDateStr);
    updateFilterCounts(allFullDates);

    // 각 셀 렌더링
    monthCalendarDates.forEach(cellData => {
      const { fullDateStr, dateNum, isCurrentMonth } = cellData;
      const isToday = (fullDateStr === todayStr);

      const dayGoogleEvents = agentEvents.filter(e => e.fullDate === fullDateStr);
      const dayCrmEvents = crmEventsList.filter(e => e.fullDate === fullDateStr);

      let displayEvents = [];
      if (activeFilter === 'all' || activeFilter === 'google') {
        displayEvents.push(...dayGoogleEvents.map(e => ({
          isGoogle: true,
          id: e.id,
          title: (e.timeText ? `[${e.timeText}] ` : '') + e.name,
          raw: e
        })));
      }
      if (activeFilter === 'all') {
        displayEvents.push(...dayCrmEvents.map(e => ({ isGoogle: false, type: e.type, title: e.title, raw: e })));
      } else if (activeFilter !== 'google') {
        const filteredCrm = dayCrmEvents.filter(e => e.type === activeFilter);
        displayEvents.push(...filteredCrm.map(e => ({ isGoogle: false, type: e.type, title: e.title, raw: e })));
      }

      let eventsHtml = "";
      const maxShow = 3;
      if (displayEvents.length > 0) {
        eventsHtml = displayEvents.slice(0, maxShow).map(item => {
          if (item.isGoogle) {
            const e = item.raw;
            return `<div class="cal-event-chip cal-event-google" onclick="openGoogleEventDetail('${e.id}')" title="클릭하여 상세 보기">
              <i class="fa-solid fa-clock" style="font-size:9px;"></i>
              <span>${escapeHtml(item.title)}</span>
            </div>`;
          } else {
            const e = item.raw;
            return `<div class="cal-event-chip cal-event-${e.type}" onclick="openCrmEventDetail('${e.type}', '${escapeJs(e.name)}', '${escapeJs(e.phone)}', '${escapeJs(e.prod)}', '${escapeJs(e.note)}', '${fullDateStr}')" title="클릭하여 세일즈 가이드 확인">
              <span>${escapeHtml(item.title)}</span>
            </div>`;
          }
        }).join('');

        if (displayEvents.length > maxShow) {
          eventsHtml += `<div class="cal-event-more" title="전체 일정 보기">+ ${displayEvents.length - maxShow}개 더보기</div>`;
        }
      }

      const cell = document.createElement("div");
      cell.className = `cal-cell-monthly${isToday ? ' is-today' : ''}${!isCurrentMonth ? ' other-month' : ''}`;
      cell.style.cursor = 'pointer';
      cell.title = '클릭하여 이 날의 전체 일정 보기';
      cell.innerHTML = `
        <div class="cal-cell-monthly-head">
          <span class="cal-monthly-num">${dateNum}</span>
          ${isToday ? '<span class="cal-today-pill" style="font-size:9px; padding:1px 4px;">오늘</span>' : ''}
        </div>
        <div class="cal-monthly-events">${eventsHtml}</div>
      `;
      cell.onclick = () => {
        openDayDetailModal(fullDateStr);
      };
      grid.appendChild(cell);
    });
  }
}

function formatYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function updateFilterCounts(dateList) {
  const counts = { all: 0, google: 0, bday: 0, sang: 0, expiry: 0, pay: 0 };
  agentEvents.forEach(e => {
    if (dateList.includes(e.fullDate)) {
      counts.google++;
      counts.all++;
    }
  });
  crmEventsList.forEach(e => {
    if (dateList.includes(e.fullDate)) {
      if (counts[e.type] !== undefined) counts[e.type]++;
      counts.all++;
    }
  });

  const countAllEl = document.getElementById('count-all'); if (countAllEl) countAllEl.innerText = counts.all;
  const countGoogleEl = document.getElementById('count-google'); if (countGoogleEl) countGoogleEl.innerText = counts.google;
  const countBdayEl = document.getElementById('count-bday'); if (countBdayEl) countBdayEl.innerText = counts.bday;
  const countSangEl = document.getElementById('count-sang'); if (countSangEl) countSangEl.innerText = counts.sang;
  const countExpiryEl = document.getElementById('count-expiry'); if (countExpiryEl) countExpiryEl.innerText = counts.expiry;
  const countPayEl = document.getElementById('count-pay'); if (countPayEl) countPayEl.innerText = counts.pay;
}

function getCrmBadgeText(type) {
  if (type === 'sang') return ' 상령일';
  if (type === 'bday') return ' 생일';
  if (type === 'expiry') return ' 만기·갱신';
  if (type === 'pay') return ' 결제일';
  return '고객';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeJs(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ==========================================
// 5. 구글 캘린더 REST API CRUD (조회 / 등록 / 삭제)
// ==========================================
async function fetchGoogleCalendarEvents() {
  if (!window.gToken) {
    updateGoogleStatusUI();
    return;
  }

  try {
    const startOfWeek = getStartOfWeek(currentCalDate);
    const timeMin = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() - 1).toISOString();
    const timeMax = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 9).toISOString();

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
    
    const res = await fetch(url, {
      headers: { "Authorization": "Bearer " + window.gToken }
    });

    if (res.status === 401) {
      console.warn("구글 토큰이 만료되었습니다.");
      window.gToken = '';
      localStorage.removeItem('google_access_token');
      updateGoogleStatusUI();
      return;
    }

    if (!res.ok) throw new Error(`Google Calendar API 응답 실패 (${res.status})`);

    const data = await res.json();
    agentEvents = (data.items || []).map(e => {
      const startStr = (e.start && (e.start.dateTime || e.start.date)) || '';
      const isAllDay = !e.start || !e.start.dateTime;
      const fullDate = startStr.split('T')[0];
      let timeText = "";
      if (!isAllDay && startStr.includes('T')) {
        timeText = startStr.split('T')[1].substring(0, 5);
      }
      return {
        id: e.id,
        name: e.summary || '(제목 없음)',
        description: e.description || '',
        startStr: startStr,
        fullDate: fullDate,
        timeText: timeText,
        isAllDay: isAllDay,
        htmlLink: e.htmlLink || '',
        isAgent: true
      };
    });

    updateGoogleStatusUI();
    renderV3Calendar();
  } catch (err) {
    console.error("구글 캘린더 일정 가져오기 실패:", err);
  }
}

function openScheduleModal() {
  openScheduleModalForDate(new Date().toISOString().split('T')[0]);
}

function openScheduleModalForDate(dateStr) {
  const schDateEl = document.getElementById('schDate');
  const schTitleEl = document.getElementById('schTitle');
  const schMemoEl = document.getElementById('schMemo');
  const schAllDayEl = document.getElementById('schAllDay');
  const schTimeEl = document.getElementById('schTime');

  if (schTitleEl) schTitleEl.value = '';
  if (schDateEl) schDateEl.value = dateStr || new Date().toISOString().split('T')[0];
  if (schTimeEl) {
    schTimeEl.value = '09:00';
    schTimeEl.disabled = false;
  }
  if (schMemoEl) schMemoEl.value = '';
  if (schAllDayEl) schAllDayEl.checked = false;

  const modal = document.getElementById('scheduleModal');
  if (modal) modal.style.display = 'flex';
}

function closeScheduleModal() {
  const modal = document.getElementById('scheduleModal');
  if (modal) modal.style.display = 'none';
}

async function saveGoogleCalendarEvent() {
  if (!window.gToken) {
    alert("구글 로그인이 필요합니다. 먼저 [구글 캘린더 연동하기]를 클릭해주세요.");
    return;
  }

  const title = (document.getElementById('schTitle').value || '').trim();
  const date = document.getElementById('schDate').value;
  const time = document.getElementById('schTime').value || '09:00';
  const memo = (document.getElementById('schMemo').value || '').trim();
  const isAllDay = document.getElementById('schAllDay').checked;

  if (!title) return alert("일정 제목을 입력해주세요.");
  if (!date) return alert("날짜를 선택해주세요.");

  const saveBtn = document.getElementById('btnSaveSchedule');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerText = '저장 중...';
  }

  let eventPayload = {
    summary: title,
    description: memo
  };

  if (isAllDay) {
    eventPayload.start = { date: date };
    const nextDateObj = new Date(date);
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    eventPayload.end = { date: nextDateObj.toISOString().split('T')[0] };
  } else {
    const startDateTime = new Date(`${date}T${time}:00`).toISOString();
    const endDateTime = new Date(new Date(startDateTime).getTime() + 60 * 60 * 1000).toISOString();
    eventPayload.start = { dateTime: startDateTime, timeZone: 'Asia/Seoul' };
    eventPayload.end = { dateTime: endDateTime, timeZone: 'Asia/Seoul' };
  }

  try {
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + window.gToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(eventPayload)
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error?.message || "등록 실패");
    }

    closeScheduleModal();
    alert("구글 캘린더에 일정이 성공적으로 등록되었습니다!");
    await fetchGoogleCalendarEvents();
  } catch (err) {
    alert("일정 저장 중 오류가 발생했습니다: " + err.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> 구글 캘린더에 저장';
    }
  }
}

function openGoogleEventDetail(eventId) {
  const ev = agentEvents.find(e => e.id === eventId);
  if (!ev) return;

  document.getElementById('viewEventId').value = ev.id;
  document.getElementById('viewEventTitle').innerText = ev.name;

  let timeDesc = ev.fullDate;
  if (ev.isAllDay) {
    timeDesc += " (종일)";
  } else if (ev.timeText) {
    timeDesc += ` ${ev.timeText}`;
  }
  document.getElementById('viewEventDateTime').innerText = timeDesc;
  document.getElementById('viewEventMemo').innerText = ev.description || "(메모 없음)";

  const modal = document.getElementById('googleEventModal');
  if (modal) modal.style.display = 'flex';
}

function closeGoogleEventModal() {
  const modal = document.getElementById('googleEventModal');
  if (modal) modal.style.display = 'none';
}

async function executeDeleteGoogleEvent() {
  const eventId = document.getElementById('viewEventId').value;
  if (!eventId) return;

  if (!window.gToken) {
    alert("구글 로그인이 필요합니다.");
    return;
  }

  if (!confirm("정말 이 일정을 구글 캘린더에서 삭제하시겠습니까?")) return;

  const delBtn = document.getElementById('btnDeleteGoogleEvent');
  if (delBtn) {
    delBtn.disabled = true;
    delBtn.innerText = '삭제 중...';
  }

  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: { "Authorization": "Bearer " + window.gToken }
    });

    if (res.status === 204 || res.ok) {
      alert("일정이 구글 캘린더에서 삭제되었습니다.");
      closeGoogleEventModal();
      agentEvents = agentEvents.filter(e => e.id !== eventId);
      renderV3Calendar();
    } else {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error?.message || "삭제 실패");
    }
  } catch (err) {
    alert("일정 삭제 중 오류가 발생했습니다: " + err.message);
  } finally {
    if (delBtn) {
      delBtn.disabled = false;
      delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> 이 일정 삭제';
    }
  }
}

// ==========================================
// 6. CRM 고객 이벤트 상세 모달 제어
// ==========================================
function openCrmEventDetail(type, name, phone, prod, note, dateStr) {
  const badgeEl = document.getElementById('crmEventBadge');
  const nameEl = document.getElementById('crmEventClientName');
  const dateEl = document.getElementById('crmEventDateText');
  const phoneEl = document.getElementById('crmEventClientPhone');
  const prodEl = document.getElementById('crmEventProduct');
  const guideEl = document.getElementById('crmEventGuideBox');
  const callBtn = document.getElementById('btnCallClient');
  const smsBtn = document.getElementById('btnSmsClient');

  if (nameEl) nameEl.innerText = `${name} 고객님`;
  if (dateEl) dateEl.innerText = dateStr;
  if (phoneEl) phoneEl.innerText = phone || '연락처 미등록';
  if (prodEl) prodEl.innerText = prod || '가입 정보 없음';

  if (type === 'sang') {
    badgeEl.innerText = ' 상령일';
    badgeEl.style.background = '#ede9fe';
    badgeEl.style.color = '#6d28d9';
    badgeEl.style.border = '1px solid #ddd6fe';
    guideEl.innerHTML = ` <strong>상령일 세일즈 팁:</strong> 상령일이 지나면 보험나이가 1세 증가하여 보험료가 상승합니다! <em>"${name} 고객님, 이번 달 보험나이 변동 전 마지막으로 보장을 점검해 드리겠습니다."</em>라고 제안해보세요.`;
  } else if (type === 'bday') {
    badgeEl.innerText = ' 생일';
    badgeEl.style.background = '#ffe4e6';
    badgeEl.style.color = '#e11d48';
    badgeEl.style.border = '1px solid #fecdd3';
    guideEl.innerHTML = ` <strong>생일 세일즈 팁:</strong> 고객님의 생일 축하 메시지나 기프티콘을 발송하여 따뜻한 라포(신뢰)를 형성하세요!`;
  } else if (type === 'expiry') {
    badgeEl.innerText = ' 만기·갱신';
    badgeEl.style.background = '#fef3c7';
    badgeEl.style.color = '#d97706';
    badgeEl.style.border = '1px solid #fde68a';
    guideEl.innerHTML = ` <strong>만기/갱신 안내:</strong> 계약 갱신 또는 만기 도래 건입니다. 다른 경쟁사 이탈을 방지하고 재가입/특약 보강 상담을 진행하세요.`;
  } else if (type === 'pay') {
    badgeEl.innerText = ' 결제일';
    badgeEl.style.background = '#e0f2fe';
    badgeEl.style.color = '#0284c7';
    badgeEl.style.border = '1px solid #bae6fd';
    guideEl.innerHTML = `ℹ <strong>보험료 결제일:</strong> 정상 출금 여부를 모니터링하여 미납/실효를 사전에 예방하세요.`;
  }

  if (callBtn) {
    callBtn.href = phone ? `tel:${phone}` : '#';
    callBtn.style.opacity = phone ? '1' : '0.5';
    callBtn.onclick = phone ? null : (e) => { e.preventDefault(); alert("등록된 연락처가 없습니다."); };
  }
  if (smsBtn) {
    smsBtn.href = phone ? `sms:${phone}` : '#';
    smsBtn.style.opacity = phone ? '1' : '0.5';
    smsBtn.onclick = phone ? null : (e) => { e.preventDefault(); alert("등록된 연락처가 없습니다."); };
  }

  const modal = document.getElementById('crmEventModal');
  if (modal) modal.style.display = 'flex';
}

function closeCrmEventModal() {
  const modal = document.getElementById('crmEventModal');
  if (modal) modal.style.display = 'none';
}

// ==========================================
// 6-1. 날짜별 일정 및 고객 이벤트 통합 상세 모달 (심플 & 클린)
// ==========================================
function openDayDetailModal(fullDateStr) {
  if (!fullDateStr) return;
  const dParts = fullDateStr.split('-');
  if (dParts.length < 3) return;
  const y = parseInt(dParts[0], 10);
  const m = parseInt(dParts[1], 10);
  const d = parseInt(dParts[2], 10);
  const targetDate = new Date(y, m - 1, d);
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = dayNames[targetDate.getDay()];

  const titleEl = document.getElementById('dayDetailModalTitle');
  const countEl = document.getElementById('dayDetailCountBadge');
  const bodyEl = document.getElementById('dayDetailModalBody');
  const btnAdd = document.getElementById('btnDayDetailAdd');

  if (titleEl) titleEl.innerText = `${y}년 ${m}월 ${d}일 (${dayOfWeek}) 일정`;

  const dayGoogle = (agentEvents || []).filter(e => e.fullDate === fullDateStr);
  const dayCrm = (crmEventsList || []).filter(e => e.fullDate === fullDateStr);
  const totalCount = dayGoogle.length + dayCrm.length;

  if (countEl) {
    countEl.innerText = `총 ${totalCount}건`;
    countEl.style.display = totalCount > 0 ? 'inline-block' : 'none';
  }

  if (btnAdd) {
    btnAdd.onclick = () => {
      closeDayDetailModal();
      openScheduleModalForDate(fullDateStr);
    };
  }

  if (!bodyEl) return;

  if (totalCount === 0) {
    bodyEl.innerHTML = `
      <div style="text-align:center; padding:32px 16px; color:#94a3b8; font-size:13.5px; font-weight:700;">
        <i class="fa-regular fa-calendar-xmark" style="font-size:24px; color:#cbd5e1; margin-bottom:6px; display:block;"></i>
        등록된 일정이 없습니다.
      </div>
    `;
  } else {
    let rowsHtml = '';

    // 1. Google Personal Events (1줄 컴팩트)
    dayGoogle.forEach(e => {
      const timeStr = e.isAllDay ? '종일' : (e.timeText || e.timeStr || '');
      const eventTitle = e.name || e.summary || e.title || '구글 일정';
      const descStr = (e.description || e.note) ? ` · ${escapeHtml(e.description || e.note)}` : '';
      rowsHtml += `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-bottom:1px solid #f1f5f9; gap:10px; font-size:13px; transition:background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
          <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
            <span style="background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; font-size:11px; font-weight:800; padding:2px 7px; border-radius:4px; flex-shrink:0;">
              🟢 일정
            </span>
            ${timeStr ? `<span style="font-size:12px; font-weight:700; color:#059669; flex-shrink:0;">[${escapeHtml(timeStr)}]</span>` : ''}
            <span style="font-weight:800; color:#0f172a; flex-shrink:0;">${escapeHtml(eventTitle)}</span>
            <span style="font-size:12px; color:#64748b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${descStr}</span>
          </div>
          <div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">
            <button type="button" class="modal-btn secondary" style="padding:4px 9px; font-size:11.5px;" onclick="closeDayDetailModal(); openGoogleEventDetail('${e.id}')">상세</button>
          </div>
        </div>
      `;
    });

    // 2. CRM Customer Events (1줄 컴팩트)
    dayCrm.forEach(e => {
      let badgeStyle = "background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;";
      let badgeLabel = "고객";
      if (e.type === 'bday') {
        badgeStyle = "background:#fff1f2; color:#e11d48; border:1px solid #fecdd3;";
        badgeLabel = "🎂 생일";
      } else if (e.type === 'sang') {
        badgeStyle = "background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe;";
        badgeLabel = "📈 상령일";
      } else if (e.type === 'expiry') {
        badgeStyle = "background:#fefce8; color:#ca8a04; border:1px solid #fef08a;";
        badgeLabel = "📑 만기";
      } else if (e.type === 'pay') {
        badgeStyle = "background:#f0f9ff; color:#0284c7; border:1px solid #bae6fd;";
        badgeLabel = "💳 결제";
      }

      const clientName = e.name || '고객';
      const phone = e.phone || '';
      let descParts = [];
      if (e.prod) descParts.push(`[${e.prod}]`);
      if (phone) descParts.push(phone);
      if (e.note && !e.prod) descParts.push(e.note);
      const descStr = descParts.join(' · ');

      rowsHtml += `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-bottom:1px solid #f1f5f9; gap:10px; font-size:13px; transition:background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
          <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
            <span style="${badgeStyle} font-size:11px; font-weight:800; padding:2px 7px; border-radius:4px; flex-shrink:0;">
              ${badgeLabel}
            </span>
            <span style="font-weight:800; color:#0f172a; flex-shrink:0;">${escapeHtml(clientName)}</span>
            <span style="font-size:12px; color:#64748b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${escapeHtml(descStr)}</span>
          </div>
          <div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">
            ${phone ? `
              <a href="tel:${phone}" class="modal-btn secondary" style="width:26px; height:26px; padding:0; display:inline-flex; align-items:center; justify-content:center; text-decoration:none;" title="통화">
                <i class="fa-solid fa-phone" style="font-size:10.5px; color:#10b981;"></i>
              </a>
              <a href="sms:${phone}" class="modal-btn secondary" style="width:26px; height:26px; padding:0; display:inline-flex; align-items:center; justify-content:center; text-decoration:none;" title="문자">
                <i class="fa-solid fa-comment-sms" style="font-size:10.5px; color:#0ea5e9;"></i>
              </a>
            ` : ''}
            <button type="button" class="modal-btn secondary" style="padding:4px 8px; font-size:11.5px;" onclick="closeDayDetailModal(); openCrmEventDetail('${e.type}', '${escapeJs(e.name)}', '${escapeJs(e.phone)}', '${escapeJs(e.prod)}', '${escapeJs(e.note)}', '${fullDateStr}')">가이드</button>
          </div>
        </div>
      `;
    });

    bodyEl.innerHTML = rowsHtml;
  }

  const modal = document.getElementById('dayDetailModal');
  if (modal) modal.style.display = 'flex';
}

function closeDayDetailModal() {
  const modal = document.getElementById('dayDetailModal');
  if (modal) modal.style.display = 'none';
}

// ==========================================
// 7. 상단 프로필, 실적 통계 및 데이터 동기화
// ==========================================
function updateDashboardV3Stats() {
  const p = getParentProp('currentProfile');
  if (!p) return;
  const elInfo = document.getElementById('dashPlannerInfo');
  if (elInfo) elInfo.innerText = (p.company || '소속 미기입') + ' |  ' + (p.phone || '번호 미기입');

  const globalCust = getParentProp('globalCustomerData');
  if (globalCust && globalCust.length > 0) {
    let thisMonthCount = 0;
    let thisMonthAmount = 0;
    const now = new Date();
    const thisMonthStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0');

    globalCust.forEach(row => {
      for (let i = 1; i <= 3; i++) {
        let d = row['보험' + i + '_체결일'];
        let pr = row['보험' + i + '_보험료'];
        if (d && String(d).startsWith(thisMonthStr)) {
          thisMonthCount++;
          thisMonthAmount += (parseInt(String(pr).replace(/[^0-9]/g, ''), 10) || 0);
        }
      }
    });

    const elGoal = document.getElementById('dashGoalAchieved');
    if (elGoal) {
      elGoal.innerText = new Intl.NumberFormat('ko-KR').format(thisMonthAmount) + '원 (' + thisMonthCount + '건)';
    }
  }
}

async function loadDataAndRender() {
  const currentProfile = getParentProp('currentProfile');
  const currentUser = getParentProp('currentUser');

  // [계정간 데이터 혼입 완벽 방지] 로그인 사용자가 없거나 게스트인 경우 캐시 무효화 및 데이터 백지화
  if (!currentUser && !currentProfile) {
    crmData = [];
    targetData = [];
    agentEvents = [];
    crmEventsList = [];
    analyzeCrmData();
    renderV3Calendar();
    return;
  }

  const globalCust = getParentProp('globalCustomerData');
  if (globalCust && globalCust.length > 0) {
    crmData = globalCust;
    const globalTgt = getParentProp('globalTargetData');
    if (globalTgt) targetData = globalTgt;
  } else {
    // 1. Check persistent localStorage cache ONLY if user matches
    try {
      const currentUserId = currentUser ? currentUser.id : (currentProfile ? currentProfile.id : '');
      const cachedOwner = localStorage.getItem('weracle_cache_user_id');
      
      if (currentUserId && cachedOwner && currentUserId !== cachedOwner) {
        // 다른 아이디의 캐시인 경우 즉시 영구 삭제!
        localStorage.removeItem('weracle_crm_cached_data');
        localStorage.removeItem('weracle_crm_customers_cache');
        localStorage.removeItem('weracle_crm_insurance_cache');
        localStorage.removeItem('cached_profile');
        crmData = [];
      } else {
        const cached = localStorage.getItem('weracle_crm_cached_data');
        if (cached) {
          crmData = JSON.parse(cached);
        }
      }
    } catch(e) {}

    // 2. If still empty, check google sheet directly using gToken
    if ((!crmData || crmData.length === 0) && window.gToken) {
      const profile = getParentProp('currentProfile');
      const sheetId = localStorage.getItem('g_sheet_id') || localStorage.getItem('user_spreadsheet_id') || (profile && profile.google_sheet_id);
      if (sheetId) {
        try {
          const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/weraclecrm!A:Z`, {
            headers: { Authorization: `Bearer ${window.gToken}` }
          });
          if (res.ok) {
            const d = await res.json();
            if (d.values && d.values.length > 1) {
              const headers = d.values[0];
              crmData = d.values.slice(1).map(row => {
                const obj = {};
                headers.forEach((h, i) => { obj[h] = row[i] || ''; });
                return obj;
              });
              try { localStorage.setItem('weracle_crm_cached_data', JSON.stringify(crmData)); } catch(e){}
            }
          }
        } catch(err) {
          console.warn('Failed to fetch CRM sheet directly in dashboard:', err);
        }
      }
    }

    // 3. Fallback: If no CRM data exists, keep empty (no fake sample data)
    if (!crmData || crmData.length === 0) {
      crmData = [];
      try { localStorage.removeItem('demo_crm_data'); } catch(e) {}
    }
  }

  analyzeCrmData();
  renderV3Calendar();
}

function getInitialMockData() {
  return [];
}

async function initDashboard() {
  // 슬라이더 초기 렌더링 (Items 6-3, 6-4)
  renderPromoSlide();
  renderVideoSlide();

  // 뷰 모드 버튼 상태 동기화
  const btnV = document.getElementById('btnViewVertical');
  const btnH = document.getElementById('btnViewHorizontal');
  if (btnV && btnH) {
    if (calViewMode === 'vertical') {
      btnV.classList.add('active');
      btnH.classList.remove('active');
    } else {
      btnH.classList.add('active');
      btnV.classList.remove('active');
    }
  }

  const profile = getParentProp('currentProfile');
  if (profile) {
    const welcomeMsgEl = document.getElementById('welcome-msg');
    if (welcomeMsgEl) welcomeMsgEl.innerText = `${profile.nickname || '설계사'} 님, 환영합니다!`;

    const userGradeLower = (profile.user_grade || 'basic').toLowerCase();
    const limits = {
      basic: { fax: 0 },
      normal: { fax: 0 },
      vip: { fax: 30 },
      premium: { fax: 30 },
      svip: { fax: 9999 },
      family: { fax: 9999 },
      manager: { fax: 9999 }
    };
    const myLimits = limits[userGradeLower] || limits['basic'];
    const quotaSummaryEl = document.getElementById('quota-summary');
    if (quotaSummaryEl) {
      quotaSummaryEl.innerHTML = `
        <div style="background: #fff; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; font-weight: 600;">
          <span style="color: var(--text-muted);">보유 포인트:</span> <span style="color: var(--success); font-weight: 800;">${new Intl.NumberFormat('ko-KR').format(profile.point_balance || 0)} P</span>
        </div>
        <div style="background: #fff; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; font-weight: 600;">
          <span style="color: var(--text-muted);">잔여 팩스:</span> <span style="color: var(--primary); font-weight: 800;">${myLimits.fax - (profile.fax_count || 0)}건</span>
        </div>
      `;
    }

    if (profile.google_access_token) {
      window.gToken = profile.google_access_token;
      localStorage.setItem('google_access_token', window.gToken);
    }
  }

  updateGoogleStatusUI();
  loadDataAndRender();
  updateDashboardV3Stats();

  if (!window.gToken && window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'REQUEST_GOOGLE_TOKEN' }, '*');
  }

  if (window.gToken) {
    fetchGoogleCalendarEvents();
  }

  if (!checkDataInterval) {
    checkDataInterval = setInterval(() => {
      const currentUser = getParentProp('currentUser');
      const currentProfile = getParentProp('currentProfile');
      if (!currentUser && !currentProfile) {
        if (crmData.length > 0 || crmEventsList.length > 0) {
          crmData = [];
          crmEventsList = [];
          agentEvents = [];
          renderV3Calendar();
        }
        return;
      }
      const gCust = getParentProp('globalCustomerData');
      if (gCust && gCust.length > 0) {
        if (crmData.length !== gCust.length) {
          crmData = gCust;
          analyzeCrmData();
          renderV3Calendar();
          updateDashboardV3Stats();
        }
      }
    }, 1500);
  }
}

function sendResize() {
  if (window.parent && window.parent !== window) {
    if (window.innerWidth > 900) return;
    window.parent.postMessage({ type: 'CRM_RESIZE', height: document.body.scrollHeight }, '*');
  }
}
window.addEventListener('resize', sendResize);

window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "GOOGLE_TOKEN") {
    window.gToken = event.data.token;
    localStorage.setItem('google_access_token', window.gToken);
    updateGoogleStatusUI();
    fetchGoogleCalendarEvents();
  }
  if (event.data && event.data.type === 'syncData') {
    crmData = event.data.data || [];
    targetData = event.data.targetData || [];
    analyzeCrmData();
    renderV3Calendar();
    updateDashboardV3Stats();
  }
  if (event.data && event.data.type === 'CRM_DATA_SYNC') {
    crmData = event.data.data || [];
    analyzeCrmData();
    renderV3Calendar();
  }
});

if (window.parent && window.parent !== window) {
  window.parent.postMessage({ type: 'DASHBOARD_READY' }, '*');
  window.parent.postMessage({ type: 'REQUEST_SESSION' }, '*');
  window.parent.postMessage({ type: 'REQUEST_GOOGLE_TOKEN' }, '*');
}

// ==========================================
// 8. 34개 보험사 포털 사이드바 데이터
// ==========================================
const insData = [
  { name: '삼성화재', link: 'https://erp.samsungfire.com/irj/servlet/prt/portal/prtroot/logon.LogonPage', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/6a348da19e407.png' },
  { name: '메리츠화재', link: 'http://sales.meritzfire.com', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/c2cae692660c8.png' },
  { name: 'DB손해보험', link: 'https://www.mdbins.com/chrome.html?ver=202508181307', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/381ad4a684500.png' },
  { name: 'KB손해보험', link: 'https://nsales.kbinsure.co.kr/eus/ch/ch_index.jsp', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/c065f97b24fc5.png' },
  { name: '현대해상', link: 'https://sp.hi.co.kr/websquare/websquare.html?w2xPath=/common/xml/Login.xml', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/87357d8f3595e.png' },
  { name: '한화손해보험', link: 'https://portal.hwgeneralins.com/3rdParty/loginFormPage_v2.jsp', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/81c5fd45e30c1.png' },
  { name: '롯데손해보험', link: 'https://lottero.lotteins.co.kr/ncrmwebroot/thirdparty/veraport/install20/install.html', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/7d53063ddc47a.png' },
  { name: '흥국화재', link: 'https://salesup.heungkukfire.co.kr', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/79e0f248909c3.png' },
  { name: '하나손해보험', link: 'https://sfa.saleshana.com/wq/login', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/3f61372180e41.png' },
  { name: 'NH농협손해보험', link: 'https://ss.nhfire.co.kr/smartweb_prj/index_t.jsp', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/bf3ad594b4f21.png' },
  { name: '라이나손보', link: 'https://ga.linagi.com/html/gap/GA/GAZ911M0.html', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/935984f4aab4b.png' },
  { name: 'AIG손보', link: 'https://sso.aig.co.kr/gaLogin/gaLogin.jsp', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/da3bebc9fe3e5.png' },
  { name: '예별손해보험', link: 'https://mganet.mggeneralins.com', logoUrl: './yb.png' },
  { name: '한화생명', link: 'https://hmp.hanwhalife.com/online/solutions/websquare/websquare.html?w2xPath=/online/ui/uv/gmn/uvgmn010mvw.xml', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/841d2709f8a0f.png' },
  { name: '동양생명', link: 'https://1004.myangel.co.kr/view/cowqvsf005m', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/8a0361a32f8a5.png' },
  { name: '교보생명', link: 'https://v3agent.kyobo.com:5443/wizvera/veraport/install20/install_V3_GA.html', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/26afb87929732.png' },
  { name: '삼성생명', link: 'https://ga.samsunglife.com/', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/15a9434e85abb.png' },
  { name: '라이나생명', link: 'https://ga.lina.co.kr/html/gap/GA/GAZ911M0.html', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/9c5fe27cead16.png' },
  { name: 'KDB생명', link: 'https://sfa.kdblife.co.kr/', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/f7dd46a0d892d.png' },
  { name: 'iM라이프', link: 'https://fgs.imlifeins.co.kr:8443/', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/96ba1710e5a9d.png' },
  { name: '미래에셋생명', link: 'https://www.loveageplan.com/', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/cec788ecfe510.png' },
  { name: '신한라이프', link: 'https://ga.shinhanlife.co.kr:11043/colomga010m.msv', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/fb6eb26475156.png' },
  { name: 'KB라이프', link: 'https://sfa.kblife.co.kr/scr/m/sfa-login?request=sfaLogin', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/2835121bf7f26.png' },
  { name: 'DB생명', link: 'https://etopia.idblife.com/SSSCO00001M.mvc', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/6bbd0d0979a39.png' },
  { name: '하나생명', link: 'https://ga.hanalife.co.kr/', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/c436fbe95f91c.png' },
  { name: '흥국생명', link: 'https://sales.heungkuklife.co.kr/', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/8f2f2216a57b9.png' },
  { name: 'ABL생명', link: 'https://ga.abllife.co.kr/ui2/login/login.jsp', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/95e75b52beee4.png' },
  { name: 'IBK연금보험', link: 'https://sf.ibki.co.kr/websquare/websquare.html?w2xPath=/ui/SF/CO/SFCO100M01.xml', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/4bd70e80179db.png' },
  { name: 'NH농협생명', link: 'https://www.nhlife.co.kr/nhsmart.nhl', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/9ea0d2dbfc153.png' },
  { name: 'MetLife', link: 'https://metplus.metlife.co.kr/index.jsp', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/c3d2965579a2c.png' },
  { name: '처브라이프', link: 'https://esmart.chubblife.co.kr/index.do', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/64f2c0716807d.png' },
  { name: '푸본현대생명', link: 'https://ez.fubonhyundai.com/browser.html', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/03d4e5f7b698e.png' },
  { name: 'BNP파리바카디프생명', link: 'https://ga.cardif.co.kr/login/loginForm.do', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/e8e7681abe44c.png' },
  { name: 'AIA생명', link: 'https://omni.aia.co.kr/imap/login', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/fba6e742bc731.png' }
];

function renderInsWidget() {
  const container = document.getElementById('ins-sidebar-list');
  if (!container) return;
  const nonLife = insData.slice(0, 13);
  const life = insData.slice(13);

  const renderGroup = (title, items) => {
    let groupHtml = `<div class="ins-group-title">${title}</div>`;
    items.forEach((ins) => {
      groupHtml += `
        <a href="${ins.link}" target="_blank" class="ins-sidebar-item" title="${ins.name}">
          <img class="ins-sidebar-logo" src="${ins.logoUrl}" alt="${ins.name}" onerror="this.onerror=null; this.style.display='none'; if(this.nextElementSibling){this.nextElementSibling.style.opacity='1'; this.nextElementSibling.style.transform='none';}">
          <span class="ins-sidebar-text">${ins.name}</span>
        </a>`;
    });
    return groupHtml;
  };

  container.innerHTML = renderGroup('손해보험', nonLife) + renderGroup('생명보험', life);
}

function renderPortalWidget() {
  const container = document.getElementById('ins-portal-list');
  if (!container) return;

  const smartSolutions = [
    { name: '보험금 청구', emoji: '📄', action: 'openClaimPage()' },
    { name: '보장 브랜딩', emoji: '📊', action: 'openAnalysisPage()' }
  ];

  const officialPortals = [
    { name: '실손24', emoji: '🏥', link: 'https://www.silson24.or.kr/' },
    { name: '34개사 연락처', emoji: '📞', action: 'openInsurerContacts()' },
    { name: '보험개발원', emoji: '📈', link: 'https://www.kidi.or.kr' },
    { name: '보험연수원', emoji: '🎓', link: 'https://www.inbi.or.kr/' },
    { name: '손해보험협회', emoji: '☂️', link: 'https://www.knia.or.kr' },
    { name: '생명보험협회', emoji: '❤️', link: 'https://www.klia.or.kr' }
  ];

  const renderGroup = (title, items) => {
    let groupHtml = `<div class="ins-group-title">${title}</div>`;
    items.forEach((item) => {
      const isLink = !!item.link;
      groupHtml += `
        <a href="${isLink ? item.link : 'javascript:void(0)'}" ${isLink ? 'target="_blank"' : `onclick="${item.action}"`} class="ins-sidebar-item" title="${item.name}">
          <div class="ins-sidebar-logo">${item.emoji}</div>
          <span class="ins-sidebar-text">${item.name}</span>
        </a>`;
    });
    return groupHtml;
  };

  container.innerHTML = renderGroup('스마트 솔루션', smartSolutions) + renderGroup('공식 지원 포털', officialPortals);
}

function switchSidebarTab(tab) {
  const btnIns = document.getElementById('tabBtnIns');
  const btnPortal = document.getElementById('tabBtnPortal');
  const centerBadge = document.getElementById('centerBadge');
  const listIns = document.getElementById('ins-sidebar-list');
  const listPortal = document.getElementById('ins-portal-list');
  if (!listIns || !listPortal) return;

  if (tab === 'ins') {
    if (btnIns) btnIns.classList.add('active');
    if (btnPortal) btnPortal.classList.remove('active');
    if (centerBadge) centerBadge.innerHTML = '🔗';
    listPortal.style.display = 'none';
    listIns.style.display = 'flex';
    listIns.style.animation = 'slideDownFade 0.2s ease forwards';
  } else {
    if (btnPortal) btnPortal.classList.add('active');
    if (btnIns) btnIns.classList.remove('active');
    if (centerBadge) centerBadge.innerHTML = '⚡';
    listIns.style.display = 'none';
    listPortal.style.display = 'flex';
    listPortal.style.animation = 'slideDownFade 0.2s ease forwards';
  }
}
window.switchSidebarTab = switchSidebarTab;

function toggleSidebarTab() {
  const listPortal = document.getElementById('ins-portal-list');
  const isPortal = listPortal && listPortal.style.display !== 'none';
  switchSidebarTab(isPortal ? 'ins' : 'portal');
}
window.toggleSidebarTab = toggleSidebarTab;

function initSmartSidebar() {
  renderInsWidget();
  renderPortalWidget();
  switchSidebarTab('portal');
}

function toggleWidget(show) {
  const sidebar = document.getElementById('ins-sidebar');
  if (sidebar) sidebar.style.display = show ? 'flex' : 'none';
}

// 스마트 퀵 바 즉각 실행 및 다중 생명주기 바인딩
try { initSmartSidebar(); } catch(e) {}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSmartSidebar);
}

// ==========================================
// 9. 초기화 및 이벤트 바인딩
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initSmartSidebar();
});

window.onload = function() {
  initSmartSidebar();
  initDashboard();
};
if (window.innerWidth <= 900) {
  setInterval(sendResize, 600);
  setTimeout(sendResize, 150);
}



// ==========================================
// 10. 34개 보험사 고객센터 연락처 모달 기능
// ==========================================
const INSURER_CONTACTS_DATA = [
  // --- 손해보험 (13개) ---
  { name: '삼성화재', type: 'nonlife', phone: '1588-5114', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/6a348da19e407.png' },
  { name: '메리츠화재', type: 'nonlife', phone: '1566-7711', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/c2cae692660c8.png' },
  { name: 'DB손해보험', type: 'nonlife', phone: '1588-0100', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/381ad4a684500.png' },
  { name: 'KB손해보험', type: 'nonlife', phone: '1544-0114', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/c065f97b24fc5.png' },
  { name: '현대해상', type: 'nonlife', phone: '1588-5656', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/87357d8f3595e.png' },
  { name: '한화손해보험', type: 'nonlife', phone: '1566-8000', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/81c5fd45e30c1.png' },
  { name: '롯데손해보험', type: 'nonlife', phone: '1588-3344', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/7d53063ddc47a.png' },
  { name: '흥국화재', type: 'nonlife', phone: '1688-1688', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/79e0f248909c3.png' },
  { name: '하나손해보험', type: 'nonlife', phone: '1566-3000', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/3f61372180e41.png' },
  { name: 'NH농협손해보험', type: 'nonlife', phone: '1644-9000', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/bf3ad594b4f21.png' },
  { name: '라이나원(손보)', type: 'nonlife', phone: '1566-5800', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/935984f4aab4b.png' },
  { name: 'AIG손해보험', type: 'nonlife', phone: '1544-2792', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/da3bebc9fe3e5.png' },
  { name: '예별손해보험', type: 'nonlife', phone: '1588-5959', logoUrl: './yb.png' },

  // --- 생명보험 (21개) ---
  { name: '한화생명', type: 'life', phone: '1588-6363', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/841d2709f8a0f.png' },
  { name: '동양생명', type: 'life', phone: '1577-1004', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/8a0361a32f8a5.png' },
  { name: '교보생명', type: 'life', phone: '1588-1001', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/26afb87929732.png' },
  { name: '삼성생명', type: 'life', phone: '1588-3114', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/15a9434e85abb.png' },
  { name: '라이나생명', type: 'life', phone: '1588-0058', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/9c5fe27cead16.png' },
  { name: 'KDB생명', type: 'life', phone: '1588-4040', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/f7dd46a0d892d.png' },
  { name: 'iM라이프', type: 'life', phone: '1588-4770', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/96ba1710e5a9d.png' },
  { name: '미래에셋생명', type: 'life', phone: '1588-0220', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/cec788ecfe510.png' },
  { name: '신한라이프', type: 'life', phone: '1588-5580', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/fb6eb26475156.png' },
  { name: 'KB라이프', type: 'life', phone: '1588-3374', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/2835121bf7f26.png' },
  { name: 'DB생명', type: 'life', phone: '1588-3131', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/6bbd0d0979a39.png' },
  { name: '하나생명', type: 'life', phone: '1577-1112', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/c436fbe95f91c.png' },
  { name: '흥국생명', type: 'life', phone: '1588-2288', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/8f2f2216a57b9.png' },
  { name: 'ABL생명', type: 'life', phone: '1588-6500', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/95e75b52beee4.png' },
  { name: 'IBK연금보험', type: 'life', phone: '1577-4117', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/4bd70e80179db.png' },
  { name: 'NH농협생명', type: 'life', phone: '1544-4000', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/9ea0d2dbfc153.png' },
  { name: 'MetLife', type: 'life', phone: '1588-9600', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/c3d2965579a2c.png' },
  { name: '처브라이프', type: 'life', phone: '1599-4600', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/64f2c0716807d.png' },
  { name: '푸본현대생명', type: 'life', phone: '1577-3311', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/03d4e5f7b698e.png' },
  { name: 'BNP파리바카디프', type: 'life', phone: '1688-1118', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/e8e7681abe44c.png' },
  { name: 'AIA생명', type: 'life', phone: '1588-9898', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/fba6e742bc731.png' }
];

let currentContactTab = 'all';

function openInsurerContactsModal() {
  const modal = document.getElementById('insurerContactsModal');
  if (modal) {
    modal.scrollTop = 0;
    try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch(e) {}
    if (window.parent && window.parent !== window) {
      try { window.parent.scrollTo({ top: 0, behavior: 'instant' }); } catch(e) {}
    }
    modal.style.display = 'flex';
    const input = document.getElementById('contactSearchInput');
    if (input) {
      input.value = '';
    }
    currentContactTab = 'all';
    document.querySelectorAll('.contact-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === 'all');
    });
    filterContacts();
    setTimeout(() => {
      if (input) input.focus();
    }, 150);
  }
}

function closeInsurerContactsModal() {
  const modal = document.getElementById('insurerContactsModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function setContactTab(tab) {
  currentContactTab = tab;
  document.querySelectorAll('.contact-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
  });
  filterContacts();
}

function filterContacts() {
  const input = document.getElementById('contactSearchInput');
  const query = (input ? input.value : '').trim().toLowerCase();
  const container = document.getElementById('insurerContactsList');
  const badge = document.getElementById('contactCountBadge');
  if (!container) return;

  const filtered = INSURER_CONTACTS_DATA.filter(item => {
    const matchTab = (currentContactTab === 'all') || (item.type === currentContactTab);
    if (!matchTab) return false;
    if (!query) return true;
    const cleanPhone = item.phone.replace(/[^0-9]/g, '');
    const cleanQuery = query.replace(/[^0-9]/g, '');
    const matchName = item.name.toLowerCase().includes(query);
    const matchPhone = item.phone.includes(query) || (cleanQuery && cleanPhone.includes(cleanQuery));
    return matchName || matchPhone;
  });

  if (badge) {
    badge.innerHTML = query || currentContactTab !== 'all'
      ? '조회 결과 <strong style="color:#0284c7;">' + filtered.length + '</strong> / 34개사'
      : '총 <strong style="color:#0284c7;">34</strong>개 보험사';
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 45px 15px; color: #94a3b8;"><i class="fa-solid fa-magnifying-glass" style="font-size: 26px; margin-bottom: 8px; opacity: 0.5;"></i><p style="margin: 0; font-size: 13.5px; font-weight: 600;">일치하는 보험사 또는 전화번호가 없습니다.</p></div>';
    return;
  }

  container.innerHTML = filtered.map(item => {
    const badgeClass = item.type === 'nonlife' ? 'contact-badge-nonlife' : 'contact-badge-life';
    const typeLabel = item.type === 'nonlife' ? '손해보험' : '생명보험';
    return '<div class="contact-card-item">' +
      '<div class="contact-card-top">' +
        '<div class="contact-card-info">' +
          '<img class="contact-card-logo" src="' + item.logoUrl + '" alt="' + item.name + '" onerror="this.onerror=null; this.style.display=\'none\';">' +
          '<span class="contact-card-name">' + item.name + '</span>' +
        '</div>' +
        '<span class="' + badgeClass + '">' + typeLabel + '</span>' +
      '</div>' +
      '<div class="contact-card-bottom">' +
        '<div class="contact-phone-num">' + item.phone + '</div>' +
        '<div class="contact-actions">' +
          '<a href="tel:' + item.phone + '" class="btn-contact-action btn-contact-call" title="전화 걸기">' +
            '<i class="fa-solid fa-phone"></i> 통화' +
          '</a>' +
          '<button type="button" class="btn-contact-action btn-contact-copy" onclick="copyContactNumber(\'' + item.phone + '\', this)" title="번호 복사">' +
            '<i class="fa-regular fa-copy"></i> 복사' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function copyContactNumber(num, btn) {
  if (!num) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(num).then(() => {
      showCopyFeedback(btn);
    }).catch(() => {
      fallbackCopy(num, btn);
    });
  } else {
    fallbackCopy(num, btn);
  }
}

function fallbackCopy(num, btn) {
  try {
    const ta = document.createElement('textarea');
    ta.value = num;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showCopyFeedback(btn);
  } catch (e) {
    alert('전화번호: ' + num);
  }
}

function showCopyFeedback(btn) {
  const origHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-check" style="color:#059669;"></i> 복사됨!';
  btn.style.borderColor = '#10b981';
  btn.style.background = '#ecfdf5';
  btn.style.color = '#047857';
  setTimeout(() => {
    btn.innerHTML = origHtml;
    btn.style.borderColor = '';
    btn.style.background = '';
    btn.style.color = '';
  }, 1200);
}

// 모달 외부 클릭 & ESC 키 닫기 이벤트 등록
window.addEventListener('click', (e) => {
  const modal = document.getElementById('insurerContactsModal');
  if (e.target === modal) {
    closeInsurerContactsModal();
  }
  const dayModal = document.getElementById('dayDetailModal');
  if (e.target === dayModal) {
    closeDayDetailModal();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeInsurerContactsModal();
    closeDayDetailModal();
  }
});

// 전역 바인딩
window.openInsurerContactsModal = openInsurerContactsModal;
window.closeInsurerContactsModal = closeInsurerContactsModal;
window.openDayDetailModal = openDayDetailModal;
window.closeDayDetailModal = closeDayDetailModal;
window.setContactTab = setContactTab;
window.filterContacts = filterContacts;
window.copyContactNumber = copyContactNumber;
