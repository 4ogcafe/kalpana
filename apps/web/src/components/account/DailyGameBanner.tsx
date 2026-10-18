import { useEffect, useState, type CSSProperties } from 'react';
import { Sparkles, ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import MiniGameModal, { type GameStatusResponse } from './MiniGameModal';

interface DailyGameBannerProps {
  onRewardClaimed?: () => void;
  compact?: boolean;
}

export default function DailyGameBanner({ onRewardClaimed, compact = false }: DailyGameBannerProps) {
  const [status, setStatus] = useState<GameStatusResponse | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await apiFetch('/api/v1/game/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  if (!status || !status.enabled) {
    return null;
  }

  const { canPlay, nextPlayAt, config } = status;
  const gameMode = config.mode;
  const gameIcon = gameMode === 'LUCKY_WHEEL' ? '🎯' : gameMode === 'SCRATCH_CARD' ? '🎫' : '🎰';

  const handleClaim = () => {
    fetchStatus();
    onRewardClaimed?.();
  };

  return (
    <>
      <div
        onClick={() => setModalOpen(true)}
        style={{
          ...containerStyle,
          padding: compact ? '16px 20px' : '20px 24px',
          cursor: 'pointer',
        }}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setModalOpen(true)}
      >
        {/* Glow ambient background effect */}
        <div style={glowLayerStyle} />

        <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '14px' : '18px', zIndex: 1, minWidth: 0, flex: 1 }}>
          {/* Game Visual Icon Badge */}
          <div style={iconBadgeStyle}>
            <span style={{ fontSize: compact ? '1.8rem' : '2.2rem', lineHeight: 1 }}>{gameIcon}</span>
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: '0.5px',
                padding: '2px 8px',
                borderRadius: '9999px',
                backgroundColor: canPlay ? '#fbbf24' : 'rgba(255,255,255,0.2)',
                color: canPlay ? '#111827' : '#e5e7eb',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                {canPlay ? (
                  <>
                    <Sparkles size={12} /> 本日無料・挑戦可能！
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={12} /> 本日プレイ済み
                  </>
                )}
              </span>

              {!canPlay && nextPlayAt && (
                <span style={{ fontSize: '0.75rem', color: '#fef08a', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} /> 次回: {new Date(nextPlayAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}〜
                </span>
              )}
            </div>

            <h3 style={{ margin: 0, fontSize: compact ? '1.05rem' : '1.25rem', fontWeight: 800, color: '#fff' }}>
              {config.titleJa}
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.84rem', color: '#fde68a', opacity: 0.95, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {config.subtitleJa || 'ゲームに挑戦して、お得なポイントや割引クーポンをGET！'}
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div style={{ zIndex: 1, flexShrink: 0 }}>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setModalOpen(true);
            }}
            style={{
              ...playButtonStyle,
              backgroundColor: canPlay ? '#fbbf24' : 'rgba(255, 255, 255, 0.15)',
              color: canPlay ? '#111827' : '#ffffff',
            }}
          >
            {canPlay ? '今すぐプレイ！' : 'ゲームを見る'}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {modalOpen && (
        <MiniGameModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onRewardClaimed={handleClaim}
        />
      )}
    </>
  );
}

const containerStyle: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  borderRadius: '20px',
  background: 'linear-gradient(135deg, #1e1b4b 0%, #311042 50%, #451a03 100%)',
  border: '1.5px solid rgba(251, 191, 36, 0.4)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25), 0 0 16px rgba(251, 191, 36, 0.15)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  flexWrap: 'wrap',
  transition: 'transform 0.18s ease, box-shadow 0.18s ease',
};

const glowLayerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'radial-gradient(circle at 15% 50%, rgba(251, 191, 36, 0.2), transparent 45%), radial-gradient(circle at 85% 50%, rgba(236, 72, 153, 0.15), transparent 45%)',
  pointerEvents: 'none',
};

const iconBadgeStyle: CSSProperties = {
  width: '56px',
  height: '56px',
  borderRadius: '16px',
  backgroundColor: 'rgba(255, 255, 255, 0.1)',
  border: '1px solid rgba(251, 191, 36, 0.3)',
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
};

const playButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '10px 20px',
  borderRadius: '9999px',
  fontWeight: 800,
  fontSize: '0.9rem',
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
  transition: 'transform 0.15s ease, opacity 0.15s ease',
};
