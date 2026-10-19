import { useCallback, useEffect, useState } from 'react';

import { api } from '../api';
import { useApp } from '../store';
import type { Meta, SearchHistoryEntry, WatchlistItem } from '../types';
import { Button, ErrorState, Loader, Poster } from '../components/ui';
import { Keyboard } from '../components/Keyboard';

/**
 * Buscador nativo (estilo WuPlay).
 *
 * WuPlay tiene una pantalla de busqueda *nativa* (no depende de addons) con
 * teclado en pantalla, historial de busquedas y la opcion de guardar los
 * resultados en una lista. Aqui es lo mismo, pero con la ventaja de que la
 * busqueda se hace sobre los catalogos que ya estan agregados.
 */
export function SearchScreen() {
  const { navigate, lists, reloadLibrary } = useApp();
  const [term, setTerm] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [results, setResults] = useState<Meta[]>([]);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void api
      .searchHistory()
      .then((result) => setHistory(result.history))
      .catch(() => setHistory([]));
  }, []);

  const runSearch = useCallback(async (value: string) => {
    const clean = value.trim();
    if (!clean) {
      setResults([]);
      setSubmitted('');
      return;
    }
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const response = await api.search(clean);
      setResults(response.metas);
      setSubmitted(clean);
      // La busqueda se guarda en el historial (WuPlay: "search history chips").
      const historyResult = await api.addSearchHistory(clean).catch(() => null);
      if (historyResult) setHistory(historyResult.history);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Guarda los resultados en una lista (WuPlay: "save search results to list"). */
  const saveResults = useCallback(async () => {
    if (!results.length) return;
    const items: WatchlistItem[] = results.slice(0, 50).map((meta) => ({
      id: meta.id,
      type: meta.type ?? 'movie',
      name: meta.name ?? meta.id,
      poster: meta.poster,
      addedAt: Date.now(),
    }));
    let list = lists[0];
    if (!list) {
      list = await api.createList('Resultados de búsqueda');
    }
    await api.addListItems(list.id, items);
    await reloadLibrary();
    setSaved(true);
  }, [lists, results, reloadLibrary]);

  return (
    <div className="screen search-screen">
      <header className="search-screen__header">
        <h1>Buscar</h1>
        <p className="search-screen__hint">
          Escribe con el mando: el teclado de la pantalla es navegable con el D-pad.
        </p>
      </header>

      {history.length && !submitted ? (
        <section className="search-screen__history">
          <div className="search-screen__history-header">
            <h2>Búsquedas recientes</h2>
            <button
              type="button"
              data-focusable="true"
              className="button button--ghost"
              onClick={() => {
                void api.clearSearchHistory().then((result) => setHistory(result.history));
              }}
            >
              Limpiar
            </button>
          </div>
          <div className="search-screen__chips">
            {history.map((entry) => (
              <button
                key={entry.term}
                type="button"
                data-focusable="true"
                className="chip"
                onClick={() => {
                  setTerm(entry.term);
                  void runSearch(entry.term);
                }}
              >
                🕘 {entry.term}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {loading ? <Loader label="Buscando…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void runSearch(submitted)} /> : null}

      {submitted && !loading && results.length === 0 ? (
        <p className="row__empty">Sin resultados para “{submitted}”.</p>
      ) : null}

      {results.length ? (
        <section className="search-screen__results">
          <div className="search-screen__results-header">
            <h2>
              {results.length} resultado{results.length === 1 ? '' : 's'} para “{submitted}”
            </h2>
            <Button variant="ghost" onClick={() => void saveResults()}>
              {saved ? '✓ Guardados en la lista' : 'Guardar en una lista'}
            </Button>
          </div>
          <div className="row__items">
            {results.map((meta) => (
              <Poster
                key={meta.id}
                meta={meta}
                onSelect={(selected) =>
                  navigate({ name: 'detail', id: selected.id, type: selected.type ?? 'movie' })
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      <Keyboard
        value={term}
        onChange={setTerm}
        onSubmit={(value) => void runSearch(value)}
        placeholder="Películas, series, personas…"
      />
    </div>
  );
}
