import { useState, useRef, useEffect } from "react";
import { EditorView } from "@codemirror/view";

type Props = {
    view: EditorView | null;
    onInsertBlock: () => void;
    onSave: () => void;
};

export function ButtonBar({ view, onInsertBlock, onSave }: Props) {
    const [showTableMenu, setShowTableMenu] = useState(false);
    const [tableDims, setTableDims] = useState({ rows: 0, cols: 0 });
    const tableMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (tableMenuRef.current && !tableMenuRef.current.contains(event.target as Node)) {
                setShowTableMenu(false);
            }
        };
        if (showTableMenu) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showTableMenu]);

    const handleFormat = (marker: string) => {
        if (!view) return;
        const { state, dispatch } = view;
        const { from, to } = state.selection.main;
        const text = state.sliceDoc(from, to);

        const len = marker.length;
        const before = state.sliceDoc(from - len, from);
        const after = state.sliceDoc(to, to + len);

        if (before === marker && after === marker) {
            dispatch({
                changes: { from: from - len, to: to + len, insert: text },
                selection: { anchor: from - len, head: from - len + text.length }
            });
        } else {
            dispatch({
                changes: { from, to, insert: `${marker}${text}${marker}` },
                selection: { anchor: from + len, head: from + len + text.length }
            });
        }
        view.focus();
    };

    const handleLineStart = (marker: string, detectRegex?: RegExp) => {
        if (!view) return;
        const { state, dispatch } = view;
        const { from, to } = state.selection.main;
        const startLine = state.doc.lineAt(from);
        const endLine = state.doc.lineAt(to);

        const check = (text: string) => {
            if (detectRegex) return detectRegex.test(text);
            return text.startsWith(marker);
        };

        let allMatch = true;
        for (let i = startLine.number; i <= endLine.number; i++) {
            const line = state.doc.line(i);
            if (!check(line.text)) {
                allMatch = false;
                break;
            }
        }

        const changes = [];
        for (let i = startLine.number; i <= endLine.number; i++) {
            const line = state.doc.line(i);
            const text = line.text;

            if (allMatch) {
                if (detectRegex) {
                    const match = text.match(detectRegex);
                    if (match) changes.push({ from: line.from, to: line.from + match[0].length, insert: "" });
                } else {
                    changes.push({ from: line.from, to: line.from + marker.length, insert: "" });
                }
            } else {
                if (!check(text)) {
                    changes.push({ from: line.from, to: line.from, insert: marker });
                }
            }
        }
        dispatch({ changes });
        view.focus();
    };

    const handleLink = () => {
        if (!view) return;
        const { state, dispatch } = view;
        const { from, to } = state.selection.main;
        const text = state.sliceDoc(from, to);
        const insertText = `${text}`;
        dispatch({
            changes: { from, to, insert: insertText },
            selection: { anchor: from + text.length + 3, head: from + text.length + 6 }
        });
        view.focus();
    };

    const handleImage = () => {
        if (!view) return;
        const { state, dispatch } = view;
        const { from, to } = state.selection.main;
        const insertText = `!alt text`;
        dispatch({
            changes: { from, to, insert: insertText },
            selection: { anchor: from + 2, head: from + 10 }
        });
        view.focus();
    };

    const insertTable = (rows: number, cols: number) => {
        if (!view) return;
        const { state, dispatch } = view;
        const { from, to } = state.selection.main;

        let header = "|";
        let separator = "|";
        for (let c = 1; c <= cols; c++) {
            header += ` Header ${c} |`;
            separator += " --- |";
        }

        let body = "";
        for (let r = 1; r <= rows; r++) {
            body += "\n|";
            for (let c = 1; c <= cols; c++) {
                body += " Cell |";
            }
        }

        dispatch({
            changes: { from, to, insert: `${header}\n${separator}${body}\n` },
            selection: { anchor: from + 2, head: from + 10 }
        });
        view.focus();
        setShowTableMenu(false);
    };

    return (
        <>
            <button onClick={() => handleFormat("**")} title="Bold" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path></svg>
            </button>
            <button onClick={() => handleFormat("*")} title="Italic" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></svg>
            </button>
            <button onClick={() => handleFormat("~~")} title="Strikethrough" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><path d="M16 6C16 6 14.5 4 12 4C9.5 4 8 6 8 6"></path><path d="M8 18C8 18 9.5 20 12 20C14.5 20 16 18 16 18"></path></svg>
            </button>
            <button onClick={() => handleFormat("`")} title="Inline Code" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
            </button>

            <div className="cm-editor-separator" />

            <button onClick={() => handleLineStart("# ")} title="Heading" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12h12"></path><path d="M6 20V4"></path><path d="M18 20V4"></path></svg>
            </button>
            <button onClick={() => handleLineStart("> ")} title="Quote" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M10 11h-4a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v6c0 2.667 -1.333 4.333 -4 5"></path><path d="M19 11h-4a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v6c0 2.667 -1.333 4.333 -4 5"></path></svg>
            </button>
            <button onClick={() => handleLineStart("- ")} title="List" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
            </button>
            <button onClick={() => handleLineStart("1. ", /^\d+\.\s/)} title="Numbered List" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="21" y2="6"></line><line x1="10" y1="12" x2="21" y2="12"></line><line x1="10" y1="18" x2="21" y2="18"></line><path d="M4 6h1v4"></path><path d="M4 10h2"></path></svg>
            </button>

            <div className="cm-editor-separator" />

            <button onClick={handleLink} title="Link" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            </button>
            <button onClick={handleImage} title="Image" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
            </button>
            <div style={{ position: "relative" }} ref={tableMenuRef}>
                <button onClick={() => setShowTableMenu(!showTableMenu)} title="Table" type="button">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="12" y1="3" x2="12" y2="21"></line></svg>
                </button>
                {showTableMenu && (
                    <div className="cm-table-flyout">
                        <div className="cm-table-info">
                            {tableDims.rows > 0 ? `${tableDims.cols} x ${tableDims.rows}` : "Insert Table"}
                        </div>
                        <div className="cm-table-grid" onMouseLeave={() => setTableDims({ rows: 0, cols: 0 })}>
                            {Array.from({ length: 100 }).map((_, i) => {
                                const r = Math.floor(i / 10) + 1;
                                const c = (i % 10) + 1;
                                const isActive = r <= tableDims.rows && c <= tableDims.cols;
                                return (
                                    <div
                                        key={i}
                                        className={`cm-table-cell ${isActive ? "active" : ""}`}
                                        onMouseEnter={() => setTableDims({ rows: r, cols: c })}
                                        onClick={() => insertTable(r, c)}
                                    />
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div className="cm-editor-separator" />

            <button onClick={onInsertBlock} title="Insert Block" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
            </button>

            <div className="cm-editor-spacer" />

            <button onClick={onSave} title="Save" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
            </button>
        </>
    );
}