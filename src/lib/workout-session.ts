export type SetEntry = {
  id: string; bodyPart: string; exercise: string; weight: string; reps: string;
  duration: string; intensity: string; done: boolean;
};
export type Session = {
  id: string; startedAt: string; mode: "sets" | "simple"; sets: SetEntry[];
  memo: string; reference: string; simplePart: string; minutes: string;
  restUntil: number; pendingContent?: string;
};
export type DailyDraft = {
  version: 1; screen: "home" | "workout" | "diary";
  session: Session | null; diary: string; mood: string; afterWorkout: boolean;
};
export const DRAFT_KEY = "life-ledger:daily-flow:v1";
export function emptyDraft(): DailyDraft {
  return { version: 1, screen: "home", session: null, diary: "", mood: "", afterWorkout: false };
}
export function blankSet(): SetEntry {
  return { id: crypto.randomUUID(), bodyPart: "", exercise: "", weight: "", reps: "", duration: "", intensity: "", done: false };
}
export function newSession(sets: SetEntry[] = [], reference = ""): Session {
  return { id: crypto.randomUUID(), startedAt: new Date().toISOString(), mode: "sets",
    sets: sets.length ? sets.map(s => ({ ...s, id: crypto.randomUUID(), done: false })) : [blankSet()],
    memo: "", reference, simplePart: "", minutes: "", restUntil: 0 };
}
export function validSet(set: SetEntry): boolean {
  const positive = (s: string) => s.trim() !== "" && Number.isFinite(Number(s)) && Number(s) > 0;
  if (!set.exercise.trim() || !set.bodyPart.trim()) return false;
  if (set.bodyPart === "유산소") return positive(set.duration);
  return positive(set.reps) && Number.isInteger(Number(set.reps)) &&
    (set.weight.trim() === "" || (Number.isFinite(Number(set.weight)) && Number(set.weight) >= 0));
}
export function workoutContent(session: Session, now = Date.now()): string {
  if (session.pendingContent) return session.pendingContent;
  const minutes = Math.max(1, Math.round((now - Date.parse(session.startedAt)) / 60000));
  const common = { type: "workout", clientSessionId: session.id, bodyFlags: [] };
  if (session.mode === "simple") {
    if (!session.simplePart.trim() || !Number.isFinite(Number(session.minutes)) || Number(session.minutes) <= 0) throw new Error("운동 부위와 시간을 입력해주세요.");
    return JSON.stringify({ ...common, mode: "free", freeText: `${session.simplePart.trim()} · ${session.minutes}분${session.memo.trim() ? `\n${session.memo.trim()}` : ""}`, sets: [], memo: "" });
  }
  const done = session.sets.filter(s => s.done);
  if (!done.length || done.some(s => !validSet(s))) throw new Error("운동명·부위·횟수를 입력하고 완료한 세트를 체크해주세요.");
  return JSON.stringify({ ...common, mode: "detailed", sets: done.map(({bodyPart,exercise,weight,reps,duration,intensity}) => ({bodyPart,exercise:exercise.trim(),weight,reps,duration,intensity})), memo: [`운동 시간 ${minutes}분`, session.memo.trim()].filter(Boolean).join("\n") });
}
export function previousWorkout(content: string): { sets: SetEntry[]; preview: string } {
  try {
    const data = JSON.parse(content);
    if (data?.type === "workout" && Array.isArray(data.sets)) {
      const sets = data.sets.filter((s: unknown) => s && typeof s === "object" && "exercise" in s).map((s: Record<string, unknown>, index: number) => ({
        id: `previous-${index}`, done: false, bodyPart: String(s.bodyPart ?? ""), exercise: String(s.exercise ?? ""), weight: String(s.weight ?? ""), reps: String(s.reps ?? ""), duration: String(s.duration ?? ""), intensity: String(s.intensity ?? ""),
      }));
      return { sets, preview: data.mode === "free" ? String(data.freeText ?? "") : sets.map((s: SetEntry) => `${s.exercise} ${s.bodyPart === "유산소" ? `${s.duration}분` : `${s.weight || "맨몸"}${s.weight ? "kg" : ""} × ${s.reps}회`}`).join("\n") || String(data.memo ?? "") };
    }
  } catch { /* Plain-text legacy workouts remain readable references. */ }
  return { sets: [], preview: content };
}
export function readDraft(raw: string | null): DailyDraft {
  if (!raw) return emptyDraft();
  const d = JSON.parse(raw);
  if (d?.version !== 1 || !["home", "workout", "diary"].includes(d.screen) || typeof d.diary !== "string" || typeof d.mood !== "string" || typeof d.afterWorkout !== "boolean") throw new Error("Invalid draft");
  if (d.session) {
    const s = d.session;
    if (typeof s.id !== "string" || !Number.isFinite(Date.parse(s.startedAt)) || !["sets", "simple"].includes(s.mode) || !Array.isArray(s.sets) || ![s.memo,s.reference,s.simplePart,s.minutes].every(x => typeof x === "string") || !Number.isFinite(s.restUntil) || (s.pendingContent !== undefined && typeof s.pendingContent !== "string")) throw new Error("Invalid session");
    if (s.sets.some((x: SetEntry) => !x || typeof x.done !== "boolean" || ![x.id,x.bodyPart,x.exercise,x.weight,x.reps,x.duration,x.intensity].every(v => typeof v === "string"))) throw new Error("Invalid sets");
  }
  return d;
}
