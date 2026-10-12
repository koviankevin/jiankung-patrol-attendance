/** Mask display names without changing the stored student record. */
export function maskStudentName(name:string):string{
 const characters=Array.from(name);
 if(characters.length<2)return name;
 return characters[0]+'○'.repeat(Math.max(1,characters.length-2))+(characters.length>2?characters.at(-1):'');
}
