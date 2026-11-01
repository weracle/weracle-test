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
            // 100명 이하일 경우: 불필요한 그룹 선택창을 숨김
            return '';
        }

        const totalPages = Math.ceil(total / ITEMS_PER_GROUP);
        const prevDisabled = (currentGroupPage === 1);
        const nextDisabled = (currentGroupPage === totalPages);

        let html = `
        <div class="group-control-box" style="width: 100%; display: flex; align-items: center; gap: 6px; padding: 4px 0 8px; border-bottom: 1px solid #f1f5f9; margin-bottom: 6px;">
            <button type="button" onclick="GroupManager.changeGroupPage(${currentGroupPage - 1})" 
                ${prevDisabled ? 'disabled style="width: 30px; height: 30px; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; color: #cbd5e1; cursor: default; display: flex; align-items: center; justify-content: center; font-size: 11px;"' : 'style="width: 30px; height: 30px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; transition: all 0.15s;"'}>
                ◀
            </button>

            <select onchange="GroupManager.changeGroupPage(parseInt(this.value, 10))" 
                style="flex: 1; height: 30px; font-size: 12.5px; font-weight: 700; color: #1e293b; background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 0 10px; cursor: pointer; outline: none; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
        `;

        for (let p = 1; p <= totalPages; p++) {
            const s = (p - 1) * ITEMS_PER_GROUP + 1;
            const e = Math.min(p * ITEMS_PER_GROUP, total);
            html += `<option value="${p}" ${p === currentGroupPage ? 'selected' : ''}>${p}그룹 (${s.toLocaleString()}~${e.toLocaleString()}명) / 총 ${totalPages}그룹</option>`;
        }

        html += `
            </select>

            <button type="button" onclick="GroupManager.changeGroupPage(${currentGroupPage + 1})" 
                ${nextDisabled ? 'disabled style="width: 30px; height: 30px; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; color: #cbd5e1; cursor: default; display: flex; align-items: center; justify-content: center; font-size: 11px;"' : 'style="width: 30px; height: 30px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; transition: all 0.15s;"'}>
                ▶
            </button>
        </div>
        `;

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
