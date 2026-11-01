const { z } = require('zod');
const { searchText } = require('./commonValidators');

const globalSearchQuery = z.object({ q: searchText });

module.exports = { globalSearchQuery };
