
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import CandidateAdmission from '../../models/candidate.model';
import { reconcileSingleOrder, ReconcileItem } from '../../services/reconcile.service';
import { formatPaymentDate } from '../../utils/dateFormat';

let automationInterval: NodeJS.Timeout | null = null;
let isAutomationRunning = false;

/**
 * Core function to scan and reconcile missed payments.
 * This logic is based on getMissedPaymentsFull and bulkReconcile.
 */
export const performFullAutoReconciliation = async () => {
    console.log(`[Automation] Starting scheduled reconciliation at ${new Date().toLocaleString()}`);

    try {
        const paymentCollection = mongoose.connection.collection("payment_initiated");
        const payments = await paymentCollection.find({}).toArray();

        if (payments.length === 0) {
            console.log("[Automation] No missed payments found.");
            if (isAutomationRunning) {
                console.log("🛑 [Automation] Stopping automation automatically.");
                if (automationInterval) {
                    clearInterval(automationInterval);
                    automationInterval = null;
                }
                isAutomationRunning = false;
            }
            return { success: 0, failed: 0, skipped: 0 };
        }

        const orderIds = payments.map((p: any) => p.orderId).filter(Boolean);
        const ccCollection = mongoose.connection.useDb('ccavenue_payment').collection('ccavenue_admissions');

        // Fetch matching Success transactions from CCAvenue Logs
        const transactions = await ccCollection.find({
            "data.order_id": { $in: orderIds },
            "data.order_status": "Success"
        }).toArray() as any[];

        const transactionMap = new Map();
        transactions.forEach((t: any) => transactionMap.set(t.data.order_id, t));

        let reconciledCount = 0;
        let failedCount = 0;
        let skippedCount = 0;

        for (const p of payments) {
            const transaction = transactionMap.get(p.orderId);

            // We only auto-reconcile "Success" records from the CCAvenue log.
            if (!transaction) {
                skippedCount++;
                continue;
            }

            const mobile = p?.candidateDetails?.personal_details?.contact_info?.mobile;
            const reconcileItem: ReconcileItem = {
                orderId: p.orderId,
                isShipped: true,
                isAddMore: !!p.isAddMore,
                candidateDetails: p.candidateDetails,
                amount: transaction.data.amount || p.amount,
                transactionId: transaction.data.tracking_id || p.orderId,
                paymentDate: formatPaymentDate(transaction.data.trans_date) || p.timestamp,
                bankRefNo: transaction.data.bank_ref_no,
                actualStatus: transaction.data.order_status
            };

            const result = await reconcileSingleOrder(reconcileItem, 'System_Auto_1Hr');

            if (result.status === 'Success' || result.status === 'Moved to Refund') {
                reconciledCount++;
                console.log(`[Automation] Successfully reconciled Order: ${p.orderId} for Mobile: ${mobile}`);
            } else {
                failedCount++;
                console.error(`[Automation] Failed to reconcile Order: ${p.orderId}. Reason: ${result.message}`);
            }
        }

        console.log(`[Automation] Reconciliation Cycle Finished. Reconciled: ${reconciledCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`);

        // Automatically stop automation if all identified success payments are reconciled 
        // and no more pending payments exist in the initiated collection
        const remainingPending = await paymentCollection.countDocuments();
        if (remainingPending === 0 && isAutomationRunning) {
            console.log("🛑 [Automation] All payments reconciled. Stopping automation automatically.");
            if (automationInterval) {
                clearInterval(automationInterval);
                automationInterval = null;
            }
            isAutomationRunning = false;
        }

        return { success: reconciledCount, failed: failedCount, skipped: skippedCount };

    } catch (error) {
        console.error("[Automation] Critical error during reconciliation cycle:", error);
        return { error: true };
    }
};

/**
 * Route to toggle automation on/off
 */
export const toggleAutomation = async (req: Request, res: Response) => {
    const { action } = req.body; // 'start' or 'stop'

    if (action === 'start') {
        if (isAutomationRunning) {
            return res.status(400).json({ message: "Automation is already running" });
        }

        // Run immediately once
        performFullAutoReconciliation();

        // Then schedule every 1 hour
        automationInterval = setInterval(performFullAutoReconciliation, 60 * 60 * 1000);
        isAutomationRunning = true;

        console.log("🚀 [Automation] Background reconciliation started (1hr interval)");
        return res.json({ status: "running", message: "Automation started successfully" });
    }

    if (action === 'stop') {
        if (!isAutomationRunning) {
            return res.status(400).json({ message: "Automation is not running" });
        }

        if (automationInterval) {
            clearInterval(automationInterval);
            automationInterval = null;
        }
        isAutomationRunning = false;

        console.log("🛑 [Automation] Background reconciliation stopped manually");
        return res.json({ status: "stopped", message: "Automation stopped successfully" });
    }

    return res.status(400).json({ message: "Invalid action. Use 'start' or 'stop'." });
};

/**
 * Route to check automation status
 */
export const getAutomationStatus = async (req: Request, res: Response) => {
    res.json({
        isRunning: isAutomationRunning,
        interval: "1 Hour",
        lastRun: new Date().toLocaleString() // In a real app, store the actual lastRun timestamp
    });
};

/**
 * Trigger manual run via route
 */
export const triggerManualAutomationRun = async (req: Request, res: Response) => {
    const result = await performFullAutoReconciliation();
    res.json({
        message: "Manual automation run triggered",
        result
    });
};
