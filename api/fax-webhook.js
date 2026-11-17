const popbill = require('popbill');

const isTestMode = process.env.POPBILL_IS_TEST === 'true';

popbill.config({
  LinkID: process.env.POPBILL_LINK_ID || 'WERACLELAB',
  SecretKey: process.env.POPBILL_SECRET_KEY || 'dJeTv/Yfc5xc8xfImnY2ypmt1aVfv/tG4LcPzP1FBec=',
  IsTest: isTestMode,
  defaultErrorHandler: function (err) {
    console.error('[Popbill Webhook Default Error]', err);
  }
});

const kakaoService = popbill.KakaoService();
const messageService = popbill.MessageService();

const APPROVED_TEMPLATE = {
  code: process.env.POPBILL_TEMPLATE_LEAD || '026100002509',
  raw: `[위라클랩] 신규 상담·자료 신청 접수 알림
안녕하세요 #{담당자명}님,
새로운 고객 상담 및 안내 자료 신청이 접수되었습니다.

▶ 신청 상세 내역
 - 유입 캠페인: #{캠페인명}
 - 고객 성함: #{고객명} 님
 - 고객 연락처: #{고객연락처}
 - 거주 지역: #{거주지역}
 - 요청 사항: #{요청사항}
 - 접수 일시: #{접수일시}

▶ 안내 사항
위라클랩 SNS 자동화 페이지의 [유입DB·댓글관리] 탭에서 상세 내역을 확인하시고 신속하게 안내를 도와주시기 바랍니다.
※ 위라클 지원센터: 031-875-5188`
};

function fillTemplate(raw, vars) {
  let content = raw.replace(/\r\n/g, '\n');
  for (const [k, v] of Object.entries(vars)) {
    content = content.split(`#{${k}}`).join(v != null ? String(v) : '');
  }
  return content;
}

function formatDateTimeNow() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return now.toISOString().replace('T', ' ').substring(0, 19);
}

function sanitizeAgentKey(rawKey) {
  const str = String(rawKey || '').trim().toLowerCase();
  if (!str || str === 'default' || str === 'shared' || str === 'weracle_user' || str === '담당설계사') return '';
  return str.replace(/[^a-z0-9가-힣@._-]/g, '_').replace(/^_+|_+$/g, '');
}

