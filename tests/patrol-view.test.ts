import {test} from 'node:test';
import assert from 'node:assert/strict';
import {schoolForGrade,timeWindows,selectSession} from '../lib/patrol-view.ts';
import {withReferenceCorrections,type ExamSession,type Dataset} from '../lib/model.ts';
const date='2026-10-13';
const long={id:'LONG',event:'E',title:'測試',classroom:'401',date,period:'第2–3節',start:'09:00',end:'10:30',subject:'國文',kind:'考試'} as ExamSession;
test('高中跨節考試在第二個時窗仍可找到，結束時不列入目前場次',()=>{
 const short={...long,id:'SHORT',classroom:'501',end:'09:50'},next={...short,id:'NEXT',start:'10:00',end:'10:50'};
 const windows=timeWindows([long,short,next]);assert.ok(windows.some(w=>w.start==='10:00'));
 assert.equal(selectSession([long],date,{date,time:'10:10'},'auto')?.id,'LONG');
 assert.equal(selectSession([long],date,{date,time:'08:00'},'auto')?.id,'LONG');
 assert.equal(selectSession([long],date,{date,time:'10:30'},'auto'),undefined);
 assert.equal(selectSession([long],date,{date,time:'12:00'},'10:00|10:30')?.id,'LONG');
 assert.equal(schoolForGrade(3),'junior');assert.equal(schoolForGrade(4),'senior');
});
test('同步姓名與教室說明，不改考試的班級座號與安排',()=>{
 const d={students:[{id:'1',name:'原名',grade:1,classroom:'101',seat:1}],locations:[{code:'101',name:'101',floor:1,description:'原位置',status:'已對照'}],arrangements:[{id:'1',session:'S',arrangement:'抽離',location:'101'}]} as Dataset;
 const c=withReferenceCorrections(d,[{...d.students[0],name:'正確名',classroom:'201',seat:2}], [{...d.locations[0],floor:3,description:'新位置'}]);
 assert.equal(c.students[0].name,'正確名');assert.equal(c.students[0].classroom,'101');assert.equal(c.students[0].seat,1);assert.equal(c.locations[0].floor,3);assert.deepEqual(c.arrangements,d.arrangements);assert.equal(d.students[0].name,'原名');
});
