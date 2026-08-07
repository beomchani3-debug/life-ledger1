"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/src/lib/supabase";

const inputCategories = ["일기", "투자", "운동", "공부/콘텐츠", "가치관"] as const;
const visibleInputCategories = ["일기", "운동"] as const;
const categories = [...inputCategories, "지출"] as const;
const filterCategories = ["전체", ...visibleInputCategories] as const;
const periodFilters = ["오늘", "어제", "이번 주", "전체"] as const;

type Category = (typeof categories)[number];
type CategoryFilter = (typeof filterCategories)[number];
type PeriodFilter = (typeof periodFilters)[number];
type AuthStatus = "checking" | "locked" | "unlocked";

type RecordRow = {
  id: string;
  category: string;
  content: string;
  created_at: string;
};

type LedgerRecord = {
  id: string;
  date: string;
  category: Category;
  content: string;
  createdAt: string;
};

type InvestmentData = {
  type: "investment";
  judgment: string;
  emotion: { tags: string[]; note: string };
  principle: string;
};

type WorkoutSet = {
  bodyPart: string;
  exercise: string;
  weight: string;
  reps: string;
  duration: string;
  intensity: string;
};

type WorkoutSetInput = WorkoutSet & { id: string };

type WorkoutData = {
  type: "workout";
  mode?: "free" | "detailed";
  freeText?: string;
  sets: WorkoutSet[];
  memo: string;
  bodyFlags: string[];
};

type AppView = "main" | "weekly" | "fitness";

type Principle = {
  id: string;
  text: string;
  date: string;
  archived: boolean;
  createdAt: string;
};

type WeeklyReviewData = {
  type: "weekly_review";
  weekId: string;
  weekStart: string;
  weekEnd: string;
  q1: string;
  q2: string;
  q3: string;
};

type WeeklyReview = {
  id: string;
  weekId: string;
  weekStart: string;
  weekEnd: string;
  q1: string;
  q2: string;
  q3: string;
  createdAt: string;
};

type InbodyRecord = {
  id: string;
  date: string;
  weight: number | null;
  muscleMass: number | null;
  fatPercentage: number | null;
  createdAt: string;
};

