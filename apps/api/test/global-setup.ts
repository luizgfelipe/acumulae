import { execSync } from 'child_process';
import './env';

/** Aplica as migrations no banco de teste antes de rodar as suítes. */
export default function globalSetup() {
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env, cwd: `${__dirname}/..` });
}
