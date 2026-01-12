import MarkdownIt from "markdown-it";
import type { ContentAPI } from "./contentApi";

const md = new MarkdownIt({ html: false, linkify: true });

export async function renderAssembledHtml(raw: string, api: ContentAPI): Promise<string> {
    // Replace [[block:id]] with block markdown
    const pattern = /\[\[block:([a-zA-Z0-9_-]+)\]\]/g;

    let assembled = raw;
    const matches = [...raw.matchAll(pattern)];
    
    // Process matches from end to beginning to avoid position shifts during replacement
    for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i];
        const id = m[1];
        let blockMd = "";
        try {
            blockMd = await api.loadBlock(id);
        } catch {
            blockMd = `> Missing block: ${id}`;
        }
        // Replace from end to beginning to maintain correct positions
        assembled = assembled.slice(0, m.index!) + blockMd + assembled.slice(m.index! + m[0].length);
    }

    return md.render(assembled);
}
