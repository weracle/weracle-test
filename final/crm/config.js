/**
 * Imweb & Supabase Integration Config - [정리 완료 버전]
 * 
 * 기능: 데이터베이스 연결 설정 및 글로벌 변수 선언
 * 설명: 기존에 섞여 있던 로그인 로직을 걷어내고 순수한 '설정'만 남겼습니다.
 */

window.SUPABASE_CONFIG = window.SUPABASE_CONFIG || {
    //  이곳에 본인의 Supabase Project URL과 Anon Key를 입력하세요.
    url: "https://tjohrovsvgnkrlqhjkwt.supabase.co",
    anonKey: "sb_publishable_m2fpA60L66F8uGnynEbmvg_BBepUlmR"
};

// 전역 상태 변수 선언
window.sb = null;
window.currentUser = null;
window.currentProfile = null;

// 공통 이벤트 버스 (전역 위젯 감지용)
window.authEvents = {
    listeners: {},
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    },
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
};

/**
 * Supabase SDK를 로드하고 기본 클라이언트(sb)를 생성합니다.
 * (로그인 세션 확인 등은 auth.js에서 담당합니다.)
 */
async function initSupabaseConfigOnly() {
    if (window.sb) return window.sb;

    // 1. Supabase JS SDK 로드
    if (!window.supabase) {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            script.async = true;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // 2. 클라이언트 초기화
    const { url, anonKey } = window.SUPABASE_CONFIG;
    
    try {
        window.sb = window.supabase.createClient(url, anonKey);
        console.log(" Supabase Client Initialized (Config Only)!");
    } catch (apiError) {
        console.error(" Supabase Initialization Failed:", apiError);
        window.sb = null;
        setTimeout(() => {
            alert(` 수파베이스 연동 오류!\n\n오류: ${apiError.message}`);
        }, 800);
    }
    return window.sb;
}

// 스크립트 로드 시 즉시 초기화 실행
initSupabaseConfigOnly().catch(err => console.error("Config init failed:", err));
