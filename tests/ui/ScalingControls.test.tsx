import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScalingControls } from '../../src/ui/components/recipes/ScalingControls.js';

describe('ScalingControls Component', () => {
  it('renders scaling controls with base yield values', () => {
    const handleScaleChange = vi.fn();

    render(
      <ScalingControls
        referenceYieldQuantity="14000"
        referenceYieldUnitCode="g"
        referenceYieldUnitId="unit-g-id"
        portionQuantity="1000"
        onScaleChange={handleScaleChange}
      />
    );

    expect(screen.getByText('Escalado Dinámico de Producción')).toBeTruthy();
    expect(screen.getByText('Rendimiento de Masa / Volumen')).toBeTruthy();
    expect(screen.getByText('Cantidad de Piezas / Porciones')).toBeTruthy();
  });

  it('switches to portions mode and triggers scale change', () => {
    const handleScaleChange = vi.fn();

    render(
      <ScalingControls
        referenceYieldQuantity="14000"
        referenceYieldUnitCode="g"
        referenceYieldUnitId="unit-g-id"
        portionQuantity="1000"
        onScaleChange={handleScaleChange}
      />
    );

    const portionsBtn = screen.getByText('Cantidad de Piezas / Porciones');
    fireEvent.click(portionsBtn);

    const input = screen.getByPlaceholderText('ej. 28');
    fireEvent.change(input, { target: { value: '28' } });

    expect(handleScaleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'output_pieces',
      })
    );
  });

  it('applies quick multiplier button (2x)', () => {
    const handleScaleChange = vi.fn();

    render(
      <ScalingControls
        referenceYieldQuantity="14000"
        referenceYieldUnitCode="g"
        referenceYieldUnitId="unit-g-id"
        portionQuantity="1000"
        onScaleChange={handleScaleChange}
      />
    );

    const twoXBtn = screen.getByText('2x (Doble)');
    fireEvent.click(twoXBtn);

    expect(handleScaleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'yield',
      })
    );

    // Reset button appears
    const resetBtn = screen.getByText('Restablecer a receta base (1x)');
    expect(resetBtn).toBeTruthy();
    fireEvent.click(resetBtn);

    expect(handleScaleChange).toHaveBeenCalledWith(undefined);
  });

  it('hides portions mode when recipe has no discrete portions', () => {
    const handleScaleChange = vi.fn();

    render(
      <ScalingControls
        referenceYieldQuantity="2500"
        referenceYieldUnitCode="g"
        referenceYieldUnitId="unit-g-id"
        portionQuantity={null}
        onScaleChange={handleScaleChange}
      />
    );

    expect(screen.queryByText('Cantidad de Piezas / Porciones')).toBeNull();
  });
});
