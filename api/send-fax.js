const popbill = require('popbill');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 팝빌 연동 설정 (실발송 모드: IsTest = false)
const isTestMode = process.env.POPBILL_IS_TEST === 'true';

popbill.config({
  LinkID: process.env.POPBILL_LINK_ID || 'WERACLELAB',
  SecretKey: process.env.POPBILL_SECRET_KEY || 'dJeTv/Yfc5xc8xfImnY2ypmt1aVfv/tG4LcPzP1FBec=',
  IsTest: isTestMode,
  defaultErrorHandler: function(err) {
    console.error('[Popbill Default Error]', err);
  }
});

const faxService = popbill.FaxService();
const kakaoService = popbill.KakaoService();

// 팝빌 승인 카카오 알림톡 템플릿
const TEMPLATES = {
  ING: {
    code: '026100002382',
    raw: `[위라클] 보험금 청구서 팩스 발송 접수 안내
안녕하세요 #{담당자명}님,
위라클 보상케어 지원센터입니다.
위라클 시스템을 통해 접수된 #{고객명}님의 보험금 청구 서류를 #{보험사명}(으)로 안전하게 전송하고 있습니다.
■ 고객(피보험자): #{고객명} 님
■ 접수 보험사: #{보험사명}
■ 발송 페이지: 총 #{페이지수}장 (서류 첨부 포함)
■ 팩스 접수번호: #{접수번호}
통신사 팩스망을 통해 전송이 완료되는 즉시(약 3~5분 소요), 최종 전송 결과 알림톡을 다시 안내해 드리겠습니다.
※ 문의: 위라클 고객지원센터 031-875-5188`
  }
};

function fillTemplate(raw, vars) {
  let content = raw.replace(/\r\n/g, '\n');
  for (const [k, v] of Object.entries(vars)) {
    content = content.split(`#{${k}}`).join(v != null ? String(v) : '');
  }
  return content;
}

// 알림톡 발송 헬퍼 (SMS 대체문자 발신번호 미등록 시 일반 알림톡으로 자동 폴백)
function sendAlimtalk(corpNum, templateCode, sender, content, receiver, receiverName) {
  return new Promise((resolve) => {
    if (!receiver) {
      console.warn('[Alimtalk] 수신자 휴대폰 번호가 없어 발송을 건너뜁니다.');
      return resolve({ success: false, reason: 'No receiver' });
    }
    const cleanReceiver = String(receiver).replace(/[^0-9]/g, '');
    if (!cleanReceiver) {
      console.warn('[Alimtalk] 유효하지 않은 수신자 휴대폰 번호입니다.');
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
          console.log(`[Alimtalk Success] 코드: ${templateCode}, 접수번호: ${receiptNum}, 수신: ${cleanReceiver}`);
          resolve({ success: true, receiptNum });
        },
        (error) => {
          console.warn(`[Alimtalk Attempt Warning] 코드: ${templateCode}, 에러: ${error.code} - ${error.message}`);
          // 발신번호 미등록(-30000007, -30000008, -30000006) 시 대체문자 없이 순수 알림톡으로 재전송
          if (altType === 'C' && (error.code === -30000007 || error.code === -30000008 || error.code === -30000006)) {
            console.log('[Alimtalk] 대체문자 없이 순수 알림톡으로 재시도합니다...');
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

// 팩스 전송 메타데이터 저장 (웹훅에서 알림톡 발송 시 고객명, 보험사명, 설계사 연락처 참조용)
async function saveFaxMeta(receiptNum, meta) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://tjohrovsvgnkrlqhjkwt.supabase.co";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_m2fpA60L66F8uGnynEbmvg_BBepUlmR";
    
    await fetch(`${url}/rest/v1/partners_settings`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        key: `fax_${receiptNum}`,
        value: meta,
        description: `팩스 발송 메타데이터 (${meta.clientName || '고객'} - ${meta.companyName || '보험사'})`
      })
    });
  } catch (err) {
    console.warn('[saveFaxMeta Notice]', err.message);
  }
}

module.exports = async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  let tempFilePath = null;

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (pe) {
        return res.status(400).json({ success: false, message: 'Invalid JSON body' });
      }
    }

    const {
      receiverNumber,
      receiverName,
      pdfBase64,
      senderNumber,
      plannerPhone,
      plannerName,
      clientName,
      companyName,
      callCenter,
      pageCount
    } = body || {};

    if (!receiverNumber || !pdfBase64) {
      return res.status(400).json({ 
        success: false, 
        message: '필수 전송 정보가 누락되었습니다. (수신번호 또는 PDF 데이터 누락)' 
      });
    }

    // 파일 생성 (/tmp 경로)
    tempFilePath = path.join(os.tmpdir(), `claim_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`);
    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '').trim();
    const pdfBuffer = Buffer.from(cleanBase64, 'base64');
    fs.writeFileSync(tempFilePath, pdfBuffer);

    const corpNum = process.env.POPBILL_CORP_NUM || '1168180481';
    const sender = senderNumber || process.env.POPBILL_SENDER || '0318755188';
    const cleanReceiver = receiverNumber.replace(/[^0-9]/g, '');

    faxService.sendFAX(
      corpNum,
      sender,
      cleanReceiver,
      receiverName || '보험금청구담당자',
      [tempFilePath], // file array
      '', // reserveDT (즉시 전송)
      '', // UserID
      '', // SenderName
      false, // AdsYN
      '보험금청구서류', // Title
      '', // RequestNum
      async (receiptNum) => {
        try {
          if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        } catch(e){}

        // 1. 웹훅 콜백 및 결과 조회를 위한 메타데이터 저장
        const meta = {
          receiptNum,
          plannerPhone: plannerPhone || '',
          plannerName: plannerName || '담당자',
          clientName: clientName || '고객',
          companyName: companyName || receiverName || '보험사',
          callCenter: callCenter || '대표번호',
          pageCount: pageCount || 1,
          sender: sender,
          receiverNumber: cleanReceiver,
          createdAt: new Date().toISOString()
        };
        await saveFaxMeta(receiptNum, meta);

        // 2. [템플릿 1: 접수 안내 026100002382] 카카오 알림톡 자동 전송
        if (plannerPhone) {
          try {
            const alimContent = fillTemplate(TEMPLATES.ING.raw, {
              '담당자명': meta.plannerName,
              '고객명': meta.clientName,
              '보험사명': meta.companyName,
              '페이지수': meta.pageCount,
              '접수번호': receiptNum
            });
            await sendAlimtalk(corpNum, TEMPLATES.ING.code, sender, alimContent, plannerPhone, meta.plannerName);
          } catch (kakaoErr) {
            console.error('[Alimtalk Send Failed]', kakaoErr);
          }
        }

        return res.status(200).json({ 
          success: true, 
          receiptNum: receiptNum,
          message: '팩스 발송이 성공적으로 접수되었습니다.' 
        });
      },
      (error) => {
        try {
          if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        } catch(e){}
        console.error('Popbill Fax Error Code:', error.code, 'Message:', error.message);
        return res.status(400).json({ 
          success: false, 
          code: error.code,
          message: error.message || '팝빌 팩스 발송 중 오류가 발생했습니다.' 
        });
      }
    );
  } catch (err) {
    try {
      if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch(e){}
    console.error('SendFax Server Error:', err);
    return res.status(500).json({ 
      success: false, 
      message: err.message || 'Internal Server Error' 
    });
  }
};
