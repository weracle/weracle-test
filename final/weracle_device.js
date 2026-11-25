/**
 * ==============================================================================
 * [위라클 통합 기기 판별 모듈] weracle_device.js
 * PC(데스크톱/노트북)와 모바일(스마트폰/태블릿)을 100% 무결점으로 물리적 격리 판별
 * ==============================================================================
 */
(function(window) {
  'use strict';

  function checkIsMobile() {
    // 1. 부모 창이 이미 판별한 값이 있다면 부모 판정 기준 우선 적용
    try {
      if (window.parent && window.parent !== window && typeof window.parent.isMobileDevice === 'boolean') {
        return window.parent.isMobileDevice;
      }
    } catch(e) {}

    // 2. 모바일 User Agent 검사
    const ua = navigator.userAgent || navigator.vendor || window.opera || '';
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);

    // 3. 터치 및 포인터 검사 (PC 마우스는 pointer: fine)
    const isTouchPointer = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const hasTouchEvents = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // 4. 물리적 모니터 해상도 검사 (스마트폰은 screen.width가 통상 360~430px, 최대 600px 미만)
    const minScreenDimension = Math.min(window.screen.width || 9999, window.screen.height || 9999);
    const isMobileScreenSize = minScreenDimension <= 600;

    // 최종 판정: 모바일 브라우저이거나, (터치스크린이면서 화면 물리 해상도가 600px 이하인 기기)
    return isMobileUA || (isTouchPointer && hasTouchEvents && isMobileScreenSize);
  }

  const isMobile = checkIsMobile();
  window.isMobileDevice = isMobile;

  // DOM 최상단 태그에 기기 클래스 즉시 부여
  function applyDeviceClass() {
    const root = document.documentElement;
    if (!root) return;
    if (isMobile) {
      root.classList.add('is-mobile-device');
      root.classList.remove('is-desktop-device');
    } else {
      root.classList.add('is-desktop-device');
      root.classList.remove('is-mobile-device');
    }
  }

  applyDeviceClass();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyDeviceClass);
  }
})(window);
