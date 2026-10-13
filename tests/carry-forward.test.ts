import assert from 'node:assert/strict';
import {test} from 'node:test';
import {initialEntries,prefillEntries,normalizeEntries,confirmEntries,validateDataset,STATUSES} from '../lib/model.ts';
import {fixture} from './fixtures/model.ts';
test('帶入僅沿用一般學生出席缺席，當場抽離免到考優先且不沿用備註',()=>{
 const d=validateDataset(fixture).data,s=d.schedule[0];
 const previous={1:{status:'請假' as const,note:'前一場備註'},2:{status:'缺席' as const,note:''},3:{status:'出席' as const,note:''}};
 const result=prefillEntries(d,s,previous);assert.equal(result.count,1);assert.deepEqual(result.entries,{'1':{status:'缺席',note:''},'2':{status:'抽離',note:''},'3':{status:'免到考',note:''}});
 assert.equal(previous[1].status,'請假');assert.equal(previous[1].note,'前一場備註');
 for(const status of ['抽離','免到考','未點名','遲到'] as const)assert.equal(prefillEntries(d,s,{'1':{status,note:''}}).entries['1'].status,'未點名');
 assert.equal(prefillEntries(d,s,{'1':{status:'出席',note:''}}).entries['1'].status,'出席');
});
test('既有請假統一讀為缺席，不能新增請假，舊頁提交轉為缺席',()=>{
 const d=validateDataset(fixture).data,s=d.schedule[0],entries=initialEntries(d,s);entries['1']={status:'請假',note:'原始備註'};
 assert.equal(STATUSES.includes('請假' as any),false);assert.equal(normalizeEntries(entries)['1'].status,'缺席');assert.equal(entries['1'].status,'請假');
 assert.throws(()=>confirmEntries(d,s,entries));assert.equal(confirmEntries(d,s,entries,entries)['1'].status,'缺席');
});
