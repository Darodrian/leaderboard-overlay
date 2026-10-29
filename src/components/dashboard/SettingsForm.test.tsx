import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsForm } from "./SettingsForm";
import { DEFAULT_SETTINGS } from "@/lib/settings";

describe("SettingsForm", () => {
  it("turns the medals toggle off and reports the change", () => {
    const onChange = vi.fn();
    render(<SettingsForm initial={DEFAULT_SETTINGS} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText(/medals/i));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        display: expect.objectContaining({ medals: false }),
      }),
    );
  });

  it("clamps the opacity slider into range", () => {
    const onChange = vi.fn();
    render(
      <SettingsForm
        initial={{
          ...DEFAULT_SETTINGS,
          visuals: { ...DEFAULT_SETTINGS.visuals, opacity: 50 },
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText(/opacity/i), {
      target: { value: "250" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        visuals: expect.objectContaining({ opacity: 100 }),
      }),
    );
  });

  it("edits the tip rate and keeps other point values", () => {
    const onChange = vi.fn();
    render(<SettingsForm initial={DEFAULT_SETTINGS} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/points per dollar/i), {
      target: { value: "250" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        pointConfig: expect.objectContaining({ tip: 250, bit: 1 }),
      }),
    );
  });

  it("switches the theme preset and keeps overrides", () => {
    const onChange = vi.fn();
    render(<SettingsForm initial={DEFAULT_SETTINGS} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/theme preset/i), {
      target: { value: "ember" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: expect.objectContaining({ preset: "ember", overrides: {} }),
      }),
    );
  });
});
