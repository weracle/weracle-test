/**
 * ==============================================================================
 * [위라클 통합 알림/입력창 모듈] weracle_modal.js
 * 브라우저 기본 alert(), confirm(), prompt()를 위라클 미니멀 모던 디자인 모달로 자동 통일
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
    if (typeof window.parent.weracleConfirm === 'function') {
      window.weracleConfirm = window.parent.weracleConfirm;
    }
    if (typeof window.parent.weraclePrompt === 'function') {
      window.weraclePrompt = window.parent.weraclePrompt;
    }
    return;
  }

  // 최상위 창이거나 단독 창일 경우 모달 DOM 및 스타일 직접 주입
  const SVG_ICONS = {
    info: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    success: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
    warn: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    edit: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
    question: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
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
      width: 400px;
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
    .weracle-icon-edit {
      background: #e0f2fe;
      color: #0284c7;
    }
    .weracle-icon-question {
      background: #f0fdf4;
      color: #059669;
    }
    .weracle-modal-title {
      font-size: 16.5px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.3px;
      margin-bottom: 6px;
      word-break: keep-all;
    }
    .weracle-modal-msg {
      font-size: 14.5px;
      font-weight: 500;
      color: #1e293b;
      line-height: 1.65;
      white-space: pre-wrap;
      margin-bottom: 20px;
      word-break: keep-all;
      max-height: 60vh;
      overflow-y: auto;
      padding: 0 4px;
    }
    .weracle-modal-input-wrap {
      width: 100%;
      margin: 14px 0 20px 0;
      box-sizing: border-box;
      text-align: left;
    }
    .weracle-modal-input {
      width: 100%;
      padding: 12px 14px;
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 500;
      color: #0f172a;
      box-sizing: border-box;
      outline: none;
      background: #f8fafc;
      transition: all 0.2s ease;
      font-family: inherit;
    }
    .weracle-modal-input:focus {
      background: #ffffff;
      border-color: #0284c7;
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
    }
    .weracle-modal-actions {
      display: flex;
      gap: 10px;
      width: 100%;
      box-sizing: border-box;
    }
    .weracle-modal-btn-sub {
      flex: 1;
      padding: 11px;
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
      outline: none;
    }
    .weracle-modal-btn-sub:hover {
      background: #e2e8f0;
      color: #1e293b;
    }
    .weracle-modal-btn-primary {
      flex: 1;
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
      box-shadow: 0 2px 8px rgba(2, 132, 199, 0.25);
    }
    .weracle-modal-btn-primary:hover {
      background: #0369a1;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);
    }
    .weracle-modal-btn-primary:active, .weracle-modal-btn-sub:active {
      transform: scale(0.98);
    }
  `;

  let activeMode = 'alert'; // 'alert' | 'confirm' | 'prompt'
  let activeResolver = null;

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
        <div class="weracle-modal-title" id="weracleModalTitle" style="display: none;"></div>
        <div class="weracle-modal-msg" id="weracleModalMsg"></div>
        <div class="weracle-modal-input-wrap" id="weracleModalInputWrap" style="display: none;">
          <input type="text" class="weracle-modal-input" id="weracleModalInput" autocomplete="off" />
        </div>
        <div class="weracle-modal-actions" id="weracleModalActions">
          <button type="button" class="weracle-modal-btn-sub" id="weracleModalCancelBtn" style="display: none;">취소</button>
          <button type="button" class="weracle-modal-btn-primary" id="weracleModalConfirmBtn">확인</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const confirmBtn = document.getElementById('weracleModalConfirmBtn');
    const cancelBtn = document.getElementById('weracleModalCancelBtn');
    const inputEl = document.getElementById('weracleModalInput');

    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        if (activeMode === 'prompt') {
          const val = inputEl ? inputEl.value : '';
          closeWeracleModal(val);
        } else if (activeMode === 'confirm') {
          closeWeracleModal(true);
        } else {
          closeWeracleModal(true);
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        if (activeMode === 'prompt') {
          closeWeracleModal(null);
        } else if (activeMode === 'confirm') {
          closeWeracleModal(false);
        } else {
          closeWeracleModal(false);
        }
      });
    }

    if (inputEl) {
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          closeWeracleModal(inputEl.value);
        }
      });
    }

    overlay.addEventListener('click', function () {
      if (activeMode === 'prompt') {
        closeWeracleModal(null);
      } else if (activeMode === 'confirm') {
        closeWeracleModal(false);
      } else {
        closeWeracleModal(true);
      }
    });

    window.addEventListener('keydown', function (e) {
      const el = document.getElementById('weracleModalOverlay');
      if (el && el.style.display === 'flex') {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (activeMode === 'prompt') closeWeracleModal(null);
          else if (activeMode === 'confirm') closeWeracleModal(false);
          else closeWeracleModal(true);
        } else if (e.key === 'Enter' && activeMode !== 'prompt') {
          e.preventDefault();
          closeWeracleModal(true);
        }
      }
    });
  }

  function closeWeracleModal(result) {
    const overlay = document.getElementById('weracleModalOverlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
    if (typeof activeResolver === 'function') {
      const resolver = activeResolver;
      activeResolver = null;
      resolver(result);
    }
  }

  function weracleAlert(message, callback) {
    ensureModalDoms();

    return new Promise(function (resolve) {
      activeMode = 'alert';
      activeResolver = function (res) {
        if (typeof callback === 'function') callback();
        resolve(res);
      };

      const overlay = document.getElementById('weracleModalOverlay');
      const iconEl = document.getElementById('weracleModalIcon');
      const titleEl = document.getElementById('weracleModalTitle');
      const msgEl = document.getElementById('weracleModalMsg');
      const inputWrap = document.getElementById('weracleModalInputWrap');
      const cancelBtn = document.getElementById('weracleModalCancelBtn');
      const confirmBtn = document.getElementById('weracleModalConfirmBtn');

      if (!overlay || !msgEl) {
        window.alert(message);
        if (typeof callback === 'function') callback();
        return resolve(true);
      }

      const text = message != null ? String(message) : '';
      titleEl.style.display = 'none';
      msgEl.innerText = text;
      msgEl.style.display = 'block';
      msgEl.style.marginBottom = '20px';
      inputWrap.style.display = 'none';
      cancelBtn.style.display = 'none';
      confirmBtn.innerText = '확인';
      confirmBtn.style.width = '100%';

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
      if (confirmBtn) {
        setTimeout(function () { confirmBtn.focus(); }, 60);
      }
    });
  }

  function weracleConfirm(message, callback) {
    ensureModalDoms();

    return new Promise(function (resolve) {
      activeMode = 'confirm';
      activeResolver = function (val) {
        const boolVal = !!val;
        if (typeof callback === 'function') callback(boolVal);
        resolve(boolVal);
      };

      const overlay = document.getElementById('weracleModalOverlay');
      const iconEl = document.getElementById('weracleModalIcon');
      const titleEl = document.getElementById('weracleModalTitle');
      const msgEl = document.getElementById('weracleModalMsg');
      const inputWrap = document.getElementById('weracleModalInputWrap');
      const cancelBtn = document.getElementById('weracleModalCancelBtn');
      const confirmBtn = document.getElementById('weracleModalConfirmBtn');

      if (!overlay || !msgEl) {
        const res = window.confirm(message);
        if (typeof callback === 'function') callback(res);
        return resolve(res);
      }

      const text = message != null ? String(message) : '';
      titleEl.style.display = 'none';
      msgEl.innerText = text;
      msgEl.style.display = 'block';
      msgEl.style.marginBottom = '20px';
      inputWrap.style.display = 'none';
      cancelBtn.style.display = 'block';
      cancelBtn.innerText = '취소';
      confirmBtn.innerText = '확인';
      confirmBtn.style.width = '';

      iconEl.className = 'weracle-modal-icon weracle-icon-question';
      iconEl.innerHTML = SVG_ICONS.question;

      overlay.style.display = 'flex';
      if (confirmBtn) {
        setTimeout(function () { confirmBtn.focus(); }, 60);
      }
    });
  }

  function weraclePrompt(title, defaultValue, options, callback) {
    ensureModalDoms();

    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    options = options || {};

    return new Promise(function (resolve) {
      activeMode = 'prompt';
      activeResolver = function (val) {
        if (typeof callback === 'function') callback(val);
        resolve(val);
      };

      const overlay = document.getElementById('weracleModalOverlay');
      const iconEl = document.getElementById('weracleModalIcon');
      const titleEl = document.getElementById('weracleModalTitle');
      const msgEl = document.getElementById('weracleModalMsg');
      const inputWrap = document.getElementById('weracleModalInputWrap');
      const inputEl = document.getElementById('weracleModalInput');
      const cancelBtn = document.getElementById('weracleModalCancelBtn');
      const confirmBtn = document.getElementById('weracleModalConfirmBtn');

      if (!overlay || !inputEl) {
        const res = window.prompt(title, defaultValue);
        if (typeof callback === 'function') callback(res);
        return resolve(res);
      }

      titleEl.innerText = title || '내용 입력';
      titleEl.style.display = 'block';

      if (options.message || options.subtext) {
        msgEl.innerText = options.message || options.subtext;
        msgEl.style.display = 'block';
        msgEl.style.marginBottom = '6px';
      } else {
        msgEl.style.display = 'none';
      }

      inputWrap.style.display = 'block';
      inputEl.value = defaultValue != null ? String(defaultValue) : '';
      inputEl.placeholder = options.placeholder || '내용을 입력해 주세요';

      cancelBtn.style.display = 'block';
      cancelBtn.innerText = options.cancelText || '취소';
      confirmBtn.innerText = options.confirmText || '저장';
      confirmBtn.style.width = '';

      iconEl.className = 'weracle-modal-icon weracle-icon-edit';
      iconEl.innerHTML = SVG_ICONS.edit;

      overlay.style.display = 'flex';
      if (inputEl) {
        setTimeout(function () {
          inputEl.focus();
          inputEl.select();
        }, 60);
      }
    });
  }

  // 전역 노출
  window.weracleAlert = weracleAlert;
  window.weracleConfirm = weracleConfirm;
  window.weraclePrompt = weraclePrompt;
  window.alert = weracleAlert;

  // DOM 로드 시 자동 초기화 및 iframe 브릿지 등록
  function initModule() {
    ensureModalDoms();

    const hookIframes = function () {
      document.querySelectorAll('iframe').forEach(function (frame) {
        try {
          if (frame.contentWindow) {
            if (frame.contentWindow.alert !== weracleAlert) {
              frame.contentWindow.alert = function (msg, cb) {
                return weracleAlert(msg, cb);
              };
            }
            frame.contentWindow.weracleAlert = weracleAlert;
            frame.contentWindow.weracleConfirm = weracleConfirm;
            frame.contentWindow.weraclePrompt = weraclePrompt;
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
