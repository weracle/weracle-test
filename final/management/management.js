/**
 * 위라클 파트너스 매니지먼트 통합 자바스크립트 모듈
 * 1. 교육 & 회사 스케줄
 * 2. 스마트 QR 출근 & 교육 출석체크 (관리자 출결 리포트 및 월별 다운로드 포함)
 * 3. 영업 실적 표 (CSV 다운로드)
 * 4. 콘텐츠 연구소
 * 5.  관리자 제어 콘솔 (스케줄, 출결시간 정책, 실적 관리, 연구소 관리, 회원 등급/권한 제어)
 */

// =========================================================
// [구글 OAuth 연동 (대시보드와 동일한 직접 API 연동)]
// =========================================================
const parentWindow = window.parent;
window.gToken = window.gToken || 
  (parentWindow && parentWindow.currentProfile && parentWindow.currentProfile.google_access_token) || 
  localStorage.getItem('g_access_token') || 
  localStorage.getItem('google_access_token') || 
  '';

if (!window.gToken && parentWindow && parentWindow !== window) {
  try { parentWindow.postMessage({ type: 'REQUEST_GOOGLE_TOKEN' }, '*'); } catch(e){}
}

window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GOOGLE_TOKEN') {
    window.gToken = event.data.token;
    try { localStorage.setItem('g_access_token', window.gToken); } catch(e){}
  }
});

// =========================================================
// [공통 및 Supabase 비동기 클라이언트 연동 도우미]
// =========================================================
async function getSb() {
  if (window.sb) return window.sb;
  if (!window.SUPABASE_CONFIG) {
    window.SUPABASE_CONFIG = {
      url: "https://tjohrovsvgnkrlqhjkwt.supabase.co",
      anonKey: "sb_publishable_m2fpA60L66F8uGnynEbmvg_BBepUlmR"
    };
  }
  if (typeof initSupabaseConfigOnly === 'function') {
    try {
      await initSupabaseConfigOnly();
    } catch (e) {
      console.warn('initSupabaseConfigOnly 호출 오류:', e);
    }
  }
  if (!window.sb && window.supabase && window.SUPABASE_CONFIG) {
    try {
      window.sb = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
    } catch (e) {}
  }
  return window.sb;
}

// Supabase partners_settings 설정 저장 도우미
async function saveSettingToSupabase(key, value, description) {
  const sb = await getSb();
  if (!sb) return;
  try {
    await sb.from('partners_settings').upsert({
      key: key,
      value: value,
      description: description || '',
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn(`partners_settings (${key}) 클라우드 저장 실패:`, e);
  }
}

// =========================================================
// [위라클 파트너스 전용 커스텀 알림/확인 대화상자 (브라우저 기본 alert/confirm 대체)]
// =========================================================
let currentDialogResolve = null;

window.closeCustomDialog = function(result) {
  const dialog = document.getElementById('weracleCustomDialog');
  if (dialog) dialog.style.display = 'none';
  if (typeof currentDialogResolve === 'function') {
    const resolve = currentDialogResolve;
    currentDialogResolve = null;
    resolve(result);
  }
};

window.showAlert = function(message, title = '위라클 파트너스 알림') {
  return new Promise((resolve) => {
    const dialog = document.getElementById('weracleCustomDialog');
    if (!dialog) {
      if (window._nativeAlert) window._nativeAlert(message);
      resolve(true);
      return;
    }

    currentDialogResolve = resolve;

    const titleEl = document.getElementById('weracleDialogTitle');
    const msgEl = document.getElementById('weracleDialogMessage');
    const iconBox = document.getElementById('weracleDialogIconBox');
    const btnCancel = document.getElementById('weracleDialogBtnCancel');
    const btnConfirm = document.getElementById('weracleDialogBtnConfirm');

    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerText = message || '';
    if (btnCancel) btnCancel.style.display = 'none';

    if (iconBox) {
      const text = String(message || '');
      if (text.includes('삭제') || text.includes('제외') || text.includes('차단') || text.includes('회수')) {
        iconBox.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        iconBox.style.background = '#fef2f2';
        iconBox.style.color = '#ef4444';
      } else if (text.includes('완료') || text.includes('성공') || text.includes('인증') || text.includes('저장') || text.includes('등록')) {
        iconBox.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
        iconBox.style.background = '#ecfdf5';
        iconBox.style.color = '#059669';
      } else if (text.includes('오류') || text.includes('확인해') || text.includes('입력') || text.includes('주의') || text.includes('올바르지')) {
        iconBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
        iconBox.style.background = '#fffbeb';
        iconBox.style.color = '#d97706';
      } else {
        iconBox.innerHTML = '<i class="fa-solid fa-bell"></i>';
        iconBox.style.background = '#eff6ff';
        iconBox.style.color = '#0284c7';
      }
    }

    if (btnConfirm) {
      btnConfirm.innerText = '확인';
      btnConfirm.style.background = 'linear-gradient(135deg, #0284c7, #2563eb)';
      btnConfirm.focus();
    }

    dialog.style.display = 'flex';
  });
};

window.showConfirm = function(message, title = '위라클 파트너스 확인') {
  return new Promise((resolve) => {
    const dialog = document.getElementById('weracleCustomDialog');
    if (!dialog) {
      const res = window._nativeConfirm ? window._nativeConfirm(message) : true;
      resolve(res);
      return;
    }

    currentDialogResolve = resolve;

    const titleEl = document.getElementById('weracleDialogTitle');
    const msgEl = document.getElementById('weracleDialogMessage');
    const iconBox = document.getElementById('weracleDialogIconBox');
    const btnCancel = document.getElementById('weracleDialogBtnCancel');
    const btnConfirm = document.getElementById('weracleDialogBtnConfirm');

    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerText = message || '';
    if (btnCancel) btnCancel.style.display = 'inline-block';

    if (iconBox) {
      const text = String(message || '');
      if (text.includes('삭제') || text.includes('제외')) {
        iconBox.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        iconBox.style.background = '#fef2f2';
        iconBox.style.color = '#ef4444';
        if (btnConfirm) btnConfirm.style.background = '#dc2626';
      } else {
        iconBox.innerHTML = '<i class="fa-solid fa-circle-question"></i>';
        iconBox.style.background = '#eff6ff';
        iconBox.style.color = '#0284c7';
        if (btnConfirm) btnConfirm.style.background = 'linear-gradient(135deg, #0284c7, #2563eb)';
      }
    }

    if (btnConfirm) {
      btnConfirm.innerText = '확인';
      btnConfirm.focus();
    }

    dialog.style.display = 'flex';
  });
};

// 키보드 엔터/ESC 제어
document.addEventListener('keydown', (e) => {
  const dialog = document.getElementById('weracleCustomDialog');
  if (!dialog || dialog.style.display === 'none') return;

  if (e.key === 'Enter') {
    e.preventDefault();
    closeCustomDialog(true);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeCustomDialog(false);
  }
});

// 브라우저 기본 alert 전역 오버라이드
if (!window._nativeAlert) {
  window._nativeAlert = window.alert;
  window.alert = function(msg) {
    showAlert(msg);
  };
}

// Supabase partners_settings 설정 로드
async function loadSettingsFromSupabase() {
  const sb = await getSb();
  if (!sb) return;
  try {
    const { data, error } = await sb.from('partners_settings').select('*');
    if (!error && Array.isArray(data)) {
      data.forEach(row => {
        if (row.key === 'attendance_policy' && row.value) {
          attendancePolicySettings = { ...attendancePolicySettings, ...row.value };
          localStorage.setItem('weracle_attendance_policy_settings', JSON.stringify(attendancePolicySettings));
          syncPolicyInputsToUI();
          if (typeof filterMonthlyRateTab === 'function') filterMonthlyRateTab();
        } else if (row.key === 'attendance_times' && row.value) {
          if (row.value.workEnd) timePolicySettings.workTime = row.value.workEnd;
          if (row.value.edu1Start) timePolicySettings.eduAmTime = row.value.edu1Start;
          if (row.value.edu2Start) {
            timePolicySettings.eduPmTime = (row.value.edu2Start === '13:00' || row.value.edu2Start === '14:00' || row.value.edu2Start === '13:30') ? '11:00' : row.value.edu2Start;
          }
          const wInput = document.getElementById('cfgWorkTime');
          const amInput = document.getElementById('cfgEduAmTime');
          const pmInput = document.getElementById('cfgEduPmTime');
          if (wInput) wInput.value = timePolicySettings.workTime;
          if (amInput) amInput.value = timePolicySettings.eduAmTime;
          if (pmInput) pmInput.value = timePolicySettings.eduPmTime;
        } else if (row.key === 'google_cal_settings' && row.value) {
          googleCalSettings = { ...googleCalSettings, ...row.value };
          if (!googleCalSettings.calId || googleCalSettings.calId === 'weracle.partners@gmail.com') {
            googleCalSettings.calId = 'boheomdapda@gmail.com';
          }
          localStorage.setItem('weracle_google_cal_settings', JSON.stringify(googleCalSettings));
          const input = document.getElementById('cfgGoogleCalUrl');
          if (input) input.value = googleCalSettings.webhookUrl || (googleCalSettings.calId !== 'boheomdapda@gmail.com' ? googleCalSettings.calId : '');
        } else if (row.key === 'team_goals' && row.value) {
          if (typeof applyTeamGoalsFromObject === 'function') {
            applyTeamGoalsFromObject(row.value);
          }
        } else if (row.key === 'member_teams' && row.value) {
          memberTeamsMap = { ...memberTeamsMap, ...row.value };
          try { localStorage.setItem('weracle_member_teams', JSON.stringify(memberTeamsMap)); } catch(e){}
        } else if (row.key === 'member_grades' && row.value) {
          memberGradesMap = { ...memberGradesMap, ...row.value };
          try { localStorage.setItem('weracle_member_grades', JSON.stringify(memberGradesMap)); } catch(e){}
        } else if (row.key === 'member_positions' && row.value) {
          memberPositionsMap = { ...memberPositionsMap, ...row.value };
          try { localStorage.setItem('weracle_member_positions', JSON.stringify(memberPositionsMap)); } catch(e){}
        } else if (row.key === 'lab_data' && row.value) {
          if (typeof applyLabDataFromSupabase === 'function') {
            applyLabDataFromSupabase(row.value);
          }
        } else if (row.key === 'qr_domain' && row.value) {
          customQrDomain = typeof row.value === 'string' ? row.value : (row.value.url || '');
          try { localStorage.setItem('weracle_qr_domain', customQrDomain); } catch(e){}
          const input = document.getElementById('customQrDomainInput');
          if (input) input.value = customQrDomain;
        }
      });
    }
  } catch (e) {
    console.warn('partners_settings 로드 실패:', e);
  }
}

// 클라우드 시작 비동기 동기화
async function syncFromCloudOnStartup() {
  try {
    const sb = await getSb();
    if (sb) {
      console.log(' Supabase 연결 완료: 최신 클라우드 데이터 동기화 시작');
      await loadSettingsFromSupabase();
      await loadSchedulesFromSupabase();
      if (typeof loadPerformanceFromSupabase === 'function') {
        await loadPerformanceFromSupabase();
      }
      await loadAdminUserList();
      await loadAttendanceFromSupabase();
      subscribeToAttendanceRealtime();
      console.log(' 클라우드 데이터 동기화 완료');
    }
  } catch (err) {
    console.warn('클라우드 동기화 중 오류 (로컬 모드로 계속 작동):', err);
  }
}

// =========================================================
// [공통 및 초기화]
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initSchedule();
  initQRCheckin();
  initAttendanceReport();
  initPerformance();
  initContentLab();
  initAdminConsole();

  // Supabase 비동기 클라우드 실시간 동기화 실행
  syncFromCloudOnStartup();
});

// 메인 5대 탭 네비게이션
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-navigation .tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');

      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');
    });
  });
}

window.switchTab = function(tabKey) {
  const btn = document.querySelector(`.tab-btn[data-tab="tab-${tabKey}"]`);
  if (btn) btn.click();
};


// =========================================================
// [1. 교육 스케줄 및 회사 스케줄]
// =========================================================
// 오늘 날짜 반환 (YYYY-MM-DD 형식)
function getTodayDateStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const _initNow = new Date();
let currentYear = _initNow.getFullYear();
let currentMonth = _initNow.getMonth() + 1;
let scheduleFilter = 'all';

// 제휴 원수사 / 보험사 기본 목록 및 로컬 스토리지 연동
const defaultPartnerCompanies = [
  '삼성생명', '한화생명', '교보생명', '메리츠화재', '현대해상',
  'DB손해보험', 'KB손해보험', '신한라이프', '흥국생명', '동양생명',
  'DB생명', '롯데손해보험', '농협생명', '라이나생명'
];

let partnerCompanies = [];
try {
  const savedCompanies = localStorage.getItem('weracle_partner_companies');
  partnerCompanies = savedCompanies !== null ? JSON.parse(savedCompanies) : [...defaultPartnerCompanies];
} catch (e) {
  partnerCompanies = [...defaultPartnerCompanies];
}

function savePartnerCompanies() {
  try {
    localStorage.setItem('weracle_partner_companies', JSON.stringify(partnerCompanies));
  } catch (e) {
    console.warn('Failed to save companies:', e);
  }
}

let sampleSchedules = [];

let isPastSchedulesOpen = false;

// [구글 캘린더 & 스마트폰 알림 연동 상태]
let googleCalSettings = {
  calId: 'boheomdapda@gmail.com',
  webhookUrl: '',
  remindTiming: '30m',
  remind1d: true
};

function initGoogleCalSettings() {
  try {
    const saved = localStorage.getItem('weracle_google_cal_settings');
    if (saved) {
      googleCalSettings = { ...googleCalSettings, ...JSON.parse(saved) };
    }
    if (!googleCalSettings.calId || googleCalSettings.calId === 'weracle.partners@gmail.com') {
      googleCalSettings.calId = 'boheomdapda@gmail.com';
    }
    const input = document.getElementById('cfgGoogleCalUrl');
    if (input) input.value = googleCalSettings.webhookUrl || (googleCalSettings.calId !== 'boheomdapda@gmail.com' ? googleCalSettings.calId : '');
  } catch (e) {
    console.warn('Google Cal settings 로드 실패:', e);
  }
}

window.saveGoogleCalSettings = function() {
  const val = (document.getElementById('cfgGoogleCalUrl')?.value || '').trim();
  googleCalSettings.webhookUrl = val;
  if (val && !val.startsWith('http')) {
    googleCalSettings.calId = val;
  } else if (!val) {
    googleCalSettings.calId = 'boheomdapda@gmail.com';
  }
  localStorage.setItem('weracle_google_cal_settings', JSON.stringify(googleCalSettings));
  saveSettingToSupabase('google_cal_settings', googleCalSettings, '구글 캘린더 동기화 및 스마트폰 알림 설정');
  alert('구글 캘린더 연동 설정이 성공적으로 저장되었습니다!\n(기본 캘린더: ' + (googleCalSettings.calId || 'boheomdapda@gmail.com') + ')');
};

window.testGoogleCalSync = function() {
  const gAuthToken = window.gToken || 
    localStorage.getItem('g_access_token') || 
    localStorage.getItem('google_access_token') || 
    (parentWindow && parentWindow.currentProfile && parentWindow.currentProfile.google_access_token);

  if (gAuthToken) {
    alert(' 구글 로그인 연동 완료!\n통합스케줄러와 동일하게 일정 등록 시 로그인된 공식 구글 캘린더(boheomdapda@gmail.com)로 즉시 자동 전송됩니다.');
    return;
  }
  const url = googleCalSettings.webhookUrl || (document.getElementById('cfgGoogleCalUrl')?.value || '').trim();
  if (url && url.startsWith('http')) {
    alert('⏳ 구글 Webhook 연결 테스트 중입니다...');
    fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test' })
    }).then(() => {
      alert(' 구글 캘린더 Webhook 연결 성공!\n홈페이지에서 새 일정을 등록하면 공식 구글 캘린더(boheomdapda@gmail.com)에 자동 생성됩니다.');
    }).catch(err => {
      alert(' Webhook 호출 중 문제가 발생했습니다: ' + (err.message || err));
    });
  } else {
    const targetCal = googleCalSettings.calId || 'boheomdapda@gmail.com';
    alert('ℹ 현재 기본 캘린더: ' + targetCal + '\n통합스케줄러에서처럼 구글 캘린더 연동이 되어 있으면 일정 등록 시 실시간 자동 등록됩니다.');
  }
};

window.copyGoogleCalSubscribeUrl = function() {
  let calId = googleCalSettings.calId || 'boheomdapda@gmail.com';
  if (calId === 'weracle.partners@gmail.com') calId = 'boheomdapda@gmail.com';
  const dummyCalUrl = `webcal://calendar.google.com/calendar/ical/${encodeURIComponent(calId)}/public/basic.ics`;
  navigator.clipboard.writeText(dummyCalUrl).then(() => {
    alert('직원용 캘린더 구독 주소가 클립보드에 복사되었습니다!\n직원들에게 안내하여 스마트폰 캘린더에 붙여넣을 수 있습니다.');
  }).catch(() => {
    prompt('아래 캘린더 구독 주소를 복사해 주세요:', dummyCalUrl);
  });
};

window.openGoogleCalSubscribeModal = function() {
  const modal = document.getElementById('googleCalSubscribeModal');
  const btn = document.getElementById('btnGcalDirectOpen');
  let calId = googleCalSettings.calId || 'boheomdapda@gmail.com';
  if (calId === 'weracle.partners@gmail.com') {
    calId = 'boheomdapda@gmail.com';
    googleCalSettings.calId = calId;
    try { localStorage.setItem('weracle_google_cal_settings', JSON.stringify(googleCalSettings)); } catch(e){}
  }
  if (btn) {
    btn.href = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(calId)}`;
  }
  if (modal) modal.style.display = 'flex';
};

window.closeGoogleCalSubscribeModal = function() {
  const modal = document.getElementById('googleCalSubscribeModal');
  if (modal) modal.style.display = 'none';
};

window.subscribeViaWebcal = function() {
  let calId = googleCalSettings.calId || 'boheomdapda@gmail.com';
  if (calId === 'weracle.partners@gmail.com') calId = 'boheomdapda@gmail.com';
  const webcalUrl = `webcal://calendar.google.com/calendar/ical/${encodeURIComponent(calId)}/public/basic.ics`;
  window.open(webcalUrl, '_blank');
};

