import mongoose from "mongoose";

// Counter Schema for Application Numbers
const ApplicationCounterSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    sequence_value: { type: Number, required: true, default: 260000 }
});

export const ApplicationCounter = mongoose.model("ApplicationCounter", ApplicationCounterSchema);


// Helper function to get next application numbers
export async function getNextApplicationNumbers(count: number): Promise<number[]> {
    const counter = await ApplicationCounter.findOneAndUpdate(
        { name: "application_number" },
        { $inc: { sequence_value: count } },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    );

    const startNumber = counter.sequence_value - count + 1;
    return Array.from({ length: count }, (_, i) => startNumber + i);
}
