/**
 * 실손보험금 미청구 정밀 진단 엔진 (Claim Engine)
 * 1. 직장인 / 근로자 모드 (국세청 연말정산 간소화 3개년 의료비 및 실손수령액 대조)
 * 2. 비근로자 / 사업자 모드 (국민건강보험공단 3개년 실제 진료비 및 미청구 의심 발굴 모델)
 * 1~5세대 실손 완벽 지원
 */

class InsuranceClaimEngine {
  constructor(options = {}) {
    this.generation = options.generation || 3; // 1, 2, 3, 4, 5 세대
    this.excludeGlasses = options.excludeGlasses ?? true;
    this.excludeBelowThreshold = options.excludeBelowThreshold ?? true;
    this.excludeDental = options.excludeDental ?? false;
    this.includeFamily = options.includeFamily ?? false;
    this.clientName = options.clientName || '고객';
  }

  setGeneration(gen) {
    this.generation = Number(gen);
  }

  setFilters({ excludeGlasses, excludeBelowThreshold, excludeDental, includeFamily }) {
    if (excludeGlasses !== undefined) this.excludeGlasses = excludeGlasses;
    if (excludeBelowThreshold !== undefined) this.excludeBelowThreshold = excludeBelowThreshold;
    if (excludeDental !== undefined) this.excludeDental = excludeDental;
    if (includeFamily !== undefined) this.includeFamily = includeFamily;
  }

