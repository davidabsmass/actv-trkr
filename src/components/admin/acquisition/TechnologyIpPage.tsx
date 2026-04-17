import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Server, FileCode, UserCog, Plus } from "lucide-react";
import { AcqKpiCard } from "./AcqKpiCard";
import { fmtNumber } from "@/lib/acquisition-utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AcquisitionData } from "./useAcquisitionData";

export default function TechnologyIpPage({ data }: { data: AcquisitionData }) {
  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendor, setVendor] = useState({ vendor_name: "", category: "", criticality: "medium", risk_level: "low" });
  const [ipOpen, setIpOpen] = useState(false);
  const [ipForm, setIpForm] = useState({ asset_type: "code", asset_name: "", owner_name: "", assignment_status: "missing" });

  const criticalDeps = data.techDeps.filter((d) => d.criticality === "critical").length;
  const lowReplaceable = data.techDeps.filter((d) => d.replaceable === "low").length;
  const missingIp = data.ipAssignments.filter((i) => i.assignment_status === "missing").length;
  const founderHigh = data.founderDeps.filter((d) => d.dependency_level === "high").length;
  const founderUndoc = data.founderDeps.filter((d) => d.documentation_status === "missing").length;

  const submitVendor = async () => {
    if (!vendor.vendor_name.trim()) return toast.error("Vendor name required");
    const { error } = await supabase.from("vendor_risk_registry").insert(vendor);
    if (error) return toast.error(error.message);
    toast.success("Vendor added");
    setVendorOpen(false);
    setVendor({ vendor_name: "", category: "", criticality: "medium", risk_level: "low" });
    await data.reload();
  };

  const submitIp = async () => {
    if (!ipForm.asset_name.trim()) return toast.error("Asset name required");
    const { error } = await supabase.from("ip_assignments").insert(ipForm);
    if (error) return toast.error(error.message);
    toast.success("IP entry added");
    setIpOpen(false);
    setIpForm({ asset_type: "code", asset_name: "", owner_name: "", assignment_status: "missing" });
    await data.reload();
  };

  const updateFounder = async (id: string, documentation_status: string) => {
    const { error } = await supabase.from("founder_dependencies").update({ documentation_status }).eq("id", id);
    if (error) return toast.error(error.message);
    await data.reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Technology, IP &amp; Dependency Risk</h2>
        <p className="text-sm text-muted-foreground mt-1">How transferable, defensible, and maintainable the business is.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <AcqKpiCard label="Critical Vendors" value={fmtNumber(data.vendors.filter((v) => v.criticality === "critical").length)} icon={Server} tone="warning" />
        <AcqKpiCard label="Critical Tech Deps" value={fmtNumber(criticalDeps)} icon={Server} tone={criticalDeps > 3 ? "warning" : "default"} />
        <AcqKpiCard label="Hard-to-Replace" value={fmtNumber(lowReplaceable)} icon={Server} tone={lowReplaceable > 2 ? "warning" : "default"} />
        <AcqKpiCard label="Missing IP Assignments" value={fmtNumber(missingIp)} icon={FileCode} tone={missingIp > 0 ? "danger" : "success"} />
        <AcqKpiCard label="Founder-Critical" value={fmtNumber(founderHigh)} icon={UserCog} tone={founderHigh > 3 ? "danger" : "warning"} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Vendor Registry</CardTitle>
          <Dialog open={vendorOpen} onOpenChange={setVendorOpen}>
            <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-3 w-3 mr-1" />Add Vendor</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Vendor</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Vendor name</Label><Input value={vendor.vendor_name} onChange={(e) => setVendor({ ...vendor, vendor_name: e.target.value })} /></div>
                <div><Label>Category</Label><Input value={vendor.category} onChange={(e) => setVendor({ ...vendor, category: e.target.value })} placeholder="infrastructure, billing, ai…" /></div>
                <div>
                  <Label>Criticality</Label>
                  <Select value={vendor.criticality} onValueChange={(v) => setVendor({ ...vendor, criticality: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Risk level</Label>
                  <Select value={vendor.risk_level} onValueChange={(v) => setVendor({ ...vendor, risk_level: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button onClick={submitVendor}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Criticality</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.vendors.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="text-xs font-medium">{v.vendor_name}</TableCell>
                  <TableCell className="text-xs">{v.category ?? "—"}</TableCell>
                  <TableCell><Badge variant={v.criticality === "critical" ? "destructive" : "outline"}>{v.criticality ?? "—"}</Badge></TableCell>
                  <TableCell><Badge variant={v.risk_level === "high" ? "destructive" : "secondary"}>{v.risk_level ?? "—"}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">{v.dependency_notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Technology Dependencies</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Criticality</TableHead>
                <TableHead>Replaceable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.techDeps.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="text-xs">{d.category}</TableCell>
                  <TableCell className="text-xs font-medium">{d.name}</TableCell>
                  <TableCell><Badge variant={d.criticality === "critical" ? "destructive" : "outline"}>{d.criticality}</Badge></TableCell>
                  <TableCell><Badge variant={d.replaceable === "low" ? "destructive" : "secondary"}>{d.replaceable}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">IP &amp; Ownership</CardTitle>
          <Dialog open={ipOpen} onOpenChange={setIpOpen}>
            <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-3 w-3 mr-1" />Add Asset</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add IP Asset</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Asset type</Label>
                  <Select value={ipForm.asset_type} onValueChange={(v) => setIpForm({ ...ipForm, asset_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="code">Code / Repo</SelectItem>
                      <SelectItem value="trademark">Trademark</SelectItem>
                      <SelectItem value="domain">Domain</SelectItem>
                      <SelectItem value="contractor">Contractor IP</SelectItem>
                      <SelectItem value="employee">Employee IP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Asset name</Label><Input value={ipForm.asset_name} onChange={(e) => setIpForm({ ...ipForm, asset_name: e.target.value })} /></div>
                <div><Label>Owner</Label><Input value={ipForm.owner_name} onChange={(e) => setIpForm({ ...ipForm, owner_name: e.target.value })} /></div>
                <div>
                  <Label>Status</Label>
                  <Select value={ipForm.assignment_status} onValueChange={(v) => setIpForm({ ...ipForm, assignment_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="missing">Missing</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="ready">Ready</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button onClick={submitIp}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {data.ipAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No IP assets tracked yet. Add code, trademarks, domains, and contractor IP assignment status.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.ipAssignments.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="text-xs">{i.asset_type}</TableCell>
                    <TableCell className="text-xs font-medium">{i.asset_name}</TableCell>
                    <TableCell className="text-xs">{i.owner_name ?? "—"}</TableCell>
                    <TableCell><Badge variant={i.assignment_status === "ready" ? "default" : i.assignment_status === "partial" ? "secondary" : "destructive"}>{i.assignment_status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Founder &amp; Key-Person Dependencies</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">{founderUndoc} of {data.founderDeps.length} processes lack documentation.</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Process</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Dependency</TableHead>
                <TableHead>Docs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.founderDeps.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="text-xs font-medium">{d.process_name}</TableCell>
                  <TableCell className="text-xs">{d.category}</TableCell>
                  <TableCell><Badge variant={d.dependency_level === "high" ? "destructive" : "outline"}>{d.dependency_level}</Badge></TableCell>
                  <TableCell>
                    <Select value={d.documentation_status} onValueChange={(v) => updateFounder(d.id, v)}>
                      <SelectTrigger className="h-7 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="missing">Missing</SelectItem>
                        <SelectItem value="partial">Partial</SelectItem>
                        <SelectItem value="ready">Ready</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
