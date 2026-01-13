import type { FileNode } from "./contentApi";

export interface ContentRepository {
    listFiles(): Promise<FileNode[]>;
    loadFile(path: string): Promise<string>;
    saveFile(path: string, content: string): Promise<void>;
    listBlocks(): Promise<{ id: string; title: string }[]>;
    loadBlock(id: string): Promise<string>;
}

// IndexedDB Helpers
const DB_NAME = "TeacherDocs_FS";
const STORE_NAME = "handles";

function getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveHandle(handle: FileSystemDirectoryHandle) {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, "root");
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get("root");
    return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle || null);
        req.onerror = () => resolve(null);
    });
}

let rootHandle: FileSystemDirectoryHandle | null = null;

export const fileSystemApi = {
    async open() {
        try {
            // @ts-ignore
            rootHandle = await window.showDirectoryPicker();
            if (rootHandle) {
                try {
                    await saveHandle(rootHandle);
                } catch (e) {
                    console.warn("Failed to save handle", e);
                }
            }
        } catch (e) {
            console.error("User cancelled folder picker", e);
            throw e;
        }
    },

    async reset() {
        rootHandle = null;
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete("root");
    },

    async initRepo() {
        try {
            // @ts-ignore
            rootHandle = await window.showDirectoryPicker();
            if (!rootHandle) throw new Error("No handle");

            try {
                await saveHandle(rootHandle);
            } catch (e) {
                console.warn("Failed to save handle in initRepo", e);
            }

            await rootHandle.getDirectoryHandle("docs", { create: true });
            await rootHandle.getDirectoryHandle("assets", { create: true });
            await rootHandle.getDirectoryHandle("blocks", { create: true });
            await rootHandle.getDirectoryHandle("templates", { create: true });
        } catch (e) {
            console.error("Init repo failed", e);
            throw e;
        }
    },

    async listFiles(): Promise<FileNode[]> {
        if (!rootHandle) {
            // Try to restore from IndexedDB
            try {
                rootHandle = await loadHandle();
            } catch (e) {
                console.warn("Failed to load handle", e);
            }

            if (rootHandle) {
                // @ts-ignore
                const perm = await rootHandle.queryPermission({ mode: "read" });
                if (perm !== "granted") {
                    try {
                        // @ts-ignore
                        if ((await rootHandle.requestPermission({ mode: "read" })) !== "granted") {
                            rootHandle = null;
                        }
                    } catch {
                        // Permission request failed (likely needs user gesture)
                        rootHandle = null;
                    }
                }
            }

            // If still no handle, try to open (will fail if no user gesture, returning empty list)
            if (!rootHandle) {
                try {
                    await this.open();
                } catch (e) {
                    return [];
                }
            }
        }

        if (!rootHandle) return [];

        const files: FileNode[] = [];

        async function traverse(dirHandle: FileSystemDirectoryHandle, path: string) {
            // @ts-ignore
            for await (const entry of dirHandle.values()) {
                const entryPath = path ? `${path}/${entry.name}` : entry.name;
                if (entry.kind === "file") {
                    files.push({ path: entryPath, kind: "file" });
                } else if (entry.kind === "directory") {
                    if (entry.name === ".git" || entry.name === "node_modules") continue;
                    
                    files.push({ path: entryPath, kind: "dir" });
                    // entry is already the handle
                    await traverse(entry as any, entryPath);
                }
            }
        }

        await traverse(rootHandle, "");
        return files;
    },

    async loadFile(path: string): Promise<string> {
        if (!rootHandle) throw new Error("No folder open");
        
        const parts = path.split("/");
        const fileName = parts.pop()!;
        let dirHandle = rootHandle;

        for (const part of parts) {
            dirHandle = await dirHandle.getDirectoryHandle(part);
        }

        const fileHandle = await dirHandle.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        return await file.text();
    },

    async saveFile(path: string, content: string): Promise<void> {
        if (!rootHandle) throw new Error("No folder open");

        const parts = path.split("/");
        const fileName = parts.pop()!;
        let dirHandle = rootHandle;

        for (const part of parts) {
            dirHandle = await dirHandle.getDirectoryHandle(part, { create: true });
        }

        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        // @ts-ignore
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
    },

    async listBlocks(): Promise<{ id: string; title: string }[]> {
        const allFiles = await this.listFiles();
        const blocks: { id: string; title: string }[] = [];

        for (const f of allFiles) {
            if (f.kind === "file" && f.path.startsWith("blocks/") && f.path.endsWith(".md")) {
                const id = f.path.replace("blocks/", "").replace(".md", "");
                let title = id;
                try {
                    const content = await this.loadFile(f.path);
                    const firstLine = content.split("\n")[0]?.replace(/^#+\s*/, "") ?? "";
                    title = firstLine || id;
                } catch {
                    // If file can't be read, use id as title
                }
                blocks.push({ id, title });
            }
        }
        return blocks.sort((a, b) => a.id.localeCompare(b.id));
    },

    async loadBlock(id: string): Promise<string> {
        const path = `blocks/${id}.md`;
        return this.loadFile(path);
    }
};