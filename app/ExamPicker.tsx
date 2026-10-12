'use client';
import {useState} from 'react';
import {taipeiNow} from '@/lib/model';
import {isHistorical,type ExamListItem} from '@/lib/exam-list';
export default function ExamPicker({events,value,onChange,label='目前管理考試'}:{events:ExamListItem[];value:string;onChange:(id:string)=>void;label?:string}){
 const [query,setQuery]=useState(''),[expanded,setExpanded]=useState(false),today=taipeiNow().date;
 const history=events.filter(e=>isHistorical(e,today)),recent=events.filter(e=>!isHistorical(e,today)||e.id===value);
 const name=(e:ExamListItem)=>e.title+(e.draft?'（準備中）':e.closed?'（已結案）':isHistorical(e,today)?'（歷史）':'');
 return <div className="exam-picker"><label>{label}<select value={value} onChange={e=>onChange(e.target.value)}><option value="">選擇考試</option>{recent.map(e=><option key={e.id} value={e.id}>{name(e)}</option>)}</select></label>{history.length>0&&<details open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}><summary>歷史考試（{history.length}）</summary><p className="hint">已結案或結束超過30天的考試，仍可管理、匯出與複製。</p><input aria-label={`搜尋${label}的歷史考試`} value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜尋考試名稱"/><div className="exam-history-list">{history.filter(e=>e.title.includes(query)||e.id.includes(query)).map(e=><button type="button" key={e.id} onClick={()=>{onChange(e.id);setExpanded(false);}}><strong>{name(e)}</strong><small>{e.endDate?`考程至 ${e.endDate}`:''}</small></button>)}</div></details>}</div>;
}
