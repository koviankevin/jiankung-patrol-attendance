import type {ExamSession} from './model';
export type School='junior'|'senior';
export const schoolForGrade=(grade:number):School=>grade<=3?'junior':'senior';
export function timeWindows(schedule:ExamSession[]){
 // Elementary time windows let one long examination appear during either covered period.
 const boundaries=[...new Set(schedule.flatMap(s=>[s.start,s.end]))].sort();
 return boundaries.slice(0,-1).map((start,i)=>({start,end:boundaries[i+1]})).filter(w=>schedule.some(s=>s.start<=w.start&&s.end>=w.end));
}
export function selectSession(sessions:ExamSession[],date:string,now:{date:string;time:string},slot:string){
 const list=sessions.filter(s=>s.date===date).sort((a,b)=>a.start.localeCompare(b.start));
 if(slot==='auto'){
  if(date===now.date)return list.find(s=>s.start<=now.time&&now.time<s.end)||list.find(s=>s.start>now.time);
  return list[0];
 }
 const [start,end]=slot.split('|');return list.find(s=>s.start<end&&s.end>start);
}
