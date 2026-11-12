module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://tjohrovsvgnkrlqhjkwt.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_m2fpA60L66F8uGnynEbmvg_BBepUlmR';

  const reqHost = req.headers['x-forwarded-host'] || req.headers['host'] || 'www.weraclelab.com';
  const reqProto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const baseSiteUrl = `${reqProto}://${reqHost}`;

  // ★ [GET] 인스타 DM 단축링크 클릭 시 캠페인명·담당설계사·PDF·맞춤질문 100% 보존 리다이렉트
  if (req.method === 'GET') {
    const campId = req.query && (req.query.c || req.query.id);
    if (campId && supabaseKey) {
      try {
        const r = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(campId)}&select=landing_url,title,track,target_summary,user_id`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        const rows = await r.json();
        if (Array.isArray(rows) && rows[0]) {
          let destUrl = String(rows[0].landing_url || '').trim();
          const agentKey = rows[0].user_id || 'default';
          const isInstaTrack = rows[0].track === 'insta' || String(campId).startsWith('camp_ig_');

          let pdfUrl = '';
          let qsJson = '';
          try {
            if (rows[0].target_summary && String(rows[0].target_summary).trim().startsWith('{')) {
              const pObj = JSON.parse(rows[0].target_summary);
              if (pObj.pdfUrl) pdfUrl = pObj.pdfUrl;
              if (Array.isArray(pObj.customQuestions) && pObj.customQuestions.length > 0) {
                qsJson = JSON.stringify(pObj.customQuestions);
              }
            }
          } catch (e) {}

          if (!destUrl || destUrl.includes('/api/meta-execute')) {
            destUrl = `${baseSiteUrl}/sns_apply.html?utm_source=${isInstaTrack ? 'insta_dm' : 'meta_ad'}&camp_id=${encodeURIComponent(campId)}&camp=${encodeURIComponent(rows[0].title || '')}&agent_id=${encodeURIComponent(agentKey)}&doc=${encodeURIComponent(pdfUrl)}`;
            if (qsJson) destUrl += `&qs=${encodeURIComponent(qsJson)}`;
          } else {
            if (!destUrl.includes('camp_id=') && campId) {
              destUrl += (destUrl.includes('?') ? '&' : '?') + `camp_id=${encodeURIComponent(campId)}`;
            }
            if (!destUrl.includes('camp=') && rows[0].title) {
              destUrl += (destUrl.includes('?') ? '&' : '?') + `camp=${encodeURIComponent(rows[0].title)}`;
            }
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
    // [1] 이미지 업로드
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

    // [1-1] 나의 광고콘텐츠(사진·동영상) 수파베이스 영구 저장
    if (action === 'SAVE_CUSTOM_ASSET') {
      const { userId, asset } = body;
      if (!supabaseKey || !asset || !asset.id) {
        return res.status(200).json({ success: false });
      }
      const ownerKey = sanitizeAgentKey(userId || 'default');
      await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(asset.id)}`, {
        method: 'DELETE',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      });

      const dbRecord = {
        id: String(asset.id),
        user_id: ownerKey,
        track: 'custom_asset',
        title: asset.headline || '나의 등록 콘텐츠',
        description: asset.type || 'carousel',
        cta_type: 'CUSTOM_ASSET',
        landing_url: asset.videoUrl || '',
        start_date: '',
        end_date: '',
        ratio: asset.ratio || '1:1',
        region: '',
        target_summary: JSON.stringify(asset),
        budget: 0,
        keyword: asset.keyword || '궁금',
        dm_message: '',
        status: 'ASSET',
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
      return res.status(200).json({ success: true, assetId: asset.id });
    }

    // [1-2] 나의 광고콘텐츠 삭제 (+ ad_media 스토리지 원본 파일 자동 삭제)
    if (action === 'DELETE_CUSTOM_ASSET') {
      const { assetId, mediaUrls } = body;
      if (supabaseKey && assetId) {
        let urlsToDelete = Array.isArray(mediaUrls) ? [...mediaUrls] : [];

        try {
          const r = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(assetId)}&select=target_summary,landing_url`, {
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
          });
          const rows = await r.json();
          if (Array.isArray(rows) && rows[0]) {
            if (rows[0].landing_url) urlsToDelete.push(rows[0].landing_url);
            if (rows[0].target_summary) {
              const parsed = JSON.parse(rows[0].target_summary);
              if (parsed.videoUrl) urlsToDelete.push(parsed.videoUrl);
              if (Array.isArray(parsed.slides)) {
                parsed.slides.forEach(s => { if (s && s.imgUrl) urlsToDelete.push(s.imgUrl); });
              }
            }
          }
        } catch (e) {}

        const uniqueUrls = Array.from(new Set(urlsToDelete.filter(u => typeof u === 'string' && u.includes('/ad_media/'))));
        for (const u of uniqueUrls) {
          const filePart = u.split('/ad_media/')[1];
          if (filePart) {
            const cleanFileName = filePart.split('?')[0];
            await fetch(`${supabaseUrl}/storage/v1/object/ad_media/${cleanFileName}`, {
              method: 'DELETE',
              headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
            }).catch(() => {});
          }
        }

        await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(assetId)}`, {
          method: 'DELETE',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
      }
      return res.status(200).json({ success: true });
    }

    // [2] 매거진 PR 설정 저장
    if (action === 'SAVE_PR_CONFIG') {
      const { agentId, userKeys, config } = body;
      if (!supabaseKey || !config) {
        return res.status(200).json({ success: false, error: 'Missing config or key' });
      }

      const rawKeyList = Array.isArray(userKeys) && userKeys.length > 0 ? userKeys : [agentId || 'default'];
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

    // [2-1] 알림톡 휴대폰 번호 저장
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

    // [3] PR 설정 조회
    if (action === 'GET_PR_CONFIG') {
      const { agentId, userKeys, campId } = body;
      if (!supabaseKey) {
        return res.status(200).json({ success: false, config: null });
      }

      const rawKeyList = Array.isArray(userKeys) && userKeys.length > 0 ? [...userKeys] : [agentId || 'default'];

      // 만약 agentId가 비어있고 campId만 넘어온 경우 캠페인 주인 키를 자동 추적
      if (campId && campId !== 'camp_direct') {
        try {
          const cr = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(campId)}&select=user_id&limit=1`, {
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
          });
          const crows = await cr.json();
          if (Array.isArray(crows) && crows[0] && crows[0].user_id) {
            rawKeyList.unshift(crows[0].user_id);
          }
        } catch (e) {}
      }

      const safeKeys = Array.from(new Set(rawKeyList.map(k => sanitizeAgentKey(k)).filter(Boolean)));

      const r = await fetch(
        `${supabaseUrl}/rest/v1/meta_campaigns?track=eq.pr_config&order=created_at.desc&limit=50`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
      );
      const rows = await r.json();

      if (Array.isArray(rows) && rows.length > 0) {
        let matched = null;
        for (const sKey of safeKeys) {
          if (sKey === 'default') continue;
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

    // [4] 캠페인 저장
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

    // ★ [4-1] PR 랜딩페이지(sns_apply.html) 신청 고객 DB 직접 저장 보장 (인스타 DM 신청 누락 원천 차단!)
    if (action === 'SAVE_APPLY_LEAD') {
      const { campaignId, campaignTitle, name, phone, region, note, source, agentId, hasPdf } = body;
      if (!supabaseKey || !name || !phone) {
        return res.status(200).json({ success: false, error: 'Missing name or phone' });
      }

      const cleanCampId = String(campaignId || 'camp_direct').trim();
      const cleanPhone = String(phone || '').trim();
      let resolvedOwner = String(agentId || '').trim().toLowerCase();
      let resolvedTitle = String(campaignTitle || '').trim();
      let resolvedSource = String(source || 'meta_ad').trim();
      let currentLeadsCount = 0;
      let hasMatchedCamp = false;

      // 캠페인 ID로 원소유자(user_id)와 정확한 제목·트랙(insta/meta) 조회
      if (cleanCampId && cleanCampId !== 'camp_direct') {
        try {
          const cr = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(cleanCampId)}&select=user_id,title,track,leads_count&limit=1`, {
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
          });
          const crows = await cr.json();
          if (Array.isArray(crows) && crows[0]) {
            hasMatchedCamp = true;
            currentLeadsCount = Number(crows[0].leads_count || 0);
            if (crows[0].user_id && crows[0].user_id !== 'default') {
              resolvedOwner = String(crows[0].user_id).trim().toLowerCase();
            }
            if (crows[0].title && (!resolvedTitle || resolvedTitle.includes('숨은 병원비'))) {
              resolvedTitle = crows[0].title;
            }
            if (crows[0].track === 'insta' || cleanCampId.startsWith('camp_ig_')) {
              resolvedSource = 'insta_dm_apply';
            }
          }
        } catch (e) {}
      }

      if (cleanCampId.startsWith('camp_ig_') || resolvedSource.includes('insta')) {
        resolvedSource = 'insta_dm_apply';
      }

      const cleanRawNote = String(note || '').replace(/\s*\[(?:owner|담당):[^\]]+\]/gi, '').trim();
      const ownerTag = (resolvedOwner && resolvedOwner !== 'default') ? ` [owner:${resolvedOwner}]` : '';
      const finalNote = `${cleanRawNote}${ownerTag}`.trim();
      const initialStatus = hasPdf ? '자료열람·신청완료' : '신규대기';

      // 최근 2분 이내 동일 연락처로 meta-webhook이 이미 저장했는지 확인 (중복 방지 + 누락 필드 자동 보정)
      let existingRecentRow = null;
      try {
        const dupRes = await fetch(
          `${supabaseUrl}/rest/v1/meta_leads?phone=eq.${encodeURIComponent(cleanPhone)}&order=created_at.desc&limit=5`,
          { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
        );
        const dupRows = await dupRes.json();
        if (Array.isArray(dupRows) && dupRows.length > 0) {
          existingRecentRow = dupRows.find(r => {
            if (!r.created_at) return false;
            const diffMs = Math.abs(Date.now() - new Date(r.created_at).getTime());
            return diffMs < 120000;
          });
        }
      } catch (e) {}

      if (existingRecentRow) {
        // 이미 meta-webhook에서 들어갔다면 캠페인ID·출처·소유자 태그만 정확하게 보정
        const patchFilter = existingRecentRow.id !== undefined
          ? `id=eq.${encodeURIComponent(existingRecentRow.id)}`
          : `created_at=eq.${encodeURIComponent(existingRecentRow.created_at)}&phone=eq.${encodeURIComponent(cleanPhone)}`;

        await fetch(`${supabaseUrl}/rest/v1/meta_leads?${patchFilter}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({
            campaign_id: cleanCampId,
            campaign_title: resolvedTitle || existingRecentRow.campaign_title || '상담 신청',
            source: resolvedSource,
            note: finalNote
          })
        });
        return res.status(200).json({ success: true, mode: 'patched_existing' });
      }

      // meta-webhook에서 저장되지 않은 경우 수파베이스 meta_leads에 즉시 직접 저장!
      const newLeadPayload = {
        campaign_id: cleanCampId,
        campaign_title: resolvedTitle || '상담 신청',
        source: resolvedSource,
        name: String(name).trim(),
        phone: cleanPhone,
        region: String(region || '').trim(),
        note: finalNote,
        status: initialStatus,
        created_at: new Date().toISOString()
      };

      const insRes = await fetch(`${supabaseUrl}/rest/v1/meta_leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(newLeadPayload)
      });

      if (hasMatchedCamp && insRes.ok) {
        await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(cleanCampId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({ leads_count: currentLeadsCount + 1 })
        }).catch(() => {});
      }

      return res.status(200).json({ success: insRes.ok, mode: 'inserted_direct' });
    }

    // [5] 캠페인 · 나의 광고콘텐츠 · 유입 DB 통합 조회
    if (action === 'LIST' || action === 'SYNC_LIST') {
      const { userId, userKeys } = body;

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

      let allRows = [];
      try {
        const listRes = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?order=created_at.desc&limit=600`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        const cData = await listRes.json();
        if (Array.isArray(cData)) {
          allRows = cData.filter(c => c.track !== 'pr_config' && !String(c.id || '').startsWith('pr_cfg_'));
        }
      } catch (e) {}

      const myCustomAssets = [];
      const allCampaigns = [];

      for (const row of allRows) {
        if (row.track === 'custom_asset') {
          const rUser = String(row.user_id || '').trim().toLowerCase();
          const rSanitized = sanitizeAgentKey(rUser);
          const isMyAsset = validKeySet.size === 0 || validKeySet.has(rUser) || validKeySet.has(rSanitized) || rUser === 'default';
          if (isMyAsset && row.target_summary) {
            try {
              const parsedAsset = JSON.parse(row.target_summary);
              if (parsedAsset && parsedAsset.id) myCustomAssets.push(parsedAsset);
            } catch (e) {}
          }
        } else {
          allCampaigns.push(row);
        }
      }

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

      const myCampIdSet = new Set(myCampaigns.map(c => String(c.id)));
      const myCampTitleSet = new Set(myCampaigns.map(c => String(c.title || '').trim()).filter(Boolean));
      const instaCampIdSet = new Set(myCampaigns.filter(c => c.track === 'insta').map(c => String(c.id)));

      let leads = [];
      try {
        const leadsRes = await fetch(`${supabaseUrl}/rest/v1/meta_leads?order=created_at.desc&limit=500`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        const lData = await leadsRes.json();

        if (Array.isArray(lData)) {
          leads = lData.filter(l => {
            const cId = String(l.campaign_id || '');
            const cTitle = String(l.campaign_title || '').trim();
            const noteStr = String(l.note || '');

            // ① 내 캠페인/인스타 게시물 ID와 일치하면 조건 없이 100% 내 DB로 표시!
            if (cId && myCampIdSet.has(cId)) return true;

            // ② 타인 캠페인 ID는 차단
            if (cId && otherUsersCampIdSet.has(cId)) return false;

            // ③ 캠페인 제목이 내 게시물과 정확히 일치하는 경우에도 내 DB로 표시
            if ((!cId || cId === 'camp_direct') && cTitle && myCampTitleSet.has(cTitle)) return true;

            const ownerMatch = noteStr.match(/\[(?:owner|담당):([^\]]+)\]/i);
            if (ownerMatch && ownerMatch[1]) {
              const taggedOwner = ownerMatch[1].trim().toLowerCase();
              const taggedSanitized = sanitizeAgentKey(taggedOwner);
              const taggedDigits = taggedOwner.replace(/[^0-9]/g, '');

              const isGenericTag = (!taggedOwner || taggedOwner === 'default' || taggedOwner === 'weracle_user' || taggedOwner === '담당설계사');
              if (!isGenericTag && validKeySet.size > 0) {
                const isTaggedMine =
                  validKeySet.has(taggedOwner) ||
                  validKeySet.has(taggedSanitized) ||
                  (taggedDigits.length >= 9 && validKeySet.has(taggedDigits));

                if (isTaggedMine) return true;

                const hasEmailInMyKeys = Array.from(validKeySet).some(k => k.includes('@'));
                if (taggedOwner.includes('@') && hasEmailInMyKeys) return false;
              }
            }
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

      return res.status(200).json({ success: true, data: myCampaigns, leads, customAssets: myCustomAssets });
    }

    // [6] 캠페인 ON/OFF 변경
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

    // [6-1] 유입 고객 DB 진행 상태 실시간 저장
    if (action === 'UPDATE_LEAD_STATUS') {
      const { leadId, createdAt, phone, campaignId, newStatus } = body;
      if (!supabaseKey || !newStatus) {
        return res.status(200).json({ success: false });
      }

      let queryFilter = '';
      if (leadId !== undefined && leadId !== null && String(leadId) !== '') {
        queryFilter = `id=eq.${encodeURIComponent(leadId)}`;
      } else if (createdAt) {
        queryFilter = `created_at=eq.${encodeURIComponent(createdAt)}`;
        if (phone) queryFilter += `&phone=eq.${encodeURIComponent(phone)}`;
      } else if (phone && campaignId) {
        queryFilter = `phone=eq.${encodeURIComponent(phone)}&campaign_id=eq.${encodeURIComponent(campaignId)}`;
      }

      if (queryFilter) {
        await fetch(`${supabaseUrl}/rest/v1/meta_leads?${queryFilter}`, {
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

    // [7] 예산 및 종료일 수정
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

    // [8] 캠페인 삭제
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

    // [9] 인스타 댓글 자동DM 기록 (비표준 필드 제거로 저장 거절 방지 + 중복 방지)
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
          const ownerTag = userId ? ` [owner:${String(userId).trim().toLowerCase()}]` : '';
          const cleanCampaignId = String(leadRecord.campaign_id || campaignId || 'camp_ig_direct');
          const cleanName = String(leadRecord.name || '인스타 댓글 고객');
          const rawNote = String(leadRecord.note || '').trim();

          let alreadySaved = false;
          try {
            const chkRes = await fetch(
              `${supabaseUrl}/rest/v1/meta_leads?campaign_id=eq.${encodeURIComponent(cleanCampaignId)}&name=eq.${encodeURIComponent(cleanName)}&order=created_at.desc&limit=5`,
              { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
            );
            const chkRows = await chkRes.json();
            if (Array.isArray(chkRows) && chkRows.length > 0) {
              const commentCore = rawNote.split('(키워드')[0].trim();
              alreadySaved = chkRows.some(r => commentCore && String(r.note || '').includes(commentCore));
            }
          } catch (e) {}

          if (!alreadySaved) {
            const safeRecordToSave = {
              campaign_id: cleanCampaignId,
              campaign_title: String(leadRecord.campaign_title || '인스타그램 자동DM'),
              source: String(leadRecord.source || 'insta_dm'),
              name: cleanName,
              phone: String(leadRecord.phone || '답글+DM 발송완료'),
              region: String(leadRecord.region || '인스타그램 댓글'),
              note: `${rawNote}${ownerTag}`.trim(),
              status: String(leadRecord.status || '자동DM 발송완료'),
              created_at: leadRecord.created_at || new Date().toISOString()
            };

            await fetch(`${supabaseUrl}/rest/v1/meta_leads`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify(safeRecordToSave)
            });
          }
        }
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
