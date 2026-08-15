// Wrapper to unset ELECTRON_RUN_AS_NODE before launching Electron
delete process.env.ELECTRON_RUN_AS_NODE;

const { spawn } = require('child_process');
const electron = require('electron'); // npm package returns the exe path

const child = spawn(electron, ['.'], { stdio: 'inherit', shell: false });
child.on('close', (code) => process.exit(code));
