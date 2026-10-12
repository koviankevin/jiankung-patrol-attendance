import {validateDataset,type Dataset,type Student} from './model.ts';
export const gradeNames=['國一','國二','國三','高一','高二','高三'];
export function checkExam(data:Dataset,annual:Student[],grades:number[]){
 const errors:string[]=[],warnings:string[]=[],notes:string[]=[];
 try{validateDataset(data);}catch(e){errors.push((e as Error).message);}
 const students=new Map(data.students.map(s=>[s.id,s])),sessions=new Map(data.schedule.map(s=>[s.id,s]));
 const places=new Map(data.locations.map(l=>[l.name,l]));
 const classGrades=new Map([...annual,...data.students].map(s=>[s.classroom,s.grade]));
 const ranges=new Map<string,typeof data.schedule>();
 for(const s of data.schedule){const key=s.date+'|'+s.classroom;ranges.set(key,[...(ranges.get(key)||[]),s]);}
 for(const rows of ranges.values()){rows.sort((a,b)=>a.start.localeCompare(b.start));for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length&&rows[j].start<rows[i].end;j++)errors.push(`${rows[i].date} ${rows[i].classroom}班：${rows[i].subject}與${rows[j].subject}時間重疊`);}
 const seen=new Set<string>();
 for(const a of data.arrangements){const student=students.get(a.id),session=sessions.get(a.session),key=a.id+'|'+a.session;
  if(!student)errors.push(`應試安排找不到學號 ${a.id}`);
  if(!session)errors.push(`應試安排找不到場次 ${a.session}`);
  if(student&&session&&(student.classroom!==session.classroom||session.kind!=='考試'))errors.push(`${a.id} 的應試安排與 ${a.session} 班級或類型不符`);
  if(seen.has(key))errors.push(`${a.id} 在 ${a.session} 的安排重複`);seen.add(key);
  if(a.arrangement==='抽離'&&!places.has(a.location))errors.push(`${a.id} 的抽離地點未建立`);
 }
 const summary=grades.map(grade=>{
  const expected=[...new Set([...annual,...data.students].filter(s=>s.grade===grade).map(s=>s.classroom))].sort();
  const rows=data.schedule.filter(s=>classGrades.get(s.classroom)===grade),scheduled=new Set(rows.map(s=>s.classroom));
  const missing=expected.filter(c=>!scheduled.has(c));if(missing.length)warnings.push(`${gradeNames[grade-1]}缺少考程：${missing.join('、')}班`);
  if(!expected.length)warnings.push(`${gradeNames[grade-1]}沒有可供核對的學生名單`);
  for(const date of new Set(rows.map(s=>s.date))){const absent=expected.filter(c=>scheduled.has(c)&&!rows.some(s=>s.date===date&&s.classroom===c));if(absent.length)warnings.push(`${date} ${gradeNames[grade-1]}未排考程：${absent.join('、')}班`);}
  return {grade,expected:expected.length,scheduled:scheduled.size,exams:rows.filter(s=>s.kind==='考試').length,study:rows.filter(s=>s.kind==='自習').length};
 });
 const outside=[...new Set(data.schedule.map(s=>classGrades.get(s.classroom)).filter((g):g is number=>!!g&&!grades.includes(g)))];if(outside.length)warnings.push(`考程另包含未勾選年級：${outside.map(g=>gradeNames[g-1]).join('、')}`);
 const used=new Set([...data.schedule.map(s=>s.classroom),...data.arrangements.filter(a=>a.location).map(a=>a.location)]);
 const unknown=[...used].filter(name=>!places.has(name)||places.get(name)?.floor===null);if(unknown.length)warnings.push(`位置或樓層待核對：${unknown.join('、')}`);
 if(!data.arrangements.length)notes.push('未設定特殊應試安排；請確認本次確實沒有抽離或免到考學生。');
 notes.push('缺班提醒依勾選年級的年度名單核對；各科是否安排正確，仍請對照核定考程。');
 return {errors:[...new Set(errors)],warnings:[...new Set(warnings)],notes,summary,students:data.students.length,arrangements:data.arrangements.length};
}
