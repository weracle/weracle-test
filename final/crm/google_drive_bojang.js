/**
 * ==============================================================================
 * [WERACLE] Google Drive & Sheets 보장분석 연동 독립 모듈
 * ==============================================================================
 * 설계사 개인 구글 계정(Google Drive / Sheets)과 보장분석 PDF를 안전하게 연동합니다.
 * 
 * [원칙]
 * 1. 무간섭/독립성: 기존 CRM 코드를 해치지 않으며, 모든 작업은 완벽한 try/catch 예외 처리
 * 2. 설계사 자산 귀속: 고객 데이터 및 파일은 플랫폼이 아닌 설계사 본인 Google Drive/Sheet에 보관
 * 3. 3단계 폴더 트리: [위라클_고객관리] -> [{고객UID}_{고객명}] -> [보장분석]
 * ==============================================================================
 */

(function(window) {
    'use strict';

    const GoogleDriveBojang = {
        ROOT_FOLDER_NAME: '위라클_고객관리',
        BOJANG_SUBFOLDER_NAME: '보장분석',
        SHEET_TAB_NAME: '보장분석_이력',

        // 1. Google OAuth Access Token 조회
        getAccessToken: function() {
            try {
                if (window.gapi && window.gapi.client && window.gapi.client.getToken()) {
                    const t = window.gapi.client.getToken();
                    if (t && t.access_token) return t.access_token;
                }
            } catch(e) {}

            try {
                const localToken = localStorage.getItem('g_access_token');
                if (localToken) return localToken;
            } catch(e) {}

            try {
                if (window.currentProfile && window.currentProfile.google_access_token) {
                    return window.currentProfile.google_access_token;
                }
            } catch(e) {}

            try {
                const cachedProf = JSON.parse(localStorage.getItem('cached_profile') || '{}');
                if (cachedProf.google_access_token) return cachedProf.google_access_token;
            } catch(e) {}

            return null;
        },

        // 2. 활성 Google Spreadsheet ID 조회
        getSpreadsheetId: function() {
            try {
                if (window.spreadsheetId) return window.spreadsheetId;
            } catch(e) {}

            try {
                const localSheet = localStorage.getItem('g_sheet_id');
                if (localSheet) return localSheet;
            } catch(e) {}

            try {
                if (window.currentProfile && window.currentProfile.google_sheet_id) {
                    return window.currentProfile.google_sheet_id;
                }
            } catch(e) {}

            try {
                const cachedProf = JSON.parse(localStorage.getItem('cached_profile') || '{}');
                if (cachedProf.google_sheet_id) return cachedProf.google_sheet_id;
            } catch(e) {}

            return null;
        },

        // 3. Google Drive 폴더 검색 또는 생성 (REST API v3)
        getOrCreateFolder: async function(folderName, parentFolderId = null, token = null) {
            token = token || this.getAccessToken();
            if (!token) throw new Error('구글 인증 토큰이 없습니다. 구글 로그인을 확인해 주세요.');

            try {
                // 검색 쿼리 구성
                let query = `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
                if (parentFolderId) {
                    query += ` and '${parentFolderId}' in parents`;
                }

                const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`;
                const searchResp = await fetch(searchUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (searchResp.ok) {
                    const searchData = await searchResp.json();
                    if (searchData.files && searchData.files.length > 0) {
                        return searchData.files[0].id; // 기존 폴더 발견
                    }
                }

                // 폴더가 없으면 새로 생성
                const createMeta = {
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder'
                };
                if (parentFolderId) {
                    createMeta.parents = [parentFolderId];
                }

                const createResp = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(createMeta)
                });

                if (!createResp.ok) {
                    const errTxt = await createResp.text();
                    throw new Error(`구글 드라이브 폴더 생성 실패: ${errTxt}`);
                }

                const createdData = await createResp.json();
                return createdData.id;
            } catch(err) {
                console.error('[GoogleDriveBojang.getOrCreateFolder Error]:', err);
                throw err;
            }
        },

        // 4. 고객별 3단계 드라이브 경로 확보
        // [위라클_고객관리] -> [{고객UID}_{고객명}] -> [보장분석]
        ensureCustomerBojangFolder: async function(customerUid, customerName, token = null) {
            token = token || this.getAccessToken();
            const rootId = await this.getOrCreateFolder(this.ROOT_FOLDER_NAME, null, token);
            const sanitizedName = (customerName || '고객').trim().replace(/[\/\\:*?"<>|]/g, '_');
            const sanitizedUid = String(customerUid || 'UNKNOWN').trim().replace(/[\/\\:*?"<>|]/g, '_');
            const custFolderName = `[${sanitizedUid}] ${sanitizedName}`;

            const custFolderId = await this.getOrCreateFolder(custFolderName, rootId, token);
            const bojangFolderId = await this.getOrCreateFolder(this.BOJANG_SUBFOLDER_NAME, custFolderId, token);
            return {
                rootId: rootId,
                custFolderId: custFolderId,
                bojangFolderId: bojangFolderId
            };
        },

        // 5. 보장분석 PDF를 구글 드라이브에 직접 업로드 (Multipart REST API)
        uploadPdfToDrive: async function(targetFolderId, fileName, pdfBlob, token = null) {
            token = token || this.getAccessToken();
            if (!token) throw new Error('구글 인증 토큰이 필요합니다.');

            const metadata = {
                name: fileName,
                mimeType: 'application/pdf',
                parents: [targetFolderId]
            };

            const boundary = '-------314159265358979323846';
            const delimiter = `\r\n--${boundary}\r\n`;
            const closeDelim = `\r\n--${boundary}--`;

            const metaPart = `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
            const fileHeader = `Content-Type: application/pdf\r\n\r\n`;

            const pdfArrayBuffer = await pdfBlob.arrayBuffer();

            // 바이너리 Multipart 조합
            const enc = new TextEncoder();
            const p1 = enc.encode(delimiter + metaPart + delimiter + fileHeader);
            const p2 = new Uint8Array(pdfArrayBuffer);
            const p3 = enc.encode(closeDelim);

            const fullLength = p1.byteLength + p2.byteLength + p3.byteLength;
            const fullBody = new Uint8Array(fullLength);
            fullBody.set(p1, 0);
            fullBody.set(p2, p1.byteLength);
            fullBody.set(p3, p1.byteLength + p2.byteLength);

            const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink,createdTime,size';
            const uploadResp = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`
                },
                body: fullBody
            });

            if (!uploadResp.ok) {
                const errDetail = await uploadResp.text();
                throw new Error(`구글 드라이브 업로드 실패: ${errDetail}`);
            }

            const fileData = await uploadResp.json();
            return {
                fileId: fileData.id,
                fileName: fileData.name,
                webViewLink: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`,
                webContentLink: fileData.webContentLink || `https://drive.google.com/uc?id=${fileData.id}&export=download`,
                createdTime: fileData.createdTime || new Date().toISOString()
            };
        },

        // 6. 구글 시트(Sheet)에 보장분석 이력 자동 기록
        recordToGoogleSheet: async function(record, token = null) {
            token = token || this.getAccessToken();
            const spreadsheetId = this.getSpreadsheetId();
            if (!spreadsheetId || !token) {
                console.warn('[GoogleDriveBojang] Google Sheet 정보 없음, 시트 기록 건너뜀.');
                return false;
            }

            try {
                // 1) '보장분석_이력' 시트 존재 여부 확인
                const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
                const metaResp = await fetch(metaUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (metaResp.ok) {
                    const metaData = await metaResp.json();
                    const sheetExists = (metaData.sheets || []).some(s => s.properties && s.properties.title === this.SHEET_TAB_NAME);

                    if (!sheetExists) {
                        // 새 탭 생성
                        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                requests: [{
                                    addSheet: {
                                        properties: { title: this.SHEET_TAB_NAME }
                                    }
                                }]
                            })
                        });

                        // 헤더 삽입
                        const headers = [
                            ["저장일시", "고객UID", "고객명", "연락처", "파일명", "드라이브링크", "분석요약", "표지디자인", "파일ID"]
                        ];
                        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(this.SHEET_TAB_NAME)}!A1:I1?valueInputOption=USER_ENTERED`, {
                            method: 'PUT',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ values: headers })
                        });
                    }
                }

                // 2) 행 데이터 추가 (Append)
                const nowStr = new Date().toLocaleString('ko-KR', { hour12: false });
                const rowData = [
                    nowStr,
                    String(record.customerUid || ''),
                    String(record.customerName || ''),
                    String(record.phone || ''),
                    String(record.fileName || ''),
                    String(record.webViewLink || ''),
                    String(record.summaryText || ''),
                    String(record.coverTitle || ''),
                    String(record.fileId || '')
                ];

                const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(this.SHEET_TAB_NAME)}!A:I:append?valueInputOption=USER_ENTERED`;
                const appendResp = await fetch(appendUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ values: [rowData] })
                });

                return appendResp.ok;
            } catch(e) {
                console.warn('[GoogleDriveBojang.recordToGoogleSheet Error]:', e);
                return false;
            }
        },

        // 7. 특정 고객의 보장분석 리포트 목록 조회
        fetchCustomerReports: async function(customerUid, token = null) {
            token = token || this.getAccessToken();
            const spreadsheetId = this.getSpreadsheetId();
            if (!spreadsheetId || !token) return [];

            try {
                const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(this.SHEET_TAB_NAME)}!A2:I?valueRenderOption=FORMATTED_VALUE`;
                const resp = await fetch(readUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!resp.ok) return [];
                const data = await resp.json();
                const rows = data.values || [];

                const targetUidStr = String(customerUid).trim();
                const matched = [];

                for (let i = rows.length - 1; i >= 0; i--) { // 최신순
                    const r = rows[i];
                    const rUid = String(r[1] || '').trim();
                    if (rUid === targetUidStr) {
                        matched.push({
                            date: r[0] || '',
                            customerUid: r[1] || '',
                            customerName: r[2] || '',
                            phone: r[3] || '',
                            fileName: r[4] || '',
                            webViewLink: r[5] || '',
                            summaryText: r[6] || '',
                            coverTitle: r[7] || '',
                            fileId: r[8] || ''
                        });
                    }
                }
                return matched;
            } catch(e) {
                console.warn('[GoogleDriveBojang.fetchCustomerReports Error]:', e);
                return [];
            }
        },

        // 8. 로컬 캐시된 고객 목록 가져오기 (Customer Picker 용)
        getCachedCustomers: function() {
            try {
                if (window.globalCustomerData && Array.isArray(window.globalCustomerData) && window.globalCustomerData.length > 0) {
                    return window.globalCustomerData;
                }
            } catch(e) {}

            try {
                const c = localStorage.getItem('weracle_crm_customers_cache');
                if (c) return JSON.parse(c);
            } catch(e) {}

            try {
                const d = localStorage.getItem('demo_crm_data');
                if (d) return JSON.parse(d);
            } catch(e) {}

            return [];
        },

        // 9. 보장분석 요약 텍스트 포맷터
        formatDynamicSummary: function(summary) {
            if (!summary) return '기본 보장분석 리포트';
            const parts = [];
            if (summary.contracts) parts.push('계약 ' + summary.contracts + '건');
            if (summary.premium) parts.push('월납 ' + summary.premium + '원');
            const statusParts = [];
            if (summary.stOk !== null && summary.stOk !== undefined) statusParts.push('충분 ' + summary.stOk);
            if (summary.stWarn !== null && summary.stWarn !== undefined) statusParts.push('부족 ' + summary.stWarn);
            if (summary.stMiss !== null && summary.stMiss !== undefined) statusParts.push('미가입 ' + summary.stMiss);
            if (statusParts.length > 0) parts.push(statusParts.join('/'));
            return parts.length > 0 ? parts.join(' | ') : '보장분석 완료';
        },

        // 10. 구글 로그인 및 권한 요청 헬퍼
        requestGoogleAuth: function(callback) {
            const GOOGLE_CLIENT_ID = '281609603311-j6ie378elv518odovep2rjemeaffb40b.apps.googleusercontent.com';
            const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events';
            
            if (window.google && window.google.accounts && window.google.accounts.oauth2) {
                try {
                    const tokenClient = window.google.accounts.oauth2.initTokenClient({
                        client_id: GOOGLE_CLIENT_ID,
                        scope: SCOPES,
                        callback: function(resp) {
                            if (resp && resp.access_token) {
                                try { localStorage.setItem('g_access_token', resp.access_token); } catch(e) {}
                                if (window.gapi && window.gapi.client) {
                                    window.gapi.client.setToken({ access_token: resp.access_token });
                                }
                                if (callback) callback(resp.access_token);
                            }
                        }
                    });
                    tokenClient.requestAccessToken({ prompt: 'consent' });
                } catch(e) {
                    console.error('[GoogleDriveBojang.requestGoogleAuth error]:', e);
                    alert('구글 로그인 연동 중 오류가 발생했습니다: ' + (e.message || e));
                }
            } else {
                alert('구글 인증 라이브러리가 로드되지 않았습니다. CRM 메인 화면에서 구글 로그인을 먼저 진행해 주세요.');
            }
        },

        // 11. CRM 고객 상세 화면의 [보장분석] 탭 렌더러
        renderBojangTab: async function(container, customerUid, customerName) {
            if (typeof container === 'string') {
                container = document.getElementById(container);
            }
            if (!container) return;

            container.innerHTML = '<div style="text-align:center; padding:32px 16px; color:#64748b; font-size:13.5px;">' +
                '<i class="fa-solid fa-spinner fa-spin" style="margin-right:8px; color:#2563eb; font-size:18px;"></i>' +
                'Google Drive 보장분석 리포트 목록을 불러오는 중입니다...' +
            '</div>';

            const token = this.getAccessToken();

            if (!token) {
                const cIdSafe = container.id || '';
                const uidSafe = String(customerUid || '').replace(/'/g, "\'");
                const nameSafe = String(customerName || '').replace(/'/g, "\'");
                container.innerHTML = `
                    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:28px 20px; text-align:center;">
                        <div style="font-size:36px; margin-bottom:12px;">🔒</div>
                        <h4 style="margin:0 0 8px 0; font-size:15px; font-weight:800; color:#1e293b;">Google 계정 연동 필요</h4>
                        <p style="margin:0 0 16px 0; font-size:13px; color:#64748b; line-height:1.5;">
                            설계사 개인 구글 드라이브 및 스프레드시트와 연동되어 있습니다.<br>
                            구글 로그인을 연결하시면 저장된 보장분석 리포트를 바로 확인하실 수 있습니다.
                        </p>
                        <button onclick="GoogleDriveBojang.requestGoogleAuth(function(){ GoogleDriveBojang.renderBojangTab('${cIdSafe}', '${uidSafe}', '${nameSafe}'); })"
                                style="background:#2563eb; color:#fff; border:none; padding:9px 18px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 6px rgba(37,99,235,0.25);">
                            <i class="fa-brands fa-google"></i> Google 계정 연결
                        </button>
                    </div>
                `;
                return;
            }

            try {
                const reports = await this.fetchCustomerReports(customerUid, token);

                if (!reports || reports.length === 0) {
                    container.innerHTML = '<div style="background:#fff; border:1px dashed #cbd5e1; border-radius:12px; padding:32px 20px; text-align:center;">' +
                        '<div style="font-size:40px; margin-bottom:10px;">📁</div>' +
                        '<h4 style="margin:0 0 6px 0; font-size:15px; font-weight:800; color:#1e293b;">저장된 보장분석 리포트가 없습니다</h4>' +
                        '<p style="margin:0 0 16px 0; font-size:12.5px; color:#64748b; line-height:1.5;">' +
                            '<b>' + (customerName || '고객') + '</b> 님의 전용 드라이브 폴더에 보장분석 리포트를 보관해보세요.<br>' +
                            '[보장 브랜딩]에서 PDF 제작 후 <b>&apos;구글 드라이브에 저장&apos;</b>을 클릭하면 자동 연동됩니다.' +
                        '</p>' +
                        '<a href="../branding/pdf_p.html" target="_blank" ' +
                           'style="background:#0284c7; color:#fff; text-decoration:none; padding:9px 18px; border-radius:8px; font-weight:700; font-size:13px; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 6px rgba(2,132,199,0.25);">' +
                            '<i class="fa-solid fa-file-invoice"></i> 보장분석 리포트 제작하기' +
                        '</a>' +
                    '</div>';
                    return;
                }

                // 리포트 목록 렌더링
                let reportsHtml = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding:0 2px;">' +
                    '<span style="font-size:13px; font-weight:800; color:#0f172a;">' +
                        '<i class="fa-solid fa-folder-closed" style="color:#f59e0b; margin-right:6px;"></i> 보관된 리포트 (' + reports.length + '건)' +
                    '</span>' +
                    '<a href="../branding/pdf_p.html" target="_blank" ' +
                       'style="font-size:12px; font-weight:700; color:#0284c7; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">' +
                        '<i class="fa-solid fa-plus"></i> 새 리포트 제작' +
                    '</a>' +
                '</div>' +
                '<div style="display:flex; flex-direction:column; gap:10px;">';

                reports.forEach((rep) => {
                    const downloadUrl = rep.fileId ? ('https://drive.google.com/uc?export=download&id=' + rep.fileId) : rep.webViewLink;
                    const dateDisplay = rep.date ? rep.date.split(' ')[0] : '-';
                    reportsHtml += '<div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">' +
                        '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; gap:8px;">' +
                            '<div style="font-weight:800; font-size:13px; color:#0f172a; display:flex; align-items:center; gap:6px; word-break:break-all;">' +
                                '<i class="fa-solid fa-file-pdf" style="color:#ef4444; font-size:15px; flex-shrink:0;"></i>' +
                                '<span>' + (rep.fileName || '보장분석_리포트.pdf') + '</span>' +
                            '</div>' +
                            '<span style="font-size:11px; font-weight:700; color:#64748b; background:#f1f5f9; padding:3px 7px; border-radius:6px; white-space:nowrap; flex-shrink:0;">' +
                                '<i class="fa-regular fa-clock"></i> ' + dateDisplay +
                            '</span>' +
                        '</div>';

                    if (rep.summaryText) {
                        reportsHtml += '<div style="font-size:12px; color:#334155; background:#f8fafc; border-radius:6px; padding:7px 10px; margin-bottom:10px; line-height:1.4;">' +
                            '<span style="color:#64748b; font-weight:700; margin-right:4px;">📊 분석요약:</span> ' + rep.summaryText +
                        '</div>';
                    }

                    reportsHtml += '<div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end; align-items:center;">';
                    if (rep.fileId) {
                        const repNameEsc = (rep.fileName || '보장분석_리포트.pdf').replace(/'/g, "\\'");
                        const repLinkEsc = (rep.webViewLink || '').replace(/'/g, "\\'");
                        reportsHtml += '<button type="button" onclick="GoogleDriveBojang.openPdfViewer(\'' + rep.fileId + '\', \'' + repNameEsc + '\', \'' + repLinkEsc + '\')" ' +
                           'style="background:linear-gradient(135deg, #1d4ed8, #2563eb); color:#ffffff; border:none; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 4px rgba(37,99,235,0.2); transition:all 0.15s;" onmouseover="this.style.opacity=\'0.95\'" onmouseout="this.style.opacity=\'1\'">' +
                            '<i class="fa-solid fa-eye"></i> 리포트 바로보기' +
                        '</button>';
                    }
                    if (rep.webViewLink) {
                        reportsHtml += '<a href="' + rep.webViewLink + '" target="_blank" ' +
                           'style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; text-decoration:none; padding:6px 11px; border-radius:6px; font-size:12px; font-weight:700; display:inline-flex; align-items:center; gap:5px; transition:all 0.15s;" onmouseover="this.style.background=\'#dbeafe\'" onmouseout="this.style.background=\'#eff6ff\'">' +
                            '<i class="fa-brands fa-google-drive"></i> 구글드라이브에서 보기' +
                        '</a>';
                    }
                    reportsHtml += '<a href="' + downloadUrl + '" target="_blank" download ' +
                           'style="background:#f8fafc; color:#475569; border:1px solid #cbd5e1; text-decoration:none; padding:6px 10px; border-radius:6px; font-size:12px; font-weight:700; display:inline-flex; align-items:center; gap:4px; transition:all 0.15s;" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'#f8fafc\'">' +
                            '<i class="fa-solid fa-download"></i> 다운로드' +
                        '</a>' +
                    '</div>' +
                '</div>';
                });

                reportsHtml += '</div>';
                container.innerHTML = reportsHtml;

            } catch(e) {
                console.error('[GoogleDriveBojang.renderBojangTab Error]:', e);
                container.innerHTML = '<div style="background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:16px; color:#991b1b; font-size:13px; text-align:center;">' +
                    '<i class="fa-solid fa-circle-exclamation" style="margin-right:6px;"></i> 리포트 목록을 불러오는 중 오류가 발생했습니다.<br>' +
                    '<span style="font-size:11.5px; color:#b91c1c;">' + (e.message || e) + '</span>' +
                '</div>';
            }
        },
        // 12. WERACLE 전용 모달 PDF 뷰어 (가로 스크롤 없는 와이드 확장 화면)
        currentViewerBlobUrl: null,
        isViewerFullscreen: false,

        closePdfViewer: function() {
            const modal = document.getElementById('weraclePdfViewerModal');
            if (modal) {
                modal.style.display = 'none';
            }
            const iframe = document.getElementById('weraclePdfViewerFrame');
            if (iframe) iframe.src = 'about:blank';
            if (this.currentViewerBlobUrl) {
                try { URL.revokeObjectURL(this.currentViewerBlobUrl); } catch(e) {}
                this.currentViewerBlobUrl = null;
            }
        },

        toggleViewerFullscreen: function() {
            const card = document.getElementById('weracleViewerCard');
            const icon = document.getElementById('weracleViewerExpandIcon');
            if (!card) return;
            this.isViewerFullscreen = !this.isViewerFullscreen;
            if (this.isViewerFullscreen) {
                card.style.maxWidth = '100vw';
                card.style.width = '100vw';
                card.style.height = '100vh';
                card.style.maxHeight = '100vh';
                card.style.borderRadius = '0';
                if (icon) icon.className = 'fa-solid fa-compress';
            } else {
                card.style.maxWidth = '1600px';
                card.style.width = '96vw';
                card.style.height = '96vh';
                card.style.maxHeight = '96vh';
                card.style.borderRadius = '16px';
                if (icon) icon.className = 'fa-solid fa-expand';
            }
        },

        openPdfViewer: async function(fileId, fileName, webViewLink) {
            fileName = fileName || '보장분석_리포트.pdf';
            webViewLink = webViewLink || ('https://drive.google.com/file/d/' + fileId + '/view');

            let modal = document.getElementById('weraclePdfViewerModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'weraclePdfViewerModal';
                modal.style.cssText = 'position:fixed; inset:0; z-index:200000; background:rgba(15,23,42,0.82); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; padding:10px; box-sizing:border-box;';
                
                modal.innerHTML = `
                    <div id="weracleViewerCard" style="background:#ffffff; border-radius:16px; width:96vw; max-width:1600px; height:96vh; max-height:96vh; display:flex; flex-direction:column; box-shadow:0 25px 60px -15px rgba(0,0,0,0.5); overflow:hidden; border:1px solid rgba(255,255,255,0.2); transition:all 0.2s ease;">
                        <!-- Modal Top Header -->
                        <div style="padding:12px 20px; background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#ffffff; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334155; flex-shrink:0;">
                            <div style="display:flex; align-items:center; gap:12px; min-width:0;">
                                <div style="width:36px; height:36px; border-radius:10px; background:rgba(2,132,199,0.25); color:#38bdf8; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; border:1px solid rgba(56,189,248,0.3);">
                                    <i class="fa-solid fa-file-pdf"></i>
                                </div>
                                <div style="min-width:0;">
                                    <div id="weracleViewerTitle" style="font-size:15px; font-weight:800; color:#f8fafc; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                        보장분석 리포트
                                    </div>
                                    <div style="font-size:11.5px; color:#94a3b8; display:flex; align-items:center; gap:6px;">
                                        <span>WERACLE 프리미엄 리포트 뷰어</span>
                                        <span style="display:inline-block; width:3px; height:3px; border-radius:50%; background:#64748b;"></span>
                                        <span style="color:#38bdf8; font-weight:700;">가로 맞춤 고해상도 모드</span>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Action Buttons -->
                            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                                <button type="button" onclick="GoogleDriveBojang.toggleViewerFullscreen()" title="전체화면 전환" style="background:rgba(255,255,255,0.08); color:#f8fafc; border:1px solid rgba(255,255,255,0.15); padding:7px 11px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:5px; transition:0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.08)'">
                                    <i id="weracleViewerExpandIcon" class="fa-solid fa-expand"></i> <span>화면확장</span>
                                </button>
                                <a id="weracleViewerDownloadBtn" href="#" target="_blank" download style="background:rgba(255,255,255,0.1); color:#f8fafc; border:1px solid rgba(255,255,255,0.15); text-decoration:none; padding:7px 13px; border-radius:8px; font-size:12.5px; font-weight:700; display:inline-flex; align-items:center; gap:5px; transition:0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">
                                    <i class="fa-solid fa-download"></i> 다운로드
                                </a>
                                <a id="weracleViewerDriveLink" href="#" target="_blank" style="background:rgba(255,255,255,0.06); color:#cbd5e1; border:1px solid rgba(255,255,255,0.1); text-decoration:none; padding:7px 11px; border-radius:8px; font-size:12px; font-weight:600; display:inline-flex; align-items:center; gap:5px; transition:0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">
                                    <i class="fa-brands fa-google-drive"></i> 원본 드라이브
                                </a>
                                <button type="button" onclick="GoogleDriveBojang.closePdfViewer()" style="background:none; border:none; color:#94a3b8; font-size:20px; padding:6px 10px; cursor:pointer; border-radius:8px; transition:0.15s; margin-left:4px;" onmouseover="this.style.color='#ffffff'; this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.color='#94a3b8'; this.style.background='none'">
                                    <i class="fa-solid fa-xmark"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Viewer Content Container -->
                        <div id="weracleViewerBody" style="flex:1; width:100%; height:100%; position:relative; background:#2a2e33; overflow:hidden;">
                            <!-- Spinner while loading -->
                            <div id="weracleViewerLoading" style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#0f172a; color:#ffffff; z-index:2;">
                                <div style="font-size:40px; margin-bottom:12px; color:#38bdf8;">
                                    <i class="fa-solid fa-circle-notch fa-spin"></i>
                                </div>
                                <div style="font-size:15px; font-weight:800; color:#f8fafc; margin-bottom:4px;">
                                    리포트를 불러오는 중입니다...
                                </div>
                                <div style="font-size:12px; color:#94a3b8;">
                                    고해상도 PDF 데이터를 가로 맞춤으로 렌더링하고 있습니다.
                                </div>
                            </div>

                            <iframe id="weraclePdfViewerFrame" src="about:blank" style="width:100%; height:100%; border:none; display:block; background:#2a2e33;" allowfullscreen></iframe>
                        </div>
                    </div>
                `;

                // Close on backdrop click
                modal.addEventListener('click', function(e) {
                    if (e.target === modal) {
                        GoogleDriveBojang.closePdfViewer();
                    }
                });

                // Close on ESC key
                document.addEventListener('keydown', function(e) {
                    if (e.key === 'Escape' && modal.style.display === 'flex') {
                        GoogleDriveBojang.closePdfViewer();
                    }
                });

                document.body.appendChild(modal);
            }

            // Update Header info
            const titleEl = document.getElementById('weracleViewerTitle');
            if (titleEl) titleEl.textContent = fileName;
            
            const downloadUrl = fileId ? ('https://drive.google.com/uc?export=download&id=' + fileId) : webViewLink;
            const dlBtn = document.getElementById('weracleViewerDownloadBtn');
            if (dlBtn) dlBtn.href = downloadUrl;
            
            const driveLink = document.getElementById('weracleViewerDriveLink');
            if (driveLink) driveLink.href = webViewLink;

            // Reset fullscreen state if was toggled
            const card = document.getElementById('weracleViewerCard');
            const icon = document.getElementById('weracleViewerExpandIcon');
            this.isViewerFullscreen = false;
            if (card) {
                card.style.maxWidth = '1600px';
                card.style.width = '96vw';
                card.style.height = '96vh';
                card.style.maxHeight = '96vh';
                card.style.borderRadius = '16px';
            }
            if (icon) icon.className = 'fa-solid fa-expand';

            // Show Modal & Spinner
            modal.style.display = 'flex';
            const loadingEl = document.getElementById('weracleViewerLoading');
            if (loadingEl) loadingEl.style.display = 'flex';
            const iframe = document.getElementById('weraclePdfViewerFrame');

            // Free previous blob if exists
            if (this.currentViewerBlobUrl) {
                try { URL.revokeObjectURL(this.currentViewerBlobUrl); } catch(e) {}
                this.currentViewerBlobUrl = null;
            }

            const token = this.getAccessToken();

            // Try fetching raw PDF via Drive API
            if (token && fileId) {
                try {
                    const resp = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    if (resp.ok) {
                        const blob = await resp.blob();
                        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
                        this.currentViewerBlobUrl = URL.createObjectURL(pdfBlob);
                        // view=FitH & zoom=page-width ensures PDF page expands to container width with NO horizontal scroll!
                        iframe.src = this.currentViewerBlobUrl + '#view=FitH&zoom=page-width&toolbar=1&navpanes=0';
                        if (loadingEl) {
                            setTimeout(() => { loadingEl.style.display = 'none'; }, 400);
                        }
                        return;
                    }
                } catch(fetchErr) {
                    console.warn('[openPdfViewer fetch error, falling back to preview]:', fetchErr);
                }
            }

            // Fallback: Google Drive clean preview embed
            iframe.src = 'https://drive.google.com/file/d/' + fileId + '/preview';
            iframe.onload = function() {
                if (loadingEl) loadingEl.style.display = 'none';
            };
            setTimeout(() => { if (loadingEl) loadingEl.style.display = 'none'; }, 2000);
        }
    };

    window.GoogleDriveBojang = GoogleDriveBojang;

})(window);
