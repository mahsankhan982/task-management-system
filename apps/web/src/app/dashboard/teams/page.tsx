"use client";
import { Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, apiRequest } from "@/lib/api";
import { useRole } from "@/contexts/role-context";

type Role = "Manager" | "Coordinator" | "Team Lead" | "Team Member";
type Team = { id:number|string; name:string; description:string|null };
type User = { id:number|string; full_name:string; email:string; role:Role; team_id:number|string|null; is_active:boolean };
const roles:Role[]=["Manager","Coordinator","Team Lead","Team Member"];

export default function TeamsPage(){
  const { role }=useRole();
  const canManage=role==="Manager";
  const [teams,setTeams]=useState<Team[]>([]);
  const [users,setUsers]=useState<User[]>([]);
  const [selected,setSelected]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);

  async function load(){
    try{
      const [tr,ur]=await Promise.all([api.teams(),api.users()]) as [{data:Team[]},{data:User[]}];
      const t=tr.data??[]; setError(""); setTeams(t); setUsers(ur.data??[]);
      setSelected(v=>v&&t.some(x=>String(x.id)===v)?v:(t[0]?String(t[0].id):""));
    }catch(e){ setError(e instanceof Error?e.message:"Unable to load teams"); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{void Promise.resolve().then(()=>load());},[]);

  const team=useMemo(()=>teams.find(t=>String(t.id)===selected),[teams,selected]);
  const members=useMemo(()=>users.filter(u=>team&&String(u.team_id)===String(team.id)),[users,team]);

  async function action(fn:()=>Promise<void>){
    try{setError("");await fn();await load();}
    catch(e){setError(e instanceof Error?e.message:"Request failed");}
  }

  function addTeam(){
    const name=prompt("Team name:")?.trim(); if(!name)return;
    const description=prompt("Team description (optional):")?.trim()||null;
    action(async()=>{await apiRequest("/teams",{method:"POST",body:JSON.stringify({name,description})});});
  }

  function editTeam(t:Team){
    const name=prompt("Team name:",t.name)?.trim(); if(!name)return;
    const description=prompt("Description:",t.description||"")?.trim()||null;
    action(async()=>{await apiRequest(`/teams/${t.id}`,{method:"PATCH",body:JSON.stringify({name,description})});});
  }

  function removeTeam(t:Team){
    if(!confirm(`Delete ${t.name}?`))return;
    action(async()=>{await apiRequest(`/teams/${t.id}`,{method:"DELETE"});});
  }

  function addUser(){
    const full_name=prompt("Full name:")?.trim(); if(!full_name)return;
    const email=prompt("Email:")?.trim(); if(!email)return;
    const password=prompt("Temporary password (minimum 8 characters):")||""; if(password.length<8)return alert("Password must be at least 8 characters");
    const userRole=(prompt("Role: Manager, Coordinator, Team Lead, or Team Member","Team Member")||"Team Member") as Role;
    if(!roles.includes(userRole))return alert("Invalid role");
    const team_id=selected?Number(selected):null;
    action(async()=>{await apiRequest("/users",{method:"POST",body:JSON.stringify({full_name,email,password,role:userRole,team_id})});});
  }

  function editUser(u:User){
    const full_name=prompt("Full name:",u.full_name)?.trim(); if(!full_name)return;
    const email=prompt("Email:",u.email)?.trim(); if(!email)return;
    const userRole=(prompt("Role:",u.role)||u.role) as Role; if(!roles.includes(userRole))return alert("Invalid role");
    const teamText=prompt("Team ID (leave blank for no team):",u.team_id?String(u.team_id):"");
    const active=confirm("OK = Active, Cancel = Inactive");
    const password=prompt("New password (optional; leave blank to keep current):")||"";
    const body:Record<string,unknown>={full_name,email,role:userRole,team_id:teamText?Number(teamText):null,is_active:active};
    if(password){if(password.length<8)return alert("Password must be at least 8 characters");body.password=password;}
    action(async()=>{await apiRequest(`/users/${u.id}`,{method:"PATCH",body:JSON.stringify(body)});});
  }

  function removeUser(u:User){
    if(!confirm(`Delete ${u.full_name}?`))return;
    action(async()=>{await apiRequest(`/users/${u.id}`,{method:"DELETE"});});
  }

  if(loading)return <div className="p-8 text-sm text-slate-500">Loading teams...</div>;

  return <div className="min-h-full w-full bg-gradient-to-br from-[#64499a] via-[#a85dbd] to-[#d46bb6] p-5 md:p-8">
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-100">Team Management</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Teams & Members</h1>
        <p className="mt-2 text-sm text-white/80">Live workspace management from PostgreSQL.</p>
      </div>
      {canManage?<div className="flex gap-2">
        <button onClick={addTeam} className="flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"><Plus size={16}/>Add Team</button>
        <button onClick={addUser} className="flex h-10 items-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white"><UserPlus size={16}/>Add Member</button>
      </div>:null}
    </div>

    {error?<div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>:null}

    <div className="mb-6 grid gap-4 sm:grid-cols-3">
      <Stat n={teams.length} label="Teams"/><Stat n={users.length} label="Members"/><Stat n={users.filter(u=>u.is_active).length} label="Active members"/>
    </div>

    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <div className="rounded-2xl border bg-white p-3 shadow-sm">
        {teams.map(t=><button key={String(t.id)} onClick={()=>setSelected(String(t.id))} className={`mb-2 w-full rounded-xl p-4 text-left ${String(t.id)===selected?"bg-violet-700 text-white":"hover:bg-slate-50"}`}>
          <p className="font-semibold">{t.name}</p>
          <p className="mt-1 text-xs opacity-75">{users.filter(u=>String(u.team_id)===String(t.id)).length} members</p>
        </button>)}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="flex items-start justify-between border-b p-6">
          <div><h2 className="text-xl font-semibold">{team?.name||"No team selected"}</h2><p className="mt-1 text-sm text-slate-500">{team?.description||"No description added."}</p></div>
          {canManage&&team?<div className="flex gap-2">
            <button onClick={()=>editTeam(team)} className="rounded-lg border p-2"><Pencil size={15}/></button>
            <button onClick={()=>removeTeam(team)} className="rounded-lg border p-2 text-red-600"><Trash2 size={15}/></button>
          </div>:null}
        </div>

        <div className="divide-y">
          {members.length===0?<div className="p-8 text-sm text-slate-500">No members assigned to this team.</div>:null}
          {members.map(u=><div key={String(u.id)} className="flex items-center justify-between gap-4 p-5">
            <div><p className="font-semibold text-slate-900">{u.full_name}</p><p className="mt-1 text-sm text-slate-500">{u.email}</p></div>
            <div className="flex items-center gap-3">
              <div className="text-right"><p className="text-xs font-semibold text-violet-700">{u.role}</p><p className={`mt-1 text-xs ${u.is_active?"text-emerald-600":"text-slate-400"}`}>{u.is_active?"Active":"Inactive"}</p></div>
              {canManage?<div className="flex gap-1">
                <button onClick={()=>editUser(u)} className="rounded-lg border p-2"><Pencil size={14}/></button>
                <button onClick={()=>removeUser(u)} className="rounded-lg border p-2 text-red-600"><Trash2 size={14}/></button>
              </div>:null}
            </div>
          </div>)}
        </div>
      </div>
    </div>
  </div>;
}

function Stat({n,label}:{n:number;label:string}){
  return <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-3xl font-semibold">{n}</p><p className="mt-1 text-sm text-slate-500">{label}</p></div>;
}
