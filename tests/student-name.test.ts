import assert from 'node:assert/strict';
import {test} from 'node:test';
import {maskStudentName} from '../lib/student-name.ts';

test('student display names hide middle characters and handle short and Unicode names',()=>{
 for(const [name,expected] of [['',''],['王','王'],['王明','王○'],['王小明','王○明'],['歐陽小明','歐○○明'],['𠮷小明','𠮷○明']]){
  assert.equal(maskStudentName(name),expected);
  assert.equal(maskStudentName(expected),expected);
 }
});
