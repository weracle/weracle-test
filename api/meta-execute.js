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
          const agentKey = rows[0].user_id || '';
          const isInstaTrack = rows[0].track === 'insta' || String(campId).startsWith('camp_ig_');

          let pdfUrl = '';
          let qsJson = '';
          let prId = '';
          try {
            if (rows[0].target_summary && String(rows[0].target_summary).trim().startsWith('{')) {
              const pObj = JSON.parse(rows[0].target_summary);
              if (pObj.pdfUrl) pdfUrl = pObj.pdfUrl;
              if (pObj.prId) prId = pObj.prId;
              if (Array.isArray(pObj.customQuestions) && pObj.customQuestions.length > 0) {
                qsJson = JSON.stringify(pObj.customQuestions);
              }
            }
          } catch (e) {}

          if (!destUrl || destUrl.includes('/api/meta-execute')) {
            destUrl = `${baseSiteUrl}/sns_apply.html?utm_source=${isInstaTrack ? 'insta_dm' : 'meta_ad'}&camp_id=${encodeURIComponent(campId)}&camp=${encodeURIComponent(rows[0].title || '')}&agent_id=${encodeURIComponent(agentKey)}&doc=${encodeURIComponent(pdfUrl)}`;
            if (qsJson) destUrl += `&qs=${encodeURIComponent(qsJson)}`;
            if (prId) destUrl += `&pr_id=${encodeURIComponent(prId)}`;
          } else {
            if (!destUrl.includes('camp_id=') && campId) {
              destUrl += (destUrl.includes('?') ? '&' : '?') + `camp_id=${encodeURIComponent(campId)}`;
            }
            if (!destUrl.includes('camp=') && rows[0].title) {
              destUrl += (destUrl.includes('?') ? '&' : '?') + `camp=${encodeURIComponent(rows[0].title)}`;
            }
            if (agentKey && !destUrl.includes('agent_id=')) {
              destUrl += (destUrl.includes('?') ? '&' : '?') + `agent_id=${encodeURIComponent(agentKey)}`;
            }
            if (prId && !destUrl.includes('pr_id=')) {
              destUrl += (destUrl.includes('?') ? '&' : '?') + `pr_id=${encodeURIComponent(prId)}`;
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
    const str = String(rawKey || '').trim().toLowerCase();
    if (!str || str === 'default' || str === 'shared' || str === 'weracle_user' || str === '담당설계사') return '';
    return str.replace(/[^a-z0-9가-힣@._-]/g, '_').replace(/^_+|_+$/g, '');
  }

  function toSafeStorageFolder(rawKey) {
    const raw = String(rawKey || 'agent').trim().toLowerCase();
    const ascii = raw.replace(/[^a-z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    if (ascii && ascii.length >= 2) return ascii;
    const hex = Buffer.from(raw || 'agent', 'utf8').toString('hex').slice(0, 16);
    return `agent_${hex}`;
  }

  async function insertLeadGuaranteed(leadData, ownerKey) {
    const cleanOwner = sanitizeAgentKey(ownerKey) || 'unassigned';
    const ownerTag = cleanOwner !== 'unassigned' ? ` [owner:${cleanOwner}]` : '';
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

      const insRes = await fetch(`${supabaseUrl}/rest/v1/meta_leads`, {
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
    // [1] 이미지 업로드
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
      const folder = toSafeStorageFolder(userId || 'user');
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
      const ownerKey = sanitizeAgentKey(userId);
      if (!supabaseKey || !asset || !asset.id || !ownerKey) {
        return res.status(200).json({ success: false, error: '로그인 계정을 확인해 주세요.' });
      }

      await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(asset.id)}&user_id=eq.${encodeURIComponent(ownerKey)}`, {
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

    // [1-2] 나의 광고콘텐츠 삭제
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

    // [2] 멀티 PR 랜딩페이지 저장 (로그인 계정 단독 소유 고정)
    if (action === 'SAVE_PR_CONFIG' || action === 'SAVE_PR_PAGE') {
      const { agentId, config, pageId, pageTitle, presetType, isDefault } = body;
      const primaryOwner = sanitizeAgentKey(agentId);
      if (!supabaseKey || !config || !primaryOwner) {
        return res.status(200).json({ success: false, error: '위라클랩 로그인 세션을 확인한 뒤 다시 저장해 주세요.' });
      }

      const enrichedConfig = {
        ...config,
        ownerAgentId: primaryOwner,
        pageTitle: String(pageTitle || config.pageTitle || '나의 대표 PR 페이지').trim(),
        presetType: String(presetType || config.presetType || 'A').toUpperCase(),
        isDefault: Boolean(isDefault || config.isDefault),
        updatedAt: new Date().toISOString()
      };

      const targetSlotId = (pageId && String(pageId).startsWith('pr_page_'))
        ? String(pageId)
        : (action === 'SAVE_PR_PAGE' ? `pr_page_${primaryOwner}_${Date.now()}` : `pr_cfg_${primaryOwner}`);

      enrichedConfig.pageId = targetSlotId;
      const configJsonStr = JSON.stringify(enrichedConfig);

      if (enrichedConfig.isDefault || !String(targetSlotId).startsWith('pr_page_')) {
        const defRecId = `pr_cfg_${primaryOwner}`;
        await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(defRecId)}`, {
          method: 'DELETE',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        await fetch(`${supabaseUrl}/rest/v1/meta_campaigns`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            id: defRecId,
            user_id: primaryOwner,
            track: 'pr_config',
            title: enrichedConfig.pageTitle,
            description: enrichedConfig.presetType,
            cta_type: 'PR_DEFAULT',
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
          })
        });

        try {
          const listR = await fetch(
            `${supabaseUrl}/rest/v1/meta_campaigns?track=eq.pr_config&user_id=eq.${encodeURIComponent(primaryOwner)}&limit=100`,
            { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
          );
          const existingPages = await listR.json();
          if (Array.isArray(existingPages)) {
            for (const row of existingPages) {
              if (String(row.id).startsWith('pr_page_') && row.id !== targetSlotId && row.target_summary) {
                try {
                  const pCfg = JSON.parse(row.target_summary);
                  if (pCfg.isDefault) {
                    pCfg.isDefault = false;
                    await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(row.id)}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
                      body: JSON.stringify({ cta_type: 'PR_SLOT', target_summary: JSON.stringify(pCfg) })
                    });
                  }
                } catch (e) {}
              }
            }
          }
        } catch (e) {}
      }

      if (String(targetSlotId).startsWith('pr_page_')) {
        await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(targetSlotId)}`, {
          method: 'DELETE',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        await fetch(`${supabaseUrl}/rest/v1/meta_campaigns`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            id: targetSlotId,
            user_id: primaryOwner,
            track: 'pr_config',
            title: enrichedConfig.pageTitle,
            description: enrichedConfig.presetType,
            cta_type: enrichedConfig.isDefault ? 'PR_DEFAULT' : 'PR_SLOT',
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
          })
        });
      }

      return res.status(200).json({ success: true, agentKey: primaryOwner, pageId: targetSlotId, config: enrichedConfig });
    }

    // [2-0] 내 PR 랜딩페이지 보관함 조회 (내 아이디 일치 항목만)
    if (action === 'LIST_PR_PAGES') {
      const { agentId, userKeys } = body;
      if (!supabaseKey) return res.status(200).json({ success: false, pages: [] });

      const rawKeyList = Array.isArray(userKeys) ? [agentId, ...userKeys] : [agentId];
      const safeKeySet = new Set(rawKeyList.map(k => sanitizeAgentKey(k)).filter(Boolean));
      if (safeKeySet.size === 0) {
        return res.status(200).json({ success: true, pages: [] });
      }

      const r = await fetch(
        `${supabaseUrl}/rest/v1/meta_campaigns?track=eq.pr_config&order=created_at.desc&limit=400`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
      );
      const rows = await r.json();
      const myPages = [];
      let legacyDefaultRow = null;

      if (Array.isArray(rows)) {
        for (const row of rows) {
          const rUser = sanitizeAgentKey(row.user_id || '');
          if (!rUser) continue;
          const isMine = safeKeySet.has(rUser) || Array.from(safeKeySet).some(k => row.id === `pr_cfg_${k}`);
          if (!isMine || !row.target_summary) continue;

          try {
            const parsed = JSON.parse(row.target_summary);
            if (String(row.id).startsWith('pr_page_')) {
              myPages.push({
                id: row.id,
                title: parsed.pageTitle || row.title || '내 랜딩페이지',
                presetType: parsed.presetType || row.description || 'A',
                isDefault: Boolean(parsed.isDefault || row.cta_type === 'PR_DEFAULT'),
                thumbUrl: (parsed.photos && parsed.photos.heroPhotoBox) || '',
                agentName: (parsed.texts && parsed.texts.heroAgentName) || '',
                updatedAt: parsed.updatedAt || row.created_at,
                config: parsed
              });
            } else if (!legacyDefaultRow && String(row.id).startsWith('pr_cfg_')) {
              legacyDefaultRow = {
                id: row.id,
                title: parsed.pageTitle || (row.title !== 'PR_MAGAZINE_CONFIG' ? row.title : '나의 기본 대표 PR 페이지'),
                presetType: parsed.presetType || 'A',
                isDefault: true,
                thumbUrl: (parsed.photos && parsed.photos.heroPhotoBox) || '',
                agentName: (parsed.texts && parsed.texts.heroAgentName) || '',
                updatedAt: parsed.updatedAt || row.created_at,
                config: parsed
              };
            }
          } catch (e) {}
        }
      }

      if (legacyDefaultRow && !myPages.some(p => p.isDefault)) {
        myPages.unshift(legacyDefaultRow);
      } else {
        myPages.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
      }

      return res.status(200).json({ success: true, pages: myPages });
    }

    // [2-0-B] 선택한 PR 랜딩페이지 삭제
    if (action === 'DELETE_PR_PAGE') {
      const { pageId } = body;
      if (supabaseKey && pageId && String(pageId).startsWith('pr_page_')) {
        await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(pageId)}`, {
          method: 'DELETE',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
      }
      return res.status(200).json({ success: true });
    }

    // [2-1] 알림톡 휴대폰 번호 저장 (설정 슬롯이 아직 없어도 즉시 생성해 번호 보관)
    if (action === 'SAVE_AGENT_PHONE') {
      const { agentId, agentPhone } = body;
      const primaryKey = sanitizeAgentKey(agentId);
      if (!supabaseKey || !agentPhone || !primaryKey) return res.status(200).json({ success: false });

      const recId = `pr_cfg_${primaryKey}`;
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
            headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify({ target_summary: JSON.stringify(cfg) })
          });
        } catch (e) {}
      } else {
        await fetch(`${supabaseUrl}/rest/v1/meta_campaigns`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            id: recId,
            user_id: primaryKey,
            track: 'pr_config',
            title: '알림톡 수신 설정',
            description: 'A',
            cta_type: 'NOTIFY_ONLY',
            landing_url: '',
            start_date: '',
            end_date: '',
            ratio: '1:1',
            region: '',
            target_summary: JSON.stringify({ agentNotifyPhone: agentPhone }),
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
          })
        });
      }
      return res.status(200).json({ success: true });
    }

    // [3] 특정 PR 페이지(prId) 또는 내 대표 PR 설정 조회 (타인 페이지 폴백 완전 제거!)
    if (action === 'GET_PR_CONFIG') {
      const { agentId, userKeys, campId, prId } = body;
      if (!supabaseKey) return res.status(200).json({ success: false, config: null });

      if (prId) {
        try {
          const spRes = await fetch(
            `${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(prId)}&limit=1`,
            { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
          );
          const spRows = await spRes.json();
          if (Array.isArray(spRows) && spRows[0] && spRows[0].target_summary) {
            return res.status(200).json({
              success: true,
              config: JSON.parse(spRows[0].target_summary),
              loadedFrom: spRows[0].id
            });
          }
        } catch (e) {}
      }

      const rawKeyList = Array.isArray(userKeys) && userKeys.length > 0 ? [agentId, ...userKeys] : [agentId];
      if (campId && campId !== 'camp_direct') {
        try {
          const cr = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(campId)}&select=user_id,target_summary&limit=1`, {
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
          });
          const crows = await cr.json();
          if (Array.isArray(crows) && crows[0]) {
            if (crows[0].user_id) rawKeyList.unshift(crows[0].user_id);
            if (crows[0].target_summary && String(crows[0].target_summary).startsWith('{')) {
              const cMeta = JSON.parse(crows[0].target_summary);
              if (cMeta.prId) {
                const prR = await fetch(
                  `${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(cMeta.prId)}&limit=1`,
                  { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
                );
                const prRows = await prR.json();
                if (Array.isArray(prRows) && prRows[0] && prRows[0].target_summary) {
                  return res.status(200).json({
                    success: true,
                    config: JSON.parse(prRows[0].target_summary),
                    loadedFrom: prRows[0].id
                  });
                }
              }
            }
          }
        } catch (e) {}
      }

      const safeKeys = Array.from(new Set(rawKeyList.map(k => sanitizeAgentKey(k)).filter(Boolean)));
      if (safeKeys.length === 0) {
        return res.status(200).json({ success: false, config: null });
      }

      const r = await fetch(
        `${supabaseUrl}/rest/v1/meta_campaigns?track=eq.pr_config&order=created_at.desc&limit=300`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
      );
      const rows = await r.json();

      if (Array.isArray(rows) && rows.length > 0) {
        let matched = null;
        for (const sKey of safeKeys) {
          matched = rows.find(row =>
            (row.id === `pr_cfg_${sKey}` && row.cta_type !== 'NOTIFY_ONLY') ||
            (sanitizeAgentKey(row.user_id) === sKey && row.cta_type === 'PR_DEFAULT')
          );
          if (!matched) {
            matched = rows.find(row => sanitizeAgentKey(row.user_id) === sKey && row.cta_type !== 'NOTIFY_ONLY');
          }
          if (matched) break;
        }
        if (matched && matched.target_summary) {
          try {
            return res.status(200).json({ success: true, config: JSON.parse(matched.target_summary), loadedFrom: matched.id });
          } catch (e) {}
        }
      }
      return res.status(200).json({ success: false, config: null });
    }

    // [4] 캠페인 저장
    if (action === 'SAVE_RECORD') {
      const { record } = body;
      if (supabaseKey && record) {
        const cleanUser = sanitizeAgentKey(record.user_id);
        if (!cleanUser) {
          return res.status(200).json({ success: false, error: '로그인 계정을 확인해 주세요.' });
        }
        record.user_id = String(record.user_id).trim().toLowerCase();
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
      const { campaignId, campaignTitle, name, phone, region, note, source, agentId, prId, hasPdf } = body;
      if (!supabaseKey || !name || !phone) {
        return res.status(200).json({ success: false, error: 'Missing name or phone' });
      }

      const cleanCampId = String(campaignId || 'camp_direct').trim();
      const cleanPhone = String(phone || '').trim();
      let resolvedOwner = sanitizeAgentKey(agentId);
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
            const campOwner = sanitizeAgentKey(crows[0].user_id);
            if (campOwner) resolvedOwner = campOwner;
            if (crows[0].title && (!resolvedTitle || resolvedTitle.includes('숨은 병원비'))) {
              resolvedTitle = crows[0].title;
            }
            if (crows[0].track === 'insta' || cleanCampId.startsWith('camp_ig_')) {
              resolvedSource = 'insta_dm_apply';
            }
          }
        } catch (e) {}
      }

      // PR 페이지 직접 공유 링크(pr_id)로 들어온 경우 PR 페이지 소유자 확인
      if (!resolvedOwner && prId) {
        try {
          const prR = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(prId)}&select=user_id&limit=1`, {
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
          });
          const prRows = await prR.json();
          if (Array.isArray(prRows) && prRows[0] && prRows[0].user_id) {
            resolvedOwner = sanitizeAgentKey(prRows[0].user_id);
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

      return res.status(200).json({ ...saveResult, ownerUserId: resolvedOwner });
    }

    // [5] ★ 캠페인 · 나의 광고콘텐츠 · 유입 DB 엄격 격리 조회 (타인 데이터 0% 차단)
    if (action === 'LIST' || action === 'SYNC_LIST') {
      const { userId, userKeys } = body;

      const rawInputKeys = Array.isArray(userKeys) ? [userId, ...userKeys] : [userId];
      const strictKeySet = new Set();

      const addStrictKey = (val) => {
        const raw = String(val || '').trim().toLowerCase().replace(/^@/, '');
        if (!raw || raw === 'default' || raw === 'shared' || raw === 'weracle_user' || raw === 'act_connected' || raw === 'unassigned') return;
        strictKeySet.add(raw);
        const san = sanitizeAgentKey(raw);
        if (san) strictKeySet.add(san);
      };

      rawInputKeys.forEach(addStrictKey);

      // 로그인 식별키가 하나도 없으면 절대 전체 목록을 내려주지 않고 즉시 빈 결과 반환!
      if (strictKeySet.size === 0) {
        return res.status(200).json({ success: true, data: [], leads: [], customAssets: [] });
      }

      let allRows = [];
      try {
        const listRes = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?order=created_at.desc&limit=1000`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        const cData = await listRes.json();
        if (Array.isArray(cData)) allRows = cData;
      } catch (e) {}

      const nonConfigRows = allRows.filter(c => c.track !== 'pr_config' && !String(c.id || '').startsWith('pr_cfg_') && !String(c.id || '').startsWith('pr_page_'));
      const rawCustomAssetRows = [];
      const backupLeadRows = [];
      const allCampaigns = [];

      for (const row of nonConfigRows) {
        if (row.track === 'custom_asset') {
          rawCustomAssetRows.push(row);
        } else if (row.track === 'lead_backup' || String(row.id || '').startsWith('lead_bk_')) {
          try {
            const parsedLead = row.target_summary ? JSON.parse(row.target_summary) : {};
            const rowOwner = sanitizeAgentKey(row.user_id || '');
            const baseNt = String(parsedLead.note || '');
            const taggedNt = (rowOwner && !baseNt.includes('[owner:'))
              ? `${baseNt} [owner:${rowOwner}]`.trim()
              : baseNt;

            backupLeadRows.push({
              id: row.id,
              user_id: rowOwner,
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

      const matchesMyStrictKey = (val) => {
        const cl = String(val || '').trim().toLowerCase().replace(/^@/, '');
        if (!cl || cl === 'default' || cl === 'weracle_user' || cl === 'unassigned') return false;
        const san = sanitizeAgentKey(cl);
        return strictKeySet.has(cl) || (san && strictKeySet.has(san));
      };

      const checkCampaignStrictlyMine = (c) => {
        // 1) 캠페인에 고유 user_id(이메일 등)가 적혀 있으면 오직 그 소유자와 일치할 때만 허용
        const cUserRaw = String(c.user_id || '').trim().toLowerCase();
        if (cUserRaw && cUserRaw !== 'default' && cUserRaw !== 'weracle_user') {
          if (matchesMyStrictKey(cUserRaw)) return true;
        }

        // 2) 과거 테스트 중 user_id가 'default'로 저장된 레코드라도 내 고유 pageId / igId와 정확히 일치할 때만 내 것으로 매칭
        if (c.target_summary && String(c.target_summary).startsWith('{')) {
          try {
            const pObj = JSON.parse(c.target_summary);
            if (pObj.igId && matchesMyStrictKey(pObj.igId)) return true;
            if (pObj.pageId && matchesMyStrictKey(pObj.pageId)) return true;
          } catch (e) {}
        }

        if (c.landing_url) {
          try {
            const uIdx = c.landing_url.indexOf('?');
            if (uIdx >= 0) {
              const sp = new URLSearchParams(c.landing_url.slice(uIdx + 1));
              const urlAgentId = sp.get('agent_id');
              if (urlAgentId && matchesMyStrictKey(urlAgentId)) return true;
            }
          } catch (e) {}
        }

        return false;
      };

      // 나의 광고콘텐츠도 오직 내 키와 일치하는 것만 반환 ('default' 공유 제거)
      const myCustomAssets = [];
      for (const row of rawCustomAssetRows) {
        if (matchesMyStrictKey(row.user_id) && row.target_summary) {
          try {
            const parsedAsset = JSON.parse(row.target_summary);
            if (parsedAsset && parsedAsset.id) myCustomAssets.push(parsedAsset);
          } catch (e) {}
        }
      }

      const myCampaigns = allCampaigns.filter(c => checkCampaignStrictlyMine(c));
      const myCampIdSet = new Set(myCampaigns.map(c => String(c.id)));
      const instaCampIdSet = new Set(myCampaigns.filter(c => c.track === 'insta').map(c => String(c.id)));

      let leads = [];
      try {
        let leadsRes = await fetch(`${supabaseUrl}/rest/v1/meta_leads?order=created_at.desc&limit=800`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        if (!leadsRes.ok) {
          leadsRes = await fetch(`${supabaseUrl}/rest/v1/meta_leads?limit=800`, {
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

        // ★ 유입 DB 엄격 필터: 내 캠페인 고유 ID이거나 내 고유 owner 태그/user_id일 때만 통과, 나머지는 100% 차단(return false)
        leads = dedupedRaw.filter(l => {
          const cId = String(l.campaign_id || '').trim();
          if (cId && cId !== 'camp_direct' && cId !== 'meta_instant' && myCampIdSet.has(cId)) {
            return true;
          }

          if (l.user_id && matchesMyStrictKey(l.user_id)) {
            return true;
          }

          const noteStr = String(l.note || l.answer || '');
          const ownerMatch = noteStr.match(/\[(?:owner|담당):([^\]]+)\]/i);
          if (ownerMatch && ownerMatch[1]) {
            if (matchesMyStrictKey(ownerMatch[1])) return true;
            return false;
          }

          return false;
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
          }, userId);
        }
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
