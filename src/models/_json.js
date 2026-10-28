// Shared toJSON: expose `id`, hide Mongo internals and secrets.
export function cleanJson(schema) {
  schema.set('toJSON', {
    virtuals: false,
    versionKey: false,
    transform(_doc, ret) {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.passwordHash;
      delete ret.cv;
      return ret;
    },
  });
}
