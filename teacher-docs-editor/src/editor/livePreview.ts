import { Decoration, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";

type LivePreviewOptions = {
    blockLabel?: (id: string) => string;
    onOpenBlock?: (id: string) => void;
};

class BlockPillWidget extends WidgetType {
    private id: string;
    private label: string;
    private onOpen?: (id: string) => void;

    constructor(id: string, label: string, onOpen?: (id: string) => void) {
        super();
        this.id = id;
        this.label = label;
        this.onOpen = onOpen;
    }

    eq(other: BlockPillWidget) {
        return this.id === other.id && this.label === other.label;
    }

    toDOM() {
        const el = document.createElement("span");
        el.className = "cm-block-pill";
        el.textContent = `🧩 ${this.label}`;
        el.title = `Open block: ${this.id}`;
        el.setAttribute("data-block-id", this.id);

        el.addEventListener("dblclick", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onOpen?.(this.id);
        });


        return el;
    }

    ignoreEvent() {
        return false;
    }
}

class TableWidget extends WidgetType {
    private tableMarkdown: string;

    constructor(tableMarkdown: string) {
        super();
        this.tableMarkdown = tableMarkdown;
    }

    eq(other: TableWidget) {
        return this.tableMarkdown === other.tableMarkdown;
    }

    private parseAlignment(separatorCell: string): string {
        // Check alignment markers: :--- (left), :---: (center), ---: (right)
        const trimmed = separatorCell.trim();
        const hasLeft = trimmed.startsWith(':');
        const hasRight = trimmed.endsWith(':');
        
        if (hasLeft && hasRight) return 'center';
        if (hasRight) return 'right';
        if (hasLeft) return 'left';
        return 'left'; // default
    }

    toDOM() {
        const container = document.createElement("div");
        container.className = "cm-table-widget";

        const lines = this.tableMarkdown.trim().split('\n');
        const rows: string[][] = [];
        let alignments: string[] = [];

        for (const line of lines) {
            const cells = line.split('|')
                .map(cell => cell.trim())
                .filter(cell => cell.length > 0);
            if (cells.length > 0) {
                rows.push(cells);
            }
        }

        if (rows.length === 0) return container;

        const table = document.createElement("table");
        table.className = "cm-rendered-table";

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const tr = document.createElement("tr");
            
            // Check if this is a separator row (all dashes with optional colons)
            const isSeparator = row.every(cell => /^:?-+:?$/.test(cell));
            
            if (isSeparator) {
                // Parse alignment from separator row
                alignments = row.map(cell => this.parseAlignment(cell));
                continue;
            }

            for (let j = 0; j < row.length; j++) {
                const cell = row[j];
                const td = document.createElement(i === 0 ? "th" : "td");
                td.textContent = cell;
                
                // Apply alignment class
                if (alignments[j]) {
                    td.className = `align-${alignments[j]}`;
                }
                
                tr.appendChild(td);
            }

            table.appendChild(tr);
        }

        container.appendChild(table);
        return container;
    }

    ignoreEvent() {
        return true;
    }
}


function intersectsSelection(view: EditorView, from: number, to: number) {
    const sel = view.state.selection.main;
    return !(to <= sel.from || from >= sel.to);
}

