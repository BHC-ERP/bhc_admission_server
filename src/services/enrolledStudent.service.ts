import CandidateAdmission from "../models/candidate.model";
import EnrolledStudent from "../models/enrolledStudent.model";
import { heberReady, getHeberDb } from "../config/heber.db";
import { transformToEnrolledStudent } from "../utils/enrolledStudentTransform";

export const migrateAllAdmittedCandidates = async () => {
  const existing = await EnrolledStudent.find({}, { application_no: 1 }).lean();
  const existingAppNos = new Set(existing.map((e: any) => e.application_no));

  const candidates = await CandidateAdmission.find({
    "application_preferences.applications": { $elemMatch: { status: "ADMITTED" } },
  }).lean();

  await heberReady;
  const db = getHeberDb();
  const deptCol = db?.collection("departments");

  const docs: any[] = [];

  let skipped = 0;

  for (const candidate of candidates) {
    const app = candidate.application_preferences?.applications?.find(
      (a: any) => a.status === "ADMITTED"
    );
    if (!app) continue;

    if (existingAppNos.has(app.application_number)) {
      skipped++;
      continue;
    }

    let program: any = null;
    if (deptCol) {
      try {
        const deptDoc = await deptCol.findOne(
          { "programs.program_id": app.program_code },
          { projection: { department_code: 1, department_name: 1, "programs.$": 1 } }
        );
        if (deptDoc?.programs?.length) {
          const p = deptDoc.programs[0];
          program = {
            department_code: deptDoc.department_code || "",
            department_name: deptDoc.department_name || "",
            program_name: p.program_name || "",
          };
        }
      } catch {
        // heber_erp lookup failed, proceed without program data
      }
    }

    const doc = transformToEnrolledStudent(candidate, app, program);
    docs.push(doc);
  }

  if (docs.length === 0) {
    return { migrated: 0, skipped, total: 0 };
  }

  const result = await EnrolledStudent.bulkWrite(
    docs.map((d) => ({
      insertOne: { document: d },
    })),
    { ordered: false }
  );

  return {
    migrated: result.insertedCount,
    skipped,
    total: docs.length,
  };
};

export const getEnrolledStudents = async (filters: any = {}) => {
  return EnrolledStudent.find(filters).lean();
};

export const saveRollNumbers = async (
  rollNumbers: Array<{
    application_no: number;
    roll_number: string;
    section: string;
    shift: string;
  }>
) => {
  const changes: Array<{ old: any; new: any }> = [];

  for (const item of rollNumbers) {
    if (!item.application_no) continue;

    const oldDoc = await EnrolledStudent.findOne({ application_no: item.application_no }).lean();

    const updateData: any = {};
    if (item.roll_number) updateData.roll_no = Number(item.roll_number);
    if (item.section) updateData["current_academic.section"] = item.section;
    if (item.shift) updateData.shift = item.shift;

    const result = await EnrolledStudent.updateOne(
      { application_no: item.application_no },
      { $set: updateData }
    );

    if (result.modifiedCount > 0) {
      changes.push({ old: oldDoc, new: { ...oldDoc, ...updateData } });

      // Sync to heber-erp students collection
      if (updateData.roll_no) {
        try {
          await heberReady;
          const db = getHeberDb();
          if (db) {
            await db.collection("students").updateOne(
              { roll_no: updateData.roll_no },
              { $set: { ...updateData, updatedAt: new Date() } }
            );
          }
        } catch (err) {
          console.error(`[SYNC_ERROR] Failed to sync roll_no ${updateData.roll_no} to students collection:`, err);
        }
      }
    }
  }

  return { matched: changes.length, modified: changes.length, changes };
};

export const updateStudentById = async (id: string, data: any) => {
  const oldDoc = await EnrolledStudent.findById(id).lean();
  if (!oldDoc) return null;
  const newDoc = await EnrolledStudent.findByIdAndUpdate(id, data, { new: true }).lean();

  // Sync to heber-erp students collection
  if (newDoc?.roll_no) {
    try {
      await heberReady;
      const db = getHeberDb();
      if (db) {
        await db.collection("students").updateOne(
          { roll_no: newDoc.roll_no },
          { $set: { ...data, updatedAt: new Date() } }
        );
      }
    } catch (err) {
      console.error(`[SYNC_ERROR] Failed to sync roll_no ${newDoc.roll_no} to students collection:`, err);
    }
  }

  return { old: oldDoc, new: newDoc };
};
