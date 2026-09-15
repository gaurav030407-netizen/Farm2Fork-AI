import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const isWin = process.platform === 'win32';
const pnpmCmd = isWin ? 'pnpm.cmd' : 'pnpm';
const venvPython = isWin
  ? join(process.cwd(), '.venv', 'Scripts', 'python.exe')
  : join(process.cwd(), '.venv', 'bin', 'python');
const pythonCmd = existsSync(venvPython) ? venvPython : (isWin ? 'python' : 'python3');

const procs = [];

function start(name, cmd, args, cwd) {
  const p = spawn(cmd, args, { cwd, stdio: 'inherit', shell: isWin });
  procs.push(p);
  p.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`[${name}] exited with code ${code}`);
    }
  });
}

// 1. Node API server (port 3000)
start('api-server', pnpmCmd, ['--filter', '@workspace/api-server', 'run', 'dev'], process.cwd());

// 2. Python FastAPI backend (port 8000)
start('fastapi', pythonCmd, ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000'], join(process.cwd(), 'backend'));

// 3. React Frontend (port 5000)
start('frontend', pnpmCmd, ['--filter', '@workspace/farm2fork', 'run', 'dev'], process.cwd());

function cleanup() {
  for (const p of procs) {
    try {
      if (isWin && p.pid) {
        spawn('taskkill', ['/pid', p.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
      } else {
        p.kill('SIGINT');
      }
    } catch {}
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
