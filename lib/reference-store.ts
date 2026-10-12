import {ApiError,database} from './auth';
import {validateDataset,validateStudents,validateLocations,withReferenceCorrections,type Dataset,type Student,type Location,type ExamSession} from './model';
export type ReferenceKind='students'|'locations';
export type ReferenceRow={kind:ReferenceKind;year:string;data:string;revision:number;updated_at:string};
export async function references(){const r=await database().prepare('SELECT * FROM reference_data').all<ReferenceRow>();return Object.fromEntries(r.results.map(x=>[x.kind,{...x,data:JSON.parse(x.data)}])) as Partial<Record<ReferenceKind,Omit<ReferenceRow,'data'>&{data:Student[]|Location[]}>>;}
export async function corrected(data:Dataset){const r=await references();return withReferenceCorrections(data,r.students?.data as Student[],r.locations?.data as Location[]);}
export async function renameExam(b:any){
 if(typeof b.event!=='string'||typeof b.title!=='string'||!b.title.trim()||b.title.trim().length>120||typeof b.previousTitle!=='string'||!Number.isInteger(b.version))throw new ApiError(400,'請填寫120字以內的考試名稱');
 const db=database(),e=await db.prepare('SELECT title,data,code_version FROM exams WHERE id=?').bind(b.event).first<{title:string;data:string;code_version:number}>();
 if(!e)throw new ApiError(404,'找不到考試');
 if(e.title!==b.previousTitle||e.code_version!==b.version)throw new ApiError(409,'考試資料已更新，請重新載入後再修改名稱');
 const title=b.title.trim();if(title===e.title)return {ok:true,title};
 const data=JSON.parse(e.data) as Dataset;data.schedule=data.schedule.map(s=>({...s,title}));
 // Keep active teacher sessions and attendance when correcting this descriptive field.
 const result=await db.prepare('UPDATE exams SET title=?,data=? WHERE id=? AND title=? AND code_version=? AND data=?').bind(title,JSON.stringify(data),b.event,e.title,e.code_version,e.data).run();
 if(!result.meta.changes)throw new ApiError(409,'考試資料已更新，請重新載入後再修改名稱');
 return {ok:true,title};
}
export function validateReference(kind:ReferenceKind,rows:unknown){try{return kind==='students'?{data:validateStudents(rows),warnings:[]}:validateLocations(rows);}catch(e){throw new ApiError(400,(e as Error).message);}}
export async function referenceRequest(method:string,b:any){
 const db=database();
 if(method==='GET')return references();
 if(b.action==='adopt'){
  if(typeof b.event!=='string'||!/^\d{2,3}$/.test(b.year))throw new ApiError(400,'請選擇考試及學年度');
  const e=await db.prepare('SELECT data FROM exams WHERE id=?').bind(b.event).first<{data:string}>();if(!e)throw new ApiError(404,'找不到考試');
  const d=JSON.parse(e.data) as Dataset;
  await db.batch((['students','locations'] as const).map(kind=>db.prepare('INSERT OR IGNORE INTO reference_data(kind,year,data,revision,updated_at) VALUES(?,?,?,1,?)').bind(kind,b.year,JSON.stringify(d[kind]),new Date().toISOString())));
  return {ok:true};
 }
 if(!['students','locations'].includes(b.kind)||!/^\d{2,3}$/.test(b.year)||!Number.isInteger(b.revision)||b.revision<0)throw new ApiError(400,'資料類別、學年度或版本無效');
 const kind=b.kind as ReferenceKind,existing=(await references())[kind];
 if((existing?.revision||0)!==b.revision)throw new ApiError(409,'年度資料已更新，請重新載入');
 let rows=b.rows;
 if(b.action==='edit'){
  if(!existing)throw new ApiError(404,'請先匯入年度資料');
  let found=false;
  rows=existing.data.map(row=>{
   if(kind==='students'){const s=row as Student;if(s.id!==b.id)return s;found=true;return {...s,name:b.patch?.name};}
   const l=row as Location;if(l.code!==b.id)return l;found=true;return {...l,floor:b.patch?.floor,description:b.patch?.description,status:b.patch?.status};
  });if(!found)throw new ApiError(404,'找不到此筆資料');
 }
 const result=validateReference(kind,rows);if(!result.data.length)throw new ApiError(400,'年度資料不能為空');
 if(!b.commit)return {count:result.data.length,warnings:result.warnings,revision:b.revision};
 const saved=await db.prepare('INSERT INTO reference_data(kind,year,data,revision,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(kind) DO UPDATE SET year=excluded.year,data=excluded.data,revision=excluded.revision,updated_at=excluded.updated_at WHERE reference_data.revision=?').bind(kind,b.year,JSON.stringify(result.data),b.revision+1,new Date().toISOString(),b.revision).run();
 if(!saved.meta.changes)throw new ApiError(409,'年度資料已更新，請重新載入');return {ok:true};
}
export async function examImport(b:any){
 const db=database();
 if(b.kind==='schedule'){
  const refs=await references();if(!refs.students||!refs.locations)throw new ApiError(400,'請先匯入學生名單與教室配置');
  if(refs.students.year!==refs.locations.year)throw new ApiError(400,'學生名單與教室配置的學年度不同，請先核對');
  if(!Array.isArray(b.rows)||!b.rows.length)throw new ApiError(400,'考程不可空白');
  let rows=b.rows;
  if(b.createOnly&&b.title!==undefined){
   if(typeof b.title!=='string'||!b.title.trim()||b.title.trim().length>120)throw new ApiError(400,'請填寫120字以內的考試名稱');
   if(b.commit&&(typeof b.generatedEvent!=='string'||!/^EXAM-[a-f0-9-]{36}$/.test(b.generatedEvent)))throw new ApiError(400,'請先預覽考程再建立考試');
   const event=b.commit?b.generatedEvent:'EXAM-'+crypto.randomUUID();
   rows=rows.map((s:ExamSession)=>({...s,event,title:b.title.trim()}));
  }else if(b.targetEvent!==undefined){
   const target=await db.prepare('SELECT title FROM exams WHERE id=?').bind(b.targetEvent).first<{title:string}>();
   if(!target)throw new ApiError(409,'找不到目前管理的考試，請重新選擇');
   if(rows.some((s:ExamSession)=>s.event&&s.event!==b.targetEvent))throw new ApiError(409,'檔案考試代碼與目前管理考試不同，請確認檔案。');
   rows=rows.map((s:ExamSession)=>({...s,event:b.targetEvent,title:target.title}));
  }
  const info={students:{year:refs.students.year,revision:refs.students.revision},locations:{year:refs.locations.year,revision:refs.locations.revision}};
  const classes=new Set(rows.map((s:ExamSession)=>s.classroom));
  let result;try{result=validateDataset({version:'1.0',event:rows[0].event,students:(refs.students.data as Student[]).filter(s=>classes.has(s.classroom)),locations:refs.locations.data,schedule:rows,arrangements:[]});}catch(e){throw new ApiError(400,(e as Error).message);}
  const d=result.data,existing=await db.prepare('SELECT id,draft,code_version FROM exams WHERE id=?').bind(d.event).first<{id:string;draft:number;code_version:number}>();
  if(b.createOnly&&existing)throw new ApiError(409,'此考試代碼已存在。新增考試請使用新的考試代碼；若要修改既有考試，請回到「目前管理考試」。');
  if(b.targetEvent!==undefined&&(b.targetEvent!==d.event||!existing))throw new ApiError(409,'檔案的考試代碼與目前管理考試不同。請選擇正確的考試；建立新考試請使用「新增考試」。');
  if(existing&&!existing.draft)throw new ApiError(409,'此考試已開放；新的考試請使用新代碼');
  const summary={event:d.event,title:d.schedule[0].title,count:d.schedule.length,students:d.students.length,classes:classes.size,warnings:[...(existing?['將取代準備中的考程並清空本次應試安排，請重新匯入安排後再開放。']:[]),...result.warnings],references:info,version:existing?.code_version||0};
  if(!b.commit)return summary;
  if(JSON.stringify(b.references)!==JSON.stringify(info))throw new ApiError(409,'年度資料已更新，請重新預覽考程');
  if((b.version||0)!==summary.version)throw new ApiError(409,'考程已更新，請重新預覽');
  const saved=await db.prepare("INSERT INTO exams(id,title,data,code_hash,created_at,draft,reference_info) SELECT ?,?,?,'',?,1,? WHERE EXISTS(SELECT 1 FROM reference_data WHERE kind='students' AND revision=?) AND EXISTS(SELECT 1 FROM reference_data WHERE kind='locations' AND revision=?) AND (?='' OR EXISTS(SELECT 1 FROM exams WHERE id=? AND data=? AND code_version=?)) ON CONFLICT(id) DO UPDATE SET title=excluded.title,data=excluded.data,reference_info=excluded.reference_info,code_version=exams.code_version+1 WHERE ?=0 AND exams.draft=1 AND exams.code_version=? AND NOT EXISTS(SELECT 1 FROM boards WHERE exam_id=exams.id)").bind(d.event,summary.title,JSON.stringify(d),new Date().toISOString(),JSON.stringify(info),refs.students.revision,refs.locations.revision,b.copyGuard?.id||'',b.copyGuard?.id||'',b.copyGuard?.data||'',b.copyGuard?.version||0,b.createOnly?1:0,summary.version).run();
  if(!saved.meta.changes)throw new ApiError(409,'考試或年度資料已被更新，請重新預覽');return {...summary,ok:true};
 }
 if(b.kind==='arrangements'){
  const e=await db.prepare('SELECT data,draft,code_version FROM exams WHERE id=?').bind(b.event).first<{data:string;draft:number;code_version:number}>();if(!e)throw new ApiError(404,'找不到考試');
  if(!e.draft)throw new ApiError(409,'應試安排只可在考試準備期間匯入');
  let result;try{result=validateDataset({...JSON.parse(e.data),arrangements:b.rows});}catch(error){throw new ApiError(400,(error as Error).message);}
  const summary={event:b.event,count:result.data.arrangements.length,version:e.code_version,warnings:result.warnings};if(!b.commit)return summary;
  if(b.version!==e.code_version)throw new ApiError(409,'考試資料已更新，請重新預覽');
  const saved=await db.prepare('UPDATE exams SET data=?,code_version=code_version+1 WHERE id=? AND draft=1 AND code_version=? AND NOT EXISTS(SELECT 1 FROM boards WHERE exam_id=exams.id)').bind(JSON.stringify(result.data),b.event,b.version).run();
  if(!saved.meta.changes)throw new ApiError(409,'考試已開放或資料已變更');return {...summary,ok:true};
 }
 throw new ApiError(400,'匯入類別無效');
}
