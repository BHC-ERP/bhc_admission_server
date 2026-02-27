import mongoose, { Schema, model } from "mongoose";

interface ICounter {
    _id: string;
    seq: number;
}

const counterSchema = new Schema<ICounter>({
    _id: { type: String, required: true },
    seq: { type: Number, default: 202600000 } // start number
});

export const Counter = model<ICounter>("Counter", counterSchema);