// "Top ranked": who is shown first. Only verified providers are listed at all (verification is the gate), and among
// them the order follows customer rating, weighted by how many customers rated.
// A smoothed average: a provider with one 5-star review does not outrank one with forty reviews averaging 4.8,
// and a newly verified provider with no reviews starts in the middle rather than at the bottom.
const PRIOR_VOTES = 5;
const PRIOR_MEAN = 3.5;

/** Aggregation expression for the score, given the field paths holding the average and the number of ratings. */
const rankExpression = (avgPath, countPath) => ({
  $divide: [
    { $add: [{ $multiply: [avgPath, countPath] }, PRIOR_VOTES * PRIOR_MEAN] },
    { $add: [countPath, PRIOR_VOTES] },
  ],
});

/** The same score in plain JavaScript (used by tests and anywhere a number is needed outside the database). */
const rankScore = (avg = 0, count = 0) => (avg * count + PRIOR_VOTES * PRIOR_MEAN) / (count + PRIOR_VOTES);

module.exports = { rankExpression, rankScore, PRIOR_VOTES, PRIOR_MEAN };
