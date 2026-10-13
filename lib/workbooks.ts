import type {Dataset,Entries,ExamSession} from './model';
import {initialEntries,normalizeEntries,validateDataset} from './model';
async function excel(){return (await import('exceljs')).default;}
export type ImportKind='students'|'locations'|'schedule'|'arrangements';
export const SHEETS={students:'學生名冊',locations:'教室位置',schedule:'考程',arrangements:'應試安排'} as const;
const FIELDS:Record<string,string[]>={'學生名冊':['學號','姓名','年級','班級','座號'],'考程':['考試代碼','考試名稱','場次代碼','日期','班級','顯示節次','開始時間','結束時間','類型','科目'],'應試安排':['學號','場次代碼','安排','應試地點'],'教室位置':['地點代碼','班級或考場名稱','樓層','位置說明','核對狀態']};
async function readParsed(file:File,names:string[],optionalExamIdentity=false):Promise<Dataset>{
 if(!file.name.toLowerCase().endsWith('.xlsx')||file.size>8*1024*1024)throw new Error('請選擇8MB以內的標準.xlsx檔案');
 const Excel=await excel(),wb=new Excel.Workbook();
 // SpreadsheetML permits a namespace prefix, while ExcelJS expects unprefixed tags.
 const Zip=(await import('jszip')).default,zip=await Zip.loadAsync(await file.arrayBuffer());
 let expanded=0;
 const workbookXml=await zip.file('xl/workbook.xml')?.async('string')||'';
 const epoch=/date1904="(?:1|true)"/.test(workbookXml)?24107:25569;
 for(const item of Object.values(zip.files)){
  if(item.dir||!item.name.endsWith('.xml'))continue;
  let xml=await item.async('string');expanded+=xml.length;
  if(expanded>40000000)throw new Error('Excel解壓縮後資料過大');
  const prefixes=[...xml.matchAll(/xmlns:([A-Za-z_][\w.-]*)="http:\/\/schemas.openxmlformats.org\/spreadsheetml\/2006\/main"/g)].map(m=>m[1]);
  for(const prefix of new Set(prefixes)){
   const escaped=prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   xml=xml.replace(new RegExp(`(<\\/?)[ ]*${escaped}:`,'g'),'$1').replaceAll(`xmlns:${prefix}="http://schemas.openxmlformats.org/spreadsheetml/2006/main"`,'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"');
  }
  xml=xml.replace(/<c\b([^>]*\bt="d"[^>]*)>\s*<v>([^<]+)<\/v>\s*<\/c>/g,(_all,attrs,value)=>{
   const text=value.includes('T')&&!/(Z|[+-]\d{2}:\d{2})$/.test(value)?value+'Z':value;
   const ms=Date.parse(text);if(!Number.isFinite(ms))throw new Error('Excel日期格式無效');
   return `<c${attrs.replace('t="d"','t="n"')}><v>${ms/86400000+epoch}</v></c>`;
  });
  zip.file(item.name,xml);
 }
 await wb.xlsx.load(await zip.generateAsync({type:'arraybuffer'}),{ignoreNodes:['tableParts','drawing','picture','extLst']});
 const fields=Object.fromEntries(names.map(name=>[name,optionalExamIdentity&&name==='考程'?FIELDS[name].filter(k=>!['考試代碼','考試名稱'].includes(k)||(wb.getWorksheet(name)?.getRow(1).values as unknown[]|undefined)?.includes(k)):FIELDS[name]]));
 const tables:Record<string,Record<string,unknown>[]>={};
 for(const [name,needed] of Object.entries(fields)){
  const s=wb.getWorksheet(name);if(!s)throw new Error(`缺少「${name}」工作表`);
  if(s.rowCount>26000||s.columnCount>40)throw new Error(`${name}超過支援範圍`);
  const headers=s.getRow(1).values as unknown[],rows:Record<string,unknown>[]=[];
  for(const k of needed)if(headers.filter(h=>h===k).length!==1)throw new Error(`${name}缺少或重複欄位「${k}」`);
  s.eachRow((r,n)=>{if(n===1)return;const values=needed.map(k=>r.getCell(headers.indexOf(k)).value);if(values.every(v=>v===null||v===''))return;
   for(const k of needed){const c=r.getCell(headers.indexOf(k));if(c.isMerged||c.formula||c.value&&typeof c.value==='object'&&!(c.value instanceof Date))throw new Error(`${name}第${n}列含合併儲存格、公式或不支援的值`);}
   rows.push(Object.fromEntries(needed.map((k,i)=>[k,values[i]])));
  });tables[name]=rows;
 }
 const str=(v:unknown)=>v===null||v===undefined?'':String(v).trim();
 const date=(v:unknown)=>{if(!(v instanceof Date)||!Number.isFinite(v.getTime()))throw new Error('考程日期請使用Excel日期');return v.toISOString().slice(0,10);};
 const time=(v:unknown)=>{if(v instanceof Date)return v.toISOString().slice(11,16);if(typeof v==='number'&&v>=0&&v<1){const m=Math.round(v*1440);return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}throw new Error('考程時間請使用Excel時間');};
 const data={version:'1.0',event:str(tables['考程']?.[0]?.['考試代碼']),students:(tables['學生名冊']||[]).map(r=>({id:str(r['學號']),name:str(r['姓名']),grade:Number(r['年級']),classroom:str(r['班級']),seat:Number(r['座號'])})),schedule:(tables['考程']||[]).map(r=>({event:str(r['考試代碼']),title:str(r['考試名稱']),id:str(r['場次代碼']),date:date(r['日期']),classroom:str(r['班級']),period:str(r['顯示節次']),start:time(r['開始時間']),end:time(r['結束時間']),kind:str(r['類型']),subject:str(r['科目'])})),arrangements:(tables['應試安排']||[]).map(r=>({id:str(r['學號']),session:str(r['場次代碼']),arrangement:str(r['安排']),location:str(r['應試地點'])})),locations:(tables['教室位置']||[]).map(r=>({code:str(r['地點代碼']),name:str(r['班級或考場名稱']),floor:r['樓層']===null||r['樓層']===''?null:Number(r['樓層']),description:str(r['位置說明']),status:str(r['核對狀態'])}))};
 return data as Dataset;
}
export async function readStandard(file:File){return validateDataset(await readParsed(file,Object.values(SHEETS))).data;}
export async function readPart(file:File,kind:ImportKind){return (await readParsed(file,[SHEETS[kind]],true))[kind];}
export async function downloadPart(kind:ImportKind,rows:Dataset[ImportKind]=[],prefix='空白範本'){
 const Excel=await excel(),wb=new Excel.Workbook(),sheet=wb.addWorksheet(SHEETS[kind]);
 const simple=kind==='schedule'&&!rows.length;
 const keys={students:['id','name','grade','classroom','seat'],locations:['code','name','floor','description','status'],schedule:['event','title','id','date','classroom','period','start','end','kind','subject'],arrangements:['id','session','arrangement','location']}[kind].filter(k=>!simple||!['event','title'].includes(k));
 sheet.addRow(FIELDS[SHEETS[kind]].filter(k=>!simple||!['考試代碼','考試名稱'].includes(k)));
 for(const row of rows){sheet.addRow(keys.map(key=>{const value=(row as unknown as Record<string,unknown>)[key];if(kind==='schedule'&&key==='date')return new Date(value+'T00:00:00Z');if(kind==='schedule'&&['start','end'].includes(key)){const [h,m]=String(value).split(':').map(Number);return (h*60+m)/1440;}return value;}));}
 sheet.views=[{state:'frozen',ySplit:1}];sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF234F49'}};sheet.getRow(1).height=28;
 sheet.columns.forEach((column,i)=>{column.width=keys[i]==='description'?40:keys[i]==='name'||keys[i]==='title'?24:18;if(keys[i]==='date')column.numFmt='yyyy-mm-dd';if(kind==='schedule'&&['start','end'].includes(keys[i]))column.numFmt='hh:mm';});
 if(kind==='students')sheet.getCell('C1').note='年級：國一至國三填1至3，高一至高三填4至6。';
 if(kind==='schedule')sheet.getRow(1).getCell(keys.indexOf('id')+1).note='考試名稱在網站填寫，考試代碼由系統產生。場次代碼不可重複；跨節考試只填一列，使用完整開始與結束時間。';
 if(kind==='arrangements')sheet.getCell('C1').note='安排填原班、抽離或免到考。學號及場次代碼須對應本次考試；空白資料表表示沒有特殊安排。';
 const bytes=await wb.xlsx.writeBuffer(),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=`${prefix}_${SHEETS[kind]}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
type ExportBoard={session_id:string;entries:Entries;revision:number;confirmed?:number;actor:string;updated_at:string};
export async function downloadReport(snapshot:{data:Dataset;boards:ExportBoard[];exportedAt:string},filters:{date:string;classroom:string}){
 const Excel=await excel(),wb=new Excel.Workbook(),d=snapshot.data;
 const students=d.students.filter(s=>!filters.classroom||s.classroom===filters.classroom).sort((a,b)=>a.classroom.localeCompare(b.classroom)||a.seat-b.seat);
 const sessions=d.schedule.filter(s=>s.kind==='考試'&&(!filters.date||s.date===filters.date)&&(!filters.classroom||s.classroom===filters.classroom)).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||a.classroom.localeCompare(b.classroom));
 const boardMap=new Map(snapshot.boards.map(b=>[b.session_id,b]));
 const slot=(s:ExamSession)=>`${s.date} ${s.period}\n${s.start}–${s.end}`;
 const slots=[...new Set(sessions.map(slot))];
 const overview=wb.addWorksheet('學生總表'),detail=wb.addWorksheet('逐筆明細'),info=wb.addWorksheet('報表說明');
 overview.addRow(['班級','座號','學號','姓名',...slots]);
 detail.addRow(['班級','座號','學號','姓名','日期','節次','開始時間','結束時間','科目','狀態','確認狀態','備註','填寫者','更新時間']);
 const resolved=new Map(sessions.map(s=>[s.id,normalizeEntries(boardMap.get(s.id)?.entries||initialEntries(d,s))]));
 for(const student of students){
  const current=sessions.filter(s=>s.classroom===student.classroom),bySlot=new Map(current.map(s=>[slot(s),s]));
  overview.addRow([student.classroom,student.seat,student.id,student.name,...slots.map(k=>{const s=bySlot.get(k);return s?resolved.get(s.id)?.[student.id]?.status||'未點名':'無考程';})]);
  for(const s of current){const b=boardMap.get(s.id),entry=resolved.get(s.id)?.[student.id];detail.addRow([student.classroom,student.seat,student.id,student.name,s.date,s.period,s.start,s.end,s.subject,entry?.status||'未點名',b&&b.confirmed!==0?'已確認':'未確認',entry?.note||'',b?.actor||'',b?new Date(b.updated_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'']);}
 }
 info.addRows([['項目','說明'],['考試',d.schedule[0].title],['匯出時間',new Date(snapshot.exportedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})],['篩選',`${filters.date||'全部日期'}／${filters.classroom||'全部班級'}`],['抽離','抽離為安排或人工登記，不代表在另一考場實際到場；是否點名請看明細的確認狀態。'],['免到考','不列為缺席；自習不產生出席紀錄。'],['未點名','一般學生尚未經全班確認；預設抽離及免到考則直接顯示對應狀態。'],['時間','所有日期及時段均為台灣時間；跨節考試只記一次。']]);
 for(const sheet of [overview,detail,info]){
  sheet.views=[{state:'frozen',xSplit:sheet===overview?4:0,ySplit:1}];
  sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF234F49'}};sheet.getRow(1).height=42;sheet.getRow(1).alignment={vertical:'middle',wrapText:true};
  sheet.autoFilter={from:{row:1,column:1},to:{row:sheet.rowCount,column:sheet.columnCount}};
  sheet.columns.forEach((col,i)=>{col.width=sheet===info?(i?95:18):i===3?16:i<3?12:sheet===overview?24:18;});
  sheet.eachRow((r,n)=>{if(n>1){r.height=24;r.alignment={vertical:'middle'};}});
 }
 const bytes=await wb.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=document.createElement('a');a.href=url;a.download=`${d.event}_出席紀錄${filters.date?'_'+filters.date:''}${filters.classroom?'_'+filters.classroom:''}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
 return {students:students.length,records:detail.rowCount-1};
}
