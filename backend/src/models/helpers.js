/** toJSON options: expose `id`, hide `_id`, `__v` and any internal fields. */
function toJSONOptions(hidden = []) {
  return {
    transform(doc, ret) {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.__v;
      hidden.forEach((key) => delete ret[key]);
      return ret;
    },
  };
}

module.exports = { toJSONOptions };