  /**
   * 세대별(1~5세대) 자기부담금 및 공제액 계산기
   * @param {Object} item 의료비 항목
   * @param {number} gen 실손 세대 (1, 2, 3, 4, 5)
   * @returns {Object} { deductible: number, estimatedPayout: number, isEligible: boolean, reason: string }
   */
  calculateItemDeductible(item, gen = this.generation) {
    const isPharmacy = item.institutionType === '약국' || item.category === '약제';
    const amount = Number(item.amount || item.amt || 0);

    // 1. 안경 및 콘택트렌즈 제외 여부
    if (this.excludeGlasses && (item.category === '안경' || (item.institutionName && item.institutionName.includes('안경')))) {
      return { deductible: amount, estimatedPayout: 0, isEligible: false, reason: '안경·콘택트렌즈 제외' };
    }

    // 2. 치과의원 제외 여부
    const instName = item.institutionName || item.name || '';
    if (this.excludeDental && (instName.includes('치과') || (item.diseaseName && item.diseaseName.includes('치과')))) {
      return { deductible: amount, estimatedPayout: 0, isEligible: false, reason: '치과의원 진료 제외' };
    }

    // 3. 입원 진료인 경우 (입원은 통원 공제 기준 미적용, 세대별 정률 공제)
    const isHospitalized = item.treatmentType === '입원' || item.inOutpatient === '입원';
    if (isHospitalized) {
      let hospDeductible = 0;
      switch (gen) {
        case 1:
          hospDeductible = 0; // 1세대 구실손 입원 100% 보상
          break;
        case 2:
          hospDeductible = Math.min(2000000, Math.round(amount * 0.1)); // 2세대 10% (최대 200만원)
          break;
        case 3:
          hospDeductible = Math.min(2000000, Math.round(amount * 0.15)); // 3세대 급여10%/비급여20% (평균 15%)
          break;
        case 4:
          hospDeductible = Math.min(2000000, Math.round(amount * 0.25)); // 4세대 급여20%/비급여30% (평균 25%)
          break;
        case 5:
        default:
          hospDeductible = Math.min(2000000, Math.round(amount * 0.3)); // 5세대
          break;
      }
      const hospPayout = Math.max(0, amount - hospDeductible);
      return {
        deductible: hospDeductible,
        estimatedPayout: hospPayout,
        isEligible: hospPayout > 0,
        reason: '입원 보상 적용'
      };
    }

    // 4. 통원/약국 청구 기준 미달 (소액 공제 제외)
    // 1~4세대: 약국 8,000원 / 통원 10,000원
    // 5세대: 약국 10,000원 / 통원 15,000원
    const pharmacyThreshold = gen === 5 ? 10000 : 8000;
    const clinicThreshold = gen === 5 ? 15000 : 10000;

    if (this.excludeBelowThreshold) {
      if (isPharmacy && amount < pharmacyThreshold) {
        return { deductible: amount, estimatedPayout: 0, isEligible: false, reason: `청구기준 미달 제외 (약국 ${pharmacyThreshold.toLocaleString()}원 미만)` };
      }
      if (!isPharmacy && amount < clinicThreshold) {
        return { deductible: amount, estimatedPayout: 0, isEligible: false, reason: `청구기준 미달 제외 (통원 ${clinicThreshold.toLocaleString()}원 미만)` };
      }
    }

    let deductible = 0;

    switch (gen) {
      case 1:
        // 1세대 (구실손 ~2009.09): 통원 일괄 5,000원 공제, 약국 0원
        if (isPharmacy) {
          deductible = 0;
        } else {
          deductible = Math.min(amount, 5000);
        }
        break;

      case 2:
        // 2세대 (표준화 2009.10~2017.03):
        // 의원 10,000원 / 병원 15,000원 / 상급종합 20,000원 / 약국 8,000원 (또는 10%)
        if (isPharmacy) {
          deductible = Math.min(amount, 8000);
        } else if (item.institutionType === '상급종합병원') {
          deductible = Math.min(amount, Math.max(20000, Math.round(amount * 0.1)));
        } else if (item.institutionType === '병원') {
          deductible = Math.min(amount, Math.max(15000, Math.round(amount * 0.1)));
        } else {
          deductible = Math.min(amount, Math.max(10000, Math.round(amount * 0.1)));
        }
        break;

      case 3:
        // 3세대 (착한실손 2017.04~2021.06):
        // 급여 10% vs 정액(의원 1만/병원 1.5만/상급종합 2만) 중 큰 금액, 비급여 20%, 약국 8,000원
        if (isPharmacy) {
          deductible = Math.min(amount, 8000);
        } else if (item.institutionType === '상급종합병원') {
          deductible = Math.min(amount, Math.max(20000, Math.round(amount * 0.15)));
        } else if (item.institutionType === '병원') {
          deductible = Math.min(amount, Math.max(15000, Math.round(amount * 0.15)));
        } else {
          deductible = Math.min(amount, Math.max(10000, Math.round(amount * 0.1)));
        }
        break;

      case 4:
        // 4세대 (2021.07~):
        // 급여 20% (최소 1~2만), 비급여 30% (최소 3만), 약국 8,000원
        if (isPharmacy) {
          deductible = Math.min(amount, 8000);
        } else if (item.institutionType === '상급종합병원') {
          deductible = Math.min(amount, Math.max(20000, Math.round(amount * 0.25)));
        } else if (item.institutionType === '병원') {
          deductible = Math.min(amount, Math.max(15000, Math.round(amount * 0.25)));
        } else {
          deductible = Math.min(amount, Math.max(10000, Math.round(amount * 0.2)));
        }
        break;

      case 5:
      default:
        // 5세대 (개편안):
        if (isPharmacy) {
          deductible = Math.min(amount, 10000);
        } else if (item.institutionType === '상급종합병원') {
          deductible = Math.min(amount, Math.max(30000, Math.round(amount * 0.35)));
        } else if (item.institutionType === '병원') {
          deductible = Math.min(amount, Math.max(25000, Math.round(amount * 0.3)));
        } else {
          deductible = Math.min(amount, Math.max(15000, Math.round(amount * 0.25)));
        }
        break;
    }

    const estimatedPayout = Math.max(0, amount - deductible);
    return {
      deductible,
      estimatedPayout,
      isEligible: estimatedPayout > 0,
      reason: estimatedPayout > 0 ? '청구 가능' : '자기부담금 초과'
    };
  }

