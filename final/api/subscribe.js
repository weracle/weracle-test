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

    // 4. 결제 검증 로직 (향후 토스페이먼츠 연동 시 여기에 검증 로직 추가)
    // const { paymentKey, orderId, amount } = req.body;
    // await verifyTossPayment(paymentKey, orderId, amount);

    const { subscriptionData } = req.body;

    // 5. posts 테이블에 구독 결제 내역 기록 (기존 클라이언트 측 로직 서버로 이동)
    const { error: insertErr } = await supabaseAdmin.from('posts').insert({
      title: '구독 결제 내역',
      content: JSON.stringify(subscriptionData),
      category: 'subscriptions',
      user_id: user.id
    });

    if (insertErr) {
      console.error("Failed to insert subscription record:", insertErr);
      return res.status(500).json({ error: 'Failed to record subscription' });
    }

    // 6. 대상 유저(본인)의 등급을 'VIP'로 안전하게 업데이트
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ user_grade: 'VIP' })
      .eq('id', user.id);

    if (updateError) {
      console.error("Failed to update user grade:", updateError);
      return res.status(500).json({ error: 'Failed to update user grade' });
    }

    return res.status(200).json({ success: true, message: 'Subscription processed and grade updated to VIP' });

  } catch (error) {
    console.error('Subscription API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
