import { createDeps } from './deps';

(async () => {
  const deps = createDeps();
  const applied = await deps.db.migrate();
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
  await deps.db.close();
})();
