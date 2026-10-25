const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  // CORS 처리
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
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
    // 1. 헤더에서 토큰 추출
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const token = authHeader.split(' ')[1];

    // 2. Supabase 관리자 클라이언트 생성 (Service Role Key 필수)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 3. 토큰 검증 및 요청한 유저 정보 가져오기 (결제자 본인 확인)
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token or user not found' });
    }

    const { subscriptionData, action } = req.body || {};

    // 4. 결제 실패 또는 즉시 차단 처리 액션 지원
    if (action === 'fail_payment' || action === 'expire') {
      const { error: blockErr } = await supabaseAdmin
        .from('profiles')
        .update({
          user_grade: 'basic',
          subscription_status: 'expired',
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (blockErr) {
        console.error("Failed to update status to expired:", blockErr);
        return res.status(500).json({ error: 'Failed to expire subscription' });
      }

      return res.status(200).json({
        success: true,
        message: 'Subscription marked as expired and grade downgraded to basic',
        user_grade: 'basic',
        subscription_status: 'expired'
      });
    }

    // 5. 다음 결제일 계산 (기본 30일 후)
    const now = new Date();
    const nextBillingDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const recordData = {
      plan_id: subscriptionData?.plan_id || 'vip',
      plan_name: subscriptionData?.plan_name || '위라클 VIP 멤버십',
      amount: subscriptionData?.amount || 29900,
      target_grade: 'vip',
      fax_quota: 30,
      fax_used: 0,
      status: 'active',
      start_date: now.toISOString(),
      next_billing_date: nextBillingDate.toISOString(),
      customer_id: user.id,
      customer_email: user.email
    };

    // 6. posts 테이블에 구독 결제 내역 기록
    const { error: insertErr } = await supabaseAdmin.from('posts').insert({
      title: '구독 결제 내역: ' + recordData.plan_name,
      content: JSON.stringify(recordData),
      category: 'subscriptions',
      user_id: user.id
    });

    if (insertErr) {
      console.warn("Notice: Failed to insert subscription post log:", insertErr.message);
    }

    // 7. profiles 테이블에 VIP 승급 및 팩스 30회 쿼터 부여
    const updatePayload = {
      user_grade: 'vip',
      subscription_status: 'active',
      plan_name: '위라클 VIP 멤버십',
      plan_price: 29900,
      fax_quota: 30,
      fax_used: 0,
      next_billing_date: nextBillingDate.toISOString(),
      updated_at: now.toISOString()
    };

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(updatePayload)
      .eq('id', user.id);

    if (updateError) {
      console.error("Failed to update user profile:", updateError);
      return res.status(500).json({ error: 'Failed to update user profile' });
    }

    return res.status(200).json({
      success: true,
      message: 'Subscription processed successfully. Grade upgraded to VIP with 30 fax quota.',
      data: updatePayload
    });

  } catch (error) {
    console.error('Subscription API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
};