function buildDecorations(view: EditorView, opts: LivePreviewOptions) {
    const decos: any[] = [];
    const doc = view.state.doc;

    const labelFor = (id: string) => (opts.blockLabel ? opts.blockLabel(id) : id);

    // First pass: identify fenced code blocks
    const codeBlockRanges: Array<{ start: number; end: number; startLine: number; endLine: number }> = [];
    const codeBlockRegex = /^```[\s\S]*?^```/gm;
    let codeBlockMatch: RegExpExecArray | null;
    let searchPos = 0;
    
    while (searchPos < doc.length) {
        const textFromPos = doc.sliceString(searchPos);
        const match = /^```/.exec(textFromPos);
        
        if (!match) break;
        
        const openStart = searchPos + match.index;
        const openPos = openStart + 3;
        
        // Find closing ```
        const textAfterOpen = doc.sliceString(openPos);
        const closeMatch = /\n```/.exec(textAfterOpen);
        
        if (!closeMatch) {
            searchPos = openPos;
            break;
        }
        
        const closeStart = openPos + closeMatch.index;
        const closeEnd = closeStart + 4;
        
        const startLine = doc.lineAt(openStart).number;
        const endLine = doc.lineAt(closeEnd).number;
        
        codeBlockRanges.push({
            start: openStart,
            end: closeEnd,
            startLine,
            endLine
        });
        
        searchPos = closeEnd;
    }

    // Detect table blocks
    const tableBlockRanges: Array<{ startLine: number; endLine: number; startPos: number; endPos: number }> = [];
    for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
        const line = doc.line(lineNo);
        if (line.text.trim().startsWith("|") && (line.text.match(/\|/g) || []).length >= 2) {
            // Found a table row, now collect consecutive table rows
            let tableEndLine = lineNo;
            while (tableEndLine < doc.lines) {
                const nextLine = doc.line(tableEndLine + 1);
                if (nextLine.text.trim().startsWith("|") && (nextLine.text.match(/\|/g) || []).length >= 2) {
                    tableEndLine++;
                } else {
                    break;
                }
            }
            tableBlockRanges.push({
                startLine: lineNo,
                endLine: tableEndLine,
                startPos: doc.line(lineNo).from,
                endPos: doc.line(tableEndLine).to
            });
            lineNo = tableEndLine; // Skip to the end of the table
        }
    }

    for (const vr of view.visibleRanges) {
        const fromLine = doc.lineAt(vr.from);
        const toLine = doc.lineAt(vr.to);

        for (let lineNo = fromLine.number; lineNo <= toLine.number; lineNo++) {
            const line = doc.line(lineNo);
            const text = line.text;

            // Check if this line is the start of a table block
            const tableBlock = tableBlockRanges.find(t => t.startLine === lineNo);
            if (tableBlock) {
                // Collect all table rows
                const tableLines = [];
                for (let tLineNo = tableBlock.startLine; tLineNo <= tableBlock.endLine; tLineNo++) {
                    tableLines.push(doc.line(tLineNo).text);
                }
                const tableMarkdown = tableLines.join('\n');
                
                // Insert table widget at the beginning of the table block
                // and hide all the original table lines
                decos.push(
                    Decoration.widget({
                        widget: new TableWidget(tableMarkdown),
                        side: -1,
                    }).range(tableBlock.startPos)
                );
                
                // Hide each line of the table by replacing with empty content on each line
                for (let tLineNo = tableBlock.startLine; tLineNo <= tableBlock.endLine; tLineNo++) {
                    const tLine = doc.line(tLineNo);
                    decos.push(
                        Decoration.replace({}).range(tLine.from, tLine.to)
                    );
                }
                
                // Skip to the end of the table
                lineNo = tableBlock.endLine;
                continue;
            }

            // Check if this line is inside a code block
            const inCodeBlock = codeBlockRanges.some(
                range => lineNo > range.startLine && lineNo < range.endLine
            );

            // If inside a code block (but not on the delimiter lines), apply code block styling
            if (inCodeBlock && !text.startsWith("```")) {
                decos.push(Decoration.line({ class: "cm-live-code-block" }).range(line.from));
                // Still apply inline code formatting inside code blocks
            }

            // --- Inline code (`code`) ---
            const codeRegex = /`([^`\n]+)`/g;
            let cm: RegExpExecArray | null;
            while ((cm = codeRegex.exec(text))) {
                const fullStart = cm.index;
                const fullEnd = cm.index + cm[0].length; // includes backticks
                const innerStart = fullStart + 1;
                const innerEnd = fullEnd - 1;

                const absFullStart = line.from + fullStart;
                const absFullEnd = line.from + fullEnd;
                const absInnerStart = line.from + innerStart;
                const absInnerEnd = line.from + innerEnd;

                if (!intersectsSelection(view, absFullStart, absFullEnd)) {
                    // Hide backticks
                    decos.push(Decoration.replace({}).range(absFullStart, absFullStart + 1));
                    decos.push(Decoration.replace({}).range(absFullEnd - 1, absFullEnd));
                }

                // Style the code contents
                decos.push(
                    Decoration.mark({ class: "cm-live-code" }).range(absInnerStart, absInnerEnd)
                );
            }

            // --- Links [text](url) ---
            // Prototype: single-line links only
            const linkRegex = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
            let lm: RegExpExecArray | null;
            while ((lm = linkRegex.exec(text))) {
                const fullStart = lm.index;
                const fullEnd = lm.index + lm[0].length;

                const linkText = lm[1]; // display text
                const urlText = lm[2];  // url

                // positions in the match:
                // [TEXT](URL)
                const openBracket = fullStart;                 // [
                const textStart = fullStart + 1;              // start of TEXT
                const textEnd = textStart + linkText.length;  // end of TEXT
                const closeBracket = textEnd;                 // ]
                const openParen = closeBracket + 1;           // (
                const urlStart = openParen + 1;               // start of URL
                const urlEnd = urlStart + urlText.length;     // end of URL
                const closeParen = urlEnd;                    // )

                const absFullStart = line.from + fullStart;
                const absFullEnd = line.from + fullEnd;

                const absTextStart = line.from + textStart;
                const absTextEnd = line.from + textEnd;

                const absOpenBracket = line.from + openBracket;
                const absCloseBracket = line.from + closeBracket;

                const absOpenParen = line.from + openParen;
                const absUrlStart = line.from + urlStart;
                const absUrlEnd = line.from + urlEnd;
                const absCloseParen = line.from + closeParen;

                // If cursor is inside the link, show raw markdown so it can be edited naturally
                if (intersectsSelection(view, absFullStart, absFullEnd)) {
                    // Still style the link text to feel like a link
                    decos.push(Decoration.mark({ class: "cm-live-link" }).range(absTextStart, absTextEnd));
                    continue;
                }

                // Hide bracket markers
                decos.push(Decoration.replace({}).range(absOpenBracket, absOpenBracket + 1)); // [
                decos.push(Decoration.replace({}).range(absCloseBracket, absCloseBracket + 1)); // ]

                // Hide (url) entirely including parentheses
                decos.push(Decoration.replace({}).range(absOpenParen, absOpenParen + 1)); // (
                decos.push(Decoration.replace({}).range(absUrlStart, absUrlEnd));         // URL
                decos.push(Decoration.replace({}).range(absCloseParen, absCloseParen + 1)); // )

                // Style the visible text
                decos.push(Decoration.mark({ class: "cm-live-link" }).range(absTextStart, absTextEnd));
            }


            // --- Block pills: [[block:id]] ---
            // Replace the token with a widget unless the cursor is inside it
            const blockRe = /\[\[block:([a-zA-Z0-9_-]+)\]\]/g;
            let bm: RegExpExecArray | null;
            while ((bm = blockRe.exec(text))) {
                const id = bm[1];
                const start = line.from + bm.index;
                const end = start + bm[0].length;

                if (intersectsSelection(view, start, end)) continue;

                const label = labelFor(id);
                decos.push(
                    Decoration.replace({
                        widget: new BlockPillWidget(id, label, opts.onOpenBlock),
                    }).range(start, end)
                );
            }

            // --- Headings ---
            const h = /^(#{1,6})\s+/.exec(text);
            if (h) {
                const level = h[1].length;
                const markerLen = h[0].length; // hashes + space
                const start = line.from;
                const end = line.from + markerLen;

                if (!intersectsSelection(view, start, end)) {
                    decos.push(Decoration.replace({}).range(start, end));
                }

                decos.push(
                    Decoration.line({ class: `cm-live-h cm-live-h${level}` }).range(line.from)
                );
            }

            // --- Bold (**text**) ---
            const boldRegex = /\*\*([^\n*][\s\S]*?)\*\*/g;
            const boldRanges: Array<{ from: number; to: number }> = [];

            let m: RegExpExecArray | null;
            while ((m = boldRegex.exec(text))) {
                const fullStart = m.index;
                const fullEnd = m.index + m[0].length;
                const innerStart = fullStart + 2;
                const innerEnd = fullEnd - 2;

                const absFullStart = line.from + fullStart;
                const absInnerStart = line.from + innerStart;
                const absInnerEnd = line.from + innerEnd;
                const absFullEnd = line.from + fullEnd;

                boldRanges.push({ from: absFullStart, to: absFullEnd });

                // Hide markers only if cursor is not inside the match
                if (!intersectsSelection(view, absFullStart, absFullEnd)) {
                    decos.push(Decoration.replace({}).range(absFullStart, absFullStart + 2));
                    decos.push(Decoration.replace({}).range(absFullEnd - 2, absFullEnd));
                }

                decos.push(
                    Decoration.mark({ class: "cm-live-bold" }).range(absInnerStart, absInnerEnd)
                );
            }

            // --- Italic (*text*) ---
            const italicRegex = /(^|[^*])\*([^*\n]+?)\*(?!\*)/g;
            while ((m = italicRegex.exec(text))) {
                const lead = m[1] ?? "";
                const inner = m[2] ?? "";

                const openingStarIndex = m.index + lead.length;
                const closingStarIndex = openingStarIndex + 1 + inner.length;

                const absOpen = line.from + openingStarIndex;
                const absInnerFrom = absOpen + 1;
                const absInnerTo = absInnerFrom + inner.length;
                const absClose = line.from + closingStarIndex;

                const overlapsBold = boldRanges.some(r => !(absClose + 1 <= r.from || absOpen >= r.to));
                if (overlapsBold) continue;

                const fullFrom = absOpen;
                const fullTo = absClose + 1;

                if (!intersectsSelection(view, fullFrom, fullTo)) {
                    decos.push(Decoration.replace({}).range(absOpen, absOpen + 1));
                    decos.push(Decoration.replace({}).range(absClose, absClose + 1));
                }

                decos.push(
                    Decoration.mark({ class: "cm-live-italic" }).range(absInnerFrom, absInnerTo)
                );
            }

            // --- Strikethrough (~~text~~) ---
            const strikethroughRegex = /~~([^\n~][\s\S]*?)~~/g;
            let sm: RegExpExecArray | null;
            while ((sm = strikethroughRegex.exec(text))) {
                const fullStart = sm.index;
                const fullEnd = sm.index + sm[0].length;
                const innerStart = fullStart + 2;
                const innerEnd = fullEnd - 2;

                const absFullStart = line.from + fullStart;
                const absInnerStart = line.from + innerStart;
                const absInnerEnd = line.from + innerEnd;
                const absFullEnd = line.from + fullEnd;

                // Hide markers only if cursor is not inside the match
                if (!intersectsSelection(view, absFullStart, absFullEnd)) {
                    decos.push(Decoration.replace({}).range(absFullStart, absFullStart + 2));
                    decos.push(Decoration.replace({}).range(absFullEnd - 2, absFullEnd));
                }

                decos.push(
                    Decoration.mark({ class: "cm-live-strikethrough" }).range(absInnerStart, absInnerEnd)
                );
            }

            // --- Text alignment ([align-left], [align-center], [align-right]) ---
            const alignmentRegex = /\[align-(left|center|right)\]/g;
            let am: RegExpExecArray | null;
            while ((am = alignmentRegex.exec(text))) {
                const alignmentType = am[1];
                const start = line.from + am.index;
                const end = start + am[0].length;
                
                // Hide the alignment marker
                decos.push(Decoration.replace({}).range(start, end));
                
                // Apply alignment class to the entire line
                decos.push(
                    Decoration.line({ class: `cm-live-align-${alignmentType}` }).range(line.from)
                );
            }


        }
    }

    return Decoration.set(decos, true);
}

export function livePreview(opts: LivePreviewOptions = {}) {
    return ViewPlugin.fromClass(
        class {
            decorations = Decoration.none;
            constructor(view: EditorView) {
                this.decorations = buildDecorations(view, opts);
            }
            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged || update.selectionSet) {
                    this.decorations = buildDecorations(update.view, opts);
                }
            }
        },
        { decorations: (v) => v.decorations }
    );
}
