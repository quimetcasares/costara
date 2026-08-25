import { useState, useEffect } from 'react';
import { NativeDialog } from '../common/NativeDialog.js';
import { getCurrentLocalDateTimeString, formatLocalDateTimeForRpc } from '../../../lib/dateUtils.js';

export interface PublishModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onConfirmPublish: (effectiveFromLocal: string, changeReason?: string) => Promise<boolean>;
  readonly versionNumber: number;
  readonly businessTimezone: string;
  readonly isPublishing: boolean;
  readonly publishError?: string | null;
}

export function PublishModal({
  isOpen,
  onClose,
  onConfirmPublish,
  versionNumber,
  businessTimezone,
  isPublishing,
  publishError,
}: PublishModalProps) {
  const [effectiveFromLocal, setEffectiveFromLocal] = useState<string>('');
  const [changeReason, setChangeReason] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setEffectiveFromLocal(getCurrentLocalDateTimeString());
      setChangeReason('');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveFromLocal) return;

    const formattedForRpc = formatLocalDateTimeForRpc(effectiveFromLocal);
    const success = await onConfirmPublish(formattedForRpc, changeReason.trim() || undefined);
    if (success) {
      onClose();
    }
  };

  return (
    <NativeDialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Publicar Versión ${versionNumber}`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-xs text-amber-900 leading-relaxed">
          <p className="font-semibold text-amber-950 mb-0.5">Acción de publicación atómica:</p>
          Al publicar, la versión activa anterior se archivará y esta versión se convertirá en la versión oficial vigente para costeo y escalado.
        </div>

        {/* Local Effective From Date */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Fecha y hora de vigencia (hora local) <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            required
            value={effectiveFromLocal}
            onChange={(e) => setEffectiveFromLocal(e.target.value)}
            disabled={isPublishing}
            className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm font-medium text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          />
          <span className="block text-[11px] text-stone-500 mt-1">
            Zona horaria del negocio: <strong className="font-medium text-stone-700">{businessTimezone}</strong>
          </span>
        </div>

        {/* Change Reason */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Motivo del cambio <span className="text-stone-400 font-normal">(Opcional)</span>
          </label>
          <textarea
            rows={2}
            value={changeReason}
            onChange={(e) => setChangeReason(e.target.value)}
            disabled={isPublishing}
            placeholder="Ej. Ajuste de hidratación al 72% y reducción de sal"
            className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          />
        </div>

        {publishError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 font-medium">
            {publishError}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPublishing || !effectiveFromLocal}
            className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition-colors shadow-xs cursor-pointer flex items-center gap-2"
          >
            {isPublishing ? 'Publicando...' : `Confirmar y Publicar v${versionNumber}`}
          </button>
        </div>
      </form>
    </NativeDialog>
  );
}