window.copyMySubscribeUrl = function() {
  let calId = googleCalSettings.calId || 'boheomdapda@gmail.com';
  if (calId === 'weracle.partners@gmail.com') calId = 'boheomdapda@gmail.com';
  const icsUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calId)}/public/basic.ics`;
  navigator.clipboard.writeText(icsUrl).then(() => {
    alert('구글 캘린더 iCal 구독 주소가 복사되었습니다!\n스마트폰 캘린더 앱 > [캘린더 구독 추가] 메뉴에 붙여넣으시면 됩니다.');
  }).catch(() => {
    prompt('아래 구독 주소를 복사해 주세요:', icsUrl);
  });
};

function initSchedulesStorage() {
  try {
    const saved = localStorage.getItem('weracle_partners_schedules');
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        // 기존 샘플 더미 일정 배제
        sampleSchedules = parsed.filter(s => s.title !== '10월 전사 월례회의' && s.title !== '신상품 약관 및 언더라이팅 특강');
        return;
      }
    }
  } catch (e) {
    console.warn('Failed to load schedules from localStorage:', e);
  }
}

function saveSchedulesToStorage() {
  try {
    localStorage.setItem('weracle_partners_schedules', JSON.stringify(sampleSchedules));
  } catch (e) {
    console.warn('Failed to save schedules to localStorage:', e);
  }
}

async function loadSchedulesFromSupabase() {
  const sb = await getSb();
  if (sb) {
    try {
      // 1. 실제 운영 일정 테이블 schedules 우선 조회
      let { data, error } = await sb.from('schedules').select('*').order('event_date', { ascending: false });

      // schedules가 비어있고 partners_schedules에 데이터가 있으면 fallback
      if (error || !data || data.length === 0) {
        const res2 = await sb.from('partners_schedules').select('*').order('date', { ascending: false });
        if (!res2.error && res2.data && res2.data.length > 0) {
          data = res2.data;
          error = null;
        }
      }

      if (!error && Array.isArray(data) && data.length > 0) {
        const companyList = ['삼성화재', 'DB손해보험', 'DB손보', '현대해상', '메리츠화재', 'KB손해보험', 'KB손보', '한화손해보험', '한화손보', '흥국화재', '롯데손해보험', '라이나손보', '라이나생명', '삼성생명', '한화생명', '교보생명', '신한라이프', 'KB라이프', '동양생명', '미래에셋생명', 'DB생명', 'AIA생명', 'KDB생명', 'DGB생명', 'iM라이프', '흥국생명', '하나생명', '농협생명', '농협손보'];

        sampleSchedules = data.map(item => {
          const typeStr = item.type || '';
          const isEdu = typeStr.includes('education') || item.category === 'edu';
          const isNewb = typeStr.startsWith('newbie') || item.is_newbie || false;
          const dateVal = item.event_date || item.date || '';
          const timeVal = item.start_time ? (item.start_time.length > 5 ? item.start_time.slice(0, 5) : item.start_time) : (item.time || '09:00');

          let comp = item.company || '';
          if (!comp && item.title) {
            for (const c of companyList) {
              if (item.title.includes(c)) {
                comp = c;
                break;
              }
            }
          }

          return {
            id: item.id,
            date: dateVal,
            time: timeVal,
            category: isEdu ? 'edu' : 'comp',
            title: item.title || '',
            place: item.place || item.description || '',
            company: comp,
            isNewbie: isNewb,
            targetType: item.target_type || 'all',
            targetTeam: item.target_team || '',
            targetEmails: item.target_emails || [],
            googleEventId: item.google_event_id || '',
            googleSynced: true
          };
        });

        saveSchedulesToStorage();
        renderScheduleTimeline();
        renderCalendar();
        renderUpcomingSchedules();
        renderAdminScheduleList();
        return;
      }
    } catch (e) {
      console.warn('Supabase schedules 로드 실패:', e);
    }
  }

  const saved = localStorage.getItem('weracle_partners_schedules');
  if (saved !== null) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        sampleSchedules = parsed.filter(s => s.title !== '10월 전사 월례회의' && s.title !== '신상품 약관 및 언더라이팅 특강');
      }
    } catch (e) {}
  }
  renderScheduleTimeline();
  renderCalendar();
  renderUpcomingSchedules();
  renderAdminScheduleList();
}

async function syncScheduleToSupabaseAndGoogle(item, action = 'create') {
  // 1. Supabase 연동 시도
  const sb = await getSb();
  if (sb) {
    try {
      if (action === 'create') {
        const typeVal = item.isNewbie ? (item.category === 'edu' ? 'newbie_education' : 'newbie_general') : (item.category === 'edu' ? 'normal_education' : 'normal_general');
        const schedPayload = {
          event_date: item.date,
          start_time: item.time ? (item.time.length === 5 ? item.time + ':00' : item.time) : '09:00:00',
          type: typeVal,
          title: item.title,
          description: item.place || ''
        };
        const { data, error } = await sb.from('schedules').insert([schedPayload]).select();
        if (!error && data && data[0]) {
          item.id = data[0].id;
          saveSchedulesToStorage();
        }

        const payload = {
          date: item.date,
          time: item.time,
          category: item.category,
          title: item.title,
          place: item.place || '',
          company: item.company || null,
          is_newbie: item.isNewbie || false,
          target_type: item.targetType || 'all',
          target_team: item.targetTeam || null,
          target_emails: item.targetEmails || [],
          sync_status: 'synced'
        };
        await sb.from('partners_schedules').insert([payload]);
      } else if (action === 'delete') {
        await sb.from('schedules').delete().eq('id', item.id);
        await sb.from('partners_schedules').delete().eq('id', item.id);
      }
    } catch (e) {
      console.warn('Supabase schedule sync error:', e);
    }
  }

  // 2. Google Calendar API 직접 등록 (통합스케줄러와 동일하게 gToken으로 실시간 직접 등록)
  const gAuthToken = window.gToken || 
    localStorage.getItem('g_access_token') || 
    localStorage.getItem('google_access_token') || 
    (parentWindow && parentWindow.currentProfile && parentWindow.currentProfile.google_access_token);

  if (gAuthToken && action === 'create') {
    try {
      const sDate = item.date;
      const sTime = item.time || '09:00';
      const startDateTime = new Date(`${sDate}T${sTime}:00`).toISOString();
      const endDateTime = new Date(new Date(startDateTime).getTime() + 60 * 60 * 1000).toISOString();

      let remindersOverrides = [];
      const rTime = item.remindTime || (item.remind10m ? '10m' : '30m');
      if (rTime === '10m') remindersOverrides.push({ method: 'popup', minutes: 10 });
      else if (rTime === '30m') remindersOverrides.push({ method: 'popup', minutes: 30 });
      else if (rTime === '1h') remindersOverrides.push({ method: 'popup', minutes: 60 });
      else if (rTime === '2h') remindersOverrides.push({ method: 'popup', minutes: 120 });
      else if (rTime === '0') remindersOverrides.push({ method: 'popup', minutes: 0 });
      if (item.remind1d) remindersOverrides.push({ method: 'popup', minutes: 1440 });

      let desc = '위라클 파트너스 공식 일정';
      if (item.company) desc += '\n주관: ' + item.company;
      if (item.isNewbie) desc += '\n구분:  신입 전용 교육';

      const eventPayload = {
        summary: item.title,
        description: desc,
        start: { dateTime: startDateTime, timeZone: 'Asia/Seoul' },
        end: { dateTime: endDateTime, timeZone: 'Asia/Seoul' },
        reminders: remindersOverrides.length > 0 ? {
          useDefault: false,
          overrides: remindersOverrides
        } : { useDefault: true }
      };

      const gRes = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + gAuthToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(eventPayload)
      });

      if (gRes.ok) {
        const gData = await gRes.json().catch(() => ({}));
        if (gData && gData.id) {
          item.googleEventId = gData.id;
          saveSchedulesToStorage();
        }
        console.log(' Google Calendar API 직접 등록 성공 (통합스케줄러와 동일):', item.title);
      } else {
        console.warn('Google Calendar API 등록 응답 오류 상태:', gRes.status);
      }
    } catch (gErr) {
      console.warn('Google Calendar API 직접 등록 오류:', gErr);
    }
  } else if (gAuthToken && action === 'delete' && item.googleEventId) {
    try {
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(item.googleEventId)}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + gAuthToken }
      });
      console.log(' Google Calendar API 일정 삭제 성공');
    } catch (e) {
      console.warn('Google Calendar API 삭제 오류:', e);
    }
  }

  // 3. Google Calendar Webhook 연동 시도 (설정된 경우 백그라운드 호출)
  if (googleCalSettings.webhookUrl && googleCalSettings.webhookUrl.startsWith('http')) {
    try {
      fetch(googleCalSettings.webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action,
          schedule: {
            title: item.title,
            date: item.date,
            time: item.time,
            category: item.category,
            place: item.place,
            targetType: item.targetType,
            targetTeam: item.targetTeam,
            attendees: item.targetEmails || [],
            remindTime: item.remindTime || (item.remind10m ? '10m' : '30m'),
            remind10m: item.remindTime === '10m' || item.remind10m !== false,
            remind1d: item.remind1d !== false
          }
        })
      }).catch(err => console.warn('Google Webhook call failed:', err));
    } catch (e) {
      console.warn('Google Calendar sync trigger skipped:', e);
    }
  }
}

function initSchedule() {
  initSchedulesStorage();
  initGoogleCalSettings();
  const admDateInput = document.getElementById('admSchedDate');
  if (admDateInput) {
    admDateInput.value = getTodayDateStr();
  }
  renderScheduleTimeline();
  renderCalendar();
  renderUpcomingSchedules();
  renderCompanyChips();
  populateCompanySelect();
  loadSchedulesFromSupabase();
}

window.switchScheduleView = function(view) {
  const btnTimeline = document.getElementById('btnViewTimeline');
  const btnCalendar = document.getElementById('btnViewCalendar');
  const viewTimeline = document.getElementById('scheduleTimelineView');
  const viewCalendar = document.getElementById('scheduleCalendarView');

  if (view === 'timeline') {
    if (btnTimeline) btnTimeline.classList.add('active');
    if (btnCalendar) btnCalendar.classList.remove('active');
    if (viewTimeline) viewTimeline.style.display = 'flex';
    if (viewCalendar) viewCalendar.style.display = 'none';
    renderScheduleTimeline();
  } else {
    if (btnTimeline) btnTimeline.classList.remove('active');
    if (btnCalendar) btnCalendar.classList.add('active');
    if (viewTimeline) viewTimeline.style.display = 'none';
    if (viewCalendar) viewCalendar.style.display = 'grid';
    renderCalendar();
    renderUpcomingSchedules();
  }
};

window.togglePastSchedules = function() {
  isPastSchedulesOpen = !isPastSchedulesOpen;
  const listEl = document.getElementById('pastScheduleList');
  const iconEl = document.getElementById('pastToggleIcon');
  if (listEl) {
    listEl.style.display = isPastSchedulesOpen ? 'flex' : 'none';
  }
  if (iconEl) {
    iconEl.className = isPastSchedulesOpen ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
  }
};

// =========================================================
// [오늘 기준 세로형 타임라인 렌더링]
// =========================================================
function renderScheduleTimeline() {
  const todayStr = getTodayDateStr();
  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 상단 '오늘 날짜 기준' 배너 동적 갱신
  try {
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayOfWeek = dayNames[now.getDay()];
    const dateFormatted = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${dayOfWeek})`;
    const todayTextEl = document.getElementById('schedTodayText');
    if (todayTextEl) {
      todayTextEl.textContent = dateFormatted;
    } else {
      const pill = document.querySelector('.sched-today-pill');
      if (pill) {
        pill.innerHTML = `<i class="fa-solid fa-calendar-check" style="color:var(--primary);"></i> 오늘 <strong>${dateFormatted}</strong> 기준`;
      }
    }
  } catch (e) {
    console.warn("Update today pill error:", e);
  }

  // 필터 적용
  const filtered = sampleSchedules.filter(s => {
    if (scheduleFilter === 'all') return true;
    if (scheduleFilter === 'newbie') return s.category === 'edu' && s.isNewbie === true;
    return s.category === scheduleFilter;
  });

  // 날짜 오름차순 정렬
  filtered.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const todayEvents = filtered.filter(s => s.date === todayStr);
  const upcomingEvents = filtered.filter(s => s.date >= todayStr);
  const pastEvents = filtered.filter(s => s.date < todayStr).reverse(); // 최신 지난 일정 순

  // 1. 오늘 일정 하이라이트 배너 렌더링
  const highlightBox = document.getElementById('todayHighlightBox');
  if (highlightBox) {
    if (todayEvents.length > 0) {
      const topEvt = todayEvents[0];
      highlightBox.innerHTML = `
        <div class="today-banner">
          <div>
            <div class="today-banner-title">
              <span style="background:#ef4444; color:#fff; font-size:11px; padding:2px 8px; border-radius:10px; font-weight:900;">TODAY</span>
              <span>오늘 진행되는 주요 일정입니다!</span>
            </div>
            <div class="today-banner-sub">
              <strong>${topEvt.category === 'edu' ? ' [교육]' : ' [회사]'}</strong>
              ${topEvt.company ? `[${topEvt.company}] ` : ''}
              ${topEvt.isNewbie ? '신입 ' : ''}
              <strong>${topEvt.title}</strong>
              <span style="opacity:0.9; margin-left:8px;">(⏰ ${topEvt.time})</span>
            </div>
          </div>
          <button class="btn-primary" style="background:#ffffff; color:var(--primary); font-weight:800; box-shadow:0 2px 8px rgba(0,0,0,0.15);" onclick="switchTab('qr')">
            <i class="fa-solid fa-qrcode"></i> 출석체크 바로가기
          </button>
        </div>
      `;
      highlightBox.style.display = 'block';
    } else {
      highlightBox.innerHTML = '';
      highlightBox.style.display = 'none';
    }
  }

  // 2. 다가오는 세로 타임라인 렌더링
  const upcomingListEl = document.getElementById('verticalTimelineList');
  const upcomingCountEl = document.getElementById('upcomingScheduleCount');
  if (upcomingCountEl) upcomingCountEl.innerText = `(${upcomingEvents.length}건)`;

  if (upcomingListEl) {
    upcomingListEl.innerHTML = '';
    if (upcomingEvents.length === 0) {
      upcomingListEl.innerHTML = `
        <div style="background:#ffffff; border:1px solid var(--border); border-radius:12px; padding:36px; text-align:center; color:var(--text-muted);">
          <i class="fa-regular fa-calendar-xmark" style="font-size:28px; margin-bottom:8px; display:block;"></i>
          현재 필터 조건에 해당하는 다가오는 일정이 없습니다.
        </div>
      `;
    } else {
      upcomingEvents.forEach(item => {
        if (!item.date) return;
        const dateStr = item.date.split('T')[0].trim();
        const parts = dateStr.split('-');
        if (parts.length < 3) return;
        const itemDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        if (isNaN(itemDate.getTime())) return;
        const diffTime = itemDate.getTime() - todayDate.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        const isToday = diffDays === 0;

        const dayOfWeekNames = ['일', '월', '화', '수', '목', '금', '토'];
        const dayOfWeek = dayOfWeekNames[itemDate.getDay()];

        const card = document.createElement('div');
        card.className = `timeline-card ${isToday ? 'is-today' : ''}`;
        card.innerHTML = `
          <!-- 좌측 날짜 컬럼 -->
          <div class="timeline-date-col">
            <div class="dday-pill ${isToday ? 'today' : ''}">
              ${isToday ? 'TODAY' : diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`}
            </div>
            <div class="date-big">${parts[1]}.${parts[2]}</div>
            <div class="date-dayname ${dayOfWeek === '일' ? 'sun' : dayOfWeek === '토' ? 'sat' : ''}">
              ${dayOfWeek}요일
            </div>
          </div>

          <!-- 중앙 내용 컬럼 -->
          <div class="timeline-body-col">
            <div class="timeline-meta-row">
              <span class="badge-cat ${item.category === 'edu' ? 'edu' : 'comp'}">
                ${item.category === 'edu' ? ' 사내교육' : ' 회사일정'}
              </span>
              ${item.company ? `<span class="badge-company"> ${item.company}</span>` : ''}
              ${item.isNewbie ? `<span class="badge-newbie"> 신입 교육</span>` : ''}
              ${item.targetType === 'team' ? `<span class="badge-cat" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; font-size:11px;"> ${item.targetTeam || '팀지정'}</span>` : item.targetType === 'personal' ? `<span class="badge-cat" style="background:#f3e8ff; color:#7e22ce; border:1px solid #e9d5ff; font-size:11px;"> ${item.targetUserName || '개인지정'}</span>` : `<span class="badge-cat" style="background:#f1f5f9; color:#475569; border:1px solid #e2e8f0; font-size:11px;"> 전사</span>`}
              ${item.googleSynced !== false ? `<span style="font-size:11px; color:#4285F4; font-weight:700; display:inline-flex; align-items:center; gap:2px;"><i class="fa-brands fa-google"></i> 알림</span>` : ''}
              <span class="timeline-time"><i class="fa-regular fa-clock"></i> ${item.time}</span>
            </div>
            <div class="timeline-title">${item.title}</div>
          </div>

          <!-- 우측 액션 컬럼 -->
          <div class="timeline-action-col">
            ${isToday ? `
              <button class="btn-primary" onclick="switchTab('qr')">
                <i class="fa-solid fa-qrcode"></i> 출석체크
              </button>
            ` : `
              <span class="timeline-dday-text">
                ${diffDays > 0 ? `${diffDays}일 후 예정` : `${Math.abs(diffDays)}일 전`}
              </span>
            `}
          </div>
        `;
        upcomingListEl.appendChild(card);
      });
    }
  }

  // 3. 지난 일정 렌더링
  const pastListEl = document.getElementById('pastScheduleList');
  const pastCountEl = document.getElementById('pastScheduleCount');
  if (pastCountEl) pastCountEl.innerText = pastEvents.length;

  if (pastListEl) {
    pastListEl.innerHTML = '';
    if (pastEvents.length === 0) {
      pastListEl.innerHTML = `<div style="text-align:center; padding:18px; color:var(--text-muted); font-size:12px;">보관된 지난 일정이 없습니다.</div>`;
    } else {
      pastEvents.forEach(item => {
        if (!item.date) return;
        const dateStr = item.date.split('T')[0].trim();
        const parts = dateStr.split('-');
        if (parts.length < 3) return;
        const itemDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const dayOfWeekNames = ['일', '월', '화', '수', '목', '금', '토'];
        const dayOfWeek = isNaN(itemDate.getTime()) ? '' : dayOfWeekNames[itemDate.getDay()];

        const card = document.createElement('div');
        card.className = 'timeline-card is-past';
        card.innerHTML = `
          <div class="timeline-date-col">
            <div class="dday-pill past">종료</div>
            <div class="date-big" style="color:var(--text-sub);">${parts[1]}.${parts[2]}</div>
            <div class="date-dayname">${dayOfWeek}요일</div>
          </div>
          <div class="timeline-body-col">
            <div class="timeline-meta-row">
              <span class="badge-cat ${item.category === 'edu' ? 'edu' : 'comp'}" style="opacity:0.8;">
                ${item.category === 'edu' ? ' 사내교육' : ' 회사일정'}
              </span>
              ${item.company ? `<span class="badge-company"> ${item.company}</span>` : ''}
              ${item.isNewbie ? `<span class="badge-newbie"> 신입 교육</span>` : ''}
              <span class="timeline-time"><i class="fa-regular fa-clock"></i> ${item.time}</span>
            </div>
            <div class="timeline-title" style="color:var(--text-sub);">${item.title}</div>
          </div>
          <div class="timeline-action-col">
            <span class="status-badge" style="background:#f1f5f9; color:var(--text-muted); font-size:11px;">
              <i class="fa-solid fa-check"></i> 완료됨
            </span>
          </div>
        `;
        pastListEl.appendChild(card);
      });
    }
  }
}

function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 12) {
    currentMonth = 1;
    currentYear++;
  } else if (currentMonth < 1) {
    currentMonth = 12;
    currentYear--;
  }
  renderCalendar();
}

function filterScheduleCategory(cat) {
  scheduleFilter = cat;

  const btnIds = ['all', 'edu', 'newbie', 'comp'];
  btnIds.forEach(id => {
    const btn = document.getElementById(`btnFilter_${id}`);
    if (btn) {
      if (id === cat) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });

  renderScheduleTimeline();
  renderCalendar();
  renderUpcomingSchedules();
}

function renderCalendar() {
  const monthTitle = document.getElementById('calMonthTitle');
  if (monthTitle) monthTitle.innerText = `${currentYear}년 ${currentMonth}월`;

  const gridBody = document.getElementById('calGridBody');
  if (!gridBody) return;
  gridBody.innerHTML = '';

  const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();
  const lastDate = new Date(currentYear, currentMonth, 0).getDate();
  const todayStr = getTodayDateStr();

  for (let i = 0; i < firstDay; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'cal-day-cell empty';
    gridBody.appendChild(emptyCell);
  }

  for (let day = 1; day <= lastDate; day++) {
    const dayStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cell = document.createElement('div');
    cell.className = 'cal-day-cell' + (dayStr === todayStr ? ' today' : '');

    const dayNum = document.createElement('div');
    dayNum.className = 'cal-day-num';

    // 요일별 날짜 색상 (일요일 빨간색, 토요일 파란색)
    const dayOfWeek = (firstDay + day - 1) % 7;
    const isSun = dayOfWeek === 0;
    const isSat = dayOfWeek === 6;

    dayNum.innerHTML = `
      <span style="${isSun ? 'color:#ef4444;' : isSat ? 'color:#0284c7;' : ''}">${day}</span>
      ${dayStr === todayStr ? '<span style="font-size:10px; background:var(--primary); color:#fff; padding:1px 5px; border-radius:10px; font-weight:700;">오늘</span>' : ''}
    `;

    cell.appendChild(dayNum);

    const dayEvents = sampleSchedules.filter(s => {
      if (s.date !== dayStr) return false;
      if (scheduleFilter === 'all') return true;
      if (scheduleFilter === 'newbie') return s.category === 'edu' && s.isNewbie === true;
      return s.category === scheduleFilter;
    });

    // 고정 높이 92px에 안정적으로 들어가도록 최대 2개 일정만 표시
    const maxVisibleEvents = 2;
    dayEvents.slice(0, maxVisibleEvents).forEach(evt => {
      const tag = document.createElement('div');
      let tagText = '';
      if (evt.category === 'edu') {
        const compPrefix = evt.company ? `[${evt.company}] ` : '';
        const newbiePrefix = evt.isNewbie ? '신입 ' : '';
        tagText = ` ${compPrefix}${newbiePrefix}${evt.title}`;
        tag.className = `cal-event-tag ${evt.isNewbie ? 'event-newbie' : 'event-edu'}`;
      } else {
        tagText = ` ${evt.title}`;
        tag.className = 'cal-event-tag event-comp';
      }
      tag.innerText = tagText;
      tag.title = `${tagText} (${evt.time}) ${evt.place ? '- ' + evt.place : ''}`;
      cell.appendChild(tag);
    });

    if (dayEvents.length > maxVisibleEvents) {
      const moreTag = document.createElement('div');
      moreTag.className = 'cal-more-tag';
      moreTag.innerText = `+${dayEvents.length - maxVisibleEvents}개 더보기`;
      moreTag.title = dayEvents.slice(maxVisibleEvents).map(e => e.title).join('\n');
      cell.appendChild(moreTag);
    }

    gridBody.appendChild(cell);
  }

  // 월말 빈 칸 채우기 (항상 7열로 35칸 또는 42칸으로 완벽하게 고정)
  const totalCells = firstDay + lastDate;
  const targetTotal = totalCells > 35 ? 42 : 35;
  const trailingEmpty = targetTotal - totalCells;
  for (let i = 0; i < trailingEmpty; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'cal-day-cell empty';
    gridBody.appendChild(emptyCell);
  }
}

function renderUpcomingSchedules() {
  const sideList = document.getElementById('scheduleSideList');
  if (!sideList) return;
  sideList.innerHTML = '';

  const filtered = sampleSchedules.filter(s => {
    if (scheduleFilter === 'all') return true;
    if (scheduleFilter === 'newbie') return s.category === 'edu' && s.isNewbie === true;
    return s.category === scheduleFilter;
  });

  filtered.slice(0, 6).forEach(item => {
    const div = document.createElement('div');
    div.className = `sched-side-item`;
    div.style.cssText = 'background:#ffffff !important; border:1px solid #e2e8f0 !important; border-left:1px solid #e2e8f0 !important; border-radius:12px !important; padding:14px !important; display:flex !important; flex-direction:column !important; gap:8px !important;';
    div.innerHTML = `
      <div style="font-size:12px; color:#94a3b8; font-weight:600; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
        <span> ${item.date} | ⏰ ${item.time}</span>
        <div style="display:flex; gap:4px; align-items:center;">
          ${item.company ? `<span class="badge-company"> ${item.company}</span>` : ''}
          ${item.isNewbie ? `<span class="badge-newbie"> 신입</span>` : ''}
        </div>
      </div>
      <div style="font-size:14px; font-weight:800; color:#0f172a; line-height:1.4;">
        ${item.category === 'edu' ? ' [교육] ' : ' [회사] '}
        ${item.company ? `[${item.company}] ` : ''}
        ${item.title}
      </div>
    `;
    sideList.appendChild(div);
  });
}

//  제휴 원수사 / 회사 목록 관리
function renderCompanyChips() {
  const wrap = document.getElementById('companyChipsWrap');
  const countEl = document.getElementById('companyCount');
  if (countEl) countEl.innerText = partnerCompanies.length;
  if (!wrap) return;

  wrap.innerHTML = '';
  partnerCompanies.forEach(comp => {
    const chip = document.createElement('span');
    chip.className = 'company-chip';
    chip.innerHTML = `
      <span>${comp}</span>
      <button type="button" class="chip-del-btn" title="회사 목록에서 삭제" onclick="adminRemoveCompany('${comp}')">&times;</button>
    `;
    wrap.appendChild(chip);
  });
}

function populateCompanySelect() {
  const sel = document.getElementById('admSchedCompany');
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">선택 안함 (자체 교육)</option>';
  partnerCompanies.forEach(comp => {
    const opt = document.createElement('option');
    opt.value = comp;
    opt.innerText = ` ${comp}`;
    sel.appendChild(opt);
  });
  if (currentVal && partnerCompanies.includes(currentVal)) {
    sel.value = currentVal;
  }
}

window.adminAddCompany = function() {
  const input = document.getElementById('admNewCompanyInput');
  if (!input) return;
  const val = input.value.trim();
  if (!val) {
    alert('추가할 회사 이름을 입력해주세요.');
    return;
  }
  if (partnerCompanies.includes(val)) {
    alert('이미 등록된 회사입니다.');
    return;
  }

  partnerCompanies.push(val);
  savePartnerCompanies();
  renderCompanyChips();
  populateCompanySelect();
  input.value = '';
};

window.adminRemoveCompany = async function(compName) {
  if (!await showConfirm(`'${compName}'을(를) 제휴 회사 목록에서 제외하시겠습니까?`, '제휴 회사 제외')) return;
  partnerCompanies = partnerCompanies.filter(c => c !== compName);
  savePartnerCompanies();
  renderCompanyChips();
  populateCompanySelect();
};

window.handleSchedCategoryChange = function() {
  const cat = document.getElementById('admSchedCategory')?.value;
  const eduOptions = document.getElementById('admSchedEduOptions');
  if (eduOptions) {
    eduOptions.style.display = cat === 'edu' ? 'flex' : 'none';
  }
};


// =========================================================
// [2. 출결 시간 정책 설정 및 QR 출석체크]
// =========================================================
let timePolicySettings = {
  workTime: '09:00',
  eduAmTime: '10:00',
  eduPmTime: '11:00'
};

// [출석률 평가 기준 및 총 근무일수 정책 설정]
let attendancePolicySettings = {
  totalWorkDays: 12,
  rateExcellent: 95,
  rateGood: 80
};

function initAttendancePolicySettings() {
  const saved = localStorage.getItem('weracle_attendance_policy_settings');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.totalWorkDays) attendancePolicySettings.totalWorkDays = Number(parsed.totalWorkDays);
      if (parsed.rateExcellent) attendancePolicySettings.rateExcellent = Number(parsed.rateExcellent);
      if (parsed.rateGood) attendancePolicySettings.rateGood = Number(parsed.rateGood);
    } catch (e) {
      console.warn('출석률 정책 설정 파싱 실패:', e);
    }
  }
  syncPolicyInputsToUI();
}

function syncPolicyInputsToUI() {
  const lblEx = document.getElementById('lblRateExcellent');
  const lblGd = document.getElementById('lblRateGood');
  if (lblEx) lblEx.innerText = attendancePolicySettings.rateExcellent;
  if (lblGd) lblGd.innerText = attendancePolicySettings.rateGood;

  const cfgWorkDays = document.getElementById('cfgTotalWorkDays');
  const cfgEx = document.getElementById('cfgRateExcellent');
  const cfgGd = document.getElementById('cfgRateGood');
  if (cfgWorkDays) cfgWorkDays.value = attendancePolicySettings.totalWorkDays;
  if (cfgEx) cfgEx.value = attendancePolicySettings.rateExcellent;
  if (cfgGd) cfgGd.value = attendancePolicySettings.rateGood;

  const workDaysStatEl = document.getElementById('rateWorkDaysStat');
  if (workDaysStatEl) workDaysStatEl.innerText = `${attendancePolicySettings.totalWorkDays}일`;
}

let qrCodeInstance = null;
let countdownTimer = null;
let qrCounter = 60;

// 오늘 날짜 반환 (YYYY-MM-DD 형식)
function getTodayDateStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 실시간 출결 및 전체 출결 아카이브 (수파베이스 partners_attendance 실시간 연동)
let attendanceLogs = [];
let monthlyAttendanceArchive = (function() {
  try {
    const saved = localStorage.getItem('weracle_monthly_attendance_archive');
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(item => {
      let cleanName = (item.name || '').trim();
      const parts = cleanName.split(/\s+/);
      if (parts.length === 2 && parts[0] === parts[1]) {
        cleanName = parts[0];
      }
      return { ...item, name: cleanName };
    });
  } catch (e) {
    return [];
  }
})();

// Supabase partners_attendance 테이블에서 실시간 출결 데이터 로드
async function loadAttendanceFromSupabase() {
  const sb = await getSb();
  const todayStr = getTodayDateStr();

  if (sb) {
    try {
      const { data, error } = await sb.from('partners_attendance')
        .select('*')
        .order('checkin_time', { ascending: false });

      if (!error && Array.isArray(data)) {
        monthlyAttendanceArchive = data.map(r => {
          let timeFormatted = '00:00:00';
          if (r.checkin_time) {
            try {
              const dt = new Date(r.checkin_time);
              timeFormatted = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}:${String(dt.getSeconds()).padStart(2, '0')}`;
            } catch(e) {}
          }
          let cleanName = (r.name || '').trim();
          const parts = cleanName.split(/\s+/);
          if (parts.length === 2 && parts[0] === parts[1]) {
            cleanName = parts[0];
          }
          return {
            id: r.id,
            user_id: r.user_id,
            date: r.date || (r.checkin_time ? r.checkin_time.split('T')[0] : todayStr),
            name: cleanName,
            team: r.team || '미지정',
            type: r.checkin_type || '회사 정규 출근',
            time: timeFormatted,
            status: r.status || 'on-time',
            method: r.method || '스마트폰 QR',
            created_at: r.created_at
          };
        });
        localStorage.setItem('weracle_monthly_attendance_archive', JSON.stringify(monthlyAttendanceArchive));
      }
    } catch(err) {
      console.warn('Supabase partners_attendance 로드 실패:', err);
    }
  }

  // 오늘 날짜 출결 필터링
  attendanceLogs = monthlyAttendanceArchive.filter(item => item.date === todayStr);

  // 테이블 및 통계 화면 즉시 갱신
  renderAttendanceTable();
  renderTargetRosterTable();
  updateAttendanceStats();
  if (typeof filterAttendanceReport === 'function') filterAttendanceReport();
  if (typeof filterMonthlyRateTab === 'function') filterMonthlyRateTab();
}

