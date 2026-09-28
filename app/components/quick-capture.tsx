"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation reinitializes quick mode and refreshes saved records while retaining the session lock. */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/src/lib/supabase";
import { HomeScreenHelp } from "./home-screen";

type QuickCategory = "일기" | "운동";
const draftKey = (category: QuickCategory) => `life-ledger:quick-draft:v1:${category}`;

export function QuickCapture({ initialCategory, onLock }: {
  initialCategory: QuickCategory;
  onLock: () => void;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [drafts, setDrafts] = useState<Record<QuickCategory, string>>({ 일기: "", 운동: "" });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const busy = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const content = drafts[category];

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        setDrafts({
          일기: localStorage.getItem(draftKey("일기")) ?? "",
          운동: localStorage.getItem(draftKey("운동")) ?? "",
        });
      } catch {
        setStorageWarning("이 브라우저에서는 초안을 보관할 수 없어요. 저장 전에는 화면을 닫지 마세요.");
      }
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (ready) input.current?.focus();
  }, [ready, category]);

  function changeContent(value: string) {
    setDrafts((previous) => ({ ...previous, [category]: value }));
    setMessage("");
    try {
      if (value) localStorage.setItem(draftKey(category), value);
      else localStorage.removeItem(draftKey(category));
      setStorageWarning("");
    } catch {
      setStorageWarning("초안을 보관하지 못했어요. 저장 전에는 화면을 닫지 마세요.");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy.current || !content.trim()) return;
    busy.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { data, error: saveError } = await supabase.from("records")
        .insert({ category, content: content.trim() })
        .select("id").single();
      if (saveError || !data) {
        setError("저장을 확인하지 못했어요. 입력 내용은 그대로 남아 있어요. 연결을 확인하고 기록 목록에 없는 경우 다시 저장하세요.");
        return;
      }
      changeContent("");
      setMessage(`${category === "일기" ? "일기를" : "운동을"} 저장했어요. 한 줄이면 충분해요.`);
    } catch {
      setError("연결이 끊겨 저장을 확인하지 못했어요. 입력 내용은 그대로 남아 있어요. 기록 목록을 확인한 뒤 다시 시도하세요.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <main className="min-h-dvh bg-stone-50 px-4 py-5 text-zinc-950">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-zinc-500">Life Ledger</p>
            <h1 className="mt-1 text-2xl font-bold">지금, 한 줄 남기기</h1>
          </div>
          <button type="button" disabled={saving} onClick={onLock} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50">잠금</button>
        </header>

        <form onSubmit={save} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="mb-4 grid grid-cols-2 gap-2" aria-label="기록 종류">
            {(["일기", "운동"] as const).map((item) => (
              <button key={item} type="button" aria-pressed={category === item} disabled={saving}
                onClick={() => { setCategory(item); setMessage(""); setError(""); }}
                className={`rounded-xl border px-4 py-3 font-semibold disabled:opacity-50 ${category === item ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-600"}`}>
                {item === "일기" ? "한 줄 일기" : "운동 기록"}
              </button>
            ))}
          </div>
          <label htmlFor="quick-content" className="text-sm font-semibold">
            {category === "일기" ? "오늘 기억하고 싶은 일 하나는?" : "오늘 어떤 운동을 했나요?"}
          </label>
          <textarea ref={input} id="quick-content" value={content} disabled={!ready || saving}
            onChange={(event) => changeContent(event.target.value)} rows={5}
            placeholder={category === "일기" ? "짧아도 괜찮아요. 지금 떠오른 한 줄." : "하체 40분. 레그 익스텐션 30kg 15회 3세트."}
            className="mt-2 w-full resize-y rounded-xl border border-zinc-300 p-3 text-base leading-7 outline-none focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10 disabled:bg-zinc-50" />
          <p className="mt-2 text-xs leading-5 text-zinc-500">{storageWarning || "작성 중인 초안은 이 기기에 보관돼요. 저장하면 기존 기록 목록에 함께 보여요."}</p>
          <button type="submit" disabled={!ready || saving || !content.trim()}
            className="mt-4 w-full rounded-xl bg-zinc-950 px-4 py-3.5 font-semibold text-white disabled:bg-zinc-300">
            {saving ? "저장 중…" : "오늘 기록 저장"}
          </button>
          <p role="status" className="mt-2 text-sm font-medium text-zinc-700">{message}</p>
          {error && <p role="alert" className="mt-2 text-sm leading-6 text-red-700">{error}</p>}
        </form>
        {saving ? <span className="py-2 text-center text-sm text-zinc-400">저장이 끝나면 전체 기록으로 이동할 수 있어요.</span> :
          <a href="/" className="py-2 text-center text-sm font-semibold underline underline-offset-4">전체 기록 · 인바디 보기</a>}
        <HomeScreenHelp />
      </div>
    </main>
  );
}
