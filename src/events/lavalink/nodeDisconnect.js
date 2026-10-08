import { log } from '../../utils/logger.js';

export default {
  name: 'disconnect',
  emitter: 'node',
  execute(node, reason, client) {
    log.warn(`Lavalink node [${node.id}] disconnected — ${reason?.code ?? 'unknown'}`);
  },
};
