const popbill = require('popbill');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Initialize Popbill config using user provided credentials
popbill.config({
  LinkID: 'WERACLELAB',
  SecretKey: 'dJeTv/Yfc5xc8xfImnY2ypmt1aVfv/tG4LcPzP1FBec=',
  IsTest: true, // Test mode
});

const faxService = popbill.FaxService();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const { receiverNumber, receiverName, pdfBase64 } = req.body;

    if (!receiverNumber || !pdfBase64) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const tempFilePath = path.join(os.tmpdir(), `claim_${Date.now()}.pdf`);
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    fs.writeFileSync(tempFilePath, pdfBuffer);

    const corpNum = '1168180481';
    const sender = '0318755188';

    faxService.sendFAX(
      corpNum,
      sender,
      receiverNumber,
      receiverName || '보험금청구담당자',
      [tempFilePath], // file array
      '', // reserveDT
      '', // UserID
      '', // SenderName
      false, // AdsYN
      '보험금청구서류', // Title
      '', // RequestNum
      (receiptNum) => {
        try { fs.unlinkSync(tempFilePath); } catch(e){}
        return res.status(200).json({ success: true, receiptNum });
      },
      (error) => {
        try { fs.unlinkSync(tempFilePath); } catch(e){}
        console.error('Popbill Error:', error);
        return res.status(500).json({ success: false, message: error.message, code: error.code });
      }
    );
  } catch (err) {
    console.error('Server Error:', err);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}
