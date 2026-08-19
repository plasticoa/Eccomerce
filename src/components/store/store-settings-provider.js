"use client";
import { createContext,useContext } from "react";
const StoreSettingsContext=createContext({currency:"GTQ"});
export function StoreSettingsProvider({currency,children}){return <StoreSettingsContext value={{currency:currency||"GTQ"}}>{children}</StoreSettingsContext>}
export function useStoreSettings(){return useContext(StoreSettingsContext)}
