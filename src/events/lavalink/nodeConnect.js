import { log } from '../../utils/logger.js';

export default {
  name: 'create',
  emitter: 'node',
  execute(node, client) {
    log.info(`Lavalink node [${node.id}] connected`);
  },
};
