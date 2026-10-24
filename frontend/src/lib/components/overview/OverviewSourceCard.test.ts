import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import OverviewSourceCard from "./OverviewSourceCard.svelte";
import type { SourcePanel } from "$lib/overview-sources";
const panel: SourcePanel = {
  id: "test",
  title: "Source",
  description: "Reported values",
  status: "Read failed",
  message: "One command failed",
  failed: true,
  facts: [{ label: "Serial", value: "123", source: "sources.test.serial" }],
};
afterEach(cleanup);
describe("source card", () => {
  it("renders successful facts alongside an independent failure", () => {
    render(OverviewSourceCard, { panel, advanced: true });
    expect(screen.getByText("123")).toBeInTheDocument();
    expect(screen.getByText("One command failed")).toBeInTheDocument();
    expect(screen.getByText("sources.test.serial")).toBeInTheDocument();
  });
});
