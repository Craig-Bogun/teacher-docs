import type { ContentAPI, FileNode } from "./contentApi";
import { seedFiles } from "./seedRepo";

function toTreeNodes(files: string[]): FileNode[] {
    const nodes: FileNode[] = [];
    const dirs = new Set<string>();

    for (const f of files) {
        const parts = f.split("/");
        let acc = "";
        for (let i = 0; i < parts.length - 1; i++) {
            acc = acc ? `${acc}/${parts[i]}` : parts[i];
            dirs.add(acc);
        }
    }

    for (const d of [...dirs].sort()) nodes.push({ path: d, kind: "dir" });
    for (const f of files.sort()) nodes.push({ path: f, kind: "file" });
    return nodes;
}

export class InMemoryAPI implements ContentAPI {
    private store: Record<string, string>;

    constructor(initial: Record<string, string>) {
        this.store = { ...initial };
    }

    async listFiles(): Promise<FileNode[]> {
        return toTreeNodes(Object.keys(this.store));
    }

    async loadFile(path: string): Promise<string> {
        const v = this.store[path];
        if (v == null) throw new Error(`File not found: ${path}`);
        return v;
    }

    async saveFile(path: string, content: string): Promise<void> {
        this.store[path] = content;
    }

    async listBlocks(): Promise<{ id: string; title: string }[]> {
        const blocks = Object.keys(this.store)
            .filter((p) => p.startsWith("blocks/") && p.endsWith(".md"))
            .map((p) => {
                const id = p.replace("blocks/", "").replace(".md", "");
                const firstLine = this.store[p]?.split("\n")[0]?.replace(/^#+\s*/, "") ?? id;
                return { id, title: firstLine || id };
            });
        return blocks.sort((a, b) => a.id.localeCompare(b.id));
    }

    async loadBlock(id: string): Promise<string> {
        const path = `blocks/${id}.md`;
        return this.loadFile(path);
    }
}

export const api = new InMemoryAPI(seedFiles);
