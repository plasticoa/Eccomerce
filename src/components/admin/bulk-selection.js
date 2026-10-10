"use client";

import { createContext, useActionState, useContext, useEffect, useId, useRef, useState } from "react";

const BulkSelectionContext = createContext(null);

function ResultMessages({ state }) {
  return <>
    {state?.error ? <p className="form-message error" role="alert">{state.error}</p> : null}
    {state?.success ? <p className="form-message success" role="status">{state.success}</p> : null}
    {state?.warning ? <p className="form-message error" role="alert">{state.warning}</p> : null}
  </>;
}

function ConfirmationDialog({ count, entityLabel, pending, onCancel, titleId }) {
  return <div className="bulk-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="bulk-confirm" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <h2 id={titleId}>Confirmar eliminación</h2>
      <p>Se procesarán {count} {entityLabel}. Los registros con historial se conservarán inactivos cuando corresponda.</p>
      <div>
        <button className="button button-secondary" type="button" disabled={pending} onClick={onCancel}>Cancelar</button>
        <button className="button button-danger" type="submit" disabled={pending}>{pending ? "Procesando…" : "Confirmar"}</button>
      </div>
    </section>
  </div>;
}

export function BulkSelection({ action, visibleIds, entityLabel, children }) {
  const scope = visibleIds.join(",");
  const [selection, setSelection] = useState(() => ({ scope, ids: new Set() }));
  const selected = selection.scope === scope ? selection.ids : new Set();
  const [confirming, setConfirming] = useState(false);
  const titleId = useId();
  async function submitAction(previousState, formData) {
    const result = await action(previousState, formData);
    if (result?.success) setSelection({ scope, ids: new Set() });
    return result;
  }
  const [state, formAction, pending] = useActionState(submitAction, {});

  function toggle(id) {
    setSelection((current) => {
      const next = new Set(current.scope === scope ? current.ids : []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { scope, ids: next };
    });
  }

  function toggleAll() {
    setSelection((current) => {
      const ids = current.scope === scope ? current.ids : new Set();
      return { scope, ids: visibleIds.every((id) => ids.has(id)) ? new Set() : new Set(visibleIds) };
    });
  }

  return <BulkSelectionContext.Provider value={{ selected, toggle, toggleAll, visibleIds, pending }}>
    <div className="bulk-selection">
      <form action={formAction} className="bulk-actions" onSubmit={() => setConfirming(false)}>
        {[...selected].map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
        <span aria-live="polite">{selected.size} seleccionado(s)</span>
        <button className="button button-quiet danger-link" type="button" disabled={!selected.size || pending} onClick={() => setConfirming(true)}>Eliminar seleccionados</button>
        <ResultMessages state={state} />
        {confirming ? <ConfirmationDialog count={selected.size} entityLabel={entityLabel} pending={pending} onCancel={() => setConfirming(false)} titleId={titleId} /> : null}
      </form>
      {children}
    </div>
  </BulkSelectionContext.Provider>;
}

export function AdminDeleteButton({ action, id, entityLabel, children = "Eliminar" }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});
  const titleId = useId();
  return <form action={formAction} className="admin-delete-action" onSubmit={() => setConfirming(false)}>
    <input type="hidden" name="ids" value={id} />
    <button className="button button-quiet danger-link" type="button" disabled={pending} onClick={() => setConfirming(true)}>{children}</button>
    <ResultMessages state={state} />
    {confirming ? <ConfirmationDialog count={1} entityLabel={entityLabel} pending={pending} onCancel={() => setConfirming(false)} titleId={titleId} /> : null}
  </form>;
}

export function BulkSelectionCheckbox({ id, label, disabled = false }) {
  const context = useContext(BulkSelectionContext);
  if (!context) return null;
  return <input className="bulk-checkbox" type="checkbox" checked={context.selected.has(id)} disabled={disabled || context.pending} onClick={(event) => event.stopPropagation()} onChange={() => context.toggle(id)} aria-label={`Seleccionar ${label}`} />;
}

export function BulkSelectAllCheckbox({ label = "Seleccionar todos los registros visibles" }) {
  const context = useContext(BulkSelectionContext);
  const ref = useRef(null);
  const selectedCount = context ? context.visibleIds.filter((id) => context.selected.has(id)).length : 0;
  const allSelected = Boolean(context?.visibleIds.length) && selectedCount === context.visibleIds.length;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selectedCount > 0 && !allSelected;
  }, [allSelected, selectedCount]);

  if (!context) return null;
  return <input ref={ref} className="bulk-checkbox" type="checkbox" checked={allSelected} disabled={!context.visibleIds.length || context.pending} onChange={context.toggleAll} aria-label={label} />;
}
