import { useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { formatMemberCode } from '../../lib/format';

// The standard 4-module white border; less makes some phone cameras miss the code.
const QUIET_ZONE = 4;

/** The member's code as a QR for staff to scan at the counter (or read out when there is no scanner). */
export default function MemberQrModal({ code, name, onClose }: { code: string; name: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  const path = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(`KALPANA:${code}`);
    qr.make();
    const size = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (qr.isDark(row, col)) d += `M${col + QUIET_ZONE},${row + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return { d, size: size + QUIET_ZONE * 2 };
  }, [code]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="qr-overlay" onClick={onClose}>
      <div className="qr-sheet" role="dialog" aria-modal="true" aria-labelledby="qr-title" onClick={e => e.stopPropagation()}>
        <button ref={closeRef} type="button" className="qr-close" onClick={onClose} aria-label="閉じる"><X size={20} /></button>
        <h2 id="qr-title">会員証</h2>
        <p className="qr-name">{name} 様</p>
        <svg viewBox={`0 0 ${path.size} ${path.size}`} className="qr-code" role="img" aria-label={`会員コード ${formatMemberCode(code)} のQRコード`} shapeRendering="crispEdges">
          <rect width={path.size} height={path.size} fill="#fff" />
          <path d={path.d} fill="#1a1a1a" />
        </svg>
        <p className="qr-code-text">{formatMemberCode(code)}</p>
        <p className="qr-hint">お会計の際にスタッフへこの画面をご提示ください。スタンプの押印と特典のご利用ができます。</p>
      </div>
    </div>
  );
}
