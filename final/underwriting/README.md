# underwriting (언더라이팅 심사 분석 모듈)

설계이지(PlanEasy) 매칭 엔진 기반 언더라이팅 심사 분석 리포트 모듈(`report_preview.html`)입니다.

---

## 1. 파일 구성 및 역할

| 파일명 | 역할 및 설명 |
| :--- | :--- |
| **`index.html`** | 언더라이팅 심사 분석 리포트 화면 (기존 `report_preview.html` 기반 완성형 UI) |
| **`README.md`** | 본 모듈의 깃허브 배포 가이드 문서 |

---

## 2. 깃허브(GitHub) 배포 안내

- 본 `underwriting` 폴더를 깃허브 저장소 루트에 업로드하면, 웹 브라우저에서 `https://[내도메인]/underwriting/` 접속 시 자동으로 언더라이팅 심사 리포트 화면이 실행됩니다.
- 메인 홈페이지(`index.html`)에서는 `<a href="underwriting/">언더라이팅 심사 분석</a>` 링크로 연결하시면 됩니다.
- 숨은보험금(`hiddenclaim`)과 완전히 독립되어 있으므로, 언더라이팅 관련 수정 시 이 폴더 안의 파일만 수정하시면 됩니다.
