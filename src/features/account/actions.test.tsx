import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signIn, signOut, signUp } from "./actions";
import { AuthForm, ShowPasswordButton } from "./auth-form";

const { createSupabaseServerClient, redirect, auth } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  // The real redirect() throws to stop the action, so this one does too.
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect ${url}`);
  }),
  auth: { signInWithPassword: vi.fn(), signUp: vi.fn(), signOut: vi.fn() },
}));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "https://cvision.test" }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function form(fields: Record<string, string>) {
  const data = new FormData();
  data.set("email", "sara@example.com");
  data.set("password", "correct-horse");
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  createSupabaseServerClient.mockResolvedValue({ auth });
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
});

describe("signIn", () => {
  it("sends the user back to the page they came from", async () => {
    await expect(signIn({}, form({ next: "/interview?job=1" }))).rejects.toThrow("redirect /interview?job=1");
  });

  it.each([undefined, "https://evil.com", "//evil.com", "/\\evil.com"])("sends next=%j to the dashboard", async (next) => {
    await expect(signIn({}, form(next === undefined ? {} : { next }))).rejects.toThrow("redirect /dashboard");
  });

  it("does not redirect when the password is wrong", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: new Error("Invalid login credentials") });
    expect(await signIn({}, form({ next: "/interview?job=1" }))).toEqual({
      error: "That email and password do not match an account.",
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("signUp", () => {
  it("puts the page the user came from in the confirmation email link", async () => {
    expect(await signUp({}, form({ next: "/interview?job=1" }))).toEqual({ checkEmail: "sara@example.com" });
    const { emailRedirectTo } = auth.signUp.mock.calls[0][0].options;
    expect(emailRedirectTo).toBe("https://cvision.test/auth/confirm?next=%2Finterview%3Fjob%3D1");
  });

  it("keeps another site out of the confirmation email link", async () => {
    await signUp({}, form({ next: "https://evil.com" }));
    expect(auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe("https://cvision.test/auth/confirm?next=%2Fdashboard");
  });

  // Supabase sends no email for an address that already has an account, and returns a user with no identities (#328).
  it("says the email already has an account instead of 'Check your email', which would never come", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { identities: [] } }, error: null });
    expect(await signUp({}, form({ next: "/interview?job=1" }))).toEqual({ existingAccount: "sara@example.com" });
  });

  it("still says 'Check your email' for a new address", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { identities: [{ id: "1" }] } }, error: null });
    expect(await signUp({}, form({}))).toEqual({ checkEmail: "sara@example.com" });
  });

  it("sends the user straight back when no confirmation is needed", async () => {
    auth.signUp.mockResolvedValue({ data: { session: {} }, error: null });
    await expect(signUp({}, form({ next: "/interview?job=1" }))).rejects.toThrow("redirect /interview?job=1");
  });
});

describe("signOut", () => {
  it("signs out this browser only, so each device clears its own data when it signs out", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    await expect(signOut()).rejects.toThrow("redirect /");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  // Next keeps recent pages alive; a full load after sign-out leaves none of this account's pages in the tab (#350).
  it("returns home for a full page load when the form asks for one, instead of redirecting", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    const data = new FormData();
    data.set("reload", "1");
    expect(await signOut({}, data)).toEqual({ go: "/" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("full page load after signing in (#350)", () => {
  it("returns the next page instead of redirecting when the form asks for a full load", async () => {
    expect(await signIn({}, form({ next: "/interview?job=1", reload: "1" }))).toEqual({ go: "/interview?job=1" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("still redirects a form without JavaScript, where the redirect is a full load anyway", async () => {
    await expect(signIn({}, form({ next: "/profile" }))).rejects.toThrow("redirect /profile");
  });

  it("returns the next page after a sign-up that signs straight in", async () => {
    auth.signUp.mockResolvedValue({ data: { session: {}, user: { identities: [{}] } }, error: null });
    expect(await signUp({}, form({ next: "/profile", reload: "1" }))).toEqual({ go: "/profile" });
  });

  // A pilot asked to see the password while typing it (8 November).
  it("offers a Show password toggle that starts hidden and points at the password field", () => {
    const html = renderToStaticMarkup(<AuthForm mode="sign-in" />);
    const input = html.match(/<input[^>]*name="password"[^>]*>/)?.[0] ?? "";
    const button = html.match(/<button[^>]*aria-controls="[^"]+"[^>]*>Show<\/button>/)?.[0] ?? "";
    expect(input).toContain('type="password"');
    expect(button).toContain('aria-label="Show password"');
    // The button points at this field, not just any id.
    const inputId = input.match(/ id="([^"]+)"/)?.[1];
    expect(inputId).toBeTruthy();
    expect(button).toContain(`aria-controls="${inputId}"`);
  });

  // Found in the batch review: shown, the field is plain text, which a phone keyboard would capitalise or correct.
  it("keeps a phone keyboard from capitalising or correcting the password while it is shown", () => {
    const input = renderToStaticMarkup(<AuthForm mode="sign-up" />).match(/<input[^>]*name="password"[^>]*>/)?.[0] ?? "";
    expect(input).toContain('autoCapitalize="none"');
    expect(input).toContain('autoCorrect="off"');
    expect(input).toContain('spellCheck="false"');
  });

  // WCAG 2.5.3, Label in Name: the word on the button is in its name, so "click Hide" works with voice control.
  it("names the toggle by what it will do, with the word the user sees", () => {
    const hidden = renderToStaticMarkup(<ShowPasswordButton shown={false} controls="pw" onToggle={() => {}} />);
    const shown = renderToStaticMarkup(<ShowPasswordButton shown controls="pw" onToggle={() => {}} />);
    expect(hidden).toMatch(/aria-label="Show password"[^>]*>Show<\/button>/);
    expect(shown).toMatch(/aria-label="Hide password"[^>]*>Hide<\/button>/);
    expect(shown).not.toContain("aria-pressed");
  });

  it("asks for the full load only once JavaScript runs: the server-rendered form has no such field", () => {
    expect(renderToStaticMarkup(<AuthForm mode="sign-in" />)).not.toContain('name="reload"');
  });
});

describe("AuthForm", () => {
  it("keeps the return address in the form and in the link to the other form", () => {
    const html = renderToStaticMarkup(<AuthForm mode="sign-in" next="/interview?job=1" />);
    expect(html).toContain('<input type="hidden" name="next" value="/interview?job=1"/>');
    expect(html).toContain('href="/sign-up?next=%2Finterview%3Fjob%3D1"');
  });

  it("links to the other form plainly without a return address", () => {
    const html = renderToStaticMarkup(<AuthForm mode="sign-up" />);
    expect(html).toContain('href="/sign-in"');
  });
});
