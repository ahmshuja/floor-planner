import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { detectRooms } from '../utils/roomArea';

const CM2_TO_M2 = 1 / 10000;
const M2_TO_FT2 = 10.7639;

export function AreaPanel() {
  const walls = useStore(state => state.walls);
  const [unit, setUnit] = useState<'m2' | 'ft2'>('m2');
  const [open, setOpen] = useState(true);

  const rooms = useMemo(() => detectRooms(walls), [walls]);

  const fmt = (cm2: number) => {
    const m2 = cm2 * CM2_TO_M2;
    return unit === 'm2' ? `${m2.toFixed(2)} m²` : `${(m2 * M2_TO_FT2).toFixed(1)} sq ft`;
  };
  const total = rooms.reduce((sum, r) => sum + r.areaCm2, 0);

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 50,
        minWidth: 200,
        padding: '10px 12px',
        borderRadius: 8,
        background: 'rgba(20, 20, 20, 0.85)',
        color: '#fff',
        fontSize: 13,
        boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>Area</strong>
        <span>
          <button onClick={() => setUnit(unit === 'm2' ? 'ft2' : 'm2')}>
            {unit === 'm2' ? 'm²' : 'sq ft'}
          </button>{' '}
          <button onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
        </span>
      </div>

      {open && (
        <div style={{ marginTop: 8 }}>
          {rooms.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Koi closed room nahi mila</div>
          ) : (
            <>
              {rooms.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Room {i + 1}</span>
                  <span>{fmt(r.areaCm2)}</span>
                </div>
              ))}
              <hr style={{ opacity: 0.3 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>Total</strong>
                <strong>{fmt(total)}</strong>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}