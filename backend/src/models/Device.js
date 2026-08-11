import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema({
  name: String,
  serial: String,
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Device', deviceSchema);
