import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import { Dices, Gift, Plus, Trash2, Eye, RefreshCw, CheckCircle2, AlertCircle, Power } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';
import MiniGameModal from '../account/MiniGameModal';

export type GameMode = 'LUCKY_WHEEL' | 'SCRATCH_CARD' | 'SLOT_MACHINE';
export type PrizeType = 'POINTS' | 'DISCOUNT_COUPON' | 'PERK' | 'NO_PRIZE';

export interface GamePrize {
  id: string;
  titleJa: string;
  type: PrizeType;
  value: number;
  probability: number;
  color: string;
  icon?: string;
  descriptionJa?: string;
}

export interface GameConfig {
  enabled: boolean;
  mode: GameMode;
  cooldownHours: number;
  titleJa: string;
  subtitleJa: string;
  prizes: GamePrize[];
}

const PRESET_COLORS = [
  '#e11d48', // Crimson Red
  '#d97706', // Amber Gold
  '#2563eb', // Royal Blue
  '#7c3aed', // Purple
  '#059669', // Emerald Green
  '#0891b2', // Cyan
  '#ea580c', // Orange
  '#64748b', // Slate Gray
];

const PRESET_ICONS = ['🎁', '💎', '🍕', '🪙', '⭐', '🍛', '🎉', '🍀'];

