"use client";

import { CalendarDays, Inbox, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

type Board = {
  id: number;
  name: string;
  team_name: string | null;
};

export default function BoardNavPanels({
  boards,
  selectedBoardId,
  onSelectBoard,
}: {
  boards: Board[];
  selectedBoardId: number | null;
  onSelectBoard: (id: number) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const view = searchParams.get("view") ?? "board";
  const switchOpen = searchParams.get("switch") === "1";

  const filteredBoards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? boards.filter((board) => board.name.toLowerCase().includes(q)) : boards;
  }, [boards, query]);

  const closePanel = () => router.push("/dashboard/boards?view=board");

  return (
    <>
      {view === "inbox" || view === "planner" ? (
        <aside className="fixed bottom-0 left-0 top-14 z-[70] w-[360px] overflow-y-auto border-r border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <div className="flex items-center gap-2">
              {view === "planner" ? <CalendarDays size={18} /> : <Inbox size={18} />}
              <h2 className="text-lg font-semibold text-slate-900">
                {view === "planner" ? "Planner" : "Inbox"}
              </h2>
            </div>
            <button type="button" onClick={closePanel} className="rounded-lg p-2 hover:bg-slate-100">
              <X size={17} />
            </button>
          </div>

          {view === "planner" ? (
            <div className="p-4">
              <div className="flex items-center justify-between">
                <button className="rounded-lg border px-3 py-2 text-sm">Today</button>
                <span className="text-sm font-semibold text-slate-700">August 2026</span>
              </div>
              <div className="mt-4 grid grid-cols-7 overflow-hidden rounded-xl border bg-slate-50">
                {["M","T","W","T","F","S","S"].map((day, i) => (
                  <div key={`${day}-${i}`} className="border-r border-slate-200 p-2 text-center text-xs last:border-r-0">
                    <div className="font-semibold text-slate-400">{day}</div>
                    <div className={`mx-auto mt-2 flex h-8 w-8 items-center justify-center rounded-full ${i === 5 ? "bg-[#6554c0] text-white" : "text-slate-700"}`}>
                      {11 + i}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <CalendarDays className="mx-auto text-slate-400" size={28} />
                <p className="mt-3 text-sm font-semibold text-slate-700">Planner is ready</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Your dated tasks will be shown here while the board stays visible.</p>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <Inbox className="mx-auto text-slate-400" size={28} />
                <p className="mt-3 text-sm font-semibold text-slate-700">Inbox</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Quick-capture items and unplanned work will appear here.</p>
              </div>
            </div>
          )}
        </aside>
      ) : null}

      {switchOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Switch boards</h2>
              <button type="button" onClick={closePanel} className="rounded-lg p-2 hover:bg-slate-100">
                <X size={17} />
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border bg-slate-50 px-3">
              <Search size={16} className="text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your boards" className="h-11 w-full bg-transparent text-sm outline-none" />
            </div>
            <div className="mt-4 space-y-2">
              {filteredBoards.map((board) => (
                <button
                  key={board.id}
                  type="button"
                  onClick={() => {
                    onSelectBoard(board.id);
                    router.push("/dashboard/boards?view=board");
                  }}
                  className={`w-full rounded-xl border p-3 text-left transition hover:border-[#0c66e4] ${board.id === selectedBoardId ? "border-[#0c66e4] bg-blue-50" : "border-slate-200"}`}
                >
                  <p className="text-sm font-semibold text-slate-900">{board.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{board.team_name ?? "No team"}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
