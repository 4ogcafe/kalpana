import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Bike, ShoppingBag } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';

interface Switches {
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  pickupHours: string;
  deliveryHours: string;
}

type Key = 'pickupEnabled' | 'deliveryEnabled';

/**
 * The main on/off controls for online ordering. Each switch saves immediately, so staff can pause
 * delivery on a busy night (or pickup during a private event) in one tap.
 */
export default function OrderingSwitches({ onChange }: { onChange?: () => void }) {
  const [state, setState] = useState<Switches | null>(null);
  const [saving, setSaving] = useState<Key | null>(null);

  useEffect(() => {
    apiFetch('/api/v1/settings')
      .then(res => res.json())
      .then(data => setState({
        pickupEnabled: Boolean(data.pickupEnabled),
        deliveryEnabled: Boolean(data.deliveryEnabled),
        pickupHours: data.pickupHours || '',
        deliveryHours: data.deliveryHours || '',
      }))
      .catch(console.error);
  }, []);

  if (!state) return null;

  const toggle = async (key: Key) => {
    const next = !state[key];
    // Delivery without its own hours follows the pickup hours.
    const hours = key === 'pickupEnabled' ? state.pickupHours : state.deliveryHours || state.pickupHours;
    if (next && !hours.trim()) {
      toast.error(`Set the ${key === 'pickupEnabled' ? 'pickup' : 'delivery'} hours below first, then switch it on.`);
      return;
    }
    setSaving(key);
    try {
      const res = await apiFetch('/api/v1/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: next }) });
      if (!res.ok) {
        toast.error(await errorMessage(res, 'Could not update.'));
        return;
      }
      setState({ ...state, [key]: next });
      toast.success(`${key === 'pickupEnabled' ? 'Pickup' : 'Delivery'} ${next ? 'is now ON — customers can order.' : 'is now OFF.'}`);
      onChange?.();
    } catch {
      toast.error('Network error.');
    } finally {
      setSaving(null);
    }
  };

  const options = [
    { key: 'pickupEnabled' as const, icon: ShoppingBag, title: 'Pickup (お持ち帰り)', detail: 'Customers order online and collect at the counter.' },
    { key: 'deliveryEnabled' as const, icon: Bike, title: 'Delivery (デリバリー)', detail: 'Delivered to the customer within the delivery area.' },
  ];

  return (
    <section className="ordering-switches" aria-label="Online ordering">
      <div>
        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>Online ordering</h3>
        <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
          {state.pickupEnabled || state.deliveryEnabled ? 'Customers can order from the website.' : 'Online ordering is off. The website hides the order buttons.'}
        </p>
      </div>
      <div className="ordering-switch-list">
        {options.map(option => {
          const Icon = option.icon;
          const on = state[option.key];
          return (
            <div key={option.key} className={`ordering-switch${on ? ' is-on' : ''}`}>
              <Icon size={22} aria-hidden="true" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{option.title}</div>
                <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>{option.detail}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`${option.title}: ${on ? 'on' : 'off'}`}
                disabled={saving !== null}
                onClick={() => toggle(option.key)}
                className="switch"
              >
                <span />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
