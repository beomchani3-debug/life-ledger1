"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation reinitializes quick mode and refreshes saved records while retaining the session lock. */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const InstallContext = createContext<{
  available: boolean;
  install: () => Promise<void>;
}>({ available: false, install: async () => {} });

export function HomeScreenProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const installed = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    setPrompt(null);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      // The browser menu instructions remain available if its prompt expires.
    }
  }

  return (
    <InstallContext.Provider value={{ available: !!prompt, install }}>
      {children}
    </InstallContext.Provider>
  );
}

export function HomeScreenHelp() {
  const { available, install } = useContext(InstallContext);
  return (
    <details className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
      <summary className="cursor-pointer font-semibold">휴대폰 바탕화면에 추가하기</summary>
      <div className="mt-3 space-y-3 leading-6">
        <p>바탕화면에서 열면 하던 운동·일기를 이어서 쓸 수 있어요.</p>
        {available && (
          <button type="button" onClick={() => void install()} className="rounded-lg bg-zinc-950 px-4 py-3 font-semibold text-white">
            홈 화면에 설치
          </button>
        )}
        <p>갤럭시: Chrome에서 앱 주소를 열고 ⋮ 메뉴 → ‘홈 화면에 추가’ 또는 ‘앱 설치’를 선택하세요.</p>
        <p>설치 후 아이콘을 길게 누르면 지원되는 기기에서 ‘한 줄 일기’와 ‘운동 기록’이 나와요. 메뉴를 길게 눌러 바탕화면으로 옮길 수도 있어요.</p>
        <p>기존 아이콘이 예전 화면을 열면 앱을 새로고침한 뒤 다시 열어주세요. 바로가기가 아직 보이지 않아도 아래 버튼으로 사용할 수 있어요.</p>
        <div className="flex flex-wrap gap-2">
          <a href="/?quick=diary" className="rounded-lg border border-zinc-300 px-3 py-2 font-semibold">한 줄 일기 열기</a>
          <a href="/?quick=workout" className="rounded-lg border border-zinc-300 px-3 py-2 font-semibold">운동 기록 열기</a>
        </div>
        <p className="text-xs text-zinc-500">iPhone: Safari의 공유 → ‘홈 화면에 추가’. 홈 화면에서 누르면 기록 화면이 열리는 바로가기이며, 위젯 안에 직접 글을 쓰는 방식은 아니에요.</p>
      </div>
    </details>
  );
}
