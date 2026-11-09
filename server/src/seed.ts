/** Loads the same demo dataset the app ships with (artisans, demo customer, admin). Dev/staging only. */
import { SEED_ADMIN, seedArtisans, seedCustomers, seedReviews } from '../../src/data/seed';
import type { Deps } from './context';
import { createDeps } from './deps';
import { normalisePhone } from './auth';
import { insertUser } from './repo';

export async function seed(deps: Deps) {
  const users = [...seedArtisans(), ...seedCustomers(), SEED_ADMIN];
  for (const u of users) {
    const exists = await deps.db.one('SELECT 1 FROM users WHERE id = $1', [u.id]);
    if (!exists) await insertUser(deps, { ...u, phone: normalisePhone(u.phone) });
  }
  for (const r of seedReviews(seedArtisans())) {
    await deps.db.query('INSERT INTO reviews (id, job_id, artisan_id, data) VALUES ($1, NULL, $2, $3) ON CONFLICT (id) DO NOTHING', [r.id, r.artisanId, JSON.stringify(r)]);
  }
  return users.length;
}

if (require.main === module) {
  (async () => {
    const deps = createDeps();
    if (deps.cfg.env === 'production') throw new Error('Refusing to seed demo data in production.');
    await deps.db.migrate();
    console.log(`Seeded ${await seed(deps)} users.`);
    await deps.db.close();
  })();
}
