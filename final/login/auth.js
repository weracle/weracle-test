/**
 * Imweb & Supabase Auth & Security Logic
 * 
 * 기능: 로그인, 로그아웃, 세션 감지, 권한 등급 검사, 구독 만료/D-Day 감지, 모바일 팩스 쿼터(월 30회) 제어
 * 설명: basic, vip, family, svip, manager 등급 체계 및 정기구독 상태 관리
 */

// 등급별 가중치 (계층 구조)
const GRADE_LEVELS = {
    'basic': 0,
    'normal': 0,
    'vip': 1,
    'VIP': 1,
    'premium': 1,
    'family': 2,
    'svip': 3,
    'SVIP': 3,
    'manager': 4,
    'admin': 4
};

// config.js가 먼저 로드되어 window.sb가 존재해야 합니다.
async function initAuthModule() {
    while(!window.sb) {
        await new Promise(r => setTimeout(r, 100));
    }

    console.log("[Auth] Auth Module Initializing...");

    // 1. 초기 세션 불러오기
    const { data: { session }, error: sessionError } = await window.sb.auth.getSession();
    if (sessionError) {
        console.error("Session fetch error:", sessionError);
    } else {
        await updateSessionState(session);
    }

    // 2. 실시간 세션 변경 감지 리스너
    window.sb.auth.onAuthStateChange(async (event, session) => {
        console.log(`[Auth] Auth State Changed: ${event}`);
        try {
            if (session && session.provider_token) {
                const updateData = { google_access_token: session.provider_token };
                console.log("Saving OAuth tokens to profiles (Client call)");
            }
            
            await updateSessionState(session);
            
            // 전역 이벤트 트리거 (화면 리렌더링용)
            if(window.authEvents) {
                window.authEvents.emit('stateChange', { event, session, profile: window.currentProfile });
            }
        } catch (stateErr) {
            console.error("Error updating auth state change:", stateErr);
        }
    });
}

/**
 * 구독 상태 및 결제 실패 / D-Day 만료 검증 로직
 * - 결제 실패 또는 기간 만료 시 즉시 basic 강등 및 유료 기능 차단
 * - 만료 7일 전부터 D-Day 안내 정보 세팅
 */
async function verifySubscriptionStatus(profile) {
    if (!profile) return profile;

    const rawGrade = profile.user_grade || 'basic';
    const grade = rawGrade.toLowerCase();
    const isVipOrAbove = ['vip', 'svip'].includes(grade);

    // 1. 결제 상태가 실패(failed) 또는 취소(canceled)된 경우 즉시 basic 차단
    if (profile.subscription_status === 'failed' || profile.subscription_status === 'canceled') {
        if (isVipOrAbove) {
            console.warn('[구독 관리] 결제 실패/취소 상태로 인해 basic 등급으로 전환되었습니다.');
            profile.user_grade = 'basic';
            profile.subscription_status = 'expired';
            if (window.sb) {
                try {
                    await window.sb.from('profiles').update({
                        user_grade: 'basic',
                        subscription_status: 'expired'
                    }).eq('id', profile.id);
                } catch(e) {}
            }
        }
        return profile;
    }

    // 2. 만료일(next_billing_date 또는 subscription_end_date) 검증
    const expiryStr = profile.next_billing_date || profile.subscription_end_date;
    if (expiryStr && isVipOrAbove) {
        const expiryDate = new Date(expiryStr);
        const now = new Date();
        const diffMs = expiryDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (diffMs <= 0) {
            // 기간 만료: 즉시 basic 강등 차단
            console.warn('[구독 관리] 구독 기간 만료로 인해 basic 등급으로 전환되었습니다.');
            profile.user_grade = 'basic';
            profile.subscription_status = 'expired';
            profile._subscription_dday = 0;
            if (window.sb) {
                try {
                    await window.sb.from('profiles').update({
                        user_grade: 'basic',
                        subscription_status: 'expired'
                    }).eq('id', profile.id);
                } catch(e) {}
            }
        } else {
            profile._subscription_dday = diffDays;
            if (diffDays <= 7) {
                console.log(`[구독 알림] 정기 결제일까지 D-${diffDays}일 남았습니다.`);
            }
        }
    }

    return profile;
}

/**
 * 구독 갱신 D-Day 반환 함수
 * @param {Object} profile - 사용자 프로필 (생략 시 window.currentProfile)
 * @returns {number|null} 남은 일수 (양수: D-Day, 0: 당일 만료, 음수: 만료됨, null: 미구독)
 */
