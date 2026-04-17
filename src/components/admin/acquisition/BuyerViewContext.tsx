import { createContext, useContext, useState, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";

type BuyerViewContextType = {
  buyerView: boolean;
  setBuyerView: (v: boolean) => void;
};

const BuyerViewContext = createContext<BuyerViewContextType>({ buyerView: false, setBuyerView: () => {} });

export function BuyerViewProvider({ children }: { children: ReactNode }) {
  const [buyerView, setBuyerView] = useState(false);
  return (
    <BuyerViewContext.Provider value={{ buyerView, setBuyerView }}>
      {children}
    </BuyerViewContext.Provider>
  );
}

export function useBuyerView() {
  return useContext(BuyerViewContext);
}

export function BuyerViewToggle() {
  const { buyerView, setBuyerView } = useBuyerView();
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card">
      {buyerView ? <Eye className="h-3.5 w-3.5 text-primary" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
      <Label htmlFor="buyer-view" className="text-xs cursor-pointer select-none">
        Buyer View
      </Label>
      <Switch id="buyer-view" checked={buyerView} onCheckedChange={setBuyerView} />
    </div>
  );
}

/** Wraps internal-only content (notes, raw data, todos). Hidden when Buyer View is on. */
export function InternalOnly({ children }: { children: ReactNode }) {
  const { buyerView } = useBuyerView();
  if (buyerView) return null;
  return <>{children}</>;
}
