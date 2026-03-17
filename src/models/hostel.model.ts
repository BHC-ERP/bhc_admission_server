import mongoose, { Schema, Document } from "mongoose";

// Interface for Mess Fee Monthly Schedule
export interface IMessFeeSchedule {
    "June/July"?: number;
    "Aug"?: number;
    "Sep"?: number;
    "Oct"?: number;
    "Nov/Dec"?: number;
    "Jan"?: number;
    "Feb"?: number;
    "Mar"?: number;
}

// Interface for Mess Fee
export interface IMessFee {
    type: string;
    monthly_schedule?: IMessFeeSchedule;
    First_Instalment?: number;
    Second_Instalment?: number;
}

// Interface for Fee Breakup
export interface IFeeBreakup {
    First_Instalment?: number;
    Second_Instalment?: number;
    Establishment?: number;
    Room_Rent?: number;
    Mess?: number;
}

// Interface for AC Room Installments
export interface IACRoomInstallmentBreakup {
    Establishment: number;
    Room_Rent: number;
    Mess: number;
    Total: number;
}

export interface IACRoomInstallments {
    First_Instalment: IACRoomInstallmentBreakup;
    Second_Instalment: IACRoomInstallmentBreakup;
}

// Interface for Room
export interface IHostelRoom {
    room_type: string;
    total_fee: number;
    fee_breakup: IFeeBreakup;
    mess_fee?: IMessFee;
    installments?: IACRoomInstallments;
    mess_bill_in_advance?: boolean;
}

// Interface for complete Hostel object
export interface IHostel extends Document {
    hostel_type: string;
    gender: 'Male' | 'Female' | 'Other';
    rooms: IHostelRoom[];
}

// Mongoose Schemas
const MessFeeScheduleSchema = new Schema<IMessFeeSchedule>({
    "June/July": { type: Number },
    "Aug": { type: Number },
    "Sep": { type: Number },
    "Oct": { type: Number },
    "Nov/Dec": { type: Number },
    "Jan": { type: Number },
    "Feb": { type: Number },
    "Mar": { type: Number },
}, { _id: false });

const MessFeeSchema = new Schema<IMessFee>({
    type: { type: String },
    monthly_schedule: { type: MessFeeScheduleSchema },
    First_Instalment: { type: Number },
    Second_Instalment: { type: Number },
}, { _id: false });

const FeeBreakupSchema = new Schema<IFeeBreakup>({
    First_Instalment: { type: Number },
    Second_Instalment: { type: Number },
    Establishment: { type: Number },
    Room_Rent: { type: Number },
    Mess: { type: Number },
}, { _id: false });

const ACRoomInstallmentBreakupSchema = new Schema<IACRoomInstallmentBreakup>({
    Establishment: { type: Number, required: true },
    Room_Rent: { type: Number, required: true },
    Mess: { type: Number, required: true },
    Total: { type: Number, required: true },
}, { _id: false });

const ACRoomInstallmentsSchema = new Schema<IACRoomInstallments>({
    First_Instalment: { type: ACRoomInstallmentBreakupSchema, required: true },
    Second_Instalment: { type: ACRoomInstallmentBreakupSchema, required: true }
}, { _id: false });

const HostelRoomSchema = new Schema<IHostelRoom>({
    room_type: { type: String, required: true },
    total_fee: { type: Number, required: true },
    fee_breakup: { type: FeeBreakupSchema, required: true },
    mess_fee: { type: MessFeeSchema },
    installments: { type: ACRoomInstallmentsSchema },
    mess_bill_in_advance: { type: Boolean }
}, { _id: false });

const HostelSchema = new Schema<IHostel>({
    hostel_type: { type: String, required: true },
    gender: { 
        type: String, 
        required: true,
        enum: ['Male', 'Female', 'Other'] 
    },
    rooms: [HostelRoomSchema]
}, { timestamps: true });

export default mongoose.model<IHostel>("Hostel", HostelSchema, 'hostel_list');
