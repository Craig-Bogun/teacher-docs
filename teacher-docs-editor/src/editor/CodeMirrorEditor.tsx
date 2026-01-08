import { useEffect, useMemo, useRef } from "react";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { searchKeymap } from "@codemirror/search";
import { livePreview } from "./livePreview";

export type EditorMode = "write" | "source";

type Props = {
    value: string;
    onChange: (v: string) => void;
    onViewReady: (view: EditorView) => void;
    mode: EditorMode;

    blockLabel?: (id: string) => string;
    onOpenBlock?: (id: string) => void;
};


export function CodeMirrorEditor({
    value, onChange, onViewReady, mode, blockLabel, onOpenBlock
}: Props) {

    const hostRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);

    // A compartment lets us reconfigure editor extensions without rebuilding the editor
    const modeCompartmentRef = useRef<Compartment | null>(null);

    const modeExtensions = useMemo(() => {
        return mode === "write"
            ? [livePreview({ blockLabel, onOpenBlock })]
            : [];
    }, [mode, blockLabel, onOpenBlock]);


    useEffect(() => {
        if (!hostRef.current) return;

        const modeCompartment = new Compartment();
        modeCompartmentRef.current = modeCompartment;

        const state = EditorState.create({
            doc: value,
            extensions: [
                history(),
                markdown(),
                keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
                EditorView.updateListener.of((u) => {
                    if (u.docChanged) onChange(u.state.doc.toString());
                }),
                EditorView.lineWrapping,

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

        const pos = Math.min(view.state.selection.main.from, value.length);
        view.dispatch({
            changes: { from: 0, to: current.length, insert: value },
            selection: EditorSelection.cursor(pos),
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

    return <div ref={hostRef} style={{ height: "100%", width: "100%" }} />;
}