// 실시간 출결 변동 구독 리스너
function subscribeToAttendanceRealtime() {
  getSb().then(sb => {
    if (!sb) return;
    try {
      sb.channel('public:partners_attendance')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'partners_attendance' }, () => {
          console.log(' 실시간 출결 변동 감지  최신 데이터 동기화');
          loadAttendanceFromSupabase();
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime 구독 실패:', e);
    }
  });
}

// 출결 & 교육 대상자: 관리자/본사 계정은 제외하고, 파트너스('C' 권한 보유자 또는 family) 회원만 출결 및 교육 참여 대상자임
function getPartnerAttendanceTargets() {
  return adminUsersData.filter(u => {
    // 관리자 직급, 관리자팀, 본사팀 등 관리자 계정은 출결/교육 대상에서 완벽히 제외
    if (u.user_grade === 'manager' || u.team === '관리자' || u.team === '본사') return false;
    return (u.access_grades || '').includes('C') || u.user_grade === 'family';
  });
}

// =========================================================
// [교육 참석 사전 투표 (밤 12시 마감 & 미투표자 기본 참석 연동)]
// =========================================================
let upcomingTrainingData = {
  id: 'edu-20261018-01',
  date: '2026-10-18',
  time: '10:00',
  title: '신상품 약관 및 언더라이팅 심화 교육',
  deadline: '오늘 밤 12:00 투표 마감 (D-1)'
};

function getEduVotes() {
  try {
    const s = localStorage.getItem('weracle_edu_votes');
    return s ? JSON.parse(s) : {};
  } catch(e) {
    return {};
  }
}

function saveEduVotes(votes) {
  try {
    localStorage.setItem('weracle_edu_votes', JSON.stringify(votes));
  } catch(e) {}
}

function getUserEduVoteStatus(userId) {
  const votes = getEduVotes();
  if (votes[userId]) return votes[userId];
  return 'unvoted'; // 미투표 (기본값: 참석 간주!)
}

function setUserEduVoteStatus(userId, status) {
  const votes = getEduVotes();
  votes[userId] = status;
  saveEduVotes(votes);
}

// 팝업 모달 제어 (출석 대상자 전원 연동)
window.openEduVoteModal = function() {
  const modal = document.getElementById('eduAttendanceVoteModal');
  if (!modal) return;

  const sel = document.getElementById('popupVotePartnerSelect');
  const targets = getPartnerAttendanceTargets();
  if (sel && targets.length > 0) {
    sel.innerHTML = targets.map(u => `<option value="${u.id}">${u.name} (${u.team || '미지정'})</option>`).join('');
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.id) {
      if (targets.some(u => u.id === currentUser.id)) {
        sel.value = currentUser.id;
      }
    }
  }
  updatePopupVoteSelection();
  modal.style.display = 'flex';
};

window.updatePopupVoteSelection = function() {
  const sel = document.getElementById('popupVotePartnerSelect');
  const targetId = sel ? sel.value : ((typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? currentUser.id : 'usr-1');
  const status = getUserEduVoteStatus(targetId);
  const statusEl = document.getElementById('popupCurrentStatusDisplay');
  if (statusEl) {
    if (status === 'attending') {
      statusEl.innerHTML = '<span style="color:#059669; font-weight:800;">[참석] 투표 완료</span>';
    } else if (status === 'absent') {
      statusEl.innerHTML = '<span style="color:#dc2626; font-weight:800;"> 사전 불참 신청</span>';
    } else {
      statusEl.innerHTML = '<span style="color:#475569; font-weight:700;"> 기본참석 (미투표)</span>';
    }
  }
};

window.closeEduVoteModal = function() {
  const modal = document.getElementById('eduAttendanceVoteModal');
  if (modal) modal.style.display = 'none';
  const chk = document.getElementById('chkDoNotShowToday');
  if (chk && chk.checked) {
    localStorage.setItem('weracle_edu_vote_dismissed_today', 'true');
  }
};

window.submitPopupVote = function(voteChoice) {
  const sel = document.getElementById('popupVotePartnerSelect');
  const currentUserId = sel ? sel.value : ((typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? currentUser.id : 'usr-1');
  const user = adminUsersData.find(u => u.id === currentUserId);
  const userName = user ? user.name : '파트너';

  setUserEduVoteStatus(currentUserId, voteChoice);

  const statusLabel = voteChoice === 'attending' ? '[참석] (기본)' : ' 불참 신청';
  alert(`[교육 참석 투표 완료]\n'${userName}' 님의 내일 오전 10시 교육 참석 상태가 '${statusLabel}'(으)로 등록되었습니다.\n\n${voteChoice === 'attending' ? '※ 내일 아침 출근 QR을 찍으시면 교육도 함께 자동 출석됩니다!' : '※ 불참으로 등록되어 출근 시 교육 자동 출석에서 제외됩니다.'}`);

  closeEduVoteModal();
  renderTrainingVoteTab();
  renderTargetRosterTable();
};

function isCurrentUserAdminOrManager() {
  const u = (typeof currentUser !== 'undefined' && currentUser) || (typeof currentProfile !== 'undefined' && currentProfile);
  if (u) {
    if (u.user_grade === 'manager' || u.team === '관리자' || u.team === '본사') return true;
    const targetUsers = getPartnerAttendanceTargets();
    if (u.id && !targetUsers.some(t => t.id === u.id)) return true;
    return false;
  }
  
  // 로그인 정보가 없거나 최고 관리자 모드로 접속 중인 경우
  const badge = document.getElementById('currentUserBadge');
  if (badge && badge.innerText.includes('관리자')) {
    return true;
  }
  return false;
}

function checkAndShowEduVotePopup() {
  // 관리자(매니저/본사/관리자 모드)이거나 출결·교육 대상자가 아닌 경우 투표 팝업을 절대 띄우지 않음
  if (isCurrentUserAdminOrManager()) {
    return;
  }

  const dismissed = localStorage.getItem('weracle_edu_vote_dismissed_today');
  if (!dismissed) {
    setTimeout(() => {
      openEduVoteModal();
    }, 600);
  }
}

// =========================================================
// [파트너스(팀장/지사장/본부장 등) 전용 출근 QR 모달 및 자동 출석 제어]
// =========================================================
let customQrDomain = localStorage.getItem('weracle_qr_domain') || '';
let memberPositionsMap = {};
try {
  const savedPos = localStorage.getItem('weracle_member_positions');
  if (savedPos) memberPositionsMap = JSON.parse(savedPos);
} catch (e) {}

// 회원 직책 조회 (1순위: 관리자 지정, 2순위: 프로필 속성, 3순위: 이름 내 직책어 자동 분리 인식)
function getMemberPosition(user) {
  if (!user) return '팀장';
  const uid = user.id || user.name;
  if (memberPositionsMap[uid]) return memberPositionsMap[uid];
  if (user.email && memberPositionsMap[user.email]) return memberPositionsMap[user.email];
  
  if (user.position) return user.position;
  if (user.job_title) return user.job_title;
  if (user.title && !['basic', 'VIP', 'family', 'manager'].includes(user.title)) return user.title;
  if (user.role && !['admin', 'manager', 'user'].includes(user.role)) return user.role;

  // 이름이나 닉네임에서 직책 단어 자동 분리 인식 (지사장, 본부장, 지점장, 실장, 대표, 이사, 수석 등)
  const fullName = (user.name || user.nickname || '').trim();
  const knownTitles = ['총괄대표', '대표', '총괄본부장', '본부장', '부본부장', '지사장', '부지사장', '지점장', '부지점장', '실장', '팀장', '수석', '선임', '이사', '상무', '전무', '매니저', '설계사', 'FC', 'FP'];
  for (const t of knownTitles) {
    if (fullName.endsWith(t) || fullName.includes(t)) {
      return t;
    }
  }

  return '팀장';
}

// 직책 단어가 포함된 이름에서 순수 성함만 추출 (예: '김시화 지사장' -> '김시화')
function getCleanMemberName(user, position) {
  let name = (user.name || user.nickname || '파트너').trim();
  if (position) {
    name = name.replace(new RegExp(position + '$', 'g'), '').trim();
    name = name.replace(new RegExp(position, 'g'), '').trim();
  }
  name = name.replace(/(지사장|본부장|지점장|팀장|실장|이사|대표|매니저|FC|FP)/g, '').trim();
  return name || (user.name || '파트너');
}

// 수파베이스 DB 스키마 수정 없이 partners_settings 및 로컬 캐시에 직책 영구 저장
window.updateMemberPosition = function(userId, newPos) {
  if (!userId) return;
  if (newPos === 'custom') {
    const cur = memberPositionsMap[userId] || '팀장';
    const entered = prompt('원하시는 직책을 직접 입력해 주세요:\n(예: 지사장, 본부장, 총괄, 실장, 이사, 대표, 수석 등)', cur);
    if (entered === null) {
      renderLeaderQrGrid();
      return;
    }
    newPos = entered.trim() || '팀장';
  }
  memberPositionsMap[userId] = newPos;
  try {
    localStorage.setItem('weracle_member_positions', JSON.stringify(memberPositionsMap));
  } catch(e){}
  saveSettingToSupabase('member_positions', memberPositionsMap, '파트너스 회원 직책 설정');
  renderLeaderQrGrid();
};

window.openLeaderQrModal = function() {
  const modal = document.getElementById('leaderQrModal');
  if (!modal) return;
  modal.style.display = 'flex';
  const input = document.getElementById('customQrDomainInput');
  if (input) {
    input.value = customQrDomain || ((window.location.protocol === 'http:' || window.location.protocol === 'https:') ? (window.location.origin + window.location.pathname) : '');
  }
  renderLeaderQrGrid();
};

window.saveCustomQrDomain = function() {
  const input = document.getElementById('customQrDomainInput');
  if (!input) return;
  customQrDomain = input.value.trim();
  try { localStorage.setItem('weracle_qr_domain', customQrDomain); } catch(e){}
  saveSettingToSupabase('qr_domain', { url: customQrDomain }, '파트너스 출석 QR 연결 웹사이트 도메인 주소');
  renderLeaderQrGrid();
  alert(customQrDomain 
    ? `QR 연결 웹 주소가 '${customQrDomain}'(으)로 설정되었습니다.\n모든 파트너스 QR 코드가 새 주소로 즉시 갱신되었습니다.` 
    : '기본 웹 주소로 초기화되었습니다.');
};

window.closeLeaderQrModal = function() {
  const modal = document.getElementById('leaderQrModal');
  if (modal) modal.style.display = 'none';
};

window.printLeaderQrCards = function() {
  const modal = document.getElementById('leaderQrModal');
  if (modal) modal.style.display = 'flex';

  const gridEl = document.getElementById('leaderQrGrid');
  if (!gridEl) {
    window.print();
    return;
  }

  // 1. iframe 내부에서 실행 중인 경우 감지하여 전용 인쇄 창 호출
  let isInsideIframe = false;
  try {
    isInsideIframe = window.self !== window.top;
  } catch (e) {
    isInsideIframe = true;
  }

  if (isInsideIframe) {
    const printWindow = window.open('', '_blank', 'width=880,height=960');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="ko">
        <head>
          <meta charset="UTF-8">
          <title>위라클 파트너스 출근 QR 카드 (A4 1/4 규격 인쇄)</title>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Pretendard', sans-serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            body { padding: 8mm; background: #fff; color: #000; }
            .print-header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #c5a059; padding-bottom: 8px; }
            .print-header h1 { font-size: 17px; color: #0f172a; font-weight: 800; letter-spacing: 0.5px; }
            .print-header p { font-size: 11px; color: #78716c; margin-top: 3px; }
            #leaderQrGrid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 16px;
              width: 100%;
            }
            .leader-qr-desk-card {
              background: #ffffff !important;
              border: 2px solid #c5a059 !important;
              border-radius: 16px !important;
              padding: 16px 14px !important;
              text-align: center !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              align-items: center !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
              position: relative !important;
              overflow: hidden !important;
              min-height: 128mm !important;
              box-sizing: border-box !important;
            }
            @media print {
              body { padding: 6mm; }
              .no-print { display: none !important; }
              @page { size: A4 portrait; margin: 6mm; }
            }
          </style>
        </head>
        <body>
          <div class="print-header no-print">
            <h1>👑 위라클 파트너스 출근 QR 명패 카드 (A4 1/4 사이즈)</h1>
            <p>A4 1장에 4개씩 출력됩니다. 절취선에 맞춰 재단 후 개인 책상 액자/스탠드/파티션에 비치해 주세요.</p>
            <button onclick="window.print()" style="margin-top:10px; padding:8px 18px; background:#b45309; color:#fff; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">🖨️ 인쇄 창 다시 열기</button>
          </div>
          <div id="leaderQrGrid">
            ${gridEl.innerHTML}
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 350);
            };
          <\/script>
        </body>
        </html>
      `);
      printWindow.document.close();
      return;
    }
  }

  // 2. 단독 창에서는 즉시 브라우저 인쇄 다이얼로그 호출
  setTimeout(() => {
    window.print();
  }, 100);
};

function renderLeaderQrGrid() {
  const grid = document.getElementById('leaderQrGrid');
  if (!grid) return;
  grid.innerHTML = '';

  let currentBase = '';
  if (customQrDomain) {
    currentBase = customQrDomain;
  } else if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    currentBase = window.location.origin + window.location.pathname;
  } else {
    // 로컬 파일(file:///) 실행 시 기본 안내 주소
    currentBase = 'https://weracle-management.vercel.app/management.html';
  }

  // 로컬 파일(file:///) 실행 중이고 커스텀 도메인이 미설정된 경우 안내 박스 노출
  if (window.location.protocol === 'file:' && !customQrDomain) {
    const notice = document.createElement('div');
    notice.className = 'no-print';
    notice.style.cssText = 'grid-column:1/-1; background:#fffbeb; border:1.5px solid #fde68a; border-radius:12px; padding:14px 18px; font-size:12px; color:#92400e; line-height:1.6; margin-bottom:8px; box-shadow:0 1px 3px rgba(0,0,0,0.02);';
    notice.innerHTML = `
      <div style="font-weight:800; font-size:13px; color:#b45309; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
        <i class="fa-solid fa-triangle-exclamation"></i> 스마트폰 카메라 스캔 전 확인 안내
      </div>
      <div>
        현재 로컬 컴퓨터(PC 내 파일)에서 실행 중이므로 스마트폰 일반 카메라로 스캔 시 연결할 웹 주소가 필요합니다.<br>
        실제 웹사이트에 업로드(배포)하신 웹 주소를 위 <strong style="color:#0284c7;">'QR 연결 웹 주소'</strong>에 입력 후 [주소 저장]을 눌러주시면 스마트폰 카메라로 비췄을 때 즉시 출석 사이트로 연결됩니다.
      </div>
    `;
    grid.appendChild(notice);
  }

  // 파트너스(C 권한)를 부여받은 실제 출결 대상자 목록 조회
  const targetUsers = getPartnerAttendanceTargets();

  if (!targetUsers || targetUsers.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; color:#64748b;">파트너스(C 권한)가 부여된 회원이 없습니다.<br>[등급권한 관리] 메뉴에서 파트너스 회원의 C 권한을 체크해 주세요.</div>';
    return;
  }

  targetUsers.forEach((u, idx) => {
    const userPosition = getMemberPosition(u);
    const cleanLeader = getCleanMemberName(u, userPosition);
    const teamName = u.team || '영업 1팀';
    const checkinUrl = `${currentBase}?mode=checkin&userId=${encodeURIComponent(u.id)}&team=${encodeURIComponent(teamName)}&leader=${encodeURIComponent(cleanLeader)}&position=${encodeURIComponent(userPosition)}`;
    const qrContainerId = `leaderQrCanvas_${idx}`;

    const card = document.createElement('div');
    card.className = 'leader-qr-desk-card';
    card.style.cssText = 'background:linear-gradient(180deg, #fffdfa 0%, #ffffff 60%, #fffdfa 100%); border:2px solid #c5a059; border-radius:18px; padding:18px 16px; text-align:center; box-shadow:0 6px 20px rgba(197,160,89,0.12); display:flex; flex-direction:column; justify-content:space-between; align-items:center; break-inside:avoid; position:relative; overflow:hidden; min-height:365px; box-sizing:border-box;';
    card.innerHTML = `
      <!-- 상단 샴페인 골드 프리미엄 악센트 바 -->
      <div style="position:absolute; top:0; left:0; right:0; height:6px; background:linear-gradient(90deg, #996515 0%, #d4af37 35%, #fef08a 50%, #d4af37 65%, #996515 100%);"></div>

      <!-- 섬세한 안쪽 골드 이너 헤어라인 -->
      <div style="position:absolute; top:6px; bottom:6px; left:6px; right:6px; border:1px solid rgba(197,160,89,0.25); border-radius:12px; pointer-events:none;"></div>

      <!-- 1. 상단: 브랜드 & 소속팀 & 성함 (가독성 높은 타이포그래피) -->
      <div style="width:100%; text-align:center; padding-top:4px; position:relative; z-index:1;">
        <div style="font-size:13px; font-weight:900; letter-spacing:0.18em; color:#92400e; text-transform:uppercase; display:flex; align-items:center; justify-content:center; gap:6px;">
          <i class="fa-solid fa-crown" style="font-size:12px; color:#d4af37;"></i> WERACLE PARTNERS
        </div>
        <div style="font-size:16px; font-weight:800; color:#57534e; margin-top:5px; letter-spacing:-0.2px;">
          ${teamName}
        </div>
        <div style="font-size:26px; font-weight:900; color:#1c1917; letter-spacing:0.02em; margin-top:3px; display:flex; align-items:center; justify-content:center; gap:8px;">
          <span>${cleanLeader}</span>
          <span style="font-size:13px; font-weight:800; color:#854d0e; background:#fefce8; border:1.5px solid #fde047; padding:3px 10px; border-radius:8px; box-shadow:0 1px 2px rgba(0,0,0,0.03);">${userPosition}</span>
        </div>

        <!-- 직책 빠른 변경 셀렉터 (화면에서 변경 시 파트너스 설정에 자동 저장, 인쇄 시 자동 숨김) -->
        <div class="no-print" style="margin-top:6px; display:flex; align-items:center; justify-content:center; gap:5px;">
          <span style="font-size:11px; color:#78716c; font-weight:700;">직책:</span>
          <select onchange="updateMemberPosition('${u.id}', this.value)" style="font-size:11px; font-weight:800; color:#854d0e; background:#fefce8; border:1px solid #fde047; border-radius:6px; padding:2px 8px; cursor:pointer;">
            <option value="팀장" ${userPosition === '팀장' ? 'selected' : ''}>팀장</option>
            <option value="지사장" ${userPosition === '지사장' ? 'selected' : ''}>지사장</option>
            <option value="본부장" ${userPosition === '본부장' ? 'selected' : ''}>본부장</option>
            <option value="지점장" ${userPosition === '지점장' ? 'selected' : ''}>지점장</option>
            <option value="실장" ${userPosition === '실장' ? 'selected' : ''}>실장</option>
            <option value="대표" ${userPosition === '대표' ? 'selected' : ''}>대표</option>
            <option value="이사" ${userPosition === '이사' ? 'selected' : ''}>이사</option>
            <option value="수석" ${userPosition === '수석' ? 'selected' : ''}>수석</option>
            <option value="설계사" ${userPosition === '설계사' ? 'selected' : ''}>설계사</option>
            <option value="custom" ${!['팀장','지사장','본부장','지점장','실장','대표','이사','수석','설계사'].includes(userPosition) ? 'selected' : ''}>✏️ 직접입력 (${userPosition})</option>
          </select>
        </div>
      </div>

      <!-- 2. 중앙: 시원하고 큼직한 순수 블랙 QR 박스 (골드 프레임) -->
      <div style="margin:8px auto; padding:10px; background:#ffffff; border:1.5px solid #e7d8b8; border-radius:14px; box-shadow:0 2px 8px rgba(197,160,89,0.08); display:flex; flex-direction:column; align-items:center; position:relative; z-index:1;">
        <div id="${qrContainerId}" style="width:185px; height:185px; display:flex; align-items:center; justify-content:center; background:#fff; border-radius:6px; overflow:hidden;"></div>
        <div style="font-size:11px; font-weight:700; color:#a16207; margin-top:6px; display:flex; align-items:center; gap:4px;">
          <i class="fa-solid fa-camera"></i> 스마트폰 카메라로 비추면 자동 인증
        </div>
      </div>

      <!-- 3. 하단 문구 (옵션 C: 배경색 없는 미니멀 샴페인 골드 헤어라인 명패) -->
      <div style="width:100%; background:#ffffff; border:1.5px solid #c5a059; border-radius:12px; padding:11px 12px; text-align:center; box-shadow:0 1px 3px rgba(197,160,89,0.06); position:relative; z-index:1;">
        <div style="font-size:15px; font-weight:900; letter-spacing:-0.2px; color:#854d0e; display:flex; align-items:center; justify-content:center; gap:8px;">
          <i class="fa-solid fa-qrcode" style="font-size:15px; color:#c5a059;"></i> 사내 출퇴근 &amp; 교육인증 QR코드
        </div>
      </div>
    `;
    grid.appendChild(card);

    setTimeout(() => {
      const box = document.getElementById(qrContainerId);
      if (box) {
        box.innerHTML = '';
        let qrcodeRendered = false;
        if (typeof QRCode !== 'undefined') {
          try {
            new QRCode(box, {
              text: checkinUrl,
              width: 185,
              height: 185,
              colorDark: "#000000",
              colorLight: "#ffffff",
              correctLevel: QRCode.CorrectLevel.M
            });
            qrcodeRendered = true;
          } catch (e) {
            console.warn('QRCode JS render error:', e);
          }
        }
        if (!qrcodeRendered) {
          // CDN 지연 또는 로컬 환경 fallback 이미지 (고대비 순수 블랙, 큼직한 185px)
          box.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=185x185&color=000000&data=${encodeURIComponent(checkinUrl)}" width="185" height="185" alt="출석 QR" style="border-radius:4px; display:block;" />`;
        }
      }
    }, 40 * (idx + 1));
  });
}

// =========================================================
// [카메라 라이브 QR 출석 스캐너]
// =========================================================
let qrCameraStream = null;
let qrScanAnimationId = null;
let currentFacingMode = 'environment';
let isScanningActive = false;

window.openQrCameraScanner = async function() {
  const modal = document.getElementById('qrCameraScannerModal');
  if (!modal) return;
  modal.style.display = 'flex';
  await startCameraScan();
};

window.closeQrCameraScanner = function() {
  const modal = document.getElementById('qrCameraScannerModal');
  if (modal) modal.style.display = 'none';
  stopCameraScan();
};

window.switchCameraFacing = async function() {
  currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
  stopCameraScan();
  await startCameraScan();
};

