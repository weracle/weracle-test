// ==========================================
// 위라클 대시보드 - 스마트 캘린더 & 핵심 비즈니스 로직 (dashboard.js)
// ==========================================

// --- SAFEGUARD V3 (미존재 요소 참조 에러 방지) ---
const originalGetElementById = document.getElementById.bind(document);
document.getElementById = function(id) {
  const el = originalGetElementById(id);
  if (!el) { return document.createElement('div'); }
  return el;
};

// --- 전역 상태 변수 ---
const parentWindow = window.parent;
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
  (parentWindow && parentWindow.currentProfile && parentWindow.currentProfile.google_access_token) || 
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
    if (parentWindow && parentWindow !== window) {
      parentWindow.postMessage({ type: 'REQUEST_GOOGLE_LOGIN' }, '*');
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

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0: 일요일, 1: 월요일 ...
  const diff = d.getDate() - day; // 일요일을 주의 첫날로 맞춤
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function navigateWeek(offset) {
  currentCalDate.setDate(currentCalDate.getDate() + (offset * 7));
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

  const thisYear = currentCalDate.getFullYear();

  crmData.forEach(client => {
    const name = client['고객명'] || client['성명'] || '고객';
    const phone = client['연락처'] || client['폰번호'] || client['휴대폰'] || '';
    const prod = client['상품명'] || client['보험사'] || '보험계약';

    // 1)  생일 (Birthday)
    const bday = parseClientBirthday(client);
    if (bday) {
      [-1, 0, 1].forEach(yearOffset => {
        const y = thisYear + yearOffset;
        const mm = String(bday.month).padStart(2, '0');
        const dd = String(bday.day).padStart(2, '0');
        crmEventsList.push({
          type: 'bday',
          name: name,
          phone: phone,
          prod: prod,
          fullDate: `${y}-${mm}-${dd}`,
          title: ` [생일] ${name}`,
          note: `${name} 고객님의 생일입니다. 축하 인사 및 안부 전화를 건네보세요!`
        });
      });

      // 2)  상령일 (Insurance Age Increase Date: 생년월일 + 6개월)
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
        crmEventsList.push({
          type: 'sang',
          name: name,
          phone: phone,
          prod: prod,
          fullDate: `${y}-${mm}-${dd}`,
          title: ` [상령일] ${name}`,
          note: `상령일 도래: 보험나이가 1세 증가하기 직전입니다. 보험료 인상 전 맞춤 보장 리모델링을 제안하세요!`
        });
      });
    }

    // 3) 계약 만기 및 갱신일 (Expiry / Renewal)
    const rDateStr = (client['갱신일'] || client['만기일'] || client['자동차_만기일'] || '').toString().trim();
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
        crmEventsList.push({
          type: 'expiry',
          name: name,
          phone: phone,
          prod: prod,
          fullDate: cleanDate,
          title: ` [만기·갱신] ${name}`,
          note: `${name} 고객님의 계약 만기/갱신일입니다. 사전 연장 및 만기 환급금 상담을 진행하세요.`
        });
      } else if (cleanDate.match(/^\d{2}-\d{2}$/)) {
        [-1, 0, 1].forEach(yearOffset => {
          crmEventsList.push({
            type: 'expiry',
            name: name,
            phone: phone,
            prod: prod,
            fullDate: `${thisYear + yearOffset}-${cleanDate}`,
            title: ` [만기·갱신] ${name}`,
            note: `${name} 고객님의 계약 만기/갱신일입니다. 사전 연장 및 만기 환급금 상담을 진행하세요.`
          });
        });
      }
    }

    // 4)  보험료 결제일 (Payment Day)
    const payDayRaw = client['결제일'] || client['납입일'] || '';
    const payDay = parseInt(payDayRaw.toString().replace(/[^0-9]/g, ''), 10);
    if (payDay && payDay >= 1 && payDay <= 31) {
      const startOfWeek = getStartOfWeek(currentCalDate);
      for (let i = 0; i < 7; i++) {
        let dDate = new Date(startOfWeek);
        dDate.setDate(dDate.getDate() + i);
        if (dDate.getDate() === payDay) {
          const y = dDate.getFullYear();
          const m = String(dDate.getMonth() + 1).padStart(2, '0');
          const d = String(dDate.getDate()).padStart(2, '0');
          crmEventsList.push({
            type: 'pay',
            name: name,
            phone: phone,
            prod: prod,
            fullDate: `${y}-${m}-${d}`,
            title: ` [결제] ${name}`,
            note: `${name} 고객님의 정기 보험료 결제일(${payDay}일)입니다. 통장 잔고 및 정상 출금 여부를 체크하세요.`
          });
        }
      }
    }
  });

  renderV3Calendar();
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

  const startOfWeek = getStartOfWeek(currentCalDate);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  // 헤더 기간 텍스트 업데이트
  const sm = startOfWeek.getMonth() + 1;
  const em = endOfWeek.getMonth() + 1;
  if (periodText) {
    if (sm === em) {
      periodText.innerText = `${startOfWeek.getFullYear()}. ${String(sm).padStart(2, "0")} (${startOfWeek.getDate()}일 ~ ${endOfWeek.getDate()}일)`;
    } else {
      periodText.innerText = `${startOfWeek.getFullYear()}. ${String(sm).padStart(2, "0")}.${startOfWeek.getDate()} ~ ${String(em).padStart(2, "0")}.${endOfWeek.getDate()}`;
    }
  }

  // 이번 주 7일 날짜 배열 구성
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    let d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    weekDates.push(`${y}-${m}-${day}`);
  }

  // 필터별 카운트 계산
  const counts = { all: 0, google: 0, bday: 0, sang: 0, expiry: 0, pay: 0 };
  agentEvents.forEach(e => {
    if (weekDates.includes(e.fullDate)) {
      counts.google++;
      counts.all++;
    }
  });
  crmEventsList.forEach(e => {
    if (weekDates.includes(e.fullDate)) {
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

  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const todayStr = new Date().toISOString().split('T')[0];

  // ----------------------------------------------------
  // [A]  세로 타임라인 뷰 (Vertical Agenda - 기본 모드)
  // ----------------------------------------------------
  if (calViewMode === 'vertical') {
    if (headerRow) headerRow.style.display = 'none';
    grid.className = 'cal-vertical-timeline';

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
  // [B] 가로 7열 달력 뷰 (Horizontal Grid)
  // ----------------------------------------------------
  else {
    if (headerRow) {
      headerRow.style.display = 'grid';
      const colDays = ["일 (Sun)", "월 (Mon)", "화 (Tue)", "수 (Wed)", "목 (Thu)", "금 (Fri)", "토 (Sat)"];
      headerRow.innerHTML = colDays.map((name, i) => {
        const color = i === 0 ? "var(--danger)" : (i === 6 ? "var(--primary)" : "var(--text-muted)");
        return `<div style="color:${color};">${name}</div>`;
      }).join('');
    }
    grid.className = 'cal-grid';

    for (let i = 0; i < 7; i++) {
      const fullDateStr = weekDates[i];
      const dDate = new Date(startOfWeek);
      dDate.setDate(dDate.getDate() + i);
      const dd = dDate.getDate();
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
      const maxShow = 4;
      if (displayEvents.length > 0) {
        eventsHtml = displayEvents.slice(0, maxShow).map(item => {
          if (item.isGoogle) {
            const e = item.raw;
            return `<div class="cal-event-chip cal-event-google" onclick="openGoogleEventDetail('${e.id}')" title="클릭하여 상세 정보 보기 및 삭제">
              <i class="fa-solid fa-clock" style="font-size:10px;"></i>
              <span>${escapeHtml(item.title)}</span>
            </div>`;
          } else {
            const e = item.raw;
            return `<div class="cal-event-chip cal-event-${e.type}" onclick="openCrmEventDetail('${e.type}', '${escapeJs(e.name)}', '${escapeJs(e.phone)}', '${escapeJs(e.prod)}', '${escapeJs(e.note)}', '${fullDateStr}')" title="클릭하여 세일즈 가이드 및 바로 연락">
              <span>${escapeHtml(item.title)}</span>
            </div>`;
          }
        }).join('');

        if (displayEvents.length > maxShow) {
          eventsHtml += `<div class="cal-event-more">+${displayEvents.length - maxShow}개 더보기</div>`;
        }
      } else {
        eventsHtml = `<div style="color:#cbd5e1; font-size:11px; text-align:center; padding-top:20px;">-</div>`;
      }

      const cell = document.createElement("div");
      cell.className = `cal-cell-day${isToday ? ' is-today' : ''}`;
      cell.innerHTML = `
        <div class="cal-day-header">
          <span class="cal-day-num${isToday ? ' today' : ''}">${dd}</span>
          <span class="cal-day-weekday">${isToday ? '오늘' : ''}</span>
        </div>
        <div class="cal-events-wrap">${eventsHtml}</div>
      `;
      grid.appendChild(cell);
    }
  }
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
// 7. 상단 프로필, 실적 통계 및 데이터 동기화
// ==========================================
function updateDashboardV3Stats() {
  if (!parentWindow || !parentWindow.currentProfile) return;
  const p = parentWindow.currentProfile;
  const elInfo = document.getElementById('dashPlannerInfo');
  if (elInfo) elInfo.innerText = (p.company || '소속 미기입') + ' |  ' + (p.phone || '번호 미기입');

  if (parentWindow.globalCustomerData && parentWindow.globalCustomerData.length > 0) {
    let thisMonthCount = 0;
    let thisMonthAmount = 0;
    const now = new Date();
    const thisMonthStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0');

    parentWindow.globalCustomerData.forEach(row => {
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

function loadDataAndRender() {
  if (parentWindow && parentWindow.globalCustomerData && parentWindow.globalCustomerData.length > 0) {
    crmData = parentWindow.globalCustomerData;
    if (parentWindow.globalTargetData) targetData = parentWindow.globalTargetData;
  } else {
    try {
      const localData = localStorage.getItem('demo_crm_data');
      if (localData) crmData = JSON.parse(localData);
    } catch(e) {}
  }

  analyzeCrmData();
  renderV3Calendar();
}

async function initDashboard() {
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

  if (parentWindow && parentWindow.currentProfile) {
    const profile = parentWindow.currentProfile;
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

  if (!window.gToken && parentWindow && parentWindow !== window) {
    parentWindow.postMessage({ type: 'REQUEST_GOOGLE_TOKEN' }, '*');
  }

  if (window.gToken) {
    fetchGoogleCalendarEvents();
  }

  if (!checkDataInterval) {
    checkDataInterval = setInterval(() => {
      if (parentWindow && parentWindow.globalCustomerData && parentWindow.globalCustomerData.length > 0) {
        if (crmData.length !== parentWindow.globalCustomerData.length) {
          crmData = parentWindow.globalCustomerData;
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
  { name: '흥국화재', link: 'https://sales.heungkukfire.co.kr/#/login', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/79e0f248909c3.png' },
  { name: '하나손해보험', link: 'https://sfa.saleshana.com/wq/login', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/3f61372180e41.png' },
  { name: 'NH농협손해보험', link: 'https://ss.nhfire.co.kr/smartweb_prj/index_t.jsp', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/bf3ad594b4f21.png' },
  { name: '라이나손보', link: 'https://ga.linagi.com/html/gap/GA/GAZ911M0.html', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/935984f4aab4b.png' },
  { name: 'AIG손보', link: 'https://sso.aig.co.kr/gaLogin/gaLogin.jsp', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/da3bebc9fe3e5.png' },
  { name: 'MG손해보험', link: 'https://mganet.mggeneralins.com/jsp/browserGuide.jsp', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/499a6f93744ae.png' },
  { name: '한화생명', link: 'https://hmp.hanwhalife.com/online/solutions/websquare/websquare.html?w2xPath=/online/ui/uv/gmn/uvgmn010mvw.xml', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/841d2709f8a0f.png' },
  { name: '동양생명', link: 'https://1004.myangel.co.kr/view/cowqvsf005m', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/8a0361a32f8a5.png' },
  { name: '교보생명', link: 'https://v3agent.kyobo.com:5443/wizvera/veraport/install20/install_V3_GA.html', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/26afb87929732.png' },
  { name: '삼성생명', link: 'https://connectplus.samsunglife.com:10443/gasso/login', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/15a9434e85abb.png' },
  { name: '라이나생명', link: 'https://ga.lina.co.kr/html/gap/GA/GAZ911M0.html', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/9c5fe27cead16.png' },
  { name: 'KDB생명', link: 'https://kss.kdblife.co.kr/Install/x_installAX.html', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/f7dd46a0d892d.png' },
  { name: 'iM라이프', link: 'https://fgs.dgbfnlife.com:8443/', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/96ba1710e5a9d.png' },
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
  { name: 'AIA생명', link: 'https://imap.aia.co.kr/NBSE/aiaone/', logoUrl: 'https://cdn.imweb.me/upload/S202508183b244b34709e6/fba6e742bc731.png' }
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
          <img class="ins-sidebar-logo" src="${ins.logoUrl}" alt="${ins.name}">
          <span class="ins-sidebar-text">${ins.name}</span>
        </a>`;
    });
    return groupHtml;
  };

  container.innerHTML = renderGroup('손해보험', nonLife) + renderGroup('생명보험', life);
}

function toggleWidget(show) {
  const sidebar = document.getElementById('ins-sidebar');
  if (sidebar) sidebar.style.display = show ? 'flex' : 'none';
}

// ==========================================
// 9. 초기화 및 이벤트 바인딩
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  renderInsWidget();
});

window.onload = initDashboard;
setInterval(sendResize, 600);
setTimeout(sendResize, 150);
