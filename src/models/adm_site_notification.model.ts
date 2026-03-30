import mongoose, { Schema, Document } from "mongoose";

export interface IAdmSiteNotification extends Document {
    title: string;
    description: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const AdmSiteNotificationSchema: Schema = new Schema(
    {
        title: { type: String, required: true },
        description: { type: String, required: true },
        isActive: { type: Boolean, default: true },
    },
    {
        timestamps: true,
        collection: "adm_site_notifications"
    }
);

export default mongoose.model<IAdmSiteNotification>("AdmSiteNotification", AdmSiteNotificationSchema);