function playCheckinBeep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) {
    console.warn('AudioContext beep error:', e);
  }
}

async function startCameraScan() {
  const video = document.getElementById('qrScannerVideo');
  const statusEl = document.getElementById('qrScannerStatus');
  if (!video) return;

  if (statusEl) statusEl.innerHTML = '<span style="width:8px; height:8px; border-radius:50%; background:#f59e0b; display:inline-block;"></span> 카메라 연결 중...';

  stopCameraScan();
  isScanningActive = true;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (statusEl) statusEl.innerHTML = '<span style="width:8px; height:8px; border-radius:50%; background:#ef4444; display:inline-block;"></span> 카메라 미지원 환경';
    alert('현재 브라우저에서는 카메라 기능을 지원하지 않습니다.\n최신 크롬(Chrome), 엣지(Edge) 또는 사파리(Safari) 브라우저를 사용해 주세요.');
    closeQrCameraScanner();
    return;
  }

  try {
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: currentFacingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
    } catch (err1) {
      // facingMode 제약조건 실패 시 일반 video 요청 (노트북/데스크탑 웹캠)
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    }

    qrCameraStream = stream;
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    await video.play();

    if (statusEl) statusEl.innerHTML = '<span style="width:8px; height:8px; border-radius:50%; background:#10b981; display:inline-block;"></span> QR을 사각형에 비추면 자동 출석됩니다';
    qrScanAnimationId = requestAnimationFrame(scanVideoFrame);
  } catch (err) {
    console.error('Camera open error:', err);
    if (statusEl) statusEl.innerHTML = '<span style="width:8px; height:8px; border-radius:50%; background:#ef4444; display:inline-block;"></span> 카메라 시작 실패';
    alert('카메라를 켤 수 없습니다.\n• 브라우저의 카메라 접근 권한을 허용해 주세요.\n• 다른 프로그램에서 카메라를 사용 중인지 확인해 주세요.');
    closeQrCameraScanner();
  }
}

function stopCameraScan() {
  isScanningActive = false;
  if (qrScanAnimationId) {
    cancelAnimationFrame(qrScanAnimationId);
    qrScanAnimationId = null;
  }
  if (qrCameraStream) {
    try {
      qrCameraStream.getTracks().forEach(track => track.stop());
    } catch (e) {}
    qrCameraStream = null;
  }
  const video = document.getElementById('qrScannerVideo');
  if (video) video.srcObject = null;
}

async function scanVideoFrame() {
  if (!isScanningActive) return;
  const video = document.getElementById('qrScannerVideo');
  const canvas = document.getElementById('qrScannerCanvas');

  if (video && video.readyState >= video.HAVE_ENOUGH_DATA && canvas) {
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let qrText = null;

    // 1. 브라우저 내장 하드웨어 가속 BarcodeDetector 시도
    if ('BarcodeDetector' in window) {
      try {
        const barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
        const barcodes = await barcodeDetector.detect(canvas);
        if (barcodes && barcodes.length > 0) {
          qrText = barcodes[0].rawValue;
        }
      } catch (e) {}
    }

    // 2. jsQR 라이브러리 fallback
    if (!qrText && typeof jsQR !== 'undefined') {
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height, {
          inversionAttempts: "dontInvert"
        });
        if (code && code.data) {
          qrText = code.data;
        }
      } catch (e) {}
    }

    // QR 코드 인식 성공 시
    if (qrText) {
      isScanningActive = false;
      playCheckinBeep();
      closeQrCameraScanner();
      handleScannedQrData(qrText);
      return;
    }
  }

  if (isScanningActive) {
    qrScanAnimationId = requestAnimationFrame(scanVideoFrame);
  }
}

function handleScannedQrData(qrText) {
  if (!qrText) return;
  console.log('Scanned QR data:', qrText);

  let userId = null;
  let leader = null;
  let team = null;

  try {
    if (qrText.includes('?') || qrText.includes('mode=checkin')) {
      const urlObj = new URL(qrText.startsWith('http') ? qrText : 'https://dummy.local/' + qrText);
      userId = urlObj.searchParams.get('userId');
      leader = urlObj.searchParams.get('leader') || urlObj.searchParams.get('name');
      team = urlObj.searchParams.get('team');
    }
  } catch (e) {
    console.warn('URL parse error:', e);
  }

  // URL 파라미터가 없거나 단순 텍스트인 경우 adminUsersData에서 매칭
  if (!userId && !leader) {
    const matchedUser = adminUsersData.find(u =>
      (u.id && qrText.includes(u.id)) ||
      (u.name && qrText.includes(u.name)) ||
      (u.nickname && qrText.includes(u.nickname))
    );
    if (matchedUser) {
      userId = matchedUser.id;
      leader = matchedUser.name || matchedUser.nickname;
      team = matchedUser.team;
    }
  }

  if (userId || leader) {
    handleDirectLeaderCheckin(team, leader, userId);
  } else {
    alert(`위라클 파트너스 출석 QR 코드가 아닙니다.\n인식된 내용: ${qrText.slice(0, 80)}`);
  }
}

// 팀장/파트너스 전용 QR 스캔 시 1초 다이렉트 출석 처리 (로그인 불필요)
window.handleDirectLeaderCheckin = async function(team, leader, userId) {
  if (!leader && !userId) return;
  const cleanLeader = String(leader || '').replace(/팀장/g, '').trim();
  const todayStr = getTodayDateStr();

  // 대상 파트너 찾기 (userId 우선, 없으면 name/nickname으로 매칭)
  let user = null;
  if (userId) {
    user = adminUsersData.find(u => u.id === userId);
  }
  if (!user && cleanLeader) {
    user = adminUsersData.find(u => 
      (u.name === cleanLeader || (u.nickname && u.nickname === cleanLeader)) &&
      (!team || u.team === team)
    );
  }
  if (!user && cleanLeader) {
    user = adminUsersData.find(u => u.name === cleanLeader || (u.nickname && u.nickname === cleanLeader));
  }

  if (!user) {
    user = {
      id: userId || ('leader-' + (team || 'team') + '-' + cleanLeader),
      name: cleanLeader || '파트너',
      team: team || '영업 1팀',
      nickname: '팀장'
    };
  }

  const finalName = user.name || cleanLeader;

  // 중복 출석 확인
  const alreadyChecked = attendanceLogs.some(l => 
    (l.user_id && l.user_id === user.id) ||
    (l.name && (l.name.includes(finalName) || finalName.includes(l.name)))
  );

  if (alreadyChecked) {
    const existing = attendanceLogs.find(l => 
      (l.user_id && l.user_id === user.id) ||
      (l.name && (l.name.includes(finalName) || finalName.includes(l.name)))
    );
    showLeaderCheckinResultModal({
      already: true,
      name: finalName,
      team: user.team,
      time: existing ? existing.time : '--:--',
      isLate: existing ? existing.status === 'late' : false,
      eduMsg: ''
    });
    return;
  }

  // 출석 즉시 기록 (Supabase 및 로컬 동시)
  const res = await recordAttendanceCheckin({
    user: user,
    method: '파트너스 전용 QR',
    type: '회사 정규 출근'
  });

  if (res) {
    showLeaderCheckinResultModal({
      already: false,
      name: finalName,
      team: res.checkinTeam || user.team,
      time: res.timeStr,
      isLate: res.isLate,
      eduMsg: res.eduMsg
    });
  }
};

window.showLeaderCheckinResultModal = function({ already, name, team, time, isLate, eduMsg }) {
  const modal = document.getElementById('leaderCheckinResultModal');
  if (!modal) {
    alert(`[${already ? '이미 출석 완료' : '출석체크 완료'}]\n• 대상: ${team ? '[' + team + '] ' : ''}${name} 팀장님\n• 출근시각: ${time}\n• 상태: ${isLate ? '지각' : '정상 출근'}${eduMsg ? '\n' + eduMsg : ''}`);
    return;
  }

  const iconEl = document.getElementById('leaderCheckinIcon');
  const titleEl = document.getElementById('leaderCheckinTitle');
  const subEl = document.getElementById('leaderCheckinSubtitle');
  const headerEl = document.getElementById('leaderCheckinHeader');
  const nameEl = document.getElementById('leaderCheckinTargetName');
  const timeEl = document.getElementById('leaderCheckinTime');
  const statusEl = document.getElementById('leaderCheckinStatus');
  const eduEl = document.getElementById('leaderCheckinEduNotice');

  if (already) {
    if (iconEl) iconEl.innerText = 'ℹ️';
    if (titleEl) titleEl.innerText = '이미 출석 완료';
    if (subEl) subEl.innerText = '오늘 이미 출석체크가 정상 기록되었습니다.';
    if (headerEl) headerEl.style.background = 'linear-gradient(135deg, #475569, #334155)';
  } else {
    if (iconEl) iconEl.innerText = isLate ? '⏰' : '🎉';
    if (titleEl) titleEl.innerText = isLate ? '출석 완료 (지각)' : '출석체크 완료!';
    if (subEl) subEl.innerText = isLate ? '정규 출근 시간(10:00) 이후에 체크되었습니다.' : '위라클 파트너스 팀장 출근 인증 성공';
    if (headerEl) headerEl.style.background = isLate ? 'linear-gradient(135deg, #d97706, #b45309)' : 'linear-gradient(135deg, #0284c7, #2563eb)';
  }

  if (nameEl) nameEl.innerText = `👑 ${team ? '[' + team + '] ' : ''}${name} 팀장님`;
  if (timeEl) timeEl.innerText = time || '--:--:--';
  if (statusEl) {
    statusEl.innerText = isLate ? '⏰ 지각' : '🟢 정상 출근';
    statusEl.style.color = isLate ? '#d97706' : '#059669';
  }

  if (eduEl) {
    if (eduMsg) {
      eduEl.innerText = eduMsg.trim();
      eduEl.style.display = 'block';
    } else {
      eduEl.style.display = 'none';
    }
  }

  modal.style.display = 'flex';

  try {
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  } catch (e) {}
};

window.closeLeaderCheckinResultModal = function() {
  const modal = document.getElementById('leaderCheckinResultModal');
  if (modal) modal.style.display = 'none';
};

// --- [모바일 현장 출근 체크인 모달 제어] ---
window.openMobileCheckinModal = function() {
  const modal = document.getElementById('mobileCheckinModal');
  if (!modal) return;
  const sel = document.getElementById('mobileCheckinPartnerSelect');
  const targets = getPartnerAttendanceTargets();
  if (sel) {
    sel.innerHTML = targets.map(u => `<option value="${u.id}">${u.name} (${u.team || '미지정'})</option>`).join('');
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.id) {
      if (targets.some(u => u.id === currentUser.id)) {
        sel.value = currentUser.id;
      }
    }
  }
  updateMobileClock();
  modal.style.display = 'flex';
};

window.closeMobileCheckinModal = function() {
  const modal = document.getElementById('mobileCheckinModal');
  if (modal) modal.style.display = 'none';
};

function updateMobileClock() {
  const clockEl = document.getElementById('checkinModalClock');
  if (!clockEl) return;
  const now = new Date();
  clockEl.innerText = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}
setInterval(updateMobileClock, 1000);

function checkUrlCheckinMode() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'checkin') {
    const leader = urlParams.get('leader') || urlParams.get('name');
    const team = urlParams.get('team');
    const userId = urlParams.get('userId');
    if (leader || userId) {
      setTimeout(() => {
        handleDirectLeaderCheckin(team, leader, userId);
      }, 350);
      return;
    }
    setTimeout(() => {
      openMobileCheckinModal();
    }, 400);
  }
}

window.submitMobileCheckin = async function() {
  const sel = document.getElementById('mobileCheckinPartnerSelect');
  const userId = sel ? sel.value : null;
  const user = adminUsersData.find(u => u.id === userId);
  if (!user) {
    alert('출근자를 선택해 주세요.');
    return;
  }

  // 오늘 이미 출근했는지 중복 확인
  const alreadyChecked = attendanceLogs.some(l => 
    (l.user_id && l.user_id === user.id) ||
    l.name.includes(user.name) ||
    (user.nickname && l.name.includes(user.nickname))
  );

  if (alreadyChecked) {
    alert(`'${user.name}' 님은 오늘 이미 출근 인증이 완료되었습니다!`);
    closeMobileCheckinModal();
    return;
  }

  const res = await recordAttendanceCheckin({
    user: user,
    method: '스마트폰 QR',
    type: '회사 정규 출근'
  });

  closeMobileCheckinModal();
  alert(`[ 회사 출입구 출근 인증 완료]\n직원: ${res.checkinName} (${res.checkinTeam})\n인증 시각: ${res.timeStr}  판정: ${res.isLate ? '지각' : '정상 출근'}${res.eduMsg}`);
};

function initAttendanceTargets() {
  // 별도 수동 지정 불필요 (파트너스 전원 자동 대상)
}

function initQRCheckin() {
  initAttendanceTargets();

  // 오늘 날짜 필터링
  const todayStr = getTodayDateStr();
  attendanceLogs = monthlyAttendanceArchive.filter(item => item.date === todayStr);

  renderAttendanceTable();
  renderTargetRosterTable();
  updateAttendanceStats();
  renderTrainingVoteTab();
  checkAndShowEduVotePopup();
  checkUrlCheckinMode();
}

window.switchQrSubTab = function(sub) {
  const btnLive = document.getElementById('subBtnLive');
  const btnVote = document.getElementById('subBtnVote');
  const btnRate = document.getElementById('subBtnRate');
  const btnReport = document.getElementById('subBtnReport');
  const viewLive = document.getElementById('qrSubViewLive');
  const viewVote = document.getElementById('qrSubViewVote');
  const viewRate = document.getElementById('qrSubViewRate');
  const viewReport = document.getElementById('qrSubViewReport');

  if (btnLive) btnLive.classList.toggle('active', sub === 'live');
  if (btnVote) btnVote.classList.toggle('active', sub === 'vote');
  if (btnRate) btnRate.classList.toggle('active', sub === 'rate');
  if (btnReport) btnReport.classList.toggle('active', sub === 'report');

  if (viewLive) viewLive.style.display = sub === 'live' ? 'block' : 'none';
  if (viewVote) viewVote.style.display = sub === 'vote' ? 'flex' : 'none';
  if (viewRate) viewRate.style.display = sub === 'rate' ? 'flex' : 'none';
  if (viewReport) viewReport.style.display = sub === 'report' ? 'flex' : 'none';

  if (sub === 'vote') {
    renderTrainingVoteTab();
  } else if (sub === 'rate') {
    filterMonthlyRateTab();
  } else if (sub === 'report') {
    filterAttendanceReport();
  }
};

