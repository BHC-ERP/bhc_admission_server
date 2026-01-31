import mongoose from "mongoose";
import fs from "fs";
import csv from "csv-parser";
import Programme from "../models/programs.model";
import { env } from "../config/env";

const CSV_FILE_PATH = "../bhc_admission_server/src/scripts/programs_1.csv";

const migrate = async () => {
    try {
        await mongoose.connect(env.MONGO_URI);
        console.log("✅ MongoDB connected");

        const docs: any[] = [];

        await new Promise<void>((resolve, reject) => {
            fs.createReadStream(CSV_FILE_PATH)
                .pipe(csv())
                .on("data", (row) => {
                    if (!row.program_code) return;

                    docs.push({
                        program_code: row.program_code.trim(),
                        program_name: row.program_name?.trim(),
                        department_code: row.department_code?.trim(),
                        type: row.type?.trim(),
                        program_type: row.program_type?.trim(),
                        special: row.special?.trim() || null,
                        show: row.show === "TRUE",
                        stream: row.stream?.trim(),
                        shift: row.shift?.trim(),
                        sanctioned_strength: Number(row.sanctioned_strength),
                    });
                })
                .on("end", resolve)
                .on("error", reject);
        });

        const result = await Programme.insertMany(docs, {
            ordered: false
        });

        console.log(`🎉 ${result.length} records inserted`);
    } catch (error: any) {
        console.error("❌ Migration failed:", error.message);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 MongoDB disconnected");
        process.exit(0);
    }
};

migrate();
