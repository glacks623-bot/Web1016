/**
 * dataParser.js
 * Handles CSV and Excel file ingestion, header mapping, and data normalization.
 */

const DataParser = {
  /**
   * Parse a File object (CSV, XLSX, XLS)
   * @param {File} file 
   * @returns {Promise<Array<Object>>}
   */
  async parseFile(file) {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.csv')) {
      return this.parseCSV(file);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      return this.parseExcel(file);
    } else {
      throw new Error('지원되지 않는 파일 형식입니다. (.csv, .xlsx, .xls 파일만 지원)');
    }
  },

  /**
   * Parse CSV using PapaParse with automatic encoding fallback (UTF-8 / EUC-KR)
   */
  async parseCSV(file) {
    return new Promise((resolve, reject) => {
      // First attempt reading as UTF-8
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        // Check if there are garbled replacement characters (U+FFFD)
        if (text.includes('\uFFFD')) {
          // Re-read as EUC-KR / CP949
          const euckrReader = new FileReader();
          euckrReader.onload = (ev) => {
            try {
              const rows = this.parseCSVString(ev.target.result);
              resolve(rows);
            } catch (err) {
              reject(err);
            }
          };
          euckrReader.onerror = () => reject(new Error('CSV 파일을 읽는 중 오류가 발생했습니다.'));
          euckrReader.readAsText(file, 'EUC-KR');
        } else {
          try {
            const rows = this.parseCSVString(text);
            resolve(rows);
          } catch (err) {
            reject(err);
          }
        }
      };
      reader.onerror = () => reject(new Error('파일 읽기 실패'));
      reader.readAsText(file, 'UTF-8');
    });
  },

  parseCSVString(csvText) {
    const result = Papa.parse(csvText, {
      skipEmptyLines: true
    });
    if (result.errors && result.errors.length > 0 && (!result.data || result.data.length === 0)) {
      throw new Error('CSV 파싱 오류: ' + result.errors[0].message);
    }
    return this.normalizeRows(result.data);
  },

  /**
   * Parse Excel (.xlsx, .xls) using SheetJS
   */
  async parseExcel(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
          const rows = this.normalizeRows(rawRows);
          resolve(rows);
        } catch (err) {
          reject(new Error('엑셀 파싱 오류: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('엑셀 파일 읽기 실패'));
      reader.readAsArrayBuffer(file);
    });
  },

  /**
   * Clean and normalize raw 2D array of rows into standard Budget Objects
   */
  normalizeRows(rawRows) {
    if (!rawRows || rawRows.length < 2) {
      throw new Error('데이터가 비어 있거나 올바른 헤더가 없습니다.');
    }

    // Find header row (usually row 0 or 1)
    let headerRowIdx = 0;
    for (let r = 0; r < Math.min(5, rawRows.length); r++) {
      const rowStr = rawRows[r].join(' ');
      if (rowStr.includes('대분류') || rowStr.includes('사업명') || rowStr.includes('예산')) {
        headerRowIdx = r;
        break;
      }
    }

    const headers = rawRows[headerRowIdx].map(h => String(h || '').replace(/\r?\n/g, ' ').trim());
    
    // Fuzzy column index resolver
    const findCol = (...keywords) => {
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i].replace(/\s+/g, '');
        for (const kw of keywords) {
          if (h.includes(kw.replace(/\s+/g, ''))) return i;
        }
      }
      return -1;
    };

    const colNo = findCol('연번', '번호', 'No');
    const colCatLarge = findCol('대분류');
    const colCatMid = findCol('중분류');
    const colCatSmall = findCol('소분류');
    const colFunc = findCol('지원기능', '기능');
    const colProjName = findCol('사업명', '과제명');
    const colType = findCol('사업유형', '유형');
    const colConsignment = findCol('위/수탁', '위수탁');
    const colContest = findCol('공모사업', '공모');
    const colOwn = findCol('자체사업', '자체');
    const colCityDept = findCol('소관부서', '부산시');
    const colAgencyDept = findCol('담당부서', '진흥원');
    const colNatBudget = findCol('국비');
    const colCityBudget = findCol('시비');
    const colOtherBudget = findCol('기타', '민자');
    const colTotalBudget = findCol('총예산', '사업비', '합계');
    const colFundingDetail = findCol('재원내역', '재원상세', '재원');
    const colOverview = findCol('주요지원내용', '지원내용', '개요', '주요내용');

    const cleanNum = (val) => {
      if (val === null || val === undefined) return 0;
      if (typeof val === 'number') return isNaN(val) ? 0 : val;
      const s = String(val).replace(/,/g, '').replace(/백만원|천원|원/g, '').trim();
      const n = parseFloat(s);
      return isNaN(n) ? 0 : n;
    };

    const result = [];
    let autoNo = 1;

    for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;
      
      const projName = colProjName >= 0 ? String(row[colProjName] || '').trim() : '';
      const catLarge = colCatLarge >= 0 ? String(row[colCatLarge] || '').trim() : '';
      if (!projName && !catLarge) continue; // skip blank row

      const noVal = colNo >= 0 && row[colNo] !== '' ? parseInt(row[colNo]) || autoNo : autoNo;
      autoNo++;

      const natB = colNatBudget >= 0 ? cleanNum(row[colNatBudget]) : 0;
      const cityB = colCityBudget >= 0 ? cleanNum(row[colCityBudget]) : 0;
      const otherB = colOtherBudget >= 0 ? cleanNum(row[colOtherBudget]) : 0;
      let totalB = colTotalBudget >= 0 ? cleanNum(row[colTotalBudget]) : 0;
      if (totalB === 0 && (natB > 0 || cityB > 0 || otherB > 0)) {
        totalB = natB + cityB + otherB;
      }

      result.push({
        no: noVal,
        catLarge: catLarge || '기타',
        catMid: colCatMid >= 0 ? String(row[colCatMid] || '').trim() : '',
        catSmall: colCatSmall >= 0 ? String(row[colCatSmall] || '').trim() : '',
        supportFunc: colFunc >= 0 ? String(row[colFunc] || '').trim() : '',
        projectName: projName,
        projectType: colType >= 0 ? String(row[colType] || '').trim() : '일반',
        consignment: colConsignment >= 0 ? String(row[colConsignment] || '').trim() : '-',
        publicContest: colContest >= 0 ? String(row[colContest] || '').trim() : '-',
        ownProject: colOwn >= 0 ? String(row[colOwn] || '').trim() : '-',
        dept: colCityDept >= 0 ? String(row[colCityDept] || '').trim() : '',
        agencyDept: colAgencyDept >= 0 ? String(row[colAgencyDept] || '').trim() : '',
        nationalBudget: natB,
        cityBudget: cityB,
        otherBudget: otherB,
        totalBudget: totalB,
        fundingDetail: colFundingDetail >= 0 ? String(row[colFundingDetail] || '').trim() : '',
        overview: colOverview >= 0 ? String(row[colOverview] || '').trim() : ''
      });
    }

    if (result.length === 0) {
      throw new Error('유효한 데이터 행을 찾을 수 없습니다.');
    }

    return result;
  }
};
