const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  // CORS 처리 (필요 시)
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
    // 1. 헤더에서 Authorization 토큰 추출
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const token = authHeader.split(' ')[1];

    // 2. Supabase 관리자 클라이언트 생성 (Service Role Key 필수)
    // 환경변수에 NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 설정되어 있어야 합니다.
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

    // 3. 토큰 검증 및 요청한 유저 정보 가져오기
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token or user not found' });
    }

    // 4. 요청한 유저가 진짜 'admin'인지 DB에서 확인
    const { data: adminProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !adminProfile || (adminProfile.user_grade !== 'admin' && adminProfile.user_grade !== 'manager')) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    // 5. 요청받은 업데이트 작업 수행
    const { userId, updates } = req.body;
    
    if (!userId || !updates) {
      return res.status(400).json({ error: 'Missing userId or updates in request body' });
    }

    // 허용된 필드만 업데이트하도록 필터링 (보안 강화)
    const allowedFields = ['role', 'user_grade', 'access_grades'];
    const safeUpdates = {};
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        safeUpdates[key] = updates[key];
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(safeUpdates)
      .eq('id', userId);

    if (updateError) {
      throw updateError;
    }

    return res.status(200).json({ success: true, message: 'User updated successfully' });

  } catch (error) {
    console.error('Admin update API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
