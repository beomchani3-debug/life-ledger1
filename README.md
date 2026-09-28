This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 운동과 한 줄 일기

- `/`: 새 첫 화면. 작성 중인 운동·일기가 있으면 이어서 엽니다.
- `/?quick=workout`: 운동 화면. 최근 운동을 불러오거나 새 운동을 시작합니다.
- `/?quick=diary`: 한 줄 일기. 진행 중인 초안이 있으면 이어 쓰기를 우선합니다.
- `/?view=records`: 기존 기록·검색·내보내기·인바디 통계 화면입니다.

### 운동 기록 흐름

1. 최근 운동을 선택하면 지난 중량·횟수가 미완료 상태로 채워집니다.
   예전 자유형 기록은 원문을 참고하며 새 세트를 입력합니다.
2. 세트 완료를 누르면 90초 휴식 타이머가 시작됩니다.
   같은 세트 추가, 완료 취소·수정, 다른 운동 추가가 가능합니다.
3. 오늘 운동 마치기는 **완료한 세트만** 기존 workout 형식으로 저장합니다.
   간단 기록 모드에서는 부위·시간·메모만 저장합니다.
4. 저장 후 기분 선택 또는 한 줄 일기로 이어집니다. 일기는 건너뛸 수 있습니다.

초안과 휴식 종료 시각은 현재 기기의 localStorage에 보관하며 기기 간 동기화되지 않습니다.
저장에 실패하면 초안을 유지합니다. 저장 응답이 끊긴 운동은 고유 세션 식별자로
서버의 기존 저장 여부를 확인한 뒤 재시도합니다. 저장 확인 중인 내용은 수정하지 않습니다.
기존 앱 잠금과 records 테이블을 사용하며 데이터베이스 스키마 변경은 없습니다.
일기 응답이 끊겼을 때는 안내에 따라 기존 목록을 확인한 뒤 재시도합니다.

### 휴대폰 설치

앱의 '휴대폰 바탕화면에 추가하기' 또는 Chrome의 ⋮ → 홈 화면에 추가 / 앱 설치를
사용합니다. 지원되는 런처에서는 앱 아이콘을 길게 눌러 일기·운동 바로가기를 엽니다.
기존 앱 ID(`/`)를 유지합니다. 기존 설치 앱의 시작 주소·메뉴 갱신은 브라우저에 따라
시간이 걸릴 수 있습니다. 일반 웹앱이며 네이티브 홈 위젯이나 오프라인 실행 기능은 아닙니다.

### 검증

- `node --test tests/workout-session.test.cjs`: 세트 불러오기·검증·완료 항목 저장,
  간단 기록, 초안 복원, 재시도 데이터 안정성 테스트.
- `npm run build`: 환경변수 NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_APP_PASSWORD 필요.
- 테스트 DB에서 운동 불러오기 → 완료 → 새로고침 → 이어쓰기 → 운동 마치기 →
  한 줄 일기 → 기록·통계 확인 순서로 점검합니다.
