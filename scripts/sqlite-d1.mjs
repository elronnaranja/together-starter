export function sqliteD1(sql) {
 return {
  prepare(query) {
   return { bind(...values) {
    return {
     async first() { return sql.prepare(query).get(...values) || null; },
     async run() { const result=sql.prepare(query).run(...values); return {meta:{changes:Number(result.changes)}}; }
    };
   }};
  },
  async batch(statements) {
   sql.exec('BEGIN');
   try { const result=[]; for(const s of statements) result.push(await s.run()); sql.exec('COMMIT'); return result; }
   catch(error) { sql.exec('ROLLBACK'); throw error; }
  }
 };
}