export default function GameSettings() {
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [testPlayOpen, setTestPlayOpen] = useState(false);

  const toggleEnabled = async (targetState?: boolean) => {
    if (!config || toggling) return;
    const nextState = typeof targetState === 'boolean' ? targetState : !config.enabled;
    setToggling(true);
    // Optimistic UI update
    update({ enabled: nextState });
    try {
      const res = await apiFetch('/api/v1/game/admin/toggle', { method: 'PATCH' });
      if (res.ok) {
        toast.success(
          nextState
            ? 'ミニゲームを【公開（有効）】にしました。会員マイページに表示されます。'
            : 'ミニゲームを【一時停止（無効）】にしました。会員マイページから非表示になりました。',
        );
      } else {
        toast.error('ステータスの更新に失敗しました。');
        loadConfig();
      }
    } catch {
      toast.error('通信エラーが発生しました。');
      loadConfig();
    } finally {
      setToggling(false);
    }
  };

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/game/admin/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      } else {
        toast.error('ゲーム設定の取得に失敗しました。');
      }
    } catch {
      toast.error('通信エラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  if (loading || !config) {
    return (
      <section style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6b7280' }}>
          <RefreshCw size={18} className="animate-spin" />
          <span>ゲーム設定を読み込み中…</span>
        </div>
      </section>
    );
  }

  const update = (patch: Partial<GameConfig>) => {
    setConfig(prev => (prev ? { ...prev, ...patch } : null));
  };

  const handlePrizeChange = (index: number, patch: Partial<GamePrize>) => {
    const updated = [...config.prizes];
    updated[index] = { ...updated[index], ...patch };
    update({ prizes: updated });
  };

  const addPrize = () => {
    if (config.prizes.length >= 10) {
      toast.error('景品は最大10個まで設定できます。');
      return;
    }
    const nextColor = PRESET_COLORS[config.prizes.length % PRESET_COLORS.length];
    const newPrize: GamePrize = {
      id: 'p_' + Date.now().toString(36),
      titleJa: '特別クーポン',
      type: 'DISCOUNT_COUPON',
      value: 10,
      probability: 10,
      color: nextColor,
      icon: '🎁',
    };
    update({ prizes: [...config.prizes, newPrize] });
  };

  const removePrize = (index: number) => {
    if (config.prizes.length <= 2) {
      toast.error('ゲームの景品は最低2つ必要です。');
      return;
    }
    const updated = config.prizes.filter((_, i) => i !== index);
    update({ prizes: updated });
  };

  const totalProb = config.prizes.reduce((sum, p) => sum + (Number(p.probability) || 0), 0);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!config) return;

    if (config.prizes.length < 2) {
      toast.error('景品を最低2つ設定してください。');
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch('/api/v1/game/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (res.ok) {
        toast.success('ミニゲーム設定を保存しました！');
      } else {
        toast.error(await errorMessage(res, '設定の保存に失敗しました。'));
      }
    } catch {
      toast.error('通信エラーが発生しました。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={panelStyle}>
      <form onSubmit={save}>
        {/* Section Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={iconBadge}>
                <Dices size={22} color="#fff" />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1f2937' }}>
                ミニゲーム・運試し設定 (Play & Win)
              </h3>
            </div>
            <p style={{ margin: '0.4rem 0 0', color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.5 }}>
              会員様がマイページで挑戦できるミニゲームです。ルーレット・スクラッチ・スロットから選べ、当たったポイントや割引クーポンは自動付与されます。
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Direct 1-Click Manual Enable/Disable Switch */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: config.enabled ? '#ecfdf5' : '#f3f4f6',
              border: `1.5px solid ${config.enabled ? '#a7f3d0' : '#e5e7eb'}`,
              borderRadius: '9999px',
              padding: '4px 12px 4px 6px',
              transition: 'all 0.2s ease',
            }}>
              <button
                type="button"
                role="switch"
                aria-checked={config.enabled}
                aria-label="ミニゲームの公開・停止を手動で切り替える"
                onClick={() => toggleEnabled()}
                disabled={toggling}
                style={{
                  width: '44px',
                  height: '24px',
                  backgroundColor: config.enabled ? '#059669' : '#9ca3af',
                  borderRadius: '9999px',
                  border: 'none',
                  position: 'relative',
                  cursor: toggling ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s ease',
                  padding: 0,
                  outline: 'none',
                  display: 'inline-block',
                }}
              >
                <span style={{
                  display: 'block',
                  width: '18px',
                  height: '18px',
                  backgroundColor: '#ffffff',
                  borderRadius: '50%',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                  position: 'absolute',
                  top: '3px',
                  left: config.enabled ? '23px' : '3px',
                  transition: 'left 0.2s ease',
                }} />
              </button>
              <span style={{
                fontSize: '0.84rem',
                fontWeight: 700,
                color: config.enabled ? '#047857' : '#4b5563',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <Power size={13} />
                {config.enabled ? '公開中（有効）' : '一時停止中（無効）'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setTestPlayOpen(true)}
              style={secondaryButton}
              title="管理者プレビューで動作を確認します"
            >
              <Eye size={16} /> テストプレイ
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ ...primaryButton, opacity: saving ? 0.7 : 1 }}
            >
              {saving ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              設定を保存
            </button>
          </div>
        </div>

        {/* Prominent Manual Status Banner */}
        {config.enabled ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#ecfdf5',
            border: '1.5px solid #a7f3d0',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '1.25rem',
            gap: '12px',
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#065f46', fontSize: '0.88rem' }}>
              <CheckCircle2 size={18} color="#059669" />
              <span><strong>ミニゲーム機能は【公開中（有効）】です。</strong> 会員マイページ（ホーム & 特典タブ）に表示され、会員様が毎日挑戦できます。</span>
            </div>
            <button
              type="button"
              disabled={toggling}
              onClick={() => toggleEnabled(false)}
              style={{
                ...secondaryButton,
                color: '#dc2626',
                borderColor: '#fca5a5',
                padding: '6px 14px',
                fontSize: '0.82rem',
                backgroundColor: '#fff',
              }}
            >
              一時停止（無効化）にする
            </button>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#fef2f2',
            border: '1.5px solid #fecaca',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '1.25rem',
            gap: '12px',
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#991b1b', fontSize: '0.88rem' }}>
              <AlertCircle size={18} color="#dc2626" />
              <span><strong>ミニゲーム機能は【停止中（無効）】です。</strong> 会員マイページから完全に非表示になっており、ポイントやクーポンの抽選は行われません。</span>
            </div>
            <button
              type="button"
              disabled={toggling}
              onClick={() => toggleEnabled(true)}
              style={{
                ...primaryButton,
                backgroundColor: '#059669',
                padding: '6px 14px',
                fontSize: '0.82rem',
              }}
            >
              今すぐ有効化（公開）する
            </button>
          </div>
        )}

        {/* Enable Toggle & Cooldown Card */}
        <div style={cardRowStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={e => toggleEnabled(e.target.checked)}
                style={{ width: '20px', height: '20px', accentColor: '#059669', cursor: 'pointer' }}
              />
              ゲーム機能を公開する（有効）
            </label>
            <span style={{ fontSize: '0.8rem', color: config.enabled ? '#059669' : '#6b7280', backgroundColor: config.enabled ? '#ecfdf5' : '#f3f4f6', padding: '2px 8px', borderRadius: '9999px', fontWeight: 600 }}>
              {config.enabled ? '● 公開中' : '○ 一時停止中'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: '#4b5563', fontWeight: 600 }}>挑戦インターバル:</span>
            <select
              value={config.cooldownHours}
              onChange={e => update({ cooldownHours: Number(e.target.value) })}
              style={selectStyle}
            >
              <option value={24}>24時間（1日1回毎日無料・推奨）</option>
              <option value={12}>12時間に1回</option>
              <option value={6}>6時間に1回</option>
              <option value={0}>0時間（無制限・テスト確認用）</option>
            </select>
          </div>
        </div>

        {/* Game Mode Selector */}
        <div style={{ marginTop: '1.25rem', marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#374151', marginBottom: '0.5rem' }}>
            ゲームの種類を選択（現在のゲームモード）
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <ModeCard
              selected={config.mode === 'LUCKY_WHEEL'}
              title="🎯 ラッキールーレット"
              desc="ルーレットがくるくる回り、止まったマスの景品が当たります。"
              onClick={() => update({ mode: 'LUCKY_WHEEL' })}
            />
            <ModeCard
              selected={config.mode === 'SCRATCH_CARD'}
              title="🎫 スクラッチくじ"
              desc="銀や金のカードを指でこすって削る、ワクワクの宝くじ体験。"
              onClick={() => update({ mode: 'SCRATCH_CARD' })}
            />
            <ModeCard
              selected={config.mode === 'SLOT_MACHINE'}
              title="🎰 ラッキースロット"
              desc="3つのリールが回転し、揃った絵柄の豪華賞品をゲット！"
              onClick={() => update({ mode: 'SLOT_MACHINE' })}
            />
          </div>
        </div>

        {/* Title and Subtitle inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <label style={labelStyle}>ゲームタイトル</label>
            <input
              type="text"
              value={config.titleJa}
              onChange={e => update({ titleJa: e.target.value })}
              style={inputStyle}
              placeholder="例: 毎日チャレンジ！ラッキールーレット"
              required
            />
          </div>
          <div>
            <label style={labelStyle}>説明文（サブタイトル）</label>
            <input
              type="text"
              value={config.subtitleJa}
              onChange={e => update({ subtitleJa: e.target.value })}
              style={inputStyle}
              placeholder="例: 毎日1回無料！ポイントや割引クーポンが当たります"
            />
          </div>
        </div>

        {/* Prizes Table */}
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Gift size={18} color="#d97706" />
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1f2937' }}>
                景品・当選マスの設定 ({config.prizes.length}個)
              </h4>
              <span style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: totalProb === 100 ? '#ecfdf5' : '#fffbeb',
                color: totalProb === 100 ? '#047857' : '#b45309',
                border: `1px solid ${totalProb === 100 ? '#a7f3d0' : '#fde68a'}`,
              }}>
                合計確率: {totalProb}% {totalProb !== 100 && '(比率で自動按分されます)'}
              </span>
            </div>

            <button
              type="button"
              onClick={addPrize}
              disabled={config.prizes.length >= 10}
              style={{ ...secondaryButton, padding: '6px 12px', fontSize: '0.82rem' }}
            >
              <Plus size={15} /> 景品を追加
            </button>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', color: '#4b5563', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={thStyle}>色・絵文字</th>
                  <th style={thStyle}>景品名</th>
                  <th style={thStyle}>種類</th>
                  <th style={thStyle}>付与内容（値）</th>
                  <th style={thStyle}>当選確率 (%)</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: '50px' }}>削除</th>
                </tr>
              </thead>
              <tbody>
                {config.prizes.map((prize, idx) => (
                  <tr key={prize.id || idx} style={{ borderBottom: idx < config.prizes.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                    {/* Color & Icon */}
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="color"
                          value={prize.color}
                          onChange={e => handlePrizeChange(idx, { color: e.target.value })}
                          style={{ width: '28px', height: '28px', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: 0 }}
                          title="マス・カードの色を変更"
                        />
                        <select
                          value={prize.icon ?? '🎁'}
                          onChange={e => handlePrizeChange(idx, { icon: e.target.value })}
                          style={{ ...selectStyle, padding: '4px', width: '48px', fontSize: '1rem', textAlign: 'center' }}
                        >
                          {PRESET_ICONS.map(emoji => (
                            <option key={emoji} value={emoji}>{emoji}</option>
                          ))}
                        </select>
                      </div>
                    </td>

                    {/* Title */}
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={prize.titleJa}
                        onChange={e => handlePrizeChange(idx, { titleJa: e.target.value })}
                        style={{ ...inputStyle, padding: '6px 10px', fontSize: '0.85rem' }}
                        placeholder="例: 100ポイント"
                        required
                      />
                    </td>

                    {/* Type */}
                    <td style={tdStyle}>
                      <select
                        value={prize.type}
                        onChange={e => {
                          const nextType = e.target.value as PrizeType;
                          let nextVal = prize.value;
                          if (nextType === 'POINTS' && nextVal === 0) nextVal = 50;
                          if (nextType === 'DISCOUNT_COUPON' && nextVal === 0) nextVal = 10;
                          if (nextType === 'PERK' || nextType === 'NO_PRIZE') nextVal = 0;
                          handlePrizeChange(idx, { type: nextType, value: nextVal });
                        }}
                        style={{ ...selectStyle, padding: '6px 8px', fontSize: '0.85rem' }}
                      >
                        <option value="POINTS">🪙 ポイント付与</option>
                        <option value="DISCOUNT_COUPON">🎟️ 割引クーポン</option>
                        <option value="PERK">🧀 特別特典（ナン等）</option>
                        <option value="NO_PRIZE">😢 ハズレ / 参加賞</option>
                      </select>
                    </td>

                    {/* Value */}
                    <td style={tdStyle}>
                      {prize.type === 'POINTS' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="number"
                            min={1}
                            max={10000}
                            value={prize.value}
                            onChange={e => handlePrizeChange(idx, { value: Number(e.target.value) })}
                            style={{ ...inputStyle, width: '80px', padding: '6px 8px', fontSize: '0.85rem' }}
                          />
                          <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>pt</span>
                        </div>
                      ) : prize.type === 'DISCOUNT_COUPON' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="number"
                            min={1}
                            max={10000}
                            value={prize.value}
                            onChange={e => handlePrizeChange(idx, { value: Number(e.target.value) })}
                            style={{ ...inputStyle, width: '80px', padding: '6px 8px', fontSize: '0.85rem' }}
                          />
                          <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>% または 円</span>
                        </div>
                      ) : prize.type === 'PERK' ? (
                        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>スタンプ特典に追加</span>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>付与なし</span>
                      )}
                    </td>

                    {/* Probability */}
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={prize.probability}
                          onChange={e => handlePrizeChange(idx, { probability: Number(e.target.value) })}
                          style={{ ...inputStyle, width: '70px', padding: '6px 8px', fontSize: '0.85rem', fontWeight: 600 }}
                        />
                        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>%</span>
                      </div>
                    </td>

                    {/* Delete */}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => removePrize(idx)}
                        disabled={config.prizes.length <= 2}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: config.prizes.length <= 2 ? 'not-allowed' : 'pointer',
                          color: config.prizes.length <= 2 ? '#d1d5db' : '#ef4444',
                          padding: '4px',
                        }}
                        title="景品を削除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </form>

      {/* Admin Test Play Modal */}
      {testPlayOpen && (
        <MiniGameModal
          isOpen={testPlayOpen}
          onClose={() => setTestPlayOpen(false)}
          isAdminPreview={true}
          previewConfig={config}
        />
      )}
    </section>
  );
}

