import MarkdownIt from "markdown-it";
import type { ContentAPI } from "./contentApi";

const md = new MarkdownIt({ html: false, linkify: true });

export async function renderAssembledHtml(raw: string, api: ContentAPI): Promise<string> {
    // Replace [[block:id]] with block markdown
    const pattern = /\[\[block:([a-zA-Z0-9_-]+)\]\]/g;

    let assembled = raw;
    const matches = [...raw.matchAll(pattern)];
    for (const m of matches) {
        const id = m[1];
        let blockMd = "";
        try {
            blockMd = await api.loadBlock(id);
        } catch {
            blockMd = `> Missing block: ${id}`;
        }
        assembled = assembled.replace(m[0], blockMd);
    }

    return md.render(assembled);
}
