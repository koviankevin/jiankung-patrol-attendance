import { env } from 'cloudflare:workers';
export const database=()=>{if(!env.DB)throw new Error('資料庫尚未設定');return env.DB;};
export class ApiError extends Error{constructor(public status:number,message:string){super(message);}}
export const digest=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(n=>n.toString(16).padStart(2,'0')).join('');
export function randomToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function passwordHash(value:string,salt=randomToken().slice(0,32)){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(value),'PBKDF2',false,['deriveBits']);
 const bytes=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256));
 return salt+':'+Array.from(bytes).map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function verify(value:string,expected:string){
 if(!expected||!/^\w{32}:[a-f0-9]{64}$/.test(expected))return false;
 const got=await passwordHash(value,expected.split(':')[0]);let diff=got.length^expected.length;
 for(let i=0;i<expected.length;i++)diff|=got.charCodeAt(i)^expected.charCodeAt(i);return diff===0;
}
export type User={token_hash:string;role:'admin'|'teacher';name:string;exam_id:string|null;code_version:number;expires:number};
export async function adminCredential(){
 const saved=await database().prepare("SELECT password_hash,revision FROM admin_credentials WHERE id='admin'").first<{password_hash:string;revision:number}>();
 if(saved)return saved;
 if(!env.ADMIN_PASSWORD_HASH)throw new ApiError(503,'管理密碼尚未設定');
 return {password_hash:env.ADMIN_PASSWORD_HASH,revision:0};
}
export async function authenticate(req:Request,optional=false):Promise<User|null>{
 const token=req.headers.get('cookie')?.match(/(?:^|;\s*)patrol_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 const user=token?await database().prepare('SELECT * FROM auth_sessions WHERE token_hash=? AND expires>?').bind(await digest(token),Date.now()).first<User>():null;
 let valid=!!user;
 if(user?.role==='admin')valid=user.code_version===(await adminCredential()).revision;
 if(user?.role==='teacher'){
  const e=await database().prepare('SELECT closed,draft,code_version FROM exams WHERE id=?').bind(user.exam_id).first<{closed:number;draft:number;code_version:number}>();valid=!!e&&!e.closed&&!e.draft&&e.code_version===user.code_version;
 }
 if(!valid){if(optional)return null;throw new ApiError(401,'登入已到期或考試已結案，請重新登入');}return user;
}
export function cookie(req:Request,token:string,maxAge:number){return `patrol_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${new URL(req.url).hostname==='127.0.0.1'||new URL(req.url).hostname==='localhost'?'':'; Secure'}`;}
export function requireAdmin(user:User){if(user.role!=='admin')throw new ApiError(403,'此操作僅限管理者');}
export function examAccess(user:User,id:string){if(user.role!=='admin'&&user.exam_id!==id)throw new ApiError(403,'無法存取其他考試');}
export function sameOrigin(req:Request){const origin=req.headers.get('origin');if(!origin||![new URL(req.url).origin,env.SITE_ORIGIN].filter(Boolean).includes(origin))throw new ApiError(403,'請從網站頁面提交操作');}
export async function limited(req:Request,admin:boolean){
 const key=await digest((req.headers.get('cf-connecting-ip')||'local')+'|login|'+(admin?'admin':'teacher')),now=Date.now();
 const r=await database().prepare('INSERT INTO login_attempts(key,count,until) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN until<? THEN 1 ELSE count+1 END, until=CASE WHEN until<? THEN excluded.until ELSE until END RETURNING count').bind(key,now+900000,now,now).first<{count:number}>();
 if(r&&r.count>(admin?15:120))throw new ApiError(429,'嘗試次數過多，請15分鐘後再試');
}
