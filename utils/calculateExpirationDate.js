function calculateExpirationDate(createdAt, duration, type) {
  const now = new Date();
  const creationDate = new Date(createdAt);

  if (type === "free") {
    return new Date(creationDate.getTime() + 24 * 60 * 60 * 1000); // 24 hours for free keys
  }

  return new Date(Math.max(creationDate.getTime(), now.getTime()) + duration);
}

module.exports = calculateExpirationDate;
