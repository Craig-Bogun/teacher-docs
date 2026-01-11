import { useEffect, useMemo, useRef } from "react";
import { Compartment, EditorSelection, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import { searchKeymap } from "@codemirror/search";
import { livePreview } from "./livePreview";
import { ButtonBar } from "./ButtonBar";
import { Sidebar } from "./Sidebar";
import type { FileItem } from "./Sidebar";
import "./CodeMirrorEditor.css";

export type EditorMode = "write" | "source";

type Props = {

    value: string;
    onChange: (v: string) => void;
    onViewReady: (view: EditorView) => void;
    mode: EditorMode;

    blockLabel?: (id: string) => string;
    onOpenBlock?: (id: string) => void;
    onInsertBlock: () => void;
    onSave: () => void;
    fileItems?: FileItem[];
    onFileSelect?: (item: FileItem) => void;
    activeFileId?: string;
    onImageUpload?: () => Promise<string | null>;
};


export function CodeMirrorEditor({
    value, onChange, onViewReady, mode, blockLabel, onOpenBlock, onInsertBlock, onSave, fileItems, onFileSelect, activeFileId, onImageUpload
}: Props) {

    const hostRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);

    // A compartment lets us reconfigure editor extensions without rebuilding the editor
    const modeCompartmentRef = useRef<Compartment | null>(null);

    const modeExtensions = useMemo(() => {
        return mode === "write"
            ? [livePreview({ blockLabel, onOpenBlock })]
            : [];
    }, [mode, blockLabel, onOpenBlock]);


    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
        if (!hostRef.current) return;

        const modeCompartment = new Compartment();
        modeCompartmentRef.current = modeCompartment;

        const state = EditorState.create({
            doc: value,
            extensions: [
                lineNumbers(),
                highlightActiveLine(),
                history(),
                markdown({ codeLanguages: languages, extensions: [GFM] }),
                keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
                EditorView.updateListener.of((u) => {
                    if (u.docChanged) onChangeRef.current(u.state.doc.toString());
                }),
                EditorView.lineWrapping,
                EditorView.theme({ "&": { height: "100%" } }),

                // mode switchable extensions live here:
                modeCompartment.of(modeExtensions),
            ],
        });

        const view = new EditorView({ state, parent: hostRef.current });
        viewRef.current = view;
        onViewReady(view);

        return () => {
            view.destroy();
            viewRef.current = null;
            modeCompartmentRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync external content changes (switching files)
    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;

        const current = view.state.doc.toString();
        if (current === value) return;

        view.dispatch({
            changes: { from: 0, to: current.length, insert: value },
            selection: EditorSelection.cursor(0),
            scrollIntoView: true,
            annotations: [Transaction.addToHistory.of(false)],
        });

    }, [value]);

    // Reconfigure mode without recreating the editor
    useEffect(() => {
        const view = viewRef.current;
        const compartment = modeCompartmentRef.current;
        if (!view || !compartment) return;

        view.dispatch({
            effects: compartment.reconfigure(modeExtensions),
        });
    }, [modeExtensions]);

    const sidebarItems = fileItems || [
        {
            id: "root",
            name: "My Documents",
            type: "folder",
            children: [
                { id: "1", name: "Lesson Plan.md", type: "file" },
                { id: "2", name: "Notes.md", type: "file" },
            ]
        }
    ];

    return (
        <div className="app-main-layout">
            <Sidebar items={sidebarItems} onSelect={onFileSelect || (() => { })} activeId={activeFileId} />
            <div className="cm-editor-wrapper">
                <div className="cm-editor-toolbar">
                    <ButtonBar
                        view={viewRef.current}
                        onInsertBlock={onInsertBlock}
                        onSave={onSave}
                        onImageUpload={onImageUpload}
                    />
                </div>
                <div ref={hostRef} className="cm-editor-host" />
            </div>
        </div>
    );
}
