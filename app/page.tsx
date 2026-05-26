"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabase";

const categories = ["일기", "투자", "지출", "운동", "콘텐츠", "가치관"] as const;
const filterCategories = ["전체", ...categories] as const;
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

const BACKUP_STORAGE_KEY = "life-ledger:backup-records";
const AUTH_STORAGE_KEY = "life-ledger:is-authenticated";
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
  지출: "오늘 쓴 돈이나 고정비 변화를 적어보세요.",
  운동: "운동 내용, 몸무게, 컨디션, 통증을 자유롭게 적어보세요.",
  콘텐츠: "쇼츠 아이디어, 대본, 프롬프트, 업로드 기록을 적어보세요.",
  가치관: "요즘 중요하게 생각하는 것, 인생 방향, 관계에서 느낀 점을 적어보세요.",
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
    category: "콘텐츠",
    keywords: ["쇼츠", "영상", "대본", "프롬프트", "곰벌레", "업로드"],
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
} as const satisfies Record<string, Category>;

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

function formatDate(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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

function createMarkdown(
  record: Pick<LedgerRecord, "date" | "category" | "content">,
) {
  return `# ${record.date} 기록

## 카테고리
- ${record.category}

## 내용
${record.content}`;
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
    categories.map((category) => [category, []]),
  );

  for (const record of records) {
    recordsByCategory.get(record.category)?.push(record);
  }

  const categorySections = categories
    .map((category) => {
      const categoryRecords = recordsByCategory.get(category) ?? [];
      const recordLines =
        categoryRecords.length > 0
          ? categoryRecords.map((record) => `- ${record.content}`).join("\n")
          : "- ";

      return `## ${category}\n${recordLines}`;
    })
    .join("\n\n");

  const recommendedTags = records.flatMap((record) =>
    getRecommendedTags(record.content),
  );
  const uniqueRecommendedTags = Array.from(new Set<Category>(recommendedTags));
  const connectionTags = Array.from(
    new Set<Category>([...categories, ...recommendedTags]),
  )
    .map((category) => `- [[${category}]]`)
    .join("\n");
  const recommendedTagLines =
    uniqueRecommendedTags.length > 0
      ? uniqueRecommendedTags.map((category) => `- [[${category}]]`).join("\n")
      : "- ";

  return `# ${date} Life Ledger

${categorySections}

## 연결 태그
${connectionTags}

## 추천 태그
${recommendedTagLines}`;
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
    categories.map((category) => [category, []]),
  );

  for (const record of records) {
    recordsByCategory.get(record.category)?.push(record);
  }

  const categorySections = categories
    .map((category) => {
      const categoryRecords = recordsByCategory.get(category) ?? [];
      const recordLines =
        categoryRecords.length > 0
          ? categoryRecords.map((record) => `- ${record.content}`).join("\n")
          : "- 기록 없음";

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
- [[지출]]
- [[운동]]
- [[콘텐츠]]
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

function backupRecord(record: Pick<LedgerRecord, "category" | "content">) {
  const backupRecord = {
    id: crypto.randomUUID(),
    category: record.category,
    content: record.content,
    created_at: new Date().toISOString(),
  };

  try {
    const existingBackup = window.localStorage.getItem(BACKUP_STORAGE_KEY);
    const parsedBackup = existingBackup
      ? (JSON.parse(existingBackup) as unknown)
      : [];
    const backupRecords = Array.isArray(parsedBackup) ? parsedBackup : [];

    window.localStorage.setItem(
      BACKUP_STORAGE_KEY,
      JSON.stringify([backupRecord, ...backupRecords]),
    );
  } catch {
    window.localStorage.setItem(
      BACKUP_STORAGE_KEY,
      JSON.stringify([backupRecord]),
    );
  }
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("records")
      .select("id, category, content, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMessage(`기록을 불러오지 못했습니다: ${error.message}`);
      setRecords([]);
      setIsLoading(false);
      return;
    }

    setRecords((data ?? []).map((row) => mapRecordRow(row as RecordRow)));
    setIsLoading(false);
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

  const isEditing = editingRecordId !== null;
  const canSave = content.trim().length > 0 && !isSaving;
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

  const draftMarkdown = useMemo(
    () =>
      createMarkdown({
        date: today,
        category: selectedCategory,
        content: content.trim(),
      }),
    [content, selectedCategory, today],
  );

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
  }

  async function handleSave() {
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setCopyMessage("");

    const { error } = isEditing
      ? await supabase
          .from("records")
          .update({
            category: selectedCategory,
            content: trimmedContent,
          })
          .eq("id", editingRecordId)
      : await supabase.from("records").insert({
          category: selectedCategory,
          content: trimmedContent,
        });

    if (error) {
      if (isEditing) {
        setErrorMessage(`수정에 실패했습니다. ${error.message}`);
      } else {
        backupRecord({
          category: selectedCategory,
          content: trimmedContent,
        });
        setErrorMessage(
          `저장에 실패했습니다: ${error.message}. 이 브라우저에 백업을 남겼습니다.`,
        );
      }
      setIsSaving(false);
      return;
    }

    setContent("");
    setEditingRecordId(null);
    setIsSaving(false);
    setCopyMessage(isEditing ? "기록이 수정되었습니다." : "저장되었습니다.");
    await fetchRecords();
  }

  function handleEdit(record: LedgerRecord) {
    setEditingRecordId(record.id);
    setSelectedCategory(record.category);
    setContent(record.content);
    setCopyMessage("수정 모드입니다.");
    setErrorMessage("");
  }

  function handleCancelEdit() {
    setEditingRecordId(null);
    setContent("");
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
              {categories.map((category) => {
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

          <label className="mt-5 block">
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
              disabled={!content.trim()}
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

          <button
            type="button"
            onClick={handleCopyWeeklyReview}
            className="mt-2 w-full touch-manipulation rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:border-zinc-950 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-300"
          >
            이번 주 회고 Markdown 복사
          </button>

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
              {filteredRecords.length}개
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

                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                            {record.content}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
