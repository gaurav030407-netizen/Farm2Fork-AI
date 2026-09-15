import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const isWin = process.platform === 'win32';
const venvPython = isWin
  ? join(process.cwd(), '.venv', 'Scripts', 'python.exe')
  : join(process.cwd(), '.venv', 'bin', 'python');
const pythonCmd = existsSync(venvPython) ? venvPython : (isWin ? 'python' : 'python3');

const child = spawn(pythonCmd, ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000'], {
  cwd: join(process.cwd(), 'backend'),
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
