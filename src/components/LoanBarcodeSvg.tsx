import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface LoanBarcodeSvgProps {
  value: string;
  height?: number;
  width?: number;
  fontSize?: number;
  className?: string;
}

export const LoanBarcodeSvg: React.FC<LoanBarcodeSvgProps> = ({
  value,
  height = 52,
  width = 1.6,
  fontSize = 11,
  className = '',
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        lineColor: '#0f172a',
        background: '#ffffff',
        width,
        height,
        displayValue: true,
        fontOptions: 'bold',
        font: 'monospace',
        fontSize,
        margin: 6,
      });
    } catch {
      // Ignore invalid barcode characters
    }
  }, [value, height, width, fontSize]);

  return <svg ref={svgRef} className={className} />;
};
