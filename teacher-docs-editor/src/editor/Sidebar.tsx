import { useState } from "react";
import "./Sidebar.css";

export type FileItem = {
    id: string;
    name: string;
    type: "file" | "folder";
    children?: FileItem[];
};

type SidebarProps = {
    items: FileItem[];
    activeId?: string;
    onSelect: (item: FileItem) => void;
};

type FileTreeItemProps = {
    item: FileItem;
    depth: number;
    activeId?: string;
    onSelect: (item: FileItem) => void;
};

function FileIcon() {
    return (
        <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
            <polyline points="13 2 13 9 20 9"></polyline>
        </svg>
    );
}

function FolderIcon({ open }: { open: boolean }) {
    return (
        <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
    );
}

function ChevronRight() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
    );
}

function FileTreeItem({ item, depth, activeId, onSelect }: FileTreeItemProps) {
    const [isOpen, setIsOpen] = useState(false);
    const isActive = item.id === activeId;
    const hasChildren = item.type === "folder" && item.children && item.children.length > 0;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (item.type === "folder") {
            setIsOpen(!isOpen);
        } else {
            onSelect(item);
        }
    };

    return (
        <>
            <div
                className={`file-tree-item ${isActive ? "active" : ""}`}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={handleClick}
            >
                {item.type === "folder" ? (
                    <div className={`folder-chevron ${isOpen ? "open" : ""}`}>
                        <ChevronRight />
                    </div>
                ) : (
                    <div className="folder-chevron" /> /* Spacer */
                )}
                
                {item.type === "folder" ? <FolderIcon open={isOpen} /> : <FileIcon />}
                <span style={{ marginLeft: "4px" }}>{item.name}</span>
            </div>
            
            {isOpen && hasChildren && (
                <div>
                    {item.children!.map((child) => (
                        <FileTreeItem
                            key={child.id}
                            item={child}
                            depth={depth + 1}
                            activeId={activeId}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
        </>
    );
}

export function Sidebar({ items, activeId, onSelect }: SidebarProps) {
    return (
        <div className="sidebar">
            <div className="sidebar-header">Explorer</div>
            <div className="sidebar-content">
                {items.map((item) => (
                    <FileTreeItem
                        key={item.id}
                        item={item}
                        depth={0}
                        activeId={activeId}
                        onSelect={onSelect}
                    />
                ))}
            </div>
        </div>
    );
}