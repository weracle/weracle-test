/**
 * 하이픈(HYPHEN) 통합 응답 규격 파서
 * 1) 국세청 연말정산간소화 규격 (G0001 보장성보험, G0003 의료비 및 anulAmt2 실손수령액)
 * 2) 건보공단 진료내역 규격 (/in0165001213: personalCareInfoList, basicMedicalTreatmentInfoList)
 * 다년도(2024, 2023, 2022) 전수 자동 통합 및 재귀적 딥 스캐너 내장
 */

class HyphenHometaxParser {
  /**
   * 객체 트리 내에서 특정 키 목록 중 하나를 재귀적으로 검색하여 첫 번째 매칭 반환
   */
  static findDeepKey(obj, targetKeys, depth = 0, maxDepth = 6) {
    if (!obj || typeof obj !== 'object' || depth > maxDepth) return null;
    const lowerTargets = targetKeys.map(k => k.toLowerCase());
    
    // 1. 현재 레벨 직접 매칭
    for (const key of Object.keys(obj)) {
      if (lowerTargets.includes(key.toLowerCase()) && obj[key] !== null && obj[key] !== undefined) {
        return obj[key];
      }
    }

    // 2. 하위 객체 및 배열 순회
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val && typeof val === 'object') {
        const found = this.findDeepKey(val, targetKeys, depth + 1, maxDepth);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * 객체 트리 내에서 특정 키 목록과 일치하는 모든 노드를 재귀적으로 수집 (다년도 데이터 통합용)
   */
  static findAllDeep(obj, targetKeys, depth = 0, maxDepth = 6, results = []) {
    if (!obj || typeof obj !== 'object' || depth > maxDepth) return results;
    const lowerTargets = targetKeys.map(k => k.toLowerCase());

    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (lowerTargets.includes(key.toLowerCase()) && val !== null && val !== undefined) {
        results.push(val);
      }
      if (val && typeof val === 'object') {
        this.findAllDeep(val, targetKeys, depth + 1, maxDepth, results);
      }
    }
    return results;
  }

  /**
   * 하이픈 API 실제 응답 JSON을 파싱하여 대시보드 표준 데이터셋으로 변환 (다년도 전수 통합)
   * @param {Object} rawHyphenResponse 하이픈 실제 JSON 응답
   * @returns {Object} 정규화된 데이터셋
   */
  static parse(rawHyphenResponse, fallbackClientName = '') {
    if (!rawHyphenResponse) {
      throw new Error('응답 데이터가 비어있습니다.');
    }

    let root = rawHyphenResponse;
    const toArr = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      return [val];
    };

    // 고객 성명 탐색 (응답 데이터 내 성명 우선 탐색, 미발견 시 입력받은 고객명 보존)
    const foundName = 
      this.findDeepKey(root, ['userNm', 'txprNm', 'patientName', 'resNm', 'custNm', 'userName', 'bizNm']) || 
      root.customer?.name || 
      root.data?.customer?.name || 
      '';
    const clientName = (foundName && foundName !== '고객' && String(foundName).trim() !== '') 
      ? String(foundName).trim() 
      : (fallbackClientName || '고객');

    // 기본 귀속연도
    const defaultYear = this.findDeepKey(root, ['attrYr', 'bizYear', 'year']) || '2024';

    const medicalExpenses = [];
    let totalClaimedPayoutFromNTS = 0; // anulAmt2 (국세청 등록 기지급 실손보험금 총액)
    const claimReceipts = [];          // list2 (국세청 등록 실손보험금 지급 상세내역)
    const insurancePremiums = [];

    // [유형 1] 국세청 연말정산간소화 의료비 (G0003, B101Y) - 다년도 전수 수집
    const allG3Nodes = this.findAllDeep(root, ['G0003', 'g0003', 'B101Y', 'B101Y_MedicalExpenses', 'medicalExpenses']);
    
    // 만약 탐색 결과가 없으면 단일 키 검색 시도
    if (allG3Nodes.length === 0) {
      const singleG3 = this.findDeepKey(root, ['G0003', 'g0003', 'B101Y', 'B101Y_MedicalExpenses', 'medicalExpenses']);
      if (singleG3) allG3Nodes.push(singleG3);
    }

