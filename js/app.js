/**
 * app.js
 * Main Controller for Budget & Project Analytics Dashboard
 */

const AppState = {
  rawData: [],
  filteredData: [],
  filters: {
    catLarge: 'all',
    catMid: 'all',
    catSmall: 'all',
    dept: 'all',
    projectType: 'all',
    keyword: ''
  },
  pagination: {
    currentPage: 1,
    rowsPerPage: 20
  },
  sorting: {
    column: 'no',
    direction: 'asc'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Charts
  ChartsManager.init();

  // Load Initial Embedded Sample Data
  if (typeof DEFAULT_BUDGET_DATA !== 'undefined' && Array.isArray(DEFAULT_BUDGET_DATA)) {
    loadData(DEFAULT_BUDGET_DATA, '2026년 예산자료 (기본 데이터)');
  }

  // Setup Event Listeners
  setupEventListeners();

  // Initialize Lucide Icons
  if (window.lucide) {
    lucide.createIcons();
  }
});

/**
 * Load and bind a dataset to AppState
 */
function loadData(data, sourceName = '업로드 데이터') {
  AppState.rawData = data;
  document.getElementById('currentFileName').textContent = sourceName;
  document.getElementById('totalRawCount').textContent = `${data.length}개 사업 로드됨`;

  // Populate Filter Dropdowns
  populateFilterOptions();

  // Apply filters & render
  applyFilters();

  showToast(`${sourceName} ${data.length}건이 성공적으로 로드되었습니다.`);
}

/**
 * Setup UI Event Listeners
 */
