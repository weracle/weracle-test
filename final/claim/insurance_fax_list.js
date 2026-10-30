/**
 * 보험금 청구 시스템 - 보험사별 팩스번호 및 직접입력 설정 파일
 * 
 * [관리 가이드]
 * 1. directInputCompanies: 담당자 개인 팩스번호를 필수로 직접 입력해야 하는 보험사 목록
 * 2. faxList: 각 보험사의 기본 공식 대표 팩스번호 (중앙 접수용)
 */

(function(window) {
  // 1. 담당자 개인 팩스번호 직접 입력 필수 회사 목록
  const directInputCompanies = [
    '예별손보',
    '카디프생명',
    'IM라이프'
  ];

  // 2. 31개 보험사별 공식 대표 팩스번호 및 콜센터 안내 데이터
  const faxList = {
    // --- 손해보험 ---
    '삼성화재': { fax: '0505-161-1422', phone: '1588-5114', type: 'AUTO' },
    '현대해상': { fax: '0507-774-6060', phone: '1588-5656', type: 'AUTO' },
    'DB손해보험': { fax: '0505-181-4862', phone: '1588-0100', type: 'AUTO' },
    'KB손해보험': { fax: '0505-136-6500', phone: '1544-0114', type: 'AUTO' },
    '메리츠화재': { fax: '0505-021-3400', phone: '1566-7711', type: 'AUTO' },
    '한화손해': { fax: '0502-779-1004', phone: '1566-8000', type: 'AUTO' },
    '흥국화재': { fax: '0505-288-0550', phone: '1688-1688', type: 'AUTO' },
    '롯데손해': { fax: '0505-089-2000', phone: '1588-3344', type: 'AUTO' },
    '농협손해보험': { fax: '0505-060-7000', phone: '1644-9000', type: 'AUTO' },
    '하나손해': { fax: '0505-170-0765', phone: '1566-3000', type: 'AUTO' },
    'AIG손해보험': { fax: '02-2011-4607', phone: '1544-2792', type: 'AUTO' },
    '라이나손해': { fax: '02-2127-2490', phone: '1566-5800', type: 'AUTO' },
    '예별손보': { fax: '', phone: '1566-0000', type: 'DIRECT_INPUT', notice: '담당자 개인 팩스번호를 입력해 주세요.' },

    // --- 생명보험 ---
    '삼성생명': { fax: '02-900-3114', phone: '1588-3114', type: 'AUTO' },
    '한화생명': { fax: '', phone: '1588-6363', type: 'DIRECT_INPUT', notice: '담당자 개인 팩스번호를 입력해 주세요.' }
    '교보생명': { fax: '0505-100-9604', phone: '1588-1001', type: 'AUTO' },
    '신한라이프': { fax: '0505-001-1305', phone: '1588-5580', type: 'AUTO' },
    '농협생명': { fax: '02-6971-6060', phone: '1544-4000', type: 'AUTO' },
    '라이나생명': { fax: '02-6944-1200', phone: '1588-0058', type: 'AUTO' },
    '수호천사동양생명': { fax: '0505-141-8114', phone: '1577-1004', type: 'AUTO' },
    '미래에셋': { fax: '0505-169-0115', phone: '1588-0220', type: 'AUTO' },
    'KB라이프': { fax: '02-6260-3890', phone: '1588-3374', type: 'AUTO' },
    'DB생명': { fax: '02-3271-5050', phone: '1588-3131', type: 'AUTO' },
    '흥국생명': { fax: '0505-108-0351', phone: '1588-2288', type: 'AUTO' },
    '메트라이프': { fax: '02-3469-9590', phone: '1588-9600', type: 'AUTO' },
    'KDB생명': { fax: '02-6303-2398', phone: '1588-4040', type: 'AUTO' },
    'ABL생명': { fax: '02-3299-5511', phone: '1588-6500', type: 'AUTO' },
    '하나생명': { fax: '02-3709-7930', phone: '1577-1112', type: 'AUTO' },
    '처브라이프생명': { fax: '02-3480-0899', phone: '1599-4600', type: 'AUTO' },
    '카디프생명': { fax: '', phone: '1688-1118', type: 'DIRECT_INPUT', notice: '담당자 개인 팩스번호를 입력해 주세요.' },
    'IM라이프': { fax: '', phone: '1588-4770', type: 'DIRECT_INPUT', notice: '담당자 개인 팩스번호를 입력해 주세요.' }
  };

  // 전역 객체에 등록 (기존 reqFaxCompanies 변수와 완벽 호환)
  window.INSURANCE_FAX_DATA = {
    directInputCompanies: directInputCompanies,
    faxList: faxList,
    getFax: function(companyName) {
      if (faxList[companyName]) {
        return faxList[companyName].fax || '';
      }
      return '';
    },
    isDirectInput: function(companyName) {
      return directInputCompanies.includes(companyName);
    }
  };

  // 기존 코드의 reqFaxCompanies 변수와 직접 연동
  window.reqFaxCompanies = directInputCompanies;

})(typeof window !== 'undefined' ? window : this);
