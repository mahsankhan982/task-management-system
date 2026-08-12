"use client";
import{Inbox,LayoutDashboard,Mail,Maximize2,Minimize2,MoreHorizontal,Plus,X}from"lucide-react";
import type{ReactNode}from"react";
import{useEffect,useState}from"react";
import InboxTaskModal from "@/components/layout/inbox-task-modal";
import MobileNav from "@/components/layout/mobile-nav";
import Sidebar from"@/components/layout/sidebar";
import TopHeader from"@/components/layout/top-header";

const items=[
{id:1,title:"Review campaign brief",meta:"Marketing Board"},
{id:2,title:"Check homepage responsive changes",meta:"Web Development"},
{id:3,title:"Approve SEO keyword research",meta:"SEO Board"},
];

export default function DashboardShell({children}:{children:ReactNode}){
const[inboxOpen,setInboxOpen]=useState(false);
const[fullscreen,setFullscreen]=useState(false);
const[selectedInboxTask,setSelectedInboxTask]=useState<(typeof items)[number]|null>(null);

useEffect(()=>{
const sync=()=>setFullscreen(Boolean(document.fullscreenElement));
document.addEventListener("fullscreenchange",sync);
return()=>document.removeEventListener("fullscreenchange",sync);
},[]);

const toggleFullscreen=async()=>{
try{
if(document.fullscreenElement)await document.exitFullscreen();
else await document.documentElement.requestFullscreen();
}catch{}
};

return <div className="min-h-screen bg-[#f6f7fb]">
<TopHeader/>
<div className="flex h-[calc(100vh-4rem)] min-h-0 overflow-hidden">
<div className="hidden lg:block"><Sidebar/></div>

{inboxOpen&&<aside className="hidden h-full w-[290px] shrink-0 border-r border-blue-100 bg-[#eaf2ff] xl:flex xl:flex-col">
<div className="flex h-14 items-center justify-between border-b border-blue-100 px-4">
<div className="flex items-center gap-2"><Inbox size={18}/><span className="font-semibold text-slate-900">Inbox</span></div>
<div className="flex gap-1">
<button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/70"><MoreHorizontal size={17}/></button>
<button type="button" onClick={()=>setInboxOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/70"><X size={17}/></button>
</div>
</div>

<div className="p-3">
<button type="button" className="flex h-10 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm"><Plus size={16}/>Add a task</button>
</div>

<div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
{items.map(item=><button key={item.id} type="button" onClick={()=>setSelectedInboxTask(item)} className="w-full rounded-xl border border-blue-100 bg-white p-3 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md">
<div className="flex gap-3">
<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Mail size={15}/></div>
<div className="min-w-0"><p className="text-sm font-medium leading-5 text-slate-900">{item.title}</p><p className="mt-1 text-xs text-slate-400">{item.meta}</p></div>
</div>
</button>)}
</div>

<div className="border-t border-blue-100 p-3 text-xs leading-5 text-slate-500">
Tasks sent to Inbox can be reviewed before moving them to a board.
</div>
</aside>}

<main className="min-w-0 flex-1 overflow-auto pb-24 lg:pb-0">{children}</main>
</div>

<div className="pointer-events-none fixed bottom-4 left-1/2 z-[70] -translate-x-1/2">
<div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-xl backdrop-blur">
<button type="button" onClick={()=>setInboxOpen(true)} className={`flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium ${inboxOpen?"bg-blue-50 text-blue-600":"text-slate-600 hover:bg-slate-100"}`}><Inbox size={17}/>Inbox</button>
<button type="button" onClick={()=>setInboxOpen(false)} className={`flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium ${!inboxOpen?"bg-blue-50 text-blue-600":"text-slate-600 hover:bg-slate-100"}`}><LayoutDashboard size={17}/>Board</button>
<div className="mx-1 h-6 w-px bg-slate-200"/>
<button type="button" onClick={toggleFullscreen} className="flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-slate-600 hover:bg-slate-100">
{fullscreen?<Minimize2 size={17}/>:<Maximize2 size={17}/>}
{fullscreen?"Exit full screen":"Full screen"}
</button>
</div>
</div>
<InboxTaskModal key={selectedInboxTask?.id ?? "empty"} task={selectedInboxTask} onClose={()=>setSelectedInboxTask(null)} />
<MobileNav />
</div>;
}