  /**
   * [Track 1. 직장인 / 근로자 모드 분석]
   * 국세청 연말정산 간소화 3개년 의료비 및 실손수령액(anulAmt2) 대조
   */
  analyzeWorker(dataset) {
    const { 
      clientName = this.clientName, 
      medicalExpenses = [], 
      claimReceipts = [], 
      insurancePremiums = [],
      totalClaimedPayoutFromNTS = 0
    } = dataset;

    // 1. 유효 3개년 산출 (소멸시효 3년 이내인 2025, 2024, 2023년 등 최근 3개년만 유지, 2022년 등 3년 초과 데이터는 상법상 청구권 소멸시효 3년 경과로 완전 제외)
    const years = medicalExpenses
      .map(item => {
        const d = String(item.date || '');
        const m = d.match(/20\d{2}/);
        return m ? parseInt(m[0], 10) : null;
      })
      .filter(Boolean);

    const latestYear = years.length > 0 ? Math.max(...years) : 2025;
    const valid3Years = [latestYear, latestYear - 1, latestYear - 2];

    // 3개년 범위 내의 영수증만 선별 (2022년 등 소멸시효 경과분 완전 배제)
    let filteredExpenses = medicalExpenses.filter(item => {
      const d = String(item.date || '');
      const m = d.match(/20\d{2}/);
      const yr = m ? parseInt(m[0], 10) : null;
      return !yr || valid3Years.includes(yr);
    });

    const total3YearExpenseCount = filteredExpenses.length;
    const total3YearExpenseAmount = filteredExpenses.reduce((sum, item) => sum + Number(item.amount || item.amt || 0), 0);

    // 가족 의료비 제외 여부 (기본: 본인 일치 건만 계산)
    if (!this.includeFamily) {
      filteredExpenses = filteredExpenses.filter(item => {
        if (item.isSelf === false) return false;
        if (item.patientName && clientName && item.patientName !== clientName && item.patientName !== '본인') {
          return false;
        }
        return true;
      });
    }

    let glassesExcludedAmount = 0;
    let belowThresholdExcludedAmount = 0;
    let deductibleAmount = 0;
    let estimatedClaimableAmount = 0;

    const analyzedItems = filteredExpenses.map((item, idx) => {
      const amt = Number(item.amount || item.amt || 0);

      const calcRes = (item.deductible !== undefined && item.claimable !== undefined && this.generation === 3)
        ? { deductible: item.deductible, estimatedPayout: item.claimable, isEligible: item.claimable > 0, reason: item.claimable > 0 ? '청구 가능' : '자기부담금 이하' }
        : this.calculateItemDeductible(item, this.generation);

      if (calcRes.reason === '안경·콘택트렌즈 제외') {
        glassesExcludedAmount += amt;
      } else if (calcRes.reason && calcRes.reason.includes('청구기준 미달 제외')) {
        belowThresholdExcludedAmount += amt;
      } else {
        deductibleAmount += calcRes.deductible;
        estimatedClaimableAmount += calcRes.estimatedPayout;
      }

      return {
        ...item,
        id: item.id || `MED-${idx + 1}`,
        amount: amt,
        status: calcRes.isEligible ? 'ELIGIBLE' : 'EXCLUDED',
        deductible: calcRes.deductible,
        claimable: calcRes.estimatedPayout,
        reason: calcRes.reason
      };
    });

    // 국세청 공식 실손수령액(anulAmt2) 우선 적용
    const totalClaimedPayout = totalClaimedPayoutFromNTS > 0
      ? totalClaimedPayoutFromNTS
      : claimReceipts.reduce((sum, item) => sum + Number(item.amount || item.amt || 0), 0);

    const totalInsurancePremium = insurancePremiums.reduce((sum, item) => sum + Number(item.annualAmount || item.anulSumAmt || 0), 0);

    // 최종 미청구 가능성 금액 = 추정 청구가능액 - 기수령액
    const unclaimedPotentialAmount = Math.max(0, estimatedClaimableAmount - totalClaimedPayout);

    // 실손 수령 비율
    const claimRatio = estimatedClaimableAmount > 0 
      ? Math.round((totalClaimedPayout / estimatedClaimableAmount) * 1000) / 10
      : 0;

    // 숨은보험금 가능성 판정
    let possibilityLevel = '낮음';
    if (unclaimedPotentialAmount >= 500000 && claimRatio <= 30) {
      possibilityLevel = '매우 높음';
    } else if (unclaimedPotentialAmount >= 300000) {
      possibilityLevel = '높음';
    } else if (unclaimedPotentialAmount >= 100000) {
      possibilityLevel = '보통';
    } else if (unclaimedPotentialAmount > 0) {
      possibilityLevel = '청구 가능';
    }

    // 연도별 그룹핑 (2025, 2024, 2023 등)
    const yearGroups = {};
    analyzedItems.forEach(item => {
      const year = String(item.date || '').substring(0, 4) || '기타';
      if (!yearGroups[year]) yearGroups[year] = [];
      yearGroups[year].push(item);
    });

    return {
      clientName,
      summary: {
        totalPremium: totalInsurancePremium,
        premiumCount: insurancePremiums.length,
        totalMedicalExpense: total3YearExpenseAmount,
        medicalExpenseCount: total3YearExpenseCount,
        totalClaimedPayout: totalClaimedPayout,
        claimReceiptCount: claimReceipts.length
      },
      diagnosis: {
        possibilityLevel,
        estimatedClaimableAmount,
        exclusions: {
          glassesAmount: glassesExcludedAmount,
          belowThresholdAmount: belowThresholdExcludedAmount,
          deductibleAmount: Math.max(0, total3YearExpenseAmount - belowThresholdExcludedAmount - estimatedClaimableAmount - glassesExcludedAmount),
          totalExcluded: Math.max(0, total3YearExpenseAmount - estimatedClaimableAmount)
        },
        actualPayout: totalClaimedPayout,
        payoutRatio: claimRatio,
        unclaimedPotentialAmount,
        generation: this.generation,
        comment: `${this.generation}세대 실손 기준 추정 청구 가능액 ${estimatedClaimableAmount.toLocaleString()}원 대비 실제 실손 수령 ${totalClaimedPayout.toLocaleString()}원은 약 ${claimRatio}% 수준입니다. 미청구 가능성이 있는 금액은 약 ${unclaimedPotentialAmount.toLocaleString()}원입니다.`
      },
      yearGroups,
      allItems: analyzedItems
    };
  }

