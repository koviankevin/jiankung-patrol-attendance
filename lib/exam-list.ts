export type ExamListItem={id:string;title:string;closed:number;draft:number;endDate?:string|null};
export function isHistorical(e:ExamListItem,today:string){const cutoff=new Date(today+'T00:00:00Z');cutoff.setUTCDate(cutoff.getUTCDate()-30);return !!e.closed||(!e.draft&&!!e.endDate&&e.endDate<cutoff.toISOString().slice(0,10));}
