import mongoose, { Schema, Document } from "mongoose";

export interface ITransaction extends Document {
  ccavenueRef: string;
  orderType: string;
  orderNo: string;
  orderDatetime: Date;
  shipDateTime: Date;
  orderTypeCode: string;

  paymentMode: string;
  cardType: string;
  cardName: string;
  currency: string;

  grossAmount: number;
  discount: number;
  orderAmount: number;
  feePercValue: number;
  feeFlat: number;
  tax: number;
  tds: number;

  billName: string;
  billAddress: string;
  billCity: string;
  billState: string;
  billZip: string;
  billCountry: string;
  billTel: string;
  billEmail: string;

  shipName: string;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
  shipTel: string;

  instructions: string;
  fraudStatus: string;
  refundAmount: number;
  websiteUrl: string;

  orderBankResponse: string;
  orderStatus: string;
  subAccId: string;
  orderBinCountry: string;
  orderStlmtDate: string;
  cardEnrolled: string;

  merchantParam1: string;
  merchantParam2: string;
  merchantParam3: string;
  merchantParam4: string;
  merchantParam5: string;

  deviceType: string;
  customerIP: string;
  orderBankRefNo: string;
  orderBankArnNo: string;
  orderSplitPayout: string;

  emiIssuingBank: string;
  tenureDuration: string;
  emiDiscountType: string;
  emiDiscountValue: number;

  orderCaptAmt: number;
  merchantChargeRef: string;
  orderBankQSI: string;
  tpvAccountNo: string;

  orderVpa: string;
  cardNumber: string;

  npciMessage: string;
  npciCode: string;

  acquiringBank: string;
  issuingBank: string;
  bankTid: string;

  legalEntityName: string;
  dbaName: string;
  transactionTid: string;

  disputeStatus: string;
  settingSplitRefund: string;
  splitSubAccId: string;

  altId: string;
  altIdExpiry: string;
  altIdCryptogram: string;
  orderAltIdResponse: string;

  isTokenized: string;
  isCorp: string;
  orderEmiDiscount: number;
}

const transactionSchema = new Schema<ITransaction>({
  ccavenueRef: { type: String },
  orderType: { type: String },
  orderNo: { type: String, unique: true, index: true },
  orderDatetime: { type: Date },
  shipDateTime: { type: Date },
  orderTypeCode: { type: String },

  paymentMode: { type: String },
  cardType: { type: String },
  cardName: { type: String },
  currency: { type: String },

  grossAmount: { type: Number },
  discount: { type: Number },
  orderAmount: { type: Number },
  feePercValue: { type: Number },
  feeFlat: { type: Number },
  tax: { type: Number },
  tds: { type: Number },

  billName: { type: String },
  billAddress: { type: String },
  billCity: { type: String },
  billState: { type: String },
  billZip: { type: String },
  billCountry: { type: String },
  billTel: { type: String },
  billEmail: { type: String },

  shipName: { type: String },
  shipAddress: { type: String },
  shipCity: { type: String },
  shipState: { type: String },
  shipZip: { type: String },
  shipCountry: { type: String },
  shipTel: { type: String },

  instructions: { type: String },
  fraudStatus: { type: String },
  refundAmount: { type: Number },
  websiteUrl: { type: String },

  orderBankResponse: { type: String },
  orderStatus: { type: String },
  subAccId: { type: String },
  orderBinCountry: { type: String },
  orderStlmtDate: { type: String },
  cardEnrolled: { type: String },

  merchantParam1: { type: String },
  merchantParam2: { type: String },
  merchantParam3: { type: String },
  merchantParam4: { type: String },
  merchantParam5: { type: String },

  deviceType: { type: String },
  customerIP: { type: String },
  orderBankRefNo: { type: String },
  orderBankArnNo: { type: String },
  orderSplitPayout: { type: String },

  emiIssuingBank: { type: String },
  tenureDuration: { type: String },
  emiDiscountType: { type: String },
  emiDiscountValue: { type: Number },

  orderCaptAmt: { type: Number },
  merchantChargeRef: { type: String },
  orderBankQSI: { type: String },
  tpvAccountNo: { type: String },

  orderVpa: { type: String },
  cardNumber: { type: String },

  npciMessage: { type: String },
  npciCode: { type: String },

  acquiringBank: { type: String },
  issuingBank: { type: String },
  bankTid: { type: String },

  legalEntityName: { type: String },
  dbaName: { type: String },
  transactionTid: { type: String },

  disputeStatus: { type: String },
  settingSplitRefund: { type: String },
  splitSubAccId: { type: String },

  altId: { type: String },
  altIdExpiry: { type: String },
  altIdCryptogram: { type: String },
  orderAltIdResponse: { type: String },

  isTokenized: { type: String },
  isCorp: { type: String },
  orderEmiDiscount: { type: Number }

}, { timestamps: true });

export default mongoose.model<ITransaction>("Transaction_test", transactionSchema);
