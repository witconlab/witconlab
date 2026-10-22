// 새나가온 아카이브 설정
// 구글 시트에서 [파일 > 공유 > 웹에 게시 > 해당 탭 > CSV]로 받은 주소를 붙여 넣으면
// 사이트가 시트 내용을 바로 불러옵니다. 비워 두면 data 폴더의 CSV를 사용합니다.
window.SAENAGAON_CONFIG = {
  SHEETS: {
    activities: '', // 활동 기록 탭
    tools: '',      // 교구 탭
    books: '',      // 그림책 교안 탭
    stories: ''     // 가족 실천 이야기·체험 후기 탭
  },

  // 책상자 신청서를 받을 Apps Script 웹앱 주소 (apps-script/Code.gs 참고)
  APPLY_ENDPOINT: '',

  // 책상자 체험단 모집 상태
  APPLY_OPEN: true,
  APPLY_ROUND: '2026년 책상자 체험단 (8월~12월, 회차별 모집)',

  CONTACT_EMAIL: 'manajun@hanmail.net',

  // 푸터에 보일 SNS 주소 (비워 두면 아이콘이 숨겨져요)
  BAND_URL: '',
  INSTAGRAM_URL: '',
  YOUTUBE_URL: '',

  SMARTSTORE_URL: '' // 스마트스토어 개설 후 입력
};
