import { ApiError,adminCredential,authenticate,cookie,database,digest,examAccess,limited,passwordHash,randomToken,requireAdmin,sameOrigin,verify,type User } from '@/lib/auth';
import { confirmEntries,initialEntries,validateDataset,type Dataset,type Entries } from '@/lib/model';
import {corrected,referenceRequest,examImport,renameExam} from '@/lib/reference-store';
import {resetAttendance} from '@/lib/reset-attendance';
export const dynamic='force-dynamic';
type Exam={id:string;title:string;data:string;closed:number;draft:number;reference_info:string;code_hash:string;code_version:number;created_at:string};
type Board={exam_id:string;session_id:string;revision:number;confirmed:number;entries:string;actor:string;updated_at:string;request_id:string};
function json(value:unknown,status=200,headers:Record<string,string>={}){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
async function getExam(id:string){const e=await database().prepare('SELECT * FROM exams WHERE id=?').bind(id).first<Exam>();if(!e)throw new ApiError(404,'找不到這次考試');return e;}
async function body(req:Request){if(Number(req.headers.get('content-length')||0)>2500000)throw new ApiError(413,'資料太大');const text=await req.text();if(text.length>2500000)throw new ApiError(413,'資料太大');try{return JSON.parse(text);}catch{throw new ApiError(400,'資料格式不正確');}}
async function handle(req:Request,parts:string[]){
 const db=database(),p=parts.join('/'),url=new URL(req.url);
 // Consume each submitted body before returning permission or state errors.
 // This also keeps the preview transport usable after a rejected submission.
 const submitted=req.method==='POST'?await body(req):null;
 if(req.method==='POST')sameOrigin(req);
 if(p==='bootstrap'&&req.method==='GET'){
  const user=await authenticate(req,true);const events=await db.prepare(user?.role==='admin'?'SELECT id,title,closed,draft FROM exams ORDER BY created_at DESC':'SELECT id,title,closed,draft FROM exams WHERE closed=0 AND draft=0 ORDER BY created_at DESC').all();
  return json({user:user?{role:user.role,name:user.name,event:user.exam_id}:null,events:events.results});
 }
 if(p==='login'&&req.method==='POST'){
  const b=submitted;await limited(req,b.role==='admin');
  let role='teacher',name='',eid:null|string=null,version=0,seconds=43200;
  if(b.role==='admin'){
   if(typeof b.password!=='string'||!b.password||b.password.length>200)throw new ApiError(400,'請輸入管理密碼');
   const credential=await adminCredential();
   if(!await verify(b.password,credential.password_hash))throw new ApiError(401,'管理密碼不正確');
   role='admin';name='管理者';version=credential.revision;seconds=14400;
  }else{
   if(typeof b.event!=='string'||typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>30)throw new ApiError(400,'請選擇考試並填寫老師姓名');
   const e=await db.prepare('SELECT * FROM exams WHERE id=? AND closed=0 AND draft=0').bind(b.event).first<Exam>();
   if(!e)throw new ApiError(403,'此考試尚未開放或已結案');
   eid=e.id;version=e.code_version;name=b.name.trim();
  }
  const token=randomToken();await db.batch([
   db.prepare('DELETE FROM auth_sessions WHERE expires<?').bind(Date.now()),
   db.prepare('DELETE FROM login_attempts WHERE until<?').bind(Date.now()),
   db.prepare('INSERT INTO auth_sessions(token_hash,role,name,exam_id,code_version,expires) VALUES(?,?,?,?,?,?)').bind(await digest(token),role,name,eid,version,Date.now()+seconds*1000)
  ]);return json({ok:true},200,{'Set-Cookie':cookie(req,token,seconds)});
 }
 const user=(await authenticate(req)) as User;
 if(p==='references'){requireAdmin(user);return json(await referenceRequest(req.method,submitted));}
 if(p==='exam/import'&&req.method==='POST'){requireAdmin(user);return json(await examImport(submitted));}
 if(p==='exam/name'&&req.method==='POST'){requireAdmin(user);return json(await renameExam(submitted));}
 if(p==='reset'&&req.method==='POST'){requireAdmin(user);return json(await resetAttendance(submitted,user));}
 if(p==='exam/data'&&req.method==='GET'){requireAdmin(user);const e=await getExam(url.searchParams.get('event')||'');return json({data:await corrected(JSON.parse(e.data)),draft:!!e.draft,version:e.code_version,references:JSON.parse(e.reference_info)});}
 if(p==='logout'&&req.method==='POST'){await db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(user.token_hash).run();return json({ok:true},200,{'Set-Cookie':cookie(req,'',0)});}
 if(p==='admin/password'&&req.method==='POST'){
  requireAdmin(user);await limited(req,true);const b=submitted;
  if(typeof b.currentPassword!=='string'||!b.currentPassword||b.currentPassword.length>200)throw new ApiError(400,'請輸入目前管理密碼');
  if(typeof b.newPassword!=='string'||b.newPassword.length<4||b.newPassword.length>200||!b.newPassword.trim())throw new ApiError(400,'新密碼需4至200個字元');
  if(b.newPassword!==b.confirmPassword)throw new ApiError(400,'兩次輸入的新密碼不一致');
  const credential=await adminCredential();
  if(!await verify(b.currentPassword,credential.password_hash))throw new ApiError(400,'目前管理密碼不正確');
  if(b.newPassword===b.currentPassword)throw new ApiError(400,'新密碼需與目前密碼不同');
  const hash=await passwordHash(b.newPassword);
  // Compare revisions so concurrent password changes cannot overwrite each other.
  const results=await db.batch([
   db.prepare("INSERT INTO admin_credentials(id,password_hash,revision,updated_at) VALUES('admin',?,?,?) ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash,revision=excluded.revision,updated_at=excluded.updated_at WHERE admin_credentials.revision=?")
    .bind(hash,credential.revision+1,new Date().toISOString(),credential.revision),
   db.prepare("DELETE FROM auth_sessions WHERE role='admin' AND code_version<(SELECT revision FROM admin_credentials WHERE id='admin')")
  ]);
  if(!results[0].meta.changes)throw new ApiError(409,'管理密碼已被更新，請使用最新密碼重新登入');
  return json({ok:true},200,{'Set-Cookie':cookie(req,'',0)});
 }
 if(p==='import'&&req.method==='POST'){
  requireAdmin(user);const b=submitted;let result;try{result=validateDataset(b.data);}catch(e){throw new ApiError(400,(e as Error).message);}
  const existing=await db.prepare('SELECT id,closed FROM exams WHERE id=?').bind(result.data.event).first();
  const started=await db.prepare('SELECT COUNT(*) AS n FROM boards WHERE exam_id=?').bind(result.data.event).first<{n:number}>();
  if(existing&&(started?.n||existing.closed))throw new ApiError(409,'此考試已點名或結案，無法取代名冊與考程');
  const summary={event:result.data.event,title:result.data.schedule[0].title,students:result.data.students.length,classes:new Set(result.data.students.map(s=>s.classroom)).size,sessions:result.data.schedule.filter(s=>s.kind==='考試').length,arrangements:result.data.arrangements.length,warnings:result.warnings,replacing:!!existing};
  if(!b.commit)return json(summary);
  const data=JSON.stringify(result.data);
  const saved=await db.prepare('INSERT INTO exams(id,title,data,code_hash,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,data=excluded.data,code_hash=excluded.code_hash,code_version=exams.code_version+1 WHERE exams.closed=0 AND NOT EXISTS(SELECT 1 FROM boards WHERE exam_id=exams.id)').bind(result.data.event,summary.title,data,'',new Date().toISOString()).run();
  if(!saved.meta.changes)throw new ApiError(409,'其他人已開始點名，匯入未套用');return json({...summary,ok:true});
 }
 if(p==='settings'&&req.method==='POST'){
  requireAdmin(user);const b=submitted;if(typeof b.event!=='string')throw new ApiError(400,'請選考試');await getExam(b.event);
  if(b.action==='open'){
   const result=await db.prepare('UPDATE exams SET draft=0,code_version=code_version+1 WHERE id=? AND draft=1 AND code_version=?').bind(b.event,b.version).run();
   if(!result.meta.changes)throw new ApiError(409,'考試資料已更新，請重新載入確認');
  }else if(b.action==='close'||b.action==='reopen')await db.prepare('UPDATE exams SET closed=?,code_version=code_version+1 WHERE id=? AND draft=0').bind(b.action==='close'?1:0,b.event).run();
  else throw new ApiError(400,'未知操作');return json({ok:true});
 }
 const event=url.searchParams.get('event')||'';examAccess(user,event);const e=await getExam(event),data=await corrected(JSON.parse(e.data) as Dataset);
 if(p==='dashboard'&&req.method==='GET'){
  const rows=await db.prepare('SELECT session_id,revision,confirmed,entries,actor,updated_at FROM boards WHERE exam_id=?').bind(event).all<Board>();
  const progress=Object.fromEntries(rows.results.filter(b=>b.confirmed).map(b=>[b.session_id,{revision:b.revision,actor:b.actor,updatedAt:b.updated_at,counts:Object.values(JSON.parse(b.entries) as Entries).reduce((a,x)=>({...a,[x.status]:(a[x.status]||0)+1}),{} as Record<string,number>)}]));
  const counts=Object.fromEntries([...new Set(data.students.map(s=>s.classroom))].map(c=>[c,data.students.filter(s=>s.classroom===c).length]));
  return json({event:e.id,title:e.title,closed:!!e.closed,draft:!!e.draft,version:e.code_version,versions:Object.fromEntries(rows.results.map(b=>[b.session_id,b.revision])),grades:Object.fromEntries(data.students.map(s=>[s.classroom,s.grade])),schedule:data.schedule,locations:data.locations,counts,progress});
 }
 const sid=url.searchParams.get('session')||'',ses=data.schedule.find(s=>s.id===sid);
 if(p==='board'&&req.method==='GET'){
  if(!ses||ses.kind!=='考試')throw new ApiError(404,'此時段不需點名');
  const b=await db.prepare('SELECT * FROM boards WHERE exam_id=? AND session_id=?').bind(event,sid).first<Board>();
  return json({session:ses,closed:!!e.closed||!!e.draft,confirmed:!!b?.confirmed,students:data.students.filter(s=>s.classroom===ses.classroom).sort((a,b)=>a.seat-b.seat),arrangements:data.arrangements.filter(a=>a.session===sid),entries:b?JSON.parse(b.entries):initialEntries(data,ses),revision:b?.revision||0,actor:b?.actor||'',updatedAt:b?.updated_at||''});
 }
 if(p==='board'&&req.method==='POST'){
  if(!ses||ses.kind!=='考試')throw new ApiError(404,'此時段不需點名');if(e.closed||e.draft)throw new ApiError(409,'考試尚未開放或已結案');
  const b=submitted;if(!Number.isInteger(b.revision)||b.revision<0||typeof b.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(b.requestId))throw new ApiError(400,'提交版本無效');
  const previous=await db.prepare('SELECT entries FROM boards WHERE exam_id=? AND session_id=?').bind(event,sid).first<{entries:string}>();
  let entries:Entries;try{entries=confirmEntries(data,ses,b.entries,previous?JSON.parse(previous.entries):undefined);}catch(err){throw new ApiError(400,(err as Error).message);}
  const payload=JSON.stringify(entries),hash=await digest(JSON.stringify([event,sid,b.revision,entries])),now=new Date().toISOString();
  const prior=await db.prepare('SELECT revision,body_hash,principal FROM audits WHERE request_id=?').bind(b.requestId).first<{revision:number;body_hash:string;principal:string}>();
  if(prior){if(prior.body_hash!==hash||prior.principal!==user.token_hash)throw new ApiError(409,'提交識別碼已被使用');return json({ok:true,revision:prior.revision,replayed:true});}
  await db.batch([
   db.prepare(`INSERT INTO boards(exam_id,session_id,revision,entries,actor,updated_at,request_id)
    SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM exams WHERE id=? AND closed=0 AND draft=0 AND code_version=? AND (?='admin' OR code_version=?))
    AND (?=0 OR EXISTS(SELECT 1 FROM boards WHERE exam_id=? AND session_id=? AND revision=?))
    AND NOT EXISTS(SELECT 1 FROM audits WHERE request_id=?)
    ON CONFLICT(exam_id,session_id) DO UPDATE SET revision=excluded.revision,entries=excluded.entries,confirmed=1,actor=excluded.actor,updated_at=excluded.updated_at,request_id=excluded.request_id WHERE boards.revision=?`)
    .bind(event,sid,b.revision+1,payload,user.name,now,b.requestId,event,e.code_version,user.role,user.code_version,b.revision,event,sid,b.revision,b.requestId,b.revision),
   db.prepare(`INSERT OR IGNORE INTO audits(request_id,exam_id,session_id,revision,entries,actor,at,body_hash,principal) SELECT request_id,exam_id,session_id,revision,entries,actor,updated_at,?,? FROM boards WHERE exam_id=? AND session_id=? AND request_id=?`)
    .bind(hash,user.token_hash,event,sid,b.requestId)
  ]);
  const saved=await db.prepare('SELECT revision,body_hash,principal FROM audits WHERE request_id=?').bind(b.requestId).first<{revision:number;body_hash:string;principal:string}>();
  if(!saved||saved.body_hash!==hash||saved.principal!==user.token_hash)throw new ApiError(409,'資料已被其他老師更新，或考試已鎖定。請保留修改內容並重新載入核對。');
  return json({ok:true,revision:saved.revision,updatedAt:now,actor:user.name});
 }
 if(p==='history'&&req.method==='GET'){
  requireAdmin(user);const rows=await db.prepare('SELECT revision,entries,actor,at,action FROM audits WHERE exam_id=? AND session_id=? ORDER BY revision DESC LIMIT 50').bind(event,sid).all();return json({history:rows.results.map(r=>({...r,entries:JSON.parse(r.entries as string)}))});
 }
 if(p==='export'&&req.method==='GET'){
  requireAdmin(user);
  // D1 batch supplies a consistent snapshot of both the immutable exam and attendance.
  const snap=await db.batch([db.prepare('SELECT data FROM exams WHERE id=?').bind(event),db.prepare('SELECT session_id,entries,revision,confirmed,actor,updated_at FROM boards WHERE exam_id=?').bind(event)]);
  return json({data:await corrected(JSON.parse((snap[0].results[0] as {data:string}).data)),boards:(snap[1].results as Board[]).map(r=>({...r,entries:JSON.parse(r.entries as string)})),exportedAt:new Date().toISOString()});
 }
 throw new ApiError(404,'找不到此操作');
}
async function route(req:Request,ctx:{params:Promise<{path:string[]}>}){try{return await handle(req,(await ctx.params).path);}catch(e){if(e instanceof ApiError)return json({error:e.message},e.status);console.error('patrol_request_failed',e instanceof Error?e.message:'unknown');return json({error:'操作未完成，請稍後重試；目前畫面的修改仍保留。'},500);}}
export const GET=route;export const POST=route;



