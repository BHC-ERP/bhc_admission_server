import { Request, Response } from 'express';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

export const backupDatabaseJSON = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!mongoose.connection.db) {
            res.status(500).json({ error: 'Database connection not established' });
            return;
        }

        // Create a unique folder for this backup
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const backupDir = path.join(process.cwd(), 'backups', `database-backup-${timestamp}`);

        // Ensure the backup directory exists
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const collections = await mongoose.connection.db.collections();
        console.log(`Starting backup of ${collections.length} collections down to ${backupDir}...`);

        for (const collection of collections) {
            const name = collection.collectionName;
            const filePath = path.join(backupDir, `${name}.json`);

            // Stream the JSON into the file to save memory
            const writeStream = fs.createWriteStream(filePath);
            writeStream.write('[\n');

            const cursor = collection.find({});
            let isFirst = true;

            for await (const doc of cursor) {
                if (!isFirst) {
                    writeStream.write(',\n');
                }
                writeStream.write('  ' + JSON.stringify(doc));
                isFirst = false;
            }

            writeStream.write('\n]\n');
            writeStream.end();

            console.log(`Saved collection: ${name}.json`);
        }

        // Respond to the client that the backup was successful
        res.json({
            success: true,
            message: `Entire database successfully saved one by one!`,
            location: backupDir,
            collections_saved: collections.length
        });

    } catch (error) {
        console.error('Backup Saving Error:', error);
        res.status(500).json({ error: 'Failed to generate JSON backup files' });
    }
};
