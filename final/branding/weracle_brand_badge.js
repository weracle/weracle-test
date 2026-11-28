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
        const scale = options.scale || (options.maxH ? options.maxH / 68 : Math.max(0.65, Math.min(1.4, imgW / 1000)));

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

        // 2. 등록된 로고가 없는 경우 -> 퍼스널 네임표 (시안 A - 4번 소프트 스카이 틴트) 렌더링
        const rawName = this.resolvePlannerName(p);
        const formattedName = rawName.length === 3 ? (rawName[0] + ' ' + rawName[1] + ' ' + rawName[2]) : rawName;
        const role = this.resolvePlannerRole(p);
        const pillText = '보험분석전문가';

        ctx.save();

        // 폰트 및 규격 계산
        const nameFontSize = Math.round(20 * scale);
        const nameFont = '900 ' + nameFontSize + 'px "Pretendard", "Noto Sans KR", sans-serif';
        const roleFontSize = Math.round(11 * scale);
        const roleFont = '800 ' + roleFontSize + 'px "Pretendard", "Noto Sans KR", sans-serif';
        const pillFontSize = Math.round(11.5 * scale);
        const pillFont = '800 ' + pillFontSize + 'px "Pretendard", "Noto Sans KR", sans-serif';

        ctx.font = pillFont;
        const tagTextW = ctx.measureText(pillText).width;
        const dotR = Math.max(2, Math.round(2.5 * scale));
        const dotGap = Math.round(5 * scale);
        const topTagW = dotR * 2 + dotGap + tagTextW;

        ctx.font = nameFont;
        const nameW = ctx.measureText(formattedName).width;

        ctx.font = roleFont;
        const roleTextW = ctx.measureText(role).width;
        const rolePadX = Math.round(7 * scale);
        const rolePillW = roleTextW + rolePadX * 2;
        const rolePillH = Math.round(18 * scale);
        const gapNameRole = Math.round(8 * scale);
        const nameRowW = nameW + gapNameRole + rolePillW;

        const textBlockW = Math.max(topTagW, nameRowW);

        // 카드 및 아바타 기하학적 배치 (좌측 아바타, 우측 2단 텍스트 블록)
        const cardPadL = Math.round(10 * scale);
        const cardPadR = Math.round(18 * scale);
        const gapAvatarText = Math.round(12 * scale);

        const avatarD = Math.round(52 * scale);
        const avatarR = avatarD / 2;
        const ringWidth = Math.max(1.5, Math.round(2 * scale));
        const photoR = avatarR - ringWidth;

        const contentW = cardPadL + avatarD + gapAvatarText + textBlockW + cardPadR;
        const minCardW = Math.round(260 * scale);
        const cardW = Math.max(minCardW, contentW);
        const cardH = Math.round(68 * scale);
        const cardRadius = Math.round(16 * scale);

        const marginX = Math.max(22, Math.round(imgW * 0.024));
        const marginY = Math.max(18, Math.round(imgW * 0.02));
        const posX = options.x !== undefined ? options.x : (align === 'right' ? Math.round(imgW - cardW - marginX) : marginX);
        const posY = options.y !== undefined ? options.y : marginY;

        // A. 소프트 스카이 틴트 배경 그라데이션 및 그림자
        ctx.save();
        ctx.shadowColor = 'rgba(2, 132, 199, 0.08)';
        ctx.shadowBlur = Math.round(14 * scale);
        ctx.shadowOffsetY = Math.round(4 * scale);

        const bgGrad = ctx.createLinearGradient(posX, posY, posX + cardW, posY + cardH);
        bgGrad.addColorStop(0, '#f0f9ff');
        bgGrad.addColorStop(1, '#e0f2fe');
        ctx.fillStyle = bgGrad;

        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(posX, posY, cardW, cardH, cardRadius);
        } else {
          ctx.rect(posX, posY, cardW, cardH);
        }
        ctx.fill();
        ctx.restore();

        // B. 소프트 스카이 테두리 (border 1.2px solid #bae6fd)
        ctx.save();
        ctx.lineWidth = Math.max(1, Math.round(1.2 * scale));
        ctx.strokeStyle = '#bae6fd';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(posX, posY, cardW, cardH, cardRadius);
        } else {
          ctx.rect(posX, posY, cardW, cardH);
        }
        ctx.stroke();
        ctx.restore();

        // C. 좌측 원형 아바타 (아바타 링 + 사진 또는 이니셜)
        const avatarCenterX = posX + cardPadL + avatarR;
        const avatarCenterY = posY + cardH / 2;

        // 외곽 그라데이션 링 (#0284c7 -> #38bdf8 -> #0369a1)
        ctx.save();
        const ringGrad = ctx.createLinearGradient(
          avatarCenterX - avatarR,
          avatarCenterY - avatarR,
          avatarCenterX + avatarR,
          avatarCenterY + avatarR
        );
        ringGrad.addColorStop(0, '#0284c7');
        ringGrad.addColorStop(0.5, '#38bdf8');
        ringGrad.addColorStop(1, '#0369a1');
        ctx.fillStyle = ringGrad;
        ctx.beginPath();
        ctx.arc(avatarCenterX, avatarCenterY, avatarR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 아바타 내부 이미지 또는 이니셜
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
          // 사진 미등록 시 소프트 블루 배경 + 화이트 이니셜
          ctx.fillStyle = '#0284c7';
          ctx.fillRect(avatarCenterX - photoR, avatarCenterY - photoR, photoR * 2, photoR * 2);

          ctx.font = '900 ' + Math.round(23 * scale) + 'px "Pretendard", "Noto Sans KR", sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(rawName.charAt(0), avatarCenterX, avatarCenterY + 1 * scale);
        }
        ctx.restore();

        // 내부 화이트 보더 링 마감 (border 2px solid #ffffff)
        ctx.save();
        ctx.lineWidth = Math.max(1.5, Math.round(2 * scale));
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(avatarCenterX, avatarCenterY, photoR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // D. 우측 상단 태그: 점(dot) + 보험분석전문가
        const textX = posX + cardPadL + avatarD + gapAvatarText;
        const dotCenterX = textX + dotR;
        const topTagCenterY = posY + Math.round(24 * scale);

        ctx.save();
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(dotCenterX, topTagCenterY, dotR, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = pillFont;
        ctx.fillStyle = '#0369a1';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(pillText, textX + dotR * 2 + dotGap, topTagCenterY);
        ctx.restore();

        // E. 우측 하단 성함 (프리텐다드 900, #0c4a6e)
        const nameCenterY = posY + Math.round(47 * scale);
        ctx.save();
        ctx.font = nameFont;
        ctx.fillStyle = '#0c4a6e';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(formattedName, textX, nameCenterY);
        ctx.restore();

        // F. 우측 하단 직책 알약 (배경 #ffffff, 텍스트 #0284c7, 테두리 #bae6fd)
        const rolePillX = textX + nameW + gapNameRole;
        const rolePillY = Math.round(nameCenterY - rolePillH / 2);

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        const pillRadius = Math.round(5 * scale);
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(rolePillX, rolePillY, rolePillW, rolePillH, pillRadius);
        } else {
          ctx.rect(rolePillX, rolePillY, rolePillW, rolePillH);
        }
        ctx.fill();

        ctx.lineWidth = Math.max(1, Math.round(1 * scale));
        ctx.strokeStyle = '#bae6fd';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(rolePillX, rolePillY, rolePillW, rolePillH, pillRadius);
        } else {
          ctx.rect(rolePillX, rolePillY, rolePillW, rolePillH);
        }
        ctx.stroke();

        ctx.font = roleFont;
        ctx.fillStyle = '#0284c7';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(role, rolePillX + rolePillW / 2, nameCenterY);
        ctx.restore();

        ctx.restore();
        return { type: 'nameplate_badge', x: posX, y: posY, width: cardW, height: cardH };
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
      const scale = maxH / 68;
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

      // SVG 규격 산출 (시안 A - 4번 소프트 스카이 틴트)
      const nameW = formattedName.length * 15 + 10;
      const roleW = role.length * 11 + 14;
      const cardPadL = 10;
      const avatarD = 52;
      const gapAvatarText = 12;
      const textX = cardPadL + avatarD + gapAvatarText;
      const rolePillX = textX + nameW + 8;
      const contentW = rolePillX + roleW + 18;
      const cardW = Math.max(260, contentW);
      const cardH = 68;

      const avatarCenterX = cardPadL + avatarD / 2;
      const avatarCenterY = cardH / 2;
      const photoR = avatarD / 2 - 2;

      const avatarContent = avatarUrl
        ? `<image href="${avatarUrl}" x="${avatarCenterX - photoR}" y="${avatarCenterY - photoR}" width="${photoR * 2}" height="${photoR * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)" />`
        : `<circle cx="${avatarCenterX}" cy="${avatarCenterY}" r="${photoR}" fill="#0284c7" />
           <text x="${avatarCenterX}" y="${avatarCenterY + 8}" font-family="'Pretendard', sans-serif" font-size="23" font-weight="900" fill="#ffffff" text-anchor="middle">${rawName.charAt(0)}</text>`;

      const svgString = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cardW} ${cardH}" width="${cardW}" height="${cardH}">
  <defs>
    <filter id="softSkyShadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="7" flood-color="#0284c7" flood-opacity="0.12" />
    </filter>
    <linearGradient id="cardBgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f0f9ff" />
      <stop offset="100%" stop-color="#e0f2fe" />
    </linearGradient>
    <linearGradient id="avatarRingGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="50%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#0369a1" />
    </linearGradient>
    <clipPath id="avatarClip">
      <circle cx="${avatarCenterX}" cy="${avatarCenterY}" r="${photoR}" />
    </clipPath>
  </defs>

  <!-- Card Body -->
  <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="16" fill="url(#cardBgGrad)" stroke="#bae6fd" stroke-width="1.2" filter="url(#softSkyShadow)" />

  <!-- Avatar Outer Ring -->
  <circle cx="${avatarCenterX}" cy="${avatarCenterY}" r="${avatarD / 2}" fill="url(#avatarRingGrad)" />

  <!-- Avatar Inner Photo / Initial -->
  ${avatarContent}

  <!-- Avatar Inner White Border -->
  <circle cx="${avatarCenterX}" cy="${avatarCenterY}" r="${photoR}" fill="none" stroke="#ffffff" stroke-width="2" />

  <!-- Top Tag: Dot & Text -->
  <circle cx="${textX + 2.5}" cy="24" r="2.5" fill="#0284c7" />
  <text x="${textX + 10}" y="27.5" font-family="'Pretendard', sans-serif" font-size="11.5" font-weight="800" fill="#0369a1">보험분석전문가</text>

  <!-- Planner Name -->
  <text x="${textX}" y="54" font-family="'Pretendard', sans-serif" font-size="20" font-weight="900" letter-spacing="1" fill="#0c4a6e">${formattedName}</text>

  <!-- Role Pill -->
  <rect x="${rolePillX}" y="38" width="${roleW}" height="18" rx="5" fill="#ffffff" stroke="#bae6fd" stroke-width="1" />
  <text x="${rolePillX + roleW / 2}" y="51" font-family="'Pretendard', sans-serif" font-size="11" font-weight="800" fill="#0284c7" text-anchor="middle">${role}</text>
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
