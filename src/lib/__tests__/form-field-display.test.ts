import { describe, it, expect } from "vitest";
import { buildFieldColumns } from "../form-field-display";

const flat = (leadId: string, key: string, label: string, value: string, type = "text") => ({
  lead_id: leadId,
  field_key: key,
  field_label: label,
  field_type: type,
  value_text: value,
});

describe("buildFieldColumns", () => {
  it("returns empty for null inputs", () => {
    const r = buildFieldColumns(null, null);
    expect(r.fieldColumns).toEqual([]);
    expect(r.leadFieldMap.size).toBe(0);
  });

  it("builds columns from flat fields", () => {
    const fields = [flat("l1", "first_name", "First Name", "John")];
    const r = buildFieldColumns(fields, []);
    expect(r.fieldColumns.length).toBe(1);
    expect(r.fieldColumns[0].label).toBe("First Name");
    expect(r.leadFieldMap.get("l1")).toEqual({ "flat:first_name": "John" });
  });

  it("skips submit and hidden field types", () => {
    const fields = [
      flat("l1", "btn", "Submit", "Go", "submit"),
      flat("l1", "h", "Hidden", "val", "hidden"),
      flat("l1", "name", "Name", "Alice", "text"),
    ];
    const r = buildFieldColumns(fields, []);
    expect(r.fieldColumns.length).toBe(1);
    expect(r.fieldColumns[0].label).toBe("Name");
  });

  it("skips metadata keys", () => {
    const fields = [
      flat("l1", "data", "Data", "blob"),
      flat("l1", "submission", "Submission", "sub"),
      flat("l1", "email", "Email", "a@b.com"),
    ];
    const r = buildFieldColumns(fields, []);
    expect(r.fieldColumns.length).toBe(1);
    expect(r.fieldColumns[0].label).toBe("Email");
  });

  it("deduplicates columns by normalized label", () => {
    const fields = [
      flat("l1", "first_name", "First Name", "John"),
      flat("l2", "fname", "first name", "Jane"),
    ];
    const r = buildFieldColumns(fields, []);
    expect(r.fieldColumns.length).toBe(1);
  });

  it("upgrades weak labels to stronger ones", () => {
    const fields = [
      flat("l1", "1", "1", "John"),
      flat("l2", "1", "First Name", "Jane"),
    ];
    const r = buildFieldColumns(fields, []);
    expect(r.fieldColumns[0].label).toBe("First Name");
  });

  it("falls back to JSON data when no flat fields exist for a lead", () => {
    const leads = [{ id: "l1", data: { fields: [{ name: "email", label: "Email", value: "a@b.com" }] } }];
    const r = buildFieldColumns([], leads);
    expect(r.fieldColumns.length).toBe(1);
    expect(r.leadFieldMap.get("l1")).toBeDefined();
  });

  it("sorts numeric-keyed columns before non-numeric", () => {
    const fields = [
      flat("l1", "name", "Name", "Alice"),
      flat("l1", "1", "First", "Bob"),
    ];
    const r = buildFieldColumns(fields, []);
    expect(r.fieldColumns[0].key).toBe("flat:1");
  });

  it("handles boolean and number flat field values", () => {
    const fields = [
      { lead_id: "l1", field_key: "agreed", field_label: "Agreed", field_type: "checkbox", value_text: null, value_bool: true },
      { lead_id: "l1", field_key: "age", field_label: "Age", field_type: "number", value_text: null, value_number: 30 },
    ];
    const r = buildFieldColumns(fields as any, []);
    const vals = r.leadFieldMap.get("l1")!;
    expect(vals["flat:agreed"]).toBe("Yes");
    expect(vals["flat:age"]).toBe("30");
  });

  it("filters out consent-labeled columns", () => {
    const fields = [
      flat("l1", "consent", "Consent", "yes"),
      flat("l1", "name", "Name", "Alice"),
    ];
    const r = buildFieldColumns(fields, []);
    expect(r.fieldColumns.every(c => c.label !== "Consent")).toBe(true);
  });
});
