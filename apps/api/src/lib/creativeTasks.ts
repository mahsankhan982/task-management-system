import type { PoolClient } from 'pg';

const coreNames = new Set(['To Do','In Progress','Waiting for Review','Review','Waiting for Lead','For Posting','Completed']);
const creativeNames = new Set(['creative','creative board']);
type Stage = {id:number|string;board_id:number|string;name:string;is_system?:boolean;is_archived?:boolean};
type TaskRow = {board_id:number|string;stage_id:number|string;stage_name?:string;creative_list_id?:number|string|null;[key:string]:unknown};
type QueryClient = Pick<PoolClient,'query'>;

export function isCreativeList(stage: Stage) { return !stage.is_system && !coreNames.has(stage.name); }
export function isCreativeStatus(name: string) { return coreNames.has(name); }

export async function creativeContexts(client: QueryClient, boardIds: Array<number|string>) {
  const ids=[...new Set(boardIds.map(Number).filter(id=>Number.isSafeInteger(id)&&id>0))];
  const contexts=new Map<number,{stages:Stage[];rootId:number}>();
  if(!ids.length)return contexts;
  const boards=await client.query(`SELECT b.id,b.parent_board_id,b.name,parent.name AS parent_name
    FROM boards b LEFT JOIN boards parent ON parent.id=b.parent_board_id WHERE b.id=ANY($1::bigint[])`,[ids]);
  const creative=boards.rows.filter(board=>creativeNames.has(String(board.name).trim().toLowerCase()) || creativeNames.has(String(board.parent_name).trim().toLowerCase()));
  if(!creative.length)return contexts;
  const stages=await client.query('SELECT id,board_id,name,is_system,is_archived FROM workflow_stages WHERE board_id=ANY($1::bigint[])',[creative.map(board=>board.id)]);
  for(const board of creative)contexts.set(Number(board.id),{rootId:Number(board.parent_board_id??board.id),stages:stages.rows.filter(stage=>Number(stage.board_id)===Number(board.id))});
  return contexts;
}

export function creativeCategory(task: TaskRow, stages: Stage[]) {
  const linked=stages.find(stage=>Number(stage.id)===Number(task.creative_list_id)&&isCreativeList(stage));
  const legacy=stages.find(stage=>Number(stage.id)===Number(task.stage_id)&&isCreativeList(stage));
  return linked??legacy;
}

/** Read-only projection: original list IDs and task records remain intact. */
export async function creativeTaskViews<T extends TaskRow>(client: QueryClient, tasks: T[]): Promise<T[]> {
  const contexts=await creativeContexts(client,tasks.map(task=>task.board_id));
  return tasks.map(task=>{
    const context=contexts.get(Number(task.board_id));if(!context)return task;
    const category=creativeCategory(task,context.stages);
    const rawStage=context.stages.find(stage=>Number(stage.id)===Number(task.stage_id));
    const todo=context.stages.find(stage=>stage.name==='To Do'&&!stage.is_archived);
    const legacy=Boolean(rawStage&&isCreativeList(rawStage));
    return {...task,is_creative:true,creative_list_id:category?.id??null,
      ...(legacy&&todo?{stage_id:todo.id,stage_name:'To Do'}:{})};
  });
}
