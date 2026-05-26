"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const categories = ["일기", "투자", "지출", "운동", "콘텐츠", "가치관"] as const;

type Category = (typeof categories)[number];

type LedgerEntry = {
  id: string;
  date: string;
  category: Category;
  content: string;
};

type StoredLedgerEntry = Omit<LedgerEntry, "category"> & {
  category: string;
};

const STORAGE_KEY = "life-ledger:entries";
const legacyCategoryMap = {
  신앙: "가치관",
} as const satisfies Record<string, Category>;

function normalizeCategory(value: string): Category | null {
  if (isCategory(value)) {
    return value;
  }

  if (value in legacyCategoryMap) {
    return legacyCategoryMap[value as keyof typeof legacyCategoryMap];
  }

  return null;
}

function isCategory(value: string): value is Category {
  return categories.includes(value as Category);
}

function isLedgerEntry(value: unknown): value is StoredLedgerEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<StoredLedgerEntry>;

  return (
    typeof entry.id === "string" &&
    typeof entry.date === "string" &&
    typeof entry.category === "string" &&
    normalizeCategory(entry.category) !== null &&
    typeof entry.content === "string"
  );
}

function normalizeLedgerEntry(entry: StoredLedgerEntry): LedgerEntry {
  return {
    ...entry,
    category: normalizeCategory(entry.category) ?? "가치관",
  };
}

function createMarkdown(entry: Pick<LedgerEntry, "date" | "category" | "content">) {
  return `# ${entry.date} 기록

## 카테고리
- ${entry.category}

## 내용
${entry.content}`;
}

function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState<Category>("일기");
  const [content, setContent] = useState("");
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [copyMessage, setCopyMessage] = useState("");
  const hasLoadedEntries = useRef(false);

  useEffect(() => {
    const storedEntries = window.localStorage.getItem(STORAGE_KEY);

    if (!storedEntries) {
      hasLoadedEntries.current = true;
      return;
    }

    try {
      const parsedEntries = JSON.parse(storedEntries) as unknown;
      const storedLedgerEntries = Array.isArray(parsedEntries)
        ? parsedEntries.filter(isLedgerEntry)
        : [];
      const normalizedLedgerEntries =
        storedLedgerEntries.map(normalizeLedgerEntry);

      queueMicrotask(() => {
        setEntries(normalizedLedgerEntries);
        hasLoadedEntries.current = true;
      });
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      hasLoadedEntries.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedEntries.current) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const canSave = content.trim().length > 0;

  const draftMarkdown = useMemo(
    () =>
      createMarkdown({
        date: getToday(),
        category: selectedCategory,
        content: content.trim(),
      }),
    [content, selectedCategory],
  );

  function handleSave() {
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      return;
    }

    const nextEntry: LedgerEntry = {
      id: crypto.randomUUID(),
      date: getToday(),
      category: selectedCategory,
      content: trimmedContent,
    };

    setEntries((currentEntries) => [nextEntry, ...currentEntries]);
    setContent("");
    setCopyMessage("");
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
              저장
            </button>
            <button
              type="button"
              onClick={() => handleCopy(draftMarkdown)}
              disabled={!canSave}
              className="touch-manipulation rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:border-zinc-950 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-300"
            >
              Markdown 복사
            </button>
          </div>

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
                새로고침해도 이 브라우저에 기록이 남습니다.
              </p>
            </div>
            <span className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-700">
              {entries.length}개
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
              아직 저장된 기록이 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <time className="text-sm font-semibold text-zinc-900">
                        {entry.date}
                      </time>
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                        {entry.category}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(createMarkdown(entry))}
                      className="touch-manipulation rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                    >
                      Markdown 복사
                    </button>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                    {entry.content}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
