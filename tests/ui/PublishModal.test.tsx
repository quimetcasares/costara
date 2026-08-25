import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PublishModal } from '../../src/ui/components/recipes/PublishModal.js';

// Mock showModal and close on HTMLDialogElement if jsdom lacks it
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
}

describe('PublishModal Component', () => {
  it('renders with version number and timezone display', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn().mockResolvedValue(true);

    render(
      <PublishModal
        isOpen={true}
        onClose={handleClose}
        onConfirmPublish={handleConfirm}
        versionNumber={2}
        businessTimezone="America/Mexico_City"
        isPublishing={false}
      />
    );

    expect(screen.getByText('Publicar Versión 2')).toBeTruthy();
    expect(screen.getByText('America/Mexico_City')).toBeTruthy();
    expect(screen.getByText('Confirmar y Publicar v2')).toBeTruthy();
  });

  it('submits with local timestamp and change reason', async () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn().mockResolvedValue(true);

    render(
      <PublishModal
        isOpen={true}
        onClose={handleClose}
        onConfirmPublish={handleConfirm}
        versionNumber={2}
        businessTimezone="America/Mexico_City"
        isPublishing={false}
      />
    );

    const reasonInput = screen.getByPlaceholderText(/Ajuste de hidratación/i);
    fireEvent.change(reasonInput, { target: { value: 'Aumento al 72% de hidratación' } });

    const submitBtn = screen.getByText('Confirmar y Publicar v2');
    fireEvent.click(submitBtn);

    expect(handleConfirm).toHaveBeenCalledWith(
      expect.any(String),
      'Aumento al 72% de hidratación'
    );
  });
});
