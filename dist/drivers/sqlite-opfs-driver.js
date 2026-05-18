import { normalizeDatabaseFile } from '../lib/normalize-database-file.js';
import { parseDatabasePath } from '../lib/parse-database-path.js';
import { SQLiteMemoryDriver } from './sqlite-memory-driver.js';
/**
 * A SQLocal driver that implements the interface needed for
 * interacting with SQLite databases in the origin private file system.
 */
export class SQLiteOpfsDriver extends SQLiteMemoryDriver {
    constructor(sqlite3InitModule) {
        super(sqlite3InitModule);
        Object.defineProperty(this, "storageType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'opfs'
        });
    }
    async init(config) {
        const { databasePath } = config;
        const flags = this.getFlags(config);
        if (!databasePath) {
            throw new Error('No databasePath specified');
        }
        if (!this.sqlite3InitModule) {
            const { default: sqlite3InitModule } = await import('@sqlite.org/sqlite-wasm');
            this.sqlite3InitModule = sqlite3InitModule;
        }
        if (!this.sqlite3) {
            this.sqlite3 = await this.sqlite3InitModule();
        }
        if (!('opfs' in this.sqlite3)) {
            throw new Error('OPFS not available');
        }
        if (this.db) {
            await this.destroy();
        }
        this.db = new this.sqlite3.oo1.OpfsDb(databasePath, flags);
        this.config = config;
        this.initWriteHook();
    }
    async isDatabasePersisted() {
        return navigator.storage?.persisted();
    }
    async import(database) {
        if (!this.sqlite3 || !this.config?.databasePath) {
            throw new Error('Driver not initialized');
        }
        await this.destroy();
        const data = await normalizeDatabaseFile(database, 'callback');
        await this.sqlite3.oo1.OpfsDb.importDb(this.config.databasePath, data);
    }
    async export() {
        if (!this.db || !this.config?.databasePath) {
            throw new Error('Driver not initialized');
        }
        let name, data;
        const path = parseDatabasePath(this.config.databasePath);
        const { directories, getDirectoryHandle } = path;
        name = path.fileName;
        const tempFileName = `backup-${Date.now()}--${name}`;
        const tempFilePath = `${directories.join('/')}/${tempFileName}`;
        this.db.exec({ sql: 'VACUUM INTO ?', bind: [tempFilePath] });
        const dirHandle = await getDirectoryHandle();
        const fileHandle = await dirHandle.getFileHandle(tempFileName);
        const file = await fileHandle.getFile();
        data = await file.arrayBuffer();
        await dirHandle.removeEntry(tempFileName);
        return { name, data };
    }
    async clear() {
        if (!this.config?.databasePath)
            throw new Error('Driver not initialized');
        await this.destroy();
        const { getDirectoryHandle, fileName, tempFileNames } = parseDatabasePath(this.config.databasePath);
        const dirHandle = await getDirectoryHandle();
        const fileNames = new Set([fileName, ...tempFileNames]);
        // Also sweep any leftover `backup-*--<fileName>` files. These are
        // created by `export()` (`VACUUM INTO ...`) and removed on the happy
        // path, but a crash or tab close during export can leave them behind.
        // Without this sweep they accumulate, contributing to OPFS bloat that
        // is opaque to consumers.
        const backupSuffix = `--${fileName}`;
        for await (const entryName of dirHandle.keys()) {
            if (entryName.startsWith('backup-') && entryName.endsWith(backupSuffix)) {
                fileNames.add(entryName);
            }
        }
        await Promise.all([...fileNames].map(async (name) => {
            return dirHandle.removeEntry(name).catch((err) => {
                if (!(err instanceof DOMException && err.name === 'NotFoundError')) {
                    throw err;
                }
            });
        }));
    }
    /**
     * Remove every OPFS entry in the database's directory that belongs to this
     * database (the main file, its `-journal` / `-wal` / `-shm` sidecars, and
     * any orphaned `backup-*--<fileName>` files from interrupted `export()`
     * calls). Returns the list of entry names that were removed. Unlike
     * `clear()`, this does not depend on the runtime SQLite state and can be
     * called even when the driver is not initialized, which makes it a useful
     * recovery path for users whose OPFS quota is being eaten by orphans the
     * regular SQLite shutdown sequence never managed to clean up.
     */
    async purgeOrphans() {
        if (!this.config?.databasePath)
            throw new Error('Driver not initialized');
        await this.destroy();
        const { getDirectoryHandle, fileName, tempFileNames } = parseDatabasePath(this.config.databasePath);
        const dirHandle = await getDirectoryHandle();
        const removed = [];
        const sidecarSet = new Set(tempFileNames);
        const backupSuffix = `--${fileName}`;
        for await (const entryName of dirHandle.keys()) {
            const isMain = entryName === fileName;
            const isSidecar = sidecarSet.has(entryName);
            const isBackup = entryName.startsWith('backup-') && entryName.endsWith(backupSuffix);
            if (!isMain && !isSidecar && !isBackup)
                continue;
            try {
                await dirHandle.removeEntry(entryName);
                removed.push(entryName);
            }
            catch (err) {
                if (!(err instanceof DOMException && err.name === 'NotFoundError')) {
                    throw err;
                }
            }
        }
        return removed;
    }
    async destroy() {
        this.closeDb();
        this.writeCallbacks.clear();
    }
}
//# sourceMappingURL=sqlite-opfs-driver.js.map