import { Request, Response } from 'express';
import * as xlsx from 'xlsx';
import mongoose from 'mongoose';
import Transaction from '../models/transaction.model';
import CandidateAdmission from '../models/candidate.model';
import { createCandidateService, addMoreCandidateCoursesService } from '../services/candidate.service';
import { createPaymentAuditLog } from '../services/auditlog.service';
import { sendSMSService } from '../services/sms.service';
import { sendMailService } from '../services/mail.service';

export const uploadTransactions = async (req: Request, res: Response): Promise<any> => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No excel file uploaded" });
        }

        // Parse excel from buffer
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Convert sheet to json
        const data: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });

        const operations = data.map(row => {
            const getStr = (key: string) => row[key] ? String(row[key]).trim() : '';
            const getNum = (key: string) => row[key] ? Number(row[key]) : 0;
            const getDate = (key: string) => row[key] ? new Date(row[key]) : undefined;

            const mappedData = {
                ccavenueRef: getStr('CCAvenue Ref#'),
                orderType: getStr('order type'),
                orderNo: getStr('Order No'),
                orderDatetime: getDate('Order Datetime'),
                shipDateTime: getDate('Ship Date Time'),
                orderTypeCode: getStr('order_type'),
                paymentMode: getStr('Payment Mode'),
                cardType: getStr('Card Type'),
                cardName: getStr('Card Name'),
                currency: getStr('Currency'),
                grossAmount: getNum('Gross Amount'),
                discount: getNum('Discount'),
                orderAmount: getNum('Order Amount'),
                feePercValue: getNum('Fee Perc Value'),
                feeFlat: getNum('Fee Flat'),
                tax: getNum('Tax'),
                tds: getNum('TDS'),
                billName: getStr('Bill Name'),
                billAddress: getStr('Bill Address'),
                billCity: getStr('Bill City'),
                billState: getStr('Bill State'),
                billZip: getStr('Bill Zip'),
                billCountry: getStr('Bill Country'),
                billTel: getStr('Bill Tel'),
                billEmail: getStr('Bill Email'),
                shipName: getStr('ship Name'),
                shipAddress: getStr('Ship Address'),
                shipCity: getStr('Ship City'),
                shipState: getStr('Ship State'),
                shipZip: getStr('Ship Zip'),
                shipCountry: getStr('Ship Country'),
                shipTel: getStr('Ship Tel'),
                instructions: getStr('Instructions'),
                fraudStatus: getStr('Fraud Status'),
                refundAmount: getNum('Refund Amount'),
                websiteUrl: getStr('Website URL'),
                orderBankResponse: getStr('Order Bank Response'),
                orderStatus: getStr('Order Status'),
                subAccId: getStr('Sub Acc Id'),
                orderBinCountry: getStr('Order Bin Country'),
                orderStlmtDate: getStr('Order Stlmt Date'),
                cardEnrolled: getStr('Card Enrolled'),
                merchantParam1: getStr('Merchant Param1'),
                merchantParam2: getStr('Merchant Param2'),
                merchantParam3: getStr('Merchant Param3'),
                merchantParam4: getStr('Merchant Param4'),
                merchantParam5: getStr('Merchant Param5'),
                deviceType: getStr('Device Type'),
                customerIP: getStr('Customer IP'),
                orderBankRefNo: getStr('order_bank_ref_no'),
                orderBankArnNo: getStr('order_bank_arn_no'),
                orderSplitPayout: getStr('order_split_payout'),
                emiIssuingBank: getStr('emi_issuing_bank'),
                tenureDuration: getStr('tenure_duration'),
                emiDiscountType: getStr('emi_discount_type'),
                emiDiscountValue: getNum('emi discount value'),
                orderCaptAmt: getNum('order capt amt'),
                merchantChargeRef: getStr('Merchant Charge Ref'),
                orderBankQSI: getStr('Order BankQSI'),
                tpvAccountNo: getStr('TPV Account No.'),
                orderVpa: getStr('order_vpa'),
                cardNumber: getStr('Card_Number'),
                npciMessage: getStr('NPCI Message'),
                npciCode: getStr('NPCI Code'),
                acquiringBank: getStr('acquiring Bank'),
                issuingBank: getStr('Issuing Bank'),
                bankTid: getStr('Bank Tid'),
                legalEntityName: getStr('Legal Entity Name'),
                dbaName: getStr('Dba Name'),
                transactionTid: getStr('Transaction Tid'),
                disputeStatus: getStr('dispute_status'),
                settingSplitRefund: getStr('setting_split_refund'),
                splitSubAccId: getStr('Split_sub_acc_id'),
                altId: getStr('alt_id'),
                altIdExpiry: getStr('alt_id_expiry'),
                altIdCryptogram: getStr('alt_id_cryptogram'),
                orderAltIdResponse: getStr('order_alt_id_response'),
                isTokenized: getStr('is_tokenized'),
                isCorp: getStr('is_corp'),
                orderEmiDiscount: getNum('order_emi_discount')
            };

            // Filter out orderNo empty cases if any junk rows exist
            if (!mappedData.orderNo) return null;

            return {
                updateOne: {
                    filter: { orderNo: mappedData.orderNo },
                    update: { $set: mappedData },
                    upsert: true
                }
            };
        }).filter(op => op !== null);

        if (operations.length > 0) {
            await Transaction.bulkWrite(operations as any[]);
        }

        return res.status(200).json({
            message: "Excel data migrated successfully",
            migratedCount: operations.length
        });
    } catch (error: any) {
        console.error("Excel processing error: ", error);
        return res.status(500).json({ message: "Error migrating data", error: error?.message });
    }
};
