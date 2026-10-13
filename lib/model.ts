export type Student={id:string;name:string;grade:number;classroom:string;seat:number};
export type ExamSession={id:string;event:string;title:string;date:string;classroom:string;period:string;start:string;end:string;kind:'考試'|'自習';subject:string};
export type Arrangement={id:string;session:string;arrangement:'原班'|'抽離'|'免到考';location:string};
export type Location={code:string;name:string;floor:number|null;description:string;status:string};
export type Dataset={version:string;event:string;students:Student[];schedule:ExamSession[];arrangements:Arrangement[];locations:Location[]};
export const STATUSES=['出席','缺席','抽離'] as const;
export type Status=typeof STATUSES[number]|'未點名'|'免到考'|'遲到'|'請假';
export type Entry={status:Status;note:string};
export type Entries=Record<string,Entry>;
// Read legacy leave records as absent; retain stored audits without destructive migration.
export function normalizeEntries(entries:Entries):Entries{
 return Object.fromEntries(Object.entries(entries).map(([id,entry])=>[id,{...entry,status:entry.status==='請假'?'缺席':entry.status}]));
}
export function prefillEntries(data:Dataset,session:ExamSession,previous:Entries){
 const entries=initialEntries(data,session),normalized=normalizeEntries(previous);let count=0;
 for(const [id,entry] of Object.entries(entries)){
  const status=normalized[id]?.status;
  if(entry.status==='未點名'&&(status==='出席'||status==='缺席')){entries[id]={status,note:''};count++;}
 }
 return {entries,count};
}
export function initialEntries(data:Dataset,session:ExamSession):Entries{
 const arrangements=new Map(data.arrangements.filter(a=>a.session===session.id).map(a=>[a.id,a]));
 return Object.fromEntries(data.students.filter(s=>s.classroom===session.classroom).map(s=>{
  const a=arrangements.get(s.id);return [s.id,{status:a?.arrangement==='免到考'?'免到考':a?.arrangement==='抽離'?'抽離':'未點名',note:''}];
 }));
}
export function confirmEntries(data:Dataset,session:ExamSession,input:unknown,previous?:Entries):Entries{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('名單格式不正確');
 const baseline=initialEntries(data,session),rows=input as Entries;
 if(Object.keys(rows).length!==Object.keys(baseline).length)throw new Error('名單人數已變更，請重新載入');
 const result:Entries={};
 for(const [id,base] of Object.entries(baseline)){
  const v=rows[id];if(!v||typeof v.note!=='string'||v.note.length>300)throw new Error('每人備註限300字');
  if(base.status==='免到考'){
   if(v.status!=='免到考')throw new Error('免到考安排需由管理者於匯入階段設定');
  }else if(v.status!=='未點名'&&!(v.status==='遲到'&&previous?.[id]?.status==='遲到')&&!(v.status==='請假'&&previous?.[id]?.status==='請假')&&!STATUSES.includes(v.status as typeof STATUSES[number]))throw new Error('出席狀態無效');
  result[id]={status:v.status==='未點名'?'出席':v.status==='請假'?'缺席':v.status,note:v.note.trim()};
 }return result;
}
export function taipeiNow(now=new Date()){
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const get=(k:string)=>p.find(x=>x.type===k)?.value;return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};
}
export function phase(s:ExamSession,date:string,time:string){return s.date<date?'已結束':s.date>date?'未開始':time<s.start?'未開始':time>=s.end?'已結束':'進行中';}
const nonempty=(v:unknown,max=100):v is string=>typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v;
const code=(v:unknown):v is string=>nonempty(v,90)&&/^[A-Za-z0-9_-]+$/.test(v);
export function validateStudents(raw:unknown):Student[]{
 if(!Array.isArray(raw)||!raw.length||raw.length>5000)throw new Error('學生名冊需1至5000筆');
 const ids=new Set<string>(),seats=new Set<string>(),grades=new Map<string,number>();
 return raw.map((s:Student)=>{
  if(!s||!nonempty(s.id,40)||!nonempty(s.name,60)||!nonempty(s.classroom,30)||!Number.isInteger(s.grade)||s.grade<1||s.grade>6||!Number.isInteger(s.seat)||s.seat<1||s.seat>999)throw new Error('學生欄位、年級或座號無效');
  if(ids.has(s.id)||seats.has(`${s.classroom}|${s.seat}`))throw new Error('學號或同班座號重複');
  if(grades.has(s.classroom)&&grades.get(s.classroom)!==s.grade)throw new Error(`${s.classroom}班年級不一致`);
  ids.add(s.id);seats.add(`${s.classroom}|${s.seat}`);grades.set(s.classroom,s.grade);
  return {id:s.id,name:s.name,grade:s.grade,classroom:s.classroom,seat:s.seat};
 });
}
export function validateLocations(raw:unknown):{data:Location[];warnings:string[]}{
 if(!Array.isArray(raw)||raw.length>500)throw new Error('教室配置最多500筆');
 const names=new Set<string>(),codes=new Set<string>(),warnings:string[]=[];
 const data=raw.map((l:Location)=>{
  if(!l||!nonempty(l.code,80)||!nonempty(l.name,80)||typeof l.description!=='string'||l.description.length>500||!['已對照','待核對'].includes(l.status)||l.floor!==null&&(!Number.isInteger(l.floor)||l.floor< -10||l.floor>100))throw new Error('教室位置格式無效');
  if(names.has(l.name)||codes.has(l.code))throw new Error('地點代碼或名稱重複');names.add(l.name);codes.add(l.code);
  if(l.floor===null){if(l.status!=='待核對')throw new Error('未填樓層請標記待核對');warnings.push(`${l.name}：樓層待核對`);}
  return {code:l.code,name:l.name,floor:l.floor,description:l.description,status:l.status};
 });return {data,warnings};
}
// Identity, class, seat and attendance remain exam-specific; descriptive corrections are shared.
export function withReferenceCorrections(data:Dataset,students:Student[]=[],locations:Location[]=[]):Dataset{
 const names=new Map(students.map(s=>[s.id,s.name])),places=new Map(locations.map(l=>[l.code,l]));
 return {...data,students:data.students.map(s=>({...s,name:names.get(s.id)||s.name})),locations:data.locations.map(l=>{const current=places.get(l.code);return current&&current.name===l.name?{...l,floor:current.floor,description:current.description,status:current.status}:l;})};
}
export function validateDataset(raw:unknown):{data:Dataset;warnings:string[]}{
 const d=raw as Dataset;if(!d||d.version!=='1.0'||!code(d.event))throw new Error('資料版本或考試代碼無效');
 if(!Array.isArray(d.students)||!d.students.length||d.students.length>5000||!Array.isArray(d.schedule)||!d.schedule.length||d.schedule.length>5000||!Array.isArray(d.arrangements)||d.arrangements.length>25000||!Array.isArray(d.locations)||d.locations.length>500)throw new Error('資料表缺漏或超出匯入容量');
 const students=validateStudents(d.students),locations=validateLocations(d.locations),warnings=locations.warnings;
 const ids=new Map(students.map(s=>[s.id,s])),classes=new Set(students.map(s=>s.classroom)),places=new Set(locations.data.map(l=>l.name));
 for(const c of classes)if(!places.has(c))throw new Error(`教室位置缺少班級 ${c}`);
 const sessions=new Map<string,ExamSession>(),ranges=new Map<string,ExamSession[]>(),titles=new Set<string>();
 for(const s of d.schedule){if(!code(s.id)||s.event!==d.event||!nonempty(s.title,120)||!classes.has(s.classroom)||!nonempty(s.period,40)||!nonempty(s.subject,100)||!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.end)||s.start>=s.end||!['考試','自習'].includes(s.kind))throw new Error('考程欄位、日期或時間無效');
  const date=new Date(s.date+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==s.date)throw new Error('日期不存在');
  if((s.kind==='自習')!==(s.subject==='自習'))throw new Error('自習類型與科目不一致');if(sessions.has(s.id))throw new Error('場次代碼重複');
  sessions.set(s.id,s);titles.add(s.title);const k=s.classroom+'|'+s.date;ranges.set(k,[...(ranges.get(k)||[]),s]);}
 if(titles.size!==1)throw new Error('同一考試名稱不一致');
 for(const a of ranges.values()){a.sort((a,b)=>a.start.localeCompare(b.start));for(let i=1;i<a.length;i++)if(a[i-1].end>a[i].start)throw new Error(`${a[i].classroom}班考程時間重疊`);}
 const keys=new Set<string>();for(const a of d.arrangements){const s=ids.get(a.id),e=sessions.get(a.session);if(!s||!e||s.classroom!==e.classroom||e.kind!=='考試')throw new Error('應試安排的學號、班級或場次不符');
  const k=a.id+'|'+a.session;if(keys.has(k))throw new Error('同學生同場次安排重複');keys.add(k);
  if(!['原班','抽離','免到考'].includes(a.arrangement)||typeof a.location!=='string'||a.location&& !places.has(a.location)||a.arrangement==='抽離'&&!a.location||a.arrangement==='免到考'&&a.location)throw new Error('應試安排或地點無效');}
 return {data:{version:'1.0',event:d.event,students:d.students.map(s=>({id:s.id,name:s.name,grade:s.grade,classroom:s.classroom,seat:s.seat})),schedule:d.schedule.map(s=>({id:s.id,event:s.event,title:s.title,date:s.date,classroom:s.classroom,period:s.period,start:s.start,end:s.end,kind:s.kind,subject:s.subject})),arrangements:d.arrangements.map(a=>({id:a.id,session:a.session,arrangement:a.arrangement,location:a.location})),locations:d.locations.map(l=>({code:l.code,name:l.name,floor:l.floor,description:l.description,status:l.status}))},warnings};
}
