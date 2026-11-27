
import { WorkflowEntrypoint } from "cloudflare:workers";
import { computeServerMatchBatch } from "./matcher.js";

const BATCH_SIZE = 12;
function decodePart(base64) {
  const binary=atob(base64),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}
async function readFrozenSnapshot(db,uploadId,totalParts) {
  const chunks=[];
  for(let offset=0;offset<totalParts;offset+=20){
    const batch=await db.prepare("SELECT part_index, data FROM app_state_uploads WHERE upload_id = ? ORDER BY part_index LIMIT 20 OFFSET ?").bind(uploadId,offset).all();
    chunks.push(...(batch.results||[]));
  }
  if(chunks.length!==totalParts||chunks.some((row,i)=>Number(row.part_index)!==i))throw Error("Matching input snapshot is incomplete");
  const segments=chunks.map(x=>decodePart(x.data)),total=segments.reduce((n,x)=>n+x.length,0);
  const output=new Uint8Array(total);let offset=0;for(const segment of segments){output.set(segment,offset);offset+=segment.length}
  return JSON.parse(new TextDecoder().decode(output));
}

/**
 * Each step stores a batch of results and its remaining-invoice ledger in the
 * same D1 batch. Replays therefore do not double-allocate invoice quantities.
 * All inputs are pinned to the upload ID captured at job creation time.
 */
export class MatchWorkflow extends WorkflowEntrypoint {
  async run(event,step) {
    const {jobId,baseHash,uploadId,totalParts}=event.payload;
    const db=this.env.DB;
    try{
      const count=await step.do("validate frozen snapshot",async()=>{
        const snapshot=await readFrozenSnapshot(db,uploadId,totalParts);
        if(!Array.isArray(snapshot.imed)||!Array.isArray(snapshot.sepidar)||!Array.isArray(snapshot.virtualInventory)||!snapshot.allocations||typeof snapshot.allocations!=='object')throw Error("Matching input has invalid tables");
        if(snapshot.imed.length>10000)throw Error("Too many IMED documents in one matching job");
        await db.prepare("UPDATE match_server_jobs SET total=?,status='running',updated_at=CURRENT_TIMESTAMP WHERE id=? AND base_hash=?").bind(snapshot.imed.length,jobId,baseHash).run();
        return snapshot.imed.length;
      });
      for(let start=0;start<count;start+=BATCH_SIZE){
        const end=Math.min(count,start+BATCH_SIZE);
        await step.do("match documents "+start+"-"+end,{retries:{limit:3,delay:"5 seconds",backoff:"linear"}},async()=>{
          const checkpoint=await db.prepare("SELECT next_index, free_json FROM match_server_checkpoints WHERE job_id = ?").bind(jobId).first();
          const nextIndex=Number(checkpoint?.next_index||0);
          if(nextIndex>=end)return {completed:nextIndex,replayed:true};
          if(nextIndex!==start)throw Error("Matching batch checkpoint has unexpected offset: "+nextIndex+" != "+start);
          const snapshot=await readFrozenSnapshot(db,uploadId,totalParts);
          const freeLedger=checkpoint?.free_json?JSON.parse(checkpoint.free_json):null;
          const result=computeServerMatchBatch(snapshot,{start,end,freeLedger});
          const commands=result.rows.map((row,i)=>db.prepare("INSERT INTO match_server_results (job_id,row_index,result_json) VALUES (?,?,?) ON CONFLICT(job_id,row_index) DO UPDATE SET result_json=excluded.result_json").bind(jobId,start+i,JSON.stringify(row)));
          commands.push(db.prepare("INSERT INTO match_server_checkpoints (job_id,next_index,free_json) VALUES (?,?,?) ON CONFLICT(job_id) DO UPDATE SET next_index=excluded.next_index,free_json=excluded.free_json").bind(jobId,end,JSON.stringify(result.freeById)));
          commands.push(db.prepare("UPDATE match_server_jobs SET completed=?,percent=?,status='running',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(end,count?Math.round(end/count*100):100,jobId));
          await db.batch(commands);
          return {completed:end,replayed:false};
        });
      }
      await step.do("complete matching job",async()=>{
        const recorded=await db.prepare("SELECT COUNT(*) AS c FROM match_server_results WHERE job_id = ?").bind(jobId).first();
        if(Number(recorded?.c)!==count)throw Error("Matching result count mismatch");
        await db.prepare("UPDATE match_server_jobs SET status='completed',completed=?,percent=100,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(count,jobId).run();
      });
      return {completed:count,baseHash};
    }catch(error){
      try{await db.prepare("UPDATE match_server_jobs SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(String(error?.message||error).slice(0,500),jobId).run()}catch(_){}
      throw error;
    }
  }
}
