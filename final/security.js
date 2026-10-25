/**
 * WERACLE Enterprise Security Module
 * 
 * 기능:
 * 1. 마우스 우클릭 원천 차단 (contextmenu)
 * 2. 텍스트 드래그 및 복사 차단 (selectstart, copy, cut) - 입력 필드(input, textarea) 예외 보장
 * 3. 개발자 도구 및 소스보기 단축키 차단 (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U, Ctrl+S, Ctrl+P)
 * 4. 개발자 도구 오픈 감지 시 디버거 락 (Debugger Loop Protection)
 * 5. 인쇄 방지 (Print CSS Protection)
 * 6. 서브페이지(iframe) 자동 보안 전파 (Auto-injection on iframe load)
 */

(function() {
    'use strict';

    // 1. 공통 보안 스타일 주입 (드래그 및 인쇄 방지)
    function injectSecurityStyles(doc) {
        if (!doc || doc.getElementById('weracle-security-style')) return;
        const style = doc.createElement('style');
        style.id = 'weracle-security-style';
        style.textContent = `
            body {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
            }
            input, textarea, [contenteditable="true"] {
                -webkit-user-select: text !important;
                -moz-user-select: text !important;
                -ms-user-select: text !important;
                user-select: text !important;
            }
            @media print {
                body {
                    display: none !important;
                }
            }
        `;
        (doc.head || doc.documentElement).appendChild(style);
    }

    // 2. 단축키 차단 핸들러
    function handleKeyDown(e) {
        const key = e.key || '';
        const keyCode = e.keyCode || e.which;
        const ctrlOrCmd = e.ctrlKey || e.metaKey;

        // F12 차단
        if (key === 'F12' || keyCode === 123) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }

        // Ctrl + Shift + I (개발자 도구)
        // Ctrl + Shift + J (콘솔 창)
        // Ctrl + Shift + C (요소 검사)
        if (ctrlOrCmd && e.shiftKey && (key === 'I' || key === 'i' || key === 'J' || key === 'j' || key === 'C' || key === 'c' || keyCode === 73 || keyCode === 74 || keyCode === 67)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }

        // Ctrl + U (페이지 소스 보기)
        if (ctrlOrCmd && (key === 'U' || key === 'u' || keyCode === 85)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }

        // Ctrl + S (웹페이지 저장)
        if (ctrlOrCmd && (key === 'S' || key === 's' || keyCode === 83)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }

        // Ctrl + P (인쇄 차단)
        if (ctrlOrCmd && (key === 'P' || key === 'p' || keyCode === 80)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }

    // 3. 우클릭 차단 핸들러
    function handleContextMenu(e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }

    // 4. 복사 / 잘라내기 / 선택 차단 핸들러 (input/textarea 예외 처리)
    function isEditableElement(el) {
        if (!el) return false;
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || el.isContentEditable) {
            return true;
        }
        return false;
    }

    function handleCopy(e) {
        if (isEditableElement(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        return false;
    }

    function handleSelectStart(e) {
        if (isEditableElement(e.target)) return;
        e.preventDefault();
        return false;
    }

    // 5. 타겟 윈도우/문서에 보안 리스너 바인딩
    function applySecurity(targetWin) {
        try {
            if (!targetWin || targetWin.__weracleSecured) return;
            targetWin.__weracleSecured = true;

            const doc = targetWin.document;
            injectSecurityStyles(doc);

            targetWin.addEventListener('keydown', handleKeyDown, true);
            targetWin.addEventListener('contextmenu', handleContextMenu, true);
            targetWin.addEventListener('copy', handleCopy, true);
            targetWin.addEventListener('cut', handleCopy, true);
            doc.addEventListener('selectstart', handleSelectStart, true);

            console.log('[Security] Protection active on target window');
        } catch (err) {
            // Cross-origin iframe or inaccessible window ignored
        }
    }

    // 6. 개발자 도구 디버거 감지 루프 (DevTools Trap)
    function startDevToolsTrap() {
        setInterval(function() {
            const start = performance.now();
            (function() {
                return false;
            })['constructor']('debugger')();
            const elapsed = performance.now() - start;
            if (elapsed > 100) {
                // 개발자 도구가 열려 있어 디버거가 걸린 상태 감지
                console.clear();
            }
        }, 1500);
    }

    // 7. 메인 윈도우 보안 적용
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            applySecurity(window);
        });
    } else {
        applySecurity(window);
    }

    // 8. 모든 iframe 대상 자동 보안 전파 (동적 iframe 로드 감지)
    function watchIframes() {
        function hookIframe(iframe) {
            try {
                if (iframe.contentWindow) {
                    applySecurity(iframe.contentWindow);
                }
                iframe.addEventListener('load', function() {
                    try {
                        if (iframe.contentWindow) {
                            applySecurity(iframe.contentWindow);
                        }
                    } catch (e) {}
                });
            } catch (e) {}
        }

        // 현재 존재하는 모든 iframe에 적용
        const existingFrames = document.querySelectorAll('iframe');
        existingFrames.forEach(hookIframe);

        // 새로 생성되는 iframe을 MutationObserver로 감지
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                m.addedNodes.forEach(function(node) {
                    if (node.tagName && node.tagName.toLowerCase() === 'iframe') {
                        hookIframe(node);
                    } else if (node.querySelectorAll) {
                        node.querySelectorAll('iframe').forEach(hookIframe);
                    }
                });
            });
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watchIframes);
    } else {
        watchIframes();
    }

    // 9. 디버거 락 구동
    try {
        startDevToolsTrap();
    } catch (e) {}

})();
