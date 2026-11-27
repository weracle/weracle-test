/**
 * Weracle Unified Personal Brand Badge & Logo Engine
 * ==============================================================================
 * 기능:
 * 1. 로고가 등록되어 있을 경우 -> 기존 로고 자리에 커스텀 로고 렌더링
 * 2. 로고가 등록되어 있지 않을 경우 -> 동일한 위치에 신규 퍼스널 네임표 워터마크 렌더링
 *    - 상단 고정 알약: "보험분석전문가"
 *    - 본체: 설계사 성함 (볼드 스페이싱) + 직책 라벤더 뱃지
 *    - 우측: 마이페이지 프로필 사진 (미등록 시 세련된 이니셜 아바타)
 * 3. 캔버스 직접 그리기(draw/drawDirect) 및 SVG/HTML 데이터 생성 지원
 * 4. 마이페이지 / 수파베이스 / 로컬스토리지 프로필 데이터 자동 1:1 바인딩
 * ==============================================================================
 */

(function (window) {
  'use strict';

  // 아바타 및 로고 이미지 캐시 객체
  let cachedAvatarImg = null;
  let cachedAvatarSrc = '';
  let cachedLogoImg = null;
  let cachedLogoSrc = '';

  const WeracleBrandBadge = {
    // --------------------------------------------------------------------------
    // 1. 프로필 및 등록 로고 데이터 안전 추출
    // --------------------------------------------------------------------------
    getPlannerProfileData(explicitProf) {
      let prof = {};
      try {
        if (explicitProf && typeof explicitProf === 'object') {
          prof = Object.assign({}, explicitProf);
        } else if (window.parent && window.parent !== window && window.parent.currentProfile) {
          prof = Object.assign({}, window.parent.currentProfile);
        } else if (window.currentProfile) {
          prof = Object.assign({}, window.currentProfile);
        } else {
          const raw = localStorage.getItem('cached_profile');
          if (raw) prof = JSON.parse(raw);
        }
      } catch (e) {}

      // 전용 아바타 및 로고 로컬스토리지 보존값 우선 반영
      try {
        const directAvatar = localStorage.getItem('weracle_user_avatar');
        if (directAvatar && (!prof.avatar_url || prof.avatar_url.includes('dicebear') || prof.avatar_url.includes('consultant_model'))) {
          prof.avatar_url = directAvatar;
        }
        const directLogo = localStorage.getItem('weracle_user_logo');
        if (directLogo && (!prof.logo_url || prof.logo_url.includes('560fa4f67c898.png'))) {
          prof.logo_url = directLogo;
        }
      } catch (e) {}

      return prof || {};
    },

    resolvePlannerName(profile) {
      const p = profile || this.getPlannerProfileData();
      const inpName = document.getElementById('input-name') || document.getElementById('inputAdvisorName');
      const curAdv = inpName ? (inpName.value || '').trim() : '';

      const candidates = [
        curAdv ? curAdv.split(' ')[0] : '',
        p.name,
        p.full_name,
        p.real_name,
        p.nickname,
        p.user_name,
        p.userName,
        p.user_metadata ? (p.user_metadata.name || p.user_metadata.full_name || p.user_metadata.nickname) : '',
        p.email ? p.email.split('@')[0] : ''
      ];

      for (let c of candidates) {
        if (c && typeof c === 'string') {
          const tr = c.trim();
          if (tr && tr !== '담당 설계사' && tr !== '담당설계사' && tr !== '위라클 파트너' && tr !== 'null' && tr !== 'undefined') {
            return tr;
          }
        }
      }
      return (p.nickname || p.name || '박보환').trim();
    },

    resolvePlannerRole(profile) {
      const p = profile || this.getPlannerProfileData();
      const inpPos = document.getElementById('input-position') || document.getElementById('inputAdvisorPosition');
      const curPos = inpPos ? (inpPos.value || '').trim() : '';

      const candidates = [
        curPos,
        p.position,
        p.role,
        p.job_title,
        p.officialTitle,
        p.official_title,
        p.job,
        p.user_metadata ? (p.user_metadata.position || p.user_metadata.role) : ''
      ];

      for (let c of candidates) {
        if (c && typeof c === 'string') {
          const tr = c.trim();
          if (tr && tr !== 'null' && tr !== 'undefined') {
            return tr;
          }
        }
      }
      return '본부장';
    },

    getCustomUploadedLogo(explicitProf) {
      try {
        // 1. 전용 로컬스토리지 키
        const directLogo = localStorage.getItem('weracle_user_logo');
        if (directLogo && typeof directLogo === 'string' && directLogo.trim().length > 10) {
          if (!directLogo.includes('560fa4f67c898.png')) return directLogo.trim();
        }

        // 2. 부모 창 객체 최우선 탐색 (실시간 마이페이지 프로필)
        if (window.parent && window.parent !== window && window.parent.currentProfile) {
          const pLogo = window.parent.currentProfile.logo_url;
          if (pLogo && typeof pLogo === 'string' && pLogo.trim().length > 10 && !pLogo.includes('560fa4f67c898.png')) {
            return pLogo.trim();
          }
        }

        // 3. 현재 창 프로필
        const prof = explicitProf || this.getPlannerProfileData();
        if (prof && prof.logo_url && typeof prof.logo_url === 'string' && prof.logo_url.trim().length > 10) {
          if (!prof.logo_url.includes('560fa4f67c898.png')) return prof.logo_url.trim();
        }

        // 4. 기타 로컬스토리지 백업 키
        const extraKeys = ['cached_profile', 'weracle_current_profile', 'weracle_user_profile'];
        for (const k of extraKeys) {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && parsed.logo_url && typeof parsed.logo_url === 'string' && parsed.logo_url.trim().length > 10) {
                if (!parsed.logo_url.includes('560fa4f67c898.png')) return parsed.logo_url.trim();
              }
            }
          } catch (e) {}
        }
      } catch (e) {}
      return '';
    },

    getAvatarUrl(profile) {
      const p = profile || this.getPlannerProfileData();
      try {
        const directAvatar = localStorage.getItem('weracle_user_avatar');
        if (directAvatar && directAvatar.length > 10) return directAvatar;
      } catch (e) {}
      const avatar = p.avatar_url || p.photo_url || p.profile_image || (p.user_metadata && (p.user_metadata.avatar_url || p.user_metadata.picture)) || '';
      if (avatar && avatar.length > 10 && !avatar.includes('consultant_model.jpg') && !avatar.includes('dicebear.com/7.x/bottts')) {
        return avatar;
      }
      return '';
    },

    // --------------------------------------------------------------------------
    // 2. 비동기 이미지 프리로드 헬퍼
    // --------------------------------------------------------------------------
    preloadAvatarImage(callback) {
      const src = this.getAvatarUrl();
      if (!src) {
        if (callback) callback(null);
        return;
      }
      if (cachedAvatarImg && cachedAvatarSrc === src && cachedAvatarImg.complete) {
        if (callback) callback(cachedAvatarImg);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        cachedAvatarImg = img;
        cachedAvatarSrc = src;
        if (callback) callback(img);
      };
      img.onerror = () => {
        if (callback) callback(null);
      };
      img.src = src;
    },

    preloadLogoImage(callback) {
      const src = this.getCustomUploadedLogo();
      if (!src) {
        if (callback) callback(null);
        return;
      }
      if (cachedLogoImg && cachedLogoSrc === src && cachedLogoImg.complete) {
        if (callback) callback(cachedLogoImg);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        cachedLogoImg = img;
        cachedLogoSrc = src;
        if (callback) callback(img);
      };
      img.onerror = () => {
        if (callback) callback(null);
      };
      img.src = src;
    },

    // --------------------------------------------------------------------------
    // 3. 캔버스 직접 렌더러 (로고 존재 시 로고 렌더, 미등록 시 신규 네임표 렌더)
    // --------------------------------------------------------------------------
    draw(ctx, imgW, imgH, profile, userImg, options = {}) {
      try {
        const p = profile || this.getPlannerProfileData();
        const customLogoSrc = this.getCustomUploadedLogo(p);
        const align = options.align || 'right';
        const scale = options.scale || (options.maxH ? options.maxH / 88 : Math.max(0.65, Math.min(1.4, imgW / 1000)));

        // 1. 등록된 커스텀 로고가 존재하는 경우 -> 기존 로고 자리에 로고 렌더링
        let activeLogo = null;
        if (userImg && (userImg.naturalWidth || userImg.width) > 0) {
          activeLogo = userImg;
        } else if (cachedLogoImg && cachedLogoImg.complete && cachedLogoImg.src === customLogoSrc && (cachedLogoImg.naturalWidth || cachedLogoImg.width) > 0) {
          activeLogo = cachedLogoImg;
        }

        if (activeLogo) {
          const maxW = Math.round(180 * scale);
          const maxH = options.maxH ? options.maxH : Math.round(70 * scale);
          const nw = activeLogo.naturalWidth || activeLogo.width;
          const nh = activeLogo.naturalHeight || activeLogo.height;
          const r = Math.min(maxW / nw, maxH / nh);
          const dw = Math.round(nw * r);
          const dh = Math.round(nh * r);

          const marginX = Math.max(22, Math.round(imgW * 0.024));
          const marginY = Math.max(18, Math.round(imgW * 0.02));
          const posX = options.x !== undefined ? options.x : (align === 'right' ? Math.round(imgW - dw - marginX) : marginX);
          const posY = options.y !== undefined ? options.y : (marginY + Math.round((maxH - dh) / 2));

          ctx.save();
          ctx.drawImage(activeLogo, posX, posY, dw, dh);
          ctx.restore();
          return { type: 'custom_logo', x: posX, y: posY, width: dw, height: dh };
        } else if (customLogoSrc) {
          // 커스텀 로고가 등록되어 있으나 아직 이미지 로드 중인 경우 -> 네임표를 그리지 않고 로드 완료 후 재렌더링 트리거
          if (!cachedLogoImg || cachedLogoImg.src !== customLogoSrc) {
            cachedLogoImg = new Image();
            cachedLogoImg.crossOrigin = 'anonymous';
            cachedLogoImg.onload = () => {
              if (typeof triggerDraw === 'function') triggerDraw();
            };
            cachedLogoImg.src = customLogoSrc;
          }
          return { type: 'custom_logo_loading' };
        }

        // 2. 등록된 로고가 없는 경우 -> 같은 위치에 신규 퍼스널 네임표 (시안 3-1 정밀 개선형) 렌더링
        const rawName = this.resolvePlannerName(p);
        const formattedName = rawName.length === 3 ? (rawName[0] + ' ' + rawName[1] + ' ' + rawName[2]) : rawName;
        const role = this.resolvePlannerRole(p);
        const pillText = '보험분석전문가';

        ctx.save();

        // 폰트 및 규격 계산
        const nameFontSize = Math.round(27 * scale);
        const nameFont = '900 ' + nameFontSize + 'px "Pretendard", "Noto Sans KR", sans-serif';
        const roleFontSize = Math.round(12.5 * scale);
        const roleFont = '800 ' + roleFontSize + 'px "Pretendard", "Noto Sans KR", sans-serif';
        const pillFontSize = Math.round(12 * scale);
        const pillFont = '800 ' + pillFontSize + 'px "Pretendard", "Noto Sans KR", sans-serif';

        ctx.font = nameFont;
        const nameW = ctx.measureText(formattedName).width;

        ctx.font = roleFont;
        const roleTextW = ctx.measureText(role).width;
        const rolePadX = Math.round(8 * scale);
        const rolePillW = roleTextW + rolePadX * 2;
        const rolePillH = Math.round(20 * scale);

        ctx.font = pillFont;
        const topPillTextW = ctx.measureText(pillText).width;
        const topPillPadX = Math.round(12 * scale);
        const topPillW = topPillTextW + topPillPadX * 2;
        const topPillH = Math.round(22 * scale);

        // 카드 및 아바타 기하학적 배치
        const cardPadL = Math.round(22 * scale);
        const gapNameRole = Math.round(10 * scale);
        const gapRoleAvatar = Math.round(24 * scale);
        const avatarR = Math.round(44 * scale); // 직경 88px
        const avatarD = avatarR * 2;
        const avatarOverlapRight = Math.round(22 * scale);

        const contentW = cardPadL + nameW + gapNameRole + rolePillW + gapRoleAvatar;
        const cardW = Math.round(contentW + avatarD - avatarOverlapRight);
        const cardH = Math.round(68 * scale);
        const cardRadius = Math.round(26 * scale);

        const totalW = cardW + avatarOverlapRight;
        const totalH = cardH + Math.round(11 * scale);

        const marginX = Math.max(22, Math.round(imgW * 0.024));
        const marginY = Math.max(18, Math.round(imgW * 0.02));
        const posX = options.x !== undefined ? options.x : (align === 'right' ? Math.round(imgW - totalW - marginX) : marginX);
        const posY = options.y !== undefined ? options.y : (marginY + Math.round(11 * scale));

        // A. 화이트 카드 부드러운 소프트 섀도우
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
        ctx.shadowBlur = Math.round(18 * scale);
        ctx.shadowOffsetY = Math.round(6 * scale);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(posX, posY, cardW, cardH, cardRadius);
        } else {
          ctx.rect(posX, posY, cardW, cardH);
        }
        ctx.fill();
        ctx.restore();

        // B. 화이트 카드 다크 아웃라인 테두리
        ctx.save();
        ctx.lineWidth = Math.max(1.5, Math.round(2 * scale));
        ctx.strokeStyle = '#1e293b';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(posX, posY, cardW, cardH, cardRadius);
        } else {
          ctx.rect(posX, posY, cardW, cardH);
        }
        ctx.stroke();
        ctx.restore();

        // C. 상단 고정 플로팅 알약 ("보험분석전문가")
        const pillX = posX + Math.round(18 * scale);
        const pillY = posY - Math.round(11 * scale);

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
        ctx.shadowBlur = Math.round(6 * scale);
        ctx.shadowOffsetY = Math.round(2 * scale);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(pillX, pillY, topPillW, topPillH, topPillH / 2);
        } else {
          ctx.rect(pillX, pillY, topPillW, topPillH);
        }
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.lineWidth = Math.max(1, Math.round(1.4 * scale));
        ctx.strokeStyle = '#93c5fd';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(pillX, pillY, topPillW, topPillH, topPillH / 2);
        } else {
          ctx.rect(pillX, pillY, topPillW, topPillH);
        }
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.font = pillFont;
        ctx.fillStyle = '#1e40af';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pillText, pillX + topPillW / 2, pillY + topPillH / 2);
        ctx.restore();

        // D. 성함 타이포 (프리텐다드 900)
        const nameX = posX + cardPadL;
        const nameCenterY = posY + cardH / 2;
        ctx.save();
        ctx.font = nameFont;
        ctx.fillStyle = '#111827';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(formattedName, nameX, nameCenterY);
        ctx.restore();

        // E. 직책 뱃지 (라벤더 소프트 필터)
        const rolePillX = nameX + nameW + gapNameRole;
        const rolePillY = nameCenterY - rolePillH / 2;
        ctx.save();
        ctx.fillStyle = '#f3e8ff';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(rolePillX, rolePillY, rolePillW, rolePillH, rolePillH / 2);
        } else {
          ctx.rect(rolePillX, rolePillY, rolePillW, rolePillH);
        }
        ctx.fill();

        ctx.lineWidth = Math.max(1, Math.round(1 * scale));
        ctx.strokeStyle = '#d8b4fe';
        ctx.stroke();

        ctx.font = roleFont;
        ctx.fillStyle = '#7e22ce';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(role, rolePillX + rolePillW / 2, nameCenterY);
        ctx.restore();

        // F. 우측 원형 아바타 (수직 중앙 100% 일치)
        const avatarCenterX = posX + cardW + avatarOverlapRight - avatarR;
        const avatarCenterY = posY + cardH / 2;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = Math.round(16 * scale);
        ctx.shadowOffsetY = Math.round(4 * scale);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(avatarCenterX, avatarCenterY, avatarR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        const ringWidth = Math.max(2, Math.round(3.8 * scale));
        const photoR = avatarR - ringWidth;

        // 아바타 이미지 판별
        let activeAvatar = null;
        if (options.avatarImg && (options.avatarImg.naturalWidth || options.avatarImg.width) > 0) {
          activeAvatar = options.avatarImg;
        } else if (cachedAvatarImg && cachedAvatarImg.complete && cachedAvatarImg.src) {
          activeAvatar = cachedAvatarImg;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarCenterX, avatarCenterY, photoR, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        if (activeAvatar) {
          ctx.drawImage(activeAvatar, avatarCenterX - photoR, avatarCenterY - photoR, photoR * 2, photoR * 2);
        } else {
          // 사진 미등록 시 세련된 블루 그라데이션 + 첫 글자 볼드 이니셜 아바타
          const grad = ctx.createLinearGradient(
            avatarCenterX - photoR,
            avatarCenterY - photoR,
            avatarCenterX + photoR,
            avatarCenterY + photoR
          );
          grad.addColorStop(0, '#0284c7');
          grad.addColorStop(1, '#1e3a8a');
          ctx.fillStyle = grad;
          ctx.fillRect(avatarCenterX - photoR, avatarCenterY - photoR, photoR * 2, photoR * 2);

          ctx.font = '900 ' + Math.round(32 * scale) + 'px "Pretendard", "Noto Sans KR", sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(rawName.charAt(0), avatarCenterX, avatarCenterY + 1 * scale);
        }
        ctx.restore();

        // 화이트 보더 링 마감
        ctx.save();
        ctx.lineWidth = ringWidth;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(avatarCenterX, avatarCenterY, avatarR - ringWidth / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.restore();
        return { type: 'nameplate_badge', x: posX, y: posY, width: totalW, height: totalH };
      } catch (err) {
        console.warn('WeracleBrandBadge.draw error:', err);
        return null;
      }
    },

    // 데일리뉴스 등 고정 좌상단 슬롯(x, y, maxH) 직접 렌더러
    drawDirect(ctx, x, y, maxH, profile) {
      const p = profile || this.getPlannerProfileData();
      const customLogo = this.getCustomUploadedLogo(p);
      if (customLogo) {
        if (cachedLogoImg && cachedLogoImg.complete && cachedLogoImg.src === customLogo && (cachedLogoImg.naturalWidth || cachedLogoImg.width) > 0) {
          const nw = cachedLogoImg.naturalWidth || cachedLogoImg.width;
          const nh = cachedLogoImg.naturalHeight || cachedLogoImg.height;
          const logoW = (nw / nh) * maxH;
          ctx.drawImage(cachedLogoImg, x, y, logoW, maxH);
          return;
        } else {
          if (!cachedLogoImg || cachedLogoImg.src !== customLogo) {
            cachedLogoImg = new Image();
            cachedLogoImg.crossOrigin = 'anonymous';
            cachedLogoImg.onload = () => {
              if (typeof triggerDraw === 'function') triggerDraw();
            };
            cachedLogoImg.src = customLogo;
          }
          return; // 커스텀 로고가 등록되어 있으므로 네임표 뱃지를 그리지 않음
        }
      }
      // 로고 미등록 시: 신규 네임표를 해당 슬롯 비율에 맞춰 안착
      const scale = maxH / 88;
      this.draw(ctx, 1000, 1000, p, null, { x: x, y: y, maxH: maxH, scale: scale, align: 'custom' });
    },

    // --------------------------------------------------------------------------
    // 4. SVG Data URL 생성기 (웹 <img> 태그 및 카드뉴스/PDF 삽입용)
    // --------------------------------------------------------------------------
    generateSvgDataUrl(profile) {
      const p = profile || this.getPlannerProfileData();
      const customLogo = this.getCustomUploadedLogo(p);
      if (customLogo) return customLogo;

      const rawName = this.resolvePlannerName(p);
      const formattedName = rawName.length === 3 ? (rawName[0] + ' ' + rawName[1] + ' ' + rawName[2]) : rawName;
      const role = this.resolvePlannerRole(p);
      const avatarUrl = this.getAvatarUrl(p);

      // SVG 너비 산출
      const charCount = formattedName.length;
      const nameW = charCount * 17 + 20;
      const roleW = role.length * 13 + 24;
      const cardW = 24 + nameW + 12 + roleW + 68;
      const totalW = cardW + 24;
      const totalH = 88;

      const avatarContent = avatarUrl
        ? `<image href="${avatarUrl}" x="${totalW - 88}" y="6" width="80" height="80" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)" />`
        : `<circle cx="${totalW - 48}" cy="46" r="40" fill="url(#avatarGrad)" />
           <text x="${totalW - 48}" y="55" font-family="'Pretendard', sans-serif" font-size="28" font-weight="900" fill="#ffffff" text-anchor="middle">${rawName.charAt(0)}</text>`;

      const svgString = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">
  <defs>
    <filter id="softShadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.25" />
    </filter>
    <linearGradient id="avatarGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#1e3a8a" />
    </linearGradient>
    <clipPath id="avatarClip">
      <circle cx="${totalW - 48}" cy="46" r="38" />
    </clipPath>
  </defs>

  <!-- Card Body -->
  <rect x="0" y="14" width="${cardW}" height="66" rx="26" fill="#ffffff" stroke="#1e293b" stroke-width="2" filter="url(#softShadow)" />

  <!-- Top Floating Pill -->
  <rect x="18" y="3" width="102" height="22" rx="11" fill="#ffffff" stroke="#93c5fd" stroke-width="1.4" />
  <text x="69" y="18" font-family="'Pretendard', sans-serif" font-size="11.5" font-weight="800" fill="#1e40af" text-anchor="middle">보험분석전문가</text>

  <!-- Name -->
  <text x="24" y="53" font-family="'Pretendard', sans-serif" font-size="25" font-weight="900" fill="#111827">${formattedName}</text>

  <!-- Role Badge -->
  <rect x="${24 + nameW + 8}" y="36" width="${roleW}" height="20" rx="10" fill="#f3e8ff" stroke="#d8b4fe" stroke-width="1" />
  <text x="${24 + nameW + 8 + roleW / 2}" y="50" font-family="'Pretendard', sans-serif" font-size="12" font-weight="800" fill="#7e22ce" text-anchor="middle">${role}</text>

  <!-- Avatar Shadow & Ring -->
  <circle cx="${totalW - 48}" cy="46" r="42" fill="#ffffff" filter="url(#softShadow)" />
  ${avatarContent}
  <circle cx="${totalW - 48}" cy="46" r="40" fill="none" stroke="#ffffff" stroke-width="4" />
</svg>
`.trim();

      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
    }
  };

  // 초기 로드시 아바타 및 로고 자동 프리로드 트리거
  WeracleBrandBadge.preloadAvatarImage();
  WeracleBrandBadge.preloadLogoImage();

  // 글로벌 네임스페이스 및 하위 호환 함수 바인딩
  window.WeracleBrandBadge = WeracleBrandBadge;

})(typeof window !== 'undefined' ? window : this);
