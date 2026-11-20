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

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. 헤더 Authorization 토큰 검증
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const token = authHeader.split(' ')[1];

    // 2. Supabase 어드민 클라이언트 생성 (Service Role Key 필수)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://tjohrovsvgnkrlqhjkwt.supabase.co';
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

    // 3. 토큰 검증 및 요청자 유저 정보 조회
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token or user not found' });
    }

    // 4. 요청자가 관리자(admin/manager)인지 DB에서 확인
    const { data: adminProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, user_grade')
      .eq('id', user.id)
      .single();

    const isAuthorized = adminProfile && (
      adminProfile.role === 'admin' ||
      adminProfile.user_grade === 'admin' ||
      adminProfile.user_grade === 'manager'
    );

    if (profileError || !isAuthorized) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    // 5. 회원 영구 삭제 처리 (action: 'delete' 또는 DELETE 메소드)
    if (req.method === 'DELETE' || (req.body && req.body.action === 'delete')) {
      const { userId } = req.body || {};
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId in delete request' });
      }

      // profiles 테이블에서 레코드 삭제
      const { error: deleteProfileError } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (deleteProfileError) {
        throw deleteProfileError;
      }

      // auth.users 에서도 유저 삭제 시도
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch (authDelErr) {
        console.warn('Auth user deletion warning:', authDelErr.message);
      }

      return res.status(200).json({ success: true, message: 'User deleted successfully' });
    }

    // 6. 회원 정보 업데이트 수행
    const { userId, updates } = req.body;
    
    if (!userId || !updates) {
      return res.status(400).json({ error: 'Missing userId or updates in request body' });
    }

    const allowedFields = ['role', 'user_grade', 'access_grades', 'nickname', 'phone', 'company', 'fax_count', 'settings'];
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
};