    allG3Nodes.forEach((g3Block, gIdx) => {
      const currentYear = g3Block.attrYr || defaultYear;
      const personList = toArr(g3Block.outB6001 || g3Block.list || g3Block.manList || g3Block.resList || (Array.isArray(g3Block) ? g3Block : [g3Block]));

      personList.forEach(person => {
        if (!person) return;
        const pName = person.txprNm || person.patientName || clientName;
        const orgList = toArr(person.list || person.orgList || person.medList || (person.isnOrgnNm ? [person] : []));

        // 1-1. 기수령 실손보험금 추출 (anulAmt2, list2)
        totalClaimedPayoutFromNTS += Number(person.anulAmt2 || person.claimedAmt || 0);
        const payoutList = toArr(person.list2 || person.payoutList);
        payoutList.forEach((payout, pIdx) => {
          claimReceipts.push({
            id: `PAYOUT-${currentYear}-${gIdx + 1}-${pIdx + 1}`,
            companyName: payout.isnOrgnNm || payout.companyName || '보험회사',
            businessNumber: payout.isnOrgnDscmNo || payout.businessNumber || '',
            amount: Number(payout.anulSumAmt || payout.amt || payout.amount || 0),
            year: currentYear
          });
        });

        // 1-2. 발생 의료비 지출 목록 (list)
        orgList.forEach((org, orgIdx) => {
          const instName = org.isnOrgnNm || org.orgNm || org.institutionName || '의료기관';
          const instType = this.detectInstitutionType(instName);
          const bizNo = org.isnOrgnDscmNo || org.bizNo || org.businessNumber || '';

          let mList = toArr(org.mlist || org.mList || org.detailList);
          if (mList.length === 0) {
            // 상세 건별(mlist)이 없더라도 의료기관별 연간 지출액(anulSumAmt, amt 등)이 존재하면 단일 건으로 수집
            const orgTotalAmt = Number(String(org.anulSumAmt || org.amt || org.amount || org.sumAmt || org.totAmt || org.useAmt || 0).replace(/[^0-9]/g, ''));
            if (orgTotalAmt > 0) {
              mList = [{
                date: org.date || org.treatmentDate || org.trtmDt || `${currentYear}-01-01`,
                amt: orgTotalAmt
              }];
            }
          }

          mList.forEach((item, mIdx) => {
            const rawDate = String(item.date || item.treatmentDate || item.trtmDt || `${currentYear}-01-01`);
            const formattedDate = rawDate.length === 8 
              ? `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`
              : rawDate;

            const itemAmt = Number(String(item.amt || item.amount || item.useAmt || item.anulSumAmt || item.sumAmt || org.anulSumAmt || org.amt || 0).replace(/[^0-9]/g, ''));
            if (itemAmt <= 0) return;

            medicalExpenses.push({
              id: `MED-${currentYear}-${gIdx + 1}-${orgIdx + 1}-${mIdx + 1}`,
              date: formattedDate,
              institutionName: instName,
              institutionType: instType,
              businessNumber: bizNo,
              treatmentType: instType === '약국' ? '처방조제' : '통원',
              patientName: pName,
              isSelf: !pName || !clientName || String(pName).trim() === String(clientName).trim() || pName === '본인',
              amount: itemAmt,
              remainingDays: this.calculateRemainingDays(formattedDate)
            });
          });
        });
      });
    });

    // 날짜 기준 최신순 정렬
    medicalExpenses.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // [유형 2] 건보공단 진료/투약 포맷 호환
    const basicTreat = toArr(this.findDeepKey(root, ['basicMedicalTreatmentInfoList']));
    if (basicTreat.length > 0) {
      basicTreat.forEach((treat, idx) => {
        const instName = treat.medicalCenter || '의료기관';
        const instType = this.detectInstitutionType(instName);
        const rawDate = String(treat.treatmentStartDate || '');
        const formattedDate = rawDate.length === 8
          ? `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`
          : rawDate;

        const paidAmt = Number(String(treat.medicalExpensesIPaid || '0').replace(/[^0-9]/g, ''));

        medicalExpenses.push({
          id: `TREAT-${idx + 1}`,
          date: formattedDate,
          institutionName: instName,
          institutionType: instType,
          businessNumber: treat.hospitalNo || '',
          treatmentType: treat.inOutpatient || (instType === '약국' ? '처방조제' : '통원'),
          patientName: clientName,
          isSelf: true,
          diseaseCode: treat.primaryDxCode || '',
          diseaseName: treat.primaryDxName || '',
          amount: paidAmt,
          remainingDays: this.calculateRemainingDays(formattedDate)
        });
      });
    } else {
      const personalCare = toArr(this.findDeepKey(root, ['personalCareInfoList']));
      if (personalCare.length > 0) {
        personalCare.forEach((care, idx) => {
          const instName = care.medicalCenter || '의료기관';
          const instType = this.detectInstitutionType(instName);
          const paidAmt = Number(String(care.medicalExpensesIPaid || '0').replace(/[^0-9]/g, ''));

          medicalExpenses.push({
            id: `CARE-${idx + 1}`,
            date: `${defaultYear}-01-01`,
            institutionName: instName,
            institutionType: instType,
            businessNumber: '',
            treatmentType: instType === '약국' ? '처방조제' : '통원',
            patientName: clientName,
            isSelf: true,
            amount: paidAmt,
            remainingDays: 365
          });
        });
      }
    }

