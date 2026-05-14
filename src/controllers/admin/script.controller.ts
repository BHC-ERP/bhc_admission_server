import { Request, Response } from 'express';
import mongoose from 'mongoose';
import CandidateAdmission from '../../models/candidate.model';

export const fixAdmissionDates = async (req: Request, res: Response) => {
  try {
    const candidates = await CandidateAdmission.find({
      "application_preferences.applications.admission_details.admission_date": { $exists: true }
    });
    
    let totalMatched = 0;
    let totalModified = 0;

    for (const doc of candidates) {
      if (!doc.application_preferences || !doc.application_preferences.applications) continue;
      
      for (let appIndex = 0; appIndex < doc.application_preferences.applications.length; appIndex++) {
        const app = doc.application_preferences.applications[appIndex];
        const admitDate = app.admission_details?.admission_date;
        if (!admitDate) continue;

        const date = new Date(admitDate);
        const month = date.getUTCMonth() + 1;
        const day = date.getUTCDate();

        if (month !== 5) {
          const swapped = new Date(
            `${date.getUTCFullYear()}-${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}T${date.toISOString().slice(11)}`
          );

          const fieldPath = `application_preferences.applications.${appIndex}.admission_details.admission_date`;

          const result = await CandidateAdmission.updateOne(
            { _id: doc._id },
            { $set: { [fieldPath]: swapped } }
          );

          if (result.matchedCount) totalMatched += result.matchedCount;
          if (result.modifiedCount) totalModified += result.modifiedCount;
          console.log(`reg: ${doc.registration_number} | matched: ${result.matchedCount} | modified: ${result.modifiedCount} | ${date.toISOString()} -> ${swapped.toISOString()}`);
        }
      }
    }

    return res.status(200).json({ success: true, message: "Date swap completed", matched: totalMatched, modified: totalModified });
  } catch (error) {
    console.error("Error fixing dates:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const processSwipePayments = async (req: Request, res: Response) => {
  try {
    const feeDb = mongoose.connection.useDb("fee_collection");
    const admissionDb = mongoose.connection.useDb("admission2026");

    const swipeCollection = feeDb.collection("swipepayments");
    const feesMasterCollection = admissionDb.collection("candidate_fees_master");
    
    const candidates = await CandidateAdmission.find({});
    
    let totalAdmissionsModified = 0;
    let totalFeesMasterModified = 0;

    for (const doc of candidates) {
      const applications = doc?.application_preferences?.applications;
      if (!applications || !Array.isArray(applications)) continue;

      for (let appIndex = 0; appIndex < applications.length; appIndex++) {
        const app = applications[appIndex];
        if ((app.status as string) !== "ADMITTED") continue;
        if (app.admission_details?.admission_date) continue;

        const swipe = await swipeCollection.findOne({ application_number: app.application_number });
        if (!swipe) {
          console.log(`SKIP reg: ${doc.registration_number} | app: ${app.application_number} - not in swipepayments`);
          continue;
        }

        const admissionDate = swipe.updatedAt;
        const fieldPath = `application_preferences.applications.${appIndex}.admission_details`;

        // 1. Update candidateadmissions
        const r1 = await CandidateAdmission.updateOne(
          { _id: doc._id },
          {
            $set: {
              [fieldPath]: {
                admit_status: "Yes",
                admission_date: admissionDate
              }
            }
          }
        );

        // 2. Update candidate_fees_master transaction_date
        const r2 = await feesMasterCollection.updateOne(
          { application_number: app.application_number },
          { $set: { transaction_date: admissionDate } }
        );

        if (r1.modifiedCount) totalAdmissionsModified += r1.modifiedCount;
        if (r2.modifiedCount) totalFeesMasterModified += r2.modifiedCount;

        console.log(`reg: ${doc.registration_number} | app: ${app.application_number} | admissions: ${r1.modifiedCount} | fees_master: ${r2.modifiedCount} | date: ${admissionDate}`);
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: "Swipe payments processed", 
      admissionsModified: totalAdmissionsModified,
      feesMasterModified: totalFeesMasterModified
    });
  } catch (error) {
    console.error("Error processing swipe payments:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};
