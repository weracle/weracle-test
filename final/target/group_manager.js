/**
 * group_manager.js
 * 위라클랩 타겟관리 100명 스마트 자동 그룹 분할 & 체크박스 상태 보존 관리자
 */

const GroupManager = (function() {
    const ITEMS_PER_GROUP = 100;
    let currentGroupPage = 1;
    let selectedCustomerPhones = new Set();
    let currentFilteredList = [];
    let onPageChangeCallback = null;

    function init(onPageChange) {
        currentGroupPage = 1;
        selectedCustomerPhones.clear();
        currentFilteredList = [];
        onPageChangeCallback = onPageChange;
    }

    function setFilteredList(list) {
        currentFilteredList = list || [];
        const totalPages = Math.ceil(currentFilteredList.length / ITEMS_PER_GROUP) || 1;
        if (currentGroupPage > totalPages) {
            currentGroupPage = 1;
        }
    }

    function getCurrentPageData() {
        const total = currentFilteredList.length;
        if (total === 0) return [];
        const startIndex = (currentGroupPage - 1) * ITEMS_PER_GROUP;
        return currentFilteredList.slice(startIndex, startIndex + ITEMS_PER_GROUP);
    }

    function changeGroupPage(pageNum) {
        const totalPages = Math.ceil(currentFilteredList.length / ITEMS_PER_GROUP) || 1;
        if (pageNum < 1 || pageNum > totalPages) return;
        currentGroupPage = pageNum;
        if (typeof onPageChangeCallback === 'function') {
            onPageChangeCallback(currentGroupPage);
        }
    }

    function renderGroupPaginationHtml() {
        const total = currentFilteredList.length;
        if (total <= ITEMS_PER_GROUP) {
            // 100명 이하일 경우: 불필요한 그룹 탭을 숨김
            return '';
        }

        const totalPages = Math.ceil(total / ITEMS_PER_GROUP);
        let html = '<div class="group-control-box" style="width: 100%; display: flex; flex-direction: column; gap: 5px; padding: 4px 0 8px; border-bottom: 1px solid #f1f5f9; margin-bottom: 6px;">';

        if (totalPages <= 5) {
            // [5그룹 이하: 컴팩트 칩 탭]
            html += '<div style="display: flex; gap: 6px; overflow-x: auto; padding: 2px 0; align-items: center;">';
            for (let i = 1; i <= totalPages; i++) {
                const startNum = (i - 1) * ITEMS_PER_GROUP + 1;
                const endNum = Math.min(i * ITEMS_PER_GROUP, total);
                const isActive = (i === currentGroupPage);
                const chipStyle = isActive 
                    ? 'background: #0284c7; color: #ffffff; border: 1.5px solid #0284c7; font-weight: 800; box-shadow: 0 2px 6px rgba(2,132,199,0.25);'
                    : 'background: #f8fafc; color: #475569; border: 1px solid #cbd5e1; font-weight: 600;';

                html += `<button type="button" onclick="GroupManager.changeGroupPage(${i})" 
                    style="flex-shrink: 0; padding: 4px 10px; border-radius: 8px; font-size: 11.5px; cursor: pointer; transition: all 0.15s; ${chipStyle}">
                    ${i}그룹 (${startNum}~${endNum}명)
                </button>`;
            }
            html += '</div>';
        } else {
            // [6그룹 이상 ~ 40그룹+: 스마트 네비게이션 + 10단위 대분류 탭]
            
            // 1. 상단 퀵 셀렉터 (이전 / 드롭다운 / 다음)
            html += '<div style="display: flex; align-items: center; gap: 5px; width: 100%;">';
            
            const prevDisabled = (currentGroupPage === 1);
            html += `<button type="button" onclick="GroupManager.changeGroupPage(${currentGroupPage - 1})" ${prevDisabled ? 'disabled style="width: 28px; height: 28px; border-radius: 6px; border: 1px solid #e2e8f0; background: #f8fafc; color: #cbd5e1; cursor: default; display: flex; align-items: center; justify-content: center; font-size: 11px;"' : 'style="width: 28px; height: 28px; border-radius: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold;"'}>◀</button>`;

            html += '<select onchange="GroupManager.changeGroupPage(parseInt(this.value, 10))" style="flex: 1; height: 28px; font-size: 11.5px; font-weight: 700; color: #1e293b; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0 8px; cursor: pointer; outline: none;">';
            for (let p = 1; p <= totalPages; p++) {
                const s = (p - 1) * ITEMS_PER_GROUP + 1;
                const e = Math.min(p * ITEMS_PER_GROUP, total);
                html += `<option value="${p}" ${p === currentGroupPage ? 'selected' : ''}>${p}그룹 (${s.toLocaleString()}~${e.toLocaleString()}명) / 총 ${totalPages}그룹</option>`;
            }
            html += '</select>';

            const nextDisabled = (currentGroupPage === totalPages);
            html += `<button type="button" onclick="GroupManager.changeGroupPage(${currentGroupPage + 1})" ${nextDisabled ? 'disabled style="width: 28px; height: 28px; border-radius: 6px; border: 1px solid #e2e8f0; background: #f8fafc; color: #cbd5e1; cursor: default; display: flex; align-items: center; justify-content: center; font-size: 11px;"' : 'style="width: 28px; height: 28px; border-radius: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold;"'}>▶</button>`;
            html += '</div>';

            // 2. 대단위 탭 (10그룹 단위 세그먼트: 1~10그룹, 11~20그룹...)
            if (totalPages > 10) {
                const currentTier = Math.floor((currentGroupPage - 1) / 10);
                html += '<div style="display: flex; gap: 4px; overflow-x: auto; padding: 2px 0;">';
                const totalTiers = Math.ceil(totalPages / 10);
                for (let t = 0; t < totalTiers; t++) {
                    const tStart = t * 10 + 1;
                    const tEnd = Math.min((t + 1) * 10, totalPages);
                    const isTierActive = (t === currentTier);
                    const tierStyle = isTierActive 
                        ? 'background: #0f172a; color: #ffffff; border: 1px solid #0f172a;'
                        : 'background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0;';
                    html += `<button type="button" onclick="GroupManager.changeGroupPage(${tStart})" style="flex-shrink: 0; padding: 3px 8px; border-radius: 6px; font-size: 10.5px; font-weight: 700; cursor: pointer; ${tierStyle}">
                        ${tStart}~${tEnd}그룹
                    </button>`;
                }
                html += '</div>';
            }

            // 3. 소단위 세부 그룹 칩스 (현재 대단위 안의 그룹 번호들)
            let chipStart = 1;
            let chipEnd = totalPages;
            if (totalPages > 10) {
                const currentTier = Math.floor((currentGroupPage - 1) / 10);
                chipStart = currentTier * 10 + 1;
                chipEnd = Math.min(chipStart + 9, totalPages);
            }

            html += '<div style="display: flex; gap: 4px; overflow-x: auto; padding: 2px 0;">';
            for (let i = chipStart; i <= chipEnd; i++) {
                const s = (i - 1) * ITEMS_PER_GROUP + 1;
                const e = Math.min(i * ITEMS_PER_GROUP, total);
                const isActive = (i === currentGroupPage);
                const chipStyle = isActive
                    ? 'background: #0284c7; color: #ffffff; border: 1px solid #0284c7; font-weight: 800; box-shadow: 0 2px 6px rgba(2,132,199,0.25);'
                    : 'background: #ffffff; color: #334155; border: 1px solid #cbd5e1; font-weight: 600;';
                html += `<button type="button" onclick="GroupManager.changeGroupPage(${i})" title="${s.toLocaleString()}~${e.toLocaleString()}명" style="flex-shrink: 0; padding: 3px 8px; border-radius: 6px; font-size: 11px; cursor: pointer; transition: all 0.15s; ${chipStyle}">
                    ${i}그룹
                </button>`;
            }
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

        function toggleSelectAllEntireList(isChecked) {
        if (isChecked) {
            currentFilteredList.forEach(cust => {
                const cleanP = String(cust.phone || '').replace(/[^0-9]/g, '');
                if (cleanP) selectedCustomerPhones.add(cleanP);
            });
        } else {
            selectedCustomerPhones.clear();
        }
    }

    function isAllEntireListSelected() {
        if (currentFilteredList.length === 0) return false;
        return currentFilteredList.every(cust => {
            const cleanP = String(cust.phone || '').replace(/[^0-9]/g, '');
            return selectedCustomerPhones.has(cleanP);
        });
    }

    function isAllCurrentGroupSelected() {
        const currentData = getCurrentPageData();
        if (currentData.length === 0) return false;
        return currentData.every(cust => {
            const cleanP = String(cust.phone || '').replace(/[^0-9]/g, '');
            return selectedCustomerPhones.has(cleanP);
        });
    }

    // 체크박스 선택 상태 관리
    function toggleCustomer(phone, isChecked) {
        const cleanP = String(phone || '').replace(/[^0-9]/g, '');
        if (!cleanP) return;
        if (isChecked) {
            selectedCustomerPhones.add(cleanP);
        } else {
            selectedCustomerPhones.delete(cleanP);
        }
    }

    function toggleSelectAllCurrentGroup(isChecked) {
        const currentData = getCurrentPageData();
        currentData.forEach(cust => {
            const cleanP = String(cust.phone || '').replace(/[^0-9]/g, '');
            if (cleanP) {
                if (isChecked) {
                    selectedCustomerPhones.add(cleanP);
                } else {
                    selectedCustomerPhones.delete(cleanP);
                }
            }
        });
    }

    function isCustomerSelected(phone) {
        const cleanP = String(phone || '').replace(/[^0-9]/g, '');
        return selectedCustomerPhones.has(cleanP);
    }

    function getSelectedCount() {
        return selectedCustomerPhones.size;
    }

    function getSelectedCustomers() {
        return currentFilteredList.filter(c => {
            const cleanP = String(c.phone || '').replace(/[^0-9]/g, '');
            return selectedCustomerPhones.has(cleanP);
        });
    }

    function clearSelections() {
        selectedCustomerPhones.clear();
    }

    return {
        init: init,
        setFilteredList: setFilteredList,
        getCurrentPageData: getCurrentPageData,
        changeGroupPage: changeGroupPage,
        renderGroupPaginationHtml: renderGroupPaginationHtml,
        toggleCustomer: toggleCustomer,
        toggleSelectAllCurrentGroup: toggleSelectAllCurrentGroup,
        toggleSelectAllEntireList: toggleSelectAllEntireList,
        isAllEntireListSelected: isAllEntireListSelected,
        isAllCurrentGroupSelected: isAllCurrentGroupSelected,
        isCustomerSelected: isCustomerSelected,
        getSelectedCount: getSelectedCount,
        getSelectedCustomers: getSelectedCustomers,
        clearSelections: clearSelections,
        ITEMS_PER_GROUP: ITEMS_PER_GROUP,
        getCurrentPage: function() { return currentGroupPage; }
    };
})();

// 글로벌 changeGroupPage 호환 등록
if (typeof window !== 'undefined') { window.GroupManager = GroupManager; }
if (typeof window !== 'undefined') { window.changeGroupPage = function(pageNum) {
    GroupManager.changeGroupPage(pageNum);
}; }

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GroupManager;
}
