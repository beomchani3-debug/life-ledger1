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

## 휴대폰 빠른 기록

- `/?quick=diary`: 잠금 해제 후 한 줄 일기 입력창으로 바로 진입합니다.
- `/?quick=workout`: 운동 기록 입력창으로 바로 진입합니다.
- `/`: 기존 전체 기록과 인바디 화면입니다.
- 앱 안의 **휴대폰 바탕화면에 추가하기**에서 설치 안내를 확인합니다.
- 갤럭시 Chrome의 **⋮ → 홈 화면에 추가 / 앱 설치**로 설치합니다.
  설치된 앱 아이콘을 길게 누르면 지원되는 런처에서 일기·운동 바로가기가 표시됩니다.
  설치 확인은 휴대폰에서 사용자가 진행해야 합니다.
- 기존 설치 앱은 브라우저의 매니페스트 갱신에 시간이 걸릴 수 있습니다.
  바로가기가 아직 보이지 않으면 앱 첫 화면의 빠른 기록 버튼을 사용합니다.
- PWA의 기존 앱 ID(`/`)는 유지합니다. 새 시작 주소는 `/?quick=diary`입니다.
- 초안은 일기·운동별로 현재 브라우저의 localStorage에 보관합니다.
  실제 서버 저장에 성공한 초안만 비웁니다. 초안은 기기 간 동기화되지 않습니다.
- 서버 저장에는 인터넷 연결이 필요합니다. 오프라인 앱 실행이나 네이티브
  안드로이드 홈 위젯을 제공하는 기능은 아닙니다.
- 기존 앱 잠금과 `records` 테이블을 사용하며 데이터베이스 스키마 변경은 없습니다.

### 확인 방법

설정된 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_APP_PASSWORD` 환경변수로 `npm run build`를 실행합니다.
테스트 DB에서 빠른 기록 링크 → 잠금 해제 → 작성 → 새로고침 후 초안 복원 →
저장 → 전체 목록 확인 순서로 확인합니다. 연결 실패 시 입력이 보존되는지도 확인합니다.
