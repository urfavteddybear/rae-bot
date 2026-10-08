const COLORS = {
  info:  '\x1b[36m',  // cyan
  warn:  '\x1b[33m',  // yellow
  error: '\x1b[31m',  // red
  debug: '\x1b[90m',  // grey
  reset: '\x1b[0m',
};

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function write(level, msg, color) {
  const prefix = `${color}[${ts()}] [${level.toUpperCase()}]${COLORS.reset}`;
  console.log(`${prefix} ${msg}`);
}

export const log = {
  info:  (msg) => write('info',  msg, COLORS.info),
  warn:  (msg) => write('warn',  msg, COLORS.warn),
  error: (msg) => write('error', msg, COLORS.error),
  debug: (msg) => write('debug', msg, COLORS.debug),
};
