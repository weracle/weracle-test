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

// 팝빌 승인 카카오 알림톡 템플릿 (팩스 성공: 026100002384, 팩스 실패: 026100002386)
const TEMPLATES = {
  SUCCESS: {
    code: '026100002384',
    raw: `[위라클] 보험금 청구서 팩스 전송 성공 알림
안녕하세요 #{담당자명}님,
위라클 보상케어 지원센터입니다.
#{고객명}님의 보험금 청구 건이
#{보험사명}(으)로 성공적으로 전송 완료되었습니다.
▶ 팩스 전송 상세 내역
 - 고객(피보험자): #{고객명} 님
 - 접수 보험사: #{보험사명}
 - 발신 팩스번호: #{발신팩스번호}
 - 수신 팩스번호: #{수신팩스번호}
 - 전송 완료일시: #{전송완료일시}
 - 전송 페이지수: #{페이지수}장 (청구서 및 구비서류)
▶ 보험사 접수 확인 방법
#{보험사명} 보상 콜센터(#{콜센터번호})에 [발신팩스번호]와 [전송완료일시]를 말씀하시면 신속하게 접수 조회가 가능합니다.
▶ 위라클 보상 분쟁 케어 지원 안내
실손 및 정액 담보 청구 후 보험사 현장심사(손사 조사)가 배정되거나 부지급 안내를 받으셨다면, 위라클 전담 전문가와 즉시 상담하여 정당한 권리를 보호받으세요!
※ 위라클 보상지원센터: 031-875-5188`
  },
  FAIL: {
    code: '026100002386',
    raw: `[위라클] 보험금 청구서 팩스 전송 실패 안내
안녕하세요 #{담당자명}님,
위라클 보상케어 지원센터입니다.
#{고객명}님의 보험금 청구서류 전송 중 통신 회선 장애로 인해 전송이 완료되지 못했습니다.
▶ 실패 상세 내역
 - 고객(피보험자): #{고객명} 님
 - 대상 보험사: #{보험사명}
 - 수신 팩스번호: #{수신팩스번호}
 - 전송 실패일시: #{전송실패일시}
 - 실패 사유: #{실패사유} (예: 팩스 응답 없음, 통화 중)
▶ 조치 방법 안내
보험사 팩스 서버 지연 또는 통화 중일 가능성이 높습니다. 잠시 후 위라클 청구 시스템에서 [재전송]을 시도하시거나, 해당 보상과 개인 팩스번호로 직접 재발송해 주시기 바랍니다.
※ 고객센터 문의: 031-875-5188`
  }
};

function fillTemplate(raw, vars) {
  let content = raw.replace(/\r\n/g, '\n');
  for (const [k, v] of Object.entries(vars)) {
    content = content.split(`#{${k}}`).join(v != null ? String(v) : '');
  }
  return content;
}

function formatDateTime(dStr) {
  if (!dStr) {
    const now = new Date(Date.now() + 9 * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }
  const clean = String(dStr).replace(/[^0-9]/g, '');
  if (clean.length === 14) {
    return `${clean.substring(0, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)} ${clean.substring(8, 10)}:${clean.substring(10, 12)}:${clean.substring(12, 14)}`;
  }
  return String(dStr);
}

function formatPhoneNumber(num) {
  if (!num) return '';
  const clean = String(num).replace(/[^0-9]/g, '');
  if (clean.length === 11) return `${clean.substring(0, 3)}-${clean.substring(3, 7)}-${clean.substring(7)}`;
  if (clean.length === 10) {
    if (clean.startsWith('02')) return `${clean.substring(0, 2)}-${clean.substring(2, 6)}-${clean.substring(6)}`;
    return `${clean.substring(0, 3)}-${clean.substring(3, 6)}-${clean.substring(6)}`;
  }
  if (clean.length === 9 && clean.startsWith('02')) return `${clean.substring(0, 2)}-${clean.substring(2, 5)}-${clean.substring(5)}`;
  if (clean.length === 8) return `${clean.substring(0, 4)}-${clean.substring(4)}`;
  return num;
}

function getFailReason(resultCode) {
  const code = Number(resultCode);
  switch (code) {
    case 1:
    case 101: return '수신처 팩스 응답 없음 (무응답)';
    case 2:
    case 102: return '통신 회선 통화 중';
    case 3:
    case 103: return '팩스 전송 중 통신 단절';
    case 4:
    case 104: return '결번 또는 착신 거부';
    default: return '통신망 응답 없음 또는 회선 지연';
  }
}

// 팩스 전송 원본 메타데이터 조회
async function getFaxMeta(receiptNum) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://tjohrovsvgnkrlqhjkwt.supabase.co";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_m2fpA60L66F8uGnynEbmvg_BBepUlmR";
    
    const res = await fetch(`${url}/rest/v1/partners_settings?key=eq.fax_${receiptNum}`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    if (!res.ok) return null;
    const list = await res.json();
    return (list && list.length > 0) ? list[0].value : null;
  } catch (err) {
    console.warn('[getFaxMeta Error]', err.message);
    return null;
  }
}

