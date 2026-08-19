"use client";

import { useState } from "react";
import { AddressForm } from "./address-form";
import { deleteAddressAction, setDefaultAddressAction } from "@/features/account/actions";

export function AddressesManager({ addresses }) {
  const [showNew, setShowNew] = useState(addresses.length === 0);
  const [editing, setEditing] = useState("");
  return <><button className="button button-primary" type="button" onClick={() => setShowNew((value) => !value)}>{showNew ? "Cancelar" : "Agregar dirección"}</button>{showNew ? <AddressForm onSaved={() => setShowNew(false)} /> : null}<div className="address-list">{addresses.map((address) => <article className="address-card" key={address.id}><header><div><h2>{address.label || "Dirección"}</h2>{address.is_default ? <span className="status-badge status-success">Predeterminada</span> : null}</div><button type="button" onClick={() => setEditing(editing === address.id ? "" : address.id)}>{editing === address.id ? "Cerrar" : "Editar"}</button></header><address><strong>{address.recipient_name}</strong><br />{address.line_1}{address.line_2 ? <><br />{address.line_2}</> : null}<br />{address.city}{address.state_region ? `, ${address.state_region}` : ""}<br />{address.phone || "Sin teléfono"}</address>{editing === address.id ? <AddressForm address={address} onSaved={() => setEditing("")} /> : <div className="address-actions">{!address.is_default ? <form action={setDefaultAddressAction}><input type="hidden" name="id" value={address.id} /><button type="submit">Hacer predeterminada</button></form> : null}<form action={deleteAddressAction}><input type="hidden" name="id" value={address.id} /><button className="danger-link" type="submit">Eliminar</button></form></div>}</article>)}</div></>;
}
