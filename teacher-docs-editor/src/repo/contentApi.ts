export type FileNode = {
    path: string;      // e.g. "docs/example.md"
    kind: "file" | "dir";
};

export interface ContentAPI {
    listFiles(): Promise<FileNode[]>;
    loadFile(path: string): Promise<string>;
    saveFile(path: string, content: string): Promise<void>;
    listBlocks(): Promise<{ id: string; title: string }[]>;
    loadBlock(id: string): Promise<string>;
}
