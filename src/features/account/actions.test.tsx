import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signIn, signOut, signUp } from "./actions";
import { AuthForm } from "./auth-form";

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
