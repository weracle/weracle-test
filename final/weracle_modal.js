/**
 * ==============================================================================
 * [위라클 통합 알림창 모듈] weracle_modal.js
 * 브라우저 기본 alert()을 위라클 미니멀 모던 디자인 모달로 자동 통일
 * ==============================================================================
 */

(function (window) {
  'use strict';

  // 만약 부모 창(index.html 등)에 이미 weracleAlert가 있다면 부모 창의 알림 모달로 위임
  if (window.parent && window.parent !== window && typeof window.parent.weracleAlert === 'function') {
    window.alert = function (message, callback) {
      return window.parent.weracleAlert(message, callback);
    };
    window.weracleAlert = window.parent.weracleAlert;
    return;
  }

  // 최상위 창이거나 단독 창일 경우 모달 DOM 및 스타일 직접 주입
  const SVG_ICONS = {
    info: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    success: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
    warn: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
  };

  const STYLES = `
    .weracle-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.48);
      backdrop-filter: blur(2.5px);
      z-index: 999999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
      animation: weracleFadeIn 0.15s ease-out;
    }
    @keyframes weracleFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes weraclePopIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    .weracle-modal-card {
      background: #ffffff;
      width: 380px;
      max-width: 92%;
      border-radius: 16px;
      padding: 24px 22px 20px 22px;
      box-shadow: 0 20px 35px -10px rgba(15, 23, 42, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05);
      text-align: center;
      animation: weraclePopIn 0.18s ease-out;
      box-sizing: border-box;
      font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    }
    .weracle-modal-icon {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      margin: 0 auto 16px auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .weracle-icon-info {
      background: #e0f2fe;
      color: #0284c7;
    }
    .weracle-icon-success {
      background: #d1fae5;
      color: #059669;
    }
    .weracle-icon-warn {
      background: #fee2e2;
      color: #e11d48;
    }
    .weracle-modal-msg {
      font-size: 14.5px;
      font-weight: 500;
      color: #1e293b;
      line-height: 1.65;
      white-space: pre-wrap;
      margin-bottom: 22px;
      word-break: keep-all;
      max-height: 60vh;
      overflow-y: auto;
      padding: 0 4px;
    }
    .weracle-modal-btn {
      width: 100%;
      padding: 11px;
      background: #0284c7;
      color: #ffffff;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
      outline: none;
    }
    .weracle-modal-btn:hover {
      background: #0369a1;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
    }
    .weracle-modal-btn:active {
      transform: scale(0.98);
    }
  `;

  let currentCallback = null;

  function ensureModalDoms() {
    if (document.getElementById('weracleModalOverlay')) return;

    // 1. Style 주입
    const styleEl = document.createElement('style');
    styleEl.innerHTML = STYLES;
    document.head.appendChild(styleEl);

    // 2. DOM 요소 주입
    const overlay = document.createElement('div');
    overlay.id = 'weracleModalOverlay';
    overlay.className = 'weracle-modal-overlay';
    overlay.innerHTML = `
      <div class="weracle-modal-card" id="weracleModalCard" onclick="event.stopPropagation()">
        <div class="weracle-modal-icon" id="weracleModalIcon"></div>
        <div class="weracle-modal-msg" id="weracleModalMsg"></div>
        <button type="button" class="weracle-modal-btn" id="weracleModalBtn">확인</button>
      </div>
    `;

    document.body.appendChild(overlay);

    // 이벤트 리스너 등록
    const btn = document.getElementById('weracleModalBtn');
    if (btn) {
      btn.addEventListener('click', closeWeracleModal);
    }
    overlay.addEventListener('click', closeWeracleModal);

    window.addEventListener('keydown', function (e) {
      const el = document.getElementById('weracleModalOverlay');
      if (el && el.style.display === 'flex') {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          closeWeracleModal();
        }
      }
    });
  }

  function closeWeracleModal() {
    const overlay = document.getElementById('weracleModalOverlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
    if (typeof currentCallback === 'function') {
      const cb = currentCallback;
      currentCallback = null;
      cb();
    }
  }

  function weracleAlert(message, callback) {
    ensureModalDoms();

    currentCallback = callback || null;

    const overlay = document.getElementById('weracleModalOverlay');
    const iconEl = document.getElementById('weracleModalIcon');
    const msgEl = document.getElementById('weracleModalMsg');
    const btnEl = document.getElementById('weracleModalBtn');

    if (!overlay || !msgEl) {
      // 혹시라도 DOM 주입 실패 시 네이티브 fallback
      return window.alert(message);
    }

    const text = message != null ? String(message) : '';
    msgEl.innerText = text;

    // 메시지 문맥에 따른 아이콘 자동 분기 (성공/완료 vs 주의/오류 vs 일반)
    const isSuccess = /성공|완료|정상|저장되었습니다|저장 완료|등록되었습니다/.test(text);
    const isWarn = /실패|오류|에러|누락|확인해|주의|제한|경고|필수|불가|안 됩니다|않습니다/.test(text);

    if (isSuccess && !isWarn) {
      iconEl.className = 'weracle-modal-icon weracle-icon-success';
      iconEl.innerHTML = SVG_ICONS.success;
    } else if (isWarn) {
      iconEl.className = 'weracle-modal-icon weracle-icon-warn';
      iconEl.innerHTML = SVG_ICONS.warn;
    } else {
      iconEl.className = 'weracle-modal-icon weracle-icon-info';
      iconEl.innerHTML = SVG_ICONS.info;
    }

    overlay.style.display = 'flex';
    if (btnEl) {
      setTimeout(() => btnEl.focus(), 80);
    }
  }

  // 전역 window.alert 가로채기
  window.weracleAlert = weracleAlert;
  window.alert = weracleAlert;

  // DOM 로드 시 자동 초기화 및 iframe 브릿지 등록
  function initModule() {
    ensureModalDoms();

    // 현재 및 향후 생성되는 iframe의 alert 가로채기
    const hookIframes = function () {
      document.querySelectorAll('iframe').forEach(function (frame) {
        try {
          if (frame.contentWindow && frame.contentWindow.alert !== weracleAlert) {
            frame.contentWindow.alert = function (msg, cb) {
              return weracleAlert(msg, cb);
            };
          }
        } catch (e) {}
      });
    };

    hookIframes();
    document.querySelectorAll('iframe').forEach(function (frame) {
      frame.addEventListener('load', hookIframes);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModule);
  } else {
    initModule();
  }

})(typeof window !== 'undefined' ? window : this);