function ModeCard({
  selected,
  title,
  desc,
  onClick,
}: {
  selected: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        border: selected ? '2px solid #d97706' : '1px solid #e5e7eb',
        borderRadius: '10px',
        padding: '12px 14px',
        cursor: 'pointer',
        backgroundColor: selected ? '#fffbeb' : '#fff',
        transition: 'all 0.15s ease-in-out',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontWeight: 700, fontSize: '0.92rem', color: selected ? '#b45309' : '#1f2937' }}>
          {title}
        </span>
        {selected && (
          <span style={{ fontSize: '0.72rem', backgroundColor: '#d97706', color: '#fff', padding: '1px 6px', borderRadius: '9999px', fontWeight: 700 }}>
            選択中
          </span>
        )}
      </div>
      <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.4 }}>
        {desc}
      </p>
    </div>
  );
}

const panelStyle: CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  border: '1px solid #e5e7eb',
  padding: '1.5rem',
};

const cardRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  padding: '12px 16px',
  flexWrap: 'wrap',
  gap: '12px',
};

const iconBadge: CSSProperties = {
  width: '36px',
  height: '36px',
  borderRadius: '8px',
  backgroundColor: '#d97706',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#4b5563',
  marginBottom: '4px',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid #d1d5db',
  fontSize: '0.9rem',
  boxSizing: 'border-box',
  outline: 'none',
  backgroundColor: '#fff',
};

const selectStyle: CSSProperties = {
  padding: '6px 10px',
  borderRadius: '6px',
  border: '1px solid #d1d5db',
  fontSize: '0.85rem',
  backgroundColor: '#fff',
  outline: 'none',
  cursor: 'pointer',
};

const primaryButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  backgroundColor: '#d97706',
  color: '#fff',
  border: 'none',
  padding: '8px 16px',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '0.875rem',
  cursor: 'pointer',
};

const secondaryButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  backgroundColor: '#fff',
  color: '#374151',
  border: '1px solid #d1d5db',
  padding: '8px 14px',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '0.875rem',
  cursor: 'pointer',
};

const thStyle: CSSProperties = {
  padding: '10px 12px',
  fontWeight: 600,
  fontSize: '0.82rem',
};

const tdStyle: CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'middle',
};
