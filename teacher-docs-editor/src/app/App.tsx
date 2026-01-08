import { useEffect, useMemo, useState } from "react";
import { api } from "../repo/inMemoryApi";
import type { FileNode } from "../repo/contentApi";
import { CodeMirrorEditor } from "../editor/CodeMirrorEditor";
import { renderAssembledHtml } from "../repo/blockResolver";

import "./styles.css";
import type { EditorView } from "@codemirror/view";
import { ButtonBar } from "../editor/ButtonBar";

type Tab = "write" | "source" | "preview";

type TabDoc = {
    path: string;
    content: string;
    dirty: boolean;
};

export default function App() {
    const [files, setFiles] = useState<FileNode[]>([]);
    const [tab, setTab] = useState<Tab>("write");
    const [previewHtml, setPreviewHtml] = useState<string>("");
    const [blocks, setBlocks] = useState<{ id: string; title: string }[]>([]);
    const [blockQuery, setBlockQuery] = useState("");
    const [showBlockPicker, setShowBlockPicker] = useState(false);
    const [editorView, setEditorView] = useState<EditorView | null>(null);

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
        (async () => {
            setFiles(await api.listFiles());
            const b = await api.listBlocks();
            setBlocks(b);

            // open initial doc in a tab
            await openTab("docs/example.md", { activate: true });
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function openTab(path: string, opts?: { activate?: boolean }) {
        const activate = opts?.activate ?? true;

        // already open
        if (tabsByPath[path]) {
            if (activate) setActivePath(path);
            return;
        }

        const c = await api.loadFile(path);

        setTabsByPath((prev) => ({
            ...prev,
            [path]: { path, content: c, dirty: false },
        }));

        setOpenOrder((prev) => (prev.includes(path) ? prev : [...prev, path]));

        if (activate) setActivePath(path);
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
        const t = tabsByPath[activePath];
        if (!t) return;

        await api.saveFile(activePath, t.content);

        setTabsByPath((prev) => ({
            ...prev,
            [activePath]: { ...prev[activePath], dirty: false },
        }));
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
        const raw = tabsByPath[activePath]?.content ?? "";
        const html = await renderAssembledHtml(raw, api);
        setPreviewHtml(html);
    }

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

    return (
        <div className="shell">
            <aside className="sidebar">
                <div className="sidebarHeader">
                    <div className="brand">Teacher Docs Editor</div>
                </div>

                <div className="sidebarSectionTitle">Files</div>
                <div className="fileList">
                    {files
                        .filter(
                            (f) =>
                                f.kind === "file" &&
                                (f.path.startsWith("docs/") || f.path.startsWith("blocks/"))
                        )
                        .map((f) => (
                            <button
                                key={f.path}
                                className={"fileItem " + (f.path === activePath ? "active" : "")}
                                onClick={() => openTab(f.path, { activate: true })}
                                title={f.path}
                            >
                                {f.path}
                            </button>
                        ))}
                </div>
            </aside>

            <main className="main">
                <header className="topbar">
                    <div className="path">{activePath}</div>
                    <ButtonBar view={editorView} />

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

                    <div className="actions">
                        <button onClick={() => setShowBlockPicker(true)}>Insert Block</button>
                        <button onClick={saveActive}>Save</button>
                    </div>
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
                            onViewReady={(v) => setEditorView(v)}
                            mode={tab === "write" ? "write" : "source"}
                            blockLabel={blockLabel}
                            onOpenBlock={(id) => openTab(`blocks/${id}.md`, { activate: true })}
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
        </div>
    );
}
