import { integer, sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
export const exams=sqliteTable('exams',{
 id:text('id').primaryKey(),title:text('title').notNull(),data:text('data').notNull(),
 closed:integer('closed').notNull().default(0),codeHash:text('code_hash').notNull(),
 codeVersion:integer('code_version').notNull().default(1),createdAt:text('created_at').notNull(),
 draft:integer('draft').notNull().default(0),referenceInfo:text('reference_info').notNull().default('{}'),
 mutationId:text('mutation_id').notNull().default(''),
});
export const boards=sqliteTable('boards',{
 examId:text('exam_id').notNull().references(()=>exams.id),sessionId:text('session_id').notNull(),
 revision:integer('revision').notNull(),entries:text('entries').notNull(),actor:text('actor').notNull(),
 updatedAt:text('updated_at').notNull(),requestId:text('request_id').notNull(),
 confirmed:integer('confirmed').notNull().default(1),
},t=>[primaryKey({columns:[t.examId,t.sessionId]})]);
export const audits=sqliteTable('audits',{
 requestId:text('request_id').primaryKey(),examId:text('exam_id').notNull().references(()=>exams.id),
 sessionId:text('session_id').notNull(),revision:integer('revision').notNull(),entries:text('entries').notNull(),
 actor:text('actor').notNull(),at:text('at').notNull(),bodyHash:text('body_hash').notNull(),principal:text('principal').notNull(),
 action:text('action').notNull().default('save'),
});
export const sessions=sqliteTable('auth_sessions',{
 tokenHash:text('token_hash').primaryKey(),role:text('role').notNull(),name:text('name').notNull(),
 examId:text('exam_id'),codeVersion:integer('code_version').notNull().default(0),expires:integer('expires').notNull(),
});
export const attempts=sqliteTable('login_attempts',{
 key:text('key').primaryKey(),count:integer('count').notNull(),until:integer('until').notNull(),
});
export const adminCredentials=sqliteTable('admin_credentials',{
 id:text('id').primaryKey(),passwordHash:text('password_hash').notNull(),
 revision:integer('revision').notNull(),updatedAt:text('updated_at').notNull(),
});
export const referenceData=sqliteTable('reference_data',{
 kind:text('kind').primaryKey(),year:text('year').notNull(),data:text('data').notNull(),
 revision:integer('revision').notNull(),updatedAt:text('updated_at').notNull(),
});