// 알림톡 발송 (대체문자 폴백 지원)
function sendAlimtalk(corpNum, templateCode, sender, content, receiver, receiverName) {
  return new Promise((resolve) => {
    if (!receiver) {
      console.warn('[Webhook Alimtalk] 수신자 휴대폰 번호가 없습니다.');
      return resolve({ success: false, reason: 'No receiver' });
    }
    const cleanReceiver = String(receiver).replace(/[^0-9]/g, '');
    if (!cleanReceiver || cleanReceiver.length < 10) {
      return resolve({ success: false, reason: 'Invalid receiver' });
    }

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
          console.log(`[Webhook Alimtalk Success] 코드: ${templateCode}, 접수번호: ${receiptNum}`);
          resolve({ success: true, receiptNum });
        },
        (error) => {
          console.warn(`[Webhook Alimtalk Attempt Warning] 코드: ${templateCode}, 에러: ${error.code} - ${error.message}`);
          if (altType === 'C' && (error.code === -30000007 || error.code === -30000008 || error.code === -30000006 || error.code === -15001014)) {
            trySend('');
          } else {
            resolve({ success: false, error });
          }
        }
      );
    };

    trySend('C');
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Meta Webhook 검증 및 헬스체크 GET 지원 (하이브리드 호환)
  if (req.method === 'GET') {
    const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'weracle_verify_token';
    const mode = req.query?.['hub.mode'];
    const token = req.query?.['hub.verify_token'];
    const challenge = req.query?.['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(200).json({ status: 'ok', service: 'weracle-fax-webhook' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ result: 'FAIL', message: 'Method Not Allowed' });
  }

  try {
    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        payload = {};
      }
    }

    // 팝빌 웹훅은 단일 객체 또는 배열로 전송됨
    const item = Array.isArray(payload) ? payload[0] : payload;
    console.log('[Popbill Webhook Received]', JSON.stringify(item));

    if (!item) {
      return res.status(200).json({ result: 'OK', message: 'Empty payload' });
    }

    // =========================================================================
    // [경로 A] 팝빌 팩스 결과 웹훅 처리 (표준)
    // =========================================================================
    const receiptNum = item.receiptNum || item.receipt_num;
    const state = item.state; // 3: 성공, 4: 실패
    const sendNum = item.sendNum || item.send_num;
    const receiveNum = item.receiveNum || item.receive_num;
    const receiveName = item.receiveName || item.receive_name;
    const totalPages = item.sendPageCnt || item.successPageCnt || item.pageCount || 1;
    const resultTime = item.resultDT || item.sendDT || item.eventDT || item.sendDate || item.resultDate || item.eventTime;
    const resultCode = item.result;

    if (receiptNum) {
      const corpNum = process.env.POPBILL_CORP_NUM || '1168180481';
      const defaultSender = process.env.POPBILL_SENDER || '0318755188';

      // 저장해둔 팩스 발송 원본 메타데이터 조회
      const meta = await getFaxMeta(receiptNum);
      const plannerPhone = meta?.plannerPhone;
      const plannerName = meta?.plannerName || '담당자';
      const clientName = meta?.clientName || '고객';
      const companyName = meta?.companyName || receiveName || '보험사';
      const callCenter = meta?.callCenter || '대표 콜센터';
      const finalPages = totalPages || meta?.pageCount || 1;
      const senderFax = formatPhoneNumber(sendNum || meta?.sender || defaultSender);
      const targetFax = formatPhoneNumber(receiveNum || meta?.receiverNumber || '');
      const completionDate = formatDateTime(resultTime);

      // [상태 3: 전송 성공] 알림톡 템플릿 2 (026100002384) 발송
      if (String(state) === '3') {
        if (plannerPhone) {
          const successContent = fillTemplate(TEMPLATES.SUCCESS.raw, {
            '담당자명': plannerName,
            '고객명': clientName,
            '보험사명': companyName,
            '발신팩스번호': senderFax,
            '수신팩스번호': targetFax,
            '전송완료일시': completionDate,
            '페이지수': finalPages,
            '콜센터번호': callCenter
          });
          await sendAlimtalk(corpNum, TEMPLATES.SUCCESS.code, defaultSender, successContent, plannerPhone, plannerName);
        }
      }
      // [상태 4: 전송 실패] 알림톡 템플릿 3 (026100002386) 발송
      else if (String(state) === '4') {
        if (plannerPhone) {
          const failReason = getFailReason(resultCode);
          const failContent = fillTemplate(TEMPLATES.FAIL.raw, {
            '담당자명': plannerName,
            '고객명': clientName,
            '보험사명': companyName,
            '수신팩스번호': targetFax,
            '전송실패일시': completionDate,
            '실패사유': failReason
          });
          await sendAlimtalk(corpNum, TEMPLATES.FAIL.code, defaultSender, failContent, plannerPhone, plannerName);
        }
      }

      // ★ 팝빌 공식 웹훅 표준 응답 규격: 반드시 {"result": "OK"} 반환
      return res.status(200).json({ result: 'OK' });
    }

    // =========================================================================
    // [경로 B] 혹시 Meta 요청(SAVE_LEAD 또는 entry)이 이 엔드포인트로 들어온 경우 호환 처리
    // =========================================================================
    if (item.action === 'SAVE_LEAD' || item.entry || item.object === 'page') {
      try {
        const metaHandler = require('./meta-webhook.js');
        if (typeof metaHandler === 'function') {
          return await metaHandler(req, res);
        }
      } catch (me) {
        console.warn('[Meta Webhook Delegate Notice]', me.message);
      }
      return res.status(200).send('EVENT_RECEIVED');
    }

    // 팝빌 헬스체크/핑 등 기타 호출에 대해 표준 {"result": "OK"} 응답
    return res.status(200).json({ result: 'OK' });
  } catch (err) {
    console.error('[Fax Webhook Server Error]', err);
    // 팝빌 반복 실패 및 재전송 방지를 위해 HTTP 200과 {"result": "OK"} 반환
    return res.status(200).json({ result: 'OK', error: err.message });
  }
};
