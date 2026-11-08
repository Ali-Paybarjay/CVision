import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FullReloadField, useFullReloadAction, withFullReload } from "./full-reload";

// Signing in, signing out and deleting the account end in a full page load (#350). The batch review of #366 found the
// load never ran: the action's own page refresh took away the form whose effect held `go` (#387). The load now runs
// as the action's call returns.

type State = { go?: string; error?: string };

describe("withFullReload", () => {
  it("loads the page the action names, after the action has finished, and still returns its state", async () => {
    const load = vi.fn();
    const act = vi.fn(async () => ({ go: "/profile" }));

    const state = await withFullReload<State>(act, load)({}, new FormData());

    expect(act).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("/profile");
    expect(state).toEqual({ go: "/profile" });
  });

  it("loads nothing when the action names no page, such as a wrong password", async () => {
    const load = vi.fn();
    const state = await withFullReload<State>(async () => ({ error: "That email and password do not match an account." }), load)(
      {},
      new FormData(),
    );

    expect(load).not.toHaveBeenCalled();
    expect(state.error).toContain("do not match");
  });
});

describe("useFullReloadAction", () => {
  // React can post only a Server Function without JavaScript, so the page's first render keeps the action itself.
  it("gives the server's render the action itself, so the form still posts without JavaScript", () => {
    const act = async (state: State) => state;
    let given: unknown;
    function Probe() {
      given = useFullReloadAction(act);
      return null;
    }

    renderToStaticMarkup(<Probe />);

    expect(given).toBe(act);
  });

  it("asks for the full load only once JavaScript runs: the server's form has no such field", () => {
    expect(renderToStaticMarkup(<FullReloadField />)).toBe("");
  });
});
