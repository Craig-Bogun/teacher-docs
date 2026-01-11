import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import FS from "@isomorphic-git/lightning-fs";
import type { FileNode } from "../repo/contentApi";

export type AppConfig = {
    repoType: "fs" | "online";
    gitUrl?: string;
    gitUsername?: string;
    gitToken?: string; // Sensitive
    gcClientId?: string;
    gcApiKey?: string; // Sensitive
};

const STORAGE_KEY = "teacher_docs_config";
const IV_LENGTH = 12;

// In a real production app, this key should be derived from a user password
// or retrieved from a secure enclave. For this standalone editor, we generate
// or retrieve a persistent key to obfuscate/encrypt data at rest in localStorage.
async function getEncryptionKey(): Promise<CryptoKey> {
    const keyData = localStorage.getItem("td_master_key");
    if (keyData) {
        const rawKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
        return window.crypto.subtle.importKey("raw", rawKey, "AES-GCM", true, ["encrypt", "decrypt"]);
    }

    const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const exported = await window.crypto.subtle.exportKey("raw", key);
    const b64 = btoa(String.fromCharCode(...new Uint8Array(exported as ArrayBuffer)));
    localStorage.setItem("td_master_key", b64);
    return key;
}

async function encrypt(text: string): Promise<string> {
    const key = await getEncryptionKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(text);

    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoded
    );

    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
}

async function decrypt(cipherText: string): Promise<string> {
    const key = await getEncryptionKey();
    const combined = Uint8Array.from(atob(cipherText), c => c.charCodeAt(0));
    const iv = combined.slice(0, IV_LENGTH);
    const data = combined.slice(IV_LENGTH);

    const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        data
    );

    return new TextDecoder().decode(decrypted);
}

export const configStore = {
    async hasConfig(): Promise<boolean> {
        return !!localStorage.getItem(STORAGE_KEY);
    },

    async save(config: AppConfig): Promise<void> {
        // Encrypt the whole object for simplicity
        const json = JSON.stringify(config);
        const encrypted = await encrypt(json);
        localStorage.setItem(STORAGE_KEY, encrypted);
    },

    async load(): Promise<AppConfig | null> {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        try {
            const json = await decrypt(raw);
            return JSON.parse(json);
        } catch (e) {
            console.error("Failed to decrypt config", e);
            return null;
        }
    },

    async clear(): Promise<void> {
        localStorage.removeItem(STORAGE_KEY);
    }
};

// Initialize LightningFS
const fs = new FS("teacher-docs-fs");
const pfs = fs.promises;
const dir = "/";

export const onlineRepoApi = {
    async _getConfig() {
        const config = await configStore.load();
        if (!config) throw new Error("Configuration not found");
        return config;
    },

    async listFiles(): Promise<FileNode[]> {
        const config = await this._getConfig();

        // Check if repo exists
        const isRepo = await git.resolveRef({ fs, dir, ref: "HEAD" }).catch(() => false);

        if (!isRepo && config.gitUrl) {
            try {
                await git.clone({
                    fs,
                    http,
                    dir,
                    url: config.gitUrl,
                    corsProxy: "https://cors.isomorphic-git.org",
                    onAuth: () => ({ username: config.gitToken || "", password: "" }),
                    singleBranch: true,
                    depth: 1,
                });
            } catch (e) {
                console.error("Clone failed", e);
                return [];
            }
        } else if (isRepo && config.gitUrl) {
            try {
                await git.pull({
                    fs,
                    http,
                    dir,
                    url: config.gitUrl,
                    corsProxy: "https://cors.isomorphic-git.org",
                    onAuth: () => ({ username: config.gitToken || "", password: "" }),
                    author: { name: config.gitUsername || "Teacher", email: "teacher@teacher.com" }
                });
            } catch (e) {
                console.warn("Pull failed", e);
            }
        }

        const files: FileNode[] = [];
        const processDir = async (path: string) => {
            let entries;
            try { entries = await pfs.readdir(path); } catch { return; }

            for (const entry of entries) {
                if (entry === ".git") continue;
                const fullPath = path === "/" ? `/${entry}` : `${path}/${entry}`;
                const stat = await pfs.stat(fullPath);
                if (stat.isDirectory()) {
                    files.push({ path: fullPath.startsWith("/") ? fullPath.slice(1) : fullPath, kind: "folder" } as any);
                    await processDir(fullPath);
                } else {
                    files.push({ path: fullPath.startsWith("/") ? fullPath.slice(1) : fullPath, kind: "file" });
                }
            }
        };
        await processDir(dir);
        return files;
    },

    async loadFile(path: string): Promise<string> {
        return await pfs.readFile(`/${path}`, "utf8") as string;
    },

    async saveFile(path: string, content: string): Promise<void> {
        const config = await this._getConfig();

        // Ensure directory exists
        const parts = path.split("/");
        if (parts.length > 1) {
            parts.pop();
            let current = "";
            for (const part of parts) {
                current = current ? `${current}/${part}` : `/${part}`;
                try { await pfs.stat(current); } catch { await pfs.mkdir(current); }
            }
        }

        await pfs.writeFile(`/${path}`, content, "utf8");

        if (config.gitUrl) {
            await git.add({ fs, dir, filepath: path });
            await git.commit({
                fs,
                dir,
                message: `Update ${path}`,
                author: { name: config.gitUsername || "Teacher", email: "teacher@teacher.com" },
            });
            await git.push({
                fs,
                http,
                dir,
                url: config.gitUrl,
                corsProxy: "https://cors.isomorphic-git.org",
                onAuth: () => ({ username: config.gitToken || "", password: "" }),
            });
        }
    },

    async listBlocks(): Promise<{ id: string; title: string }[]> {
        const files = await this.listFiles();
        return files.filter(f => f.path.endsWith(".md")).map(f => ({ id: f.path, title: f.path }));
    }
};