function getSubscriptionDDay(profile = window.currentProfile) {
    if (!profile) return null;
    if (typeof profile._subscription_dday === 'number') return profile._subscription_dday;
    const expiryStr = profile.next_billing_date || profile.subscription_end_date;
    if (!expiryStr) return null;
    const expiryDate = new Date(expiryStr);
    const now = new Date();
    return Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
window.getSubscriptionDDay = getSubscriptionDDay;

/**
 * 모바일 팩스 발송 가능 여부 검사 (월 30회 쿼터 제한)
 * - basic (일반): 팩스 발송 불가 (VIP 구독 필요)
 * - vip (구독): 월 최대 30회 무료 제공 (30회 초과 시 즉시 차단)
 * - family, svip, manager: 무제한 제공
 */
function canSendFax(profile = window.currentProfile) {
    if (!window.currentUser || !profile) {
        alert("로그인이 필요한 서비스입니다.");
        if (window.authEvents) window.authEvents.emit('openLoginModal');
        return false;
    }

    const grade = (profile.user_grade || 'basic').toLowerCase();
    
    // basic 일반 회원: 팩스 발송 불가
    if (grade === 'basic' || grade === 'normal') {
        alert("[안내] 모바일 팩스 발송은 위라클 VIP 멤버십 전용 서비스입니다.\n월 29,900원 구독 시 매월 30회 무료 팩스가 제공됩니다.");
        return false;
    }

    // family, svip, manager 등급: 무제한 발송
    if (['family', 'manager', 'admin', 'svip'].includes(grade)) {
        return true;
    }

    // vip 등급: 월 30회 쿼터 검사
    const used = Number(profile.fax_used ?? profile.fax_count ?? 0);
    const quota = Number(profile.fax_quota ?? 30);
    
    if (used >= quota) {
        alert(`[발송 제한] 이번 달 모바일 팩스 무료 제공량(${quota}회)을 모두 소진하셨습니다.\n남용 방지를 위해 월 최대 ${quota}회까지 이용 가능합니다.`);
        return false;
    }

    return true;
}
window.canSendFax = canSendFax;

/**
 * 모바일 팩스 발송 후 카운트 차감/증가 기록 함수
 */
async function recordFaxUsage(profile = window.currentProfile) {
    if (!profile) return;
    const currentUsed = Number(profile.fax_used ?? profile.fax_count ?? 0);
    profile.fax_used = currentUsed + 1;
    profile.fax_count = profile.fax_used;

    if (window.sb) {
        try {
            await window.sb.from('profiles').update({
                fax_used: profile.fax_used,
                fax_count: profile.fax_used
            }).eq('id', profile.id);
        } catch(e) {
            console.warn("Failed to sync fax usage to DB:", e);
        }
    }
}
window.recordFaxUsage = recordFaxUsage;

/**
 * 세션 및 프로필 상태 업데이트 (내부 함수)
 */
async function updateSessionState(session) {
    if (session && session.user) {
        window.currentUser = session.user;
        const { data, error } = await window.sb
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (!error && data) {
            // 구독 만료 및 결제 상태 검증 후 쿼터 리셋 체크
            const verified = await verifySubscriptionStatus(data);
            window.currentProfile = await checkAndResetQuotas(verified);
        } else {
            // 기본값 (신규 회원)
            window.currentProfile = {
                id: session.user.id,
                email: session.user.email,
                nickname: session.user.user_metadata?.nickname || session.user.email.split('@')[0],
                user_grade: 'basic',
                subscription_status: 'none',
                fax_quota: 0,
                fax_used: 0
            };
        }
    } else {
        window.currentUser = null;
        window.currentProfile = null;
    }
}

/**
 * 매월 1일 사용량 초기화 로직
 */
async function checkAndResetQuotas(profile) {
    if (!profile) return profile;
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    if (profile.last_reset_date !== currentMonth) {
        console.log(`[Quota] Resetting monthly quotas for ${profile.email}`);
        profile.fax_used = 0;
        profile.fax_count = 0;
        profile.last_reset_date = currentMonth;
    }
    return profile;
}

/**
 * ====================================================
 * 권한 검사 및 페이지 가드 로직
 * ====================================================
 */

function checkUserGrade(requiredGrade) {
    if (!window.currentProfile) return false;
    const userGrade = window.currentProfile.user_grade || 'basic';
    const userLevel = GRADE_LEVELS[userGrade] ?? 0;
    const requiredLevel = GRADE_LEVELS[requiredGrade] ?? 0;
    return userLevel >= requiredLevel;
}
window.checkUserGrade = checkUserGrade;

function authorizeAction(requiredGrade, actionMessage = "이 기능을 이용") {
    if (!window.currentUser) {
        alert("로그인이 필요한 서비스입니다.");
        if(window.authEvents) window.authEvents.emit('openLoginModal');
        return false;
    }
    if (!checkUserGrade(requiredGrade)) {
        const gradeLabels = {
            'basic': '일반설계사(basic)',
            'vip': '우수설계사(VIP)',
            'family': '패밀리(family)',
            'svip': '스페셜VIP(svip)',
            'manager': '관리자(manager)'
        };
        const label = gradeLabels[requiredGrade] || requiredGrade;
        alert(`[권한 제한] [${label}] 등급 이상만 ${actionMessage}하실 수 있습니다.`);
        return false;
    }
    return true;
}
window.authorizeAction = authorizeAction;

async function guardPageAccess(requiredGrade, fallbackUrl = 'index.html') {
    while(window.currentUser === undefined) { 
        await new Promise(r => setTimeout(r, 100)); 
    }
    
    if (!window.currentUser) {
        alert("로그인 후 이용해 주세요.");
        if(window.authEvents) window.authEvents.emit('openLoginModal');
        setTimeout(() => { if (!window.currentUser) window.location.href = fallbackUrl; }, 3000);
        return;
    }
    
    if (!checkUserGrade(requiredGrade)) {
        alert(`[접근 제한] 필요 등급: ${requiredGrade}`);
        window.location.href = fallbackUrl;
    }
}
window.guardPageAccess = guardPageAccess;

/**
 * ====================================================
 * 로그인 / 로그아웃 제어 (구글 로그인)
 * ====================================================
 */
async function loginWithGoogle() {
    if(!window.sb) { alert("서버 연결 중입니다. 잠시 후 다시 시도해주세요."); return; }
    try {
        const { error } = await window.sb.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.href.split('?')[0].split('#')[0]
            }
        });
        if(error) throw error;
    } catch(err) {
        alert("로그인 에러: " + err.message);
    }
}
window.loginWithGoogle = loginWithGoogle;

async function logout() {
    if(!window.sb) return;
    await window.sb.auth.signOut();
    window.location.reload();
}
window.logout = logout;

// 모듈 초기화 실행
initAuthModule();
