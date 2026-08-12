"use client";
import { CheckSquare, MessageSquare, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useRole } from "@/contexts/role-context";

export type BoardStage="To Do"|"In Progress"|"Waiting for Lead"|"Review"|"Completed";
export type BoardPriority="Critical"|"High"|"Medium"|"Low";
export type BoardTaskData={id:number;title:string;team:string;priority:BoardPriority;due:string;assignee:string;comments:number};

type Props={task:BoardTaskData;stage:BoardStage;onClose:()=>void;onSave:(task:BoardTaskData,stage:BoardStage)=>void};
const stages:BoardStage[]=["To Do","In Progress","Waiting for Lead","Review","Completed"];
const priorities:BoardPriority[]=["Critical","High","Medium","Low"];
const members=["MK","AK","UR","SA","HS","HM","MA","FA"];

export default function BoardTaskModal({task,stage,onClose,onSave}:Props){
  const { permissions } = useRole();
  const [title,setTitle]=useState(task.title);
  const [priority,setPriority]=useState<BoardPriority>(task.priority);
  const [nextStage,setNextStage]=useState<BoardStage>(stage);
  const [assignee,setAssignee]=useState(task.assignee);
  const [due,setDue]=useState(task.due);
  const [description,setDescription]=useState(`Add requirements and completion notes for "${task.title}".`);
  const [comment,setComment]=useState("");
  const [activity,setActivity]=useState<string[]>([`${task.assignee} is assigned to this task.`,`Task is currently in ${stage}.`]);
  const [checks,setChecks]=useState([
    {id:1,text:"Review task requirements",done:true},
    {id:2,text:"Complete assigned work",done:false},
    {id:3,text:"Submit for review",done:false},
  ]);
  const complete=useMemo(()=>checks.filter(x=>x.done).length,[checks]);

  const addComment=(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    const value=comment.trim();
    if(!value)return;
    setActivity(a=>[`MK: ${value}`,...a]);
    setComment("");
  };

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]">
    <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0"/>
    <div className="relative z-10 grid max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl lg:grid-cols-[1.45fr_.8fr]">
      <section className="min-h-0 overflow-y-auto p-6">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-violet-600">Task details</p>
            <input disabled={!permissions.editTask} value={title} onChange={e=>setTitle(e.target.value)} className="mt-2 w-full bg-transparent text-2xl font-semibold text-slate-950 outline-none"/>
            <p className="mt-1 text-sm text-slate-500">In <b>{nextStage}</b></p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100"><X size={19}/></button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Priority
            <select disabled={!permissions.editTask} value={priority} onChange={e=>setPriority(e.target.value as BoardPriority)} className="mt-2 h-10 w-ful rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
              {priorities.map(x=><option key={x}>{x}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Stage
            <select disabled={!permissions.moveTask} value={nextStage} onChange={e=>setNextStage(e.target.value as BoardStage)} className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
              {stages.map(x=><option key={x}>{x}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Assignee
            <select disabled={!permissions.assignTask} value={assignee} onChange={e=>setAssignee(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
              {members.map((x)=><option key={x}>{x}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Due date
            <input disabled={!permissions.editTask} value={due} onChange={e=>setDue(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700"/>
          </label>
        </div>

        <div className="mt-6">
          <p className="text-sm font-semibold text-slate-800">Description</p>
          <textarea disabled={!permissions.editTask} value={description} onChange={e=>setDescription(e.target.value)} rows={5} className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm leading-6 outline-none focus:border-violet-400"/>
        </div>

        <div className="mt-7">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><CheckSquare size={18}/><b className="text-sm">Checklist</b></div>
            <span className="text-xs text-slate-500">{complete}/{checks.length}</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-violet-600" style={{width:`${complete/checks.length*100}%`}}/></div>
          <div className="mt-3 space-y-1">
            {checks.map((item)=><label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-2 text-sm hover:bg-slate-50">
              <input disabled={!permissions.editTask} type="checkbox" checked={item.done} onChange={()=>setChecks(c=>c.map(x=>x.id===item.id?{...x,done:!x.done}:x))}/>
              <span className={item.done?"text-slate-400 line-through":""}>{item.text}</span>
            </label>)}
          </div>
        </div>

        <div className="mt-7 flex justify-end gap-3 border-t border-slate-100 pt-5">
          <button type="button" onClick={onClose} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium">Cancel</button>
          <button type="button" disabled={!permissions.editTask && !permissions.moveTask && !permissions.assignTask} style={!permissions.editTask && !permissions.moveTask && !permissions.assignTask ? { display: "none" } : undefined} onClick={()=>onSave({...task,title:title.trim()||task.title,priority,assignee,due,comments:Math.max(task.comments,activity.length)},nextStage)} className="h-10 rounded-xl bg-[#101828] px-5 text-sm font-semibold text-white">Save changes</button>
        </div>
      </section>

      <aside className="min-h-0 overflow-y-auto border-t border-slate-200 bg-slate-50 p-6 lg:border-l lg:border-t-0">
        <div className="flex items-center gap-2"><MessageSquare size={17}/><b className="text-sm">Comments & activity</b></div>
        <form onSubmit={addComment} className="mt-4">
          <textarea disabled={!permissions.comment} value={comment} onChange={e=>setComment(e.target.value)} rows={3} placeholder="Write a comment..." className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none"/>
          <button type="submit" className="mt-2 h-9 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white">Comment</button>
        </form>
        <div className="mt-5 space-y-3">
          {activity.map((entry,i)=><div key={`${entry}-${i}`} className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-sm text-slate-700">{entry}</p><p className="mt-1 text-[11px] text-slate-400">Just now</p>
          </div>)}
        </div>
      </aside>
    </div>
  </div>;
}