function setupEventListeners() {
  // 1. File Upload Dropzone
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
      await handleFileUpload(e.target.files[0]);
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-blue-500', 'bg-blue-50/50');
  });

  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-blue-500', 'bg-blue-50/50');
  });

  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-blue-500', 'bg-blue-50/50');
    if (e.dataTransfer.files.length > 0) {
      await handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  // 2. Reset Sample Data Button
  document.getElementById('btnResetSample').addEventListener('click', () => {
    if (typeof DEFAULT_BUDGET_DATA !== 'undefined') {
      // Reset filter inputs
      resetFilters();
      loadData(DEFAULT_BUDGET_DATA, '2026년 예산자료 (기본 데이터)');
    }
  });

  // 3. Cascading Dropdown Filters
  document.getElementById('filterCatLarge').addEventListener('change', (e) => {
    AppState.filters.catLarge = e.target.value;
    AppState.filters.catMid = 'all';
    AppState.filters.catSmall = 'all';
    updateMidAndSmallDropdowns();
    applyFilters();
  });

  document.getElementById('filterCatMid').addEventListener('change', (e) => {
    AppState.filters.catMid = e.target.value;
    AppState.filters.catSmall = 'all';
    updateSmallDropdown();
    applyFilters();
  });

  document.getElementById('filterCatSmall').addEventListener('change', (e) => {
    AppState.filters.catSmall = e.target.value;
    applyFilters();
  });

  document.getElementById('filterDept').addEventListener('change', (e) => {
    AppState.filters.dept = e.target.value;
    applyFilters();
  });

  document.getElementById('filterType').addEventListener('change', (e) => {
    AppState.filters.projectType = e.target.value;
    applyFilters();
  });

  // 4. Keyword Search with Debounce
  let searchTimeout = null;
  document.getElementById('searchKeyword').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      AppState.filters.keyword = e.target.value.trim().toLowerCase();
      applyFilters();
    }, 150);
  });

  // 5. Reset Filters Button
  document.getElementById('btnResetFilters').addEventListener('click', resetFilters);

  // 6. Rows Per Page
  document.getElementById('rowsPerPage').addEventListener('change', (e) => {
    AppState.pagination.rowsPerPage = parseInt(e.target.value) || 20;
    AppState.pagination.currentPage = 1;
    renderTable();
  });

  // 7. Excel Export Button
  document.getElementById('btnExportExcel').addEventListener('click', exportToExcel);

  // 8. Modal Close Buttons
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('detailModal').addEventListener('click', (e) => {
    if (e.target.id === 'detailModal') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

/**
 * Handle File Upload parsing
 */
async function handleFileUpload(file) {
  try {
    showLoading(true);
    const parsedData = await DataParser.parseFile(file);
    resetFilters();
    loadData(parsedData, file.name);
  } catch (err) {
    alert(`파일 처리 오류: ${err.message}`);
  } finally {
    showLoading(false);
  }
}

/**
 * Populate All Initial Filter Dropdowns
 */
function populateFilterOptions() {
  const catLargeSet = new Set();
  const deptSet = new Set();
  const typeSet = new Set();

  AppState.rawData.forEach(d => {
    if (d.catLarge) catLargeSet.add(d.catLarge);
    if (d.dept) deptSet.add(d.dept);
    if (d.projectType) typeSet.add(d.projectType);
  });

  populateSelect('filterCatLarge', Array.from(catLargeSet).sort());
  populateSelect('filterDept', Array.from(deptSet).sort());
  populateSelect('filterType', Array.from(typeSet).sort());

  updateMidAndSmallDropdowns();
}

/**
 * Update Mid & Small Category Dropdowns based on CatLarge selection
 */
function updateMidAndSmallDropdowns() {
  const selectedLarge = AppState.filters.catLarge;
  const filtered = selectedLarge === 'all' 
    ? AppState.rawData 
    : AppState.rawData.filter(d => d.catLarge === selectedLarge);

  const catMidSet = new Set();
  filtered.forEach(d => {
    if (d.catMid) catMidSet.add(d.catMid);
  });

  populateSelect('filterCatMid', Array.from(catMidSet).sort());
  updateSmallDropdown();
}

function updateSmallDropdown() {
  const selectedLarge = AppState.filters.catLarge;
  const selectedMid = AppState.filters.catMid;

  let filtered = AppState.rawData;
  if (selectedLarge !== 'all') filtered = filtered.filter(d => d.catLarge === selectedLarge);
  if (selectedMid !== 'all') filtered = filtered.filter(d => d.catMid === selectedMid);

  const catSmallSet = new Set();
  filtered.forEach(d => {
    if (d.catSmall) catSmallSet.add(d.catSmall);
  });

  populateSelect('filterCatSmall', Array.from(catSmallSet).sort());
}

function populateSelect(elemId, items) {
  const select = document.getElementById(elemId);
  const currentVal = select.value;
  // Keep the first "전체" option
  const firstOption = select.options[0].outerHTML;
  select.innerHTML = firstOption + items.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');

  if (items.includes(currentVal)) {
    select.value = currentVal;
  } else {
    select.value = 'all';
  }
}

/**
 * Reset all filter controls
 */
function resetFilters() {
  AppState.filters.catLarge = 'all';
  AppState.filters.catMid = 'all';
  AppState.filters.catSmall = 'all';
  AppState.filters.dept = 'all';
  AppState.filters.projectType = 'all';
  AppState.filters.keyword = '';

  document.getElementById('filterCatLarge').value = 'all';
  document.getElementById('filterDept').value = 'all';
  document.getElementById('filterType').value = 'all';
  document.getElementById('searchKeyword').value = '';

  updateMidAndSmallDropdowns();
  applyFilters();
}

/**
 * Core Filter Logic
 */
function applyFilters() {
  const { catLarge, catMid, catSmall, dept, projectType, keyword } = AppState.filters;

  AppState.filteredData = AppState.rawData.filter(item => {
    if (catLarge !== 'all' && item.catLarge !== catLarge) return false;
    if (catMid !== 'all' && item.catMid !== catMid) return false;
    if (catSmall !== 'all' && item.catSmall !== catSmall) return false;
    if (dept !== 'all' && item.dept !== dept && item.agencyDept !== dept) return false;
    if (projectType !== 'all' && item.projectType !== projectType) return false;

    if (keyword) {
      const matchName = item.projectName && item.projectName.toLowerCase().includes(keyword);
      const matchOverview = item.overview && item.overview.toLowerCase().includes(keyword);
      const matchSmall = item.catSmall && item.catSmall.toLowerCase().includes(keyword);
      const matchDept = item.dept && item.dept.toLowerCase().includes(keyword);
      if (!matchName && !matchOverview && !matchSmall && !matchDept) return false;
    }

    return true;
  });

  // Apply Sorting
  sortFilteredData();

  // Reset to first page
  AppState.pagination.currentPage = 1;

  // Render KPIs, Charts, Table
  renderKPIs();
  ChartsManager.update(AppState.filteredData);
  renderTable();
}

/**
 * Sort Filtered Data
 */
function sortFilteredData() {
  const { column, direction } = AppState.sorting;
  const factor = direction === 'asc' ? 1 : -1;

  AppState.filteredData.sort((a, b) => {
    let valA = a[column];
    let valB = b[column];

    if (typeof valA === 'string') {
      return valA.localeCompare(valB, 'ko') * factor;
    }
    return ((valA || 0) - (valB || 0)) * factor;
  });
}

/**
 * Render 4 KPI Summary Cards
 */
function renderKPIs() {
  const totalRaw = AppState.rawData.length;
  const filteredCount = AppState.filteredData.length;
  const percent = totalRaw > 0 ? ((filteredCount / totalRaw) * 100).toFixed(1) : 0;

  // 1. Project Count
  document.getElementById('kpiProjectCount').textContent = `${filteredCount}건`;
  document.getElementById('kpiProjectPercent').textContent = `전체 ${totalRaw}건 중 ${percent}%`;

  // 2. Budget Sums
  let sumTotal = 0;
  let sumCity = 0;
  let sumNational = 0;
  let sumOther = 0;
  const depts = new Set();
  const catLarges = new Set();

  AppState.filteredData.forEach(d => {
    sumTotal += d.totalBudget;
    sumCity += d.cityBudget;
    sumNational += d.nationalBudget;
    sumOther += d.otherBudget;
    if (d.dept) depts.add(d.dept);
    if (d.catLarge) catLarges.add(d.catLarge);
  });

  const eok = (sumTotal / 100).toFixed(1);
  document.getElementById('kpiTotalBudget').textContent = `${sumTotal.toLocaleString()} 백만원`;
  document.getElementById('kpiTotalBudgetEok').textContent = `약 ${eok}억 원`;

  // 3. Ratio
  const cityRatio = sumTotal > 0 ? ((sumCity / sumTotal) * 100).toFixed(1) : 0;
  const natRatio = sumTotal > 0 ? ((sumNational / sumTotal) * 100).toFixed(1) : 0;
  document.getElementById('kpiCityRatio').textContent = `시비 ${cityRatio}%`;
  document.getElementById('kpiNatRatio').textContent = `국비 ${natRatio}%`;
  document.getElementById('kpiProgressBar').style.width = `${cityRatio}%`;

  // 4. Department & Category count
  document.getElementById('kpiDeptCount').textContent = `${depts.size}개 부서`;
  document.getElementById('kpiCatCount').textContent = `${catLarges.size}개 전략 분야 구성`;
}

/**
 * Render Data Grid Table & Pagination
 */
function renderTable() {
  const tbody = document.getElementById('tableBody');
  const count = AppState.filteredData.length;
  const { currentPage, rowsPerPage } = AppState.pagination;

  if (count === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="py-12 text-center text-slate-400">
          <i data-lucide="search-x" class="w-12 h-12 mx-auto mb-3 opacity-40"></i>
          <p class="text-base font-medium">검색 및 필터 조건에 일치하는 사업이 없습니다.</p>
          <p class="text-sm text-slate-400 mt-1">상단의 필터를 변경하거나 [필터 초기화]를 눌러보세요.</p>
        </td>
      </tr>
    `;
    if (window.lucide) lucide.createIcons();
    renderPagination(0);
    return;
  }

  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, count);
  const pageItems = AppState.filteredData.slice(startIndex, endIndex);

  tbody.innerHTML = pageItems.map(item => {
    // Badges
    const badgeType = item.projectType === '공모사업'
      ? `<span class="px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full">공모</span>`
      : item.projectType === '위/수탁'
      ? `<span class="px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full">위수탁</span>`
      : `<span class="px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-800 rounded-full">자체</span>`;

    return `
      <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition-colors cursor-pointer group" onclick="openDetailModal(${item.no})">
        <td class="py-3 px-4 text-center text-xs font-mono text-slate-500">${String(item.no).padStart(2, '0')}</td>
        <td class="py-3 px-4 text-xs font-medium text-slate-700 whitespace-nowrap">${escapeHtml(item.catLarge)}</td>
        <td class="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">${escapeHtml(item.catSmall || '-')}</td>
        <td class="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">${escapeHtml(item.dept || item.agencyDept)}</td>
        <td class="py-3 px-4">
          <div class="flex items-center gap-2">
            ${badgeType}
            <span class="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">${escapeHtml(item.projectName)}</span>
          </div>
        </td>
        <td class="py-3 px-4 text-right text-xs font-mono text-slate-600">${item.nationalBudget.toLocaleString()}</td>
        <td class="py-3 px-4 text-right text-xs font-mono text-slate-600">${item.cityBudget.toLocaleString()}</td>
        <td class="py-3 px-4 text-right text-sm font-mono font-bold text-slate-900">${item.totalBudget.toLocaleString()}</td>
        <td class="py-3 px-4 text-center">
          <button class="px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors" onclick="event.stopPropagation(); openDetailModal(${item.no})">
            상세
          </button>
        </td>
      </tr>
    `;
  }).join('');

  renderPagination(count);
}

/**
 * Render Pagination Controls
 */
function renderPagination(totalCount) {
  const container = document.getElementById('paginationControls');
  const { currentPage, rowsPerPage } = AppState.pagination;
  const totalPages = Math.ceil(totalCount / rowsPerPage);

  if (totalPages <= 1) {
    container.innerHTML = `<span class="text-xs text-slate-400">총 ${totalCount}개 중 ${totalCount}개 표시 중</span>`;
    return;
  }

  let html = `
    <div class="flex items-center gap-1">
      <button class="px-2.5 py-1 text-xs border rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed" 
              onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
        이전
      </button>
  `;

  const maxButtons = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  for (let p = startPage; p <= endPage; p++) {
    const active = p === currentPage;
    html += `
      <button class="w-8 h-8 text-xs font-semibold rounded-lg transition-colors ${active ? 'bg-blue-600 text-white' : 'border hover:bg-slate-50 text-slate-700'}"
              onclick="changePage(${p})">
        ${p}
      </button>
    `;
  }

  html += `
      <button class="px-2.5 py-1 text-xs border rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed" 
              onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
        다음
      </button>
    </div>
    <span class="text-xs text-slate-500">
      ${currentPage} / ${totalPages} 페이지 (총 ${totalCount}건)
    </span>
  `;

  container.innerHTML = html;
}

function changePage(page) {
  const totalPages = Math.ceil(AppState.filteredData.length / AppState.pagination.rowsPerPage);
  if (page < 1 || page > totalPages) return;
  AppState.pagination.currentPage = page;
  renderTable();
}

/**
 * Table Header Sorting
 */
function handleSort(column) {
  if (AppState.sorting.column === column) {
    AppState.sorting.direction = AppState.sorting.direction === 'asc' ? 'desc' : 'asc';
  } else {
    AppState.sorting.column = column;
    AppState.sorting.direction = 'desc';
  }

  // Update sort icons
  document.querySelectorAll('.sort-icon').forEach(icon => icon.textContent = '↕');
  const activeIcon = document.getElementById(`sort-${column}`);
  if (activeIcon) {
    activeIcon.textContent = AppState.sorting.direction === 'asc' ? '↑' : '↓';
  }

  sortFilteredData();
  renderTable();
}

/**
 * Open Detail Modal
 */
function openDetailModal(no) {
  const item = AppState.rawData.find(d => d.no === no);
  if (!item) return;

  document.getElementById('modalNo').textContent = `#${String(item.no).padStart(2, '0')}`;
  document.getElementById('modalTitle').textContent = item.projectName;
  document.getElementById('modalDept').textContent = item.dept || item.agencyDept || '-';
  document.getElementById('modalAgency').textContent = item.agencyDept || '-';
  document.getElementById('modalType').textContent = item.projectType || '-';
  document.getElementById('modalCategory').textContent = `${item.catLarge} > ${item.catMid} > ${item.catSmall}`;
  document.getElementById('modalFunc').textContent = item.supportFunc || '-';

  // Budget info
  document.getElementById('modalTotal').textContent = `${item.totalBudget.toLocaleString()} 백만원`;
  document.getElementById('modalCity').textContent = `${item.cityBudget.toLocaleString()} 백만원`;
  document.getElementById('modalNat').textContent = `${item.nationalBudget.toLocaleString()} 백만원`;
  document.getElementById('modalOther').textContent = `${item.otherBudget.toLocaleString()} 백만원`;
  document.getElementById('modalDetailBudget').textContent = item.fundingDetail || '별도 상세 없음';

  // Overview
  document.getElementById('modalOverview').textContent = item.overview || '등록된 주요 지원 내용이 없습니다.';

  document.getElementById('detailModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('detailModal').classList.add('hidden');
}

/**
 * Export Filtered Data to Excel using SheetJS
 */
function exportToExcel() {
  if (!AppState.filteredData || AppState.filteredData.length === 0) {
    alert('내보낼 데이터가 없습니다.');
    return;
  }

  const exportRows = AppState.filteredData.map(d => ({
    '연번': d.no,
    '대분류': d.catLarge,
    '중분류': d.catMid,
    '소분류': d.catSmall,
    '지원기능': d.supportFunc,
    '사업명': d.projectName,
    '사업유형': d.projectType,
    '부산시 소관부서': d.dept,
    '진흥원 담당부서': d.agencyDept,
    '국비(백만원)': d.nationalBudget,
    '시비(백만원)': d.cityBudget,
    '기타/민자(백만원)': d.otherBudget,
    '2026년 총예산(백만원)': d.totalBudget,
    '재원 내역 상세': d.fundingDetail,
    '주요 지원 내용': d.overview
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '예산조회결과');

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  XLSX.writeFile(workbook, `예산지원사업_조회결과_${dateStr}.xlsx`);

  showToast(`엑셀 파일(총 ${exportRows.length}건)이 다운로드되었습니다.`);
}

/**
 * Toast Notification
 */
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('opacity-0', 'pointer-events-none');
  setTimeout(() => {
    toast.classList.add('opacity-0', 'pointer-events-none');
  }, 2800);
}

function showLoading(isLoading) {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.toggle('hidden', !isLoading);
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
