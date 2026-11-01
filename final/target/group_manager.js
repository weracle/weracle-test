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
            // 100명 이하일 경우: 불필요한 그룹 탭을 숨겨 깔끔하게 표시
            return '';
        }

        const totalPages = Math.ceil(total / ITEMS_PER_GROUP);
        let html = `<div class="group-tab-bar" style="display: flex; gap: 8px; overflow-x: auto; padding: 4px 0 10px; width: 100%; border-bottom: 1px solid #f1f5f9; margin-bottom: 10px;">`;

        for (let i = 1; i <= totalPages; i++) {
            const startNum = (i - 1) * ITEMS_PER_GROUP + 1;
            const endNum = Math.min(i * ITEMS_PER_GROUP, total);
            const isActive = (i === currentGroupPage);

            const activeStyle = isActive 
                ? "background: #0284c7; color: #ffffff; border: 1.5px solid #0284c7; box-shadow: 0 4px 12px rgba(2,132,199,0.25);"
                : "background: #f8fafc; color: #475569; border: 1.5px solid #e2e8f0;";

            html += `
                <button type="button" onclick="GroupManager.changeGroupPage(${i})" 
                    style="flex-shrink: 0; padding: 7px 16px; border-radius: 20px; font-size: 13px; font-weight: 800; cursor: pointer; transition: all 0.2s; ${activeStyle}">
                    ${i}그룹 (${startNum}~${endNum}명)
                </button>
            `;
        }
        html += `</div>`;
        return html;
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
window.changeGroupPage = function(pageNum) {
    GroupManager.changeGroupPage(pageNum);
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GroupManager;
}