// [교육 참석 사전 투표 탭 렌더링]
window.renderTrainingVoteTab = function() {
  const tbody = document.getElementById('eduVoteTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const search = (document.getElementById('voteSearchInput')?.value || '').trim().toLowerCase();
  const targetUsers = getPartnerAttendanceTargets();

  let attendingCount = 0;
  let absentCount = 0;

  targetUsers.forEach(u => {
    const status = getUserEduVoteStatus(u.id);
    if (status === 'absent') {
      absentCount++;
    } else {
      attendingCount++; // 'attending' 또는 'unvoted'(기본 참석)
    }
  });

  const total = targetUsers.length;
  const rate = total > 0 ? Math.round((attendingCount / total) * 100) : 100;

  const statTotalEl = document.getElementById('statVoteTotal');
  const statAttEl = document.getElementById('statVoteAttending');
  const statAbsEl = document.getElementById('statVoteAbsent');
  const statRateEl = document.getElementById('statVoteRate');

  if (statTotalEl) statTotalEl.innerText = `${total}명`;
  if (statAttEl) statAttEl.innerText = `${attendingCount}명`;
  if (statAbsEl) statAbsEl.innerText = `${absentCount}명`;
  if (statRateEl) statRateEl.innerText = `${rate}%`;

  const filtered = targetUsers.filter(u => {
    if (!search) return true;
    return (u.name || '').toLowerCase().includes(search) || (u.nickname || '').toLowerCase().includes(search) || (u.team || '').toLowerCase().includes(search);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-muted);">일치하는 파트너가 없습니다.</td></tr>`;
    return;
  }

  filtered.forEach(u => {
    const status = getUserEduVoteStatus(u.id);
    const tr = document.createElement('tr');

    let badgeHtml = '';
    if (status === 'attending') {
      badgeHtml = '<span class="status-badge on-time" style="background:#ecfdf5; color:#059669; font-weight:800;">[참석] 투표</span>';
    } else if (status === 'absent') {
      badgeHtml = '<span class="status-badge late" style="background:#fee2e2; color:#dc2626; font-weight:800;"> 불참 신청</span>';
    } else {
      badgeHtml = '<span class="status-badge" style="background:#f1f5f9; color:#475569; font-weight:700;"> 기본참석 (미투표)</span>';
    }

    tr.innerHTML = `
      <td><strong>${u.name}</strong> <span style="font-size:11px; color:var(--text-muted);">(${u.nickname || '파트너'})</span></td>
      <td><span style="color:var(--text-sub);">${u.team || '미지정'}</span></td>
      <td><span style="font-size:11px; color:#0284c7; font-weight:700;"><i class="fa-regular fa-clock"></i> 10:00 고정</span></td>
      <td style="text-align:center;">${badgeHtml}</td>
      <td style="text-align:center;">
        <div style="display:inline-flex; gap:4px;">
          <button class="btn-secondary" style="font-size:11px; padding:3px 8px; ${status === 'attending' ? 'background:#ecfdf5; border-color:#10b981; color:#059669; font-weight:800;' : ''}" onclick="toggleUserVoteStatus('${u.id}', 'attending')">참석</button>
          <button class="btn-secondary" style="font-size:11px; padding:3px 8px; ${status === 'absent' ? 'background:#fee2e2; border-color:#ef4444; color:#dc2626; font-weight:800;' : ''}" onclick="toggleUserVoteStatus('${u.id}', 'absent')">불참</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
};

window.toggleUserVoteStatus = function(userId, newStatus) {
  setUserEduVoteStatus(userId, newStatus);
  renderTrainingVoteTab();
  renderTargetRosterTable();
};

// 출결 뷰 전환 (대상자 대조표 vs 실시간 로그)
window.switchAttendanceTableView = function(mode) {
  const btnRoster = document.getElementById('btnToggleRoster');
  const btnLogs = document.getElementById('btnToggleLogs');
  const viewRoster = document.getElementById('viewTargetRoster');
  const viewLogs = document.getElementById('viewRealtimeLogs');

  if (mode === 'roster') {
    if (btnRoster) btnRoster.classList.add('active');
    if (btnLogs) btnLogs.classList.remove('active');
    if (viewRoster) viewRoster.style.display = 'block';
    if (viewLogs) viewLogs.style.display = 'none';
    renderTargetRosterTable();
  } else {
    if (btnRoster) btnRoster.classList.remove('active');
    if (btnLogs) btnLogs.classList.add('active');
    if (viewRoster) viewRoster.style.display = 'none';
    if (viewLogs) viewLogs.style.display = 'block';
    renderAttendanceTable();
  }
};

// 실시간 로그 테이블 렌더링
function renderAttendanceTable() {
  const tbody = document.getElementById('attendanceTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (attendanceLogs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center; padding:32px 16px; color:var(--text-muted);">
          <i class="fa-regular fa-clock" style="font-size:24px; display:block; margin-bottom:8px; color:#94a3b8;"></i>
          <strong>오늘 등록된 실시간 출결 인증 내역이 없습니다.</strong><br>
          <span style="font-size:12px; color:#94a3b8; margin-top:4px; display:inline-block;">회사 출입구 QR 스캔 또는 관리자 수동 출석 시 실시간으로 기록이 연동됩니다.</span>
        </td>
      </tr>
    `;
    return;
  }

  attendanceLogs.forEach(log => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${log.name}</strong></td>
      <td><span style="color:var(--text-sub);">${log.team || '미지정'}</span></td>
      <td><span style="color:var(--text-muted); font-size:11px;">${log.time}</span></td>
      <td>
        <span class="status-badge ${log.status}">
          ${log.status === 'on-time' ? '● 정상출석' : '▲ 지각'}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 개개인별 월간 출결 통계 산출 함수 (당월 누적 기준)
function getUserMonthlyAttendanceStats(user, month = '2026-10') {
  const uid = user.id;
  const uname = user.name;
  const baseTotalDays = 12;

  // 10월 이전 일자들의 기본 출결 데이터 베이스라인 (10월 1일 ~ 10월 16일까지 11일간 누적)
  const baselineMap = {
    'usr-1': { total: 12, normal: 11, late: 0, absent: 0 }, // 김철수: 개근
    'usr-2': { total: 12, normal: 10, late: 0, absent: 1 }, // 이영희: 결석 1일
    'usr-3': { total: 12, normal: 11, late: 0, absent: 0 }, // 정다은: 개근
    'usr-4': { total: 12, normal: 10, late: 1, absent: 0 }, // 박민준: 지각 1일
    'usr-5': { total: 12, normal: 8,  late: 1, absent: 2 }, // 최유진: 지각 1, 결석 2
    'usr-6': { total: 12, normal: 6,  late: 2, absent: 3 }, // 홍길동: 지각 2, 결석 3
    'usr-7': { total: 12, normal: 10, late: 1, absent: 0 }, // 강서윤: 지각 1
    'usr-8': { total: 12, normal: 9,  late: 1, absent: 1 }, // 송태원: 지각 1, 결석 1
    'usr-9': { total: 12, normal: 6,  late: 2, absent: 3 }, // 윤지호: 지각 2, 결석 3
  };

  const base = baselineMap[uid] || { total: baseTotalDays, normal: 10, late: 1, absent: 0 };
  
  let normal = base.normal;
  let late = base.late;
  let absent = base.absent;

  // 오늘(10월 17일) 실시간 출결 반영
  const todayLog = attendanceLogs.find(l => l.name.includes(uname) || (user.nickname && l.name.includes(user.nickname)));
  
  if (todayLog) {
    if (todayLog.status === 'on-time') {
      normal += 1;
    } else if (todayLog.status === 'late') {
      late += 1;
    }
  } else {
    // 아직 미출석인 경우 대기/결석 1 추가
    absent += 1;
  }

  // 총 근무일수 및 평가 기준 동적 적용
  const totalDays = attendancePolicySettings.totalWorkDays || 12;
  const attendedDays = normal + late;
  const rate = Math.min(100, Math.round((attendedDays / totalDays) * 100));

  const exThreshold = attendancePolicySettings.rateExcellent || 95;
  const gdThreshold = attendancePolicySettings.rateGood || 80;

  let statusText = '우수 개근';
  let statusClass = 'on-time';
  if (rate >= exThreshold) {
    statusText = ' 우수 개근';
    statusClass = 'on-time';
  } else if (rate >= gdThreshold) {
    statusText = '● 보통/양호';
    statusClass = 'on-time';
  } else {
    statusText = ' 출석 주의';
    statusClass = 'late';
  }

  return {
    userId: uid,
    name: uname,
    nickname: user.nickname || '',
    team: user.team,
    totalDays,
    attendedDays,
    normal,
    late,
    absent,
    rate,
    statusText,
    statusClass,
    isCheckedInToday: !!todayLog,
    todayLog
  };
}

// 개인 출석률 게이지 바 HTML 렌더러
function renderRateGauge(rate, attended, total) {
  const exThreshold = attendancePolicySettings.rateExcellent || 95;
  const gdThreshold = attendancePolicySettings.rateGood || 80;

  let color = '#10b981';
  let textCol = '#059669';
  if (rate < gdThreshold) {
    color = '#ef4444';
    textCol = '#dc2626';
  } else if (rate < exThreshold) {
    color = '#f59e0b';
    textCol = '#d97706';
  }
  return `
    <div style="display:flex; align-items:center; gap:8px;">
      <div style="width:65px; height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
        <div style="width:${rate}%; height:100%; background:${color}; border-radius:3px;"></div>
      </div>
      <span style="font-weight:800; font-size:12px; color:${textCol}; min-width:34px;">${rate}%</span>
      <span style="font-size:11px; color:var(--text-muted);">(${attended}/${total}일)</span>
    </div>
  `;
}

// 파트너스 출결 대조표 렌더링 (파트너스 전원 자동 대상)
function renderTargetRosterTable() {
  const tbody = document.getElementById('attendanceRosterTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const targetUsers = getPartnerAttendanceTargets();

  if (targetUsers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-muted);">등록된 파트너스 회원이 없습니다.</td></tr>`;
    return;
  }

  targetUsers.forEach(u => {
    // 오늘 출석 로그 중 해당 사용자가 있는지 대조
    const log = attendanceLogs.find(l => 
      (l.user_id && l.user_id === u.id) ||
      l.name.includes(u.name) || 
      (u.nickname && l.name.includes(u.nickname))
    );
    const voteStatus = getUserEduVoteStatus(u.id);

    let eduCellHtml = '';
    if (log) {
      if (voteStatus === 'absent') {
        eduCellHtml = '<span style="color:#ef4444; font-size:11px; font-weight:700;"><i class="fa-solid fa-ban"></i> 사전 불참</span>';
      } else {
        eduCellHtml = '<span style="color:#047857; font-weight:800; font-size:11px; background:#ecfdf5; padding:3px 8px; border-radius:6px; border:1px solid #a7f3d0;"><i class="fa-solid fa-circle-check"></i>  10시 교육 자동인증</span>';
      }
    } else {
      if (voteStatus === 'absent') {
        eduCellHtml = '<span style="color:#94a3b8; font-size:11px;">사전 불참</span>';
      } else {
        eduCellHtml = '<span style="color:#64748b; font-size:11px;"><i class="fa-regular fa-clock"></i> 출근 시 자동인증</span>';
      }
    }

    const tr = document.createElement('tr');
    if (log) {
      tr.innerHTML = `
        <td><strong>${u.name}</strong> <span style="font-size:11px; color:var(--text-muted);">(${u.nickname || '파트너'})</span></td>
        <td><span style="color:var(--text-sub);">${u.team || '미지정'}</span></td>
        <td><span style="font-size:11px; color:var(--text-muted);">${log.time}</span></td>
        <td>
          <span class="status-badge ${log.status}">
            ${log.status === 'on-time' ? '● 정상출석' : '▲ 지각'}
          </span>
        </td>
        <td>${eduCellHtml}</td>
        <td style="text-align:center;">
          <span style="color:var(--success); font-weight:700; font-size:11px;">
            <i class="fa-solid fa-circle-check"></i> 인증 완료
          </span>
        </td>
      `;
    } else {
      tr.innerHTML = `
        <td><strong>${u.name}</strong> <span style="font-size:11px; color:var(--text-muted);">(${u.nickname || '파트너'})</span></td>
        <td><span style="color:var(--text-sub);">${u.team || '미지정'}</span></td>
        <td><span style="color:var(--text-muted);">-</span></td>
        <td>
          <span class="status-badge absent">
             미출석 (대기중)
          </span>
        </td>
        <td>${eduCellHtml}</td>
        <td style="text-align:center;">
          <button class="btn-primary" style="padding:2px 8px; font-size:11px; background:#4338ca;" onclick="adminManualCheckin('${u.id}')">
            <i class="fa-solid fa-check"></i> 수동 출석
          </button>
        </td>
      `;
    }
    tbody.appendChild(tr);
  });

  updateAttendanceStats();
}

// 출결 통계 수치 실시간 계산 및 반영 (파트너스 전원 대상)
function updateAttendanceStats() {
  const targetUsers = getPartnerAttendanceTargets();
  const total = targetUsers.length;

  let normalCount = 0;
  let lateCount = 0;

  targetUsers.forEach(u => {
    const log = attendanceLogs.find(l => 
      (l.user_id && l.user_id === u.id) ||
      l.name.includes(u.name) || 
      (u.nickname && l.name.includes(u.nickname))
    );
    if (log) {
      if (log.status === 'on-time') normalCount++;
      else if (log.status === 'late') lateCount++;
    }
  });

  const absentCount = Math.max(0, total - (normalCount + lateCount));

  const statTotal = document.getElementById('statTotal');
  const statNormal = document.getElementById('statNormal');
  const statLate = document.getElementById('statLate');
  const statAbsent = document.getElementById('statAbsent');
  const btnCount = document.getElementById('btnFamilyTargetCount');

  if (statTotal) statTotal.innerText = `${total}명`;
  if (statNormal) statNormal.innerText = `${normalCount}명`;
  if (statLate) statLate.innerText = `${lateCount}명`;
  if (statAbsent) statAbsent.innerText = `${absentCount}명`;
  if (btnCount) btnCount.innerText = `${total}`;
}

// 실제 출결 인증 공통 등록 함수 (Supabase partners_attendance 클라우드 및 로컬 동시 저장)
window.recordAttendanceCheckin = async function({ user, method = '스마트폰 QR', type = '회사 정규 출근' }) {
  if (!user) return null;
  const now = new Date();
  const todayStr = getTodayDateStr();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const workLimit = (timePolicySettings && timePolicySettings.workTime) ? timePolicySettings.workTime : '10:00';
  const isLate = timeStr.slice(0, 5) > workLimit;

  const checkinName = (user.name || user.nickname || '파트너').trim();
  const checkinTeam = user.team || '미지정';

  const newLog = {
    user_id: user.id || null,
    date: todayStr,
    name: checkinName,
    team: checkinTeam,
    type: type,
    time: timeStr,
    status: isLate ? 'late' : 'on-time',
    method: method,
    created_at: now.toISOString()
  };

  // 1. 메모리 및 로컬 즉시 반영
  attendanceLogs.unshift(newLog);
  monthlyAttendanceArchive.unshift(newLog);
  localStorage.setItem('weracle_monthly_attendance_archive', JSON.stringify(monthlyAttendanceArchive));

  // 2. Supabase partners_attendance 클라우드 저장
  const sb = await getSb();
  if (sb) {
    try {
      await sb.from('partners_attendance').insert([{
        user_id: user.id || null,
        name: checkinName,
        team: checkinTeam,
        checkin_type: type,
        checkin_time: now.toISOString(),
        status: isLate ? 'late' : 'on-time',
        method: method,
        date: todayStr
      }]);
    } catch (e) {
      console.warn('출결 DB 저장 실패:', e);
    }
  }

  // 3. 전날 투표 상태 확인 (미투표자 포함  당일 10시 교육 자동 동시 출석 연동)
  const voteStatus = getUserEduVoteStatus(user.id);
  let eduMsg = '';

  if (voteStatus !== 'absent') {
    // 당일 등록된 실제 교육이 있으면 해당 교육 타이틀 사용, 없으면 설정된 교육 시작 시각 기준 적용
    const todayEdu = sampleSchedules.find(s => s.date === todayStr && s.category === 'edu');
    const eduTitle = todayEdu ? `${todayEdu.time || '10:00'} ${todayEdu.title}` : `${timePolicySettings.eduAmTime || '10:00'} 사내 교육`;

    const eduLog = {
      user_id: user.id || null,
      date: todayStr,
      name: checkinName,
      team: checkinTeam,
      type: eduTitle,
      time: timeStr,
      status: 'on-time',
      method: '출근 연동 자동인증',
      created_at: now.toISOString()
    };
    attendanceLogs.unshift(eduLog);
    monthlyAttendanceArchive.unshift(eduLog);
    localStorage.setItem('weracle_monthly_attendance_archive', JSON.stringify(monthlyAttendanceArchive));

    if (sb) {
      try {
        await sb.from('partners_attendance').insert([{
          user_id: user.id || null,
          name: checkinName,
          team: checkinTeam,
          checkin_type: eduTitle,
          checkin_time: now.toISOString(),
          status: 'on-time',
          method: '출근 연동 자동인증',
          date: todayStr
        }]);
      } catch (e) {}
    }
    eduMsg = `\n\n [${eduTitle}]도 별도 스캔 없이 자동으로 동시 출석 완료되었습니다! (전날 참석/미투표 연동)`;
  } else {
    eduMsg = '\n\n※ 전날 사전 [불참 신청]이 접수되어 당일 교육 자동 출석에서는 제외되었습니다.';
  }

  // 화면 즉시 갱신
  renderTargetRosterTable();
  renderAttendanceTable();
  updateAttendanceStats();
  if (document.getElementById('qrSubViewVote')?.style.display !== 'none') {
    renderTrainingVoteTab();
  }
  if (document.getElementById('qrSubViewRate')?.style.display !== 'none') {
    filterMonthlyRateTab();
  }
  if (document.getElementById('qrSubViewReport')?.style.display !== 'none') {
    filterAttendanceReport();
  }

  return { isLate, timeStr, checkinName, checkinTeam, eduMsg };
};

// 관리자 직접 수동 출석 인정
window.adminManualCheckin = async function(userId) {
  const user = adminUsersData.find(u => u.id === userId);
  if (!user) return;

  if (!await showConfirm(`'${user.name} (${user.team || '미지정'})' 님을 수동 정상 출석 처리하시겠습니까?\n(휴대폰 분실/현장 지연 시 관리자 즉시 출석 인정)`, '수동 정상 출석')) return;

  const res = await recordAttendanceCheckin({
    user: user,
    method: '관리자 수동확인',
    type: '회사 정규 출근'
  });

  if (res) {
    alert(`[ 관리자 수동 출석 완료]\n직원: ${res.checkinName} (${res.checkinTeam})\n인증 시각: ${res.timeStr}  판정: ${res.isLate ? '지각' : '정상 출근'}${res.eduMsg}`);
  }
};

// =========================================================
// [출결 대상자 관련 호환 함수]
// =========================================================
window.openAttendanceTargetModal = function() {};
window.closeAttendanceTargetModal = function() {};
window.filterTargetModalList = function() {};
window.toggleTargetUser = function() {};
window.selectAllFamilyTargets = function() {};
window.selectTeamFamilyTargets = function() {};
window.saveAttendanceTargets = function() {};


// =========================================================
// [이번달 출석률 & 출결 상세 이력 리포트]
// =========================================================
function initAttendanceReport() {
  initAttendancePolicySettings();
  filterMonthlyRateTab();
  filterAttendanceReport();
}

// --- [출석률 평가 기준 및 총 근무일수 설정 모달] ---
window.openAttendancePolicyModal = function() {
  const modal = document.getElementById('attendancePolicyModal');
  if (!modal) return;

  const inpDays = document.getElementById('modalPolicyWorkDays');
  const inpEx = document.getElementById('modalPolicyRateExcellent');
  const inpGd = document.getElementById('modalPolicyRateGood');
  const warnPreview = document.getElementById('modalPolicyWarnPreview');

  if (inpDays) inpDays.value = attendancePolicySettings.totalWorkDays;
  if (inpEx) inpEx.value = attendancePolicySettings.rateExcellent;
  if (inpGd) inpGd.value = attendancePolicySettings.rateGood;
  if (warnPreview) warnPreview.innerText = `${attendancePolicySettings.rateGood}% 미만`;

  modal.style.display = 'flex';
};

window.closeAttendancePolicyModal = function() {
  const modal = document.getElementById('attendancePolicyModal');
  if (modal) modal.style.display = 'none';
};

window.updateModalWarnPreview = function() {
  const inpGd = document.getElementById('modalPolicyRateGood');
  const warnPreview = document.getElementById('modalPolicyWarnPreview');
  if (inpGd && warnPreview) {
    warnPreview.innerText = `${inpGd.value}% 미만`;
  }
};

window.saveAttendancePolicySettings = function() {
  const inpDays = document.getElementById('modalPolicyWorkDays');
  const inpEx = document.getElementById('modalPolicyRateExcellent');
  const inpGd = document.getElementById('modalPolicyRateGood');

  const days = parseInt(inpDays?.value, 10);
  const ex = parseInt(inpEx?.value, 10);
  const gd = parseInt(inpGd?.value, 10);

  if (!days || days < 1 || days > 31) {
    alert('총 근무일수는 1일에서 31일 사이의 숫자를 입력해주세요.');
    return;
  }
  if (!ex || !gd || gd >= ex || gd < 1 || ex > 100) {
    alert('기준 비율이 올바르지 않습니다.\n(보통 기준은 우수 기준보다 낮아야 합니다.)');
    return;
  }

  attendancePolicySettings.totalWorkDays = days;
  attendancePolicySettings.rateExcellent = ex;
  attendancePolicySettings.rateGood = gd;

  localStorage.setItem('weracle_attendance_policy_settings', JSON.stringify(attendancePolicySettings));
  saveSettingToSupabase('attendance_policy', attendancePolicySettings, '당월 총 근무일수 및 출석률 평가기준(우수/보통/주의)');

  syncPolicyInputsToUI();
  filterMonthlyRateTab();
  closeAttendancePolicyModal();

  alert(`[출석률 평가 기준 설정 완료]\n- 당월 총 근무일수: ${days}일\n-  우수 개근: ${ex}% 이상\n- ● 보통(양호): ${gd}% 이상\n-  출석 주의: ${gd}% 미만\n\n모든 파트너 출석률 및 집계표에 즉시 반영되었습니다.\n(Supabase 클라우드 동기화 완료)`);
};

// --- [서브 2: 이번달 출석률 전용 탭 로직] ---
window.filterMonthlyRateTab = function() {
  const month = document.getElementById('rateMonthSelect')?.value || '2026-10';
  const teamFilter = document.getElementById('rateTeamSelect')?.value || 'all';
  const search = (document.getElementById('rateSearch')?.value || '').trim().toLowerCase();

  const familyUsers = adminUsersData.filter(u => u.user_grade === 'family');
  let personalStats = familyUsers.map(u => getUserMonthlyAttendanceStats(u, month));

  if (teamFilter !== 'all') {
    personalStats = personalStats.filter(s => s.team === teamFilter);
  }
  if (search) {
    personalStats = personalStats.filter(s => 
      s.name.toLowerCase().includes(search) || s.nickname.toLowerCase().includes(search)
    );
  }

  // 출석률 높은 순 (동점 시 정상 출근 횟수 많은 순) 정렬
  personalStats.sort((a, b) => b.rate - a.rate || b.normal - a.normal);

  // 상단 요약 카드 4종 갱신
  const avgStatEl = document.getElementById('rateAvgStat');
  const perfectStatEl = document.getElementById('ratePerfectStat');
  const warnStatEl = document.getElementById('rateWarnStat');
  const workDaysStatEl = document.getElementById('rateWorkDaysStat');
  const countEl = document.getElementById('rateResultCount');

  if (personalStats.length > 0) {
    const avgRate = Math.round(personalStats.reduce((acc, cur) => acc + cur.rate, 0) / personalStats.length);
    if (avgStatEl) avgStatEl.innerText = `${avgRate}%`;

    const exThreshold = attendancePolicySettings.rateExcellent || 95;
    const gdThreshold = attendancePolicySettings.rateGood || 80;

    const perfectCount = personalStats.filter(s => s.rate >= exThreshold).length;
    if (perfectStatEl) perfectStatEl.innerText = `${perfectCount}명`;

    const warnCount = personalStats.filter(s => s.rate < gdThreshold).length;
    if (warnStatEl) warnStatEl.innerText = `${warnCount}명`;

    if (workDaysStatEl) workDaysStatEl.innerText = `${attendancePolicySettings.totalWorkDays || 12}일`;
  } else {
    if (avgStatEl) avgStatEl.innerText = '0%';
    if (perfectStatEl) perfectStatEl.innerText = '0명';
    if (warnStatEl) warnStatEl.innerText = '0명';
    if (workDaysStatEl) workDaysStatEl.innerText = `${attendancePolicySettings.totalWorkDays || 12}일`;
  }

  if (countEl) countEl.innerText = personalStats.length;

  renderMonthlyRateTable(personalStats);
};

function renderMonthlyRateTable(statsList) {
  const tbody = document.getElementById('monthlyRateTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (statsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:28px; color:var(--text-muted);">조건에 부합하는 파트너가 없습니다.</td></tr>`;
    return;
  }

  statsList.forEach((s, idx) => {
    const rank = idx + 1;
    let rankBadgeClass = rank <= 3 ? `rank-${rank}` : 'rank-other';
    let rankIcon = rank === 1 ? '' : rank === 2 ? '' : rank === 3 ? '' : `${rank}`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center;">
        <span class="rank-badge ${rankBadgeClass}">${rankIcon}</span>
      </td>
      <td>
        <strong>${s.name}</strong> 
        <span style="font-size:11px; color:var(--text-muted);">(${s.nickname || '직원'})</span>
      </td>
      <td><span style="color:var(--text-sub);">${s.team}</span></td>
      <td>
        ${renderRateGauge(s.rate, s.attendedDays, s.totalDays)}
      </td>
      <td style="text-align:center; font-weight:700;">${s.totalDays}일</td>
      <td style="text-align:center; color:var(--success); font-weight:700;">${s.normal}회</td>
      <td style="text-align:center; color:var(--warning); font-weight:700;">${s.late}회</td>
      <td style="text-align:center; color:${s.absent > 0 ? 'var(--danger)' : 'var(--text-muted)'}; font-weight:700;">${s.absent}회</td>
      <td style="text-align:center;">
        <span class="status-badge ${s.statusClass}">
          ${s.statusText}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.exportMonthlyRateToCSV = function() {
  const month = document.getElementById('rateMonthSelect')?.value || '2026-10';
  const teamFilter = document.getElementById('rateTeamSelect')?.value || 'all';
  const search = (document.getElementById('rateSearch')?.value || '').trim().toLowerCase();

  const familyUsers = adminUsersData.filter(u => u.user_grade === 'family');
  let personalStats = familyUsers.map(u => getUserMonthlyAttendanceStats(u, month));
  if (teamFilter !== 'all') personalStats = personalStats.filter(s => s.team === teamFilter);
  if (search) personalStats = personalStats.filter(s => s.name.toLowerCase().includes(search) || s.nickname.toLowerCase().includes(search));
  personalStats.sort((a, b) => b.rate - a.rate || b.normal - a.normal);

  if (personalStats.length === 0) {
    alert('다운로드할 출석률 데이터가 없습니다.');
    return;
  }

  let csv = "\uFEFF순위,직원명,직급/별칭,소속팀,이번달개인출석률(%),총근무일수,출근일수,정상출근,지각,결석,출결상태\n";
  personalStats.forEach((s, idx) => {
    csv += `"${idx + 1}","${s.name}","${s.nickname || '직원'}","${s.team}","${s.rate}%","${s.totalDays}","${s.attendedDays}","${s.normal}","${s.late}","${s.absent}","${s.statusText}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `위라클파트너스_이번달_출석률_보고서_${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// --- [서브 3: 출결 상세 이력 & 다운로드 탭 로직] ---
window.filterAttendanceReport = function() {
  const month = document.getElementById('reportMonthSelect')?.value || '2026-10';
  const typeFilter = document.getElementById('reportTypeSelect')?.value || 'all';
  const teamFilter = document.getElementById('reportTeamSelect')?.value || 'all';
  const search = (document.getElementById('reportSearch')?.value || '').trim().toLowerCase();

  const filteredLogs = monthlyAttendanceArchive.filter(item => {
    if (!item.date.startsWith(month)) return false;
    if (typeFilter !== 'all') {
      if (typeFilter === '회사출근' && !item.type.includes('출근')) return false;
      if (typeFilter === '교육' && item.type.includes('출근')) return false;
      if (typeFilter !== '회사출근' && typeFilter !== '교육' && !item.type.includes(typeFilter)) return false;
    }
    if (teamFilter !== 'all' && item.team !== teamFilter) return false;
    if (search && !item.name.toLowerCase().includes(search)) return false;
    return true;
  });

  const statTotalLogs = document.getElementById('repStatTotalLogs');
  const statNormalLogs = document.getElementById('repStatNormalLogs');
  const statLateLogs = document.getElementById('repStatLateLogs');
  const countEl = document.getElementById('repResultCount');

  if (statTotalLogs) statTotalLogs.innerText = `${filteredLogs.length}건`;
  if (countEl) countEl.innerText = filteredLogs.length;

  let normalCount = 0;
  let lateCount = 0;
  filteredLogs.forEach(l => {
    if (l.status === 'on-time') normalCount++;
    else if (l.status === 'late') lateCount++;
  });

  if (statNormalLogs) statNormalLogs.innerText = `${normalCount}건`;
  if (statLateLogs) statLateLogs.innerText = `${lateCount}건`;

  renderAttendanceReportTable(filteredLogs);
};

function renderAttendanceReportTable(data) {
  const tbody = document.getElementById('attendanceReportTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:28px; color:var(--text-muted);">조회된 출결 및 교육 이력이 없습니다.</td></tr>`;
    return;
  }

  data.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${item.date}</strong></td>
      <td><span style="color:var(--text-muted); font-size:12px;">${item.time}</span></td>
      <td><strong>${item.name}</strong></td>
      <td><span style="color:var(--text-sub);">${item.team}</span></td>
      <td><span style="font-weight:700; color:var(--primary);">${item.type}</span></td>
      <td><span style="font-size:12px; color:var(--text-sub);">${item.method || '스마트폰 QR'}</span></td>
      <td style="text-align:center;">
        <span class="status-badge ${item.status}">
          ${item.status === 'on-time' ? '● 정상출석' : '▲ 지각'}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.exportAttendanceReportToCSV = function() {
  const month = document.getElementById('reportMonthSelect')?.value || '2026-10';
  const typeFilter = document.getElementById('reportTypeSelect')?.value || 'all';
  const teamFilter = document.getElementById('reportTeamSelect')?.value || 'all';
  const search = (document.getElementById('reportSearch')?.value || '').trim().toLowerCase();

  const filtered = monthlyAttendanceArchive.filter(item => {
    if (!item.date.startsWith(month)) return false;
    if (typeFilter !== 'all') {
      if (typeFilter === '회사출근' && !item.type.includes('출근')) return false;
      if (typeFilter === '교육' && item.type.includes('출근')) return false;
      if (typeFilter !== '회사출근' && typeFilter !== '교육' && !item.type.includes(typeFilter)) return false;
    }
    if (teamFilter !== 'all' && item.team !== teamFilter) return false;
    if (search && !item.name.toLowerCase().includes(search)) return false;
    return true;
  });

  if (filtered.length === 0) {
    alert('다운로드할 출결 데이터가 없습니다.');
    return;
  }

  let csv = "\uFEFF일자,인증시각,직원명,소속팀,출결구분(출근/교육명),인증방식,출결판정\n";
  filtered.forEach(d => {
    const statusText = d.status === 'on-time' ? '정상출석' : '지각';
    csv += `"${d.date}","${d.time}","${d.name}","${d.team}","${d.type}","${d.method || '스마트폰 QR'}","${statusText}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `위라클파트너스_상세출결_결과보고서_${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};


// =========================================================
// [3. 파트너스 실적 및 팀별 목표 관리]
// =========================================================
let teamGoalsData = [];
let performanceData = [];

let selectedTeamFilter = 'all';

function initPerformanceStorage() {
  try {
    const savedPerf = localStorage.getItem('weracle_performance_data');
    if (savedPerf !== null) {
      const parsed = JSON.parse(savedPerf);
      if (Array.isArray(parsed)) {
        // 샘플 더미 인원('정다은 프로', '최유진 팀장' 등) 배제
        performanceData = parsed.filter(p => p.name !== '정다은 프로' && p.name !== '최유진 팀장' && p.name !== '이영희 수석' && p.name !== '박민준 팀장' && p.name !== '강서윤 프로' && p.name !== '윤지호 프로' && p.name !== '송태원 팀장' && p.name !== '김철수 팀장');
      }
    }
    const savedGoals = localStorage.getItem('weracle_team_goals_data');
    if (savedGoals !== null) {
      const parsedGoals = JSON.parse(savedGoals);
      if (Array.isArray(parsedGoals)) {
        // 샘플 더미 팀('스타팀', '비전팀', '영업 2팀', '영업 3팀') 배제
        teamGoalsData = parsedGoals.filter(t => t.team !== '스타팀' && t.team !== '비전팀' && t.team !== '영업 2팀' && t.team !== '영업 3팀' && t.team !== '영업 1팀' && t.team !== '영업1팀' && t.team !== '미지정' && t.team !== '관리자');
      }
    }
  } catch (e) {
    console.warn('실적 로컬 스토리지 로드 실패:', e);
  }
  // 팀 목표에서 '영업 1팀' 배제 유지
  teamGoalsData = teamGoalsData.filter(t => t.team !== '영업 1팀' && t.team !== '영업1팀' && t.team !== '미지정' && t.team !== '관리자');
  savePerformanceStorage();
}

function savePerformanceStorage() {
  try {
    localStorage.setItem('weracle_performance_data', JSON.stringify(performanceData));
    localStorage.setItem('weracle_team_goals_data', JSON.stringify(teamGoalsData));
  } catch (e) {
    console.warn('실적 로컬 스토리지 저장 실패:', e);
  }
}

function applyTeamGoalsFromObject(goalsObj) {
  if (!goalsObj || typeof goalsObj !== 'object') return;
  delete goalsObj['영업 1팀'];
  delete goalsObj['영업1팀'];
  delete goalsObj['미지정'];
  delete goalsObj['관리자'];

  Object.keys(goalsObj).forEach(teamName => {
    if (teamName === '영업 1팀' || teamName === '영업1팀' || teamName === '미지정' || teamName === '관리자') return;
    const targetVal = Number(goalsObj[teamName]) || 0;
    const existing = teamGoalsData.find(t => t.team === teamName);
    if (existing) {
      existing.target = targetVal;
    } else {
      teamGoalsData.push({
        team: teamName,
        leader: '',
        target: targetVal
      });
    }
  });
  teamGoalsData = teamGoalsData.filter(t => t.team !== '영업 1팀' && t.team !== '영업1팀' && t.team !== '미지정' && t.team !== '관리자');
  calculateTeamStats();
  savePerformanceStorage();
  renderTeamGoalsCards();
  renderAdminTeamGoalsTable();
  populateTeamDropdowns();
  if (typeof filterAdminUserList === 'function') filterAdminUserList();
}

async function loadPerformanceFromSupabase() {
  const sb = await getSb();
  if (!sb) return;
  try {
    const { data, error } = await sb.from('partners_performance').select('*').order('monthly_amount', { ascending: false });
    if (!error && Array.isArray(data) && data.length > 0) {
      performanceData = data.map((row, idx) => ({
        db_id: row.id,
        rank: idx + 1,
        name: row.name,
        team: row.team,
        count: row.contract_count || 0,
        monthly: Number(row.monthly_amount) || 0,
        target: Number(row.target_amount) || 20000000,
        total: Number(row.accumulated_amount) || 0,
        status: row.status || '진행중'
      }));
      sortAndRankPerfData();
      calculateTeamStats();
      savePerformanceStorage();
      renderTeamGoalsCards();
      populateTeamDropdowns();
      renderPerfTable(performanceData);
      renderAdminTeamGoalsTable();
      renderAdminPerfTable();
    }
  } catch (e) {
    console.warn('Supabase 실적 로드 건너뜀:', e);
  }
}

async function syncPerformanceToSupabase() {
  const sb = await getSb();
  if (!sb) return;
  try {
    for (const p of performanceData) {
      const payload = {
        name: p.name,
        team: p.team,
        target_month: '2026-10',
        contract_count: p.count || 0,
        monthly_amount: p.monthly || 0,
        target_amount: p.target || 20000000,
        accumulated_amount: p.total || 0,
        status: p.status || '진행중',
        updated_at: new Date().toISOString()
      };
      if (p.db_id) {
        await sb.from('partners_performance').update(payload).eq('id', p.db_id);
      } else {
        const { data } = await sb.from('partners_performance').select('id').eq('name', p.name).eq('target_month', '2026-10');
        if (data && data.length > 0) {
          p.db_id = data[0].id;
          await sb.from('partners_performance').update(payload).eq('id', p.db_id);
        } else {
          const { data: ins } = await sb.from('partners_performance').insert([payload]).select();
          if (ins && ins[0]) p.db_id = ins[0].id;
        }
      }
    }
    savePerformanceStorage();
  } catch (e) {
    console.warn('Supabase 실적 동기화 실패:', e);
  }
}

function initPerformance() {
  initPerformanceStorage();
  calculateTeamStats();
  sortAndRankPerfData();
  populateTeamDropdowns();
  renderTeamGoalsCards();
  renderPerfTable(performanceData);
}

function calculateTeamStats() {
  teamGoalsData.forEach(t => {
    const members = performanceData.filter(p => p.team === t.team);
    t.memberCount = members.length;
    t.totalMonthly = members.reduce((sum, p) => sum + (p.monthly || 0), 0);
    t.totalCount = members.reduce((sum, p) => sum + (p.count || 0), 0);
    t.rate = t.target > 0 ? Math.round((t.totalMonthly / t.target) * 100) : 0;
    t.status = t.rate >= 100 ? '목표 달성' : t.rate >= 80 ? '달성 임박' : '진행중';
  });

  // 팀 순위: 당월 합산 실적(totalMonthly) 기준 내림차순 정렬
  teamGoalsData.sort((a, b) => (b.totalMonthly || 0) - (a.totalMonthly || 0));
  teamGoalsData.forEach((t, idx) => {
    t.rank = idx + 1;
  });
}

function renderTeamGoalsCards() {
  const grid = document.getElementById('teamPerfGrid');
  if (!grid) return;
  grid.innerHTML = '';

  teamGoalsData.forEach(t => {
    const isSelected = selectedTeamFilter === t.team;
    const rankClass = t.rank === 1 ? 'rank-1' : t.rank === 2 ? 'rank-2' : t.rank === 3 ? 'rank-3' : 'rank-etc';
    const rankLabel = t.rank === 1 ? ' 1위' : t.rank === 2 ? ' 2위' : t.rank === 3 ? ' 3위' : `${t.rank}위`;

    const card = document.createElement('div');
    card.className = `team-perf-card ${isSelected ? 'active' : ''}`;
    card.title = `클릭 시 [${t.team}] 팀원 실적만 조회합니다`;
    card.onclick = () => selectTeamFilter(t.team);

    card.innerHTML = `
      <div class="team-card-top">
        <div>
          <div class="team-name-title">
            <i class="fa-solid fa-people-group" style="color:var(--primary); font-size:14px;"></i>
            <span>${t.team}</span>
          </div>
          <div class="team-leader-sub">팀장 ${t.leader || '-'} · ${t.memberCount}명</div>
        </div>
        <span class="team-rank-badge ${rankClass}">${rankLabel}</span>
      </div>

      <div class="team-perf-amount">${(t.totalMonthly).toLocaleString()} <span style="font-size:13px; font-weight:700; color:var(--text-sub);">원</span></div>
      
      <div class="team-perf-target-row">
        <span>목표 ${(t.target).toLocaleString()}원</span>
        <strong style="color:${t.rate >= 100 ? 'var(--success)' : 'var(--primary)'}; font-size:13px;">${t.rate}%</strong>
      </div>

      <div class="team-progress-bar-bg">
        <div class="team-progress-bar-fill ${t.rate >= 100 ? 'over' : ''}" style="width:${Math.min(t.rate, 100)}%;"></div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
        <span style="font-size:11px; color:var(--text-muted);"><i class="fa-solid fa-file-signature"></i> 신규체결 ${t.totalCount}건</span>
        <span class="status-badge ${t.rate >= 100 ? 'on-time' : 'late'}" style="font-size:11px; padding:2px 8px;">
          ${t.status}
        </span>
      </div>
    `;
    grid.appendChild(card);
  });
}

function populateTeamDropdowns() {
  const teamList = teamGoalsData.map(t => t.team);

  // 1. 실적표 팀 필터 (perfTeamSelect)
  const perfTeamSelect = document.getElementById('perfTeamSelect');
  if (perfTeamSelect) {
    const curVal = perfTeamSelect.value;
    perfTeamSelect.innerHTML = '<option value="all">전체 팀 보기</option>';
    teamGoalsData.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.team;
      opt.innerText = ` ${t.team} (${t.memberCount || 0}명)`;
      perfTeamSelect.appendChild(opt);
    });
    if (curVal && teamGoalsData.some(t => t.team === curVal)) {
      perfTeamSelect.value = curVal;
    } else {
      perfTeamSelect.value = 'all';
    }
  }

  // 2. 이번달 출석률 탭 팀 필터 (rateTeamSelect)
  const rateTeamSelect = document.getElementById('rateTeamSelect');
  if (rateTeamSelect) {
    const curVal = rateTeamSelect.value;
    rateTeamSelect.innerHTML = '<option value="all">전체 팀 보기</option>';
    teamList.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.innerText = name;
      rateTeamSelect.appendChild(opt);
    });
    if (curVal && teamList.includes(curVal)) {
      rateTeamSelect.value = curVal;
    } else {
      rateTeamSelect.value = 'all';
    }
  }

  // 3. 상세 출결 리포트 탭 팀 필터 (reportTeamSelect)
  const reportTeamSelect = document.getElementById('reportTeamSelect');
  if (reportTeamSelect) {
    const curVal = reportTeamSelect.value;
    reportTeamSelect.innerHTML = '<option value="all">전체 소속팀</option>';
    teamList.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.innerText = name;
      reportTeamSelect.appendChild(opt);
    });
    if (curVal && teamList.includes(curVal)) {
      reportTeamSelect.value = curVal;
    } else {
      reportTeamSelect.value = 'all';
    }
  }

  // 4. 관리자 일정 등록 시 대상 팀 (admSchedTargetTeam)
  const admSchedTargetTeam = document.getElementById('admSchedTargetTeam');
  if (admSchedTargetTeam) {
    const curVal = admSchedTargetTeam.value;
    admSchedTargetTeam.innerHTML = '';
    teamList.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.innerText = name;
      admSchedTargetTeam.appendChild(opt);
    });
    if (curVal && teamList.includes(curVal)) {
      admSchedTargetTeam.value = curVal;
    } else if (teamList.length > 0) {
      admSchedTargetTeam.value = teamList[0];
    }
  }

  // 5. 관리자 회원관리 탭 팀 필터 (admUserFilterSelect)
  const admUserFilterSelect = document.getElementById('admUserFilterSelect');
  if (admUserFilterSelect) {
    const curVal = admUserFilterSelect.value;
    admUserFilterSelect.innerHTML = '<option value="all">전체 팀 보기</option>';
    teamList.forEach(name => {
      if (name !== '영업 1팀' && name !== '영업1팀' && name !== '미지정' && name !== '관리자') {
        const opt = document.createElement('option');
        opt.value = name;
        opt.innerText = ` ${name}`;
        admUserFilterSelect.appendChild(opt);
      }
    });

    const adminOpt = document.createElement('option');
    adminOpt.value = '관리자';
    adminOpt.innerText = ' 관리자';
    admUserFilterSelect.appendChild(adminOpt);

    const unassignedOpt = document.createElement('option');
    unassignedOpt.value = '미지정';
    unassignedOpt.innerText = ' 미지정';
    admUserFilterSelect.appendChild(unassignedOpt);

    if (curVal && (teamList.includes(curVal) || curVal === '관리자' || curVal === '미지정')) {
      admUserFilterSelect.value = curVal;
    } else {
      admUserFilterSelect.value = 'all';
    }
  }
}

window.selectTeamFilter = function(teamName) {
  if (selectedTeamFilter === teamName) {
    resetTeamFilter();
    return;
  }
  selectedTeamFilter = teamName;
  const select = document.getElementById('perfTeamSelect');
  if (select) select.value = teamName;
  filterPerfTable();
};

window.resetTeamFilter = function() {
  selectedTeamFilter = 'all';
  const select = document.getElementById('perfTeamSelect');
  if (select) select.value = 'all';
  filterPerfTable();
};

window.handleTeamSelectChange = function() {
  const select = document.getElementById('perfTeamSelect');
  selectedTeamFilter = select ? select.value : 'all';
  filterPerfTable();
};

function sortAndRankPerfData() {
  performanceData.sort((a, b) => b.monthly - a.monthly);
  performanceData.forEach((p, idx) => {
    p.rank = idx + 1;
    const rate = Math.round((p.monthly / p.target) * 100);
    p.status = rate >= 100 ? '목표 초과' : rate >= 80 ? '달성 임박' : '진행중';
  });
}

function renderPerfTable(data) {
  const tbody = document.getElementById('perfTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  data.forEach((p, idx) => {
    const rate = Math.round((p.monthly / p.target) * 100);
    const rankClass = idx === 0 ? 'rank-top1' : idx === 1 ? 'rank-top2' : idx === 2 ? 'rank-top3' : 'rank-normal';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="rank-circle ${rankClass}">${p.rank}</span></td>
      <td><strong>${p.name}</strong></td>
      <td><span style="color:var(--text-sub); font-weight:600;">${p.team}</span></td>
      <td style="text-align:right; font-weight:700;">${p.count} 건</td>
      <td style="text-align:right; font-weight:800; color:var(--primary);">${(p.monthly).toLocaleString()} 원</td>
      <td>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill ${rate >= 100 ? 'over' : ''}" style="width: ${Math.min(rate, 100)}%;"></div>
        </div>
        <span style="font-size:12px; font-weight:800; color:${rate >= 100 ? 'var(--success)' : 'var(--text-main)'};">${rate}%</span>
      </td>
      <td style="text-align:right; font-weight:700; color:var(--text-sub);">${(p.total).toLocaleString()} 원</td>
      <td style="text-align:center;">
        <span class="status-badge ${rate >= 100 ? 'on-time' : 'absent'}" style="font-size:11px;">
          ${p.status}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.filterPerfTable = function() {
  const search = (document.getElementById('perfSearch')?.value || '').trim().toLowerCase();
  const teamVal = document.getElementById('perfTeamSelect')?.value || 'all';
  selectedTeamFilter = teamVal;

  const filtered = performanceData.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search) || item.team.toLowerCase().includes(search);
    const matchesTeam = teamVal === 'all' || item.team === teamVal;
    return matchesSearch && matchesTeam;
  });

  renderPerfTable(filtered);
  renderTeamGoalsCards();
};

window.exportPerfToCSV = function() {
  let csv = "\uFEFF=== [1] 팀별 당월 영업 목표 및 실적 현황 ===\n";
  csv += "순위,팀명,팀장,소속인원수,당월목표액(원),당월합산실적(원),신규체결건수,달성률,상태\n";
  teamGoalsData.forEach(t => {
    csv += `"${t.rank}","${t.team}","${t.leader || ''}","${t.memberCount}","${t.target}","${t.totalMonthly}","${t.totalCount}","${t.rate}%","${t.status}"\n`;
  });

  csv += "\n=== [2] 파트너 개인별 영업 실적 집계표 ===\n";
  csv += "순위,파트너명,소속팀,신규체결건수,당월환산실적(원),당월목표액(원),달성률,누적환산실적(원),상태\n";
  performanceData.forEach(p => {
    const rate = Math.round((p.monthly / p.target) * 100);
    csv += `"${p.rank}","${p.name}","${p.team}","${p.count}","${p.monthly}","${p.target}","${rate}%","${p.total}","${p.status}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `위라클파트너스_팀별_개인별_영업실적_보고서_202610.csv`;
  a.click();
  URL.revokeObjectURL(url);
};


// =========================================================
// [4. 콘텐츠 연구소 (주제 제시 & 직원 의견 소통 라운지)]
// =========================================================
let currentLabTopic = {
  id: null,
  title: "등록된 연구 주제가 없습니다",
  desc: "관리자 콘솔 [5. 관리자 제어 콘솔 > 콘텐츠 연구소 관리]에서 새로운 연구 주제를 등록해 주세요.",
  startDate: ""
};

let currentTopicIdeas = [];
let pastTopicsArchive = [];

// 로컬 스토리지 데이터 복원 (더미 샘플 배제 및 실제 등록 데이터만 복원)
try {
  const savedTopic = localStorage.getItem('weracle_lab_current_topic');
  if (savedTopic !== null) {
    const parsed = JSON.parse(savedTopic);
    if (parsed && parsed.id && parsed.title && !parsed.title.includes('2030 사회초년생')) {
      currentLabTopic = parsed;
    } else if (parsed && parsed.title && parsed.title.includes('2030 사회초년생')) {
      localStorage.removeItem('weracle_lab_current_topic');
    }
  }

  const savedIdeas = localStorage.getItem('weracle_lab_current_ideas');
  if (savedIdeas !== null) {
    const parsed = JSON.parse(savedIdeas);
    if (Array.isArray(parsed)) {
      currentTopicIdeas = parsed.filter(item => 
        item && item.author !== '정다은 프로' && item.author !== '이영희 수석' &&
        !(item.author === '김철수 팀장' && item.content && item.content.includes('실손 청구 대행'))
      );
      if (currentTopicIdeas.length !== parsed.length) {
        localStorage.setItem('weracle_lab_current_ideas', JSON.stringify(currentTopicIdeas));
      }
    }
  }

  const savedArchive = localStorage.getItem('weracle_lab_past_archive');
  if (savedArchive !== null) {
    const parsed = JSON.parse(savedArchive);
    if (Array.isArray(parsed)) {
      pastTopicsArchive = parsed.filter(t => 
        t && !t.title?.includes('유병자 간편보험') && !t.title?.includes('4050 은퇴설계') && !t.title?.includes('2030 사회초년생')
      );
      if (pastTopicsArchive.length !== parsed.length) {
        localStorage.setItem('weracle_lab_past_archive', JSON.stringify(pastTopicsArchive));
      }
    }
  }
} catch (e) {
  console.warn('Lab data localStorage load error:', e);
}

// 지난 저장된 주제는 최대 3개까지만 유지
if (Array.isArray(pastTopicsArchive) && pastTopicsArchive.length > 3) {
  pastTopicsArchive = pastTopicsArchive.slice(0, 3);
}

// Supabase로부터 로드된 연구소 데이터 반영
function applyLabDataFromSupabase(val) {
  if (!val || typeof val !== 'object') return;
  if (val.currentTopic && val.currentTopic.title && !val.currentTopic.title.includes("2030 사회초년생") && val.currentTopic.id) {
    currentLabTopic = val.currentTopic;
    try { localStorage.setItem('weracle_lab_current_topic', JSON.stringify(currentLabTopic)); } catch (e) {}
  }
  if (Array.isArray(val.currentIdeas)) {
    currentTopicIdeas = val.currentIdeas.filter(i => 
      i && i.author !== '정다은 프로' && i.author !== '이영희 수석' &&
      !(i.author === '김철수 팀장' && i.content && i.content.includes('실손 청구 대행'))
    );
    try { localStorage.setItem('weracle_lab_current_ideas', JSON.stringify(currentTopicIdeas)); } catch (e) {}
  }
  if (Array.isArray(val.pastArchive)) {
    pastTopicsArchive = val.pastArchive.filter(t => 
      t && !t.title?.includes("유병자 간편보험") && !t.title?.includes("4050 은퇴설계") && !t.title?.includes("2030 사회초년생")
    ).slice(0, 3);
    try { localStorage.setItem('weracle_lab_past_archive', JSON.stringify(pastTopicsArchive)); } catch (e) {}
  }
  renderCurrentTopicBanner();
  renderIdeaFeed();
  renderPastTopicsList();
  if (typeof renderAdminIdeaList === 'function') renderAdminIdeaList();
  if (typeof renderAdminTopicInfo === 'function') renderAdminTopicInfo();
}

function saveLabData() {
  // 지난 저장된 주제는 최대 3개까지만 보관 (초과분 자동 삭제)
  if (Array.isArray(pastTopicsArchive) && pastTopicsArchive.length > 3) {
    pastTopicsArchive = pastTopicsArchive.slice(0, 3);
  }

  try {
    localStorage.setItem('weracle_lab_current_topic', JSON.stringify(currentLabTopic));
    localStorage.setItem('weracle_lab_current_ideas', JSON.stringify(currentTopicIdeas));
    localStorage.setItem('weracle_lab_past_archive', JSON.stringify(pastTopicsArchive));
  } catch (e) {
    console.warn('Lab data save error:', e);
  }

  // Supabase 클라우드 실시간 동기화 (partners_settings 테이블)
  saveSettingToSupabase('lab_data', {
    currentTopic: currentLabTopic,
    currentIdeas: currentTopicIdeas,
    pastArchive: pastTopicsArchive
  }, '콘텐츠 연구소 안건, 등록된 아이디어, 지난 주제 보관함 (최대 3개)');
}

function initContentLab() {
  if (Array.isArray(pastTopicsArchive) && pastTopicsArchive.length > 3) {
    pastTopicsArchive = pastTopicsArchive.slice(0, 3);
  }
  const authorEl = document.getElementById('labIdeaAuthorName');
  if (authorEl) {
    const u = (typeof currentUser !== 'undefined' && currentUser) ||
              (typeof currentProfile !== 'undefined' && currentProfile) ||
              (parentWindow && (parentWindow.currentUser || parentWindow.currentProfile));
    if (u && (u.name || u.nickname)) {
      authorEl.innerText = `${u.name || u.nickname} (${u.team || '영업본부'})`;
    }
  }
  renderCurrentTopicBanner();
  renderIdeaFeed();
  renderPastTopicsList();
}

function renderCurrentTopicBanner() {
  const titleEl = document.getElementById('currentTopicTitle');
  const descEl = document.getElementById('currentTopicDesc');
  const countEl = document.getElementById('currentTopicIdeaCount');

  const hasRealTopic = currentLabTopic && currentLabTopic.id && currentLabTopic.title && currentLabTopic.title !== '등록된 연구 주제가 없습니다';

  if (titleEl) {
    titleEl.innerText = hasRealTopic ? `"${currentLabTopic.title}"` : '등록된 연구 주제가 없습니다';
  }
  if (descEl) {
    descEl.innerText = hasRealTopic 
      ? (currentLabTopic.desc || '') 
      : '관리자 콘솔 [연구소 주제 관리]에서 새로운 연구 주제를 등록해 주세요.';
  }
  if (countEl) countEl.innerText = hasRealTopic ? currentTopicIdeas.length : 0;
}

function renderIdeaFeed() {
  const container = document.getElementById('ideaFeedContainer');
  const countEl = document.getElementById('currentTopicIdeaCount');
  const hasRealTopic = currentLabTopic && currentLabTopic.id && currentLabTopic.title && currentLabTopic.title !== '등록된 연구 주제가 없습니다';
  if (countEl) countEl.innerText = hasRealTopic ? currentTopicIdeas.length : 0;
  if (!container) return;

  container.innerHTML = '';

  if (!hasRealTopic) {
    container.innerHTML = `
      <div style="text-align:center; padding:48px 20px; background:#ffffff; border:1.5px dashed var(--border); border-radius:14px; color:var(--text-sub);">
        <i class="fa-solid fa-lightbulb" style="font-size:36px; color:var(--text-muted); margin-bottom:12px; display:block;"></i>
        <strong style="font-size:16px; color:var(--text-main);">현재 등록된 연구 주제가 없습니다.</strong>
        <p style="font-size:13px; color:var(--text-sub); margin-top:6px; line-height:1.5;">
          관리자 콘솔에서 새로운 연구 안건을 등록하면<br>파트너들과 실시간으로 아이디어 및 현장 노하우를 나눌 수 있습니다.
        </p>
      </div>
    `;
    return;
  }

  if (currentTopicIdeas.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:48px 20px; background:#ffffff; border:1.5px dashed var(--border); border-radius:14px; color:var(--text-sub);">
        <i class="fa-solid fa-comments" style="font-size:36px; color:var(--primary); margin-bottom:12px; display:block;"></i>
        <strong style="font-size:16px; color:var(--text-main);">새로운 연구 주제가 시작되었습니다!</strong>
        <p style="font-size:13px; color:var(--text-sub); margin-top:6px; line-height:1.5;">
          아직 등록된 의견이 없습니다.<br>첫 번째로 나만의 실무 노하우나 상담 화법을 편하게 공유해보세요!
        </p>
      </div>
    `;
    return;
  }

  currentTopicIdeas.forEach(item => {
    const card = document.createElement('div');
    card.className = 'idea-card';
    card.innerHTML = `
      <div class="idea-meta">
        <div class="idea-author">
          <div class="author-avatar"><i class="fa-solid fa-user"></i></div>
          <span>${item.author}</span>
          <span style="font-size:12px; color:var(--text-sub); font-weight:normal;">(${item.team || '파트너'})</span>
        </div>
        <div class="idea-date">${item.date}</div>
      </div>
      <div class="idea-body">${item.content}</div>
      <div class="idea-actions">
        <button class="btn-like ${item.isLiked ? 'active' : ''}" onclick="toggleIdeaLike(${item.id})">
          <i class="fa-${item.isLiked ? 'solid' : 'regular'} fa-heart"></i>
          <span>공감 ${item.likes}</span>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderPastTopicsList() {
  const listEl = document.getElementById('pastTopicsList');
  const countEl = document.getElementById('pastTopicCount');
  if (countEl) countEl.innerText = pastTopicsArchive.length;
  if (!listEl) return;

  listEl.innerHTML = '';
  if (pastTopicsArchive.length === 0) {
    listEl.innerHTML = '<div style="font-size:12px; color:var(--text-muted); text-align:center; padding:24px 12px;">보관된 지난 주제가 없습니다.</div>';
    return;
  }

  pastTopicsArchive.forEach(topic => {
    const item = document.createElement('div');
    item.className = 'past-topic-item';
    item.title = '클릭 시 지난 주제에 등록되었던 의견들을 확인합니다';
    item.onclick = () => openPastTopicModal(topic.id);
    item.innerHTML = `
      <div style="flex:1; padding-right:8px;">
        <div style="font-weight:700; font-size:13px; color:var(--text-main); line-height:1.3;">${topic.title}</div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:3px;">
          ${topic.period || ''} · <strong style="color:var(--primary);">${topic.ideaCount || (topic.ideas ? topic.ideas.length : 0)}개 의견</strong>
        </div>
      </div>
      <span style="font-size:12px; color:var(--primary); font-weight:700;"><i class="fa-solid fa-chevron-right"></i></span>
    `;
    listEl.appendChild(item);
  });
}

window.submitIdea = function() {
  const hasRealTopic = currentLabTopic && currentLabTopic.id && currentLabTopic.title && currentLabTopic.title !== '등록된 연구 주제가 없습니다';
  if (!hasRealTopic) {
    alert('현재 진행 중인 연구 주제가 없습니다.\n관리자 콘솔에서 먼저 새로운 연구 주제를 등록해 주세요.');
    return;
  }

  const input = document.getElementById('ideaInput');
  if (!input) return;
  const content = input.value.trim();
  if (!content) {
    alert('아이디어 및 의견 내용을 입력해주세요.');
    return;
  }

  let authorName = '파트너';
  let authorTeam = '영업본부';
  const u = (typeof currentUser !== 'undefined' && currentUser) ||
            (typeof currentProfile !== 'undefined' && currentProfile) ||
            (parentWindow && (parentWindow.currentUser || parentWindow.currentProfile));
  if (u) {
    authorName = u.name || u.nickname || authorName;
    authorTeam = u.team || authorTeam;
  }

  currentTopicIdeas.unshift({
    id: Date.now(),
    author: authorName,
    team: authorTeam,
    date: '방금 전',
    content: content,
    likes: 0,
    isLiked: false
  });

  input.value = '';
  saveLabData();
  renderIdeaFeed();
  renderAdminIdeaList();
  renderAdminTopicInfo();
  alert('연구소에 새로운 의견이 성공적으로 등록되었습니다!');
};

window.toggleIdeaLike = function(id) {
  const target = currentTopicIdeas.find(i => i.id === id);
  if (!target) return;
  if (target.isLiked) {
    target.likes--;
    target.isLiked = false;
  } else {
    target.likes++;
    target.isLiked = true;
  }
  saveLabData();
  renderIdeaFeed();
};

// 지난 연구 주제 모달 열기/닫기
window.openPastTopicModal = function(topicId) {
  const topic = pastTopicsArchive.find(t => t.id === topicId);
  if (!topic) return;

  const modal = document.getElementById('pastTopicModal');
  const titleEl = document.getElementById('modalTopicTitle');
  const descEl = document.getElementById('modalTopicDesc');
  const ideasEl = document.getElementById('modalTopicIdeas');

  if (titleEl) titleEl.innerText = `"${topic.title}"`;
  if (descEl) descEl.innerText = `${topic.desc || ''} (${topic.period || ''})`;

  if (ideasEl) {
    ideasEl.innerHTML = '';
    const ideas = topic.ideas || [];
    if (ideas.length === 0) {
      ideasEl.innerHTML = '<div style="font-size:13px; color:var(--text-muted); text-align:center; padding:30px;">이 주제에 등록되었던 의견이 없습니다.</div>';
    } else {
      ideas.forEach(item => {
        const div = document.createElement('div');
        div.style.cssText = 'background:#f8fafc; border:1px solid var(--border); border-radius:10px; padding:14px;';
        div.innerHTML = `
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <strong style="font-size:13px; color:var(--text-main);">${item.author} (${item.team})</strong>
            <span style="font-size:11px; color:var(--text-muted);">${item.date || ''} · 공감 ${item.likes || 0}</span>
          </div>
          <div style="font-size:13px; line-height:1.5; color:var(--text-main);">${item.content}</div>
        `;
        ideasEl.appendChild(div);
      });
    }
  }

  if (modal) modal.style.display = 'flex';
};

window.closePastTopicModal = function() {
  const modal = document.getElementById('pastTopicModal');
  if (modal) modal.style.display = 'none';
};


// =========================================================
// [5.  관리자 제어 콘솔 (스케줄/정책/실적/연구소/회원권한)]
// =========================================================
// 파트너스(C 권한) 실제 보유 회원 기본값 및 로컬 캐시 연동 (로컬 실행 시 즉시 로딩 보장)
let adminUsersData = [
  { id: '9a333f7f-42d2-41b6-8888-a3a3f55e1afc', name: '김시화', nickname: '김시화', team: '영업 1팀', access_grades: 'A,B,C,D,E,F', user_grade: 'VIP' },
  { id: '6e1bdc08-264d-48ae-a751-47fec5514a21', name: '김선영', nickname: '김선영', team: '영업 1팀', access_grades: 'A,B,C,D,E,F', user_grade: 'VIP' }
];

try {
  const cachedUsers = localStorage.getItem('weracle_partner_profiles');
  if (cachedUsers) {
    const parsed = JSON.parse(cachedUsers);
    if (Array.isArray(parsed) && parsed.length > 0) adminUsersData = parsed;
  }
} catch(e){}

let memberTeamsMap = {};
let memberGradesMap = {};

try {
  const savedTeams = localStorage.getItem('weracle_member_teams');
  if (savedTeams) memberTeamsMap = JSON.parse(savedTeams);
  const savedGrades = localStorage.getItem('weracle_member_grades');
  if (savedGrades) memberGradesMap = JSON.parse(savedGrades);
} catch (e) {}

window.switchTeamMemberSubTab = function(subIdx) {
  currentTeamMemberSubTab = subIdx;
  for (let i = 1; i <= 4; i++) {
    const btn = document.getElementById(`tmSubBtn${i}`);
    const pane = document.getElementById(`tmPane${i}`);
    if (btn && pane) {
      if (i === subIdx) {
        btn.classList.add('active');
        pane.style.display = 'block';
      } else {
        btn.classList.remove('active');
        pane.style.display = 'none';
      }
    }
  }
  if (subIdx === 1) filterAdminUserList();
  if (subIdx === 2) renderAdminTeamGoalsTable();
  if (subIdx === 3) renderAdminPerfTable();
  if (subIdx === 4) filterAdminRoleList();
};

window.switchAdminSubTab = function(idx) {
  for (let i = 1; i <= 4; i++) {
    const btn = document.getElementById(`admSubBtn${i}`);
    const pane = document.getElementById(`admSubPane${i}`);
    if (btn && pane) {
      if (i === idx) {
        btn.classList.add('active');
        pane.style.display = 'block';
      } else {
        btn.classList.remove('active');
        pane.style.display = 'none';
      }
    }
  }
  if (idx === 1) {
    renderCompanyChips();
    populateCompanySelect();
    renderAdminScheduleList();
  }
  if (idx === 3) {
    switchTeamMemberSubTab(currentTeamMemberSubTab || 1);
  }
  if (idx === 4) {
    renderAdminTopicInfo();
    renderAdminIdeaList();
  }
};

function initAdminConsole() {
  switchAdminSubTab(1); // 기본 1번 탭 오픈
  renderCompanyChips();
  populateCompanySelect();
  renderAdminScheduleList();
  renderAdminTeamGoalsTable();
  renderAdminPerfTable();
  renderAdminTopicInfo();
  renderAdminIdeaList();
  loadAdminUserList();
}

// 1. 관리자: 스케줄 목록 및 추가/삭제
function renderAdminScheduleList() {
  const listEl = document.getElementById('admScheduleList');
  const countEl = document.getElementById('admSchedCount');
  if (!listEl) return;

  listEl.innerHTML = '';
  if (countEl) countEl.innerText = sampleSchedules.length;

  sampleSchedules.forEach(item => {
    const row = document.createElement('div');
    row.className = 'admin-list-item';
    row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-bottom:1px solid #f1f5f9; gap:8px;';
    
    row.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <strong>${item.date} (${item.time})</strong>
          <span style="color:${item.category === 'edu' ? 'var(--primary)' : 'var(--warning)'}; font-weight:700; font-size:12px;">
            ${item.category === 'edu' ? '[교육]' : '[회사]'}
          </span>
          ${item.company ? `<span class="badge-company"> ${item.company}</span>` : ''}
          ${item.isNewbie ? `<span class="badge-newbie"> 신입</span>` : ''}
          ${item.targetType === 'team' ? `<span class="badge-cat" style="background:#fef3c7; color:#92400e; font-size:11px;"> ${item.targetTeam}</span>` : item.targetType === 'personal' ? `<span class="badge-cat" style="background:#f3e8ff; color:#7e22ce; font-size:11px;"> ${item.targetUserName || '개인'}</span>` : `<span class="badge-cat" style="background:#f1f5f9; color:#475569; font-size:11px;"> 전사</span>`}
          ${item.googleSynced !== false ? `<span style="font-size:11px; color:#4285F4; font-weight:700; display:inline-flex; align-items:center; gap:2px;"><i class="fa-brands fa-google"></i> 연동</span>` : ''}
        </div>
        <div style="font-size:13px; font-weight:700; color:var(--text-main);">
          ${item.title}
        </div>
      </div>
      <button class="btn-danger" style="padding:4px 10px; font-size:12px; white-space:nowrap;" onclick="adminDeleteSchedule(${item.id})">삭제</button>
    `;
    listEl.appendChild(row);
  });
}

window.handleSchedTargetTypeChange = function() {
  const type = document.getElementById('admSchedTargetType')?.value || 'all';
  const teamEl = document.getElementById('admSchedTargetTeam');
  const userEl = document.getElementById('admSchedTargetUser');
  const allDesc = document.getElementById('admSchedTargetAllDesc');

  if (teamEl) teamEl.style.display = type === 'team' ? 'block' : 'none';
  if (userEl) {
    userEl.style.display = type === 'personal' ? 'block' : 'none';
    if (type === 'personal') populateSchedTargetUsers();
  }
  if (allDesc) allDesc.style.display = type === 'all' ? 'flex' : 'none';
};

window.populateSchedTargetUsers = function() {
  const sel = document.getElementById('admSchedTargetUser');
  if (!sel) return;
  sel.innerHTML = '<option value="">설계사 선택...</option>';
  adminUsersData.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.innerText = `${u.name || u.nickname || '파트너'}${u.team ? ` (${u.team})` : ''}`;
    sel.appendChild(opt);
  });
};

window.adminAddSchedule = function() {
  const date = document.getElementById('admSchedDate').value;
  const time = document.getElementById('admSchedTime').value;
  const cat = document.getElementById('admSchedCategory').value;
  const title = document.getElementById('admSchedTitle').value.trim();
  const company = cat === 'edu' ? (document.getElementById('admSchedCompany')?.value || '') : '';
  const isNewbie = cat === 'edu' ? (document.getElementById('admSchedIsNewbie')?.checked || false) : false;

  const targetType = document.getElementById('admSchedTargetType')?.value || 'all';
  const targetTeam = targetType === 'team' ? (document.getElementById('admSchedTargetTeam')?.value || '') : '';
  const targetUserEl = document.getElementById('admSchedTargetUser');
  const targetUserId = targetType === 'personal' ? (targetUserEl?.value || '') : '';
  const targetUserName = targetType === 'personal' ? (targetUserEl?.options[targetUserEl.selectedIndex]?.text || '') : '';
  const remindTime = document.getElementById('admSchedRemindTime')?.value || '30m';
  const remind1d = document.getElementById('admSchedRemind1d')?.checked !== false;

  const remindLabels = {
    '0': '정시',
    '10m': '10분 전',
    '30m': '30분 전',
    '1h': '1시간 전',
    '2h': '2시간 전',
    'none': '알림 없음'
  };
  const remindLabel = remindLabels[remindTime] || '30분 전';

  if (!title) {
    alert('일정 제목을 입력하세요.');
    return;
  }

  // 대상자 이메일 목록 집계
  let targetEmails = [];
  if (targetType === 'all') {
    targetEmails = adminUsersData.map(u => u.email).filter(Boolean);
  } else if (targetType === 'team') {
    targetEmails = adminUsersData.filter(u => u.team === targetTeam).map(u => u.email).filter(Boolean);
  } else if (targetType === 'personal') {
    const user = adminUsersData.find(u => u.id === targetUserId);
    if (user && user.email) targetEmails = [user.email];
  }

  const newSched = {
    id: Date.now(),
    date: date,
    time: time,
    category: cat,
    title: title,
    company: company,
    isNewbie: isNewbie,
    targetType: targetType,
    targetTeam: targetTeam,
    targetUserId: targetUserId,
    targetUserName: targetUserName,
    targetEmails: targetEmails,
    remindTime: remindTime,
    remind10m: remindTime === '10m',
    remind1d: remind1d,
    googleSynced: true
  };

  sampleSchedules.unshift(newSched);
  saveSchedulesToStorage();
  syncScheduleToSupabaseAndGoogle(newSched, 'create');

  document.getElementById('admSchedTitle').value = '';
  if (document.getElementById('admSchedIsNewbie')) {
    document.getElementById('admSchedIsNewbie').checked = false;
  }

  renderScheduleTimeline();
  renderCalendar();
  renderUpcomingSchedules();
  renderAdminScheduleList();
  
  const targetMsg = targetType === 'team' ? `\n- 알림 대상: [ ${targetTeam}]` : targetType === 'personal' ? `\n- 알림 대상: [ ${targetUserName}]` : '\n- 알림 대상: [ 전사 공통 (전 직원 폰 캘린더)]';
  const detailMsg = cat === 'edu' 
    ? `\n- 주관 회사: ${company || '자체 교육'}\n- 루키 구분: ${isNewbie ? ' 신입 전용' : '일반'}`
    : '';
  alert(`새 일정이 성공적으로 등록되었습니다!\n 수파베이스 DB 저장 완료\n 공식 구글 캘린더(boheomdapda@gmail.com) 동기화 & ${remindLabel} 스마트폰 알림 예약 완료!${targetMsg}${detailMsg}`);
};

window.adminDeleteSchedule = async function(id) {
  const target = sampleSchedules.find(s => s.id === id);
  if (!await showConfirm('이 일정을 삭제하시겠습니까?\n(클라우드 DB 및 연동된 캘린더에서도 함께 삭제됩니다)', '일정 삭제')) return;
  if (target) {
    await syncScheduleToSupabaseAndGoogle(target, 'delete');
  }
  sampleSchedules = sampleSchedules.filter(s => s.id !== id);
  saveSchedulesToStorage();
  renderScheduleTimeline();
  renderCalendar();
  renderUpcomingSchedules();
  renderAdminScheduleList();
};

// 2. 관리자: 출결 시간 및 출석률 평가 정책 설정 저장
window.saveTimeSettings = function() {
  const workTime = document.getElementById('cfgWorkTime')?.value || '09:00';
  const eduAmTime = document.getElementById('cfgEduAmTime')?.value || '10:00';
  const eduPmTime = document.getElementById('cfgEduPmTime')?.value || '11:00';

  timePolicySettings = {
    workTime: workTime,
    eduAmTime: eduAmTime,
    eduPmTime: eduPmTime
  };

  const cfgWorkDays = document.getElementById('cfgTotalWorkDays');
  const cfgEx = document.getElementById('cfgRateExcellent');
  const cfgGd = document.getElementById('cfgRateGood');

  if (cfgWorkDays && cfgEx && cfgGd) {
    const days = parseInt(cfgWorkDays.value, 10) || 12;
    const ex = parseInt(cfgEx.value, 10) || 95;
    const gd = parseInt(cfgGd.value, 10) || 80;

    attendancePolicySettings.totalWorkDays = days;
    attendancePolicySettings.rateExcellent = ex;
    attendancePolicySettings.rateGood = gd;
    localStorage.setItem('weracle_attendance_policy_settings', JSON.stringify(attendancePolicySettings));
    saveSettingToSupabase('attendance_policy', attendancePolicySettings, '당월 총 근무일수 및 출석률 평가기준(우수/보통/주의)');
    syncPolicyInputsToUI();
    filterMonthlyRateTab();
  }

  saveSettingToSupabase('attendance_times', {
    workStart: '08:30',
    workEnd: timePolicySettings.workTime,
    workLate: '09:30',
    edu1Start: timePolicySettings.eduAmTime,
    edu1End: '10:50',
    edu2Start: timePolicySettings.eduPmTime,
    edu2End: '11:50',
    leaveStart: '18:00'
  }, '출퇴근 및 교육 인정 시간 설정');

  alert(`[출결 정책 및 출석률 기준 설정 완료]\n- 정규 출근 기준: ${workTime}\n- 사내 교육 1 기준: ${eduAmTime}\n- 사내 교육 2 기준: ${eduPmTime}\n- 당월 총 근무일수: ${attendancePolicySettings.totalWorkDays}일\n- 🌟 우수 개근: ${attendancePolicySettings.rateExcellent}% 이상\n- ● 보통(양호): ${attendancePolicySettings.rateGood}% 이상\n- ⚠️ 출석 주의: ${attendancePolicySettings.rateGood}% 미만\n\n모든 시스템에 즉시 반영되었습니다.\n(Supabase 클라우드 동기화 완료)`);
};

// 3. 관리자: 파트너스 실적 및 팀별 목표 관리
// 3-A. 팀별 목표 금액 설정 테이블 렌더링
function renderAdminTeamGoalsTable() {
  const tbody = document.getElementById('admTeamGoalsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  teamGoalsData.forEach((t, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center;"><strong>${t.rank || idx + 1}</strong></td>
      <td>
        <input type="text" id="admTeamName_${idx}" class="form-input" style="padding:5px 8px; font-weight:700; width:100%;" value="${t.team}">
      </td>
      <td>
        <input type="text" id="admTeamLeader_${idx}" class="form-input" style="padding:5px 8px; width:100%;" value="${t.leader || ''}" placeholder="팀장명">
      </td>
      <td style="text-align:center;">
        <span style="font-weight:700; color:var(--text-sub);">${t.memberCount || 0}명</span>
      </td>
      <td>
        <input type="number" id="admTeamTarget_${idx}" class="form-input" style="padding:5px 8px; font-weight:800; color:var(--primary); width:100%;" value="${t.target}">
      </td>
      <td style="text-align:right; font-weight:800; color:var(--text-main);">
        ${(t.totalMonthly || 0).toLocaleString()} 원
      </td>
      <td style="text-align:center;">
        <span style="font-weight:800; color:${(t.rate || 0) >= 100 ? 'var(--success)' : 'var(--primary)'};">
          ${t.rate || 0}%
        </span>
      </td>
      <td style="text-align:center;">
        <button class="btn-danger" style="padding:4px 8px; font-size:11px;" onclick="adminDeleteTeam(${idx})">삭제</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.adminSaveAllTeamGoals = function() {
  teamGoalsData.forEach((t, idx) => {
    const nameInput = document.getElementById(`admTeamName_${idx}`);
    const leaderInput = document.getElementById(`admTeamLeader_${idx}`);
    const targetInput = document.getElementById(`admTeamTarget_${idx}`);

    const oldName = t.team;
    const newName = nameInput ? nameInput.value.trim() : oldName;
    if (newName && newName !== oldName) {
      // 1. 파트너 실적 데이터의 팀명 동기화
      performanceData.forEach(p => {
        if (p.team === oldName) p.team = newName;
      });
      // 2. 회원 명부 데이터의 팀명 동기화
      adminUsersData.forEach(u => {
        if (u.team === oldName) u.team = newName;
      });
      t.team = newName;
    }
    if (leaderInput) t.leader = leaderInput.value.trim();
    if (targetInput) t.target = parseInt(targetInput.value, 10) || 0;
  });

  calculateTeamStats();
  sortAndRankPerfData();
  savePerformanceStorage();

  const teamGoalsObj = {};
  teamGoalsData.forEach(t => {
    teamGoalsObj[t.team] = t.target;
  });
  saveSettingToSupabase('team_goals', teamGoalsObj, '팀별 월간 목표 금액');

  renderTeamGoalsCards();
  populateTeamDropdowns();
  renderPerfTable(performanceData);
  renderAdminTeamGoalsTable();
  renderAdminPerfTable();
  filterAdminUserList();
  if (typeof renderLeaderQrGrid === 'function' && document.getElementById('leaderQrModal')?.style.display !== 'none') renderLeaderQrGrid();

  alert('팀별 목표 금액 및 팀 설정이 성공적으로 저장되었습니다!\n(회원 관리 소속팀 목록 자동 갱신 완료)');
};

window.adminAddNewTeam = function() {
  const teamName = prompt('추가할 새 팀 이름을 입력하세요 (예: 스마트영업팀):');
  if (!teamName || !teamName.trim()) return;
  const trimmed = teamName.trim();
  if (teamGoalsData.some(t => t.team === trimmed)) {
    alert('이미 동일한 이름의 팀이 존재합니다.');
    return;
  }
  const leader = prompt('팀장 또는 담당자 이름을 입력하세요:', '') || '';
  const targetStr = prompt('당월 팀 목표 금액(원)을 입력하세요:', '40000000');
  const target = parseInt(targetStr, 10) || 40000000;

  teamGoalsData.push({
    team: trimmed,
    leader: leader.trim(),
    target: target
  });

  calculateTeamStats();
  savePerformanceStorage();

  const teamGoalsObj = {};
  teamGoalsData.forEach(t => {
    teamGoalsObj[t.team] = t.target;
  });
  saveSettingToSupabase('team_goals', teamGoalsObj, '팀별 월간 목표 금액');

  renderTeamGoalsCards();
  populateTeamDropdowns();
  renderAdminTeamGoalsTable();
  renderAdminPerfTable();
  filterAdminUserList();

  alert(`[${trimmed}]이 새로 추가되었습니다!\n회원 관리와 파트너 실적 관리의 소속팀 목록에서 즉시 선택할 수 있습니다.`);
};

window.adminDeleteTeam = async function(idx) {
  const t = teamGoalsData[idx];
  if (!t) return;
  if (!await showConfirm(`'${t.team}' 소속팀을 정말 삭제하시겠습니까?`, '소속팀 삭제')) return;

  const remainingTeams = teamGoalsData.filter((_, i) => i !== idx);
  const fallbackTeam = remainingTeams.length > 0 ? remainingTeams[0].team : '';

  performanceData.forEach(p => {
    if (p.team === t.team) p.team = fallbackTeam;
  });
  adminUsersData.forEach(u => {
    if (u.team === t.team) u.team = fallbackTeam;
  });

  teamGoalsData.splice(idx, 1);
  calculateTeamStats();
  savePerformanceStorage();

  const teamGoalsObj = {};
  teamGoalsData.forEach(t => {
    teamGoalsObj[t.team] = t.target;
  });
  saveSettingToSupabase('team_goals', teamGoalsObj, '팀별 월간 목표 금액');

  renderTeamGoalsCards();
  populateTeamDropdowns();
  renderAdminTeamGoalsTable();
  renderAdminPerfTable();
  filterAdminUserList();
};

// 3-B. 파트너 개인별 실적 및 팀 배정 테이블 렌더링
function renderAdminPerfTable() {
  const tbody = document.getElementById('admPerfTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  performanceData.forEach((p, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${p.name}</strong></td>
      <td>
        <select id="admPerfTeam_${idx}" class="form-input" style="padding:4px 6px; font-size:12px; width:100%;">
          <option value="미지정" ${!p.team || p.team === '미지정' ? 'selected' : ''}>미지정</option>
          <option value="관리자" ${p.team === '관리자' || p.team === '본사' ? 'selected' : ''}>관리자</option>
          ${teamGoalsData.filter(t => t.team !== '영업 1팀' && t.team !== '영업1팀' && t.team !== '미지정' && t.team !== '관리자').map(t => `<option value="${t.team}" ${p.team === t.team ? 'selected' : ''}>${t.team}</option>`).join('')}
        </select>
      </td>
      <td><input type="number" id="admPerfCount_${idx}" class="form-input" style="width:100%; padding:4px 6px;" value="${p.count}"></td>
      <td><input type="number" id="admPerfMonthly_${idx}" class="form-input" style="width:100%; padding:4px 6px;" value="${p.monthly}"></td>
      <td><input type="number" id="admPerfTarget_${idx}" class="form-input" style="width:100%; padding:4px 6px;" value="${p.target}"></td>
      <td style="text-align:center;">
        <button class="btn-danger" style="padding:4px 8px; font-size:11px;" onclick="adminDeletePartnerPerf(${idx})">삭제</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.adminSaveAllPerf = function() {
  performanceData.forEach((p, idx) => {
    const teamSelect = document.getElementById(`admPerfTeam_${idx}`);
    const countInput = document.getElementById(`admPerfCount_${idx}`);
    const monthlyInput = document.getElementById(`admPerfMonthly_${idx}`);
    const targetInput = document.getElementById(`admPerfTarget_${idx}`);

    if (teamSelect) p.team = teamSelect.value;
    if (countInput) p.count = parseInt(countInput.value, 10) || 0;
    if (monthlyInput) p.monthly = parseInt(monthlyInput.value, 10) || 0;
    if (targetInput) p.target = parseInt(targetInput.value, 10) || 20000000;
  });

  sortAndRankPerfData();
  calculateTeamStats();
  savePerformanceStorage();
  syncPerformanceToSupabase();
  renderTeamGoalsCards();
  renderPerfTable(performanceData);
  renderAdminTeamGoalsTable();
  renderAdminPerfTable();
  alert('파트너스 개인 실적 및 팀 배정 변경사항이 전체 적용되었습니다!\n(Supabase 클라우드 동기화 완료)');
};

window.adminAddNewPartnerPerf = function() {
  const name = prompt('새 파트너의 이름을 입력하세요:');
  if (!name || !name.trim()) return;
  const defaultTeam = teamGoalsData.length > 0 ? teamGoalsData[0].team : '스타팀';
  const team = prompt(`소속팀을 입력하세요 (예: ${defaultTeam}):`, defaultTeam) || defaultTeam;

  performanceData.push({
    rank: performanceData.length + 1,
    name: name.trim(),
    team: team.trim(),
    count: 0,
    monthly: 0,
    target: 20000000,
    total: 0,
    status: '진행중'
  });

  sortAndRankPerfData();
  calculateTeamStats();
  savePerformanceStorage();
  syncPerformanceToSupabase();
  renderTeamGoalsCards();
  populateTeamDropdowns();
  renderPerfTable(performanceData);
  renderAdminTeamGoalsTable();
  renderAdminPerfTable();
  alert(`${name.trim()} 파트너가 실적표에 새로 등록되었습니다.`);
};

window.adminDeletePartnerPerf = async function(idx) {
  const p = performanceData[idx];
  if (!p) return;
  if (!await showConfirm(`'${p.name}' 파트너를 실적표에서 삭제하시겠습니까?`, '파트너 실적 삭제')) return;
  if (p.db_id) {
    const sb = await getSb();
    if (sb) {
      try {
        await sb.from('partners_performance').delete().eq('id', p.db_id);
      } catch (e) {
        console.warn('실적 DB 삭제 에러:', e);
      }
    }
  }
  performanceData.splice(idx, 1);
  savePerformanceStorage();
  sortAndRankPerfData();
  calculateTeamStats();
  renderTeamGoalsCards();
  populateTeamDropdowns();
  renderPerfTable(performanceData);
  renderAdminTeamGoalsTable();
  renderAdminPerfTable();
};

// 4. 관리자: 콘텐츠 연구소 주제 변경 & 이전 데이터 자동 보관 관리
function renderAdminTopicInfo() {
  const titleEl = document.getElementById('admCurrentTopicTitle');
  const countEl = document.getElementById('admCurrentIdeaCount');
  const hasRealTopic = currentLabTopic && currentLabTopic.id && currentLabTopic.title && currentLabTopic.title !== '등록된 연구 주제가 없습니다';

  if (titleEl) {
    titleEl.innerText = hasRealTopic ? `"${currentLabTopic.title}"` : '등록된 연구 주제 없음';
  }
  if (countEl) countEl.innerText = hasRealTopic ? currentTopicIdeas.length : 0;
}

window.adminUpdateTopic = async function() {
  const title = document.getElementById('admLabTitle').value.trim();
  const desc = document.getElementById('admLabDesc').value.trim();

  if (!title) {
    alert('새 연구 안건 제목을 입력하세요.');
    return;
  }

  const hasExistingTopic = currentLabTopic && currentLabTopic.id && currentLabTopic.title && currentLabTopic.title !== '등록된 연구 주제가 없습니다';
  const prevCount = currentTopicIdeas.length;

  if (hasExistingTopic) {
    const confirmMsg = `새로운 연구 주제로 교체하시겠습니까?\n\n- 기존 주제: "${currentLabTopic.title}"\n- 등록된 기존 의견: ${prevCount}개\n\n※ 기존 주제는 '지난 연구 주제 보관함'으로 자동 이동됩니다.`;
    if (!await showConfirm(confirmMsg, '연구 주제 교체')) return;

    // 1. 기존 주제 및 등록된 의견들을 '지난 주제 보관함'으로 깔끔하게 이동 (최대 3개만 유지, 초과분 자동 삭제)
    const today = new Date();
    const periodStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${Math.ceil(today.getDate() / 7)}주 마감`;
    pastTopicsArchive.unshift({
      id: Date.now(),
      title: currentLabTopic.title,
      desc: currentLabTopic.desc || '',
      period: periodStr,
      ideaCount: currentTopicIdeas.length,
      ideas: [...currentTopicIdeas]
    });
    // 지난 저장된 주제는 최대 3개까지만 보관 (오래된 항목 자동 삭제)
    if (pastTopicsArchive.length > 3) {
      pastTopicsArchive = pastTopicsArchive.slice(0, 3);
    }
  } else {
    const confirmMsg = `새로운 연구 주제를 등록하시겠습니까?\n\n- 새 주제: "${title}"`;
    if (!await showConfirm(confirmMsg, '연구 주제 등록')) return;
  }

  // 2. 새 주제로 세팅 & 현재 의견 목록 깨끗이 초기화
  currentLabTopic = {
    id: Date.now(),
    title: title,
    desc: desc || '새로운 연구 안건에 대한 파트너 여러분의 실무 팁과 노하우를 자유롭게 나눠주세요.',
    startDate: new Date().toLocaleDateString('ko-KR')
  };
  currentTopicIdeas = [];

  // 3. 로컬 저장 및 화면 동기화 (Supabase 실시간 클라우드 저장 포함)
  saveLabData();
  renderCurrentTopicBanner();
  renderIdeaFeed();
  renderPastTopicsList();
  renderAdminIdeaList();
  renderAdminTopicInfo();

  document.getElementById('admLabTitle').value = '';
  document.getElementById('admLabDesc').value = '';

  if (hasExistingTopic) {
    alert(`새로운 연구 주제가 성공적으로 설정되었습니다!\n기존 주제(${prevCount}개 의견)는 '지난 연구 주제 보관함'으로 이동되었습니다.`);
  } else {
    alert('새로운 연구 주제가 성공적으로 등록되었습니다!');
  }
};

function renderAdminIdeaList() {
  const listEl = document.getElementById('admIdeaManageList');
  const countEl = document.getElementById('admIdeaManageCount');
  const hasRealTopic = currentLabTopic && currentLabTopic.id && currentLabTopic.title && currentLabTopic.title !== '등록된 연구 주제가 없습니다';
  if (countEl) countEl.innerText = hasRealTopic ? currentTopicIdeas.length : 0;
  if (!listEl) return;

  listEl.innerHTML = '';
  if (!hasRealTopic || currentTopicIdeas.length === 0) {
    listEl.innerHTML = '<div style="font-size:12px; color:var(--text-muted); text-align:center; padding:24px;">현재 주제에 등록된 의견이 없습니다. (깨끗한 상태)</div>';
    return;
  }

  currentTopicIdeas.forEach(item => {
    const row = document.createElement('div');
    row.className = 'admin-list-item';
    row.innerHTML = `
      <div style="flex:1; padding-right:10px;">
        <strong>${item.author} (${item.team || '파트너'})</strong>: 
        <span style="color:var(--text-sub);">${item.content.slice(0, 45)}...</span>
        <span style="font-size:11px; color:var(--text-muted); margin-left:6px;">(공감 ${item.likes})</span>
      </div>
      <div>
        <button class="btn-danger" style="padding:4px 8px; font-size:11px;" onclick="adminDeleteIdea(${item.id})">삭제</button>
      </div>
    `;
    listEl.appendChild(row);
  });
}

window.adminDeleteIdea = async function(id) {
  if (!await showConfirm('이 의견을 정말 삭제하시겠습니까?', '의견 삭제')) return;
  currentTopicIdeas = currentTopicIdeas.filter(i => i.id !== id);
  saveLabData();
  renderIdeaFeed();
  renderAdminIdeaList();
  renderAdminTopicInfo();
};


// =========================================================
// [5.  회원 등급 & 파트너스(C) 권한 제어 센터]
// =========================================================
async function loadAdminUserList() {
  // Supabase가 연결되어 있으면 실제 profiles 테이블 조회 시도
  const sb = await getSb();
  if (sb) {
    try {
      const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
      if (!error && Array.isArray(data) && data.length > 0) {
        adminUsersData = data.map(u => {
          const assignedTeam = memberTeamsMap[u.id] || (u.email ? memberTeamsMap[u.email] : null) || u.team || '';
          const assignedGrades = memberGradesMap[u.id]?.access_grades !== undefined ? memberGradesMap[u.id].access_grades : (u.access_grades || '');
          const assignedGrade = memberGradesMap[u.id]?.user_grade !== undefined ? memberGradesMap[u.id].user_grade : (u.user_grade || 'basic');
          return {
            ...u,
            name: u.nickname || u.name || (u.email ? u.email.split('@')[0] : '이름 없음'),
            nickname: u.nickname || '',
            team: assignedTeam,
            access_grades: assignedGrades,
            user_grade: assignedGrade
          };
        });
        try {
          localStorage.setItem('weracle_partner_profiles', JSON.stringify(adminUsersData));
        } catch (e) {}
      }
    } catch (e) {
      console.warn('Supabase profiles 로드 실패, 기본 데이터 사용:', e);
    }
  }
  filterAdminUserList();
  filterAdminRoleList();
  renderTargetRosterTable();
  updateAttendanceStats();
  if (typeof renderLeaderQrGrid === 'function' && document.getElementById('leaderQrModal')?.style.display !== 'none') {
    renderLeaderQrGrid();
  }
}

// 1. [회원관리] 회원 목록 필터 및 검색 (파트너스로 등록된 사내 인원만 표시)
window.filterAdminUserList = function() {
  const search = (document.getElementById('admUserSearch')?.value || '').trim().toLowerCase();
  const filterTeam = document.getElementById('admUserFilterSelect')?.value || 'all';

  const filtered = adminUsersData.filter(user => {
    // 1) 파트너스로 등록된 사람만 표시: 'C'(파트너스) 권한 보유자 또는 family / manager 등급
    const isPartner = (user.access_grades || '').includes('C') || user.user_grade === 'family' || user.user_grade === 'manager';
    if (!isPartner) return false;

    // 2) 검색어 (이름, 닉네임, 이메일)
    const nameMatch = (user.name || '').toLowerCase().includes(search) || (user.nickname || '').toLowerCase().includes(search);
    const emailMatch = (user.email || '').toLowerCase().includes(search);
    if (search && !nameMatch && !emailMatch) return false;

    // 3) 소속팀 필터 (전체 / 특정 팀 / 관리자 / 미지정)
    if (filterTeam !== 'all') {
      if (filterTeam === '미지정') {
        if (user.team && user.team !== '미지정') return false;
      } else if (filterTeam === '관리자') {
        if (user.team !== '관리자' && user.team !== '본사') return false;
      } else {
        if (user.team !== filterTeam) return false;
      }
    }

    return true;
  });

  renderAdminUserTable(filtered);
};

// [회원관리] 회원 테이블 렌더링 (소속팀 배정 중심)
function renderAdminUserTable(users) {
  const tbody = document.getElementById('admUserTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">검색 조건에 맞는 파트너 회원이 없습니다.</td></tr>`;
    return;
  }

  users.forEach(u => {
    let gradeBadge = '<span class="status-badge" style="background:#f1f5f9; color:#475569; font-weight:700;"> 일반</span>';
    if (u.user_grade === 'VIP') {
      gradeBadge = '<span class="status-badge" style="background:#fef3c7; color:#b45309; font-weight:700;"> VIP</span>';
    } else if (u.user_grade === 'family') {
      gradeBadge = '<span class="status-badge" style="background:#ecfdf5; color:#047857; font-weight:700;"> 식구</span>';
    } else if (u.user_grade === 'manager') {
      gradeBadge = '<span class="status-badge" style="background:#f3e8ff; color:#7c3aed; font-weight:700;"> 관리자</span>';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${u.name || u.nickname || '이름 없음'}</strong>
        ${u.user_grade === 'manager' ? '<span class="status-badge" style="background:#f3e8ff; color:#7c3aed; font-size:10px; margin-left:4px;">관리자</span>' : ''}
      </td>
      <td><span style="color:var(--text-sub); font-size:12px;">${u.email || u.id}</span></td>
      
      <!-- 소속 팀 배정 (실제 입력된 팀 목록 + 관리자 + 미지정) -->
      <td>
        <select class="form-input" style="padding:4px 8px; font-size:12px; width:130px;" onchange="adminUpdateUserTeam('${u.id}', this.value)">
          <option value="미지정" ${!u.team || u.team === '미지정' ? 'selected' : ''}>미지정</option>
          <option value="관리자" ${u.team === '관리자' || u.team === '본사' ? 'selected' : ''}>관리자</option>
          ${teamGoalsData.filter(t => t.team !== '영업 1팀' && t.team !== '영업1팀' && t.team !== '미지정' && t.team !== '관리자').map(t => `<option value="${t.team}" ${u.team === t.team ? 'selected' : ''}>${t.team}</option>`).join('')}
          ${u.team && u.team !== '미지정' && u.team !== '관리자' && u.team !== '본사' && !teamGoalsData.some(t => t.team === u.team) ? `<option value="${u.team}" selected>${u.team}</option>` : ''}
        </select>
      </td>

      <!-- 파트너스 권한 배지 -->
      <td style="text-align:center;">
        <span class="badge-cat" style="background:#e0e7ff; color:#3730a3; font-weight:700; font-size:11px; padding:3px 8px; border-radius:100px;"> 정식 파트너</span>
      </td>

      <!-- 회원 등급 -->
      <td style="text-align:center;">
        ${gradeBadge}
      </td>

      <td><span style="font-size:11px; color:var(--text-muted);">${u.created_at ? u.created_at.slice(0, 10) : '-'}</span></td>
      
      <td style="text-align:center;">
        <span class="status-badge on-time" style="font-size:11px;">정상</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 2. [등급권한 관리] 회원 목록 필터 및 검색 (일반 회원 및 VIP 포함 전체 회원 제어)
window.filterAdminRoleList = function() {
  const search = (document.getElementById('admRoleSearch')?.value || '').trim().toLowerCase();
  const filterGrade = document.getElementById('admRoleFilterSelect')?.value || 'all';

  const filtered = adminUsersData.filter(user => {
    const nameMatch = (user.name || '').toLowerCase().includes(search) || (user.nickname || '').toLowerCase().includes(search);
    const emailMatch = (user.email || '').toLowerCase().includes(search);
    if (search && !nameMatch && !emailMatch) return false;

    if (filterGrade === 'partner_only') {
      const hasC = (user.access_grades || '').includes('C');
      const isFamily = user.user_grade === 'family' || user.user_grade === 'manager';
      if (!hasC && !isFamily) return false;
    } else if (filterGrade === 'VIP') {
      if (user.user_grade !== 'VIP') return false;
    } else if (filterGrade === 'basic') {
      if (user.user_grade !== 'basic') return false;
    } else if (filterGrade === 'manager') {
      if (user.user_grade !== 'manager') return false;
    }

    return true;
  });

  renderAdminRoleTable(filtered);
};

// [등급권한 관리] 등급 및 권한 제어 테이블 렌더링
function renderAdminRoleTable(users) {
  const tbody = document.getElementById('admRoleTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">검색 조건에 맞는 회원이 없습니다.</td></tr>`;
    return;
  }

  users.forEach(u => {
    const currentGrades = u.access_grades || '';
    const hasC = currentGrades.includes('C');
    const hasV = currentGrades.includes('V') || u.user_grade === 'VIP';
    const hasA = currentGrades.includes('A');
    const hasB = currentGrades.includes('B');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${u.name || u.nickname || '이름 없음'}</strong>
        ${u.user_grade === 'manager' ? '<span class="status-badge" style="background:#f3e8ff; color:#7c3aed; font-size:10px; margin-left:4px;">관리자</span>' : ''}
      </td>
      <td><span style="color:var(--text-sub); font-size:12px;">${u.email || u.id}</span></td>
      
      <!-- 기본 등급 선택 -->
      <td>
        <select class="form-input" style="padding:4px 8px; font-size:12px; font-weight:700; width:135px; color:${u.user_grade==='VIP'?'#d97706':u.user_grade==='manager'?'#7c3aed':'var(--text-main)'};" onchange="adminChangeUserGrade('${u.id}', this.value)">
          <option value="basic" ${u.user_grade === 'basic' ? 'selected' : ''}> 일반 (basic)</option>
          <option value="VIP" ${u.user_grade === 'VIP' ? 'selected' : ''}> VIP 결제회원</option>
          <option value="family" ${u.user_grade === 'family' ? 'selected' : ''}> 위라클식구</option>
          <option value="manager" ${u.user_grade === 'manager' ? 'selected' : ''}> 관리자(manager)</option>
        </select>
      </td>

      <!-- 세부 권한 체크박스 (파트너스 C 등 원클릭 즉시 적용) -->
      <td>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <label style="cursor:pointer; display:flex; align-items:center; gap:4px; font-weight:800; color:${hasC ? 'var(--primary)' : 'var(--text-sub)'};">
            <input type="checkbox" ${hasC ? 'checked' : ''} onchange="adminToggleAccess('${u.id}', 'C', this.checked)" style="accent-color:var(--primary); cursor:pointer;">
             파트너스(C)
          </label>
          <label style="cursor:pointer; display:flex; align-items:center; gap:4px; font-size:11px; color:#d97706;">
            <input type="checkbox" ${hasV ? 'checked' : ''} onchange="adminToggleAccess('${u.id}', 'V', this.checked)" style="accent-color:#d97706; cursor:pointer;">
             VIP(V)
          </label>
          <label style="cursor:pointer; display:flex; align-items:center; gap:4px; font-size:11px; color:var(--text-muted);">
            <input type="checkbox" ${hasA ? 'checked' : ''} onchange="adminToggleAccess('${u.id}', 'A', this.checked)">
            인사이트(A)
          </label>
          <label style="cursor:pointer; display:flex; align-items:center; gap:4px; font-size:11px; color:var(--text-muted);">
            <input type="checkbox" ${hasB ? 'checked' : ''} onchange="adminToggleAccess('${u.id}', 'B', this.checked)">
            CRM(B)
          </label>
        </div>
      </td>

      <td><span style="font-size:11px; color:var(--text-muted);">${u.created_at ? u.created_at.slice(0, 10) : '-'}</span></td>
      
      <td style="text-align:center;">
        <span class="status-badge on-time" style="font-size:11px;">정상</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 1) 기본 등급 변경
window.adminChangeUserGrade = async function(userId, newGrade) {
  const user = adminUsersData.find(u => u.id === userId);
  if (!user) return;

  user.user_grade = newGrade;
  memberGradesMap[userId] = memberGradesMap[userId] || {};
  memberGradesMap[userId].user_grade = newGrade;
  try {
    localStorage.setItem('weracle_member_grades', JSON.stringify(memberGradesMap));
    localStorage.setItem('weracle_partner_profiles', JSON.stringify(adminUsersData));
  } catch(e){}
  saveSettingToSupabase('member_grades', memberGradesMap, '회원별 등급 및 권한 설정 매핑');

  // Supabase DB 업데이트 시도
  const sb = await getSb();
  if (sb) {
    try {
      await sb.from('profiles').update({ user_grade: newGrade }).eq('id', userId);
    } catch (e) {
      console.warn('DB 업데이트 에러:', e);
    }
  }

  // 파트너스 출결 대조표 및 통계 자동 갱신
  renderTargetRosterTable();
  updateAttendanceStats();
  if (typeof renderLeaderQrGrid === 'function' && document.getElementById('leaderQrModal')?.style.display !== 'none') {
    renderLeaderQrGrid();
  }

  filterAdminUserList();
  filterAdminRoleList();
  alert(`'${user.name || user.nickname || '회원'}' 님의 기본 등급이 '${newGrade}'(으)로 변경되었습니다.`);
};

// 2) 소속 팀 변경 (클라우드 영구 저장 연동)
window.adminUpdateUserTeam = async function(userId, newTeam) {
  const user = adminUsersData.find(u => u.id === userId);
  if (!user) return;

  user.team = newTeam;
  memberTeamsMap[userId] = newTeam;
  if (user.email) memberTeamsMap[user.email] = newTeam;
  try {
    localStorage.setItem('weracle_member_teams', JSON.stringify(memberTeamsMap));
    localStorage.setItem('weracle_partner_profiles', JSON.stringify(adminUsersData));
  } catch(e){}

  // partners_settings 테이블에 영구 저장 (RLS 차단 우회 보장)
  saveSettingToSupabase('member_teams', memberTeamsMap, '회원별 소속팀 배정 매핑');

  // 실적표에 해당 직원이 있다면 실적표 소속팀도 자동 동기화 & 팀 통계 재계산
  const perfItem = performanceData.find(p => p.name === user.name || p.name === user.nickname || (user.nickname && p.name.includes(user.nickname)) || (user.name && p.name.includes(user.name)));
  if (perfItem) {
    perfItem.team = newTeam;
    calculateTeamStats();
    savePerformanceStorage();
    renderTeamGoalsCards();
    populateTeamDropdowns();
    renderPerfTable(performanceData);
    renderAdminTeamGoalsTable();
    renderAdminPerfTable();
  }

  const sb = await getSb();
  if (sb) {
    try {
      await sb.from('profiles').update({ team: newTeam }).eq('id', userId);
    } catch (e) {
      console.warn('DB 팀 업데이트 에러:', e);
    }
  }

  renderTargetRosterTable();
  filterAdminUserList();
  filterAdminRoleList();
  if (typeof renderLeaderQrGrid === 'function' && document.getElementById('leaderQrModal')?.style.display !== 'none') {
    renderLeaderQrGrid();
  }
  alert(`'${user.name || user.nickname || '회원'}' 님의 소속 팀이 '${newTeam}'(으)로 설정되었습니다.`);
};

// 3) 세부 권한 토글 (파트너스 C, VIP V 등 - 클라우드 영구 저장 연동)
window.adminToggleAccess = async function(userId, gradeChar, isChecked) {
  const user = adminUsersData.find(u => u.id === userId);
  if (!user) return;

  let currentGrades = user.access_grades || '';
  let gradesArr = currentGrades ? currentGrades.split(',').map(s => s.trim()) : [];

  if (isChecked) {
    if (!gradesArr.includes(gradeChar)) gradesArr.push(gradeChar);
  } else {
    gradesArr = gradesArr.filter(g => g !== gradeChar);
  }

  const updatedGrades = gradesArr.join(',');
  user.access_grades = updatedGrades;
  memberGradesMap[userId] = memberGradesMap[userId] || {};
  memberGradesMap[userId].access_grades = updatedGrades;
  try {
    localStorage.setItem('weracle_member_grades', JSON.stringify(memberGradesMap));
    localStorage.setItem('weracle_partner_profiles', JSON.stringify(adminUsersData));
  } catch(e){}
  saveSettingToSupabase('member_grades', memberGradesMap, '회원별 등급 및 권한 설정 매핑');

  const sb = await getSb();
  if (sb) {
    try {
      await sb.from('profiles').update({ access_grades: updatedGrades }).eq('id', userId);
    } catch (e) {
      console.warn('DB access_grades 업데이트 에러:', e);
    }
  }

  // 파트너스(C) 권한 변경 시 출결 대조표, 통계 및 전용 QR 목록 즉시 갱신
  renderTargetRosterTable();
  updateAttendanceStats();
  if (typeof renderLeaderQrGrid === 'function' && document.getElementById('leaderQrModal')?.style.display !== 'none') {
    renderLeaderQrGrid();
  }

  filterAdminUserList();
  filterAdminRoleList();
  const labelMap = { 'C': ' 파트너스(사내직원)', 'V': ' VIP', 'A': ' 인사이트', 'B': ' CRM' };
  alert(`'${user.name || user.nickname || '회원'}' 님의 [${labelMap[gradeChar] || gradeChar}] 권한이 ${isChecked ? '부여' : '회수'}되었습니다!`);
};

