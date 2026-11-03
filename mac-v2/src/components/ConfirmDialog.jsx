import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

// Styled replacement for window.confirm, matching the glass aesthetic.
export const ConfirmDialog = ({ open, title, body, confirmLabel = "Delete", tone = "danger", onConfirm, onClose }) => (
  <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="glass-menu rounded-3xl border-0 sm:max-w-sm" data-testid="confirm-dialog">
      <DialogHeader>
        <DialogTitle className="font-display text-fg">{title}</DialogTitle>
      </DialogHeader>
      {body && <p className="-mt-1 text-sm leading-relaxed text-dim">{body}</p>}
      <div className="flex justify-end gap-2 pt-3">
        <button onClick={onClose} className="btn-ghost" data-testid="confirm-cancel">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={tone === "danger" ? "btn-solid bg-red-500/90 text-white hover:bg-red-500" : "btn-solid btn-accent"}
          data-testid="confirm-ok"
        >
          {confirmLabel}
        </button>
      </div>
    </DialogContent>
  </Dialog>
);
