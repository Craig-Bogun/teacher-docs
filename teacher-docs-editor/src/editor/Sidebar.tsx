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

function FolderIcon() {
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

function FileTreeItem({ item, activeId, onSelect }: FileTreeItemProps) {
    const [isOpen, setIsOpen] = useState(false);
    const isActive = item.id === activeId;
    const isFolder = item.type === "folder";
    const hasChildren = isFolder && item.children && item.children.length > 0;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isFolder) {
            setIsOpen(!isOpen);
        } else {
            onSelect(item);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column" }}>
            <div
                className={`file-tree-item ${isActive ? "active" : ""}`}
                style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "4px 8px",
                    cursor: "pointer",
                    userSelect: "none",
                    backgroundColor: isActive ? "#e6f7ff" : "transparent",
                    color: isActive ? "#007bff" : "inherit"
                }}
                onClick={handleClick}
            >
                <div
                    style={{
                        width: "16px",
                        height: "16px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: "4px",
                        transform: isOpen ? "rotate(90deg)" : "none",
                        transition: "transform 0.1s ease",
                        visibility: isFolder ? "visible" : "hidden",
                        opacity: 0.6
                    }}
                >
                    <ChevronRight />
                </div>
                
                <div style={{ marginRight: "6px", display: "flex", alignItems: "center", opacity: 0.7 }}>
                    {isFolder ? <FolderIcon /> : <FileIcon />}
                </div>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</span>
            </div>
            
            {isOpen && hasChildren && (
                <div style={{ marginLeft: "12px", paddingLeft: "12px", borderLeft: "1px solid #eee" }}>
                    {item.children!.map((child) => (
                        <FileTreeItem
                            key={child.id}
                            item={child}
                            activeId={activeId}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
        </div>
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
                        activeId={activeId}
                        onSelect={onSelect}
                    />
                ))}
            </div>
        </div>
    );
}