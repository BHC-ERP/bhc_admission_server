import mongoose, { Schema, Document } from "mongoose";

/* =========================
   INTERFACES
========================= */

export interface IBasicInfo {
    name: string;
    gender: string;
    date_of_birth: Date;
    community: string;
    community_number?: string;
    other_community?: string;
    is_nri: boolean;
}

export interface IContactInfo {
    mobile: string;
    email: string;
}

export interface IApplicationInfo {
    application_count: number;
    application_type: "UG" | "PG";
    program_code: string[];
    program_names: string[];
    program_streams: string[];
}

export interface IPersonalDetails {
    basic_info: IBasicInfo;
    contact_info: IContactInfo;
    application_info: IApplicationInfo;
    address?: any;
}

export interface ICourse {
    id: string;
    code: string;
    name: string;
    type: string;
    stream: string;
    program_type: string;
    application_fee: number;
    count: number;
}

export interface ISelectedCourse {
    course: ICourse;
    scholarship_applied: boolean;
}

export interface IGatewayResponse {
    order_id: string;
    tracking_id: string;
    bank_ref_no: string;
    order_status: string;
    failure_message?: string;
    payment_mode: string;
    card_name: string;
    status_code?: string;
    status_message?: string;
    currency: string;
    amount: string;

    billing_name?: string;
    billing_address?: string;
    billing_city?: string;
    billing_state?: string;
    billing_zip?: string;
    billing_country?: string;
    billing_tel?: string;
    billing_email?: string;

    delivery_name?: string;
    delivery_address?: string;
    delivery_city?: string;
    delivery_state?: string;
    delivery_zip?: string;
    delivery_country?: string;
    delivery_tel?: string;

    merchant_param1?: string;
    merchant_param2?: string;
    merchant_param3?: string;
    merchant_param4?: string;
    merchant_param5?: string;

    vault?: string;
    offer_type?: string;
    offer_code?: string;
    discount_value?: string;
    mer_amount?: string;
    eci_value?: string;
    retry?: string;
    response_code?: string;
    billing_notes?: string;

    trans_date?: string;
    bin_country?: string;
    auth_ref_num?: string;
    trans_fee?: string;
    service_tax?: string;
}

export interface IPaymentDetails {
    payment_method: string;
    upi_id?: string;
    status: string;
    amount_paid: number;
    transaction_id: string;
    transaction_date: Date;
    exemption_reason?: string;
    bank_ref_no?: string;
    gateway_response: IGatewayResponse;
}

export interface PaymentAuditLog extends Document {
    personal_details: IPersonalDetails;
    selected_courses: ISelectedCourse[];
    payment_details: IPaymentDetails;
    step_completed?: number;
    createdAt: Date;
    updatedAt: Date;
}

/* =========================
   SCHEMAS
========================= */

const BasicInfoSchema = new Schema<IBasicInfo>({
    name: { type: String, required: true },
    gender: { type: String, required: true },
    date_of_birth: { type: Date, required: true },
    community: { type: String, required: true },
    community_number: { type: String },
    other_community: { type: String },
    is_nri: { type: Boolean, default: false }
});

const ContactInfoSchema = new Schema<IContactInfo>({
    mobile: { type: String, required: true },
    email: { type: String, required: true }
});

const ApplicationInfoSchema = new Schema<IApplicationInfo>({
    application_count: { type: Number, required: true },
    application_type: { type: String, enum: ["UG", "PG"], required: true },
    program_code: [{ type: String }],
    program_names: [{ type: String }],
    program_streams: [{ type: String }]
});

const CourseSchema = new Schema<ICourse>({
    id: { type: String },
    code: { type: String },
    name: { type: String },
    type: { type: String },
    stream: { type: String },
    program_type: { type: String },
    application_fee: { type: Number },
    count: { type: Number }
});

const SelectedCourseSchema = new Schema<ISelectedCourse>({
    course: CourseSchema,
    scholarship_applied: { type: Boolean, default: false }
});

const GatewayResponseSchema = new Schema<IGatewayResponse>(
    {},
    { strict: false } // flexible for CCAvenue fields
);

const PaymentDetailsSchema = new Schema<IPaymentDetails>({
    payment_method: { type: String, required: true },
    upi_id: { type: String },
    status: { type: String, required: true },
    amount_paid: { type: Number },
    transaction_id: { type: String },
    transaction_date: { type: Date },
    exemption_reason: { type: String },
    bank_ref_no: { type: String },
    gateway_response: GatewayResponseSchema
});

const PersonalDetailsSchema = new Schema<IPersonalDetails>({
    basic_info: BasicInfoSchema,
    contact_info: ContactInfoSchema,
    application_info: ApplicationInfoSchema,
    address: { type: Schema.Types.Mixed }
}, { strict: false });

/* =========================
   MAIN SCHEMA
========================= */

const Payment_audit_log = new Schema<PaymentAuditLog>(
    {
        personal_details: PersonalDetailsSchema,
        selected_courses: [SelectedCourseSchema],
        payment_details: PaymentDetailsSchema,
        step_completed: { type: Number }
    },
    { timestamps: true, strict: false }
);

export default mongoose.model<PaymentAuditLog>("Payment_audit_log", Payment_audit_log);