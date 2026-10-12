import {ApiError,database,digest} from './auth';
import {references,examImport} from './reference-store';
import {checkExam} from './exam-check';
import type {Dataset,Student} from './model';
function gradeList(raw:unknown){if(!Array.isArray(raw)||!raw.length||raw.some(g=>!Number.isInteger(g)||g<1||g>6))throw new ApiError(400,'請選擇本次應考年級');return [...new Set<number>(raw)].sort();}
async function prepareCheck(event:string,rawGrades:unknown){
 const grades=gradeList(rawGrades),db=database();
 const e=await db.prepare('SELECT data,code_version,draft FROM exams WHERE id=?').bind(event).first<{data:string;code_version:number;draft:number}>();if(!e)throw new ApiError(404,'找不到考試');
 const refs=await references(),revisions={students:refs.students?.revision||0,locations:refs.locations?.revision||0};
 const data=JSON.parse(e.data) as Dataset;
 const report=checkExam(data,(refs.students?.data||[]) as Student[],grades);
 return {e,revisions,report:{...report,grades,version:e.code_version,token:await digest(JSON.stringify({event,data:e.data,version:e.code_version,revisions,grades}))}};
}
export async function preflight(b:any){if(typeof b.event!=='string')throw new ApiError(400,'請選擇考試');return (await prepareCheck(b.event,b.grades)).report;}
export async function openCheckedExam(b:any){
 const {e,revisions,report}=await prepareCheck(b.event,b.grades);
 if(!e.draft||e.code_version!==b.version)throw new ApiError(409,'考試資料已更新，請重新檢查');
 if(report.errors.length)throw new ApiError(400,'請先修正檢查列出的資料錯誤');
 if(b.checkToken!==report.token)throw new ApiError(409,'考試或年度資料已更新，請重新檢查');
 if(report.warnings.length&&b.acknowledgeWarnings!==true)throw new ApiError(400,'請核對並確認檢查提醒');
 const result=await database().prepare("UPDATE exams SET draft=0,code_version=code_version+1 WHERE id=? AND draft=1 AND code_version=? AND data=? AND COALESCE((SELECT revision FROM reference_data WHERE kind='students'),0)=? AND COALESCE((SELECT revision FROM reference_data WHERE kind='locations'),0)=?").bind(b.event,e.code_version,e.data,revisions.students,revisions.locations).run();
 if(!result.meta.changes)throw new ApiError(409,'資料剛被修改，請重新檢查');return {ok:true};
}
export async function duplicateExam(b:any){
 if(typeof b.source!=='string'||typeof b.title!=='string'||!b.title.trim()||b.title.trim().length>120||!b.dates||typeof b.dates!=='object'||Array.isArray(b.dates))throw new ApiError(400,'請填寫新考試名稱及日期');
 const source=await database().prepare('SELECT data,code_version FROM exams WHERE id=?').bind(b.source).first<{data:string;code_version:number}>();if(!source)throw new ApiError(404,'找不到來源考試');
 const fingerprint=await digest(source.data+'|'+source.code_version);
 if(b.commit&&b.sourceFingerprint!==fingerprint)throw new ApiError(409,'來源考程已更新，請重新預覽');
 const data=JSON.parse(source.data) as Dataset,dates=[...new Set(data.schedule.map(s=>s.date))].sort();
 if(Object.keys(b.dates).length!==dates.length||dates.some(d=>typeof b.dates[d]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.dates[d]))||new Set(dates.map(d=>b.dates[d])).size!==dates.length)throw new ApiError(400,'每個原考試日都需對應不同的新日期');
 const result=await examImport({kind:'schedule',createOnly:true,title:b.title,rows:data.schedule.map(s=>({...s,date:b.dates[s.date]})),commit:b.commit,generatedEvent:b.generatedEvent,references:b.references,version:b.version,copyGuard:{id:b.source,data:source.data,version:source.code_version}});
 return {...result,sourceFingerprint:fingerprint,dateMapping:dates.map(date=>({from:date,to:b.dates[date]})),warnings:[...result.warnings,'只複製考程，使用目前年度名單；應試安排與點名紀錄不會複製。']};
}