type BackupEntry = {
  id: string;
  category: string;
  content: string;
  created_at: string;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type WeeklySummary = {
  daysRecorded: number;
  dayDots: { date: string; categories: Category[] }[];
  workoutCount: number;
  bodyPartSets: Record<string, number>;
  bodyFlagFreq: Record<string, number>;
  investmentCount: number;
  emotionTagDist: Record<string, number>;
  newPrinciples: string[];
  topKeywords: string[];
};

const WORKOUT_BODY_PARTS = [
  "가슴",
  "등",
  "어깨",
  "팔",
  "하체",
  "코어",
  "유산소",
] as const;

const BODY_PART_COLORS: Record<string, string> = {
  가슴: "#18181b",
  등: "#2563eb",
  어깨: "#16a34a",
  팔: "#ca8a04",
  하체: "#dc2626",
  코어: "#9333ea",
  유산소: "#0891b2",
};

const WORKOUT_BODY_FLAGS = [
  "발가락 통증",
  "통풍 증상",
  "무릎 불편",
  "거북목/어깨 뻐근",
  "수면 부족",
  "컨디션 좋음",
  "없음",
] as const;

const WORKOUT_FREE_TEXT_PLACEHOLDER = `보조 풀업
60kg 12
50kg 10
50kg 10
40kg 8

보조 딥스
60kg 12
50kg 10
50kg 10

시티드 로우
25kg 20
32.5kg 15
40kg 12

메모:
등 자극 좋았음.`;

const WORKOUT_JOURNAL_PLACEHOLDER = `오늘 운동 기록을 자유롭게 입력하세요.

운동:
내용:
몸 상태:
평가:`;

const WORKOUT_EXAMPLE_TEXT = `운동: 가슴 + 어깨 / 70분

내용:
- 벤치프레스 40kg 10, 50kg 8, 60kg 5
- 숄더프레스 머신 30kg 12, 40kg 8
- 사이드레터럴 7kg 15x3

몸 상태:
무릎 통증 없음 / 발가락 불편함 없음 / 컨디션 보통

평가:
가슴 자극은 좋았고, 어깨는 후반에 힘이 빨리 빠졌다.`;

const WORKOUT_AUTO_TAG_RULES = [
  { tag: "가슴", keywords: ["가슴", "벤치프레스"] },
  { tag: "등", keywords: ["등", "풀업", "로우", "랫풀다운"] },
  { tag: "어깨", keywords: ["어깨", "숄더", "사이드레터럴"] },
  { tag: "팔", keywords: ["팔", "이두", "삼두", "컬"] },
  { tag: "하체", keywords: ["하체", "스쿼트", "레그", "런지"] },
  { tag: "코어", keywords: ["코어", "복근", "플랭크"] },
  { tag: "유산소", keywords: ["유산소", "러닝", "런닝", "걷기", "자전거"] },
  { tag: "무릎관리", keywords: ["무릎"] },
  { tag: "통풍관리", keywords: ["통풍", "발가락"] },
  { tag: "컨디션", keywords: ["컨디션", "몸 상태", "피로"] },
] as const;

const BACKUP_STORAGE_KEY = "life-ledger:backup-records";
const AUTH_STORAGE_KEY = "life-ledger:is-authenticated";
const PRINCIPLES_SEEDED_KEY = "life-ledger:principles-seeded";

function logSupabaseError(scope: string, error: SupabaseErrorLike) {
  console.error(`[Life Ledger] Supabase ${scope} failed`, {
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}

const INITIAL_PRINCIPLES = [
  { text: "프리장 급락만 보고 즉흥 매매하지 않기", date: "2026-06-23" },
  {
    text: '시장이 위축될 때는 "지금 사야 한다"보다 "무엇을 기다릴 것인가"를 먼저 정하기',
    date: "2026-06-23",
  },
  {
    text: "악재가 남아 있는 구간에서는 포지션 크기를 줄이고 관찰 비중을 높이기",
    date: "2026-06-23",
  },
  {
    text: "매수 전 확인: 급락이 단기 이벤트 반응인가? 본장에서도 이어지는가? 핵심 원인은 무엇인가? 손절 기준은 어디인가? 기회인가 감정인가?",
    date: "2026-06-23",
  },
] as const;
const appPassword = process.env.NEXT_PUBLIC_APP_PASSWORD;
const koreanDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const keywordStopWords = new Set([
  "그리고",
  "하지만",
  "그래서",
  "오늘",
  "이번",
  "저번",
  "내일",
  "너무",
  "정말",
  "조금",
  "많이",
  "있는",
  "없는",
  "했다",
  "한다",
  "해서",
  "것",
  "수",
  "더",
  "좀",
]);
const categoryHints: Record<Category, string> = {
  일기: "오늘 느낀 감정, 사건, 생각을 자유롭게 적어보세요.",
  투자: "매수, 매도, 배당, 종목 생각을 자유롭게 적어보세요.",
  운동: "운동 내용, 몸무게, 컨디션, 통증을 자유롭게 적어보세요.",
  "공부/콘텐츠": "자격증 공부, 쇼츠 아이디어, 대본, 프롬프트, 업로드 기록을 적어보세요.",
  가치관: "요즘 중요하게 생각하는 것, 인생 방향, 관계에서 느낀 점을 적어보세요.",
  지출: "오늘 쓴 돈이나 고정비 변화를 적어보세요.",
};
const tagRules: Array<{
  category: Category;
  keywords: string[];
}> = [
  {
    category: "투자",
    keywords: ["주식", "배당", "SCHD", "리플", "XRP", "매수", "매도"],
  },
  {
    category: "운동",
    keywords: ["운동", "등", "가슴", "어깨", "다리", "체중", "통증"],
  },
  {
    category: "공부/콘텐츠",
    keywords: ["쇼츠", "영상", "대본", "프롬프트", "곰벌레", "업로드", "공부", "자격증", "에너지관리"],
  },
  {
    category: "지출",
    keywords: ["돈", "지출", "카드", "고정비", "구독료"],
  },
  {
    category: "일기",
    keywords: ["감정", "외로움", "불안", "생각", "하루"],
  },
  {
    category: "가치관",
    keywords: ["의미", "가치관", "인생", "방향", "관계", "믿음"],
  },
];
const legacyCategoryMap = {
  신앙: "가치관",
  콘텐츠: "공부/콘텐츠",
} as const satisfies Record<string, Category>;

const INVESTMENT_EMOTION_CHIPS = [
  "계획됨",
  "불안",
  "FOMO",
  "확신",
  "긴장",
  "지루함",
  "후회",
] as const;

function parseInvestmentContent(content: string): InvestmentData | null {
  try {
    const parsed = JSON.parse(content) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      (parsed as { type: unknown }).type === "investment"
    ) {
      return parsed as InvestmentData;
    }

    return null;
  } catch {
    return null;
  }
}

function formatInvestmentBody(data: InvestmentData): string {
  const parts: string[] = [];

  if (data.judgment.trim()) {
    parts.push(`### 판단\n- ${data.judgment.trim()}`);
  }

  const hasEmotionTags = data.emotion.tags.length > 0;
  const hasEmotionNote = data.emotion.note.trim().length > 0;

  if (hasEmotionTags || hasEmotionNote) {
    const emotionLines: string[] = [];

    if (hasEmotionTags) {
      emotionLines.push(
        `- 태그: ${data.emotion.tags.map((t) => `#${t}`).join(" ")}`,
      );
    }

    if (hasEmotionNote) {
      emotionLines.push(`- ${data.emotion.note.trim()}`);
    }

    parts.push(`### 감정\n${emotionLines.join("\n")}`);
  }

  if (data.principle.trim()) {
    parts.push(`### 다음 원칙\n- ${data.principle.trim()}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : "- ";
}

function isCategory(value: string): value is Category {
  return categories.includes(value as Category);
}

function normalizeCategory(value: string): Category {
  if (isCategory(value)) {
    return value;
  }

  if (value in legacyCategoryMap) {
    return legacyCategoryMap[value as keyof typeof legacyCategoryMap];
  }

  return "가치관";
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatKoreanDate(date: Date) {
  return koreanDateFormatter.format(date);
}

function formatDate(value: string) {
  return formatKoreanDate(new Date(value));
}

function getKoreanToday() {
  return formatKoreanDate(new Date());
}

function getKoreanWeekStartDate() {
  const now = new Date();
  const koreanNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  );
  const day = koreanNow.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;

  koreanNow.setDate(koreanNow.getDate() - daysFromMonday);

  return formatLocalDate(koreanNow);
}

function getWeekMondayDate(weekOffset: number = 0): string {
  const now = new Date();
  const koreanNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  );
  const day = koreanNow.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;

  koreanNow.setDate(koreanNow.getDate() - daysFromMonday + weekOffset * 7);

  return formatLocalDate(koreanNow);
}

function getWeekSundayDate(mondayDate: string): string {
  const d = new Date(mondayDate + "T00:00:00");

  d.setDate(d.getDate() + 6);

  return formatLocalDate(d);
}

function getISOWeekId(mondayDate: string): string {
  const date = new Date(mondayDate + "T00:00:00");
  const jan4 = new Date(date.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);

  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));

  const weekNum =
    Math.floor((date.getTime() - startOfWeek1.getTime()) / (7 * 86400000)) + 1;

  return `${date.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function getWeeklyReviewTitle(date: string) {
  const [, monthText, dayText] = date.split("-");
  const month = Number(monthText);
  const day = Number(dayText);
  const weekOfMonth = Math.ceil(day / 7);

  return `${month}월 ${weekOfMonth}주차`;
}

function getToday() {
  return getKoreanToday();
}

function getYesterday() {
  const date = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  );
  date.setDate(date.getDate() - 1);

  return formatLocalDate(date);
}

function computeStreak(records: LedgerRecord[]) {
  const recordedDates = new Set(records.map((record) => record.date));
  const cursor = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  );
  let streak = 0;

  while (recordedDates.has(formatLocalDate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getWeekStart() {
  return getKoreanWeekStartDate();
}

function matchesPeriod(record: LedgerRecord, periodFilter: PeriodFilter) {
  if (periodFilter === "전체") {
    return true;
  }

  if (periodFilter === "오늘") {
    return record.date === getToday();
  }

  if (periodFilter === "어제") {
    return record.date === getYesterday();
  }

  return record.date >= getWeekStart() && record.date <= getToday();
}

function mapRecordRow(row: RecordRow): LedgerRecord {
  return {
    id: row.id,
    date: formatDate(row.created_at),
    category: normalizeCategory(row.category),
    content: row.content,
    createdAt: row.created_at,
  };
}

function getWorkoutPlainText(content: string): string {
  const data = parseWorkoutContent(content);

  if (!data) {
    return content;
  }

  if (data.mode === "free") {
    return data.freeText?.trim() ?? "";
  }

  return formatWorkoutBody(data);
}

function extractBracketTags(content: string) {
  const tags: string[] = [];
  const tagPattern = /\[\[([^\]\n]+)\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(content)) !== null) {
    const tag = match[1].trim();

    if (tag && tag !== "운동" && !tags.includes(tag)) {
      tags.push(tag);
    }
  }

  return tags;
}

function getWorkoutConnectionTags(content: string) {
  const directTags = extractBracketTags(content);

  if (directTags.length > 0) {
    return ["운동", ...directTags];
  }

  const normalizedContent = content.toLowerCase();
  const autoTags = WORKOUT_AUTO_TAG_RULES.filter(({ keywords }) =>
    keywords.some((keyword) =>
      normalizedContent.includes(keyword.toLowerCase()),
    ),
  )
    .map(({ tag }) => tag)
    .slice(0, 3);

  return ["운동", ...autoTags];
}

function createWorkoutMarkdown(content: string) {
  const body = getWorkoutPlainText(content).trim();
  const tags = getWorkoutConnectionTags(body)
    .map((tag) => `[[${tag}]]`)
    .join("\n");

  return `## 운동

${body}

## 연결 태그
${tags}`;
}

function createMarkdown(
  record: Pick<LedgerRecord, "date" | "category" | "content">,
) {
  if (record.category === "운동") {
    return createWorkoutMarkdown(record.content);
  }

  const body =
    record.category === "투자"
      ? (() => {
          const data = parseInvestmentContent(record.content);
          return data ? formatInvestmentBody(data) : record.content;
        })()
      : record.content;

  return `# ${record.date} 기록

## 카테고리
- ${record.category}

## 내용
${body}`;
}

function extractRecordText(record: LedgerRecord): string {
  if (record.category === "투자") {
    const data = parseInvestmentContent(record.content);
    if (data) {
      return [data.judgment, data.emotion.note, data.principle]
        .filter(Boolean)
        .join(" ");
    }
  }

  if (record.category === "운동") {
    const data = parseWorkoutContent(record.content);
    if (data) return data.mode === "free" ? (data.freeText ?? "") : data.memo;
  }

  return record.content;
}

function getRecommendedTags(content: string) {
  const normalizedContent = content.toLowerCase();

  return tagRules
    .filter(({ keywords }) =>
      keywords.some((keyword) =>
        normalizedContent.includes(keyword.toLowerCase()),
      ),
    )
    .map(({ category }) => category);
}

function createDailyMarkdown(records: LedgerRecord[], date: string) {
  const recordsByCategory = new Map<Category, LedgerRecord[]>(
    inputCategories.map((category) => [category, []]),
  );

  for (const record of records) {
    recordsByCategory.get(record.category)?.push(record);
  }

  const categorySections = inputCategories
    .map((category) => {
      const categoryRecords = recordsByCategory.get(category) ?? [];
      let recordLines: string;

      if (categoryRecords.length === 0) {
        recordLines = "- ";
      } else if (category === "투자") {
        recordLines = categoryRecords
          .map((record) => {
            const data = parseInvestmentContent(record.content);
            return data ? formatInvestmentBody(data) : `- ${record.content}`;
          })
          .join("\n\n");
      } else if (category === "운동") {
        recordLines = categoryRecords
          .map((record) => {
            const data = parseWorkoutContent(record.content);
            return data ? formatWorkoutBody(data) : `- ${record.content}`;
          })
          .join("\n\n");
      } else {
        recordLines = categoryRecords
          .map((record) => `- ${record.content}`)
          .join("\n");
      }

      return `## ${category}\n${recordLines}`;
    })
    .join("\n\n");

  const categoriesWithRecords = inputCategories.filter(
    (cat) => (recordsByCategory.get(cat)?.length ?? 0) > 0,
  );
  const connectionTags =
    categoriesWithRecords.length > 0
      ? categoriesWithRecords.map((cat) => `- [[${cat}]]`).join("\n")
      : "- ";

  const allText = records.map((r) => extractRecordText(r)).join(" ");
  const stopWords = new Set([
    "이","그","저","것","수","때","를","을","의","에","가","은","는","도","와",
    "으로","에서","부터","까지","만","도","이다","하다","있다","없다","되다","않다",
    "이번","오늘","그냥","진짜","좀","더","다","또","안","못",
  ]);

  function tokenize(text: string) {
    return text.split(/[\s\,\.\!\?\:\;\(\)\[\]\{\}\"\'\/\\]+/).filter(Boolean);
  }

  const wordFreq = new Map<string, number>();
  for (const word of tokenize(allText)) {
    if (word.length < 2 || stopWords.has(word)) continue;
    wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
  }

  const emotionKeywords = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => `#${word}`)
    .join(" ");

  const coreLinks = Array.from(wordFreq.entries())
    .filter(([word, count]) => count >= 2 && word.length >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => `[[${word}]]`)
    .join(", ");

  return `# ${date} Life Ledger

${categorySections}

## 연결 태그
${connectionTags}

## 감정 키워드
${emotionKeywords || "-"}

## 핵심 링크
${coreLinks || "-"}`;
}

function extractFrequentKeywords(records: LedgerRecord[]) {
  const counts = new Map<string, number>();

  for (const record of records) {
    const words = record.content
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2 && !keywordStopWords.has(word));

    for (const word of words) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((first, second) => second[1] - first[1])
    .slice(0, 10)
    .map(([word, count]) => `- ${word} (${count})`);
}

function createWeeklyReviewMarkdown(records: LedgerRecord[], today: string) {
  const weekTitle = getWeeklyReviewTitle(today);
  const recordsByCategory = new Map<Category, LedgerRecord[]>(
    inputCategories.map((category) => [category, []]),
  );

  for (const record of records) {
    recordsByCategory.get(record.category)?.push(record);
  }

  const categorySections = inputCategories
    .map((category) => {
      const categoryRecords = recordsByCategory.get(category) ?? [];
      let recordLines: string;

      if (categoryRecords.length === 0) {
        recordLines = "- 기록 없음";
      } else if (category === "투자") {
        recordLines = categoryRecords
          .map((record) => {
            const data = parseInvestmentContent(record.content);
            return data ? formatInvestmentBody(data) : `- ${record.content}`;
          })
          .join("\n\n");
      } else if (category === "운동") {
        recordLines = categoryRecords
          .map((record) => {
            const data = parseWorkoutContent(record.content);
            return data ? formatWorkoutBody(data) : `- ${record.content}`;
          })
          .join("\n\n");
      } else {
        recordLines = categoryRecords
          .map((record) => `- ${record.content}`)
          .join("\n");
      }

      return `### ${category}\n${recordLines}`;
    })
    .join("\n\n");
  const keywordLines = extractFrequentKeywords(records);
  const keywordSection =
    keywordLines.length > 0 ? keywordLines.join("\n") : "- 기록 없음";

  return `# ${today.slice(0, 4)}년 ${weekTitle} Life Ledger 회고

## 이번 주 기록 요약

${categorySections}

## 이번 주 반복 키워드
${keywordSection}

## 이번 주 좋았던 점
- 

## 이번 주 아쉬웠던 점
- 

## 다음 주 집중할 것
- 

## 연결 태그
- [[주간회고]]
- [[Life Ledger]]
- [[일기]]
- [[투자]]
- [[운동]]
- [[공부/콘텐츠]]
- [[가치관]]`;
}

function groupRecordsByDate(records: LedgerRecord[]) {
  const groupedRecords = new Map<string, LedgerRecord[]>();

  for (const record of records) {
    const recordsForDate = groupedRecords.get(record.date) ?? [];
    recordsForDate.push(record);
    groupedRecords.set(record.date, recordsForDate);
  }

  return Array.from(groupedRecords.entries()).map(([date, dateRecords]) => ({
    date,
    records: dateRecords,
  }));
}

function parseWorkoutContent(content: string): WorkoutData | null {
  try {
    const parsed = JSON.parse(content) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      (parsed as { type: unknown }).type === "workout"
    ) {
      return parsed as WorkoutData;
    }

    return null;
  } catch {
    return null;
  }
}

type WorkoutDisplayGroup = {
  label: string;
  items: string[];
  isSetList: boolean;
};

const FREE_WORKOUT_SET_LINE = /^([\d.]+)\s*kg\s+([\d.]+)\s*(?:회)?$/i;

function parseFreeWorkoutText(text: string): WorkoutDisplayGroup[] {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks.map((block) => {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const label = (lines[0] ?? "").replace(/:$/, "");
    const rest = lines.slice(1);
    const isSetList =
      rest.length > 0 && rest.every((l) => FREE_WORKOUT_SET_LINE.test(l));

    const items = isSetList
      ? rest.map((l) => {
          const m = l.match(FREE_WORKOUT_SET_LINE)!;
          return `${m[1]}kg × ${m[2]}회`;
        })
      : rest;

    return { label, items, isSetList };
  });
}

function getWorkoutDisplayGroups(data: WorkoutData): WorkoutDisplayGroup[] {
  if (data.mode === "free") {
    return parseFreeWorkoutText(data.freeText ?? "");
  }

  const validSets = data.sets.filter(
    (s) => s.exercise.trim() || s.duration.trim(),
  );
  const groups = new Map<string, WorkoutSet[]>();

  for (const s of validSets) {
    const key = `${s.bodyPart || "-"}__${s.exercise || "-"}`;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  return Array.from(groups.values()).map((sets) => {
    const first = sets[0];
    const label = first.bodyPart
      ? `[${first.bodyPart}] ${first.exercise || "(운동명 없음)"}`
      : first.exercise || "(운동명 없음)";
    const items = sets
      .map((s) =>
        s.bodyPart === "유산소"
          ? [s.duration && `${s.duration}분`, s.intensity && `강도 ${s.intensity}`]
              .filter(Boolean)
              .join(" ")
          : [s.weight && `${s.weight}kg`, s.reps && `${s.reps}회`]
              .filter(Boolean)
              .join(" "),
      )
      .filter(Boolean);

    return { label, items, isSetList: true };
  });
}

function formatWorkoutBody(data: WorkoutData): string {
  const parts: string[] = [];
  const groups = getWorkoutDisplayGroups(data);

  if (groups.length > 0) {
    const sections = groups.map((g) => {
      if (g.items.length === 0) return `**${g.label}**`;

      const body = g.isSetList
        ? g.items.map((item) => `- ${item}`).join("\n")
        : g.items.join("\n");

      return `**${g.label}**\n${body}`;
    });

    parts.push(`### 운동 기록\n${sections.join("\n\n")}`);
  }

  if (data.bodyFlags.length > 0) {
    const tags = data.bodyFlags
      .map((f) => `- #${f.replace(/[\s/]+/g, "")}`)
      .join("\n");

    parts.push(`### 몸 상태\n${tags}`);
  }

  if (data.mode !== "free" && data.memo.trim()) {
    parts.push(`### 메모\n${data.memo.trim()}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : "- ";
}

function parsePrincipleRow(row: RecordRow): Principle {
  try {
    const parsed = JSON.parse(row.content) as {
      text: string;
      archived: boolean;
      date: string;
    };

    return {
      id: row.id,
      text: parsed.text ?? "",
      date: parsed.date ?? formatDate(row.created_at),
      archived: parsed.archived ?? false,
      createdAt: row.created_at,
    };
  } catch {
    return {
      id: row.id,
      text: row.content,
      date: formatDate(row.created_at),
      archived: false,
      createdAt: row.created_at,
    };
  }
}

function computeWeeklySummary(
  records: LedgerRecord[],
  principles: Principle[],
  weekStart: string,
  weekEnd: string,
): WeeklySummary {
  const weekRecords = records.filter(
    (r) => r.date >= weekStart && r.date <= weekEnd,
  );

  const dateSet = new Set(weekRecords.map((r) => r.date));

  const allDays: string[] = [];
  const startDate = new Date(weekStart + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    allDays.push(formatLocalDate(d));
  }

  const dayDots = allDays.map((date) => ({
    date,
    categories: Array.from(
      new Set(
        weekRecords.filter((r) => r.date === date).map((r) => r.category),
      ),
    ),
  }));

  const workoutRecords = weekRecords.filter((r) => r.category === "운동");
  const bodyPartSets: Record<string, number> = {};
  const bodyFlagFreq: Record<string, number> = {};

  for (const rec of workoutRecords) {
    const data = parseWorkoutContent(rec.content);
    if (!data) continue;
    for (const set of data.sets) {
      if (set.exercise.trim() || set.duration.trim()) {
        bodyPartSets[set.bodyPart] = (bodyPartSets[set.bodyPart] ?? 0) + 1;
      }
    }
    for (const flag of data.bodyFlags) {
      bodyFlagFreq[flag] = (bodyFlagFreq[flag] ?? 0) + 1;
    }
  }

  const investmentRecords = weekRecords.filter((r) => r.category === "투자");
  const emotionTagDist: Record<string, number> = {};

  for (const rec of investmentRecords) {
    const data = parseInvestmentContent(rec.content);
    if (!data) continue;
    for (const tag of data.emotion.tags) {
      emotionTagDist[tag] = (emotionTagDist[tag] ?? 0) + 1;
    }
  }

  const newPrinciples = principles
    .filter((p) => p.date >= weekStart && p.date <= weekEnd && !p.archived)
    .map((p) => p.text);

  const allText = weekRecords.map((r) => extractRecordText(r)).join(" ");
  const stopWordsLocal = new Set([
    "이", "그", "저", "것", "수", "때", "를", "을", "의", "에", "가", "은",
    "는", "도", "와", "으로", "에서", "부터", "까지", "만", "이다", "하다",
    "있다", "없다", "되다", "않다", "이번", "오늘", "그냥", "진짜", "좀",
    "더", "다", "또", "안", "못",
  ]);
  const wordFreq = new Map<string, number>();
  for (const word of allText.split(/[\s,.\!\?\:\;\(\)\[\]\{\}\"\'\/\\]+/).filter(Boolean)) {
    if (word.length < 2 || stopWordsLocal.has(word)) continue;
    wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
  }
  const topKeywords = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  return {
    daysRecorded: dateSet.size,
    dayDots,
    workoutCount: workoutRecords.length,
    bodyPartSets,
    bodyFlagFreq,
    investmentCount: investmentRecords.length,
    emotionTagDist,
    newPrinciples,
    topKeywords,
  };
}

function formatWeeklyReviewFullMarkdown(
  weekId: string,
  weekStart: string,
  weekEnd: string,
  summary: WeeklySummary,
  q1: string,
  q2: string,
  q3: string,
): string {
  const bodyPartLines =
    Object.entries(summary.bodyPartSets)
      .map(([part, count]) => `- ${part}: ${count}세트`)
      .join("\n") || "- 없음";

  const bodyFlagLines =
    Object.entries(summary.bodyFlagFreq)
      .map(([flag, count]) => `- ${flag}: ${count}회`)
      .join("\n") || "- 없음";

  const emotionTagLines =
    Object.entries(summary.emotionTagDist)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => `- #${tag}: ${count}회`)
      .join("\n") || "- 없음";

  const principleLines =
    summary.newPrinciples.length > 0
      ? summary.newPrinciples.map((p) => `- ${p}`).join("\n")
      : "- 없음";

  const keywordLine =
    summary.topKeywords.length > 0
      ? summary.topKeywords.map((w) => `#${w}`).join(" ")
      : "-";

  const [yearStr, mStr] = weekStart.split("-");
  const [, , dStr] = weekStart.split("-");
  const weekOfMonth = Math.ceil(Number(dStr) / 7);
  const titleText = `${yearStr}년 ${Number(mStr)}월 ${weekOfMonth}주차`;

  return `# ${titleText} 주간 회고 (${weekId})
기간: ${weekStart} ~ ${weekEnd}

## 자동 요약

### 기록한 날
${summary.daysRecorded}/7일

### 운동
횟수: ${summary.workoutCount}회

**부위별 세트 수**
${bodyPartLines}

**몸 상태 플래그**
${bodyFlagLines}

### 투자
기록: ${summary.investmentCount}회

**감정 태그 분포**
${emotionTagLines}

**이번 주 추가된 원칙**
${principleLines}

### 이번 주 감정 키워드
${keywordLine}

## 회고

### 이번 주 가장 잘한 결정
${q1 || "-"}

### 반복하고 싶지 않은 것
${q2 || "-"}

### 다음 주에 딱 하나만 바꾼다면
${q3 || "-"}

## 연결 태그
- [[주간회고]]
- [[Life Ledger]]`;
}

function parseWeeklyReviewRow(row: RecordRow): WeeklyReview {
  try {
    const parsed = JSON.parse(row.content) as WeeklyReviewData;

    return {
      id: row.id,
      weekId: parsed.weekId ?? "",
      weekStart: parsed.weekStart ?? "",
      weekEnd: parsed.weekEnd ?? "",
      q1: parsed.q1 ?? "",
      q2: parsed.q2 ?? "",
      q3: parsed.q3 ?? "",
      createdAt: row.created_at,
    };
  } catch {
    return {
      id: row.id,
      weekId: "",
      weekStart: "",
      weekEnd: "",
      q1: row.content,
      q2: "",
      q3: "",
      createdAt: row.created_at,
    };
  }
}

function parseInbodyRow(row: RecordRow): InbodyRecord {
  try {
    const parsed = JSON.parse(row.content) as {
      date: string;
      weight: string;
      muscleMass: string;
      fatPercentage: string;
    };
    const toNum = (s: string) => {
      const n = parseFloat(s);
      return isNaN(n) ? null : n;
    };

    return {
      id: row.id,
      date: parsed.date ?? formatDate(row.created_at),
      weight: parsed.weight ? toNum(parsed.weight) : null,
      muscleMass: parsed.muscleMass ? toNum(parsed.muscleMass) : null,
      fatPercentage: parsed.fatPercentage ? toNum(parsed.fatPercentage) : null,
      createdAt: row.created_at,
    };
  } catch {
    return {
      id: row.id,
      date: formatDate(row.created_at),
      weight: null,
      muscleMass: null,
      fatPercentage: null,
      createdAt: row.created_at,
    };
  }
}

function loadBackupRecords(): BackupEntry[] {
  try {
    const raw = window.localStorage.getItem(BACKUP_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as BackupEntry[]) : [];
  } catch {
    return [];
  }
}

function saveBackupRecords(entries: BackupEntry[]) {
  window.localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(entries));
}

function backupRecord(record: { category: string; content: string }): BackupEntry {
  const currentEntries = loadBackupRecords();
  const existing = currentEntries.find(
    (entry) =>
      entry.category === record.category && entry.content === record.content,
  );

  if (existing) {
    return existing;
  }

  const entry: BackupEntry = {
    id: crypto.randomUUID(),
    category: record.category,
    content: record.content,
    created_at: new Date().toISOString(),
  };

  saveBackupRecords([entry, ...currentEntries]);

  return entry;
}

function removeBackupEntry(id: string): BackupEntry[] {
  const remaining = loadBackupRecords().filter((entry) => entry.id !== id);

  saveBackupRecords(remaining);

  return remaining;
}

function getBackupPreviewText(entry: BackupEntry): string {
  if (entry.category === "투자") {
    const data = parseInvestmentContent(entry.content);
    if (data) {
      return (
        [data.judgment, data.emotion.note, data.principle]
          .filter(Boolean)
          .join(" · ") || "(내용 없음)"
      );
    }
  }

  if (entry.category === "운동") {
    const data = parseWorkoutContent(entry.content);
    if (data) {
      if (data.mode === "free") {
        return data.freeText?.trim().slice(0, 40) || "(내용 없음)";
      }
      return data.memo.trim() || `세트 ${data.sets.length}개`;
    }
  }

  if (entry.category === "주간회고") {
    try {
      const data = JSON.parse(entry.content) as {
        q1?: string;
        q2?: string;
        q3?: string;
      };

      return (
        [data.q1, data.q2, data.q3].filter(Boolean).join(" · ") ||
        "(내용 없음)"
      );
    } catch {
      return entry.content;
    }
  }

  if (entry.category === "인바디") {
    try {
      const data = JSON.parse(entry.content) as {
        weight?: string;
        muscleMass?: string;
        fatPercentage?: string;
      };

      return (
        [
          data.weight && `체중 ${data.weight}kg`,
          data.muscleMass && `근 ${data.muscleMass}kg`,
          data.fatPercentage && `지방 ${data.fatPercentage}%`,
        ]
          .filter(Boolean)
          .join(" · ") || "(내용 없음)"
      );
    } catch {
      return entry.content;
    }
  }

  return entry.content;
}

function WeeklyReviewForm({
  initialQ1,
  initialQ2,
  initialQ3,
  onChangeQ1,
  onChangeQ2,
  onChangeQ3,
}: {
  initialQ1: string;
  initialQ2: string;
  initialQ3: string;
  onChangeQ1: (value: string) => void;
  onChangeQ2: (value: string) => void;
  onChangeQ3: (value: string) => void;
}) {
  const [q1, setQ1] = useState(initialQ1);
  const [q2, setQ2] = useState(initialQ2);
  const [q3, setQ3] = useState(initialQ3);

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-sm font-semibold text-zinc-800">
          1. 이번 주 가장 잘한 결정은?
        </span>
        <textarea
          value={q1}
          onChange={(e) => {
            setQ1(e.target.value);
            onChangeQ1(e.target.value);
          }}
          placeholder="자유롭게 적어보세요."
          className="mt-2 min-h-20 w-full resize-none rounded-lg border border-zinc-200 bg-white px-4 py-3 text-base leading-7 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-zinc-800">
          2. 반복하고 싶지 않은 것은?
        </span>
        <textarea
          value={q2}
          onChange={(e) => {
            setQ2(e.target.value);
            onChangeQ2(e.target.value);
          }}
          placeholder="자유롭게 적어보세요."
          className="mt-2 min-h-20 w-full resize-none rounded-lg border border-zinc-200 bg-white px-4 py-3 text-base leading-7 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-zinc-800">
          3. 다음 주에 딱 하나만 바꾼다면?
        </span>
        <textarea
          value={q3}
          onChange={(e) => {
            setQ3(e.target.value);
            onChangeQ3(e.target.value);
          }}
          placeholder="자유롭게 적어보세요."
          className="mt-2 min-h-20 w-full resize-none rounded-lg border border-zinc-200 bg-white px-4 py-3 text-base leading-7 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10"
        />
      </label>
    </div>
  );
}

export default function Home() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category>("일기");
  const [selectedFilter, setSelectedFilter] = useState<CategoryFilter>("전체");
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [content, setContent] = useState("");
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [copyMessage, setCopyMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [recordLoadError, setRecordLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [investmentJudgment, setInvestmentJudgment] = useState("");
  const [investmentEmotionTags, setInvestmentEmotionTags] = useState<string[]>(
    [],
  );
  const [investmentEmotionNote, setInvestmentEmotionNote] = useState("");
  const [investmentPrinciple, setInvestmentPrinciple] = useState("");
  const [workoutSets, setWorkoutSets] = useState<WorkoutSetInput[]>([
    {
      id: crypto.randomUUID(),
      bodyPart: "",
      exercise: "",
      weight: "",
      reps: "",
      duration: "",
      intensity: "",
    },
  ]);
  const [workoutMemo, setWorkoutMemo] = useState("");
  const [workoutBodyFlags, setWorkoutBodyFlags] = useState<string[]>([]);
  const [workoutMode, setWorkoutMode] = useState<"free" | "detailed">("free");
  const [workoutFreeText, setWorkoutFreeText] = useState("");
  const [workoutExerciseFocus, setWorkoutExerciseFocus] = useState<
    string | null
  >(null);
  const [view, setView] = useState<AppView>("main");
  const [principles, setPrinciples] = useState<Principle[]>([]);
  const [weeklyReviews, setWeeklyReviews] = useState<WeeklyReview[]>([]);
  const [weeklyReviewsLoaded, setWeeklyReviewsLoaded] = useState(false);
  const [weeklyReviewQ1, setWeeklyReviewQ1] = useState("");
  const [weeklyReviewQ2, setWeeklyReviewQ2] = useState("");
  const [weeklyReviewQ3, setWeeklyReviewQ3] = useState("");
  const [weeklyReviewListMode, setWeeklyReviewListMode] = useState(false);
  const [selectedWeeklyReview, setSelectedWeeklyReview] =
    useState<WeeklyReview | null>(null);
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [inbodyRecords, setInbodyRecords] = useState<InbodyRecord[]>([]);
  const [inbodyDate, setInbodyDate] = useState(() => getToday());
  const [inbodyWeight, setInbodyWeight] = useState("");
  const [inbodyMuscle, setInbodyMuscle] = useState("");
  const [inbodyFat, setInbodyFat] = useState("");
  const [isSavingInbody, setIsSavingInbody] = useState(false);
  const [selectedFitnessExercise, setSelectedFitnessExercise] = useState("");
  const [backupEntries, setBackupEntries] = useState<BackupEntry[]>([]);
  const [retryingBackupId, setRetryingBackupId] = useState<string | null>(null);
  const [deletingBackupId, setDeletingBackupId] = useState<string | null>(null);

  const refreshBackupEntries = useCallback(() => {
    setBackupEntries(loadBackupRecords());
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      refreshBackupEntries();
    });
  }, [refreshBackupEntries]);

  const fetchRecords = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    setRecordLoadError(false);

    const { data, error } = await supabase
      .from("records")
      .select("id, category, content, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      logSupabaseError("select records", error);
      setRecordLoadError(true);
      setErrorMessage(
        "기록을 불러오지 못했습니다. Supabase 연결 또는 권한 설정을 확인한 뒤 다시 시도하세요.",
      );
      setRecords([]);
      setIsLoading(false);
      return;
    }

    const rawData = (data ?? []) as RecordRow[];
    const principleRows = rawData.filter((row) => row.category === "원칙");
    const weeklyReviewRows = rawData.filter(
      (row) => row.category === "주간회고",
    );
    const inbodyRows = rawData.filter((row) => row.category === "인바디");
    const recordRows = rawData.filter(
      (row) =>
        row.category !== "원칙" &&
        row.category !== "주간회고" &&
        row.category !== "공부노트" &&
        row.category !== "인바디",
    );
    const fetchedPrinciples = principleRows.map(parsePrincipleRow);

    setRecords(recordRows.map(mapRecordRow));
    setPrinciples(fetchedPrinciples);
    setWeeklyReviews(weeklyReviewRows.map(parseWeeklyReviewRow));
    setWeeklyReviewsLoaded(true);
    setInbodyRecords(inbodyRows.map(parseInbodyRow));
    setIsLoading(false);

    if (fetchedPrinciples.length === 0) {
      const alreadySeeded = window.localStorage.getItem(PRINCIPLES_SEEDED_KEY);

      if (!alreadySeeded) {
        const results = await Promise.all(
          INITIAL_PRINCIPLES.map((item) =>
            supabase
              .from("records")
              .insert({
                category: "원칙",
                content: JSON.stringify({
                  type: "principle",
                  text: item.text,
                  archived: false,
                  date: item.date,
                }),
              })
              .select("id, category, content, created_at")
              .single(),
          ),
        );

        const allSucceeded = results.every(
          (r) => !r.error && r.data !== null,
        );

        if (allSucceeded) {
          window.localStorage.setItem(PRINCIPLES_SEEDED_KEY, "true");
        }

        const seeded = results
          .filter((r) => r.data !== null)
          .map((r) => parsePrincipleRow(r.data as RecordRow));

        setPrinciples(seeded);
      }
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      if (!appPassword) {
        console.warn("NEXT_PUBLIC_APP_PASSWORD is not set");
        setAuthStatus("locked");
        return;
      }

      const isAuthenticated =
        window.sessionStorage.getItem(AUTH_STORAGE_KEY) === "true";

      setAuthStatus(isAuthenticated ? "unlocked" : "locked");
    });
  }, []);

  useEffect(() => {
    if (authStatus !== "unlocked") {
      return;
    }

    queueMicrotask(() => {
      void fetchRecords();
    });
  }, [authStatus, fetchRecords]);

  useEffect(() => {
    if (authStatus !== "unlocked" || !("Notification" in window)) return;

    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
    );
    if (now.getDay() !== 0) return;

    const target = new Date(now);
    target.setHours(20, 0, 0, 0);
    const msUntil = target.getTime() - now.getTime();
    if (msUntil < 0 || msUntil > 4 * 3600000) return;

    const timer = setTimeout(() => {
      if (Notification.permission === "granted") {
        new Notification("Life Ledger", { body: "이번 주 회고할 시간입니다." });
      }
    }, Math.max(0, msUntil));

    return () => clearTimeout(timer);
  }, [authStatus]);

  const isEditing = editingRecordId !== null;
  const investmentHasContent =
    investmentJudgment.trim().length > 0 ||
    investmentEmotionTags.length > 0 ||
    investmentEmotionNote.trim().length > 0 ||
    investmentPrinciple.trim().length > 0;
  const workoutHasContent = content.trim().length > 0;
  const canSave =
    (selectedCategory === "투자"
      ? investmentHasContent
      : selectedCategory === "운동"
        ? workoutHasContent
        : content.trim().length > 0) && !isSaving;
  const today = getToday();
  const todayRecords = useMemo(
    () => records.filter((record) => record.date === today),
    [records, today],
  );
  const thisWeekRecords = useMemo(() => {
    const weekStart = getWeekStart();

    return records.filter(
      (record) => record.date >= weekStart && record.date <= today,
    );
  }, [records, today]);
  const filteredRecords = useMemo(
    () => {
      const normalizedSearchQuery = searchQuery.trim().toLowerCase();

      return records.filter((record) => {
        const matchesCategory =
          selectedFilter === "전체" || record.category === selectedFilter;
        const matchesSelectedPeriod = matchesPeriod(record, selectedPeriod);
        const matchesSearch =
          !normalizedSearchQuery ||
          record.content.toLowerCase().includes(normalizedSearchQuery);

        return matchesSelectedPeriod && matchesCategory && matchesSearch;
      });
    },
    [records, searchQuery, selectedFilter, selectedPeriod],
  );
  const groupedRecords = useMemo(
    () => groupRecordsByDate(filteredRecords),
    [filteredRecords],
  );

  const currentWeekMonday = getWeekMondayDate(0);
  const currentWeekSunday = getWeekSundayDate(currentWeekMonday);
  const currentWeekId = getISOWeekId(currentWeekMonday);
  const lastWeekId = getISOWeekId(getWeekMondayDate(-1));

  const existingWeeklyReview = weeklyReviews.find(
    (r) => r.weekId === currentWeekId,
  );
  const weeklyReviewExists = existingWeeklyReview !== undefined;
  const hasMissingWeeklyReview = !weeklyReviews.some(
    (r) => r.weekId === lastWeekId,
  );

  const weeklySummary = useMemo(
    () =>
      computeWeeklySummary(
        records,
        principles,
        currentWeekMonday,
        currentWeekSunday,
      ),
    [records, principles, currentWeekMonday, currentWeekSunday],
  );

  const todayCategorySet = useMemo(
    () => new Set(todayRecords.map((record) => record.category)),
    [todayRecords],
  );

  const recordStreak = useMemo(() => computeStreak(records), [records]);

  const recentExercisesByBodyPart = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const record of records) {
      if (record.category === "운동") {
        const data = parseWorkoutContent(record.content);

        if (data) {
          for (const set of data.sets) {
            if (set.exercise.trim() && set.bodyPart) {
              const existing = map.get(set.bodyPart) ?? [];

              if (!existing.includes(set.exercise.trim())) {
                map.set(set.bodyPart, [set.exercise.trim(), ...existing]);
              }
            }
          }
        }
      }
    }

    return map;
  }, [records]);

  const weeklyBodyPartData = useMemo(() => {
    return [-3, -2, -1, 0].map((offset) => {
      const monday = getWeekMondayDate(offset);
      const sunday = getWeekSundayDate(monday);
      const weekLabel = `${Number(monday.slice(5, 7))}/${Number(monday.slice(8, 10))}`;
      const weekRecords = records.filter(
        (r) => r.category === "운동" && r.date >= monday && r.date <= sunday,
      );
      const counts: Record<string, number> = {};

      for (const rec of weekRecords) {
        const data = parseWorkoutContent(rec.content);
        if (!data) continue;
        for (const set of data.sets) {
          if (set.exercise.trim() || set.duration.trim()) {
            counts[set.bodyPart] = (counts[set.bodyPart] ?? 0) + 1;
          }
        }
      }

      return { week: weekLabel, ...counts };
    });
  }, [records]);

  const fitnessExerciseNames = useMemo(() => {
    const names = new Set<string>();

    for (const rec of records) {
      if (rec.category !== "운동") continue;
      const data = parseWorkoutContent(rec.content);
      if (!data) continue;
      for (const set of data.sets) {
        if (set.exercise.trim() && set.bodyPart !== "유산소" && set.weight) {
          names.add(set.exercise.trim());
        }
      }
    }

    return Array.from(names).sort();
  }, [records]);

  const exerciseWeightData = useMemo(() => {
    if (!selectedFitnessExercise) return [];
    const dateMax = new Map<string, number>();

    for (const rec of records) {
      if (rec.category !== "운동") continue;
      const data = parseWorkoutContent(rec.content);
      if (!data) continue;
      for (const set of data.sets) {
        if (set.exercise.trim() === selectedFitnessExercise && set.weight) {
          const w = parseFloat(set.weight);
          if (!isNaN(w)) {
            dateMax.set(rec.date, Math.max(dateMax.get(rec.date) ?? 0, w));
          }
        }
      }
    }

    return Array.from(dateMax.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, weight]) => ({
        date: `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`,
        중량: weight,
      }));
  }, [records, selectedFitnessExercise]);

  const inbodyChartData = useMemo(() => {
    return [...inbodyRecords]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        date: `${Number(r.date.slice(5, 7))}/${Number(r.date.slice(8, 10))}`,
        체중: r.weight,
        골격근량: r.muscleMass,
        체지방률: r.fatPercentage,
      }));
  }, [inbodyRecords]);

  const buildWorkoutData = useCallback((): WorkoutData => {
    if (workoutMode === "free") {
      return {
        type: "workout",
        mode: "free",
        freeText: workoutFreeText.trim(),
        sets: [],
        memo: "",
        bodyFlags: workoutBodyFlags,
      };
    }

    return {
      type: "workout",
      mode: "detailed",
      freeText: "",
      sets: workoutSets
        .filter((s) => s.exercise.trim() || s.duration.trim())
        .map((s) => ({
          bodyPart: s.bodyPart,
          exercise: s.exercise,
          weight: s.weight,
          reps: s.reps,
          duration: s.duration,
          intensity: s.intensity,
        })),
      memo: workoutMemo.trim(),
      bodyFlags: workoutBodyFlags,
    };
  }, [workoutMode, workoutFreeText, workoutSets, workoutMemo, workoutBodyFlags]);

  const draftMarkdown = useMemo(() => {
    if (selectedCategory === "투자") {
      const data: InvestmentData = {
        type: "investment",
        judgment: investmentJudgment.trim(),
        emotion: {
          tags: investmentEmotionTags,
          note: investmentEmotionNote.trim(),
        },
        principle: investmentPrinciple.trim(),
      };

      return `# ${today} 기록\n\n## 카테고리\n- 투자\n\n## 내용\n${formatInvestmentBody(data)}`;
    }

    if (selectedCategory === "운동") {
      return createWorkoutMarkdown(content.trim());
    }

    return createMarkdown({
      date: today,
      category: selectedCategory,
      content: content.trim(),
    });
  }, [
    content,
    selectedCategory,
    today,
    investmentJudgment,
    investmentEmotionTags,
    investmentEmotionNote,
    investmentPrinciple,
  ]);

  const todayMarkdown = useMemo(
    () => createDailyMarkdown(todayRecords, today),
    [todayRecords, today],
  );
  const weeklyReviewMarkdown = useMemo(
    () => createWeeklyReviewMarkdown(thisWeekRecords, today),
    [thisWeekRecords, today],
  );

  function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!appPassword) {
      setPasswordError("비밀번호 설정이 필요합니다.");
      return;
    }

    if (passwordInput === appPassword) {
      window.sessionStorage.setItem(AUTH_STORAGE_KEY, "true");
      setAuthStatus("unlocked");
      setPasswordInput("");
      setPasswordError("");
      return;
    }

    setPasswordError("비밀번호가 맞지 않습니다.");
  }

  function handleLock() {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthStatus("locked");
    setPasswordInput("");
    setPasswordError("");
    setRecords([]);
    setEditingRecordId(null);
    setContent("");
    setInvestmentJudgment("");
    setInvestmentEmotionTags([]);
    setInvestmentEmotionNote("");
    setInvestmentPrinciple("");
    resetWorkoutState();
  }

  async function handleSave() {
    let saveContent: string;

    if (selectedCategory === "투자") {
      if (!investmentHasContent) return;

      const data: InvestmentData = {
        type: "investment",
        judgment: investmentJudgment.trim(),
        emotion: {
          tags: investmentEmotionTags,
          note: investmentEmotionNote.trim(),
        },
        principle: investmentPrinciple.trim(),
      };

      saveContent = JSON.stringify(data);
    } else if (selectedCategory === "운동") {
      if (!workoutHasContent) return;

      saveContent = content.trim();
    } else {
      saveContent = content.trim();
      if (!saveContent) return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setCopyMessage("");

    const { data: savedRow, error } = isEditing
      ? await supabase
          .from("records")
          .update({
            category: selectedCategory,
            content: saveContent,
          })
          .eq("id", editingRecordId)
          .select("id, category, content, created_at")
          .single()
      : await supabase.from("records").insert({
          category: selectedCategory,
          content: saveContent,
        }).select("id, category, content, created_at")
          .single();

    if (error || !savedRow) {
      if (error) {
        logSupabaseError(isEditing ? "update record" : "insert record", error);
      } else {
        console.error("[Life Ledger] Supabase saved no record row", {
          category: selectedCategory,
          hasContent: saveContent.length > 0,
        });
      }

      if (isEditing) {
        setErrorMessage(
          "수정에 실패했습니다. 기록은 삭제하지 않았고, 개발자 콘솔에 상세 원인을 남겼습니다.",
        );
      } else {
        backupRecord({
          category: selectedCategory,
          content: saveContent,
        });
        refreshBackupEntries();
        setErrorMessage(
          "저장에 실패했습니다. 이 브라우저의 저장 실패 백업함에 기록을 보관했습니다.",
        );
      }
      setIsSaving(false);
      return;
    }

    setContent("");
    setInvestmentJudgment("");
    setInvestmentEmotionTags([]);
    setInvestmentEmotionNote("");
    setInvestmentPrinciple("");
    resetWorkoutState();
    setEditingRecordId(null);
    setIsSaving(false);
    setCopyMessage(isEditing ? "기록이 수정되었습니다." : "저장되었습니다.");

    if (!isEditing && selectedCategory === "투자" && investmentPrinciple.trim()) {
      const principleContent = JSON.stringify({
        type: "principle",
        text: investmentPrinciple.trim(),
        archived: false,
        date: today,
      });

      const { data: principleData } = await supabase
        .from("records")
        .insert({ category: "원칙", content: principleContent })
        .select("id, category, content, created_at")
        .single();

      if (principleData) {
        setPrinciples((prev) => [
          parsePrincipleRow(principleData as RecordRow),
          ...prev,
        ]);
      }
    }

    await fetchRecords();
  }

  function addWorkoutSet() {
    setWorkoutSets((prev) => {
      const last = prev[prev.length - 1];

      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          bodyPart: last?.bodyPart ?? "",
          exercise: last?.exercise ?? "",
          weight: "",
          reps: "",
          duration: "",
          intensity: "",
        },
      ];
    });
  }

  function removeWorkoutSet(id: string) {
    setWorkoutSets((prev) => prev.filter((s) => s.id !== id));
  }

  function updateWorkoutSet(
    id: string,
    field: keyof Omit<WorkoutSetInput, "id">,
    value: string,
  ) {
    setWorkoutSets((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    );
  }

  function resetWorkoutState() {
    setWorkoutSets([
      {
        id: crypto.randomUUID(),
        bodyPart: "",
        exercise: "",
        weight: "",
        reps: "",
        duration: "",
        intensity: "",
      },
    ]);
    setWorkoutMemo("");
    setWorkoutBodyFlags([]);
    setWorkoutFreeText("");
  }

  function handleEdit(record: LedgerRecord) {
    setEditingRecordId(record.id);
    setSelectedCategory(record.category);

    if (record.category === "투자") {
      const data = parseInvestmentContent(record.content);

      setContent("");
      setInvestmentJudgment(data ? data.judgment : record.content);
      setInvestmentEmotionTags(data ? data.emotion.tags : []);
      setInvestmentEmotionNote(data ? data.emotion.note : "");
      setInvestmentPrinciple(data ? data.principle : "");
      resetWorkoutState();
    } else if (record.category === "운동") {
      setContent(getWorkoutPlainText(record.content));
      setInvestmentJudgment("");
      setInvestmentEmotionTags([]);
      setInvestmentEmotionNote("");
      setInvestmentPrinciple("");
      resetWorkoutState();
    } else {
      setContent(record.content);
      setInvestmentJudgment("");
      setInvestmentEmotionTags([]);
      setInvestmentEmotionNote("");
      setInvestmentPrinciple("");
      resetWorkoutState();
    }

    setCopyMessage("수정 모드입니다.");
    setErrorMessage("");
  }

  function handleCancelEdit() {
    setEditingRecordId(null);
    setContent("");
    setInvestmentJudgment("");
    setInvestmentEmotionTags([]);
    setInvestmentEmotionNote("");
    setInvestmentPrinciple("");
    resetWorkoutState();
    setCopyMessage("수정을 취소했습니다.");
    setErrorMessage("");
  }

  async function handleDelete(recordId: string) {
    setDeletingRecordId(recordId);
    setErrorMessage("");
    setCopyMessage("");

    const { error } = await supabase.from("records").delete().eq("id", recordId);

    if (error) {
      setErrorMessage(`삭제에 실패했습니다: ${error.message}`);
      setDeletingRecordId(null);
      return;
    }

    if (editingRecordId === recordId) {
      setEditingRecordId(null);
      setContent("");
    }

    setCopyMessage("삭제되었습니다.");
    setDeletingRecordId(null);
    await fetchRecords();
  }

  async function handleCopy(markdown: string) {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopyMessage("Markdown이 복사되었습니다.");
    } catch {
      setCopyMessage("브라우저에서 클립보드 복사를 허용하지 않았습니다.");
    }
  }

  async function handleCopyWeeklyReview() {
    if (thisWeekRecords.length === 0) {
      setCopyMessage("");
      setErrorMessage("이번 주 기록이 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(weeklyReviewMarkdown);
      setCopyMessage("이번 주 회고 Markdown이 복사되었습니다.");
      setErrorMessage("");
    } catch {
      setCopyMessage("");
      setErrorMessage("브라우저에서 클립보드 복사를 허용하지 않았습니다.");
    }
  }

  async function handleSaveWeeklyReview() {
    if (
      !weeklyReviewQ1.trim() &&
      !weeklyReviewQ2.trim() &&
      !weeklyReviewQ3.trim()
    )
      return;

    setIsSavingReview(true);
    setErrorMessage("");
    setCopyMessage("");

    const data: WeeklyReviewData = {
      type: "weekly_review",
      weekId: currentWeekId,
      weekStart: currentWeekMonday,
      weekEnd: currentWeekSunday,
      q1: weeklyReviewQ1.trim(),
      q2: weeklyReviewQ2.trim(),
      q3: weeklyReviewQ3.trim(),
    };

    const existing = weeklyReviews.find((r) => r.weekId === currentWeekId);

    const { error } = existing
      ? await supabase
          .from("records")
          .update({ content: JSON.stringify(data) })
          .eq("id", existing.id)
      : await supabase
          .from("records")
          .insert({ category: "주간회고", content: JSON.stringify(data) });

    setIsSavingReview(false);

    if (error) {
      backupRecord({ category: "주간회고", content: JSON.stringify(data) });
      refreshBackupEntries();
      setErrorMessage(
        `주간 회고 저장에 실패했습니다: ${error.message}. 이 브라우저에 백업을 남겼습니다.`,
      );
      return;
    }

    setCopyMessage("주간 회고가 저장되었습니다.");
    await fetchRecords();
  }

  function handleDownloadWeeklyReviewMd(review: {
    weekId: string;
    weekStart: string;
    weekEnd: string;
    q1: string;
    q2: string;
    q3: string;
  }) {
    const summary = computeWeeklySummary(
      records,
      principles,
      review.weekStart,
      review.weekEnd,
    );
    const markdown = formatWeeklyReviewFullMarkdown(
      review.weekId,
      review.weekStart,
      review.weekEnd,
      summary,
      review.q1,
      review.q2,
      review.q3,
    );
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = `${review.weekId} 주간회고.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    setCopyMessage(`${review.weekId} 주간회고.md 다운로드되었습니다.`);
    setErrorMessage("");
  }

  async function handleSaveInbody() {
    if (!inbodyWeight.trim() && !inbodyMuscle.trim() && !inbodyFat.trim()) return;

    setIsSavingInbody(true);
    setErrorMessage("");
    setCopyMessage("");

    const content = JSON.stringify({
      type: "inbody",
      date: inbodyDate || today,
      weight: inbodyWeight.trim(),
      muscleMass: inbodyMuscle.trim(),
      fatPercentage: inbodyFat.trim(),
    });

    const { data: newRow, error } = await supabase
      .from("records")
      .insert({ category: "인바디", content })
      .select("id, category, content, created_at")
      .single();

    setIsSavingInbody(false);

    if (error) {
      backupRecord({ category: "인바디", content });
      refreshBackupEntries();
      setErrorMessage(
        `인바디 저장에 실패했습니다: ${error.message}. 이 브라우저에 백업을 남겼습니다.`,
      );
      return;
    }

    if (newRow) {
      setInbodyRecords((prev) => [
        parseInbodyRow(newRow as RecordRow),
        ...prev,
      ]);
    }

    setInbodyWeight("");
    setInbodyMuscle("");
    setInbodyFat("");
    setInbodyDate(getToday());
    setCopyMessage("인바디 기록이 저장되었습니다.");
  }

  async function handleDeleteInbody(id: string) {
    const { error } = await supabase.from("records").delete().eq("id", id);

    if (!error) {
      setInbodyRecords((prev) => prev.filter((r) => r.id !== id));
    }
  }

  async function handleRetryBackup(entry: BackupEntry) {
    if (retryingBackupId) return;

    setRetryingBackupId(entry.id);
    setErrorMessage("");
    setCopyMessage("");

    const { data: existingRows, error: existingError } = await supabase
      .from("records")
      .select("id, category, content, created_at")
      .eq("category", entry.category)
      .eq("content", entry.content)
      .limit(1);

    if (existingError) {
      logSupabaseError("check existing backup record", existingError);
      setRetryingBackupId(null);
      setErrorMessage(
        "다시 저장 전 중복 여부를 확인하지 못했습니다. 백업은 그대로 유지했습니다.",
      );
      return;
    }

    if ((existingRows ?? []).length > 0) {
      setRetryingBackupId(null);
      setBackupEntries(removeBackupEntry(entry.id));
      setCopyMessage("이미 저장된 백업이라 백업함에서만 정리했습니다.");
      await fetchRecords();
      return;
    }

    const { data: savedRow, error } = await supabase
      .from("records")
      .insert({ category: entry.category, content: entry.content })
      .select("id, category, content, created_at")
      .single();

    setRetryingBackupId(null);

    if (error || !savedRow) {
      if (error) {
        logSupabaseError("retry backup insert", error);
      } else {
        console.error("[Life Ledger] Supabase retry saved no record row", {
          backupId: entry.id,
          category: entry.category,
        });
      }
      setErrorMessage(
        "다시 저장에 실패했습니다. 백업은 그대로 유지했고, 개발자 콘솔에 상세 원인을 남겼습니다.",
      );
      return;
    }

    setBackupEntries(removeBackupEntry(entry.id));
    setCopyMessage("백업을 다시 저장했습니다.");
    await fetchRecords();
  }

  function handleDeleteBackup(id: string) {
    const ok = window.confirm(
      "이 백업 기록은 아직 Supabase 저장이 확인되지 않았습니다. 정말 삭제할까요?",
    );

    if (!ok) return;

    setDeletingBackupId(id);
    setBackupEntries(removeBackupEntry(id));
    setDeletingBackupId(null);
    setCopyMessage("백업을 삭제했습니다.");
    setErrorMessage("");
  }

  function handleDownloadMarkdown(markdown: string, date: string) {
    const blob = new Blob([markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = `${date}-life-ledger.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    setCopyMessage("Markdown 파일이 다운로드되었습니다.");
    setErrorMessage("");
  }

  if (authStatus === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-8 text-zinc-950">
        <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-3xl font-bold tracking-normal">Life Ledger</h1>
          <p className="mt-3 text-sm text-zinc-500">잠금 상태를 확인하는 중...</p>
        </div>
      </main>
    );
  }

  if (authStatus === "locked") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-8 text-zinc-950">
        <section className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-normal">Life Ledger</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              {appPassword
                ? "비밀번호를 입력하세요."
                : "비밀번호 설정이 필요합니다."}
            </p>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleUnlock}>
            <label className="block">
              <span className="text-sm font-semibold text-zinc-800">
                비밀번호
              </span>
              <input
                type="password"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                disabled={!appPassword}
                placeholder="비밀번호"
                className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10 disabled:bg-zinc-100"
              />
            </label>

            {passwordError ? (
              <p className="text-sm font-medium text-red-700">
                {passwordError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!appPassword || !passwordInput}
              className="w-full touch-manipulation rounded-lg bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              들어가기
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-6 text-zinc-950 sm:px-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="flex gap-1 rounded-xl bg-zinc-100 p-1">
          <button
            type="button"
            onClick={() => setView("main")}
            className={`flex-1 rounded-lg px-2 py-2.5 text-xs font-semibold transition ${
              view === "main"
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            기록
          </button>
          <button
            type="button"
            onClick={() => setView("fitness")}
            className={`flex-1 rounded-lg px-2 py-2.5 text-xs font-semibold transition ${
              view === "fitness"
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            인바디
          </button>
        </div>

        {backupEntries.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
            ⚠ 저장 실패 백업 {backupEntries.length}건이 있습니다. 기록 탭 하단에서 확인하세요.
          </div>
        ) : null}

        {view === "main" ? (
          <>
            <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-zinc-800">
                  오늘 요약
                </p>
                <p className="text-xs font-semibold text-zinc-500">
                  🔥 연속 {recordStreak}일
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {visibleInputCategories.map((category) => {
                  const recorded = todayCategorySet.has(category);

                  return (
                    <span
                      key={category}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        recorded
                          ? "border-zinc-950 bg-zinc-950 text-white"
                          : "border-zinc-200 bg-zinc-50 text-zinc-400"
                      }`}
                    >
                      <span>{recorded ? "●" : "○"}</span>
                      {category}
                    </span>
                  );
                })}
              </div>

              <p className="mt-3 text-xs text-zinc-500">
                이번 주 운동 기록 {weeklySummary.workoutCount}회 / 7일
              </p>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-normal text-zinc-950 sm:text-4xl">
                Life Ledger
              </h1>
              <p className="text-sm leading-6 text-zinc-600 sm:text-base">
                오늘의 기록을 빠르게 남기고, Markdown으로 정리하세요.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLock}
              className="shrink-0 touch-manipulation rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
            >
              잠금
            </button>
          </div>

          <div className="mt-6 space-y-3">
            <p className="text-sm font-semibold text-zinc-800">카테고리</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {visibleInputCategories.map((category) => {
                const isSelected = selectedCategory === category;

                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    className={`touch-manipulation rounded-lg border px-4 py-3 text-sm font-semibold transition ${
                      isSelected
                        ? "border-zinc-950 bg-zinc-950 text-white shadow-sm"
                        : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300 hover:bg-white"
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="text-xs font-medium text-zinc-500">선택한 카테고리</p>
            <p className="mt-1 text-base font-semibold text-zinc-950">
              {selectedCategory}
            </p>
          </div>

          {selectedCategory === "투자" ? (
            <div className="mt-5 space-y-4">
              {isEditing ? (
                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  수정 모드
                </span>
              ) : null}

              <label className="block">
                <span className="text-sm font-semibold text-zinc-800">판단</span>
                <p className="mt-1 text-xs text-zinc-500">
                  오늘 시장/종목에 대해 어떻게 봤는가
                </p>
                <textarea
                  value={investmentJudgment}
                  onChange={(event) =>
                    setInvestmentJudgment(event.target.value)
                  }
                  placeholder="오늘의 시장 판단을 자유롭게 적어보세요."
                  className="mt-2 min-h-24 w-full resize-none rounded-lg border border-zinc-200 bg-white px-4 py-3 text-base leading-7 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10"
                />
              </label>

              <div>
                <p className="text-sm font-semibold text-zinc-800">감정</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {INVESTMENT_EMOTION_CHIPS.map((chip) => {
                    const isChipSelected = investmentEmotionTags.includes(chip);

                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() =>
                          setInvestmentEmotionTags((prev) =>
                            isChipSelected
                              ? prev.filter((t) => t !== chip)
                              : [...prev, chip],
                          )
                        }
                        className={`touch-manipulation rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                          isChipSelected
                            ? "border-zinc-950 bg-zinc-950 text-white"
                            : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300 hover:bg-white"
                        }`}
                      >
                        {chip}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={investmentEmotionNote}
                  onChange={(event) =>
                    setInvestmentEmotionNote(event.target.value)
                  }
                  placeholder="추가 감정 메모 (선택)"
                  className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10"
                />
              </div>

              <label className="block">
                <span className="text-sm font-semibold text-zinc-800">
                  다음 원칙
                </span>
                <p className="mt-1 text-xs text-zinc-500">
                  오늘 경험에서 뽑은 매매 원칙 — 없으면 비워두세요
                </p>
                <textarea
                  value={investmentPrinciple}
                  onChange={(event) =>
                    setInvestmentPrinciple(event.target.value)
                  }
                  placeholder="오늘 배운 원칙이 있다면 적어보세요."
                  className="mt-2 min-h-24 w-full resize-none rounded-lg border border-zinc-200 bg-white px-4 py-3 text-base leading-7 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10"
                />
              </label>
            </div>
          ) : selectedCategory === "운동" ? (
            <div className="mt-5 space-y-4">
              {isEditing ? (
                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  수정 모드
                </span>
              ) : null}

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="text-sm font-semibold text-zinc-800">
                  기록 내용 안내
                </p>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6 text-zinc-600">
                  {WORKOUT_EXAMPLE_TEXT}
                </pre>
              </div>

              <label className="block">
                <span className="text-sm font-semibold text-zinc-800">
                  자유 입력
                </span>
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder={WORKOUT_JOURNAL_PLACEHOLDER}
                  className="mt-2 min-h-64 w-full resize-y rounded-lg border border-zinc-200 bg-white px-4 py-3 text-base leading-7 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10"
                />
              </label>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="flex items-center justify-between gap-2 text-sm font-semibold text-zinc-800">
                  기록 내용
                  {isEditing ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      수정 모드
                    </span>
                  ) : null}
                </span>
                <p className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-600">
                  형식은 자유롭게 적어도 됩니다. 나중에 검색과 태그로 정리할 수 있어요.
                  <br />
                  {categoryHints[selectedCategory]}
                </p>
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="오늘 남기고 싶은 기록을 입력하세요."
                  className="mt-2 min-h-40 w-full resize-none rounded-lg border border-zinc-200 bg-white px-4 py-3 text-base leading-7 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10"
                />
              </label>
            </div>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="touch-manipulation rounded-lg bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isSaving
                ? isEditing
                  ? "수정 중..."
                  : "저장 중..."
                : isEditing
                  ? "수정 완료"
                  : "저장"}
            </button>
            <button
              type="button"
              onClick={() => handleCopy(draftMarkdown)}
              disabled={
                selectedCategory === "투자"
                  ? !investmentHasContent
                  : selectedCategory === "운동"
                    ? !workoutHasContent
                    : !content.trim()
              }
              className="touch-manipulation rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:border-zinc-950 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-300"
            >
              Markdown 복사
            </button>
          </div>

          {isEditing ? (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="mt-2 w-full touch-manipulation rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:border-zinc-950"
            >
              수정 취소
            </button>
          ) : null}

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleCopy(todayMarkdown)}
              disabled={todayRecords.length === 0}
              className="touch-manipulation rounded-lg border border-zinc-300 bg-zinc-50 px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:border-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-300"
            >
              오늘 기록 전체 Markdown 복사
            </button>
            <button
              type="button"
              onClick={() => handleDownloadMarkdown(todayMarkdown, today)}
              disabled={todayRecords.length === 0}
              className="touch-manipulation rounded-lg border border-zinc-300 bg-zinc-50 px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:border-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-300"
            >
              오늘 기록 .md 다운로드
            </button>
          </div>

          {errorMessage ? (
            <p className="mt-3 text-sm font-medium text-red-700">
              {errorMessage}
            </p>
          ) : null}

          {copyMessage ? (
            <p className="mt-3 text-sm font-medium text-emerald-700">
              {copyMessage}
            </p>
          ) : null}
        </section>

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-zinc-950">저장된 기록</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Supabase DB 기준으로 모든 기기에서 같은 기록을 봅니다.
              </p>
            </div>
            <span className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-700">
              {recordLoadError ? "불러오기 실패" : `${filteredRecords.length}개`}
            </span>
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-zinc-800">검색</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="기록 내용 검색"
              className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10"
            />
          </label>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {periodFilters.map((period) => {
              const isSelected = selectedPeriod === period;

              return (
                <button
                  key={period}
                  type="button"
                  onClick={() => setSelectedPeriod(period)}
                  className={`touch-manipulation rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
                    isSelected
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                  }`}
                >
                  {period}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {filterCategories.map((category) => {
              const isSelected = selectedFilter === category;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedFilter(category)}
                  className={`touch-manipulation rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
                    isSelected
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>

          {isLoading ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
              불러오는 중...
            </div>
          ) : recordLoadError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-center">
              <p className="text-sm font-semibold text-red-800">
                기록을 불러오지 못했습니다.
              </p>
              <p className="mt-1 text-xs text-red-700">
                기존 기록을 0개로 처리하지 않았습니다. 연결을 확인한 뒤 다시 시도하세요.
              </p>
              <button
                type="button"
                onClick={() => void fetchRecords()}
                className="mt-3 touch-manipulation rounded-lg border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-700 transition hover:border-red-700"
              >
                다시 불러오기
              </button>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
              아직 저장된 기록이 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              {groupedRecords.map((group) => (
                <section
                  key={group.date}
                  className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-zinc-950">
                      {group.date}
                    </h3>
                    <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            createDailyMarkdown(group.records, group.date),
                          )
                        }
                        className="touch-manipulation rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                      >
                        이 날짜 Markdown 복사
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadMarkdown(
                            createDailyMarkdown(group.records, group.date),
                            group.date,
                          )
                        }
                        className="touch-manipulation rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                      >
                        이 날짜 .md 다운로드
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-3">
                    {group.records.map((record) => {
                      const recommendedTags = getRecommendedTags(record.content);

                      return (
                        <article
                          key={record.id}
                          className="rounded-lg border border-zinc-200 bg-stone-50 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <time
                                className="text-sm font-semibold text-zinc-900"
                                dateTime={record.createdAt}
                              >
                                {record.date}
                              </time>
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-700">
                                {record.category}
                              </span>
                            </div>
                            <div className="grid w-full grid-cols-3 gap-2 sm:w-auto">
                              <button
                                type="button"
                                onClick={() => handleCopy(createMarkdown(record))}
                                className="touch-manipulation rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                              >
                                Markdown 복사
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEdit(record)}
                                className="touch-manipulation rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(record.id)}
                                disabled={deletingRecordId === record.id}
                                className="touch-manipulation rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:border-red-700 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-300"
                              >
                                {deletingRecordId === record.id
                                  ? "삭제 중..."
                                  : "삭제"}
                              </button>
                            </div>
                          </div>

                          {recommendedTags.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {recommendedTags.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-600"
                                >
                                  [[{tag}]]
                                </span>
                              ))}
                            </div>
                          ) : null}

                          {record.category === "운동" ? (
                            (() => {
                              const data = parseWorkoutContent(record.content);

                              if (!data) {
                                return (
                                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                                    {record.content}
                                  </p>
                                );
                              }

                              const groups = getWorkoutDisplayGroups(data);

                              return (
                                <div className="mt-3 space-y-3 text-sm text-zinc-700">
                                  {groups.length > 0 && (
                                    <div className="space-y-2">
                                      {groups.map((g, i) => (
                                        <div key={i}>
                                          <p className="text-xs font-semibold text-zinc-500">
                                            {g.label}
                                          </p>
                                          {g.items.length > 0 &&
                                            (g.isSetList ? (
                                              <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                                                {g.items.map((item, j) => (
                                                  <li
                                                    key={j}
                                                    className="text-xs text-zinc-600"
                                                  >
                                                    {item}
                                                  </li>
                                                ))}
                                              </ul>
                                            ) : (
                                              <p className="mt-0.5 whitespace-pre-wrap text-zinc-600">
                                                {g.items.join("\n")}
                                              </p>
                                            ))}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {data.bodyFlags.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {data.bodyFlags.map((f) => (
                                        <span
                                          key={f}
                                          className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600"
                                        >
                                          #{f.replace(/[\s/]+/g, "")}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {data.mode !== "free" && data.memo && (
                                    <p className="whitespace-pre-wrap text-zinc-600">
                                      {data.memo}
                                    </p>
                                  )}
                                </div>
                              );
                            })()
                          ) : record.category === "투자" ? (
                            (() => {
                              const data = parseInvestmentContent(
                                record.content,
                              );

                              if (!data) {
                                return (
                                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                                    {record.content}
                                  </p>
                                );
                              }

                              return (
                                <div className="mt-3 space-y-2 text-sm leading-6 text-zinc-700">
                                  {data.judgment && (
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                                        판단
                                      </p>
                                      <p className="whitespace-pre-wrap">
                                        {data.judgment}
                                      </p>
                                    </div>
                                  )}
                                  {(data.emotion.tags.length > 0 ||
                                    data.emotion.note) && (
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                                        감정
                                      </p>
                                      {data.emotion.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                          {data.emotion.tags.map((tag) => (
                                            <span
                                              key={tag}
                                              className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700"
                                            >
                                              #{tag}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                      {data.emotion.note && (
                                        <p className="whitespace-pre-wrap">
                                          {data.emotion.note}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {data.principle && (
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                                        다음 원칙
                                      </p>
                                      <p className="whitespace-pre-wrap">
                                        {data.principle}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                              {record.content}
                            </p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        {backupEntries.length > 0 ? (
          <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-amber-900">
                저장 실패 백업함
              </h2>
              <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                {backupEntries.length}건
              </span>
            </div>
            <p className="text-xs text-amber-700">
              네트워크 문제로 저장되지 못한 기록입니다. 다시 저장하거나 삭제하세요.
            </p>
            <div className="space-y-2">
              {backupEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-amber-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      {entry.category}
                    </span>
                    <time className="text-xs text-zinc-400">
                      {formatDate(entry.created_at)}
                    </time>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-zinc-700">
                    {getBackupPreviewText(entry)}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleRetryBackup(entry)}
                      disabled={retryingBackupId !== null}
                      className="touch-manipulation rounded-lg border border-zinc-950 bg-zinc-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300"
                    >
                      {retryingBackupId === entry.id
                        ? "저장 중..."
                        : "다시 저장"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBackup(entry.id)}
                      disabled={
                        retryingBackupId !== null || deletingBackupId === entry.id
                      }
                      className="touch-manipulation rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:border-red-700 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-300"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
          </>
        ) : view === "weekly" ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-zinc-950">주간 회고</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {currentWeekId} · {currentWeekMonday} ~ {currentWeekSunday}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWeeklyReviewListMode((prev) => !prev);
                  setSelectedWeeklyReview(null);
                }}
                className="shrink-0 touch-manipulation rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
              >
                {weeklyReviewListMode ? "이번 주 작성" : "지난 회고"}
              </button>
            </div>

            {!weeklyReviewListMode ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 space-y-4">
                  <p className="text-sm font-bold text-zinc-800">이번 주 자동 요약</p>

                  <div>
                    <p className="text-xs text-zinc-500 mb-2">
                      기록한 날: {weeklySummary.daysRecorded}/7일
                    </p>
                    <div className="flex gap-2">
                      {weeklySummary.dayDots.map(({ date, categories }, i) => {
                        const dayLabels = ["월", "화", "수", "목", "금", "토", "일"];
                        const hasRecord = categories.length > 0;

                        return (
                          <div key={date} className="flex flex-col items-center gap-1">
                            <span className="text-xs text-zinc-400">{dayLabels[i]}</span>
                            <div
                              className={`h-3 w-3 rounded-full ${hasRecord ? "bg-zinc-950" : "bg-zinc-200"}`}
                            />
                            <div className="flex flex-col gap-0.5">
                              {inputCategories.map((cat) => (
                                <div
                                  key={cat}
                                  title={cat}
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    categories.includes(cat)
                                      ? "bg-zinc-500"
                                      : "bg-transparent"
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {weeklySummary.workoutCount > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-zinc-600">
                        운동 {weeklySummary.workoutCount}회
                      </p>
                      {Object.keys(weeklySummary.bodyPartSets).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(weeklySummary.bodyPartSets).map(
                            ([part, count]) => (
                              <span
                                key={part}
                                className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-600"
                              >
                                {part} {count}세트
                              </span>
                            ),
                          )}
                        </div>
                      )}
                      {Object.keys(weeklySummary.bodyFlagFreq).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(weeklySummary.bodyFlagFreq).map(
                            ([flag, count]) => (
                              <span
                                key={flag}
                                className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700"
                              >
                                {flag} {count}회
                              </span>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {weeklySummary.investmentCount > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-zinc-600">
                        투자 {weeklySummary.investmentCount}회
                      </p>
                      {Object.keys(weeklySummary.emotionTagDist).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(weeklySummary.emotionTagDist)
                            .sort((a, b) => b[1] - a[1])
                            .map(([tag, count]) => (
                              <span
                                key={tag}
                                className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-600"
                              >
                                #{tag} {count}
                              </span>
                            ))}
                        </div>
                      )}
                      {weeklySummary.newPrinciples.length > 0 && (
                        <div>
                          <p className="text-xs text-zinc-400 mb-0.5">
                            이번 주 추가된 원칙
                          </p>
                          {weeklySummary.newPrinciples.map((p, i) => (
                            <p key={i} className="text-xs leading-5 text-zinc-600">
                              · {p}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {weeklySummary.topKeywords.length > 0 && (
                    <div>
                      <p className="text-xs text-zinc-400 mb-1">
                        이번 주 감정 키워드
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {weeklySummary.topKeywords.map((kw) => (
                          <span
                            key={kw}
                            className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-700"
                          >
                            #{kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <WeeklyReviewForm
                  key={`${currentWeekId}-${weeklyReviewsLoaded ? "ready" : "loading"}`}
                  initialQ1={existingWeeklyReview?.q1 ?? ""}
                  initialQ2={existingWeeklyReview?.q2 ?? ""}
                  initialQ3={existingWeeklyReview?.q3 ?? ""}
                  onChangeQ1={setWeeklyReviewQ1}
                  onChangeQ2={setWeeklyReviewQ2}
                  onChangeQ3={setWeeklyReviewQ3}
                />

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleSaveWeeklyReview}
                    disabled={
                      isSavingReview ||
                      (!weeklyReviewQ1.trim() &&
                        !weeklyReviewQ2.trim() &&
                        !weeklyReviewQ3.trim())
                    }
                    className="touch-manipulation rounded-lg bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                  >
                    {isSavingReview
                      ? "저장 중..."
                      : weeklyReviewExists
                        ? "회고 수정"
                        : "회고 저장"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadWeeklyReviewMd({
                        weekId: currentWeekId,
                        weekStart: currentWeekMonday,
                        weekEnd: currentWeekSunday,
                        q1: weeklyReviewQ1,
                        q2: weeklyReviewQ2,
                        q3: weeklyReviewQ3,
                      })
                    }
                    className="touch-manipulation rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:border-zinc-950"
                  >
                    .md 다운로드
                  </button>
                </div>

                {copyMessage ? (
                  <p className="text-sm font-medium text-emerald-700">
                    {copyMessage}
                  </p>
                ) : null}
                {errorMessage ? (
                  <p className="text-sm font-medium text-red-700">
                    {errorMessage}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                {weeklyReviews.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
                    아직 저장된 회고가 없습니다.
                  </div>
                ) : (
                  [...weeklyReviews]
                    .sort((a, b) => b.weekId.localeCompare(a.weekId))
                    .map((review) =>
                      selectedWeeklyReview?.id === review.id ? (
                        <div
                          key={review.id}
                          className="rounded-lg border border-zinc-200 bg-white p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-bold text-zinc-950">
                                {review.weekId}
                              </p>
                              <p className="text-xs text-zinc-400">
                                {review.weekStart} ~ {review.weekEnd}
                              </p>
                            </div>
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  handleDownloadWeeklyReviewMd(review)
                                }
                                className="touch-manipulation rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 transition hover:border-zinc-950"
                              >
                                .md
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedWeeklyReview(null)}
                                className="touch-manipulation rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 transition hover:border-zinc-950"
                              >
                                닫기
                              </button>
                            </div>
                          </div>
                          {review.q1 && (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                                가장 잘한 결정
                              </p>
                              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-6 text-zinc-800">
                                {review.q1}
                              </p>
                            </div>
                          )}
                          {review.q2 && (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                                반복하고 싶지 않은 것
                              </p>
                              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-6 text-zinc-800">
                                {review.q2}
                              </p>
                            </div>
                          )}
                          {review.q3 && (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                                다음 주 변화
                              </p>
                              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-6 text-zinc-800">
                                {review.q3}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          key={review.id}
                          type="button"
                          onClick={() => setSelectedWeeklyReview(review)}
                          className="w-full rounded-lg border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-400"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-zinc-950">
                                {review.weekId}
                              </p>
                              <p className="text-xs text-zinc-400">
                                {review.weekStart} ~ {review.weekEnd}
                              </p>
                            </div>
                            <span className="text-xs text-zinc-400">→</span>
                          </div>
                          {review.q1 && (
                            <p className="mt-1.5 truncate text-xs text-zinc-500">
                              잘한 결정:{" "}
                              {review.q1.length > 50
                                ? review.q1.slice(0, 50) + "..."
                                : review.q1}
                            </p>
                          )}
                        </button>
                      ),
                    )
                )}

                {copyMessage ? (
                  <p className="text-sm font-medium text-emerald-700">
                    {copyMessage}
                  </p>
                ) : null}
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-5">
            <h2 className="text-lg font-bold text-zinc-950">운동 현황</h2>

            {/* 1. 주간 부위별 세트 수 */}
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-zinc-800">
                주간 부위별 세트 수 (최근 4주)
              </p>
              {weeklyBodyPartData.every(
                (d) => Object.keys(d).length === 1,
              ) ? (
                <p className="mt-4 text-center text-xs text-zinc-400">
                  운동 기록이 없습니다
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={weeklyBodyPartData}
                    margin={{ top: 8, right: 4, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend
                      iconSize={10}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                    {(
                      Object.keys(WORKOUT_BODY_PARTS) as unknown as typeof WORKOUT_BODY_PARTS
                    ) &&
                      [...WORKOUT_BODY_PARTS].map((part) => (
                        <Bar
                          key={part}
                          dataKey={part}
                          stackId="a"
                          fill={BODY_PART_COLORS[part] ?? "#a1a1aa"}
                        />
                      ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* 2. 운동별 최고 중량 추이 */}
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-zinc-800">
                운동별 최고 중량 추이
              </p>
              {fitnessExerciseNames.length === 0 ? (
                <p className="mt-4 text-center text-xs text-zinc-400">
                  중량 기록이 없습니다
                </p>
              ) : (
                <>
                  <select
                    value={selectedFitnessExercise}
                    onChange={(e) =>
                      setSelectedFitnessExercise(e.target.value)
                    }
                    className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-950 outline-none focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10"
                  >
                    <option value="">운동 선택</option>
                    {fitnessExerciseNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  {selectedFitnessExercise && (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart
                        data={exerciseWeightData}
                        margin={{ top: 12, right: 4, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#f4f4f5"
                        />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          unit="kg"
                          domain={["auto", "auto"]}
                        />
                        <Tooltip
                          formatter={(v) => [`${v}kg`, "최고 중량"]}
                        />
                        <Line
                          type="monotone"
                          dataKey="중량"
                          stroke="#18181b"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </>
              )}
            </div>

            {/* 4. 인바디 */}
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-zinc-800">
                인바디 기록
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="col-span-2 block">
                  <span className="text-xs font-semibold text-zinc-500">
                    측정일
                  </span>
                  <input
                    type="date"
                    value={inbodyDate}
                    onChange={(e) => setInbodyDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-950 outline-none focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-zinc-500">
                    체중 (kg)
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    value={inbodyWeight}
                    onChange={(e) => setInbodyWeight(e.target.value)}
                    placeholder="72.5"
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-950 outline-none focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-zinc-500">
                    골격근량 (kg)
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    value={inbodyMuscle}
                    onChange={(e) => setInbodyMuscle(e.target.value)}
                    placeholder="40.2"
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-950 outline-none focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10"
                  />
                </label>
                <label className="col-span-2 block">
                  <span className="text-xs font-semibold text-zinc-500">
                    체지방률 (%)
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    value={inbodyFat}
                    onChange={(e) => setInbodyFat(e.target.value)}
                    placeholder="18.3"
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-950 outline-none focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/10"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={handleSaveInbody}
                disabled={
                  isSavingInbody ||
                  (!inbodyWeight.trim() &&
                    !inbodyMuscle.trim() &&
                    !inbodyFat.trim())
                }
                className="mt-3 w-full touch-manipulation rounded-lg bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isSavingInbody ? "저장 중..." : "저장"}
              </button>

              {copyMessage ? (
                <p className="mt-2 text-sm font-medium text-emerald-700">
                  {copyMessage}
                </p>
              ) : null}

              {inbodyChartData.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-semibold text-zinc-500">
                    골격근량 추이 (목표 42kg)
                  </p>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart
                      data={inbodyChartData}
                      margin={{ top: 12, right: 4, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        unit="kg"
                        domain={["auto", "auto"]}
                      />
                      <Tooltip
                        formatter={(v, name) => [`${v}kg`, name]}
                      />
                      <ReferenceLine
                        y={42}
                        stroke="#dc2626"
                        strokeDasharray="4 3"
                        label={{
                          value: "목표 42kg",
                          position: "insideTopRight",
                          fontSize: 11,
                          fill: "#dc2626",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="골격근량"
                        stroke="#18181b"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>

                  {inbodyRecords.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {[...inbodyRecords]
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((r) => (
                          <div
                            key={r.id}
                            className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-600"
                          >
                            <span className="font-semibold text-zinc-800">
                              {r.date}
                            </span>
                            <span>
                              {r.weight != null && `${r.weight}kg`}
                              {r.muscleMass != null &&
                                ` · 근 ${r.muscleMass}kg`}
                              {r.fatPercentage != null &&
                                ` · 지 ${r.fatPercentage}%`}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteInbody(r.id)}
                              className="ml-2 text-zinc-400 hover:text-red-600"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
