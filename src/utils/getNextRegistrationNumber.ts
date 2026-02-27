import { Counter } from "../models/auth/registercounter.model";
import CandidateAdmission from "../models/candidate.model";


export const getNextRegistrationNumber = async (): Promise<number> => {
    const counter = await Counter.findOneAndUpdate(
        { _id: "registration_number" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );

    return counter.seq;
};


export const createCandidateWithRetry: any = async (candidateData: any, retries = 3) => {
    try {
        return await CandidateAdmission.create(candidateData);
    } catch (err: any) {
        if (err.code === 11000 && retries > 0) {
            candidateData.registration_number = await getNextRegistrationNumber();
            return createCandidateWithRetry(candidateData, retries - 1);
        }
        throw err;
    }
};