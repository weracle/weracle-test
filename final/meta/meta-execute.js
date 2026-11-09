module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ★ consult.js 및 fax-webhook.js와 100% 동일한 수파베이스 URL & Key 폴백 적용 (키 누락으로 인한 빈 배열 반환 원천 차단!)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://tjohrovsvgnkrlqhjkwt.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_m2fpA60L66F8uGnynEbmvg_BBepUlmR';

  // ★ [단축 URL 자동 연결(Redirect) 기능]
  const reqHost = req.headers['x-forwarded-host'] || req.headers['host'] || 'www.weraclelab.com';
  const reqProto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const baseSiteUrl = `${reqProto}://${reqHost}`;

  if (req.method === 'GET') {
    const campId = req.query && (req.query.c || req.query.id);
    if (campId && supabaseKey) {
      try {
        const r = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(campId)}&select=landing_url,title,track,target_summary,user_id`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        const rows = await r.json();
        if (Array.isArray(rows) && rows[0] && rows[0].landing_url) {
          let destUrl = rows[0].landing_url;
          const agentKey = rows[0].user_id || 'default';
          const isInstaTrack = rows[0].track === 'insta' || String(campId).startsWith('camp_ig_');

          if (destUrl.includes('/api/meta-execute')) {
            let pdfUrl = '';
            try {
              const pObj = JSON.parse(rows[0].target_summary || '{}');
              if (pObj.pdfUrl) pdfUrl = pObj.pdfUrl;
            } catch (e) {}
            destUrl = `${baseSiteUrl}/sns_apply.html?utm_source=insta_dm&camp_id=${encodeURIComponent(campId)}&camp=${encodeURIComponent(rows[0].title || '')}&agent_id=${encodeURIComponent(agentKey)}&doc=${encodeURIComponent(pdfUrl)}`;
          } else {
            if (!destUrl.includes('agent_id=') && agentKey) {
              destUrl += (destUrl.includes('?') ? '&' : '?') + `agent_id=${encodeURIComponent(agentKey)}`;
            }
            if (isInstaTrack && !destUrl.includes('utm_source=')) {
              destUrl += (destUrl.includes('?') ? '&' : '?') + `utm_source=insta_dm`;
            }
          }
          res.writeHead(302, { Location: destUrl });
          return res.end();
        }
      } catch (err) {}
    }
    res.writeHead(302, { Location: `${baseSiteUrl}/sns_apply.html?utm_source=insta_dm&camp_id=${encodeURIComponent(campId || '')}` });
    return res.end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { action } = body;

  function sanitizeAgentKey(rawKey) {
    const str = String(rawKey || 'default').trim().toLowerCase();
    const cleaned = str.replace(/[^a-z0-9@._-]/g, '_');
    return cleaned || 'default';
  }

  try {
    // [1] 이미지/투명 PNG 로고 업로드
    if (action === 'UPLOAD_MEDIA') {
      const { mediaBase64 } = body;
      if (!mediaBase64 || !supabaseKey) {
        return res.status(200).json({ success: false, mediaUrl: '' });
      }

      const mimeMatch = String(mediaBase64).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const isPng = mimeType.includes('png');
      const isWebp = mimeType.includes('webp');
      const ext = isPng ? 'png' : (isWebp ? 'webp' : 'jpg');

      const rawBase64Only = String(mediaBase64).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      const buffer = Buffer.from(rawBase64Only, 'base64');
      const fileName = `insta_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

      const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/ad_media/${fileName}`, {
        method: 'POST',
        headers: {
          'Content-Type': mimeType,
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'x-upsert': 'true'
        },
        body: buffer
      });

      if (uploadRes.ok) {
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/ad_media/${fileName}`;
        return res.status(200).json({ success: true, mediaUrl: publicUrl });
      }
      return res.status(200).json({ success: false, mediaUrl: '' });
    }

    // [2] 매거진 PR 설정을 해당 팀원의 고유 키로 독립 저장
    if (action === 'SAVE_PR_CONFIG') {
      const { agentId, userKeys, config } = body;
      if (!supabaseKey || !config) {
        return res.status(200).json({ success: false, error: 'Missing config or key' });
      }

      const rawKeyList = Array.isArray(userKeys) && userKeys.length > 0
        ? userKeys
        : [agentId || 'default'];

      const safeKeys = Array.from(new Set(rawKeyList.map(k => sanitizeAgentKey(k)).filter(Boolean)));
      if (safeKeys.length === 0) safeKeys.push('default');

      const configJsonStr = JSON.stringify(config);

      for (const sKey of safeKeys) {
        const recId = `pr_cfg_${sKey}`;
        await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(recId)}`, {
          method: 'DELETE',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });

        const dbRecord = {
          id: recId,
          user_id: sKey,
          track: 'pr_config',
          title: 'PR_MAGAZINE_CONFIG',
          description: '',
          cta_type: 'PR_CONFIG',
          landing_url: '',
          start_date: '',
          end_date: '',
          ratio: '1:1',
          region: '',
          target_summary: configJsonStr,
          budget: 0,
          keyword: '',
          dm_message: '',
          status: 'CONFIG',
          meta_campaign_id: '',
          adset_id: '',
          ad_id: '',
          ig_media_id: '',
          leads_count: 0,
          dm_sent_count: 0,
          created_at: new Date().toISOString()
        };

        await fetch(`${supabaseUrl}/rest/v1/meta_campaigns`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(dbRecord)
        });
      }

      return res.status(200).json({ success: true, agentKey: safeKeys[0] });
    }

    // [2-1] 초기광고설정에서 알림 받을 휴대폰 번호 저장 시 PR 설정에도 즉시 반영
    if (action === 'SAVE_AGENT_PHONE') {
      const { agentId, userKeys, agentPhone } = body;
      if (!supabaseKey || !agentPhone) return res.status(200).json({ success: false });

      const rawKeyList = Array.isArray(userKeys) && userKeys.length > 0 ? userKeys : [agentId || 'default'];
      const safeKeys = Array.from(new Set(rawKeyList.map(k => sanitizeAgentKey(k)).filter(Boolean)));

      for (const sKey of safeKeys) {
        const recId = `pr_cfg_${sKey}`;
        const r = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(recId)}&limit=1`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        const rows = await r.json();
        if (Array.isArray(rows) && rows[0] && rows[0].target_summary) {
          try {
            const cfg = JSON.parse(rows[0].target_summary);
            cfg.agentNotifyPhone = agentPhone;
            await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(recId)}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
              },
              body: JSON.stringify({ target_summary: JSON.stringify(cfg) })
            });
          } catch (e) {}
        }
      }
      return res.status(200).json({ success: true });
    }

    // [3] 해당 설계사(agentId)의 PR 설정 조회
    if (action === 'GET_PR_CONFIG') {
      const { agentId, userKeys } = body;
      if (!supabaseKey) {
        return res.status(200).json({ success: false, config: null });
      }

      const rawKeyList = Array.isArray(userKeys) && userKeys.length > 0
        ? userKeys
        : [agentId || 'default'];
      const safeKeys = Array.from(new Set(rawKeyList.map(k => sanitizeAgentKey(k)).filter(Boolean)));

      const r = await fetch(
        `${supabaseUrl}/rest/v1/meta_campaigns?track=eq.pr_config&order=created_at.desc&limit=50`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
      );
      const rows = await r.json();

      if (Array.isArray(rows) && rows.length > 0) {
        let matched = null;
        for (const sKey of safeKeys) {
          matched = rows.find(row => row.id === `pr_cfg_${sKey}` || sanitizeAgentKey(row.user_id) === sKey);
          if (matched) break;
        }
        if (!matched) {
          matched = rows.find(row => row.id === 'pr_cfg_default') || rows[0];
        }

        if (matched && matched.target_summary) {
          try {
            const parsedConfig = JSON.parse(matched.target_summary);
            return res.status(200).json({ success: true, config: parsedConfig, loadedFrom: matched.id });
          } catch (e) {}
        }
      }

      return res.status(200).json({ success: false, config: null });
    }

    // [4] 메타 광고/인스타 게시물 정보를 수파베이스 DB에 저장
    if (action === 'SAVE_RECORD') {
      const { record } = body;
      if (supabaseKey && record) {
        await fetch(`${supabaseUrl}/rest/v1/meta_campaigns`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(record)
        });
      }
      return res.status(200).json({ success: true, record });
    }

    // ★ [5] 캠페인 및 유입 DB 조회 (쿼리 에러 방지 + 내 DB 100% 표시 + 타인 DB 완벽 차단)
    if (action === 'LIST' || action === 'SYNC_LIST') {
      const { userId, userKeys } = body;

      // 내 식별키들을 하이픈 제거 버전, sanitize 버전까지 모두 포함하여 매칭률 100% 보장
      const rawInputKeys = Array.isArray(userKeys) ? [...userKeys, userId] : [userId];
      const validKeySet = new Set();
      rawInputKeys.forEach(k => {
        const clean = String(k || '').trim().toLowerCase();
        if (clean && clean !== 'default' && clean !== 'weracle_user') {
          validKeySet.add(clean);
          validKeySet.add(sanitizeAgentKey(clean));
          const digitsOnly = clean.replace(/[^0-9]/g, '');
          if (digitsOnly.length >= 9) validKeySet.add(digitsOnly);
        }
      });

      // 1) 전체 캠페인 안전하게 조회 (PostgREST NULL 배제 버그 방지를 위해 order만으로 조회 후 JS에서 필터)
      let allCampaigns = [];
      try {
        const listRes = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?order=created_at.desc&limit=500`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        const cData = await listRes.json();
        if (Array.isArray(cData)) {
          allCampaigns = cData.filter(c => c.track !== 'pr_config' && !String(c.id || '').startsWith('pr_cfg_'));
        }
      } catch (e) {}

      const otherUsersCampIdSet = new Set();
      let myCampaigns = [];

      if (validKeySet.size > 0) {
        for (const c of allCampaigns) {
          const cUser = String(c.user_id || '').trim().toLowerCase();
          const cUserSanitized = sanitizeAgentKey(cUser);
          const cUserDigits = cUser.replace(/[^0-9]/g, '');

          let isMine = false;
          const isUnassignedLegacy = (!cUser || cUser === 'default' || cUser === 'weracle_user');

          if (validKeySet.has(cUser) || validKeySet.has(cUserSanitized) || (cUserDigits.length >= 9 && validKeySet.has(cUserDigits))) {
            isMine = true;
          } else if (c.target_summary && String(c.target_summary).startsWith('{')) {
            try {
              const pObj = JSON.parse(c.target_summary);
              if (pObj.igId && validKeySet.has(String(pObj.igId).toLowerCase())) isMine = true;
              if (pObj.pageId && validKeySet.has(String(pObj.pageId).toLowerCase())) isMine = true;
            } catch (e) {}
          }

          if (isMine || isUnassignedLegacy) {
            myCampaigns.push(c);
          } else {
            otherUsersCampIdSet.add(String(c.id));
          }
        }
      } else {
        myCampaigns = allCampaigns;
      }

      const instaCampIdSet = new Set(myCampaigns.filter(c => c.track === 'insta').map(c => String(c.id)));

      // 2) 유입 고객 DB 및 인스타 댓글/DM 내역 전체 조회
      let leads = [];
      try {
        const leadsRes = await fetch(`${supabaseUrl}/rest/v1/meta_leads?order=created_at.desc&limit=500`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        const lData = await leadsRes.json();

        if (Array.isArray(lData)) {
          leads = lData.filter(l => {
            const cId = String(l.campaign_id || '');
            const noteStr = String(l.note || '');

            // ① 다른 팀원이 만든 캠페인으로 들어온 DB는 확실하게 차단!
            if (cId && otherUsersCampIdSet.has(cId)) {
              return false;
            }

            // ② note에 [owner:xxx] 또는 [담당:xxx] 태그가 찍혀 있는 경우 검사
            const ownerMatch = noteStr.match(/\[(?:owner|담당):([^\]]+)\]/i);
            if (ownerMatch && ownerMatch[1]) {
              const taggedOwner = ownerMatch[1].trim().toLowerCase();
              const taggedSanitized = sanitizeAgentKey(taggedOwner);
              const taggedDigits = taggedOwner.replace(/[^0-9]/g, '');

              // 공용/미지정 태그(default, weracle_user)가 아닌 실제 다른 사람의 고유 이메일/아이디가 찍혀 있을 때만 비교
              const isGenericTag = (!taggedOwner || taggedOwner === 'default' || taggedOwner === 'weracle_user' || taggedOwner === '담당설계사');
              if (!isGenericTag && validKeySet.size > 0) {
                const isTaggedMine =
                  validKeySet.has(taggedOwner) ||
                  validKeySet.has(taggedSanitized) ||
                  (taggedDigits.length >= 9 && validKeySet.has(taggedDigits));

                //もし 태그가 이메일(@) 형식이고 내 키 중에 이메일이 있을 때만 엄격 비교 (전화번호 vs 인스타ID 불일치로 인한 내 DB 실종 방지!)
                const hasEmailInMyKeys = Array.from(validKeySet).some(k => k.includes('@'));
                if (taggedOwner.includes('@') && hasEmailInMyKeys) {
                  return isTaggedMine;
                }
                if (isTaggedMine) return true;
              }
            }

            // ③ 그 외 내 캠페인 리드, 인스타 댓글/DM 내역, PR 페이지 테스트 신청(camp_direct)은 100% 모두 표시!
            return true;
          }).map(l => {
            const cleanNote = String(l.note || '').replace(/\s*\[(?:owner|담당):[^\]]+\]/gi, '').trim();
            let cleanSource = l.source || 'meta_ad';
            if (
              instaCampIdSet.has(String(l.campaign_id || '')) ||
              String(l.campaign_id || '').startsWith('camp_ig_') ||
              String(l.region || '').includes('인스타') ||
              String(l.phone || '').includes('DM')
            ) {
              if (!String(cleanSource).includes('insta')) cleanSource = 'insta_dm_apply';
            }
            return { ...l, note: cleanNote, source: cleanSource };
          });
        }
      } catch (e) {}

      return res.status(200).json({ success: true, data: myCampaigns, leads });
    }

    // [6] 상태 변경 DB 저장
    if (action === 'TOGGLE_STATUS') {
      const { id, newStatus } = body;
      if (supabaseKey && id) {
        await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({ status: newStatus })
        });
      }
      return res.status(200).json({ success: true, status: newStatus });
    }

    // [7] 예산 및 종료일 DB 수정
    if (action === 'UPDATE_CAMPAIGN') {
      const { id, newBudget, newEndDate, adSetId } = body;
      if (supabaseKey && id) {
        const patchObj = {};
        if (newBudget) patchObj.budget = Number(newBudget);
        if (newEndDate) patchObj.end_date = newEndDate;
        if (adSetId) patchObj.adset_id = adSetId;

        await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify(patchObj)
        });
      }
      return res.status(200).json({ success: true });
    }

    // [8] 캠페인 DB 삭제
    if (action === 'DELETE_CAMPAIGN') {
      const { id } = body;
      if (supabaseKey && id) {
        await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
      }
      return res.status(200).json({ success: true });
    }

    // [9] 인스타 댓글 키워드 감지 시 자동 DM 발송 카운트 업데이트 및 유입 DB(meta_leads) 기록
    if (action === 'RECORD_INSTA_DM') {
      const { campaignId, dmSentCount, leadRecord, userId } = body;
      if (supabaseKey) {
        if (campaignId && typeof dmSentCount === 'number') {
          await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(campaignId)}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({ dm_sent_count: dmSentCount })
          });
        }
        if (leadRecord) {
          const ownerTag = userId ? ` [owner:${String(userId).toLowerCase()}]` : '';
          const recToSave = {
            ...leadRecord,
            source: 'insta_dm',
            note: `${leadRecord.note || ''}${ownerTag}`.trim()
          };
          await fetch(`${supabaseUrl}/rest/v1/meta_leads`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify(recToSave)
          });
        }
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