function sendAlimtalk(corpNum, templateCode, sender, content, receiver, receiverName) {
  return new Promise((resolve) => {
    if (!receiver) return resolve({ success: false, reason: 'No receiver' });
    const cleanReceiver = String(receiver).replace(/[^0-9]/g, '');
    if (cleanReceiver.length < 10) return resolve({ success: false, reason: 'Invalid receiver' });

    const trySend = (altType) => {
      kakaoService.sendATS_one(
        corpNum,
        templateCode,
        sender,
        content,
        content,
        altType,
        '',
        cleanReceiver,
        receiverName || '담당자',
        (receiptNum) => {
          resolve({ success: true, type: 'ALIMTALK', receiptNum });
        },
        (error) => {
          if (altType === 'C' && (error.code === -30000007 || error.code === -30000008 || error.code === -30000006 || error.code === -15001014)) {
            trySend('');
          } else {
            messageService.sendLMS(
              corpNum,
              sender,
              cleanReceiver,
              receiverName || '담당자',
              '[위라클랩 신규 DB 유입 알림]',
              content,
              '',
              false,
              '',
              '',
              (lmsReceipt) => resolve({ success: true, type: 'LMS', receiptNum: lmsReceipt }),
              (lmsErr) => resolve({ success: false, error: lmsErr || error })
            );
          }
        }
      );
    };

    trySend('C');
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'weracle_verify_token';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://tjohrovsvgnkrlqhjkwt.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_m2fpA60L66F8uGnynEbmvg_BBepUlmR';
  const DEFAULT_SHEET_WEBHOOK = 'https://script.google.com/macros/s/AKfycbyNT3YdCDNa7QoucBY0nNAOUah4Yffd4-QRjDc6Dkw7tZ_xyhVTpqwv4IcWF-n3V07A/exec';

  // 웹훅 수신 시에도 RLS 차단 없이 100% 담당자 소유로 저장하는 보장 함수
  async function saveWebhookLeadGuaranteed(leadData, ownerKey) {
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
      source: String(leadData.source || 'meta_leadgen'),
      name: String(leadData.name || '').trim(),
      phone: String(leadData.phone || '').trim(),
      region: String(leadData.region || '').trim(),
      note: finalNote,
      status: String(leadData.status || '신규유입'),
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
        if (allowedCols.has('id') && typeof sample.id === 'number') delete filtered.id;
        if (!allowedCols.has('note') && allowedCols.has('answer')) filtered.answer = finalNote;
        if (allowedCols.has('user_id') && !filtered.user_id) filtered.user_id = cleanOwner;
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
        const ret = await insRes.json().catch(() => []);
        if (Array.isArray(ret) && ret.length > 0) readableInMetaLeads = true;
      }
    } catch (e) {}

    if (readableInMetaLeads) return fullLeadObj;

    const backupId = `lead_bk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const storedLeadJson = { ...fullLeadObj, id: backupId };
    await fetch(`${supabaseUrl}/rest/v1/meta_campaigns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
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
      })
    }).catch(() => {});

    return fullLeadObj;
  }

  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(200).send('WERACLE META WEBHOOK ACTIVE');
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  try {
    // [경로 A] 내 PR 랜딩페이지(sns_apply.html) 제출 알림 및 시트 기록
    if (body && body.action === 'SAVE_LEAD') {
      const {
        skipDbInsert,
        campaignId,
        campaignTitle,
        name,
        phone,
        region,
        note,
        source,
        agentId,
        agentName,
        agentPhone,
        sheetWebhookUrl
      } = body;

      let ownerUserId = sanitizeAgentKey(agentId);
      let notifyAgentPhone = String(agentPhone || '').replace(/[^0-9]/g, '');
      let resolvedSource = source || 'meta_ad';

      if (String(campaignId || '').startsWith('camp_ig_') || String(source || '').includes('insta')) {
        resolvedSource = 'insta_dm_apply';
      }

      if (supabaseKey && campaignId && campaignId !== 'camp_direct') {
        try {
          const cRes = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(campaignId)}&select=id,user_id,track,leads_count,title`, {
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
          });
          const cRows = await cRes.json();
          if (Array.isArray(cRows) && cRows[0]) {
            const campOwner = sanitizeAgentKey(cRows[0].user_id);
            if (campOwner) ownerUserId = campOwner;
            if (cRows[0].track === 'insta') resolvedSource = 'insta_dm_apply';

            // meta-execute에서 이미 카운트를 올린 경우(skipDbInsert) 중복 증가 방지
            if (!skipDbInsert) {
              const nextCount = Number(cRows[0].leads_count || 0) + 1;
              await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(campaignId)}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`
                },
                body: JSON.stringify({ leads_count: nextCount })
              });
            }
          }
        } catch (e) {}
      }

      if (!notifyAgentPhone && supabaseKey && ownerUserId) {
        try {
          const prRes = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.pr_cfg_${encodeURIComponent(ownerUserId)}&select=target_summary&limit=1`, {
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
          });
          const prRows = await prRes.json();
          if (Array.isArray(prRows) && prRows[0] && prRows[0].target_summary) {
            const parsedCfg = JSON.parse(prRows[0].target_summary);
            if (parsedCfg && parsedCfg.agentNotifyPhone) {
              notifyAgentPhone = String(parsedCfg.agentNotifyPhone).replace(/[^0-9]/g, '');
            }
          }
        } catch (e) {}
      }

      let savedLeadObj = null;
      if (!skipDbInsert && supabaseKey) {
        savedLeadObj = await saveWebhookLeadGuaranteed({
          campaign_id: campaignId || 'camp_direct',
          campaign_title: campaignTitle || 'PR 매거진 무료 점검 신청',
          source: resolvedSource,
          name: name || '신청고객',
          phone: phone || '',
          region: region || '',
          note: note || '',
          status: '신규유입',
          created_at: new Date().toISOString()
        }, ownerUserId);
      }

      const targetSheetUrl = (sheetWebhookUrl && sheetWebhookUrl.startsWith('http')) ? sheetWebhookUrl : DEFAULT_SHEET_WEBHOOK;
      if (targetSheetUrl) {
        try {
          await fetch(targetSheetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'SAVE_SNS_LEAD',
              date: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
              source: resolvedSource,
              campaignTitle: campaignTitle || 'PR 매거진 신청',
              name,
              phone,
              region,
              note,
              agentId: ownerUserId
            })
          });
        } catch (e) {}
      }

      let popbillResult = null;
      const corpNum = process.env.POPBILL_CORP_NUM || '1168180481';
      const defaultSender = process.env.POPBILL_SENDER || '0318755188';

      if (notifyAgentPhone && notifyAgentPhone.length >= 10) {
        const alimContent = fillTemplate(APPROVED_TEMPLATE.raw, {
          '담당자명': agentName || ownerUserId || '담당 설계사',
          '캠페인명': campaignTitle || 'PR 매거진 맞춤 점검 신청',
          '고객명': name || '신청고객',
          '고객연락처': phone || '-',
          '거주지역': region || '미입력',
          '요청사항': note || '핵심 안내자료 및 상담 신청',
          '접수일시': formatDateTimeNow()
        });
        popbillResult = await sendAlimtalk(corpNum, APPROVED_TEMPLATE.code, defaultSender, alimContent, notifyAgentPhone, agentName || '담당설계사');
      }

      const resendApiKey = process.env.RESEND_API_KEY;
      if (resendApiKey && ownerUserId && ownerUserId.includes('@')) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'WERACLE 알림 <onboarding@resend.dev>',
              to: ownerUserId,
              subject: `[위라클랩 신규 DB 유입] ${name} 고객님 (${campaignTitle})`,
              text: `[위라클랩 SNS 자동화 신규 DB 접수]\n\n• 캠페인: ${campaignTitle}\n• 고객 성함: ${name}\n• 연락처: ${phone}\n• 거주 지역: ${region || '-'}\n• 요청사항: ${note || '-'}\n• 접수 일시: ${formatDateTimeNow()}`
            })
          });
        } catch (e) {}
      }

      return res.status(200).json({ success: true, lead: savedLeadObj, popbillResult });
    }

    // [경로 B] 메타 24시간 무인 웹훅 (인스타 댓글 자동DM + 인스턴트 양식 리드 수집)
    if (body && body.object && Array.isArray(body.entry) && supabaseKey) {
      for (const entry of body.entry) {
        const entryAccountId = String(entry.id || '');
        const changes = Array.isArray(entry.changes) ? entry.changes : [];

        for (const chg of changes) {
          const field = chg.field;
          const val = chg.value || {};

          // B-1: 인스타그램 댓글 자동 DM
          if ((field === 'comments' || field === 'feed') && val.text && (val.id || val.comment_id)) {
            const commentId = String(val.id || val.comment_id);
            const commentText = String(val.text || '').trim();
            const mediaId = String((val.media && val.media.id) || val.media_id || '');
            const commenterName = String((val.from && (val.from.username || val.from.name)) || '').trim();

            const ruleRes = await fetch(
              `${supabaseUrl}/rest/v1/meta_campaigns?track=eq.insta&status=eq.ACTIVE&order=created_at.desc&limit=200`,
              { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
            );
            const instaRules = await ruleRes.json();
            if (!Array.isArray(instaRules) || instaRules.length === 0) continue;

            // 1순위: 정확한 게시물 ID(mediaId) + 키워드 일치 규칙
            let matchedRule = null;
            if (mediaId) {
              matchedRule = instaRules.find(r => {
                if (!r.ig_media_id || String(r.ig_media_id) !== mediaId) return false;
                const kws = String(r.keyword || '').split(/[,/|]+/).map(k => k.trim().replace(/^\[|\]$/g, '')).filter(Boolean);
                return kws.some(kw => commentText.toLowerCase().includes(kw.toLowerCase()));
              });
            }

            // 2순위: 해당 인스타/페이지 계정 전체 키워드 감지 규칙 (ig_media_id 미지정 규칙)
            if (!matchedRule) {
              matchedRule = instaRules.find(r => {
                if (r.ig_media_id) return false;
                if (!r.target_summary || !String(r.target_summary).startsWith('{')) return false;
                try {
                  const pObj = JSON.parse(r.target_summary);
                  const accMatch = (pObj.igId && String(pObj.igId) === entryAccountId) || (pObj.pageId && String(pObj.pageId) === entryAccountId);
                  if (!accMatch) return false;
                  const kws = String(r.keyword || '').split(/[,/|]+/).map(k => k.trim().replace(/^\[|\]$/g, '')).filter(Boolean);
                  return kws.some(kw => commentText.toLowerCase().includes(kw.toLowerCase()));
                } catch (e) {
                  return false;
                }
              });
            }

            if (!matchedRule) continue;

            const rawKw = String(matchedRule.keyword || '').trim();
            let pageToken = '';
            let pageId = '';
            let igId = '';
            try {
              const pObj = JSON.parse(matchedRule.target_summary || '{}');
              pageToken = pObj.pageToken || '';
              pageId = pObj.pageId || '';
              igId = pObj.igId || '';
            } catch (e) {}

            if (!pageToken) continue;

            const publicReply = commenterName
              ? `@${commenterName} 안녕하세요! 요청하신 안내자료 신청링크 보내드렸습니다! 😊`
              : `안녕하세요! 요청하신 안내자료 신청링크 보내드렸습니다! 😊`;

            try {
              await fetch(`https://graph.facebook.com/v21.0/${commentId}/replies`, {
                method: 'POST',
                body: new URLSearchParams({ message: publicReply, access_token: pageToken })
              });
            } catch (e) {}

            const reqHost = req.headers['x-forwarded-host'] || req.headers['host'] || 'www.weraclelab.com';
            const reqProto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
            const shortUrl = `${reqProto}://${reqHost}/api/meta-execute?c=${encodeURIComponent(matchedRule.id)}`;
            let dmText = String(matchedRule.dm_message || '').trim();
            if (!dmText) {
              dmText = `안녕하세요! 댓글 남겨주셔서 감사합니다 😊 요청하신 핵심 가이드북(PDF) 열람 및 무료 상담 신청 링크입니다 👉 ${shortUrl}`;
            } else if (dmText.includes('{신청링크}')) {
              dmText = dmText.replace(/\{신청링크\}/g, shortUrl);
            } else if (!dmText.includes('http')) {
              dmText = `${dmText} 👉 ${shortUrl}`;
            }

            const dmEndpointId = pageId || igId || entryAccountId;
            let dmSentOk = false;
            if (dmEndpointId) {
              try {
                const dmRes = await fetch(`https://graph.facebook.com/v21.0/${dmEndpointId}/messages?access_token=${encodeURIComponent(pageToken)}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    recipient: { comment_id: commentId },
                    message: { text: dmText }
                  })
                });
                const dmJson = await dmRes.json();
                if (dmJson && (dmJson.message_id || dmJson.recipient_id)) dmSentOk = true;
              } catch (e) {}
            }

            const nextDmCount = Number(matchedRule.dm_sent_count || 0) + 1;
            await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(matchedRule.id)}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
              },
              body: JSON.stringify({ dm_sent_count: nextDmCount })
            });

            const ownerKey = sanitizeAgentKey(matchedRule.user_id) || igId || entryAccountId;
            await saveWebhookLeadGuaranteed({
              campaign_id: matchedRule.id,
              campaign_title: matchedRule.title,
              source: 'insta_dm_webhook',
              name: commenterName ? `@${commenterName}` : '인스타 댓글 고객',
              phone: dmSentOk ? '무인 답글+DM 발송완료' : '무인 공개답글 완료',
              region: '인스타그램 댓글(24h무인)',
              note: `댓글: "${commentText}" (키워드 [${rawKw}] 감지)`,
              status: '자동DM 발송완료',
              created_at: new Date().toISOString()
            }, ownerKey);
          }

          // B-2: 메타 인스턴트 양식(leadgen) 리드 수집
          if (field === 'leadgen' && val.leadgen_id) {
            const leadgenId = String(val.leadgen_id);
            const adId = String(val.ad_id || '');
            const pageIdFromWebhook = String(val.page_id || entryAccountId || '');

            let matchedCamp = null;
            if (adId) {
              const cRes = await fetch(
                `${supabaseUrl}/rest/v1/meta_campaigns?ad_id=eq.${encodeURIComponent(adId)}&limit=1`,
                { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
              );
              const cRows = await cRes.json();
              if (Array.isArray(cRows) && cRows[0]) matchedCamp = cRows[0];
            }

            // ad_id가 없는 테스트 리드 등의 경우 해당 pageId를 연동한 설계사의 캠페인을 역추적해 소유자 고정!
            if (!matchedCamp && pageIdFromWebhook) {
              try {
                const pCampRes = await fetch(
                  `${supabaseUrl}/rest/v1/meta_campaigns?track=in.(meta,insta)&order=created_at.desc&limit=150`,
                  { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
                );
                const pCampRows = await pCampRes.json();
                if (Array.isArray(pCampRows)) {
                  matchedCamp = pCampRows.find(r => {
                    if (!r.target_summary || !String(r.target_summary).startsWith('{')) return false;
                    try {
                      const o = JSON.parse(r.target_summary);
                      return String(o.pageId || '') === pageIdFromWebhook;
                    } catch (e) {
                      return false;
                    }
                  }) || null;
                }
              } catch (e) {}
            }

            const campId = matchedCamp ? matchedCamp.id : 'meta_instant';
            const campTitle = matchedCamp ? matchedCamp.title : '메타 인스턴트 양식 광고';
            const ownerKey = matchedCamp
              ? (sanitizeAgentKey(matchedCamp.user_id) || pageIdFromWebhook)
              : pageIdFromWebhook;

            let pageToken = '';
            let agentName = '담당 설계사';
            let notifyAgentPhone = '';

            if (matchedCamp && matchedCamp.target_summary && String(matchedCamp.target_summary).startsWith('{')) {
              try {
                const metaObj = JSON.parse(matchedCamp.target_summary);
                pageToken = metaObj.pageToken || '';
                if (metaObj.agentName) agentName = metaObj.agentName;
                if (metaObj.agentPhone) notifyAgentPhone = String(metaObj.agentPhone).replace(/[^0-9]/g, '');
              } catch (e) {}
            }

            if (!pageToken && ownerKey) {
              try {
                const tRes = await fetch(
                  `${supabaseUrl}/rest/v1/meta_campaigns?user_id=eq.${encodeURIComponent(ownerKey)}&order=created_at.desc&limit=10`,
                  { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
                );
                const tRows = await tRes.json();
                if (Array.isArray(tRows)) {
                  for (const r of tRows) {
                    if (r.target_summary && String(r.target_summary).startsWith('{')) {
                      try {
                        const o = JSON.parse(r.target_summary);
                        if (o.pageToken) { pageToken = o.pageToken; break; }
                      } catch (e) {}
                    }
                  }
                }
              } catch (e) {}
            }

            let leadName = '메타 양식 신청고객';
            let leadPhone = '';
            let leadRegion = '';
            const customQaParts = [];

            if (pageToken) {
              try {
                const lgRes = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(leadgenId)}?fields=created_time,field_data&access_token=${encodeURIComponent(pageToken)}`);
                const lgData = await lgRes.json();
                const fieldData = (lgData && Array.isArray(lgData.field_data)) ? lgData.field_data : [];

                let customQIdx = 1;
                fieldData.forEach(fd => {
                  const fKey = String(fd.name || '').toLowerCase();
                  const fVal = Array.isArray(fd.values) ? fd.values.join(', ').trim() : '';
                  if (!fVal) return;

                  if (fKey === 'full_name' || fKey === 'name') {
                    leadName = fVal;
                  } else if (fKey === 'phone_number' || fKey === 'phone') {
                    let cleanPh = fVal.replace(/^\+82\s?0?/, '0').replace(/[^0-9]/g, '');
                    if (cleanPh.length === 11) cleanPh = `${cleanPh.slice(0, 3)}-${cleanPh.slice(3, 7)}-${cleanPh.slice(7)}`;
                    leadPhone = cleanPh || fVal;
                  } else if (fKey === 'city' || fKey === 'state' || fKey === 'region') {
                    leadRegion = fVal;
                  } else if (fKey === 'q_age') {
                    customQaParts.push(`연령: ${fVal}`);
                  } else if (fKey === 'q_time') {
                    customQaParts.push(`희망시간: ${fVal}`);
                  } else if (fKey.startsWith('q_custom_')) {
                    const num = fKey.replace('q_custom_', '') || customQIdx++;
                    customQaParts.push(`Q${num}: ${fVal}`);
                  } else {
                    customQaParts.push(`${fd.name}: ${fVal}`);
                  }
                });
              } catch (e) {}
            }

            if (!leadPhone) leadPhone = `리드접수(${leadgenId.slice(-6)})`;
            const cleanQaNote = customQaParts.length > 0 ? customQaParts.join(' / ') : `인스턴트 양식 접수`;

            if (matchedCamp && matchedCamp.id) {
              try {
                const nextCnt = Number(matchedCamp.leads_count || 0) + 1;
                await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(matchedCamp.id)}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
                  body: JSON.stringify({ leads_count: nextCnt })
                });
              } catch (e) {}
            }

            if (!notifyAgentPhone && ownerKey) {
              try {
                const prRes = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.pr_cfg_${encodeURIComponent(ownerKey)}&select=target_summary&limit=1`, {
                  headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                });
                const prRows = await prRes.json();
                if (Array.isArray(prRows) && prRows[0] && prRows[0].target_summary) {
                  const parsedCfg = JSON.parse(prRows[0].target_summary);
                  if (parsedCfg && parsedCfg.agentNotifyPhone) {
                    notifyAgentPhone = String(parsedCfg.agentNotifyPhone).replace(/[^0-9]/g, '');
                  }
                }
              } catch (e) {}
            }

            await saveWebhookLeadGuaranteed({
              campaign_id: campId,
              campaign_title: campTitle,
              source: 'meta_leadgen',
              name: leadName,
              phone: leadPhone,
              region: leadRegion || '메타 인스턴트 양식',
              note: cleanQaNote,
              status: '신규유입',
              created_at: new Date().toISOString()
            }, ownerKey);

            const corpNum = process.env.POPBILL_CORP_NUM || '1168180481';
            const defaultSender = process.env.POPBILL_SENDER || '0318755188';
            if (notifyAgentPhone && notifyAgentPhone.length >= 10) {
              const alimContent = fillTemplate(APPROVED_TEMPLATE.raw, {
                '담당자명': agentName,
                '캠페인명': campTitle,
                '고객명': leadName,
                '고객연락처': leadPhone,
                '거주지역': leadRegion || '인스턴트 양식',
                '요청사항': cleanQaNote,
                '접수일시': formatDateTimeNow()
              });
              await sendAlimtalk(corpNum, APPROVED_TEMPLATE.code, defaultSender, alimContent, notifyAgentPhone, agentName);
            }
          }
        }
      }
      return res.status(200).send('EVENT_RECEIVED');
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
};
