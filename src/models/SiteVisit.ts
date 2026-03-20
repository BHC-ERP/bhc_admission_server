import mongoose, { Document, Schema } from "mongoose";

export interface ISiteVisit extends Document {
  session_id: string;
  ip_address: string;
  user_agent: string;
  country: string | null;
  country_code: string | null;
  region: string | null;
  lat: number | null;
  lon: number | null;
  page: string | null;
  created_at: Date;
  last_active: Date;
}

const SiteVisitSchema = new Schema<ISiteVisit>(
  {
    session_id: { type: String, required: true, unique: true, index: true },
    ip_address: { type: String, default: null },
    user_agent: { type: String, default: null },
    country: { type: String, default: null },
    country_code: { type: String, default: null },
    region: { type: String, default: null },
    lat: { type: Number, default: null },
    lon: { type: Number, default: null },
    page: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
    last_active: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// TTL index — auto-delete records older than 90 days
SiteVisitSchema.index({ created_at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

// Compound index for geo queries
SiteVisitSchema.index({ lat: 1, lon: 1 });
SiteVisitSchema.index({ last_active: -1 });
SiteVisitSchema.index({ created_at: -1 });

export const SiteVisit = mongoose.model<ISiteVisit>("SiteVisit", SiteVisitSchema);