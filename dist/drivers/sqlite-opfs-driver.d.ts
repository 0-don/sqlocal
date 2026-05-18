import type { DriverConfig, Sqlite3InitModule, Sqlite3StorageType, SQLocalDriver } from '../types.js';
import { SQLiteMemoryDriver } from './sqlite-memory-driver.js';
/**
 * A SQLocal driver that implements the interface needed for
 * interacting with SQLite databases in the origin private file system.
 */
export declare class SQLiteOpfsDriver extends SQLiteMemoryDriver implements SQLocalDriver {
    readonly storageType: Sqlite3StorageType;
    constructor(sqlite3InitModule?: Sqlite3InitModule);
    init(config: DriverConfig): Promise<void>;
    isDatabasePersisted(): Promise<boolean>;
    import(database: ArrayBuffer | Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array<ArrayBuffer>>): Promise<void>;
    export(): Promise<{
        name: string;
        data: ArrayBuffer | Uint8Array<ArrayBuffer>;
    }>;
    clear(): Promise<void>;
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
    purgeOrphans(): Promise<string[]>;
    destroy(): Promise<void>;
}
