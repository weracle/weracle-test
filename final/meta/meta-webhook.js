const popbill = require('popbill');

// 팝빌 연동 설정
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

// ★ 신규 승인 완료된 정식 알림톡 템플릿 (코드: 026100002509)
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

// 11개 인자 팝빌 알림톡 발송 함수 (+ LMS 폴백)
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
    // =========================================================================
    // [경로 A] 내 PR 랜딩페이지(sns_apply.html)에서 고객이 신청서를 제출했을 때
    // =========================================================================
    if (body && body.action === 'SAVE_LEAD') {
      const {
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

      let ownerUserId = String(agentId || '').trim().toLowerCase() || 'default';
      let notifyAgentPhone = String(agentPhone || '').replace(/[^0-9]/g, '');
      let resolvedSource = source || 'meta_ad';

      if (String(campaignId || '').startsWith('camp_ig_') || String(source || '').includes('insta')) {
        resolvedSource = 'insta_dm_apply';
      }

      // 1. 캠페인 정보 조회하여 담당 설계사(user_id) 확인 및 유입 DB 카운트 +1 증가
      if (supabaseKey && campaignId && campaignId !== 'camp_direct') {
        try {
          const cRes = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.${encodeURIComponent(campaignId)}&select=id,user_id,track,leads_count,title`, {
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
          });
          const cRows = await cRes.json();
          if (Array.isArray(cRows) && cRows[0]) {
            if (cRows[0].user_id && (ownerUserId === 'default' || ownerUserId === 'weracle_user')) {
              ownerUserId = String(cRows[0].user_id).trim().toLowerCase();
            }
            if (cRows[0].track === 'insta') {
              resolvedSource = 'insta_dm_apply';
            }
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
        } catch (e) {}
      }

      // 수파베이스에 저장된 해당 설계사의 PR 설정에서 알림 번호 자동 조회
      if (!notifyAgentPhone && supabaseKey && ownerUserId && ownerUserId !== 'default') {
        try {
          const cleanKey = ownerUserId.replace(/[^a-z0-9@._-]/g, '_');
          const prRes = await fetch(`${supabaseUrl}/rest/v1/meta_campaigns?id=eq.pr_cfg_${encodeURIComponent(cleanKey)}&select=target_summary&limit=1`, {
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

      // 2. 수파베이스 meta_leads 테이블에 소유자 태그([owner:이메일])와 함께 저장
      const ownerTag = `[owner:${ownerUserId}]`;
      const newLeadRecord = {
        campaign_id: campaignId || 'camp_direct',
        campaign_title: campaignTitle || 'PR 매거진 무료 점검 신청',
        source: resolvedSource,
        name: name || '신청고객',
        phone: phone || '',
        region: region || '',
        note: `${note || ''} ${ownerTag}`.trim(),
        status: '신규유입',
        created_at: new Date().toISOString()
      };

      if (supabaseKey) {
        await fetch(`${supabaseUrl}/rest/v1/meta_leads`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(newLeadRecord)
        });
      }

      // 3. 구글 시트 웹훅 기록
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

      // ★ 4. 팝빌(Popbill) 정식 승인 알림톡(026100002509)으로 담당 설계사에게 즉시 카톡 알림 발송
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

      // 5. Resend 이메일 알림 동시 발송
      const resendApiKey = process.env.RESEND_API_KEY;
      if (resendApiKey && ownerUserId.includes('@')) {
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

      return res.status(200).json({ success: true, lead: newLeadRecord, popbillResult });
    }

    // =========================================================================
    // [경로 B] 메타 서버가 보내는 24시간 무인 웹훅 (PC 꺼져 있을 때도 1초 만에 작동)
    // =========================================================================
    if (body && body.object && Array.isArray(body.entry) && supabaseKey) {
      for (const entry of body.entry) {
        const entryAccountId = String(entry.id || '');
        const changes = Array.isArray(entry.changes) ? entry.changes : [];

        for (const chg of changes) {
          const field = chg.field;
          const val = chg.value || {};

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

            const matchedRule = instaRules.find(r => {
              if (mediaId && r.ig_media_id && String(r.ig_media_id) === mediaId) return true;
              if (r.target_summary && String(r.target_summary).startsWith('{')) {
                try {
                  const pObj = JSON.parse(r.target_summary);
                  if (pObj.igId && String(pObj.igId) === entryAccountId) return true;
                  if (pObj.pageId && String(pObj.pageId) === entryAccountId) return true;
                } catch (e) {}
              }
              return false;
            });

            if (!matchedRule) continue;

            const rawKw = String(matchedRule.keyword || '').trim();
            const keywords = rawKw.split(/[,/|]+/).map(k => k.trim().replace(/^\[|\]$/g, '')).filter(Boolean);
            const isKwMatched = keywords.some(kw => commentText.toLowerCase().includes(kw.toLowerCase()));
            if (!isKwMatched) continue;

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

            const ownerKey = String(matchedRule.user_id || igId || 'default').trim().toLowerCase();
            await fetch(`${supabaseUrl}/rest/v1/meta_leads`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({
                campaign_id: matchedRule.id,
                campaign_title: matchedRule.title,
                source: 'insta_dm_webhook',
                name: commenterName ? `@${commenterName}` : '인스타 댓글 고객',
                phone: dmSentOk ? '무인 답글+DM 발송완료' : '무인 공개답글 완료',
                region: '인스타그램 댓글(24h무인)',
                note: `댓글: "${commentText}" (키워드 [${rawKw}] 감지) [owner:${ownerKey}]`,
                status: '자동DM 발송완료',
                created_at: new Date().toISOString()
              })
            });
          }

          if (field === 'leadgen' && val.leadgen_id) {
            const leadgenId = String(val.leadgen_id);
            const adId = String(val.ad_id || '');

            let matchedCamp = null;
            if (adId) {
              const cRes = await fetch(
                `${supabaseUrl}/rest/v1/meta_campaigns?ad_id=eq.${encodeURIComponent(adId)}&limit=1`,
                { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
              );
              const cRows = await cRes.json();
              if (Array.isArray(cRows) && cRows[0]) matchedCamp = cRows[0];
            }

            const campId = matchedCamp ? matchedCamp.id : 'meta_instant';
            const campTitle = matchedCamp ? matchedCamp.title : '메타 인스턴트 양식 광고';
            const ownerKey = matchedCamp ? String(matchedCamp.user_id || 'default').toLowerCase() : 'default';

            await fetch(`${supabaseUrl}/rest/v1/meta_leads`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({
                campaign_id: campId,
                campaign_title: campTitle,
                source: 'meta_leadgen',
                name: '메타 양식 제출 고객',
                phone: `리드ID: ${leadgenId}`,
                region: '메타 인스턴트 폼',
                note: `광고ID: ${adId} [owner:${ownerKey}]`,
                status: '신규유입',
                created_at: new Date().toISOString()
              })
            });
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
