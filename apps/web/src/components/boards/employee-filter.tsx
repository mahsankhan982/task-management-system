"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import { apiRequest } from "@/lib/api";

type Employee = { id: number; full_name: string; email: string };

export default function EmployeeFilter({ value, onChange }: { value: number[]; onChange: (ids: number[]) => void }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [draft, setDraft] = useState<number[]>(value);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const request = useRef({ version: 0 });
  const refresh = useCallback(async () => {
    const version = ++request.current.version;
    setLoading(true);
    try {
      const response = await apiRequest<{ data: Employee[] }>("/users", { cache: "no-store" });
      if (version !== request.current.version) return;
      setEmployees(Array.from(new Map((response.data ?? []).map(employee => [Number(employee.id), { ...employee, id: Number(employee.id) }])).values()).sort((a, b) => a.full_name.localeCompare(b.full_name) || a.id - b.id));
      setError("");
    } catch (err) {
      if (version === request.current.version) setError(err instanceof Error ? err.message : "Unable to load employees");
    } finally {
      if (version === request.current.version) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const pending = request.current;
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    const focus = () => { void refresh(); };
    const visibility = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    return () => { window.clearTimeout(timer); ++pending.version; window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", visibility); };
  }, [refresh]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return (
    <div ref={container} className="employee-filter relative lg:w-[250px]">
      <button ref={trigger} type="button" aria-label="Employees / Assignees" aria-expanded={open} aria-controls="employee-filter-options" className="employee-filter-trigger flex h-11 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium" onClick={() => { if (open) setOpen(false); else { setDraft([...value]); setOpen(true); void refresh(); } }}>
        <UserRound size={16} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{value.length ? `${value.length} employee${value.length === 1 ? "" : "s"} selected` : "All Employees / Assignees"}</span>
        <ChevronDown size={16} className="shrink-0" />
      </button>
      {open && <div id="employee-filter-options" role="group" aria-label="Select employees" className="employee-filter-options absolute right-0 top-full z-40 mt-2 w-full min-w-[250px] rounded-xl border p-2 shadow-xl">
        {loading && <p role="status" className="px-2 py-1 text-xs">Refreshing employees...</p>}
        {error && <div role="alert" className="px-2 py-1 text-xs">{error} <button type="button" onClick={() => void refresh()} className="underline">Retry</button></div>}
        <div className="max-h-[min(240px,40dvh)] overflow-y-auto">
          {employees.map(employee => <label key={employee.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/10">
            <input type="checkbox" checked={draft.includes(employee.id)} onChange={event => setDraft(current => event.target.checked ? [...current, employee.id] : current.filter(id => id !== employee.id))} />
            <span className="min-w-0"><span className="block text-sm">{employee.full_name}</span><span className="block break-all text-xs opacity-70">{employee.email}</span></span>
          </label>)}
          {!loading && !error && !employees.length && <p className="px-2 py-3 text-sm">No employees available.</p>}
        </div>
        <div className="mt-2 flex justify-between gap-2 border-t pt-2">
          <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => { setDraft([]); onChange([]); }}>Clear</button>
          <button type="button" className="employee-filter-apply rounded-lg px-4 py-1.5 text-sm font-semibold" onClick={() => { onChange([...draft]); setOpen(false); trigger.current?.focus(); }}>Done</button>
        </div>
      </div>}
    </div>
  );
}
