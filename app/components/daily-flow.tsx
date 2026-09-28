"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation refreshes the archive while retaining the lock session. */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { HomeScreenHelp } from "./home-screen";
import { blankSet, DRAFT_KEY, emptyDraft, newSession, previousWorkout, readDraft, validSet, workoutContent, type DailyDraft, type Session } from "@/src/lib/workout-session";

const button = "rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold disabled:opacity-40";
const primary = "w-full rounded-xl bg-zinc-950 px-4 py-3.5 font-semibold text-white disabled:bg-zinc-300";
const field = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base disabled:bg-zinc-100";
const parts = ["하체", "가슴", "등", "어깨", "팔", "복근", "전신", "유산소"];
type Previous = { id: string; content: string; created_at: string };

function RecentList({ recent, loading, loadError, start, retry }: { recent: Previous[]; loading: boolean; loadError: string; start: (record: Previous) => void; retry: () => void }) {
    return <section className="space-y-3" aria-label="최근 운동">
      <h2 className="text-sm font-semibold text-zinc-600">지난 운동에서 시작하기</h2>
      {loading && <p className="text-sm text-zinc-500">지난 운동을 불러오는 중…</p>}
      {loadError && <p className="text-sm text-red-700">{loadError} <button className="underline" onClick={retry}>다시 불러오기</button></p>}
      {!loading && !loadError && recent.length === 0 && <p className="text-sm text-zinc-500">첫 운동을 남기면 다음번에는 그대로 불러올 수 있어요.</p>}
      {recent.slice(0, 5).map(record => { const previous = previousWorkout(record.content); return <button key={record.id} type="button" onClick={() => start(record)} className="block w-full rounded-xl border border-zinc-200 bg-white p-4 text-left">
        <span className="text-xs text-zinc-500">{new Date(record.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} · {previous.sets.length ? `${previous.sets.length}세트` : "자유 기록"}</span>
        <span className="mt-1 block truncate font-semibold">{previous.preview.split("\n").find(Boolean) || "지난 운동"}</span>
        <span className="mt-2 block text-sm text-zinc-600">{previous.sets.length ? "이 운동 불러오기 →" : "지난 메모 보면서 시작 →"}</span>
      </button>; })}
    </section>;
  }

export function DailyFlow({ initialMode, onLock }: { initialMode: "home" | "일기" | "운동"; onLock: () => void }) {
  const [draft, setDraft] = useState<DailyDraft>(emptyDraft);
  const draftRef = useRef(draft);
  const [ready, setReady] = useState(false);
  const [recent, setRecent] = useState<Previous[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [now, setNow] = useState(0);
  const [discarding, setDiscarding] = useState(false);
  const [retry, setRetry] = useState(0);
  const session = draft.session;
  const frozen = saving || !!session?.pendingContent;

  function update(next: DailyDraft) {
    draftRef.current = next;
    setDraft(next);
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); setStorageWarning(""); }
    catch { setStorageWarning("초안을 이 기기에 보관하지 못했어요. 저장 전 화면을 닫지 마세요."); }
  }
  function patchSession(patch: Partial<Session>) {
    const current = draftRef.current;
    if (current.session) update({ ...current, session: { ...current.session, ...patch } });
  }

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      let restored = emptyDraft();
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        restored = readDraft(raw);
        if (!raw) restored.diary = localStorage.getItem("life-ledger:quick-draft:v1:일기") ?? "";
      } catch { setStorageWarning("보관된 초안을 읽지 못했어요. 기존 저장 기록은 기록 탭에서 확인할 수 있어요."); }
      // Continue unfinished work on ordinary launches, including the previous PWA start URL.
      if (restored.screen === "home") {
        if (restored.session) restored.screen = "workout";
        else if (restored.diary || restored.mood || restored.afterWorkout || initialMode === "일기") restored.screen = "diary";
        else if (initialMode === "운동") restored.screen = "workout";
      }
      draftRef.current = restored; setDraft(restored); setNow(Date.now()); setReady(true);
    });
    return () => { active = false; };
  }, [initialMode]);

  useEffect(() => {
    let active = true;
    supabase.from("records").select("id, content, created_at").eq("category", "운동").order("created_at", { ascending: false }).limit(12)
      .then(({data,error: problem}) => { if (active) { setRecent(data ?? []); setLoadError(problem ? "지난 운동을 불러오지 못했어요. 새 운동은 시작할 수 있어요." : ""); setLoading(false); } }, () => { if (active) { setLoadError("지난 운동을 불러오지 못했어요."); setLoading(false); } });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    if (!session?.restUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session?.restUntil]);

  function navigate(screen: DailyDraft["screen"]) {
    update({ ...draftRef.current, screen }); setError(""); setNotice(""); setDiscarding(false);
  }
  function start(previous?: Previous, simple = false) {
    if (draftRef.current.session) { navigate("workout"); return; }
    const parsed = previous ? previousWorkout(previous.content) : { sets: [], preview: "" };
    const next = newSession(parsed.sets, parsed.preview);
    if (simple) next.mode = "simple";
    try {
      const old = localStorage.getItem("life-ledger:quick-draft:v1:운동");
      if (old) next.memo = old;
    } catch { /* Draft storage warning is shown by update. */ }
    update({ ...draftRef.current, session: next, screen: "workout", afterWorkout: false });
    setError(""); setNotice("");
  }

  async function finishWorkout() {
    if (busy.current || !draftRef.current.session) return;
    const current = draftRef.current;
    const workout = current.session!;
    let content: string;
    try { content = workoutContent(workout); } catch (e) { setError((e as Error).message); return; }
    busy.current = true; setSaving(true); setError("");
    // Freeze the exact payload before sending, so a lost response can be checked on retry.
    update({ ...current, session: { ...workout, pendingContent: content, restUntil: 0 } });
    try {
      const existing = await supabase.from("records").select("id").eq("category", "운동").like("content", `%"clientSessionId":"${workout.id}"%`).limit(1).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) {
        const result = await supabase.from("records").insert({ category: "운동", content, created_at: workout.startedAt }).select("id").single();
        if (result.error || !result.data) throw result.error ?? new Error("No saved record");
      }
      update({ ...draftRef.current, session: null, screen: "diary", afterWorkout: true });
      try { localStorage.removeItem("life-ledger:quick-draft:v1:운동"); } catch { /* Current draft remains authoritative. */ }
      setNotice("운동 기록을 저장했어요."); setRetry(v => v + 1);
    } catch {
      setError("저장을 확인하지 못했어요. 운동 내용은 보관했어요. ‘저장 다시 확인’을 누르면 이미 저장됐는지 확인한 뒤 이어서 처리해요.");
    } finally { busy.current = false; setSaving(false); }
  }

  async function saveDiary() {
    const current = draftRef.current;
    if (busy.current || (!current.diary.trim() && !current.mood)) return;
    busy.current = true; setSaving(true); setError("");
    try {
      const content = [current.mood && `오늘 기분: ${current.mood}`, current.diary.trim()].filter(Boolean).join("\n");
      const result = await supabase.from("records").insert({ category: "일기", content }).select("id").single();
      if (result.error || !result.data) throw result.error ?? new Error("No saved record");
      update({ ...current, diary: "", mood: "", afterWorkout: false, screen: "home" });
      try { localStorage.removeItem("life-ledger:quick-draft:v1:일기"); } catch { /* Current draft remains authoritative. */ }
      setNotice("오늘의 한 줄도 남겼어요. 수고했어요!");
    } catch { setError("일기 저장을 확인하지 못했어요. 초안은 남겨뒀어요. 기록 탭에 저장됐는지 확인한 뒤 다시 시도해주세요."); }
    finally { busy.current = false; setSaving(false); }
  }


  if (!ready) return <main className="p-6 text-center">작성 중인 기록을 확인하는 중…</main>;
  const remaining = session?.restUntil ? Math.max(0, Math.ceil((session.restUntil - now) / 1000)) : 0;
  const done = session?.sets.filter(s => s.done).length ?? 0;
  return <main className="min-h-dvh bg-stone-50 px-4 py-5 text-zinc-950">
    <div className="mx-auto max-w-xl space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div><p className="text-xs font-semibold text-zinc-500">Life Ledger</p><h1 className="mt-1 text-2xl font-bold">{draft.screen === "workout" ? "오늘의 운동" : draft.screen === "diary" ? draft.afterWorkout ? "오늘 어땠어?" : "오늘의 한 줄" : "오늘도, 가볍게"}</h1></div>
        <button type="button" className={button} disabled={saving} onClick={onLock}>잠금</button>
      </header>
      <nav className="flex gap-2" aria-label="주요 메뉴">
        <button className={button} aria-pressed={draft.screen === "home"} disabled={saving} onClick={() => navigate("home")}>오늘</button>
        <button className={button} aria-pressed={draft.screen === "workout"} disabled={saving} onClick={() => navigate("workout")}>운동</button>
        <button className={button} aria-pressed={draft.screen === "diary"} disabled={saving} onClick={() => navigate("diary")}>일기</button>
        {!saving && <a href="/?view=records" className={button}>기록·통계</a>}
      </nav>
      {storageWarning && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{storageWarning}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">✓ {notice}</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-800">{error}</p>}

      {draft.screen === "home" && <>
        <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-bold">{session ? "하던 운동이 있어요" : "오늘 운동할까요?"}</h2>
          <p className="text-sm text-zinc-600">{session ? `${done}세트 완료 · 입력한 내용 그대로 이어가요.` : "지난 중량을 보고, 끝낸 세트만 체크해요."}</p>
          <button className={primary} onClick={() => navigate("workout")}>{session ? "작성 중인 운동 이어가기" : "운동 시작하기"}</button>
          <button className="w-full py-2 text-sm font-semibold underline" onClick={() => navigate("diary")}>{draft.diary || draft.mood ? "작성 중인 일기 이어가기" : "운동 안 한 날? 한 줄만 남기기"}</button>
        </section>
        {!session && <RecentList recent={recent} loading={loading} loadError={loadError} start={start} retry={() => setRetry(v => v + 1)} />}
        <HomeScreenHelp />
      </>}

      {draft.screen === "workout" && !session && <>
        <div className="grid grid-cols-2 gap-2"><button className={primary} onClick={() => start()}>새 운동 시작</button><button className={button} onClick={() => start(undefined, true)}>부위·시간만 기록</button></div>
        {<RecentList recent={recent} loading={loading} loadError={loadError} start={start} retry={() => setRetry(v => v + 1)} />}
      </>}

      {draft.screen === "workout" && session && <>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-600"><span>{new Date(session.startedAt).toLocaleDateString("ko-KR")} 시작 · {done}세트 완료</span><span>초안 자동 보관</span></div>
        {session.reference && <details className="rounded-xl border border-zinc-200 bg-white p-4" open={!session.sets.some(s => s.exercise)}><summary className="cursor-pointer text-sm font-semibold">지난 운동 참고하기</summary><pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6">{session.reference}</pre><p className="mt-2 text-xs text-zinc-500">지난 기록은 참고값이에요. 오늘 완료한 세트만 저장해요.</p></details>}
        <fieldset disabled={frozen} className="space-y-4 disabled:opacity-70">
          <div className="flex gap-2"><button type="button" className={button} aria-pressed={session.mode === "sets"} onClick={() => patchSession({mode:"sets"})}>세트별 기록</button><button type="button" className={button} aria-pressed={session.mode === "simple"} onClick={() => patchSession({mode:"simple"})}>간단 기록</button></div>
          {session.mode === "simple" ? <section className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-200 bg-white p-4">
            <label className="text-sm font-semibold">운동 부위<input className={field} value={session.simplePart} placeholder="하체" onChange={e => patchSession({simplePart:e.target.value})} /></label>
            <label className="text-sm font-semibold">시간(분)<input className={field} type="number" min="1" inputMode="numeric" value={session.minutes} placeholder="40" onChange={e => patchSession({minutes:e.target.value})} /></label>
            {done > 0 && <p className="col-span-2 text-xs text-zinc-600">간단 기록으로 마치면 부위·시간·메모만 저장해요. 세트도 저장하려면 세트별 기록으로 돌아가세요.</p>}
          </section> : <>
            {session.sets.map((set,index) => <section key={set.id} className={`rounded-xl border bg-white p-4 ${set.done ? "border-emerald-600" : "border-zinc-200"}`}>
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{index+1}세트 {set.done ? "· 완료 ✓" : ""}</h2><button type="button" className="px-2 py-1 text-xs underline" onClick={() => patchSession({sets:session.sets.filter(s => s.id !== set.id)})}>세트 삭제</button></div>
              <fieldset disabled={set.done} className="grid grid-cols-2 gap-3">
                <label className="text-sm">부위<select className={field} value={set.bodyPart} onChange={e => patchSession({sets:session.sets.map(s => s.id === set.id ? {...s,bodyPart:e.target.value} : s)})}><option value="">선택</option>{parts.map(p => <option key={p}>{p}</option>)}{set.bodyPart && !parts.includes(set.bodyPart) && <option>{set.bodyPart}</option>}</select></label>
                <label className="text-sm">운동명<input className={field} value={set.exercise} placeholder="레그 익스텐션" onChange={e => patchSession({sets:session.sets.map(s => s.id === set.id ? {...s,exercise:e.target.value} : s)})} /></label>
                {set.bodyPart === "유산소" ? <label className="col-span-2 text-sm">시간(분)<input className={field} type="number" min="0.1" step="any" value={set.duration} onChange={e => patchSession({sets:session.sets.map(s => s.id === set.id ? {...s,duration:e.target.value} : s)})} /></label> : <>
                  <label className="text-sm">중량(kg)<input className={field} type="number" inputMode="decimal" min="0" step="any" placeholder="맨몸은 비워두기" value={set.weight} onChange={e => patchSession({sets:session.sets.map(s => s.id === set.id ? {...s,weight:e.target.value} : s)})} /></label>
                  <label className="text-sm">횟수<input className={field} type="number" inputMode="numeric" min="1" step="1" value={set.reps} onChange={e => patchSession({sets:session.sets.map(s => s.id === set.id ? {...s,reps:e.target.value} : s)})} /></label>
                </>}
              </fieldset>
              <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" className={set.done ? button : primary} onClick={() => {
                if (!set.done && !validSet(set)) { setError("부위·운동명과 횟수(유산소는 시간)를 입력해주세요. 중량은 0 이상이어야 해요."); return; }
                setError(""); setNow(Date.now()); patchSession({sets:session.sets.map(s => s.id === set.id ? {...s,done:!s.done} : s), restUntil:set.done ? 0 : Date.now()+90000});
              }}>{set.done ? "완료 취소·수정" : "세트 완료"}</button><button type="button" className={button} onClick={() => patchSession({sets:[...session.sets.slice(0,index+1),{...set,id:crypto.randomUUID(),done:false},...session.sets.slice(index+1)]})}>같은 세트 추가</button></div>
            </section>)}
            <button className={button+" w-full"} type="button" onClick={() => patchSession({sets:[...session.sets,blankSet()]})}>+ 다른 운동 추가</button>
          </>}
          <label className="block text-sm font-semibold">메모(선택)<textarea className={field} rows={2} value={session.memo} placeholder="오늘 몸 상태나 기억할 점" onChange={e => patchSession({memo:e.target.value})} /></label>
        </fieldset>
        {session.restUntil > 0 && <aside className="sticky bottom-3 flex items-center justify-between rounded-xl bg-zinc-950 px-4 py-3 text-white shadow-lg"><span role="timer">{remaining ? `휴식 ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,"0")}` : "휴식 끝 · 준비되면 다음 세트"}</span><button className="px-2 py-1 text-sm underline" onClick={() => patchSession({restUntil:0})}>닫기</button></aside>}
        <p className="text-xs text-zinc-500">{session.pendingContent ? "저장 확인 중인 기록은 수정하지 않아요. 아래 버튼으로 저장 여부를 다시 확인하세요." : "세트 완료를 누른 항목만 저장해요. 저장 전에도 이어서 쓸 수 있어요."}</p>
        <button className={primary} disabled={saving} onClick={() => void finishWorkout()}>{saving ? "저장 확인 중…" : session.pendingContent ? "저장 다시 확인" : "오늘 운동 마치기"}</button>
        {!session.pendingContent && !saving && <div>{discarding ? <div className="rounded-xl border border-red-200 p-3 text-sm"><p>이 기기의 진행 중인 운동을 버릴까요? 저장된 지난 기록은 유지돼요.</p><div className="mt-2 flex gap-2"><button className={button} onClick={() => {update({...draftRef.current,session:null,screen:"home"});setDiscarding(false);}}>진행 중인 운동 버리기</button><button className={button} onClick={() => setDiscarding(false)}>계속 기록하기</button></div></div> : <button className="text-xs text-zinc-500 underline" onClick={() => setDiscarding(true)}>진행 중인 운동 버리기</button>}</div>}
      </>}

      {draft.screen === "diary" && <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
        {draft.afterWorkout && <p className="text-sm text-emerald-800">✓ 운동은 저장됐어요. 일기는 남기고 싶을 때만 써요.</p>}
        <fieldset disabled={saving} className="space-y-4">
          <legend className="mb-3 text-sm font-semibold">지금 기분은? 이것만 골라도 충분해요.</legend>
          <div className="flex flex-wrap gap-2">{["개운함","평온함","뿌듯함","피곤함","속상함"].map(mood => <button key={mood} type="button" aria-pressed={draft.mood === mood} className={`${button} ${draft.mood === mood ? "!border-zinc-950 !bg-zinc-950 !text-white" : ""}`} onClick={() => update({...draftRef.current,mood:draft.mood === mood ? "" : mood})}>{mood}</button>)}</div>
          <label className="block text-sm font-semibold">{draft.afterWorkout ? "오늘 운동이나 하루는 어땠어?" : "오늘 기억할 일 하나는?"}<textarea className={field} rows={3} value={draft.diary} placeholder="한 줄만 적어도 괜찮아요." onChange={e => update({...draftRef.current,diary:e.target.value})} /></label>
        </fieldset>
        <button className={primary} disabled={saving || (!draft.diary.trim() && !draft.mood)} onClick={() => void saveDiary()}>{saving ? "저장 중…" : "오늘의 한 줄 저장"}</button>
        <button className="w-full py-2 text-sm text-zinc-500 underline" disabled={saving} onClick={() => { update({...draftRef.current,screen:"home",afterWorkout:false});setNotice("오늘은 여기까지. 작성한 초안은 남겨뒀어요.");setError(""); }}>{draft.diary || draft.mood ? "초안 남기고 나중에 쓰기" : "오늘은 건너뛰기"}</button>
        <p className="text-xs text-zinc-500">작성 중인 내용은 이 기기에 자동 보관돼요.</p>
      </section>}
    </div>
  </main>;
}
