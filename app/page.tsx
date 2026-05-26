"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabase";

const categories = ["일기", "투자", "지출", "운동", "콘텐츠", "가치관"] as const;
const filterCategories = ["전체", ...categories] as const;

type Category = (typeof categories)[number];
type CategoryFilter = (typeof filterCategories)[number];

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
    keywords: ["운동", "등", "가슴", "어깨", "다리", "체중"],
  },
  {
    category: "콘텐츠",
    keywords: ["쇼츠", "영상", "대본", "프롬프트", "곰벌레"],
  },
  {
    category: "지출",
    keywords: ["돈", "지출", "카드", "고정비"],
  },
  {
    category: "일기",
    keywords: ["감정", "외로움", "불안", "생각", "하루"],
  },
  {
    category: "가치관",
    keywords: ["의미", "가치관", "인생", "방향", "믿음"],
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

function getToday() {
  return formatDate(new Date().toISOString());
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
  const connectionTags = Array.from(
    new Set<Category>([...categories, ...recommendedTags]),
  )
    .map((category) => `- [[${category}]]`)
    .join("\n");

  return `# ${date} Life Ledger

${categorySections}

## 연결 태그
${connectionTags}`;
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
  const [selectedCategory, setSelectedCategory] = useState<Category>("일기");
  const [selectedFilter, setSelectedFilter] = useState<CategoryFilter>("전체");
  const [content, setContent] = useState("");
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [copyMessage, setCopyMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);

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
      void fetchRecords();
    });
  }, [fetchRecords]);

  const canSave = content.trim().length > 0 && !isSaving;
  const today = getToday();
  const todayRecords = useMemo(
    () => records.filter((record) => record.date === today),
    [records, today],
  );
  const filteredRecords = useMemo(
    () =>
      selectedFilter === "전체"
        ? records
        : records.filter((record) => record.category === selectedFilter),
    [records, selectedFilter],
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

  async function handleSave() {
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setCopyMessage("");

    const { error } = await supabase.from("records").insert({
      category: selectedCategory,
      content: trimmedContent,
    });

    if (error) {
      backupRecord({
        category: selectedCategory,
        content: trimmedContent,
      });
      setErrorMessage(
        `저장에 실패했습니다: ${error.message}. 이 브라우저에 백업을 남겼습니다.`,
      );
      setIsSaving(false);
      return;
    }

    setContent("");
    setIsSaving(false);
    setCopyMessage("저장되었습니다.");
    await fetchRecords();
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

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-6 text-zinc-950 sm:px-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-normal text-zinc-950 sm:text-4xl">
              Life Ledger
            </h1>
            <p className="text-sm leading-6 text-zinc-600 sm:text-base">
              오늘의 기록을 빠르게 남기고, Markdown으로 정리하세요.
            </p>
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
            <span className="text-sm font-semibold text-zinc-800">기록 내용</span>
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
              {isSaving ? "저장 중..." : "저장"}
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

          <button
            type="button"
            onClick={() => handleCopy(todayMarkdown)}
            disabled={todayRecords.length === 0}
            className="mt-2 w-full touch-manipulation rounded-lg border border-zinc-300 bg-zinc-50 px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:border-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-300"
          >
            오늘 기록 전체 Markdown 복사
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
            <div className="space-y-3">
              {filteredRecords.map((record) => {
                const recommendedTags = getRecommendedTags(record.content);

                return (
                  <article
                    key={record.id}
                    className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <time
                          className="text-sm font-semibold text-zinc-900"
                          dateTime={record.createdAt}
                        >
                          {record.date}
                        </time>
                        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                          {record.category}
                        </span>
                      </div>
                      <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
                        <button
                          type="button"
                          onClick={() => handleCopy(createMarkdown(record))}
                          className="touch-manipulation rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                        >
                          Markdown 복사
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(record.id)}
                          disabled={deletingRecordId === record.id}
                          className="touch-manipulation rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:border-red-700 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-300"
                        >
                          {deletingRecordId === record.id ? "삭제 중..." : "삭제"}
                        </button>
                      </div>
                    </div>

                    {recommendedTags.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {recommendedTags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600"
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
          )}
        </section>
      </div>
    </main>
  );
}
