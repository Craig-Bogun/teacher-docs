import type { EditorView } from "@codemirror/view";
import {
  cmdBold,
  cmdItalic,
  cmdHeading2,
  cmdBulletedList,
  cmdNumberedList,
  cmdInsertTable,
  cmdInsertImage,
} from "./cmCommands";

type Props = {
  view: EditorView | null;
};

export function ButtonBar({ view }: Props) {
  const disabled = !view;

  return (
    <div className="buttonBar">
      <button disabled={disabled} onClick={() => view && cmdBold(view)}>
        <strong>B</strong>
      </button>

      <button disabled={disabled} onClick={() => view && cmdItalic(view)}>
        <em>I</em>
      </button>

      <button disabled={disabled} onClick={() => view && cmdHeading2(view)}>
        H2
      </button>

      <button disabled={disabled} onClick={() => view && cmdBulletedList(view)}>
        • List
      </button>

      <button disabled={disabled} onClick={() => view && cmdNumberedList(view)}>
        1. List
      </button>

      <button disabled={disabled} onClick={() => view && cmdInsertTable(view)}>
        Table
      </button>

      <button disabled={disabled} onClick={() => view && cmdInsertImage(view)}>
        Image
      </button>
    </div>
  );
}
