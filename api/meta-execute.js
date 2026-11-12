module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://tjohrovsvgnkrlqhjkwt.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_m2fpA60L66F8uGnynEbmvg_BBepUlmR';

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

  // 한글 성함(박보환 등)도 깨지지 않도록 보존
  function sanitizeAgentKey(rawKey) {
    const str = String(rawKey || 'default').trim().toLowerCase();
    const cleaned = str.replace(/[^a-z0-9가-힣@._-]/g, '_').replace(/^_+|_+$/g, '');
    return cleaned || 'default';
  }

  // 메타/인스타 API 호환을 위한 영문·숫자 스토리지 폴더명 생성
  function toSafeStorageFolder(rawKey) {
    const raw = String(rawKey || 'default').trim().toLowerCase();
    const ascii = raw.replace(/[^a-z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    if (ascii && ascii.length >= 2) return ascii;
    const hex = Buffer.from(raw || 'default', 'utf8').toString('hex').slice(0, 16);
    return `agent_${hex}`;
  }

  // meta_leads 정식 저장 + 읽기(SELECT) 권한까지 검증 후 필요시 백업 동시 보장
  async function insertLeadGuaranteed(leadData, ownerKey) {
    const cleanOwner = sanitizeAgentKey(ownerKey || 'default');
    const ownerTag = (cleanOwner && cleanOwner !== 'default') ? ` [owner:${cleanOwner}]` : '';
    const baseNote = String(leadData.note || '').replace(/\s*\[(?:owner|담당):[^\]]+\]/gi, '').trim();
    const finalNote = `${baseNote}${ownerTag}`.trim();
    const nowIso = leadData.created_at || new Date().toISOString();
    const generatedId = `lead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const fullLeadObj = {
      id: generatedId,
      campaign_id: String(leadData.campaign_id || 'camp_direct'),
      campaign_title: String(leadData.campaign_title || '상담 신청'),
      source: String(leadData.source || 'insta_dm_apply'),
      name: String(leadData.name || '').trim(),
      phone: String(leadData.phone || '').trim(),
      region: String(leadData.region || '').trim(),
      note: finalNote,
      status: String(leadData.status || '신규대기'),
      created_at: nowIso
    };

    let readableInMetaLeads = false;

    try {
      const sampleRes = await fetch(`${supabaseUrl}/rest/v1/meta_leads?limit=1`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      });
      const sampleRows = await sampleRes.json();
      let payloadToInsert = { ...fullLeadObj };

      if (Array.isArray(sampleRows) && sampleRows[0]) {
        const sample = sampleRows[0];
        const allowedCols = new Set(Object.keys(sample));
        const filtered = {};
        Object.keys(payloadToInsert).forEach(k => {
          if (allowedCols.has(k)) filtered[k] = payloadToInsert[k];
        });
        if (allowedCols.has('id') && typeof sample.id === 'number') {
          delete filtered.id;
        }
        if (!allowedCols.has('note') && allowedCols.has('answer')) {
          filtered.answer = finalNote;
        }
        if (allowedCols.has('user_id') && !filtered.user_id) {
          filtered.user_id = cleanOwner;
        }
        payloadToInsert = filtered;
      }

      // return=representation으로 INSERT와 SELECT(읽기) 가능 여부를 동시에 검증
      let insRes = await fetch(`${supabaseUrl}/rest/v1/meta_leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(payloadToInsert)
      });

      if (insRes.ok) {
        const retRows = await insRes.json().catch(() => []);
        if (Array.isArray(retRows) && retRows.length > 0) {
          readableInMetaLeads = true;
        }
      } else {
        // SELECT RLS만 막혀 있는 경우 minimal로 meta_leads에도 넣어두고 아래 백업도 함께 기록
        await fetch(`${supabaseUrl}/rest/v1/meta_leads`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(payloadToInsert)
        }).catch(() => {});
      }
    } catch (e) {}

    if (readableInMetaLeads) {
      return { success: true, storage: 'meta_leads', id: generatedId };
    }

    // meta_leads 읽기(SELECT)나 쓰기가 제한된 상태라도 100% 화면에 뜨도록 백업 저장
    const backupId = `lead_bk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const storedLeadJson = { ...fullLeadObj, id: backupId };
    const backupRecord = {
      id: backupId,
      user_id: cleanOwner,
      track: 'lead_backup',
      title: fullLeadObj.campaign_title,
      description: fullLeadObj.source,
      cta_type: 'LEAD_BACKUP',
      landing_url: '',
      start_date: '',
      end_date: '',
      ratio: '1:1',
      region: fullLeadObj.region,
      target_summary: JSON.stringify(storedLeadJson),
      budget: 0,
      keyword: fullLeadObj.phone,
      dm_message: fullLeadObj.name,
      status: fullLeadObj.status,
      meta_campaign_id: fullLeadObj.campaign_id,
      adset_id: '',
      ad_id: '',
      ig_media_id: '',
      leads_count: 0,
      dm_sent_count: 0,
      created_at: nowIso
    };

    const bkRes = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(backupRecord)
    });

    return { success: bkRes.ok, storage: 'lead_backup', id: backupId };
  }

  try {
    // [1] 이미지 업로드 (사용자별 폴더 users/{userFolder}/ 자동 분리)
    if (action === 'UPLOAD_MEDIA') {
      const { mediaBase64, userId } = body;
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
      const folder = toSafeStorageFolder(userId || 'shared');
      const objectPath = `users/${folder}/insta_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

      const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/ad_media/${objectPath}`, {
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
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/ad_media/${objectPath}`;
        return res.status(200).json({ success: true, mediaUrl: publicUrl });
      }
      return res.status(200).json({ success: false, mediaUrl: '' });
    }

    // [1-1] 나의 광고콘텐츠 저장
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

    // [1-2] 나의 광고콘텐츠 삭제 (+ 사용자 폴더 내 원본 파일 자동 삭제)
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
            const cleanObjectPath = filePart.split('?')[0];
            await fetch(`${supabaseUrl}/storage/v1/object/ad_media/${cleanObjectPath}`, {
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

    // [4-1] PR 랜딩페이지 신청 고객 DB 저장
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

      const initialStatus = hasPdf ? '자료열람·신청완료' : '신규대기';
      const saveResult = await insertLeadGuaranteed({
        campaign_id: cleanCampId,
        campaign_title: resolvedTitle || '상담 신청',
        source: resolvedSource,
        name: String(name).trim(),
        phone: cleanPhone,
        region: String(region || '').trim(),
        note: String(note || ''),
        status: initialStatus,
        created_at: new Date().toISOString()
      }, resolvedOwner);

      if (hasMatchedCamp && saveResult.success) {
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

      return res.status(200).json(saveResult);
    }

    // [5] 캠페인 · 나의 광고콘텐츠 · 유입 DB 통합 조회 (다중 계정 별칭 완벽 연결)
    if (action === 'LIST' || action === 'SYNC_LIST') {
      const { userId, userKeys, knownCampIds } = body;
      const knownCampIdSet = new Set(Array.isArray(knownCampIds) ? knownCampIds.map(id => String(id)) : []);

      const rawInputKeys = Array.isArray(userKeys) ? [...userKeys, userId] : [userId];
      const validKeySet = new Set();

      const addKeyVariants = (rawVal) => {
        const clean = String(rawVal || '').trim().toLowerCase().replace(/^@/, '');
        if (!clean || clean === 'default' || clean === 'weracle_user' || clean === '담당설계사') return;
        validKeySet.add(clean);
        validKeySet.add(sanitizeAgentKey(clean));
        if (clean.includes('@')) {
          const emailPrefix = clean.split('@')[0].trim();
          if (emailPrefix.length >= 3) validKeySet.add(emailPrefix);
        }
        const digitsOnly = clean.replace(/[^0-9]/g, '');
        if (digitsOnly.length >= 9) validKeySet.add(digitsOnly);
      };

      rawInputKeys.forEach(addKeyVariants);

      let allRows = [];
      try {
        const listRes = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?order=created_at.desc&limit=800`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        const cData = await listRes.json();
        if (Array.isArray(cData)) allRows = cData;
      } catch (e) {}

      // PR 설정 레코드(pr_cfg_*)에 저장된 내 이름/전화번호도 식별키로 자동 연결
      for (const r of allRows) {
        if (r.track === 'pr_config' || String(r.id || '').startsWith('pr_cfg_')) {
          const rUser = String(r.user_id || '').trim().toLowerCase();
          if (validKeySet.has(rUser) || validKeySet.has(sanitizeAgentKey(rUser))) {
            try {
              const cfg = JSON.parse(r.target_summary || '{}');
              if (cfg.agentNotifyPhone) addKeyVariants(cfg.agentNotifyPhone);
              if (cfg.texts && cfg.texts.heroAgentName) addKeyVariants(cfg.texts.heroAgentName);
            } catch (e) {}
          }
        }
      }

      const nonConfigRows = allRows.filter(c => c.track !== 'pr_config' && !String(c.id || '').startsWith('pr_cfg_'));
      const rawCustomAssetRows = [];
      const backupLeadRows = [];
      const allCampaigns = [];

      for (const row of nonConfigRows) {
        if (row.track === 'custom_asset') {
          rawCustomAssetRows.push(row);
        } else if (row.track === 'lead_backup' || String(row.id || '').startsWith('lead_bk_')) {
          try {
            const parsedLead = row.target_summary ? JSON.parse(row.target_summary) : {};
            const rowOwner = String(row.user_id || '').trim().toLowerCase();
            const baseNt = String(parsedLead.note || '');
            const taggedNt = (rowOwner && rowOwner !== 'default' && !baseNt.includes('[owner:'))
              ? `${baseNt} [owner:${rowOwner}]`.trim()
              : baseNt;

            backupLeadRows.push({
              id: row.id,
              campaign_id: parsedLead.campaign_id || row.meta_campaign_id || 'camp_direct',
              campaign_title: parsedLead.campaign_title || row.title || '상담 신청',
              source: parsedLead.source || row.description || 'insta_dm_apply',
              name: parsedLead.name || row.dm_message || '',
              phone: parsedLead.phone || row.keyword || '',
              region: parsedLead.region || row.region || '',
              note: taggedNt,
              status: row.status || parsedLead.status || '신규대기',
              created_at: row.created_at || parsedLead.created_at || new Date().toISOString()
            });
          } catch (e) {}
        } else {
          allCampaigns.push(row);
        }
      }

      // 캠페인이 내 소유인지 정밀 판별하는 헬퍼 (user_id + target_summary + landing_url 내 담당자명/ID 모두 대조)
      const checkCampaignBelongsToMe = (c) => {
        if (knownCampIdSet.has(String(c.id))) return true;
        const cUser = String(c.user_id || '').trim().toLowerCase().replace(/^@/, '');
        const cUserSanitized = sanitizeAgentKey(cUser);
        const cUserDigits = cUser.replace(/[^0-9]/g, '');

        if (cUser && (validKeySet.has(cUser) || validKeySet.has(cUserSanitized) || (cUserDigits.length >= 9 && validKeySet.has(cUserDigits)))) {
          return true;
        }

        if (c.target_summary && String(c.target_summary).startsWith('{')) {
          try {
            const pObj = JSON.parse(c.target_summary);
            const candidates = [pObj.igId, pObj.igUser, pObj.pageId, pObj.agentName, pObj.agentPhone];
            for (const cand of candidates) {
              const cl = String(cand || '').trim().toLowerCase().replace(/^@/, '');
              if (cl && (validKeySet.has(cl) || validKeySet.has(sanitizeAgentKey(cl)))) return true;
              const dg = cl.replace(/[^0-9]/g, '');
              if (dg.length >= 9 && validKeySet.has(dg)) return true;
            }
          } catch (e) {}
        }

        if (c.landing_url) {
          try {
            const uIdx = c.landing_url.indexOf('?');
            if (uIdx >= 0) {
              const sp = new URLSearchParams(c.landing_url.slice(uIdx + 1));
              const urlCands = [sp.get('agent_id'), sp.get('agent'), sp.get('agent_phone')];
              for (const cand of urlCands) {
                const cl = String(cand || '').trim().toLowerCase().replace(/^@/, '');
                if (cl && (validKeySet.has(cl) || validKeySet.has(sanitizeAgentKey(cl)))) return true;
                const dg = cl.replace(/[^0-9]/g, '');
                if (dg.length >= 9 && validKeySet.has(dg)) return true;
              }
            }
          } catch (e) {}
        }

        return false;
      };

      // 2회 연쇄 브릿지: 내 캠페인(예: agent=박보환)에 적힌 user_id(예: weracle_bohwan)를 내 키 목록에 자동 편입
      for (let pass = 0; pass < 2; pass++) {
        for (const c of allCampaigns) {
          if (checkCampaignBelongsToMe(c)) {
            if (c.user_id) addKeyVariants(c.user_id);
          }
        }
      }

      const myCustomAssets = [];
      for (const row of rawCustomAssetRows) {
        const rUser = String(row.user_id || '').trim().toLowerCase();
        const isMyAsset = validKeySet.size === 0 || validKeySet.has(rUser) || validKeySet.has(sanitizeAgentKey(rUser)) || rUser === 'default';
        if (isMyAsset && row.target_summary) {
          try {
            const parsedAsset = JSON.parse(row.target_summary);
            if (parsedAsset && parsedAsset.id) myCustomAssets.push(parsedAsset);
          } catch (e) {}
        }
      }

      const otherUsersCampIdSet = new Set();
      let myCampaigns = [];

      if (validKeySet.size > 0 || knownCampIdSet.size > 0) {
        for (const c of allCampaigns) {
          const cUser = String(c.user_id || '').trim().toLowerCase();
          const isUnassignedLegacy = (!cUser || cUser === 'default' || cUser === 'weracle_user');
          const isMine = checkCampaignBelongsToMe(c);

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
        let leadsRes = await fetch(`${supabaseUrl}/rest/v1/meta_leads?order=created_at.desc&limit=500`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        if (!leadsRes.ok) {
          leadsRes = await fetch(`${supabaseUrl}/rest/v1/meta_leads?limit=500`, {
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
          });
        }
        const lData = await leadsRes.json();
        const combinedRaw = [...backupLeadRows, ...(Array.isArray(lData) ? lData : [])];

        combinedRaw.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        const seenSig = new Set();
        const dedupedRaw = [];
        for (const item of combinedRaw) {
          const minuteBucket = item.created_at ? Math.floor(new Date(item.created_at).getTime() / 60000) : 0;
          const sig = `${item.campaign_id || ''}|${item.name || ''}|${item.phone || ''}|${minuteBucket}`;
          if (seenSig.has(sig)) continue;
          seenSig.add(sig);
          dedupedRaw.push(item);
        }

        leads = dedupedRaw.filter(l => {
          const cId = String(l.campaign_id || '');
          const cTitle = String(l.campaign_title || '').trim();
          const noteStr = String(l.note || '');

          if (cId && myCampIdSet.has(cId)) return true;
          if (cTitle && myCampTitleSet.has(cTitle)) return true;

          const ownerMatch = noteStr.match(/\[(?:owner|담당):([^\]]+)\]/i);
          if (ownerMatch && ownerMatch[1]) {
            const taggedOwner = ownerMatch[1].trim().toLowerCase().replace(/^@/, '');
            const taggedSanitized = sanitizeAgentKey(taggedOwner);
            const taggedDigits = taggedOwner.replace(/[^0-9]/g, '');

            const isGenericTag = (!taggedOwner || taggedOwner === 'default' || taggedOwner === 'weracle_user' || taggedOwner === '담당설계사');
            if (!isGenericTag && validKeySet.size > 0) {
              const isTaggedMine =
                validKeySet.has(taggedOwner) ||
                validKeySet.has(taggedSanitized) ||
                (taggedDigits.length >= 9 && validKeySet.has(taggedDigits));

              if (isTaggedMine) return true;
            }
          }

          if (cId && otherUsersCampIdSet.has(cId)) return false;
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

    // [6-1] 유입 고객 진행상태 변경
    if (action === 'UPDATE_LEAD_STATUS') {
      const { leadId, createdAt, phone, campaignId, newStatus } = body;
      if (!supabaseKey || !newStatus) {
        return res.status(200).json({ success: false });
      }

      if (leadId && String(leadId).startsWith('lead_bk_')) {
        await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(leadId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({ status: newStatus })
        });
        return res.status(200).json({ success: true, status: newStatus });
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

    // [9] 인스타 댓글 자동DM 기록
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
          const cleanCampaignId = String(leadRecord.campaign_id || campaignId || 'camp_ig_direct');
          const cleanName = String(leadRecord.name || '인스타 댓글 고객');
          const rawNote = String(leadRecord.note || '').trim();

          await insertLeadGuaranteed({
            campaign_id: cleanCampaignId,
            campaign_title: String(leadRecord.campaign_title || '인스타그램 자동DM'),
            source: String(leadRecord.source || 'insta_dm'),
            name: cleanName,
            phone: String(leadRecord.phone || '답글+DM 발송완료'),
            region: String(leadRecord.region || '인스타그램 댓글'),
            note: rawNote,
            status: String(leadRecord.status || '자동DM 발송완료'),
            created_at: leadRecord.created_at || new Date().toISOString()
          }, userId || 'default');
        }
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
