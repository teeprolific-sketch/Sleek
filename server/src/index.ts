import { buildApp } from './app';
import { createDeps } from './deps';
import { startScheduler } from './scheduler';

async function main() {
  const deps = createDeps();
  await deps.db.migrate();
  const app = buildApp(deps);
  const stop = startScheduler(deps);
  await app.listen({ port: deps.cfg.port, host: '0.0.0.0' });
  console.log(`Sleek API on :${deps.cfg.port} (payments: ${deps.payments.name}, env: ${deps.cfg.env})`);
  const shutdown = async () => {
    stop();
    await app.close();
    await deps.db.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