    // [유형 3] 국세청 보장성보험료 (G0001, A102Y) 파싱 - 다년도 전수 수집
    const allG1Nodes = this.findAllDeep(root, ['G0001', 'g0001', 'A102Y', 'A102Y_InsurancePremiums', 'insurancePremiums']);
    if (allG1Nodes.length === 0) {
      const singleG1 = this.findDeepKey(root, ['G0001', 'g0001', 'A102Y', 'A102Y_InsurancePremiums', 'insurancePremiums']);
      if (singleG1) allG1Nodes.push(singleG1);
    }

    allG1Nodes.forEach((g1Block, gIdx) => {
      const personList = toArr(g1Block.outB6001 || g1Block.list || g1Block.manList || (Array.isArray(g1Block) ? g1Block : [g1Block]));
      personList.forEach(person => {
        if (!person) return;
        const orgList = toArr(person.list || person.orgList || (person.isnOrgnNm ? [person] : []));
        orgList.forEach((insu, idx) => {
          insurancePremiums.push({
            id: `INS-${gIdx + 1}-${idx + 1}`,
            company: insu.isnOrgnNm || insu.companyName || '보험회사',
            policyNumber: insu.scrtNo || insu.policyNumber || '',
            name: insu.inscPrdNm || insu.name || '보장성 실손계약',
            annualAmount: Number(insu.anulSumAmt || insu.annualAmount || 0),
            startDate: insu.ctrStrtDt || insu.startDate || '',
            endDate: insu.ctrEndDt || insu.endDate || '',
            count: toArr(insu.mlist || insu.mList).filter(m => Number(m.amt || m.amount) > 0).length || 12
          });
        });
      });
    });

    return {
      clientName,
      queryYear: defaultYear,
      medicalExpenses,
      totalClaimedPayoutFromNTS,
      claimReceipts,
      insurancePremiums
    };
  }

  static detectInstitutionType(name) {
    if (!name) return '의원';
    if (name.includes('약국')) return '약국';
    if (name.includes('대학교병원') || name.includes('의료원') || name.includes('아산병원') || name.includes('삼성서울')) {
      return '상급종합병원';
    }
    if (name.includes('종합병원') || name.includes('병원') || name.includes('한방병원')) {
      return '병원';
    }
    return '의원';
  }

  static calculateRemainingDays(dateStr) {
    if (!dateStr || dateStr.length < 10) return 1000;
    const treatDate = new Date(dateStr);
    const expireDate = new Date(treatDate);
    expireDate.setFullYear(expireDate.getFullYear() + 3);
    const today = new Date();
    const diffTime = expireDate - today;
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }

  /**
   * 한국신용정보원(내보험다보여) 실손형 보장 지급내역(/in0017000052) 응답 파서
   */
  static parseKcisPayout(rawResponse) {
    if (!rawResponse) return { payouts: [], totalPayout: 0 };
    const root = rawResponse.data?.data || rawResponse.data || rawResponse;
    const list = root.list || [];
    const payouts = [];
    let totalPayout = 0;

    list.forEach((item, idx) => {
      const coNm = item.coNm || '보험회사';
      const goodsNm = item.goodsNm || '실손의료비보험';
      const polNo = item.polNo || '';
      const orgDate = item.orgnAccdOccrDtm || '';
      const dtlList = item.dtlPmntList || [];

      if (dtlList.length > 0) {
        dtlList.forEach((dtl, dIdx) => {
          const amt = Number(String(dtl.pmntAmt || item.pmntAmt || '0').replace(/[^0-9]/g, ''));
          totalPayout += amt;
          payouts.push({
            id: `KCIS-${idx + 1}-${dIdx + 1}`,
            company: coNm,
            productName: goodsNm,
            policyNumber: polNo,
            accidentDate: orgDate,
            payoutDate: dtl.pmntDt || '',
            payoutClass: dtl.pmntClass || '실손지급',
            payoutReason: dtl.pmntResnNm || '통원의료비',
            judgementResult: dtl.pmntJgmnRstNm || '지급',
            payoutAmount: amt
          });
        });
      } else {
        const amt = Number(String(item.pmntAmt || '0').replace(/[^0-9]/g, ''));
        totalPayout += amt;
        payouts.push({
          id: `KCIS-${idx + 1}`,
          company: coNm,
          productName: goodsNm,
          policyNumber: polNo,
          accidentDate: orgDate,
          payoutDate: '',
          payoutClass: '실손지급',
          payoutReason: '통원의료비',
          judgementResult: '지급',
          payoutAmount: amt
        });
      }
    });

    return { payouts, totalPayout };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HyphenHometaxParser;
}
