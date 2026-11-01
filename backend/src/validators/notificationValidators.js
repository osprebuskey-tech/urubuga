const { z } = require('zod');
const { paginationQuery, optionalParam } = require('./commonValidators');

const listNotificationsQuery = paginationQuery.extend({ unread: optionalParam(z.enum(['true', 'false'])) });

module.exports = { listNotificationsQuery };
