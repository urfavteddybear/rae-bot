import { log } from '../../utils/logger.js';

export default {
  name: 'error',
  emitter: 'node',
  execute(node, error, client) {
    log.error(`Lavalink node [${node?.id ?? 'unknown'}] error: ${error?.message ?? error}`);
  },
};
