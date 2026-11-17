module.exports = async function handler(req, res) {
  const { code, state, error, error_description } = req.query;

  // state에 실려온 설계사 이메일 복원
  let stateEmail = '';
  if (state && String(state).startsWith('u_')) {
    try {
      stateEmail = Buffer.from(String(state).slice(2), 'base64').toString('utf8').trim().toLowerCase();
    } catch (e) {}
  }

  const errExtra = stateEmail ? `&user_email=${encodeURIComponent(stateEmail)}` : '';

  if (error) {
    return res.redirect(`/meta_ads.html?error=${encodeURIComponent(error_description || error)}${errExtra}`);
  }
  if (!code) {
    return res.redirect(`/meta_ads.html?error=${encodeURIComponent('인증 코드가 전달되지 않았습니다.')}${errExtra}`);
  }

  const APP_ID = process.env.META_APP_ID || '872047289263262';
  const APP_SECRET = process.env.META_APP_SECRET || '';
  const reqHost = req.headers['x-forwarded-host'] || req.headers['host'] || 'www.weraclelab.com';
  const reqProto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const REDIRECT_URI = `${reqProto}://${reqHost}/api/meta-callback`;

  try {
    // 1. 단기 액세스 토큰 발급 및 60일 장기 토큰 교환
    let accessToken = '';
    if (APP_SECRET) {
      const tokenRes = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_secret=${APP_SECRET}&code=${encodeURIComponent(code)}`
      );
      const tokenData = await tokenRes.json();
      if (tokenData && tokenData.access_token) {
        accessToken = tokenData.access_token;
      } else {
        const errMsg = (tokenData.error && tokenData.error.message) || '토큰 발급 실패';
        return res.redirect(`/meta_ads.html?error=${encodeURIComponent(errMsg)}${errExtra}`);
      }

      try {
        const longRes = await fetch(
          `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(accessToken)}`
        );
        const longData = await longRes.json();
        if (longData && longData.access_token) {
          accessToken = longData.access_token;
        }
      } catch (e) {}
    } else {
      return res.redirect(`/meta_ads.html?error=${encodeURIComponent('서버 환경변수 META_APP_SECRET을 확인해 주세요.')}${errExtra}`);
    }

    // 1-2. 연동한 메타 사용자 고유 ID 확인 (이메일 미전달 시에도 계정 혼선 원천 차단)
    let fbUid = '';
    try {
      const meRes = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`);
      const meData = await meRes.json();
      if (meData && meData.id) fbUid = String(meData.id);
    } catch (e) {}

    // 2. 사용자 광고계정 목록 조회
    let adAccId = 'act_connected';
    let adAccName = '내 광고계정';
    try {
      const adRes = await fetch(`https://graph.facebook.com/v21.0/me/adaccounts?fields=id,account_id,name,account_status&limit=25&access_token=${accessToken}`);
      const adData = await adRes.json();
      if (adData && Array.isArray(adData.data) && adData.data.length > 0) {
        const activeAcc = adData.data.find(a => a.account_status === 1) || adData.data[0];
        adAccId = activeAcc.id || `act_${activeAcc.account_id}`;
        adAccName = activeAcc.name || adAccId;
      }
    } catch (e) {}

    // 3. 페이스북 페이지 및 인스타그램 비즈니스 계정 조회 + 24시간 무인 웹훅 자동 구독
    let pageId = '';
    let igId = '';
    let igUser = '';

    try {
      const pageRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}&limit=25&access_token=${accessToken}`
      );
      const pageData = await pageRes.json();
      if (pageData && Array.isArray(pageData.data) && pageData.data.length > 0) {
        const pageWithIg = pageData.data.find(p => p.instagram_business_account || p.connected_instagram_account) || pageData.data[0];
        pageId = pageWithIg.id;
        const igObj = pageWithIg.instagram_business_account || pageWithIg.connected_instagram_account;
        if (igObj) {
          igId = igObj.id || '';
          igUser = igObj.username || '';
        }

        for (const p of pageData.data) {
          if (p.id && p.access_token) {
            try {
              await fetch(`https://graph.facebook.com/v21.0/${p.id}/subscribed_fields`, {
                method: 'POST',
                body: new URLSearchParams({
                  subscribed_fields: 'feed,messages,messaging_postbacks,leadgen',
                  access_token: p.access_token
                })
              });
            } catch (subErr) {}
          }
        }
      }
    } catch (e) {}

    const redirectParams = new URLSearchParams({
      meta_connected: 'true',
      ad_acc: adAccId,
      ad_name: adAccName,
      page_id: pageId,
      ig_id: igId,
      ig_user: igUser,
      fb_uid: fbUid,
      m_token: accessToken
    });
    if (stateEmail) redirectParams.set('user_email', stateEmail);

    return res.redirect(`/meta_ads.html?${redirectParams.toString()}`);
  } catch (err) {
    return res.redirect(`/meta_ads.html?error=${encodeURIComponent(err.message)}${errExtra}`);
  }
};
