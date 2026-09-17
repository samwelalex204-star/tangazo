'use strict';
/* Boots the real Electron app on a virtual display and checks every view renders. */
const { spawn } = require('child_process');
const electron = require('electron');

const env = Object.assign({}, process.env, { TANGAZO_SMOKE: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' });
const args = [__dirname + '/..', '--no-sandbox', '--disable-gpu'];
const useXvfb = process.platform === 'linux' && !process.env.DISPLAY;

const child = useXvfb
  ? spawn('xvfb-run', ['-a', electron, ...args], { env, stdio: 'inherit' })
  : spawn(electron, args, { env, stdio: 'inherit' });

const timer = setTimeout(() => { child.kill('SIGKILL'); console.log('SMOKE TIMEOUT'); process.exit(1); }, 90000);
child.on('exit', code => { clearTimeout(timer); process.exit(code === null ? 1 : code); });