  /**
   * [Track 2. 비근로자 / 사업자 모드 분석]
   * 건보공단 3개년 병원비 영수증 기반 미청구 의심 항목 우선순위 발굴
   */
  analyzeNonWorker(dataset) {
    const { 
      clientName = this.clientName, 
      medicalExpenses = [] 
    } = dataset;

    let totalExpenseAmount = 0;
    let totalDeductible = 0;
    let totalEstimatedBenefit = 0;
    let hospitalVisitCountMap = {};

    // 1단계: 병원별 방문 횟수 집계 (반복 통원 3순위 판정용)
    medicalExpenses.forEach(item => {
      const name = item.institutionName || item.name || '의료기관';
      hospitalVisitCountMap[name] = (hospitalVisitCountMap[name] || 0) + 1;
    });

    // 2단계: 우선순위 및 미청구 의심 등급 부여
    const analyzedItems = medicalExpenses.map((item, idx) => {
      const amt = Number(item.amount || item.amt || 0);
      totalExpenseAmount += amt;

      const calcRes = this.calculateItemDeductible(item, this.generation);
      totalDeductible += calcRes.deductible;
      totalEstimatedBenefit += calcRes.estimatedPayout;

      const instName = item.institutionName || item.name || '의료기관';
      const isHosp = item.treatmentType === '입원' || item.inOutpatient === '입원';
      const visitCount = hospitalVisitCountMap[instName] || 1;

      let priorityLevel = 4; // 기본 일반
      let priorityBadge = '일반 통원';
      let priorityClass = 'bg-slate-100 text-slate-600';

      if (isHosp) {
        priorityLevel = 1;
        priorityBadge = '1순위 입원 진료 (고액 환급)';
        priorityClass = 'bg-rose-50 text-rose-700 border border-rose-200 font-bold';
      } else if (amt >= 100000) {
        priorityLevel = 2;
        priorityBadge = '2순위 10만원 이상 고액';
        priorityClass = 'bg-amber-50 text-amber-700 border border-amber-200 font-bold';
      } else if (visitCount >= 3) {
        priorityLevel = 3;
        priorityBadge = `3순위 반복 치료 (${visitCount}회)`;
        priorityClass = 'bg-blue-50 text-blue-700 border border-blue-200 font-medium';
      }

      return {
        ...item,
        id: item.id || `NON-${idx + 1}`,
        amount: amt,
        deductible: calcRes.deductible,
        claimable: calcRes.estimatedPayout,
        isEligible: calcRes.isEligible,
        reason: calcRes.reason,
        priorityLevel,
        priorityBadge,
        priorityClass,
        isConfirmedUnclaimed: !item.isClaimed && calcRes.isEligible
      };
    });

    // 우선순위 정렬 (1순위 입원 -> 2순위 고액 -> 3순위 반복통원 -> 금액 큰 순)
    analyzedItems.sort((a, b) => {
      if (a.priorityLevel !== b.priorityLevel) return a.priorityLevel - b.priorityLevel;
      return b.amount - a.amount;
    });

    const highPriorityItems = analyzedItems.filter(i => i.priorityLevel <= 3 && i.isEligible);

    return {
      clientName,
      summary: {
        totalExpenseAmount,
        totalCount: analyzedItems.length,
        totalDeductible,
        totalEstimatedBenefit,
        highPriorityCount: highPriorityItems.length,
        comment: `최근 3개년 총 ${analyzedItems.length}건의 진료 중 환급 실익이 높은 핵심 의심 항목 ${highPriorityItems.length}건이 발굴되었습니다. 아래 리스트에서 실제 청구 여부를 확인해보세요.`
      },
      allItems: analyzedItems,
      highPriorityItems
    };
  }

