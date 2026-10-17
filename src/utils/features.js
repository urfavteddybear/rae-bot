/**
 * Optional features. The dashboard is off unless DASHBOARD=true. When off, the bot loads no web
 * server, no SQLite and no profile code, and records no plays. An existing data/rae.db is left alone.
 */
export const dashboardEnabled = () => process.env.DASHBOARD === 'true';
