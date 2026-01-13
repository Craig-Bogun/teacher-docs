import { useEffect, useMemo, useRef, useState } from "react";

import type { FileNode } from "../repo/contentApi";
import { CodeMirrorEditor } from "../editor/CodeMirrorEditor";
import { renderAssembledHtml } from "../repo/blockResolver";
import { fileSystemApi } from "../repo/fileSystemApi";
import type { ContentRepository } from "../repo/fileSystemApi";
import { configStore, onlineRepoApi } from "./configStore";
import type { AppConfig } from "./configStore";

import "./styles.css";
import type { FileItem } from "../editor/Sidebar";

type Tab = "write" | "source" | "preview";

type TabDoc = {
    path: string;
    content: string;
    dirty: boolean;
};

export default function App() {
    const [isConfigured, setIsConfigured] = useState<boolean | null>(null); // null = checking, true = configured, false = not configured
    const [repo, setRepo] = useState<ContentRepository | null>(null);
    const [files, setFiles] = useState<FileNode[]>([]);
    const [tab, setTab] = useState<Tab>("write");
    const [previewHtml, setPreviewHtml] = useState<string>("");
    const [blocks, setBlocks] = useState<{ id: string; title: string }[]>([]);
    const [blockQuery, setBlockQuery] = useState("");
    const [showBlockPicker, setShowBlockPicker] = useState(false);
    const [showImagePicker, setShowImagePicker] = useState(false);
    const [showConsole, setShowConsole] = useState(false);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);

    // Save As / New File State
    const [saveAsState, setSaveAsState] = useState<{ isOpen: boolean; currentPath?: string }>({ isOpen: false });
    const [newFileName, setNewFileName] = useState("");
    const [newFileType, setNewFileType] = useState<"docs" | "blocks" | "templates">("docs");
    const [untitledCounter, setUntitledCounter] = useState(1);

    // Console / Settings State
    const [repoType, setRepoType] = useState<"fs" | "online">("fs");
    const [gitMode, setGitMode] = useState<"offline" | "online">("offline");
    const [gitCreds, setGitCreds] = useState({ username: "", token: "", url: "" });
    const [gcCreds, setGcCreds] = useState({ clientId: "", apiKey: "" });

    const imageResolver = useRef<((path: string | null) => void) | null>(null);

    // ---- Multi-doc tabs state ----
    const [openOrder, setOpenOrder] = useState<string[]>([]);
    const [tabsByPath, setTabsByPath] = useState<Record<string, TabDoc>>({});
    const [activePath, setActivePath] = useState<string>("docs/example.md");

    const activeTab = tabsByPath[activePath];

    const blockLabel = (id: string) => {
        const b = blocks.find((x) => x.id === id);
        return b ? b.title || b.id : id;
    };

    useEffect(() => {
        // Expose configStore to window for console access
        (window as any).configStore = configStore;
        
        // 1. Load Config on Startup
        (async () => {
            const config = await configStore.load();
            if (config) {
                setIsConfigured(true);
                setRepoType(config.repoType);
                setGitCreds({
                    url: config.gitUrl || "",
                    username: config.gitUsername || "",
                    token: config.gitToken || ""
                });
                setGcCreds({
                    clientId: config.gcClientId || "",
                    apiKey: config.gcApiKey || ""
                });

                // Initialize Repo based on config
                if (config.repoType === "fs") {
                    setRepo(fileSystemApi);
                } else {
                    setRepo(onlineRepoApi as any);
                }
            } else {
                // No config found - show welcome screen
                setIsConfigured(false);
            }
        })();
    }, []);

    useEffect(() => {
        if (repo) {
            refreshFileList();
        }
    }, [repo]);

    async function refreshFileList() {
        if (!repo) return;
        try {
            const f = await repo.listFiles();
            setFiles(f);
            const b = await repo.listBlocks();
            setBlocks(b);
        } catch (e) {
            console.error("Failed to list files", e);
        }
    }

    async function openTab(path: string, opts?: { activate?: boolean }) {
        if (!repo) return;
        const activate = opts?.activate ?? true;

        // already open
        if (tabsByPath[path]) {
            if (activate) setActivePath(path);
            return;
        }

        const c = await repo.loadFile(path);

        setTabsByPath((prev) => ({
            ...prev,
            [path]: { path, content: c, dirty: false },
        }));

        setOpenOrder((prev) => (prev.includes(path) ? prev : [...prev, path]));

        if (activate) setActivePath(path);
    }

    function createNewFile() {
        const name = `Untitled-${untitledCounter}`;
        setUntitledCounter(prev => prev + 1);
        setTabsByPath((prev) => ({
            ...prev,
            [name]: { path: name, content: "", dirty: true },
        }));
        setOpenOrder((prev) => [...prev, name]);
        setActivePath(name);
        setTab("write");
    }

    async function createFromTemplate(templatePath: string) {
        if (!repo) return;
        const content = await repo.loadFile(templatePath);
        const name = `Untitled-${untitledCounter}`;
        setUntitledCounter(prev => prev + 1);
        setTabsByPath((prev) => ({
            ...prev,
            [name]: { path: name, content: content, dirty: true },
        }));
        setOpenOrder((prev) => [...prev, name]);
        setActivePath(name);
        setTab("write");
        setShowTemplatePicker(false);
    }

    function updateActiveContent(newContent: string) {
        setTabsByPath((prev) => {
            const t = prev[activePath];
            if (!t) return prev;
            if (t.content === newContent) return prev;
            return {
                ...prev,
                [activePath]: { ...t, content: newContent, dirty: true },
            };
        });
    }

    async function saveActive() {
        if (!repo) return;
        const t = tabsByPath[activePath];
        if (!t) return;

        if (activePath.startsWith("Untitled-")) {
            setSaveAsState({ isOpen: true, currentPath: activePath });
            setNewFileName("New Document");
            setNewFileType("docs");
            return;
        }

        await repo.saveFile(activePath, t.content);

        setTabsByPath((prev) => ({
            ...prev,
            [activePath]: { ...prev[activePath], dirty: false },
        }));
    }

    async function performSaveAs() {
        if (!repo || !saveAsState.currentPath) return;
        
        const cleanName = newFileName.endsWith(".md") ? newFileName : `${newFileName}.md`;
        const newPath = `${newFileType}/${cleanName}`;
        
        const content = tabsByPath[saveAsState.currentPath].content;
        await repo.saveFile(newPath, content);
        
        // Rename tab
        const oldPath = saveAsState.currentPath;
        setTabsByPath(prev => {
            const copy = { ...prev };
            delete copy[oldPath];
            copy[newPath] = { path: newPath, content, dirty: false };
            return copy;
        });
        
        setOpenOrder(prev => prev.map(p => p === oldPath ? newPath : p));
        setActivePath(newPath);
        
        setSaveAsState({ isOpen: false });
        refreshFileList();
    }

    function closeTab(path: string) {
        const t = tabsByPath[path];
        if (!t) return;

        if (t.dirty) {
            const ok = window.confirm(`Close "${path}"?\nYou have unsaved changes.`);
            if (!ok) return;
        }

        setTabsByPath((prev) => {
            const copy = { ...prev };
            delete copy[path];
            return copy;
        });

        setOpenOrder((prev) => {
            const next = prev.filter((p) => p !== path);

            if (path === activePath) {
                const idx = prev.indexOf(path);
                const fallback = next[idx - 1] ?? next[idx] ?? next[0] ?? "";
                if (fallback) setActivePath(fallback);
            }

            return next;
        });
    }

    async function refreshPreview() {
        if (!repo) return;
        const raw = tabsByPath[activePath]?.content ?? "";
        const html = await renderAssembledHtml(raw, repo as any);
        setPreviewHtml(html);
    }

    const fileTree = useMemo(() => {
        const root: FileItem[] = [];

        const insert = (path: string, kind: "file" | "folder") => {
            const parts = path.split("/");
            let currentLevel = root;
            let currentPath = "";

            parts.forEach((part, index) => {
                const isLast = index === parts.length - 1;
                currentPath = currentPath ? `${currentPath}/${part}` : part;

                let existing = currentLevel.find((item) => item.name === part);

                if (!existing) {
                    existing = {
                        id: currentPath,
                        name: part,
                        type: isLast ? kind : "folder",
                        children: (isLast && kind === "file") ? undefined : [],
                    };
                    currentLevel.push(existing);
                }

                if (existing.children) {
                    currentLevel = existing.children;
                }
            });
        };

        files.forEach((f) => {
            insert(f.path, f.kind === "dir" ? "folder" : "file");
        });

        return root;
    }, [files]);

    const visibleBlocks = useMemo(() => {
        const q = blockQuery.trim().toLowerCase();
        if (!q) return blocks;
        return blocks.filter(
            (b) => b.id.toLowerCase().includes(q) || b.title.toLowerCase().includes(q)
        );
    }, [blockQuery, blocks]);

    function insertBlock(id: string) {
        // insert into active tab
        setTabsByPath((prev) => {
            const t = prev[activePath];
            if (!t) return prev;
            const nextContent = t.content + `\n\n[[block:${id}]]\n`;
            return {
                ...prev,
                [activePath]: { ...t, content: nextContent, dirty: true },
            };
        });

        setShowBlockPicker(false);
        setBlockQuery("");
    }

    function handleRequestImage(): Promise<string | null> {
        return new Promise((resolve) => {
            imageResolver.current = resolve;
            setShowImagePicker(true);
        });
    }

    function resolveImage(path: string | null) {
        if (imageResolver.current) {
            imageResolver.current(path);
            imageResolver.current = null;
        }
        setShowImagePicker(false);
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        if (!repo) return;
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async () => {
            const content = reader.result as string;
            // Copy to assets folder
            const path = `assets/${file.name}`;
            await repo.saveFile(path, content);
            
            // Refresh file list to show the new file if needed, or just resolve
            setFiles(await repo.listFiles());
            resolveImage(path);
        };
        reader.readAsDataURL(file);
    }

    async function handleSaveConfig(e?: React.MouseEvent) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        if (repoType === "fs") {
            try {
                // Check if API is available
                if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
                    // Open folder picker FIRST (requires user gesture)
                    await fileSystemApi.open();
                    
                    // Only save config after folder is selected
                    const config: AppConfig = {
                        repoType,
                        gitUrl: gitCreds.url,
                        gitUsername: gitCreds.username,
                        gitToken: gitCreds.token,
                        gcClientId: gcCreds.clientId,
                        gcApiKey: gcCreds.apiKey
                    };
                    await configStore.save(config);
                    
                    setRepo(fileSystemApi);
                    setIsConfigured(true);
                    setShowConsole(false);
                } else {
                    alert("File System Access API is not available in this browser. Please use a modern browser like Chrome, Edge, or Opera.");
                }
            } catch (e) {
                // User cancelled folder picker or error occurred
                // Stay in config mode - don't save anything
            }
        } else {
            // For online repo, save config immediately
            const config: AppConfig = {
                repoType,
                gitUrl: gitCreds.url,
                gitUsername: gitCreds.username,
                gitToken: gitCreds.token,
                gcClientId: gcCreds.clientId,
                gcApiKey: gcCreds.apiKey
            };
            await configStore.save(config);
            
            setRepo(onlineRepoApi as any);
            setIsConfigured(true);
            setShowConsole(false);
        }
    }

    async function handleInitRepo() {
        try {
            await fileSystemApi.initRepo();
            setRepoType("fs");
            setRepo(fileSystemApi);
            
            const config: AppConfig = {
                repoType: "fs",
                gitUrl: gitCreds.url,
                gitUsername: gitCreds.username,
                gitToken: gitCreds.token,
                gcClientId: gcCreds.clientId,
                gcApiKey: gcCreds.apiKey
            };
            await configStore.save(config);
            setIsConfigured(true);
            setShowConsole(false);
            refreshFileList();
        } catch (e) {
            // cancelled
        }
    }

    // Show loading state while checking config
    if (isConfigured === null) {
        return (
            <div className="shell" style={{ alignItems: "center", justifyContent: "center", background: "#f5f5f5" }}>
                <div style={{ color: "#666" }}>Loading...</div>
            </div>
        );
    }

    // Show welcome screen only when explicitly not configured
    if (!isConfigured) {
        return (
            <div className="shell" style={{ alignItems: "center", justifyContent: "center", background: "#f5f5f5" }}>
                <div className="modal" style={{ width: "500px", padding: "30px" }}>
                    <h1 style={{ marginTop: 0 }}>Welcome to Teacher Docs</h1>
                    <p style={{ color: "#666", marginBottom: "20px" }}>
                        To get started, please configure your repository settings.
                    </p>

                    <div className="sidebarSectionTitle">Repository Type</div>
                    <div style={{ display: "flex", gap: "10px", margin: "10px 0 20px" }}>
                        <button
                            className={`tab ${repoType === "fs" ? "active" : ""}`}
                            onClick={() => setRepoType("fs")}
                            style={{ flex: 1, justifyContent: "center" }}
                        >
                            📂 Local Folder
                        </button>
                        <button
                            className={`tab ${repoType === "online" ? "active" : ""}`}
                            onClick={() => setRepoType("online")}
                            style={{ flex: 1, justifyContent: "center" }}
                        >
                            ☁️ Online (Browser)
                        </button>
                    </div>

                    <div className="sidebarSectionTitle">Git Configuration</div>
                    <div style={{ display: "grid", gap: "10px", margin: "10px 0 20px" }}>
                        <input className="modalSearch" style={{ margin: 0 }} placeholder="Repository URL (https://github.com/...)" value={gitCreds.url} onChange={e => setGitCreds({ ...gitCreds, url: e.target.value })} />
                        {repoType === "online" && (
                            <>
                                <input className="modalSearch" style={{ margin: 0 }} placeholder="Username" value={gitCreds.username} onChange={e => setGitCreds({ ...gitCreds, username: e.target.value })} />
                                <input className="modalSearch" style={{ margin: 0 }} type="password" placeholder="Personal Access Token" value={gitCreds.token} onChange={e => setGitCreds({ ...gitCreds, token: e.target.value })} />
                            </>
                        )}
                        {repoType === "fs" && (
                            <div style={{ fontSize: "12px", color: "#666" }}>
                                For local folders, we recommend using your existing Git client (VS Code, Terminal, etc.) for version control.
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleSaveConfig}
                        style={{ width: "100%", padding: "12px", background: "#007bff", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                    >
                        {repoType === "fs" ? "Select Folder & Continue" : "Save & Continue"}
                    </button>

                    <div style={{ marginTop: "20px", textAlign: "center", fontSize: "13px", color: "#666" }}>
                        Or start fresh:
                        <button onClick={handleInitRepo} style={{ display: "block", width: "100%", marginTop: "8px", padding: "8px", background: "#fff", border: "1px solid #ccc", borderRadius: "6px", cursor: "pointer" }}>
                            ✨ Setup New Local Repo Structure
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="shell">
            <main className="main">
                <header className="topbar">
                    <button 
                        onClick={createNewFile}
                        style={{ marginRight: "12px", padding: "4px 8px", cursor: "pointer", fontWeight: "bold" }}
                    >
                        + New
                    </button>
                    <button 
                        onClick={() => setShowTemplatePicker(true)}
                        style={{ marginRight: "12px", padding: "4px 8px", cursor: "pointer" }}
                    >
                        + From Template
                    </button>
                    <div className="path">{activePath}</div>

                    <div className="tabs">
                        <button
                            className={tab === "write" ? "tab active" : "tab"}
                            onClick={() => setTab("write")}
                        >
                            Write
                        </button>

                        <button
                            className={tab === "source" ? "tab active" : "tab"}
                            onClick={() => setTab("source")}
                        >
                            Source
                        </button>

                        <button
                            className={tab === "preview" ? "tab active" : "tab"}
                            onClick={async () => {
                                setTab("preview");
                                await refreshPreview();
                            }}
                        >
                            Assembled Preview
                        </button>
                    </div>

                    <div style={{ flex: 1 }} />
                    
                    <button onClick={() => setShowConsole(true)} title="App Console">
                        ⚙️ Console
                    </button>

                </header>

                {/* document tabs strip */}
                <div className="docTabs">
                    {openOrder.map((p) => {
                        const t = tabsByPath[p];
                        const isActive = p === activePath;
                        const label = p.split("/").pop() ?? p;

                        return (
                            <div key={p} className={isActive ? "docTab active" : "docTab"}>
                                <button
                                    className="docTabBtn"
                                    onClick={() => setActivePath(p)}
                                    title={p}
                                >
                                    {t?.dirty ? "● " : ""}
                                    {label}
                                </button>
                                <button
                                    className="docTabClose"
                                    onClick={() => closeTab(p)}
                                    title="Close"
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>

                {tab === "preview" ? (
                    <section className="previewPane">
                        <div
                            className="previewInner"
                            dangerouslySetInnerHTML={{ __html: previewHtml }}
                        />
                    </section>
                ) : (
                    <section className="editorPane">
                        <CodeMirrorEditor
                            value={activeTab?.content ?? ""}
                            onChange={updateActiveContent}
                            onViewReady={() => {}}
                            mode={tab === "write" ? "write" : "source"}
                            blockLabel={blockLabel}
                            onOpenBlock={(id) => openTab(`blocks/${id}.md`, { activate: true })}
                            onInsertBlock={() => setShowBlockPicker(true)}
                            onSave={saveActive}
                            fileItems={fileTree}
                            onFileSelect={(item) => openTab(item.id, { activate: true })}
                            activeFileId={activePath}
                            onImageUpload={handleRequestImage}
                        />
                    </section>
                )}
            </main>

            {showBlockPicker && (
                <div className="modalBackdrop" onClick={() => setShowBlockPicker(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modalHeader">
                            <div className="modalTitle">Insert a block</div>
                            <button onClick={() => setShowBlockPicker(false)}>✕</button>
                        </div>

                        <input
                            className="modalSearch"
                            placeholder="Search blocks..."
                            value={blockQuery}
                            onChange={(e) => setBlockQuery(e.target.value)}
                        />

                        <div className="blockList">
                            {visibleBlocks.map((b) => (
                                <button
                                    key={b.id}
                                    className="blockItem"
                                    onClick={() => insertBlock(b.id)}
                                >
                                    <div className="blockId">{b.id}</div>
                                    <div className="blockTitle">{b.title}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {showImagePicker && (
                <div className="modalBackdrop" onClick={() => resolveImage(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modalHeader">
                            <div className="modalTitle">Insert Image</div>
                            <button onClick={() => resolveImage(null)}>✕</button>
                        </div>

                        <div style={{ padding: "16px 0" }}>
                            <div style={{ marginBottom: "12px", fontWeight: 600 }}>Upload from device</div>
                            <input type="file" accept="image/*" onChange={handleFileUpload} />
                        </div>

                        <div className="sidebarSectionTitle">Existing Assets</div>
                        <div className="blockList" style={{ maxHeight: "200px" }}>
                            {files
                                .filter((f) => f.path.startsWith("assets/"))
                                .map((f) => (
                                    <button
                                        key={f.path}
                                        className="blockItem"
                                        onClick={() => resolveImage(f.path)}
                                        style={{ display: "flex", alignItems: "center", gap: "8px" }}
                                    >
                                        <div className="blockId">🖼️</div>
                                        <div className="blockTitle">{f.path}</div>
                                    </button>
                                ))}
                        </div>
                    </div>
                </div>
            )}

            {showConsole && (
                <div className="modalBackdrop" onClick={() => setShowConsole(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "700px" }}>
                        <div className="modalHeader">
                            <div className="modalTitle">App Console</div>
                            <button onClick={() => setShowConsole(false)}>✕</button>
                        </div>

                        <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: "20px" }}>
                            
                            {/* Repository Settings */}
                            <div>
                                <div className="sidebarSectionTitle">Repository Connection</div>
                                <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                                    <button
                                        className={`tab ${repoType === "fs" ? "active" : ""}`}
                                        onClick={() => setRepoType("fs")}
                                    >
                                        Local Folder (File System)
                                    </button>
                                    <button
                                        className={`tab ${repoType === "online" ? "active" : ""}`}
                                        onClick={() => setRepoType("online")}
                                    >
                                        Online (Browser)
                                    </button>
                                </div>
                            </div>

                            {/* Git Settings */}
                            <div>
                                <div className="sidebarSectionTitle">Git Configuration</div>
                                <div style={{ display: "flex", gap: "10px", margin: "8px 0" }}>
                                    <button className={`tab ${gitMode === "offline" ? "active" : ""}`} onClick={() => setGitMode("offline")}>Offline (External Client)</button>
                                    <button className={`tab ${gitMode === "online" ? "active" : ""}`} onClick={() => setGitMode("online")}>Online (Isomorphic-Git)</button>
                                </div>
                                {gitMode === "online" && (
                                    <div style={{ display: "grid", gap: "8px" }}>
                                        <input className="modalSearch" style={{ margin: 0 }} placeholder="Repo URL" value={gitCreds.url} onChange={e => setGitCreds({...gitCreds, url: e.target.value})} />
                                        <input className="modalSearch" style={{ margin: 0 }} placeholder="Git Username" value={gitCreds.username} onChange={e => setGitCreds({...gitCreds, username: e.target.value})} />
                                        <input className="modalSearch" style={{ margin: 0 }} type="password" placeholder="Personal Access Token" value={gitCreds.token} onChange={e => setGitCreds({...gitCreds, token: e.target.value})} />
                                    </div>
                                )}
                            </div>

                            {/* Google Classroom */}
                            <div>
                                <div className="sidebarSectionTitle">Google Classroom Integration</div>
                                <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
                                    <input className="modalSearch" style={{ margin: 0 }} placeholder="Client ID" value={gcCreds.clientId} onChange={e => setGcCreds({...gcCreds, clientId: e.target.value})} />
                                    <input className="modalSearch" style={{ margin: 0 }} type="password" placeholder="API Key" value={gcCreds.apiKey} onChange={e => setGcCreds({...gcCreds, apiKey: e.target.value})} />
                                </div>
                            </div>

                            {/* Outputs */}
                            <div>
                                <div className="sidebarSectionTitle">Outputs & Exports</div>
                                <div style={{ marginTop: "8px", fontSize: "13px", color: "#666" }}>
                                    Configure default export paths and formats (PDF, HTML, Docx).
                                </div>
                                <div style={{ marginTop: "8px" }}>
                                    <label style={{ display: "flex", alignItems: "center", gap: "8px" }}><input type="checkbox" /> Auto-export on save</label>
                                </div>
                            </div>

                            <div style={{ marginTop: "20px", display: "flex", justifyContent: "space-between" }}>
                                <button
                                    onClick={async () => {
                                        if (window.confirm("Reset app configuration? This will clear saved credentials.")) {
                                            await configStore.clear();
                                            window.location.reload();
                                        }
                                    }}
                                    style={{ padding: "8px 16px", background: "#dc3545", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                >
                                    Reset App
                                </button>
                                <button 
                                    onClick={handleSaveConfig}
                                    style={{ padding: "8px 16px", background: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {saveAsState.isOpen && (
                <div className="modalBackdrop" onClick={() => setSaveAsState({ isOpen: false })}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "400px" }}>
                        <div className="modalHeader">
                            <div className="modalTitle">Save New File</div>
                            <button onClick={() => setSaveAsState({ isOpen: false })}>✕</button>
                        </div>

                        <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: "16px" }}>
                            <div>
                                <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: 600 }}>File Type</label>
                                <div style={{ display: "flex", gap: "10px" }}>
                                    <button className={`tab ${newFileType === "docs" ? "active" : ""}`} onClick={() => setNewFileType("docs")} style={{ flex: 1, justifyContent: "center" }}>Document (docs/)</button>
                                    <button className={`tab ${newFileType === "blocks" ? "active" : ""}`} onClick={() => setNewFileType("blocks")} style={{ flex: 1, justifyContent: "center" }}>Block (blocks/)</button>
                                    <button className={`tab ${newFileType === "templates" ? "active" : ""}`} onClick={() => setNewFileType("templates")} style={{ flex: 1, justifyContent: "center" }}>Template (templates/)</button>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: 600 }}>Filename</label>
                                <input className="modalSearch" style={{ margin: 0 }} value={newFileName} onChange={e => setNewFileName(e.target.value)} placeholder="e.g. Lesson 1" autoFocus />
                            </div>

                            <button onClick={performSaveAs} style={{ width: "100%", padding: "10px", background: "#007bff", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}>
                                Save File
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showTemplatePicker && (
                <div className="modalBackdrop" onClick={() => setShowTemplatePicker(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modalHeader">
                            <div className="modalTitle">New from Template</div>
                            <button onClick={() => setShowTemplatePicker(false)}>✕</button>
                        </div>

                        <div className="blockList">
                            {files
                                .filter((f) => f.path.startsWith("templates/"))
                                .map((f) => (
                                    <button
                                        key={f.path}
                                        className="blockItem"
                                        onClick={() => createFromTemplate(f.path)}
                                    >
                                        <div className="blockTitle">{f.path}</div>
                                    </button>
                                ))}
                            {files.filter(f => f.path.startsWith("templates/")).length === 0 && (
                                <div style={{ padding: "20px", textAlign: "center", color: "#666" }}>
                                    No templates found. Save a file to the <code>templates/</code> folder to see it here.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
