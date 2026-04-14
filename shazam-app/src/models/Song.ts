import mongoose, { Schema, Document, Model } from "mongoose";

export interface IFingerprint {
  hash: number;
  timeOffset: number;
}

export interface ISong extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  artist: string;
  album?: string;
  releaseYear?: number;
  genre?: string;
  fingerprints: IFingerprint[];
  uploadedBy?: mongoose.Types.ObjectId;
  uploadedAt: Date;
  fileSize?: number;
  duration?: number;
}

const FingerprintSchema = new Schema<IFingerprint>({
  hash: { type: Number, required: true, index: true },
  timeOffset: { type: Number, required: true },
});

const SongSchema = new Schema<ISong>({
  title: { type: String, required: true, index: true },
  artist: { type: String, required: true, index: true },
  album: { type: String },
  releaseYear: { type: Number },
  genre: { type: String },
  fingerprints: [FingerprintSchema],
  uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
  uploadedAt: { type: Date, default: Date.now },
  fileSize: { type: Number },
  duration: { type: Number },
});

// Create compound index for fingerprint matching
SongSchema.index({ "fingerprints.hash": 1 });

const Song: Model<ISong> =
  mongoose.models.Song || mongoose.model<ISong>("Song", SongSchema);

export default Song;
