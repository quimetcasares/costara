import { useEffect, useRef, type ReactNode } from 'react';

export interface NativeDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export function NativeDialog({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'md',
}: NativeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
  }[maxWidth];

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className={`backdrop:bg-black/50 backdrop:backdrop-blur-xs rounded-xl p-0 shadow-2xl border border-stone-200 bg-white text-stone-900 w-full ${maxWidthClass} fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 m-0`}
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-50/50">
        <h3 className="text-lg font-semibold text-stone-900">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar modal"
          className="text-stone-400 hover:text-stone-600 rounded-lg p-1 hover:bg-stone-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-6">{children}</div>
    </dialog>
  );
}
