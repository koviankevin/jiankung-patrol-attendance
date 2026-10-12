import {ApiError,database,digest,type User} from './auth';
import {initialEntries,type Dataset} from './model';
export async function resetAttendance(b:any,user:User){
 const db=database();
 if(typeof b.event!=='string'||!['exam','session'].includes(b.scope)||typeof b.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(b.requestId)||!Number.isInteger(b.version)||!b.versions||typeof b.versions!=='object'||Array.isArray(b.versions))throw new ApiError(400,'重設資料格式無效');
 const e=await db.prepare('SELECT data,closed,draft,code_version,mutation_id FROM exams WHERE id=?').bind(b.event).first<{data:string;closed:number;draft:number;code_version:number;mutation_id:string}>();if(!e)throw new ApiError(404,'找不到考試');
 if(e.mutation_id===b.requestId)return {ok:true,replayed:true};
 if(e.closed||e.draft)throw new ApiError(409,'請先開放考試再重設');
 const d=JSON.parse(e.data) as Dataset,sid=b.scope==='session'?b.session:'';
 if(b.scope==='session'&&(!sid||!d.schedule.some(s=>s.id===sid&&s.kind==='考試')))throw new ApiError(400,'場次無效');
 const rows=await db.prepare('SELECT session_id,revision FROM boards WHERE exam_id=? AND (?=\'\' OR session_id=?)').bind(b.event,sid,sid).all<{session_id:string;revision:number}>();
 const versions=Object.fromEntries(rows.results.map(r=>[r.session_id,r.revision]));
 if(e.code_version!==b.version||Object.keys(b.versions).length!==rows.results.length||rows.results.some(r=>b.versions[r.session_id]!==r.revision))throw new ApiError(409,'點名資料已更新，請重新載入後再確認重設');
 if(!rows.results.length)return {ok:true,count:0};
 const now=new Date().toISOString(),nextVersion=e.code_version+1;
 // One transaction gates the entire reset on every selected board revision.
 const commands=[db.prepare(`UPDATE exams SET code_version=code_version+1,mutation_id=? WHERE id=? AND code_version=? AND closed=0 AND draft=0
  AND (SELECT COUNT(*) FROM boards WHERE exam_id=? AND (?='' OR session_id=?))=?
  AND NOT EXISTS(SELECT 1 FROM boards WHERE exam_id=? AND (?='' OR session_id=?) AND revision!=COALESCE((SELECT value FROM json_each(?) WHERE key=boards.session_id),-1))`)
  .bind(b.requestId,b.event,b.version,b.event,sid,sid,rows.results.length,b.event,sid,sid,JSON.stringify(versions))];
 const baselines=JSON.stringify(Object.fromEntries(rows.results.map(row=>[row.session_id,initialEntries(d,d.schedule.find(s=>s.id===row.session_id)!)])));
 commands.push(db.prepare("UPDATE boards SET revision=revision+1,entries=(SELECT value FROM json_each(?) WHERE key=boards.session_id),confirmed=0,actor=?,updated_at=?,request_id=?||':'||session_id WHERE exam_id=? AND (?='' OR session_id=?) AND request_id!=?||':'||session_id AND EXISTS(SELECT 1 FROM exams WHERE id=? AND code_version=? AND mutation_id=?)").bind(baselines,user.name,now,b.requestId,b.event,sid,sid,b.requestId,b.event,nextVersion,b.requestId));
 commands.push(db.prepare("INSERT OR IGNORE INTO audits(request_id,exam_id,session_id,revision,entries,actor,at,body_hash,principal,action) SELECT request_id,exam_id,session_id,revision,entries,actor,updated_at,?,?,'reset' FROM boards WHERE exam_id=? AND request_id=?||':'||session_id").bind(await digest(baselines),user.token_hash,b.event,b.requestId));
 const result=await db.batch(commands);if(!result[0].meta.changes){const replay=await db.prepare('SELECT id FROM exams WHERE id=? AND mutation_id=?').bind(b.event,b.requestId).first();if(replay)return {ok:true,replayed:true};throw new ApiError(409,'其他老師剛更新了點名，重設未套用，請重新載入');}return {ok:true,count:rows.results.length};
}
