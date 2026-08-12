"use client";

import { MessageSquare, X } from "lucide-react";
import { useState } from "react";

type InboxTask = {
  id: number;
  title: string;
  meta: string;
};

export default function InboxTaskModal({
  task,
  onClose,
}: {
  task: InboxTask | null;
  onClose: () => void;
}) {
  const [description, setDescription] = useState(task ? `Review and complete: ${task.title}` : "");
  const [comment, setComment] = useState("");

  if (!task) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
      <button
        type="button"
        aria-label="Close task"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative z -10 grid w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl md:grid-cols-[1.45fr_0.8fr]">
        <section className="p-6 md:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-600">
                Inbox task
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {task.title}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{task.meta}</p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Priority
              </label>
              <select defaultValue="Medium" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none">
                <option>Critical</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Assignee
              </label>
              <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none">
                <option>MK - Manager</option>
                <option>AK - Team Lead</option>
                <option>UR - Coordinator</option>
                <option>SA - Team Member</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Due date
              </label>
              <input
                type="date"
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none"
              />
            </div>
          </div>

          <div className="mt-6">
            <label className="text-sm font-semibold text-slate-800">
              Description
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={6}
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-50"
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl bg-[#101828] px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Save changes
            </button>

            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Move to board
            </button>
          </div>
        </section>

        <aside className="border-t border-slate-200 bg-slate-50 p6 md:border-l md:border-t-0">
          <div className="flex items-center gap-2">
            <MessageSquare size={17} />
            <h3 className="text-sm font-semibold text-slate-900">
              Comments and activity
            </h3>
          </div>

          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            placeholder="Write a comment..."
            className="mt-4 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-violet-400"
          />

          <button
            type="button"
            onClick={() => setComment("")}
            className="mt-2 h-9 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            Comment
          </button>

          <div className="mt-6 rounded-xl border border-slate-200 bg-white p4">
            <p className="text-sm text-slate-700">
              Task is currently waiting in Inbox.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Opened from the Inbox panel
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
