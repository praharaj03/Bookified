import { model, models, Schema } from "mongoose";

const schema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, expires: 0 },
});

export default models.DemoUsage || model("DemoUsage", schema);
