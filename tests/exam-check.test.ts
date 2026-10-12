import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkExam} from '../lib/exam-check.ts';
import {isHistorical} from '../lib/exam-list.ts';
const student={id:'1',name:'測試',grade:1,classroom:'101',seat:1};
const session={event:'E',title:'考試',id:'S',date:'2026-10-13',classroom:'101',period:'第1節',start:'08:00',end:'09:00',kind:'考試' as const,subject:'國文'};
const data={version:'1.0',event:'E',students:[student],locations:[{code:'101',name:'101',floor:1,description:'',status:'已對照'}],schedule:[session],arrangements:[]};
test('依選定年級比對年度缺班，不把未應考的高中當缺班',()=>{
 const annual=[student,{...student,id:'2',classroom:'102'},{...student,id:'3',classroom:'401',grade:4}];
 const report=checkExam(data,annual,[1]);assert.equal(report.errors.length,0);assert.ok(report.warnings.some(w=>w.includes('102')));assert.ok(!report.warnings.some(w=>w.includes('401')));assert.equal(report.summary[0].expected,2);
});
test('同時列出重疊與找不到學號的安排',()=>{
 const report=checkExam({...data,schedule:[session,{...session,id:'S2',start:'08:30'}],arrangements:[{id:'MISSING',session:'S',arrangement:'抽離' as const,location:'unknown'}]},[student],[1]);
 assert.ok(report.errors.some(e=>e.includes('時間重疊')));assert.ok(report.errors.some(e=>e.includes('MISSING')));
});
test('歷史以結案或結束超過30天判定，準備中保留',()=>{
 const event={id:'E',title:'考試',closed:0,draft:0,endDate:'2026-09-13'};
 assert.equal(isHistorical(event,'2026-10-13'),false);assert.equal(isHistorical({...event,endDate:'2026-09-12'},'2026-10-13'),true);assert.equal(isHistorical({...event,draft:1,endDate:'2020-01-01'},'2026-10-13'),false);assert.equal(isHistorical({...event,closed:1},'2026-10-13'),true);
});
