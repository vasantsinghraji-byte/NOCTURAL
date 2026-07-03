const normalizeReviewAggregateState = (rating = {}) => ({
  stars: typeof rating?.stars === 'number' ? rating.stars : null,
  hasRatedAt: Boolean(rating?.ratedAt)
});

const hasReviewAggregateStateChanged = (previousRating = {}, nextRating = {}) => {
  const previousState = normalizeReviewAggregateState(previousRating);
  const nextState = normalizeReviewAggregateState(nextRating);

  return previousState.stars !== nextState.stars || previousState.hasRatedAt !== nextState.hasRatedAt;
};

module.exports = {
  normalizeReviewAggregateState,
  hasReviewAggregateStateChanged
};
