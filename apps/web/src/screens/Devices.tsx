import { useEffect, useState } from 'react';

import { api } from '../api';
import { Button, ErrorState, Loader } from '../components/ui';
import { PageHeader } from '../components/PageHeader';

interface DeviceInfo {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
}

/**
 * Vinculacion de dispositivos (sincronizacion multi-dispositivo sin cuenta).
 *
 * La biblioteca ya vive en el servidor; este panel permite compartirla con
 * la TV y el movil mediante un codigo de 6 caracteres.
 */
export function DevicesScreen({ onLinked }: { onLinked?: () => void }) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.devices();
      setDevices(result.devices);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createCode = async () => {
    setError(null);
    setMessage(null);
    try {
      const result = await api.createPairing('Este dispositivo');
      setCode(result.code);
      onLinked?.();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const claim = async () => {
    setError(null);
    setMessage(null);
    try {
      await api.claimPairing(input.trim(), 'Nuevo dispositivo');
      setInput('');
      setMessage('Dispositivo vinculado correctamente.');
      await load();
      onLinked?.();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const unlink = async (id: string) => {
    setError(null);
    try {
      await api.unlinkDevice(id);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  if (loading) return <Loader label="Cargando dispositivos…" />;

  return (
    <div className="screen devices">
      <PageHeader
        title="Dispositivos"
        hint="Comparte la biblioteca entre la TV, el móvil y el navegador sin crear cuentas."
      />
      <section className="panel">
        <h2>Vincular otro dispositivo</h2>
        <p className="panel__hint">
          La biblioteca (favoritos, historial, progreso y valoraciones) está en el servidor. Genera un
          código aquí y escríbelo en el otro dispositivo (TV, móvil o navegador) para compartirla
          sin necesidad de cuenta.
        </p>
        <div className="addons__install">
          <Button onClick={() => void createCode()}>Generar código</Button>
        </div>
        {code ? (
          <div className="pairing-code">
            <span className="pairing-code__value">{code}</span>
            <span className="pairing-code__hint">
              Introduce este código en el otro dispositivo (caduca en 10 minutos).
            </span>
          </div>
        ) : null}

        <div className="addons__install">
          <input
            className="addons__input"
            type="text"
            value={input}
            placeholder="Código del otro dispositivo"
            maxLength={6}
            onChange={(event) => setInput(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void claim();
            }}
          />
          <Button onClick={() => void claim()} disabled={input.trim().length < 6}>
            Vincular
          </Button>
        </div>
        {message ? <p className="panel__ok">{message}</p> : null}
        {error ? <ErrorState message={error} /> : null}
      </section>

      <section className="panel">
        <h2>Dispositivos vinculados ({devices.length})</h2>
        {!devices.length ? (
          <p className="panel__hint">
            Este servidor todavía no tiene dispositivos vinculados: la biblioteca se usa en modo
            local.
          </p>
        ) : null}
        <ul className="addon-list">
          {devices.map((device) => (
            <li key={device.id} className="addon">
              <div className="addon__info">
                <strong>
                  {device.name} {device.current ? '· este dispositivo' : ''}
                </strong>
                <span className="addon__version">
                  Conectado {new Date(device.lastSeenAt).toLocaleString('es-ES')}
                </span>
              </div>
              <Button variant="danger" onClick={() => void unlink(device.id)}>
                Desvincular
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
