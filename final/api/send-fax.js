const popbill = require('popbill');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 팝빌 연동 설정 (실발송 모드: IsTest = false)
const isTestMode = process.env.POPBILL_IS_TEST === 'true';

popbill.config({
  LinkID: process.env.POPBILL_LINK_ID || 'WERACLELAB',
  SecretKey: process.env.POPBILL_SECRET_KEY || 'dJeTv/Yfc5xc8xfImnY2ypmt1aVfv/tG4LcPzP1FBec=',
  IsTest: isTestMode, // 실서버 발송 모드 (기본: false)
  defaultErrorHandler: function(err) {
    console.error('[Popbill Default Error]', err);
  }
});

const faxService = popbill.FaxService();

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

    const { receiverNumber, receiverName, pdfBase64, senderNumber } = body || {};

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
      (receiptNum) => {
        try {
          if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        } catch(e){}
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
        console.error('Popbill Error Code:', error.code, 'Message:', error.message);
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
