import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export function useContextMenu(): {
  open: (x: number, y: number, items: ContextMenuItem[]) => void;
  close: () => void;
  menu: ReactNode;
} {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("contextmenu", close);
    };
  }, [menu]);

  useEffect(() => {
    if (!menu || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const overflowX = rect.right - window.innerWidth;
    const overflowY = rect.bottom - window.innerHeight;
    if (overflowX > 0 || overflowY > 0) {
      setMenu((m) => (m ? { ...m, x: m.x - Math.max(0, overflowX), y: m.y - Math.max(0, overflowY) } : m));
    }
  }, [menu]);

  const open = (x: number, y: number, items: ContextMenuItem[]) => setMenu({ x, y, items });
  const close = () => setMenu(null);

  const menuElement = menu ? (
    <div
      ref={ref}
      className="fixed z-50 min-w-44 py-1 bg-background border border-border rounded-md shadow-premium-lg"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
    >
      {menu.items.map((item, i) =>
        item.separatorBefore ? (
          <div key={i}>
            <div className="my-1 mx-2 border-t border-border" />
            <MenuRow item={item} onClose={close} />
          </div>
        ) : (
          <MenuRow key={i} item={item} onClose={close} />
        ),
      )}
    </div>
  ) : null;

  return { open, close, menu: menuElement };
}

function MenuRow({ item, onClose }: { item: ContextMenuItem; onClose: () => void }) {
  return (
    <button
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
        item.onClick();
      }}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-1.5 font-sans text-xs text-left transition-colors",
        item.danger ? "text-red-700 hover:bg-red-50" : "text-bone/70 hover:bg-bone/5 hover:text-bone",
      )}
    >
      {item.icon && <span className="text-muted [&>svg]:w-3.5 [&>svg]:h-3.5">{item.icon}</span>}
      <span className="flex-1 truncate">{item.label}</span>
    </button>
  );
}
