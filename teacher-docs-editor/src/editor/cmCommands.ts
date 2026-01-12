import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

function wrapSelection(view: EditorView, left: string, right = left) {
    const { state } = view;
    const changes: { from: number; to: number; insert: string }[] = [];
    const ranges: { anchor: number; head: number }[] = [];

    for (const range of state.selection.ranges) {
        const from = range.from;
        const to = range.to;
        const selected = state.doc.sliceString(from, to);

        const insert = left + selected + right;
        changes.push({ from, to, insert });

        const start = from + left.length;
        const end = start + selected.length;
        // preserve selection around original text
        ranges.push({ anchor: start, head: end });
    }

    view.dispatch({
        changes,
        selection: EditorSelection.create(
            ranges.map(r => EditorSelection.range(r.anchor, r.head))
        ),
        scrollIntoView: true,
    });

    view.focus();
}

export function cmdBold(view: EditorView) {
    wrapSelection(view, "**");
}

export function cmdItalic(view: EditorView) {
    wrapSelection(view, "*");
}

export function cmdHeading2(view: EditorView) {
    const { state } = view;
    const line = state.doc.lineAt(state.selection.main.from);
    const text = line.text;

    // If line already starts with hashes, replace with "## "
    const replaced = text.replace(/^#{1,6}\s+/, "");
    const insert = "## " + replaced;

    view.dispatch({
        changes: { from: line.from, to: line.to, insert },
        selection: EditorSelection.cursor(line.from + 3),
        scrollIntoView: true,
    });

    view.focus();
}

function getSelectedLines(view: EditorView) {
    const { state } = view;
    const sel = state.selection.main;

    const startLine = state.doc.lineAt(sel.from);
    const endLine = state.doc.lineAt(sel.to);

    const lines = [];
    for (let pos = startLine.from; pos <= endLine.from;) {
        const line = state.doc.lineAt(pos);
        lines.push(line);
        pos = line.to + 1;
        if (pos > state.doc.length) break;
    }
    return lines;
}

export function cmdBulletedList(view: EditorView) {
    const lines = getSelectedLines(view);

    const bulletRe = /^(\s*)([-*+])\s+/;
    const nonEmpty = lines.filter(l => l.text.trim().length > 0);

    const allBulleted =
        nonEmpty.length > 0 && nonEmpty.every(l => bulletRe.test(l.text));

    const changes: { from: number; to: number; insert: string }[] = [];

    for (const line of nonEmpty) {
        if (allBulleted) {
            // remove bullet marker
            const m = bulletRe.exec(line.text);
            if (!m) continue;
            const removeFrom = line.from + m[1].length; // keep indentation
            // m[0] includes indent + marker + spaces; remove only marker+spaces after indent
            changes.push({ from: removeFrom, to: line.from + m[0].length, insert: "" });
        } else {
            // add bullet marker after indentation
            const indent = (line.text.match(/^\s*/) ?? [""])[0];
            changes.push({ from: line.from + indent.length, to: line.from + indent.length, insert: "- " });
        }
    }

    view.dispatch({ changes, scrollIntoView: true });
    view.focus();
}

export function cmdNumberedList(view: EditorView) {
    const lines = getSelectedLines(view);

    const numRe = /^(\s*)(\d+)\.\s+/;
    const nonEmpty = lines.filter(l => l.text.trim().length > 0);

    const allNumbered =
        nonEmpty.length > 0 && nonEmpty.every(l => numRe.test(l.text));

    const changes: { from: number; to: number; insert: string }[] = [];

    let i = 1;
    for (const line of nonEmpty) {
        if (allNumbered) {
            // remove number marker
            const m = numRe.exec(line.text);
            if (!m) continue;
            const removeFrom = line.from + m[1].length; // keep indentation
            changes.push({ from: removeFrom, to: line.from + m[0].length, insert: "" });
        } else {
            // add or normalize number markers
            const indent = (line.text.match(/^\s*/) ?? [""])[0];
            changes.push({
                from: line.from + indent.length,
                to: line.from + indent.length,
                insert: `${i}. `,
            });
            i++;
        }
    }

    view.dispatch({ changes, scrollIntoView: true });
    view.focus();
}


export function cmdInsertTable(view: EditorView) {
    const table = [
        "",
        "| Header 1 | Header 2 |",
        "| --- | --- |",
        "| Cell 1 | Cell 2 |",
        "",
    ].join("\n");

    const { state } = view;
    const pos = state.selection.main.from;

    view.dispatch({
        changes: { from: pos, to: pos, insert: table },
        selection: EditorSelection.cursor(pos + table.length),
        scrollIntoView: true,
    });

    view.focus();
}

export function cmdInsertImage(view: EditorView) {
    const url = window.prompt("Image URL (or relative path like /images/photo.png):");
    if (!url) return;

    const alt = window.prompt("Alt text:", "Image") ?? "Image";
    const md = `![${alt}](${url})`;

    const { state } = view;
    const pos = state.selection.main.from;

    view.dispatch({
        changes: { from: pos, to: pos, insert: md },
        selection: EditorSelection.cursor(pos + md.length),
        scrollIntoView: true,
    });

    view.focus();
}
