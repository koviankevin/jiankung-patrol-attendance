'use client';
import {useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {phase,type ExamSession} from '@/lib/model';
type Progress={actor:string;updatedAt:string;counts:Record<string,number>};
type Props={schedule:ExamSession[];grades:Record<string,number>;progress:Record<string,Progress>;date:string;onDate:(date:string)=>void;now:{date:string;time:string};busy:boolean;onRefresh:()=>void;onOpen:(session:ExamSession)=>void};
export default function AttendanceOverview({schedule,grades,progress,date,onDate,now,busy,onRefresh,onOpen}:Props){
 const [grade,setGrade]=useState(''),[filter,setFilter]=useState('all'),[query,setQuery]=useState('');
 const dates=[...new Set(schedule.map(s=>s.date))].sort();
 const scoped=schedule.filter(s=>s.kind==='考試'&&s.date===date&&(!grade||grades[s.classroom]===Number(grade))&&s.classroom.includes(query.trim()));
 const done=scoped.filter(s=>progress[s.id]).length;
 const absent=scoped.filter(s=>(progress[s.id]?.counts['缺席']||0)>0).length;
 const overdue=scoped.filter(s=>!progress[s.id]&&phase(s,now.date,now.time)==='已結束').length;
 const rows=scoped.filter(s=>filter==='pending'?!progress[s.id]:filter==='absent'?(progress[s.id]?.counts['缺席']||0)>0:true).sort((a,b)=>a.start.localeCompare(b.start)||a.classroom.localeCompare(b.classroom,undefined,{numeric:true}));
 return <section className="panel attendance-overview" aria-label="各班填表總覽">
  <div className="section-heading"><div><h2>各班填表總覽</h2><p className="hint">每 20 秒更新；點選場次查看學生狀況或更正。</p></div><button className="quiet" disabled={busy} onClick={onRefresh}><RefreshCw size={16}/>更新總覽</button></div>
  <div className="overview-filters"><label>總覽日期<select value={date} onChange={e=>onDate(e.target.value)}>{dates.map(d=><option key={d}>{d}</option>)}</select></label><label>總覽年級<select value={grade} onChange={e=>setGrade(e.target.value)}><option value="">全部年級</option>{['國一','國二','國三','高一','高二','高三'].map((g,i)=><option key={g} value={i+1}>{g}</option>)}</select></label><label>總覽班級<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜尋班級"/></label></div>
  <div className="overview-metrics"><div><span>已確認／考試場次</span><strong>{done}／{scoped.length}</strong></div><div><span>未確認場次</span><strong>{scoped.length-done}</strong></div><div><span>已結束仍未確認</span><strong>{overdue}</strong></div><div><span>有缺席的場次</span><strong>{absent}</strong></div></div>
  <div className="overview-switch" role="group" aria-label="填表狀況篩選">{[['all','全部場次'],['pending','只看未確認'],['absent','只看有缺席']].map(([value,label])=><button key={value} aria-pressed={filter===value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{label}</button>)}</div>
  <div className="reference-table overview-table"><table><thead><tr>{['班級／科目','時間','填表狀況','缺席','抽離／免到考','填寫者／更新時間','查看'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(s=>{const p=progress[s.id],state=phase(s,now.date,now.time);return <tr key={s.id} className={p?.counts['缺席']?'has-absence':''}>
   <td><strong>{s.classroom} 班</strong><small>{s.subject}</small></td><td>{s.start}–{s.end}<small>{s.period}</small></td><td><span className={`pill ${p?'completed':state==='已結束'?'overdue':'waiting'}`}>{p?'已確認':state==='已結束'?'已結束・未確認':state==='進行中'?'進行中・未確認':'未開始・未確認'}</span></td><td>{p?p.counts['缺席']||0:'—'}</td><td>{p?`${p.counts['抽離']||0}／${p.counts['免到考']||0}`:'—'}</td><td>{p?p.actor:'尚未填寫'}{p&&<small>{new Date(p.updatedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}</small>}</td><td><button className="quiet" aria-label={`查看 ${s.classroom} 班 ${s.start} ${s.subject}`} disabled={busy} onClick={()=>onOpen(s)}>查看</button></td>
  </tr>;})}</tbody></table></div>{!rows.length&&<p className="hint">沒有符合條件的考試場次。</p>}<p className="hint">數字依日期、年級及班級篩選計算；同一班不同場次分別列出。未確認場次不推算缺席人數，自習不列入。</p>
 </section>;
}
