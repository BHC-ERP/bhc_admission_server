import { Request, Response } from "express";
import AdmSiteNotification from "../../models/adm_site_notification.model";

/**
 * @desc Get all notifications
 * @route GET /api/admin/adm_site/notification
 */
export const getNotification = async (req: Request, res: Response) => {
    try {
        const notifications = await AdmSiteNotification.find().sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: notifications.length,
            data: notifications
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch notifications",
            error: error.message
        });
    }
};

/**
 * @desc Create a new notification
 * @route POST /api/admin/adm_site/notification
 */
export const createNotification = async (req: Request, res: Response) => {
    try {
        const { title, description } = req.body;

        if (!title || !description) {
            return res.status(400).json({
                success: false,
                message: "Title and description are required"
            });
        }

        const notification = await AdmSiteNotification.create({
            title,
            description
        });

        res.status(201).json({
            success: true,
            message: "Notification created successfully",
            data: notification
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: "Failed to create notification",
            error: error.message
        });
    }
};

/**
 * @desc Update a notification
 * @route PUT /api/admin/adm_site/notification/:id
 */
export const updateNotification = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { title, description, isActive } = req.body;

        const notification = await AdmSiteNotification.findByIdAndUpdate(
            id,
            { title, description, isActive },
            { new: true, runValidators: true }
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Notification updated successfully",
            data: notification
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: "Failed to update notification",
            error: error.message
        });
    }
};

/**
 * @desc Delete a notification
 * @route DELETE /api/admin/adm_site/notification/:id
 */
export const deleteNotification = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const notification = await AdmSiteNotification.findByIdAndDelete(id);

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Notification deleted successfully"
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: "Failed to delete notification",
            error: error.message
        });
    }
};

/**
 * @desc Get all active notifications
 * @route GET /api/application_form/active_notifications
 */
export const getActiveNotifications = async (req: Request, res: Response) => {
    try {
        const notifications = await AdmSiteNotification.find({ isActive: true }).sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: notifications.length,
            data: notifications
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch active notifications",
            error: error.message
        });
    }
};