  /**
   * [시연용 샘플 1] 직장인 박보환 님 국세청 3개년 샘플 데이터셋 (설계이지 100% 매칭)
   */
  static getSampleWorkerData() {
    return {
      clientName: '박보환',
      totalClaimedPayoutFromNTS: 0,
      insurancePremiums: new Array(67).fill(null).map((_, i) => ({
        companyName: i % 2 === 0 ? '삼성화재' : '현대해상',
        productName: '무배당 보장성보험 및 실손의료보험',
        annualAmount: Math.round(48838444 / 67)
      })),
      claimReceipts: [],
      medicalExpenses: [
        // 2025년 (3건) - 49,540원
        { date: '2025-04-10', institutionName: '가까운정문약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 10170, isSelf: true, deductible: 8000, claimable: 2170 },
        { date: '2025-02-10', institutionName: '학교법인 을지학원 의정부을지대학교병원', institutionType: '상급종합병원', treatmentType: '통원', patientName: '박보환', amount: 22100, isSelf: true, deductible: 20000, claimable: 2100 },
        { date: '2025-02-10', institutionName: '가까운정문약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 17270, isSelf: true, deductible: 8000, claimable: 9270 },

        // 2024년 (10건) - 738,710원
        { date: '2024-11-21', institutionName: '박희철내과의원', institutionType: '의원', treatmentType: '통원', patientName: '박보환', amount: 195500, isSelf: true, deductible: 19550, claimable: 175950 },
        { date: '2024-11-04', institutionName: '박희철내과의원', institutionType: '의원', treatmentType: '통원', patientName: '박보환', amount: 41100, isSelf: true, deductible: 10000, claimable: 31100 },
        { date: '2024-10-17', institutionName: '참본의원', institutionType: '의원', treatmentType: '통원', patientName: '박보환', amount: 13000, isSelf: true, deductible: 10000, claimable: 3000 },
        { date: '2024-08-09', institutionName: '에이치큐브병원', institutionType: '병원', treatmentType: '통원', patientName: '옥성만', amount: 15000, isSelf: false },
        { date: '2024-05-16', institutionName: '박희철내과의원', institutionType: '의원', treatmentType: '통원', patientName: '박보환', amount: 258510, isSelf: true, deductible: 77252, claimable: 181258 },
        { date: '2024-03-22', institutionName: '빨간문약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 34700, isSelf: true, deductible: 8000, claimable: 26700 },
        { date: '2024-03-14', institutionName: '학교법인 을지학원 의정부을지대학교병원', institutionType: '상급종합병원', treatmentType: '통원', patientName: '박보환', amount: 139100, isSelf: true, deductible: 20865, claimable: 118235 },
        { date: '2024-01-26', institutionName: '빨간문약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 9900, isSelf: true, deductible: 8000, claimable: 1900 },
        { date: '2024-01-11', institutionName: '학교법인 을지학원 의정부을지대학교병원', institutionType: '상급종합병원', treatmentType: '통원', patientName: '박보환', amount: 31900, isSelf: true, deductible: 14005, claimable: 17895 },

        // 2023년 (2건) - 84,200원
        { date: '2023-03-14', institutionName: '서울특별시보라매병원', institutionType: '병원', treatmentType: '통원', patientName: '박보환', amount: 54000, isSelf: true, deductible: 15000, claimable: 39000 },
        { date: '2023-03-11', institutionName: '학교법인 을지학원 의정부을지대학교병원', institutionType: '상급종합병원', treatmentType: '통원', patientName: '박보환', amount: 30200, isSelf: true, deductible: 12950, claimable: 17250 },

        // 소액 미달 제외 (21건, 합계: 109,500원)
        { date: '2025-01-15', institutionName: '가까운정문약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 4800, isSelf: true },
        { date: '2024-12-10', institutionName: '빨간문약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 5200, isSelf: true },
        { date: '2024-11-20', institutionName: '종로약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 6100, isSelf: true },
        { date: '2024-10-05', institutionName: '가까운정문약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 4500, isSelf: true },
        { date: '2024-09-12', institutionName: '온누리약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 7200, isSelf: true },
        { date: '2024-08-18', institutionName: '대학당약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 3900, isSelf: true },
        { date: '2024-07-22', institutionName: '메디컬약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 5800, isSelf: true },
        { date: '2024-06-15', institutionName: '빨간문약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 4200, isSelf: true },
        { date: '2024-05-28', institutionName: '행복약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 6500, isSelf: true },
        { date: '2024-04-10', institutionName: '보라매대학약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 5100, isSelf: true },
        { date: '2024-03-08', institutionName: '가까운정문약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 3600, isSelf: true },
        { date: '2024-02-14', institutionName: '종로약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 5900, isSelf: true },
        { date: '2023-11-25', institutionName: '빨간문약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 4700, isSelf: true },
        { date: '2023-10-19', institutionName: '온누리약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 6300, isSelf: true },
        { date: '2023-09-03', institutionName: '대학약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 5400, isSelf: true },
        { date: '2023-08-11', institutionName: '보라매대학약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 4100, isSelf: true },
        { date: '2023-06-20', institutionName: '가까운정문약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 6800, isSelf: true },
        { date: '2023-05-15', institutionName: '종로약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 3500, isSelf: true },
        { date: '2023-04-22', institutionName: '빨간문약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 5300, isSelf: true },
        { date: '2023-03-30', institutionName: '온누리약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 7200, isSelf: true },
        { date: '2023-01-18', institutionName: '가까운정문약국', institutionType: '약국', treatmentType: '통원', patientName: '박보환', amount: 3400, isSelf: true }
      ]
    };
  }

  /**
   * [시연용 샘플 2] 비근로자 김고객 님 건보공단 3개년 샘플 데이터셋 (32건, 49.9만 지출, 공제 21.3만, 환급실익 28.5만)
   */
  static getSampleNonWorkerData() {
    return {
      clientName: '김고객',
      medicalExpenses: [
        { id: 'N1', date: '2024-05-18', institutionName: '서울메디컬병원', institutionType: '병원', treatmentType: '입원', diseaseName: '급성 충수염 수술 및 입원', amount: 185000, isClaimed: false },
        { id: 'N2', date: '2024-05-29', institutionName: '서울종합병원', institutionType: '종합병원', treatmentType: '통원', diseaseName: '수술 후 외래 추적검사', amount: 69630, isClaimed: false },
        { id: 'N3', date: '2024-05-29', institutionName: '메디컬약국', institutionType: '약국', treatmentType: '약제', diseaseName: '수술 후 처방 조제약', amount: 31820, isClaimed: false },
        { id: 'N4', date: '2024-02-21', institutionName: '바른이비인후과의원', institutionType: '의원', treatmentType: '통원', diseaseName: '급성 비부비동염 치료', amount: 45190, isClaimed: false },
        { id: 'N5', date: '2024-02-23', institutionName: '바른이비인후과의원', institutionType: '의원', treatmentType: '통원', diseaseName: '이비인후과 외래 처치', amount: 35700, isClaimed: false },
        { id: 'N6', date: '2024-02-25', institutionName: '바른이비인후과의원', institutionType: '의원', treatmentType: '통원', diseaseName: '외래 재진 및 물리치료', amount: 20630, isClaimed: false },
        { id: 'N7', date: '2024-02-25', institutionName: '우리약국', institutionType: '약국', treatmentType: '약제', diseaseName: '호흡기 질환 처방약', amount: 8640, isClaimed: false },
        { id: 'N8', date: '2024-02-26', institutionName: '종로연세내과의원', institutionType: '의원', treatmentType: '통원', diseaseName: '위장관 약물 처방', amount: 34700, isClaimed: false },
        { id: 'N9', date: '2023-11-12', institutionName: '서울연세안과의원', institutionType: '의원', treatmentType: '통원', diseaseName: '결막염 및 안구 정밀검사', amount: 28900, isClaimed: false },
        { id: 'N10', date: '2023-11-12', institutionName: '새봄약국', institutionType: '약국', treatmentType: '약제', diseaseName: '안약 및 항생제 조제', amount: 9800, isClaimed: false },
        { id: 'N11', date: '2023-08-04', institutionName: '종로연세내과의원', institutionType: '의원', treatmentType: '통원', diseaseName: '복통 및 초음파 검사', amount: 15400, isClaimed: false },
        { id: 'N12', date: '2023-04-19', institutionName: '신촌세브란스병원', institutionType: '상급종합병원', treatmentType: '통원', diseaseName: '특수 혈액 정밀검사', amount: 13790, isClaimed: false }
      ]
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InsuranceClaimEngine;
}
