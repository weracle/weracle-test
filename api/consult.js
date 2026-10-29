const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  // CORS 처리
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }

    const {
      planner_slug,
      planner_id,
      planner_name,
      planner_email,
      name,
      phone,
      date,
      message
    } = body || {};

    if (!name || !phone) {
      return res.status(400).json({ error: '고객 성함과 연락처는 필수 항목입니다.' });
    }

    // 1. Supabase card_consultations 테이블에 표준 저장
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://tjohrovsvgnkrlqhjkwt.supabase.co";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_m2fpA60L66F8uGnynEbmvg_BBepUlmR";

    let dbSaved = false;
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error: insertErr } = await supabase.from('card_consultations').insert({
        planner_slug: planner_slug || null,
        planner_id: planner_id || null,
        planner_email: planner_email || null,
        customer_name: name,
        customer_phone: phone,
        preferred_time: date || null,
        message: message || null,
        status: '신규접수'
      });
      if (!insertErr) dbSaved = true;
      else console.warn('[Consult API] DB insert notice:', insertErr.message);
    } catch (dbErr) {
      console.warn('[Consult API] DB connection notice:', dbErr.message);
    }

    // 2. 이메일 알림 전송 (Resend 또는 기본 이메일 서비스)
    let emailSent = false;
    const emailSubject = `[신규 상담 예약] ${name} 고객님의 상담 예약이 접수되었습니다!`;
    const emailBody = `
========================================
[위라클 모바일 디지털 명함] 신규 상담 예약 접수
========================================

■ 담당 설계사: ${planner_name || '설계사'} (${planner_slug || ''})
■ 고객 성함: ${name}
■ 고객 연락처: ${phone}
■ 희망 상담 일시: ${date || '협의 필요'}
■ 문의 및 요청사항:
${message || '내용 없음'}

----------------------------------------
접수 일시: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
========================================
    `.trim();

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey && planner_email) {
      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'WERACLE 알림 <onboarding@resend.dev>',
            to: planner_email,
            subject: emailSubject,
            text: emailBody
          })
        });
        if (resendRes.ok) emailSent = true;
      } catch (rErr) {
        console.warn('[Consult API] Resend notice:', rErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      dbSaved: dbSaved,
      emailSent: emailSent,
      message: '상담 예약이 성공적으로 접수되었습니다.'
    });
  } catch (err) {
    console.error('[Consult API Error]:', err);
    return res.status(500).json({ error: '상담 접수 처리 중 오류가 발생했습니다: ' + err.message });
  }
};
